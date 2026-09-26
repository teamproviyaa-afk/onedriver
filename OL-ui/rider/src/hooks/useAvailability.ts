import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { ApiError } from '@/types';
import { getDataProvider } from '@/providers';
import { getCurrentPosition } from '@/location/locationService';
import { getDemoSimulator } from '@/location/useLocationEngine';
import { useConnectivityStore } from '@/stores/useConnectivityStore';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useDevStore } from '@/stores/useDevStore';
import { useRiderStore } from '@/stores/useRiderStore';
import { isLocalDemo } from '@/config/env';
import { queryKeys } from './queryClient';

export type AvailabilityBlock = { code: 'cash_limit' | 'out_of_zone' | 'suspended' | 'not_enrolled' | 'network' | 'unknown'; detail: string; meta?: Record<string, unknown> };

/** GO ONLINE / GO OFFLINE with the server's business errors surfaced as typed blocks. */
export const useAvailability = () => {
  const qc = useQueryClient();
  const online = useRiderStore((s) => s.online);
  const setOnline = useRiderStore((s) => s.setOnline);
  const setHeartbeatOn = useConnectivityStore((s) => s.setHeartbeatOn);
  const useDeviceGps = useDevStore((s) => s.useDeviceGps);
  const [busy, setBusy] = useState(false);
  const [block, setBlock] = useState<AvailabilityBlock | null>(null);

  const position = useCallback(async () => {
    const stored = useDeliveryStore.getState().position;
    if (stored) return { lat: stored.lat, lng: stored.lng, accuracyM: stored.accuracyM };
    if (isLocalDemo && !useDeviceGps) {
      const sim = getDemoSimulator();
      const hub = useRiderStore.getState().me?.hub;
      const c = sim?.current ?? (hub ? { lat: hub.lat, lng: hub.lng } : { lat: 18.4088, lng: 76.5604 });
      return { lat: c.lat, lng: c.lng, accuracyM: 10 };
    }
    const device = await getCurrentPosition();
    if (device) return { lat: device.lat, lng: device.lng, accuracyM: device.accuracyM };
    const hub = useRiderStore.getState().me?.hub;
    return hub ? { lat: hub.lat, lng: hub.lng, accuracyM: 999 } : { lat: 18.4088, lng: 76.5604, accuracyM: 999 };
  }, [useDeviceGps]);

  const set = useCallback(
    async (next: boolean): Promise<boolean> => {
      setBusy(true);
      setBlock(null);
      try {
        const pos = await position();
        const r = await getDataProvider().setAvailability({ online: next, ...pos });
        setOnline(r.online);
        setHeartbeatOn(r.online);
        void qc.invalidateQueries({ queryKey: queryKeys.me });
        void qc.invalidateQueries({ queryKey: queryKeys.currentOffer });
        return true;
      } catch (e) {
        if (ApiError.is(e)) {
          const code = (['cash_limit', 'out_of_zone', 'suspended', 'not_enrolled', 'network'] as const).includes(e.code as never) ? (e.code as AvailabilityBlock['code']) : 'unknown';
          setBlock({ code, detail: e.detail, meta: e.meta });
        } else {
          setBlock({ code: 'unknown', detail: 'Something went wrong. Try again.' });
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [position, qc, setHeartbeatOn, setOnline],
  );

  return { online, busy, block, clearBlock: () => setBlock(null), goOnline: () => set(true), goOffline: () => set(false) };
};
