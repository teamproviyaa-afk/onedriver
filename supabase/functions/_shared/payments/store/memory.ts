/** In-memory DepositStore for tests and local runs. */
import type { DepositRecord, DepositStore } from '../types.ts';
import { DuplicateDepositError } from '../types.ts';

export interface MemoryDepositStore extends DepositStore {
  readonly deposits: Map<string, DepositRecord>;
}

export const createMemoryDepositStore = (): MemoryDepositStore => {
  const deposits = new Map<string, DepositRecord>();
  return {
    deposits,
    async insertDeposit(r) {
      if ([...deposits.values()].some((d) => d.linkId === r.linkId)) throw new DuplicateDepositError();
      deposits.set(r.id, { ...r });
    },
    async updateDeposit(id, patch) {
      const r = deposits.get(id);
      if (r) deposits.set(id, { ...r, ...patch });
    },
    async getDeposit(id) {
      const r = deposits.get(id);
      return r ? { ...r } : null;
    },
    async getDepositByLinkId(linkId) {
      const r = [...deposits.values()].find((d) => d.linkId === linkId);
      return r ? { ...r } : null;
    },
    async listPendingDeposits(beforeIso, limit) {
      return [...deposits.values()].filter((d) => d.status === 'pending' && d.updatedAt <= beforeIso).slice(0, limit).map((d) => ({ ...d }));
    },
    async listDeposits(riderId, limit) {
      return [...deposits.values()].filter((d) => d.riderId === riderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((d) => ({ ...d }));
    },
  };
};
