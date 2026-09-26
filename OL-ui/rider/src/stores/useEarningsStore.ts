import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DaySummary, JobEarnings } from '@/types';
import { zustandStorage } from './storage';

interface EarningsState {
  today: DaySummary;
  yesterday: DaySummary;
  lastJobEarnings: JobEarnings | null;
  setSummaries: (today: DaySummary, yesterday: DaySummary) => void;
  addDelivered: (e: JobEarnings) => void;
}

/** Cached earnings headline for Home when the network is unavailable. */
export const useEarningsStore = create<EarningsState>()(
  persist(
    (set) => ({
      today: { earnings: 0, jobs: 0 },
      yesterday: { earnings: 0, jobs: 0 },
      lastJobEarnings: null,
      setSummaries: (today, yesterday) => set({ today, yesterday }),
      addDelivered: (e) => set((s) => ({ lastJobEarnings: e, today: { earnings: Math.round((s.today.earnings + e.total) * 100) / 100, jobs: s.today.jobs + 1 } })),
    }),
    { name: 'onelocal.rider.earnings.v1', storage: zustandStorage },
  ),
);
