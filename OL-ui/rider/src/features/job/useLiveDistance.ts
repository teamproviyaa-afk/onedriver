import { useDeliveryStore } from '@/stores';
import { haversineKm } from '@/domain/geo';
import type { LatLng } from '@/types';
import { roundKm1 } from './distance';

/**
 * Live straight-line distance from the rider to `target`, rounded to 0.1 km.
 * The selector returns a primitive, so a GPS tick only re-renders the caller
 * when the displayed value actually changes. Returns null before the first fix.
 */
export const useLiveDistanceKm = (target: LatLng | null | undefined): number | null =>
  useDeliveryStore((s) => (s.position && target ? roundKm1(haversineKm(s.position, target)) : null));
