import { create } from 'zustand';

import type { Job, Offer, ProofResult, RiderPosition } from '@/types';

interface DeliveryState {
  job: Job | null;
  /** True when the local job state is ahead of the server (queued offline step). */
  pendingSync: boolean;
  offer: Offer | null;
  position: RiderPosition | null;
  positionSource: 'device' | 'simulated' | 'none';
  lastProof: ProofResult | null;
  arrivalPromptDismissed: boolean;
  setJob: (job: Job | null, opts?: { pendingSync?: boolean }) => void;
  setOffer: (offer: Offer | null) => void;
  setPosition: (p: RiderPosition, source: 'device' | 'simulated') => void;
  setLastProof: (p: ProofResult | null) => void;
  dismissArrivalPrompt: () => void;
  clearJob: () => void;
}

/**
 * Active delivery state. Position updates arrive every ~5 s while on a job, so
 * screens must subscribe with selectors (e.g. `useDeliveryStore(selectJob)`)
 * to avoid re-rendering whole screens on each GPS tick.
 */
export const useDeliveryStore = create<DeliveryState>()((set) => ({
  job: null,
  pendingSync: false,
  offer: null,
  position: null,
  positionSource: 'none',
  lastProof: null,
  arrivalPromptDismissed: false,
  setJob: (job, opts) => set({ job, pendingSync: opts?.pendingSync ?? false, arrivalPromptDismissed: false }),
  setOffer: (offer) => set({ offer }),
  setPosition: (position, positionSource) => set({ position, positionSource }),
  setLastProof: (lastProof) => set({ lastProof }),
  dismissArrivalPrompt: () => set({ arrivalPromptDismissed: true }),
  clearJob: () => set({ job: null, pendingSync: false, arrivalPromptDismissed: false }),
}));

export const selectJob = (s: DeliveryState) => s.job;
export const selectOffer = (s: DeliveryState) => s.offer;
export const selectPosition = (s: DeliveryState) => s.position;
export const selectPendingSync = (s: DeliveryState) => s.pendingSync;
