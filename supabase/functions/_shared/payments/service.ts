/**
 * Cash deposits on Cashfree Payment Gateway.
 *
 *  • createDeposit — one payment link per (rider, idempotency key); the record is written before
 *    Cashfree is called, and a repeated key returns the same link, so a retry never charges twice.
 *  • Webhooks are only a signal: the signature is checked, then the link is re-read from Cashfree,
 *    which is the only source of truth for "paid".
 *  • A deposit is paid only when Cashfree reports the full amount. The One Local server is told on
 *    every final status (signed) and credits the rider's cash ledger.
 */
import { hashIdentifier, hmacSha256Hex } from '../messaging/crypto.ts';
import type { FetchLike } from '../messaging/providers/http.ts';
import { verifyCashfreeWebhook } from '../payouts/cashfree.ts';
import type { CashfreePgClient, PgLink } from './cashfreePg.ts';
import { cashfreePhone, mapLinkStatus, toPaise } from './cashfreePg.ts';
import type { CreateDepositInput, DepositRecord, DepositStatus, DepositStore, DepositView } from './types.ts';
import { DuplicateDepositError, PaymentError, TERMINAL_DEPOSIT_STATUSES } from './types.ts';

export interface PaymentsServiceDeps {
  store: DepositStore;
  cashfree: CashfreePgClient;
  /** Cashfree PG secret key — also signs Cashfree's webhooks. */
  webhookSecret: string;
  /** Public URL of this function, e.g. https://<ref>.supabase.co/functions/v1/payments */
  functionUrl: string;
  limits: { minAmountPaise: number; maxAmountPaise: number };
  /** Minutes a payment link stays open. */
  linkMinutes: number;
  /** Comma-separated Cashfree methods (upi, cc, dc, nb …); empty = all. */
  paymentMethods?: string;
  upiIntent?: boolean;
  /** Optional: POSTed on every final status, signed with x-onelocal-signature. */
  statusCallback?: { url: string; secret: string };
  fetch?: FetchLike;
  now?: () => Date;
  newId?: () => string;
  log?: (event: string, data: Record<string, unknown>) => void;
}

const formatRupees = (paise: number) => (paise / 100).toFixed(2);

const toView = (r: DepositRecord): DepositView => ({
  id: r.id,
  riderId: r.riderId,
  amount: r.amountPaise / 100,
  amountPaid: r.amountPaidPaise / 100,
  status: r.status,
  checkoutUrl: r.status === 'pending' ? r.linkUrl : null,
  expiresAt: r.expiresAt,
  reference: r.bankReference,
  method: r.paymentGroup,
  failureReason: r.failureReason,
  createdAt: r.createdAt,
  paidAt: r.paidAt,
});

/** Final states can only move to "paid" (a payment that completes as the link expires still counts). */
const canMove = (from: DepositStatus, to: DepositStatus): boolean => {
  if (from === to) return false;
  if (from === 'paid') return false;
  if (TERMINAL_DEPOSIT_STATUSES.includes(from)) return to === 'paid';
  return true;
};

