import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { zustandStorage } from './storage';

interface DevState {
  /** Use the phone's real GPS instead of the demo route simulator. */
  useDeviceGps: boolean;
  showDebugOverlay: boolean;
  scenario: string;
  setUseDeviceGps: (v: boolean) => void;
  setShowDebugOverlay: (v: boolean) => void;
  setScenario: (v: string) => void;
}

/** Development-only preferences. Never read in production builds. */
export const useDevStore = create<DevState>()(
  persist(
    (set) => ({
      useDeviceGps: false,
      showDebugOverlay: false,
      scenario: 'manual_offer',
      setUseDeviceGps: (useDeviceGps) => set({ useDeviceGps }),
      setShowDebugOverlay: (showDebugOverlay) => set({ showDebugOverlay }),
      setScenario: (scenario) => set({ scenario }),
    }),
    { name: 'onelocal.rider.dev.v1', storage: zustandStorage },
  ),
);
