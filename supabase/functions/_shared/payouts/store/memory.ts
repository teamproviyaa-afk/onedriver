/** In-memory PayoutStore for tests and local runs. */
import type { PayoutAccount, PayoutRecord, PayoutStore } from '../types.ts';
import { DuplicatePayoutError, TERMINAL_STATUSES } from '../types.ts';

export interface MemoryPayoutStore extends PayoutStore {
  readonly accounts: Map<string, PayoutAccount>;
  readonly payouts: Map<string, PayoutRecord>;
}

export const createMemoryPayoutStore = (): MemoryPayoutStore => {
  const accounts = new Map<string, PayoutAccount>();
  const payouts = new Map<string, PayoutRecord>();
  return {
    accounts,
    payouts,
    async upsertAccount(a) {
      const existing = [...accounts.values()].find((x) => x.riderId === a.riderId && x.beneficiaryId === a.beneficiaryId);
      const saved = existing ? { ...a, id: existing.id, createdAt: existing.createdAt } : { ...a };
      accounts.set(saved.id, saved);
      return { ...saved };
    },
    async setPrimary(riderId, accountId) {
      for (const [id, a] of accounts) if (a.riderId === riderId) accounts.set(id, { ...a, isPrimary: id === accountId });
    },
    async getAccount(id) {
      return accounts.get(id) ?? null;
    },
    async getPrimaryAccount(riderId) {
      return [...accounts.values()].find((a) => a.riderId === riderId && a.isPrimary) ?? null;
    },
    async insertPayout(r) {
      if ([...payouts.values()].some((p) => p.transferId === r.transferId)) throw new DuplicatePayoutError();
      payouts.set(r.id, { ...r });
    },
    async updatePayout(id, patch) {
      const r = payouts.get(id);
      if (r) payouts.set(id, { ...r, ...patch });
    },
    async getPayoutByTransferId(transferId) {
      const r = [...payouts.values()].find((p) => p.transferId === transferId);
      return r ? { ...r } : null;
    },
    async listPendingPayouts(beforeIso, limit) {
      return [...payouts.values()].filter((p) => !TERMINAL_STATUSES.includes(p.status) && p.updatedAt <= beforeIso).slice(0, limit);
    },
    async listPayouts(riderId, limit) {
      return [...payouts.values()].filter((p) => p.riderId === riderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
  };
};
