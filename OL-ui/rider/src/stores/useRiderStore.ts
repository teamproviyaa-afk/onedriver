import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { RiderMe, RiderStatus, RiderType } from '@/types';
import { zustandStorage } from './storage';

interface RiderState {
  me: RiderMe | null;
  /** Last known status for fast routing before /rider/me answers. Server state always wins. */
  lastStatus: RiderStatus | null;
  lastType: RiderType | null;
  online: boolean;
  setMe: (me: RiderMe | null) => void;
  setOnline: (online: boolean) => void;
  patchMe: (patch: Partial<RiderMe>) => void;
  clear: () => void;
}

export const useRiderStore = create<RiderState>()(
  persist(
    (set, get) => ({
      me: null,
      lastStatus: null,
      lastType: null,
      online: false,
      setMe: (me) => set({ me, online: me?.online ?? false, lastStatus: me?.rider.status ?? get().lastStatus, lastType: me?.rider.type ?? get().lastType }),
      setOnline: (online) => set((s) => ({ online, me: s.me ? { ...s.me, online } : s.me })),
      patchMe: (patch) => set((s) => (s.me ? { me: { ...s.me, ...patch } } : {})),
      clear: () => set({ me: null, online: false, lastStatus: null, lastType: null }),
    }),
    {
      name: 'onelocal.rider.rider.v1',
      storage: zustandStorage,
      partialize: (s) => ({ lastStatus: s.lastStatus, lastType: s.lastType }),
    },
  ),
);

export const selectRider = (s: RiderState) => s.me?.rider ?? null;
export const selectOnline = (s: RiderState) => s.online;
