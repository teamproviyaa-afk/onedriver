/** DepositStore on Supabase Postgres (PostgREST, service key). The table is RLS-locked from clients. */
import type { DepositRecord, DepositStore } from '../types.ts';
import { DuplicateDepositError } from '../types.ts';
import type { FetchLike } from '../../messaging/providers/http.ts';

const COLS: Record<keyof DepositRecord, string> = {
  id: 'id', linkId: 'link_id', riderId: 'rider_id', amountPaise: 'amount_paise', amountPaidPaise: 'amount_paid_paise', status: 'status',
  cfLinkId: 'cf_link_id', linkUrl: 'link_url', expiresAt: 'expires_at', cfOrderId: 'cf_order_id', cfPaymentId: 'cf_payment_id',
  bankReference: 'bank_reference', paymentGroup: 'payment_group', failureReason: 'failure_reason', createdAt: 'created_at',
  updatedAt: 'updated_at', paidAt: 'paid_at',
};
const TS = new Set(['created_at', 'updated_at', 'paid_at', 'expires_at']);
const MONEY = new Set(['amount_paise', 'amount_paid_paise']);

const toRow = (obj: Partial<DepositRecord>) => {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const c = COLS[k as keyof DepositRecord];
    if (c && v !== undefined) row[c] = v;
  }
  return row;
};
const fromRow = (row: Record<string, unknown>): DepositRecord => {
  const out: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(COLS)) {
    const v = row[c];
    out[k] = TS.has(c) && typeof v === 'string' ? new Date(v).toISOString() : MONEY.has(c) && v !== null && v !== undefined ? Number(v) : (v ?? null);
  }
  return out as unknown as DepositRecord;
};
const q = encodeURIComponent;

export const createSupabaseDepositStore = (cfg: { url: string; serviceKey: string; fetch?: FetchLike }): DepositStore => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  const base = `${cfg.url.replace(/\/$/, '')}/rest/v1`;
  const call = async (method: string, path: string, body?: unknown, prefer?: string) =>
    fetchFn(`${base}/${path}`, {
      method,
      headers: {
        apikey: cfg.serviceKey,
        ...(cfg.serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${cfg.serviceKey}` } : {}),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const rows = async (res: Response, what: string): Promise<Record<string, unknown>[]> => {
    if (!res.ok) throw new Error(`Supabase ${what} failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const v = (await res.json().catch(() => [])) as unknown;
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  };
  const ok = async (res: Response, what: string) => {
    if (!res.ok) throw new Error(`Supabase ${what} failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`);
  };

  return {
    async insertDeposit(d) {
      const res = await call('POST', 'cash_deposits', toRow(d), 'return=minimal');
      if (res.status === 409) throw new DuplicateDepositError();
      await ok(res, 'insert deposit');
    },
    async updateDeposit(id, patch) {
      await ok(await call('PATCH', `cash_deposits?id=eq.${q(id)}`, toRow(patch), 'return=minimal'), 'update deposit');
    },
    async getDeposit(id) {
      const r = await rows(await call('GET', `cash_deposits?id=eq.${q(id)}&limit=1`), 'get deposit');
      return r[0] ? fromRow(r[0]) : null;
    },
    async getDepositByLinkId(linkId) {
      const r = await rows(await call('GET', `cash_deposits?link_id=eq.${q(linkId)}&limit=1`), 'get deposit by link');
      return r[0] ? fromRow(r[0]) : null;
    },
    async listPendingDeposits(beforeIso, limit) {
      const r = await rows(await call('GET', `cash_deposits?status=eq.pending&updated_at=lte.${q(beforeIso)}&order=updated_at.asc&limit=${limit}`), 'list pending deposits');
      return r.map(fromRow);
    },
    async listDeposits(riderId, limit) {
      const r = await rows(await call('GET', `cash_deposits?rider_id=eq.${q(riderId)}&order=created_at.desc&limit=${limit}`), 'list deposits');
      return r.map(fromRow);
    },
  };
};
