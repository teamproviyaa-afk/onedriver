/**
 * Payout service on Cashfree.
 *
 *  verifyAccount  – bank / UPI verification (name at bank), name match with the rider,
 *                   Cashfree beneficiary, stored as the rider's primary payout account.
 *  createPayout   – idempotent transfer: the idempotency key maps to one Cashfree transfer id,
 *                   the record is written before Cashfree is called, and an unknown outcome is
 *                   reconciled (sweep / webhook) — never re-sent. A retry can never pay twice.
 *  handleWebhook  – signed Cashfree transfer events → status, UTR, completion.
 *  sweep          – polls Cashfree for payouts that are still processing / unknown.
 *  On success the rider gets the payout_sent message (WhatsApp → SMS, email) via `notify`.
 */
import type {
  AccountView,
  CreatePayoutInput,
  PayoutAccount,
  PayoutRecord,
  PayoutStatus,
  PayoutStore,
  PayoutView,
  VerifyAccountInput,
} from './types.ts';
import { DuplicatePayoutError, PayoutError, TERMINAL_STATUSES } from './types.ts';
import type { CashfreeClient, CfTransfer } from './cashfree.ts';
import { mapTransferStatus, statusFromEventType, verifyCashfreeWebhook } from './cashfree.ts';
import { combineMatch, fromCashfreeMatch, matchNames } from './names.ts';
import { decryptJson, encryptJson, hashIdentifier, hmacSha256Hex } from '../messaging/crypto.ts';
import type { FetchLike } from '../messaging/providers/http.ts';

