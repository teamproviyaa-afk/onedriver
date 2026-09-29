/** In-memory KycStore for tests and local runs. */
import type { KycCheck, KycProfile, KycStore } from '../types.ts';

export interface MemoryKycStore extends KycStore {
  readonly profiles: Map<string, KycProfile>;
  readonly checks: KycCheck[];
}

export const createMemoryKycStore = (): MemoryKycStore => {
  const profiles = new Map<string, KycProfile>();
  const checks: KycCheck[] = [];
  return {
    profiles,
    checks,
    async getProfile(riderId) {
      const p = profiles.get(riderId);
      return p ? { ...p } : null;
    },
    async saveProfile(p) {
      profiles.set(p.riderId, { ...p });
    },
    async insertCheck(c) {
      checks.push({ ...c });
    },
    async countChecks(riderId, kind, sinceIso) {
      return checks.filter((c) => c.riderId === riderId && c.kind === kind && c.createdAt >= sinceIso).length;
    },
  };
};
