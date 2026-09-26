import { create } from 'zustand';

import type { Job } from '@/types';

interface PickupChecklistState {
  /** Item ids the rider ticked on the at-pickup checklist, per job. Missing entry = all items ok. */
  byJob: Record<string, string[]>;
  setChecked: (jobId: string, itemIds: string[]) => void;
  clear: (jobId: string) => void;
}

/** Local hand-off between the at-pickup checklist and the verification screen (never persisted). */
export const usePickupChecklistStore = create<PickupChecklistState>()((set) => ({
  byJob: {},
  setChecked: (jobId, itemIds) => set((s) => ({ byJob: { ...s.byJob, [jobId]: itemIds } })),
  clear: (jobId) =>
    set((s) => {
      const next = { ...s.byJob };
      delete next[jobId];
      return { byJob: next };
    }),
}));

/** Items payload for `verifyPickup`: unticked items are reported as not ok; no checklist = all ok. */
export const itemsForVerify = (job: Pick<Job, 'items'>, checkedIds: string[] | undefined): { id: string; ok: boolean }[] =>
  job.items.map((i) => ({ id: i.id, ok: checkedIds ? checkedIds.includes(i.id) : true }));
