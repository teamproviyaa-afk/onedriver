import { useEffect, useState } from 'react';

import { GEOFENCE } from '@/domain/geofence';
import { haversineM } from '@/domain/geo';
import { useDeliveryStore } from '@/stores';
import type { LatLng } from '@/types';

/**
 * True once the rider has stayed within the drop auto-prompt radius (100 m) for
 * 10 consecutive seconds (spec §3.2). Leaving the radius before that resets the
 * timer; once it fires it stays true so the "You have arrived?" sheet shows once.
 * Subscribes to the store with a boolean selector, so GPS ticks inside the radius
 * do not re-render the caller.
 */
export const useArrivalWatch = (target: LatLng | null | undefined, enabled = true): boolean => {
  const within = useDeliveryStore((s) => enabled && !!target && !!s.position && haversineM(s.position, target) <= GEOFENCE.dropAutoPromptM);
  const [dwelled, setDwelled] = useState(false);

  useEffect(() => {
    if (!within) return;
    const timer = setTimeout(() => setDwelled(true), GEOFENCE.dropAutoPromptSeconds * 1000);
    return () => clearTimeout(timer);
  }, [within]);

  return dwelled;
};
