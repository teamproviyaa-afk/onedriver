import { create } from 'zustand';

/** Wait compensation rule shown on the Order Not Ready screen (spec: free for 10 min, then ₹2/min). */
export const WAIT_FREE_MIN = 10;
export const WAIT_PER_MIN = 2;
export const WAIT_FREE_SECONDS = WAIT_FREE_MIN * 60;

interface WaitState {
  /** ISO timestamp of when the rider started waiting, keyed by job id. */
  waitStartedAt: Record<string, string>;
  /** Starts the timer for a job if it is not already running. */
  start: (jobId: string, at?: string) => void;
  clear: (jobId: string) => void;
}

/**
 * Small in-memory store for the merchant wait timer. It only remembers when the
 * rider landed on the waiting screen so the elapsed time survives navigation
 * within the job flow; it never holds customer data.
 */
export const useWaitStore = create<WaitState>()((set, get) => ({
  waitStartedAt: {},
  start: (jobId, at) => {
    if (get().waitStartedAt[jobId]) return;
    set((s) => ({ waitStartedAt: { ...s.waitStartedAt, [jobId]: at ?? new Date().toISOString() } }));
  },
  clear: (jobId) =>
    set((s) => {
      if (!s.waitStartedAt[jobId]) return {};
      const next = { ...s.waitStartedAt };
      delete next[jobId];
      return { waitStartedAt: next };
    }),
}));

/** Rupees earned so far for a wait of `elapsedSeconds` under the 10 min / ₹2 per min rule. */
export const waitCompensationFor = (elapsedSeconds: number): number => Math.max(0, Math.floor(elapsedSeconds / 60) - WAIT_FREE_MIN) * WAIT_PER_MIN;

export const isWaitCompensated = (elapsedSeconds: number): boolean => elapsedSeconds >= WAIT_FREE_SECONDS;
