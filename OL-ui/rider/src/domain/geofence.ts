import type { LatLng } from '@/types';
import { haversineM } from './geo';

/** Arrival geofences (spec §3.2). All thresholds are metres. */
export const GEOFENCE = {
  pickupArriveM: 150,
  pickupAccuracyMaxM: 50,
  dropAutoPromptM: 100,
  dropAutoPromptSeconds: 10,
  arrivedFarM: 500,
  proofFlagM: 300,
} as const;

export interface GeofenceCheck {
  distanceM: number;
  /** The action is allowed without any extra input. */
  allowed: boolean;
  /** Allowed only if the rider supplies a reason (flagged for review). */
  needsReason: boolean;
  /** Blocked outright (e.g. GPS accuracy too poor for pickup arrival). */
  blocked: boolean;
  message?: string;
}

/** "Arrived at pickup" becomes available within 150 m with accuracy ≤ 50 m. */
export const checkPickupArrival = (rider: LatLng, store: LatLng, accuracyM: number): GeofenceCheck => {
  const distanceM = haversineM(rider, store);
  if (distanceM <= GEOFENCE.pickupArriveM && accuracyM <= GEOFENCE.pickupAccuracyMaxM) {
    return { distanceM, allowed: true, needsReason: false, blocked: false };
  }
  if (distanceM > GEOFENCE.arrivedFarM) {
    return {
      distanceM,
      allowed: false,
      needsReason: true,
      blocked: false,
      message: `You are ${Math.round(distanceM)} m from the store pin. Add a reason to continue.`,
    };
  }
  if (accuracyM > GEOFENCE.pickupAccuracyMaxM) {
    return {
      distanceM,
      allowed: false,
      needsReason: true,
      blocked: false,
      message: `GPS accuracy is ${Math.round(accuracyM)} m. Move to open sky or add a reason.`,
    };
  }
  return {
    distanceM,
    allowed: false,
    needsReason: true,
    blocked: false,
    message: `Get within ${GEOFENCE.pickupArriveM} m of the store to mark arrival.`,
  };
};

/** Drop: auto-prompt within 100 m; beyond 500 m allowed with a reason and flagged. */
export const checkDropArrival = (rider: LatLng, drop: LatLng): GeofenceCheck & { autoPrompt: boolean } => {
  const distanceM = haversineM(rider, drop);
  const autoPrompt = distanceM <= GEOFENCE.dropAutoPromptM;
  if (distanceM > GEOFENCE.arrivedFarM) {
    return {
      distanceM,
      autoPrompt: false,
      allowed: false,
      needsReason: true,
      blocked: false,
      message: `You are ${Math.round(distanceM)} m from the drop pin. Add a reason — this will be reviewed.`,
    };
  }
  return { distanceM, autoPrompt, allowed: true, needsReason: false, blocked: false };
};

/** Proof location > 300 m from the drop pin flags the job (never blocks). */
export const checkProofDistance = (rider: LatLng, drop: LatLng): { distanceM: number; flagged: boolean } => {
  const distanceM = haversineM(rider, drop);
  return { distanceM, flagged: distanceM > GEOFENCE.proofFlagM };
};
