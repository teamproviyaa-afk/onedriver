/** PayoutStore on Supabase Postgres (PostgREST, service key). Tables are RLS-locked from clients. */
import type { PayoutAccount, PayoutRecord, PayoutStore } from '../types.ts';
import { DuplicatePayoutError } from '../types.ts';
import type { FetchLike } from '../../messaging/providers/http.ts';

const ACCOUNT_COLS: Record<keyof PayoutAccount, string> = {
  id: 'id', riderId: 'rider_id', method: 'method', beneficiaryId: 'beneficiary_id', accountLast4: 'account_last4', ifsc: 'ifsc',
  vpaMasked: 'vpa_masked', bankName: 'bank_name', nameAtBank: 'name_at_bank', nameMatch: 'name_match', status: 'status',
  isPrimary: 'is_primary', createdAt: 'created_at', updatedAt: 'updated_at',
};
const PAYOUT_COLS: Record<keyof PayoutRecord, string> = {
  id: 'id', transferId: 'transfer_id', riderId: 'rider_id', accountId: 'account_id', amountPaise: 'amount_paise', mode: 'mode',
  kind: 'kind', status: 'status', cfTransferId: 'cf_transfer_id', utr: 'utr', statusCode: 'status_code',
  statusDescription: 'status_description', destinationMasked: 'destination_masked', periodLabel: 'period_label',
  contactEnc: 'contact_enc', notifiedAt: 'notified_at', createdAt: 'created_at', updatedAt: 'updated_at', completedAt: 'completed_at',
};
const TS = new Set(['created_at', 'updated_at', 'completed_at', 'notified_at']);

const toRow = <T>(obj: Partial<T>, cols: Record<string, string>) => {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (cols[k] && v !== undefined) row[cols[k]] = v;
  return row;
};
const fromRow = <T>(row: Record<string, unknown>, cols: Record<string, string>): T => {
  const out: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(cols)) {
    const v = row[c];
    out[k] = TS.has(c) && typeof v === 'string' ? new Date(v).toISOString() : c === 'amount_paise' && v !== null ? Number(v) : (v ?? null);
  }
  return out as T;
};
const q = encodeURIComponent;

export const createSupabasePayoutStore = (cfg: { url: string; serviceKey: string; fetch?: FetchLike }): PayoutStore => {
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
  const acc = (r: Record<string, unknown>) => fromRow<PayoutAccount>(r, ACCOUNT_COLS);
  const pay = (r: Record<string, unknown>) => fromRow<PayoutRecord>(r, PAYOUT_COLS);

  return {
    async upsertAccount(a) {
      // Same rider + beneficiary → update in place (keeps the original id).
      const row = toRow(a, ACCOUNT_COLS);
      delete row.id;
      delete row.created_at;
      const r = await rows(await call('POST', 'payout_accounts?on_conflict=rider_id,beneficiary_id', { id: a.id, created_at: a.createdAt, ...row }, 'resolution=merge-duplicates,return=representation'), 'upsert account');
      return r[0] ? acc(r[0]) : a;
    },
    async setPrimary(riderId, accountId) {
      await ok(await call('PATCH', `payout_accounts?rider_id=eq.${q(riderId)}&id=neq.${q(accountId)}`, { is_primary: false }, 'return=minimal'), 'unset primary');
      await ok(await call('PATCH', `payout_accounts?id=eq.${q(accountId)}`, { is_primary: true }, 'return=minimal'), 'set primary');
    },
    async getAccount(id) {
      const r = await rows(await call('GET', `payout_accounts?id=eq.${q(id)}&limit=1`), 'get account');
      return r[0] ? acc(r[0]) : null;
    },
    async getPrimaryAccount(riderId) {
      const r = await rows(await call('GET', `payout_accounts?rider_id=eq.${q(riderId)}&is_primary=is.true&order=updated_at.desc&limit=1`), 'get primary account');
      return r[0] ? acc(r[0]) : null;
    },
    async insertPayout(p) {
      const res = await call('POST', 'payouts', toRow(p, PAYOUT_COLS), 'return=minimal');
      if (res.status === 409) throw new DuplicatePayoutError();
      await ok(res, 'insert payout');
    },
    async updatePayout(id, patch) {
      await ok(await call('PATCH', `payouts?id=eq.${q(id)}`, toRow(patch, PAYOUT_COLS), 'return=minimal'), 'update payout');
    },
    async getPayoutByTransferId(transferId) {
      const r = await rows(await call('GET', `payouts?transfer_id=eq.${q(transferId)}&limit=1`), 'get payout');
      return r[0] ? pay(r[0]) : null;
    },
    async listPendingPayouts(beforeIso, limit) {
      const r = await rows(await call('GET', `payouts?status=in.(processing,unknown)&updated_at=lte.${q(beforeIso)}&order=updated_at.asc&limit=${limit}`), 'list pending');
      return r.map(pay);
    },
    async listPayouts(riderId, limit) {
      const r = await rows(await call('GET', `payouts?rider_id=eq.${q(riderId)}&order=created_at.desc&limit=${limit}`), 'list payouts');
      return r.map(pay);
    },
  };
};