export interface PayoutServiceDeps {
  store: PayoutStore;
  cashfree: CashfreeClient;
  /** Cashfree payout client secret — verifies webhooks. */
  webhookSecret: string;
  /** base64 32-byte key encrypting the contact kept until the payout_sent message. */
  payloadKey: string;
  limits: { minAmountPaise: number; maxAmountPaise: number };
  /** The messaging function (payout_sent). */
  notify?: { url: string; secret: string };
  /** Optional: POSTed on every final status, signed with x-onelocal-signature. */
  statusCallback?: { url: string; secret: string };
  fetch?: FetchLike;
  now?: () => Date;
  newId?: () => string;
  log?: (event: string, data: Record<string, unknown>) => void;
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const VPA_RE = /^[a-z0-9._-]{2,256}@[a-z]{2,64}$/;
/** Unknown outcome + Cashfree has no record after this long → it never arrived. */
const NEVER_ARRIVED_MS = 30 * 60 * 1000;

const onlyDigits = (s: string | undefined) => (s ?? '').replace(/\D/g, '');
const maskVpa = (vpa: string) => {
  const [user = '', handle = ''] = vpa.split('@');
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(3, Math.min(6, user.length - 2)))}@${handle}`;
};
export const formatRupees = (paise: number): string => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100);

export const toPayoutView = (r: PayoutRecord): PayoutView => ({
  id: r.id,
  transferId: r.transferId,
  riderId: r.riderId,
  amount: r.amountPaise / 100,
  kind: r.kind,
  mode: r.mode,
  // Callers see "processing" until Cashfree confirms either way.
  status: r.status === 'unknown' ? 'processing' : r.status,
  utr: r.utr,
  statusDescription: r.statusDescription,
  destination: r.destinationMasked,
  createdAt: r.createdAt,
  completedAt: r.completedAt,
});

const toAccountView = (a: PayoutAccount, vpa: string | null): AccountView => ({
  id: a.id,
  riderId: a.riderId,
  method: a.method,
  accountLast4: a.accountLast4,
  ifsc: a.ifsc,
  vpa: vpa ? maskVpa(vpa) : null,
  bankName: a.bankName,
  verifiedName: a.nameAtBank,
  nameMatch: a.nameMatch,
  status: 'verified',
  provider: 'cashfree',
});

/** success may later become reversed; failed / reversed are final. */
const canMove = (from: PayoutStatus, to: PayoutStatus): boolean => {
  if (from === to) return false;
  if (from === 'success') return to === 'reversed';
  if (from === 'failed' || from === 'reversed') return false;
  return true;
};

export const createPayoutService = (deps: PayoutServiceDeps) => {
  const { store, cashfree } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const log = deps.log ?? (() => {});
  const fetchFn: FetchLike = deps.fetch ?? ((i, init) => fetch(i, init));
  const iso = () => now().toISOString();

  // ── Accounts ────────────────────────────────────────────────────────────
  const verifyAccount = async (input: VerifyAccountInput): Promise<AccountView> => {
    const riderId = (input.riderId ?? '').trim();
    const riderName = (input.riderName ?? '').trim();
    if (!riderId || !riderName) throw new PayoutError('validation', 'riderId and riderName are required');

    let identity: string;
    let nameAtBank: string | undefined;
    let theirMatch: string | undefined;
    let bankName: string | null = null;
    let details: { bank_account_number?: string; bank_ifsc?: string; vpa?: string };
    let vpa: string | null = null;
    let accountNumber: string | null = null;
    let ifsc: string | null = null;

    if (input.method === 'bank') {
      accountNumber = onlyDigits(input.accountNumber);
      ifsc = (input.ifsc ?? '').trim().toUpperCase();
      if (accountNumber.length < 9 || accountNumber.length > 18) throw new PayoutError('validation', 'Enter a valid bank account number');
      if (!IFSC_RE.test(ifsc)) throw new PayoutError('validation', 'Enter a valid IFSC code');
      const r = await cashfree.verifyBankAccount({ bank_account: accountNumber, ifsc, name: riderName, phone: onlyDigits(input.phone).slice(-10) || undefined });
      if (!r.ok) throw r.status === 0 || r.status >= 500 ? new PayoutError('provider_error', 'Could not verify the account right now. Try again in a minute.', 502) : new PayoutError('account_invalid', r.message || 'These bank details could not be verified', 422);
      if ((r.data.account_status ?? '').toUpperCase() !== 'VALID') throw new PayoutError('account_invalid', `This bank account could not be verified (${r.data.account_status_code ?? r.data.account_status ?? 'invalid'})`, 422);
      nameAtBank = r.data.name_at_bank;
      theirMatch = r.data.name_match_result;
      bankName = r.data.bank_name ?? null;
      identity = `bank:${accountNumber}:${ifsc}`;
      details = { bank_account_number: accountNumber, bank_ifsc: ifsc };
    } else if (input.method === 'upi') {
      vpa = (input.vpa ?? '').trim().toLowerCase();
      if (!VPA_RE.test(vpa)) throw new PayoutError('validation', 'Enter a valid UPI ID like name@bank');
      const r = await cashfree.verifyUpi({ vpa, name: riderName });
      if (!r.ok) throw r.status === 0 || r.status >= 500 ? new PayoutError('provider_error', 'Could not verify the UPI ID right now. Try again in a minute.', 502) : new PayoutError('account_invalid', r.message || 'This UPI ID could not be verified', 422);
      const status = (r.data.status ?? r.data.account_status ?? '').toUpperCase();
      if (status !== 'VALID') throw new PayoutError('account_invalid', 'This UPI ID is not active. Check it and try again.', 422);
      nameAtBank = r.data.name_at_bank;
      theirMatch = r.data.name_match_result;
      identity = `upi:${vpa}`;
      details = { vpa };
    } else {
      throw new PayoutError('validation', 'method must be bank or upi');
    }

    if (!nameAtBank?.trim()) throw new PayoutError('account_invalid', "Couldn't confirm the account holder's name. Try another account.", 422);
    const match = combineMatch(matchNames(riderName, nameAtBank).result, fromCashfreeMatch(theirMatch));
    if (match === 'poor') {
      throw new PayoutError('name_mismatch', `This account is registered to ${nameAtBank}. Add an account in your own name (${riderName}).`, 422, { nameAtBank });
    }

    const hash = (await hashIdentifier('beneficiary', identity)).slice(0, 10);
    const beneficiaryId = `ol_${riderId.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}_${input.method}_${hash}`;
    const phone = onlyDigits(input.phone).slice(-10);
    const b = await cashfree.createBeneficiary({
      beneficiary_id: beneficiaryId,
      beneficiary_name: nameAtBank.trim().slice(0, 100),
      beneficiary_instrument_details: details,
      beneficiary_contact_details: { ...(phone ? { beneficiary_phone: phone, beneficiary_country_code: '+91' } : {}), ...(input.email ? { beneficiary_email: input.email } : {}) },
    });
    if (!b.ok && !/exist|duplicate/i.test(`${b.code} ${b.message}`)) {
      log('payouts.beneficiary_failed', { riderId, method: input.method, code: b.code });
      throw new PayoutError('provider_error', 'Could not register the payout account. Try again.', 502);
    }

    const saved = await store.upsertAccount({
      id: newId(),
      riderId,
      method: input.method,
      beneficiaryId,
      accountLast4: accountNumber ? accountNumber.slice(-4) : null,
      ifsc,
      vpaMasked: vpa ? maskVpa(vpa) : null,
      bankName,
      nameAtBank: nameAtBank.trim(),
      nameMatch: match,
      status: 'verified',
      isPrimary: true,
      createdAt: iso(),
      updatedAt: iso(),
    });
    await store.setPrimary(riderId, saved.id);
    log('payouts.account_verified', { riderId, method: input.method, nameMatch: match });
    return toAccountView(saved, vpa);
  };

  // ── Payouts ─────────────────────────────────────────────────────────────
  const notifySent = async (rec: PayoutRecord) => {
    if (rec.notifiedAt || !rec.contactEnc) return;
    try {
      if (deps.notify) {
        const contact = await decryptJson<{ name: string; phone?: string; email?: string }>(deps.payloadKey, rec.contactEnc);
        const res = await fetchFn(`${deps.notify.url.replace(/\/$/, '')}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-notify-secret': deps.notify.secret },
          body: JSON.stringify({
            template: 'payout_sent',
            to: { phone: contact.phone, email: contact.email },
            params: { name: contact.name, amount: formatRupees(rec.amountPaise), period: rec.periodLabel ?? (rec.kind === 'instant' ? 'your withdrawal' : 'this week') },
            idempotencyKey: `payout_sent:${rec.transferId}`,
            related: { type: 'payout', id: rec.transferId },
          }),
        });
        log('payouts.notified', { transferId: rec.transferId, status: res.status });
      }
    } catch (e) {
      log('payouts.notify_failed', { transferId: rec.transferId, error: e instanceof Error ? e.message : String(e) });
    }
    // Contact data is deleted whether or not the message went out.
    await store.updatePayout(rec.id, { notifiedAt: iso(), contactEnc: null, updatedAt: iso() });
  };

  const callback = async (rec: PayoutRecord) => {
    if (!deps.statusCallback) return;
    const body = JSON.stringify({ event: 'payout.updated', payout: toPayoutView(rec) });
    try {
      await fetchFn(deps.statusCallback.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-onelocal-signature': await hmacSha256Hex(deps.statusCallback.secret, body) }, body });
    } catch (e) {
      log('payouts.callback_failed', { transferId: rec.transferId, error: e instanceof Error ? e.message : String(e) });
    }
  };

  /** Applies a Cashfree transfer snapshot; returns the updated record. */
  const apply = async (rec: PayoutRecord, cf: CfTransfer, statusOverride?: string): Promise<PayoutRecord> => {
    const next = mapTransferStatus(statusOverride ?? cf.status);
    const patch: Partial<PayoutRecord> = { updatedAt: iso() };
    if (cf.cf_transfer_id !== undefined && cf.cf_transfer_id !== null) patch.cfTransferId = String(cf.cf_transfer_id);
    if (cf.transfer_utr) patch.utr = cf.transfer_utr;
    if (cf.status_code) patch.statusCode = cf.status_code;
    if (cf.status_description) patch.statusDescription = cf.status_description.slice(0, 200);
    const moved = canMove(rec.status, next);
    if (moved) {
      patch.status = next;
      if (TERMINAL_STATUSES.includes(next)) patch.completedAt = iso();
    }
    await store.updatePayout(rec.id, patch);
    const updated: PayoutRecord = { ...rec, ...patch };
    if (moved) {
      log('payouts.status', { transferId: rec.transferId, from: rec.status, to: next });
      if (next === 'success') await notifySent(updated);
      // No message for failed / reversed payouts: their contact data is deleted right away.
      else if (TERMINAL_STATUSES.includes(next) && updated.contactEnc) await store.updatePayout(rec.id, { contactEnc: null, updatedAt: iso() });
      if (TERMINAL_STATUSES.includes(next)) await callback(updated);
    }
    return (await store.getPayoutByTransferId(rec.transferId)) ?? updated;
  };

  const createPayout = async (input: CreatePayoutInput): Promise<PayoutView> => {
    const riderId = (input.riderId ?? '').trim();
    const key = (input.idempotencyKey ?? '').trim();
    if (!riderId) throw new PayoutError('validation', 'riderId is required');
    if (!key || key.length > 100) throw new PayoutError('validation', 'idempotencyKey is required (max 100 characters)');
    if (input.kind !== 'instant' && input.kind !== 'weekly') throw new PayoutError('validation', 'kind must be instant or weekly');
    const amount = Number(input.amount);
    const amountPaise = Math.round(amount * 100);
    if (!Number.isFinite(amount) || Math.abs(amount * 100 - amountPaise) > 1e-6) throw new PayoutError('validation', 'Amount must be in rupees with at most 2 decimals');
    if (amountPaise < deps.limits.minAmountPaise) throw new PayoutError('validation', `Minimum payout is Rs ${formatRupees(deps.limits.minAmountPaise)}`);
    if (amountPaise > deps.limits.maxAmountPaise) throw new PayoutError('validation', `Maximum payout is Rs ${formatRupees(deps.limits.maxAmountPaise)}`);

    // Deterministic: the same (rider, key) is always the same Cashfree transfer (≤ 40 chars, [a-z0-9_]).
    const transferId = `ol_${(await hashIdentifier('transfer', `${riderId}:${key}`)).slice(0, 32)}`;
    const existing = await store.getPayoutByTransferId(transferId);
    if (existing) return toPayoutView(existing);

    const account = await store.getPrimaryAccount(riderId);
    if (!account || account.status !== 'verified') throw new PayoutError('no_payout_account', 'Add and verify a bank account or UPI ID first.', 409);

    const mode = account.method === 'upi' ? 'upi' : 'imps';
    const record: PayoutRecord = {
      id: newId(),
      transferId,
      riderId,
      accountId: account.id,
      amountPaise,
      mode,
      kind: input.kind,
      status: 'processing',
      cfTransferId: null,
      utr: null,
      statusCode: null,
      statusDescription: null,
      destinationMasked: account.method === 'upi' ? `UPI ${account.vpaMasked ?? ''}`.trim() : `A/C ****${account.accountLast4 ?? ''}`,
      periodLabel: input.periodLabel?.slice(0, 60) ?? null,
      contactEnc: input.contact ? await encryptJson(deps.payloadKey, input.contact) : null,
      notifiedAt: null,
      createdAt: iso(),
      updatedAt: iso(),
      completedAt: null,
    };
    try {
      await store.insertPayout(record);
    } catch (e) {
      if (e instanceof DuplicatePayoutError) {
        const raced = await store.getPayoutByTransferId(transferId);
        if (raced) return toPayoutView(raced);
      }
      throw e;
    }

    const res = await cashfree.createTransfer({
      transfer_id: transferId,
      transfer_amount: amountPaise / 100,
      transfer_currency: 'INR',
      transfer_mode: mode,
      beneficiary_details: { beneficiary_id: account.beneficiaryId },
      transfer_remarks: input.kind === 'weekly' ? 'OneLocal weekly payout' : 'OneLocal withdrawal',
    });
    if (res.ok) return toPayoutView(await apply(record, res.data));

    if (res.status === 0 || res.status >= 500) {
      // The request may have reached Cashfree: never send again — reconcile instead.
      await store.updatePayout(record.id, { status: 'unknown', statusDescription: 'Waiting for confirmation from Cashfree', updatedAt: iso() });
      log('payouts.unknown', { transferId, code: res.code });
      return toPayoutView({ ...record, status: 'unknown', statusDescription: 'Waiting for confirmation from Cashfree' });
    }
    if (/exist|duplicate/i.test(`${res.code} ${res.message}`)) {
      const current = await cashfree.getTransfer(transferId);
      if (current.ok) return toPayoutView(await apply(record, current.data));
    }
    // A definite rejection (validation, insufficient balance, beneficiary issue…): nothing was sent.
    return toPayoutView(await apply({ ...record }, { status: 'FAILED', status_code: res.code, status_description: res.message }));
  };

  const getPayout = async (transferId: string): Promise<PayoutView> => {
    const rec = await store.getPayoutByTransferId(transferId);
    if (!rec) throw new PayoutError('not_found', 'Payout not found', 404);
    if (TERMINAL_STATUSES.includes(rec.status)) return toPayoutView(rec);
    const r = await cashfree.getTransfer(transferId);
    return toPayoutView(r.ok ? await apply(rec, r.data) : rec);
  };

  const listPayouts = async (riderId: string, limit = 20): Promise<PayoutView[]> => (await store.listPayouts(riderId, Math.min(Math.max(limit, 1), 100))).map(toPayoutView);

  const handleWebhook = async (rawBody: string, headers: { signature: string | null; timestamp: string | null }): Promise<'updated' | 'ignored' | 'unknown'> => {
    if (!(await verifyCashfreeWebhook(rawBody, headers.signature, headers.timestamp, deps.webhookSecret))) throw new PayoutError('unauthorized', 'Bad webhook signature', 401);
    let event: { type?: string; data?: CfTransfer & { transfer?: CfTransfer } };
    try {
      event = JSON.parse(rawBody) as typeof event;
    } catch {
      throw new PayoutError('validation', 'Webhook body is not JSON');
    }
    const data = (event.data?.transfer ?? event.data ?? {}) as CfTransfer;
    const status = data.status ?? statusFromEventType(event.type);
    if (!data.transfer_id || !status) {
      log('payouts.webhook_ignored', { type: event.type });
      return 'ignored';
    }
    const rec = await store.getPayoutByTransferId(data.transfer_id);
    if (!rec) return 'unknown';
    const before = rec.status;
    const after = await apply(rec, data, status);
    return after.status !== before ? 'updated' : 'ignored';
  };

  const sweep = async (limit = 25): Promise<{ checked: number; updated: number }> => {
    const pending = await store.listPendingPayouts(new Date(now().getTime() - 60_000).toISOString(), limit);
    let updated = 0;
    for (const rec of pending) {
      const r = await cashfree.getTransfer(rec.transferId);
      if (r.ok) {
        const after = await apply(rec, r.data);
        if (after.status !== rec.status) updated += 1;
      } else if (r.status === 404 && rec.status === 'unknown' && now().getTime() - new Date(rec.createdAt).getTime() > NEVER_ARRIVED_MS) {
        await apply(rec, { status: 'FAILED', status_description: 'Not received by Cashfree. Nothing was sent.' });
        updated += 1;
      }
    }
    return { checked: pending.length, updated };
  };

  return { verifyAccount, createPayout, getPayout, listPayouts, handleWebhook, sweep };
};

export type PayoutService = ReturnType<typeof createPayoutService>;
