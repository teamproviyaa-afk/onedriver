import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ConnectivityState } from '@/types';
import { zustandStorage } from './storage';

interface ConnectivityStoreState {
  /** Device network reachability (NetInfo). */
  isConnected: boolean;
  /** Development-only switch that simulates a network outage. */
  simulatedOffline: boolean;
  /** Derived banner state (persisted so the banner is right immediately on relaunch). */
  state: ConnectivityState;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** True while the rider is on duty (drives the "ONLINE • HEARTBEAT ON" state). */
  heartbeatOn: boolean;
  setConnected: (v: boolean) => void;
  setSimulatedOffline: (v: boolean) => void;
  setHeartbeatOn: (v: boolean) => void;
  setQueue: (pendingCount: number, syncing: boolean, error?: string | null) => void;
  markSynced: () => void;
}

const derive = (s: Pick<ConnectivityStoreState, 'isConnected' | 'simulatedOffline' | 'pendingCount' | 'lastError'>, syncing: boolean): ConnectivityState => {
  if (!s.isConnected || s.simulatedOffline) return 'offline';
  if (s.lastError) return 'sync_error';
  if (syncing || s.pendingCount > 0) return 'syncing';
  return 'online_heartbeat';
};

export const useConnectivityStore = create<ConnectivityStoreState>()(
  persist(
    (set, get) => ({
      isConnected: true,
      simulatedOffline: false,
      state: 'online_heartbeat',
      pendingCount: 0,
      lastSyncAt: null,
      lastError: null,
      heartbeatOn: false,
      setConnected: (isConnected) => set((s) => ({ isConnected, state: derive({ ...s, isConnected }, false) })),
      setSimulatedOffline: (simulatedOffline) => set((s) => ({ simulatedOffline, state: derive({ ...s, simulatedOffline }, false) })),
      setHeartbeatOn: (heartbeatOn) => set({ heartbeatOn }),
      setQueue: (pendingCount, syncing, error = null) => set((s) => ({ pendingCount, lastError: error, state: derive({ ...s, pendingCount, lastError: error }, syncing) })),
      markSynced: () => set((s) => ({ lastSyncAt: new Date().toISOString(), lastError: null, pendingCount: 0, state: derive({ ...s, pendingCount: 0, lastError: null }, false) })),
    }),
    {
      name: 'onelocal.rider.connectivity.v1',
      storage: zustandStorage,
      partialize: (s) => ({ state: s.state, lastSyncAt: s.lastSyncAt, simulatedOffline: s.simulatedOffline }),
    },
  ),
);

export const selectEffectiveOnline = (s: ConnectivityStoreState) => s.isConnected && !s.simulatedOffline;