export const createPaymentsService = (deps: PaymentsServiceDeps) => {
  const { store, cashfree } = deps;
  const now = deps.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const log = deps.log ?? (() => {});
  const fetchFn: FetchLike = deps.fetch ?? ((i, init) => fetch(i, init));
  const fnUrl = deps.functionUrl.replace(/\/$/, '');

  const callback = async (rec: DepositRecord) => {
    if (!deps.statusCallback) return;
    const body = JSON.stringify({ event: 'deposit.updated', deposit: toView(rec) });
    try {
      await fetchFn(deps.statusCallback.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-onelocal-signature': await hmacSha256Hex(deps.statusCallback.secret, body) }, body });
    } catch (e) {
      log('payments.callback_failed', { depositId: rec.id, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const save = async (rec: DepositRecord, patch: Partial<DepositRecord>): Promise<DepositRecord> => {
    const next = { ...rec, ...patch, updatedAt: iso() };
    await store.updateDeposit(rec.id, { ...patch, updatedAt: next.updatedAt });
    return next;
  };

  /** Payment details (UTR, method) of the successful payment behind a paid link. */
  const paymentOf = async (linkId: string) => {
    const orders = await cashfree.getLinkOrders(linkId);
    if (!orders.ok) return null;
    const paid = orders.data.find((o) => (o.order_status ?? '').toUpperCase() === 'PAID') ?? orders.data[0];
    if (!paid?.order_id) return null;
    const payments = await cashfree.getOrderPayments(paid.order_id);
    const ok = payments.ok ? payments.data.find((p) => (p.payment_status ?? '').toUpperCase() === 'SUCCESS') : undefined;
    return {
      cfOrderId: paid.cf_order_id !== undefined ? String(paid.cf_order_id) : paid.order_id,
      cfPaymentId: ok?.cf_payment_id !== undefined ? String(ok.cf_payment_id) : null,
      bankReference: ok?.bank_reference ?? null,
      paymentGroup: ok?.payment_group ?? null,
      paidAt: ok?.payment_completion_time ?? ok?.payment_time ?? null,
    };
  };

  /** Applies a Cashfree link snapshot. */
  const apply = async (rec: DepositRecord, link: PgLink): Promise<DepositRecord> => {
    let next = mapLinkStatus(link.link_status);
    const paidPaise = toPaise(link.link_amount_paid);
    if (next === 'paid' && paidPaise < rec.amountPaise) {
      // Never credit more than Cashfree actually collected.
      log('payments.amount_short', { depositId: rec.id, expected: rec.amountPaise, paid: paidPaise });
      next = 'pending';
    }
    const patch: Partial<DepositRecord> = {};
    if (link.cf_link_id !== undefined && link.cf_link_id !== null) patch.cfLinkId = String(link.cf_link_id);
    if (link.link_url && !rec.linkUrl) patch.linkUrl = link.link_url;
    if (link.link_expiry_time && !rec.expiresAt) patch.expiresAt = new Date(link.link_expiry_time).toISOString();
    if (!canMove(rec.status, next)) return Object.keys(patch).length ? save(rec, patch) : rec;
    patch.status = next;
    if (next === 'paid') {
      patch.amountPaidPaise = paidPaise;
      const p = await paymentOf(rec.linkId);
      if (p) Object.assign(patch, { cfOrderId: p.cfOrderId, cfPaymentId: p.cfPaymentId, bankReference: p.bankReference, paymentGroup: p.paymentGroup });
      patch.paidAt = p?.paidAt ? new Date(p.paidAt).toISOString() : iso();
    }
    const updated = await save(rec, patch);
    log('payments.status', { depositId: rec.id, from: rec.status, to: next });
    if (TERMINAL_DEPOSIT_STATUSES.includes(next)) await callback(updated);
    return updated;
  };

  const refresh = async (rec: DepositRecord): Promise<DepositRecord> => {
    if (rec.status === 'paid') return rec;
    const r = await cashfree.getLink(rec.linkId);
    if (r.ok) return apply(rec, r.data);
    if (r.status === 404 && rec.status === 'pending' && !rec.linkUrl && Date.parse(rec.createdAt) < now().getTime() - 10 * 60_000) {
      // The create call never reached Cashfree and nobody retried it.
      const failed = await save(rec, { status: 'failed', failureReason: 'The payment link was not created' });
      await callback(failed);
      return failed;
    }
    return rec;
  };

  const createDeposit = async (input: CreateDepositInput): Promise<DepositView> => {
    const riderId = (input.riderId ?? '').trim();
    const key = (input.idempotencyKey ?? '').trim();
    if (!riderId) throw new PaymentError('validation', 'riderId is required');
    if (!key || key.length > 100) throw new PaymentError('validation', 'idempotencyKey is required (max 100 characters)');
    const amount = Number(input.amount);
    const amountPaise = Math.round(amount * 100);
    if (!Number.isFinite(amount) || Math.abs(amount * 100 - amountPaise) > 1e-6) throw new PaymentError('validation', 'Amount must be in rupees with at most 2 decimals');
    if (amountPaise < deps.limits.minAmountPaise) throw new PaymentError('validation', `Minimum deposit is Rs ${formatRupees(deps.limits.minAmountPaise)}`);
    if (amountPaise > deps.limits.maxAmountPaise) throw new PaymentError('validation', `Maximum deposit is Rs ${formatRupees(deps.limits.maxAmountPaise)}`);
    const phone = cashfreePhone(input.customer?.phone ?? '');
    if (!phone) throw new PaymentError('validation', 'A 10-digit mobile number is required for the payer');

    // Deterministic: the same (rider, key) is always the same Cashfree link (≤ 50 chars, [a-z0-9_]).
    const linkId = `ol_dep_${(await hashIdentifier('deposit', `${riderId}:${key}`)).slice(0, 32)}`;
    let rec = await store.getDepositByLinkId(linkId);
    if (rec && (rec.status !== 'pending' || rec.linkUrl)) return toView(rec);

    if (!rec) {
      const record: DepositRecord = {
        id: newId(),
        linkId,
        riderId,
        amountPaise,
        amountPaidPaise: 0,
        status: 'pending',
        cfLinkId: null,
        linkUrl: null,
        expiresAt: null,
        cfOrderId: null,
        cfPaymentId: null,
        bankReference: null,
        paymentGroup: null,
        failureReason: null,
        createdAt: iso(),
        updatedAt: iso(),
        paidAt: null,
      };
      try {
        await store.insertDeposit(record);
        rec = record;
      } catch (e) {
        if (!(e instanceof DuplicateDepositError)) throw e;
        rec = await store.getDepositByLinkId(linkId);
        if (!rec) throw e;
        if (rec.status !== 'pending' || rec.linkUrl) return toView(rec);
      }
    }

    const expiry = new Date(now().getTime() + deps.linkMinutes * 60_000).toISOString();
    const res = await cashfree.createLink({
      link_id: linkId,
      link_amount: rec.amountPaise / 100,
      link_currency: 'INR',
      link_purpose: 'OneLocal cash deposit (COD)',
      customer_details: { customer_phone: phone, customer_name: input.customer.name?.slice(0, 100), customer_email: input.customer.email || undefined },
      link_partial_payments: false,
      link_expiry_time: expiry,
      link_notify: { send_sms: false, send_email: false },
      link_auto_reminders: false,
      link_notes: { deposit_id: rec.id },
      link_meta: {
        return_url: `${fnUrl}/return?d=${encodeURIComponent(rec.id)}`,
        notify_url: `${fnUrl}/webhooks/cashfree`,
        ...(deps.paymentMethods ? { payment_methods: deps.paymentMethods } : {}),
        ...(deps.upiIntent ? { upi_intent: 'true' } : {}),
      },
    });
    if (res.ok) {
      const saved = await save(rec, {
        linkUrl: res.data.link_url ?? null,
        cfLinkId: res.data.cf_link_id !== undefined ? String(res.data.cf_link_id) : null,
        expiresAt: res.data.link_expiry_time ? new Date(res.data.link_expiry_time).toISOString() : expiry,
      });
      log('payments.link_created', { depositId: saved.id, amountPaise: saved.amountPaise });
      return toView(saved);
    }
    // A retry after a lost response: the link exists at Cashfree — read it back.
    if (res.status === 409 || /exist/i.test(res.message)) {
      const got = await cashfree.getLink(linkId);
      if (got.ok) return toView(await apply(rec, got.data));
    }
    if (res.status === 0 || res.status >= 500) {
      log('payments.link_uncertain', { depositId: rec.id, status: res.status });
      throw new PaymentError('provider_error', 'Could not reach the payment gateway. Try again — you will not be charged twice.', 502, { depositId: rec.id });
    }
    const failed = await save(rec, { status: 'failed', failureReason: res.message.slice(0, 200) });
    log('payments.link_failed', { depositId: rec.id, status: res.status, code: res.code });
    throw new PaymentError('provider_error', `The payment gateway refused the deposit: ${res.message}`, 502, { depositId: failed.id, cashfreeCode: res.code });
  };

  const getDeposit = async (id: string): Promise<DepositView> => {
    const rec = await store.getDeposit(id);
    if (!rec) throw new PaymentError('not_found', 'Deposit not found', 404);
    return toView(rec.status === 'pending' ? await refresh(rec) : rec);
  };

  const listDeposits = async (riderId: string, limit = 20): Promise<DepositView[]> => (await store.listDeposits(riderId, Math.min(Math.max(limit, 1), 100))).map(toView);

  const handleWebhook = async (rawBody: string, headers: { signature: string | null; timestamp: string | null }): Promise<'updated' | 'ignored' | 'unknown'> => {
    if (!(await verifyCashfreeWebhook(rawBody, headers.signature, headers.timestamp, deps.webhookSecret))) throw new PaymentError('unauthorized', 'Bad webhook signature', 401);
    let event: { type?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse(rawBody) as typeof event;
    } catch {
      return 'ignored';
    }
    const data = (event.data ?? {}) as { link_id?: string; link_notes?: Record<string, string>; order?: { order_tags?: Record<string, string>; link_id?: string }; link?: { link_id?: string } };
    const linkId = data.link_id ?? data.link?.link_id ?? data.order?.link_id ?? data.order?.order_tags?.link_id;
    const depositId = data.link_notes?.deposit_id ?? data.order?.order_tags?.deposit_id;
    if (!linkId && !depositId) return 'ignored';
    const rec = linkId ? await store.getDepositByLinkId(linkId) : await store.getDeposit(depositId!);
    if (!rec) {
      log('payments.webhook_unknown', { type: event.type });
      return 'unknown';
    }
    await refresh(rec);
    return 'updated';
  };

  /** Reconciliation (cron, every minute): re-read deposits still pending. */
  const sweep = async (limit = 50) => {
    const pending = await store.listPendingDeposits(new Date(now().getTime() - 30_000).toISOString(), limit);
    let changed = 0;
    for (const rec of pending) {
      const next = await refresh(rec);
      if (next.status !== rec.status) changed += 1;
    }
    return { checked: pending.length, changed };
  };

  /** Where Cashfree sends the rider after checkout: back into the app (status comes from Cashfree, not this URL). */
  const returnLocation = (appReturnUrl: string, depositId: string | null): string => {
    const id = depositId && /^[A-Za-z0-9_-]{1,64}$/.test(depositId) ? depositId : null;
    return id ? `${appReturnUrl}${appReturnUrl.includes('?') ? '&' : '?'}deposit=${encodeURIComponent(id)}` : appReturnUrl;
  };

  return { createDeposit, getDeposit, listDeposits, handleWebhook, sweep, returnLocation };
};

export type PaymentsService = ReturnType<typeof createPaymentsService>;
