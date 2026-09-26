import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { zustandStorage } from '@/stores/storage';

export interface WaitEntry {
  jobId: string;
  kind: 'unavailable' | 'not_ready';
  /** ISO time the mandatory wait started (server-acknowledged exception). */
  startedAt: string;
  /** Mandatory wait length in seconds (from the exception response, default 300). */
  seconds: number;
  /** How many times the rider tapped "Call customer" during this wait. */
  calls: number;
}

interface WaitState {
  waits: Record<string, WaitEntry>;
  startWait: (jobId: string, seconds: number, kind?: WaitEntry['kind']) => WaitEntry;
  recordCall: (jobId: string) => void;
  clearWait: (jobId: string) => void;
}

export const DEFAULT_WAIT_SECONDS = 300;

/**
 * Mandatory wait timers keyed by job (customer-unavailable / order-not-ready).
 * Persisted so the countdown survives an app restart mid-wait. No customer data is stored.
 */
export const useWaitStore = create<WaitState>()(
  persist(
    (set, get) => ({
      waits: {},
      startWait: (jobId, seconds, kind = 'unavailable') => {
        const existing = get().waits[jobId];
        if (existing && existing.kind === kind) return existing;
        const entry: WaitEntry = { jobId, kind, startedAt: new Date().toISOString(), seconds: Math.max(1, Math.round(seconds)), calls: 0 };
        set((s) => ({ waits: { ...s.waits, [jobId]: entry } }));
        return entry;
      },
      recordCall: (jobId) =>
        set((s) => {
          const w = s.waits[jobId];
          if (!w) return {};
          return { waits: { ...s.waits, [jobId]: { ...w, calls: w.calls + 1 } } };
        }),
      clearWait: (jobId) =>
        set((s) => {
          if (!s.waits[jobId]) return {};
          const next = { ...s.waits };
          delete next[jobId];
          return { waits: next };
        }),
    }),
    { name: 'onelocal.rider.waits.v1', storage: zustandStorage },
  ),
);

export const selectWait = (jobId: string) => (s: WaitState) => s.waits[jobId] ?? null;
