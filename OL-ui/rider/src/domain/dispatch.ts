/**
 * Dispatch ranking (spec §4.2 / R6). Pure functions — the server owns dispatch
 * in production; the local demo provider and tests use this implementation.
 */
import type { LatLng } from '@/types';
import { fallbackEtaMin, haversineKm } from './geo';

export const DISPATCH = {
  offerWindowSeconds: 30,
  maxRounds: 3,
  radiusStepKm: 2,
  radiusStartKm: 2,
  radiusMaxKm: 8,
} as const;

export interface DispatchCandidate {
  riderId: string;
  type: 'store' | 'solo';
  acceptance: 'auto' | 'manual';
  online: boolean;
  status: 'approved' | 'suspended' | 'other';
  onJob: boolean;
  cashInHand: number;
  cashLimit: number;
  vehicleClass: '2w' | '3w' | '4w';
  linkedStoreIds: string[];
  zoneId: string;
  jobsToday: number;
  position: LatLng;
  /** Optional road ETA in minutes from the routing service; falls back to straight-line. */
  roadEtaMin?: number;
}

export interface DispatchJobInput {
  storeId: string;
  pickup: LatLng;
  pickupZoneId: string;
  neighbourZoneIds: string[];
  allowedVehicleClasses: ('2w' | '3w' | '4w')[];
}

export interface RankedCandidate extends DispatchCandidate {
  etaMin: number;
  distanceKm: number;
  linked: boolean;
}

export const radiusForRound = (round: number): number =>
  Math.min(DISPATCH.radiusMaxKm, DISPATCH.radiusStartKm + (round - 1) * DISPATCH.radiusStepKm);

export const isEligible = (c: DispatchCandidate, job: DispatchJobInput, radiusKm: number): boolean => {
  if (!c.online || c.status !== 'approved' || c.onJob) return false;
  if (c.cashInHand >= c.cashLimit) return false;
  if (!job.allowedVehicleClasses.includes(c.vehicleClass)) return false;
  const zoneOk = c.zoneId === job.pickupZoneId || job.neighbourZoneIds.includes(c.zoneId);
  if (!zoneOk) return false;
  return haversineKm(c.position, job.pickup) <= radiusKm;
};

/** Linked-store riders first; then Solo riders by road ETA; ties → fewer jobs today. */
export const rankCandidates = (candidates: DispatchCandidate[], job: DispatchJobInput, round = 1): RankedCandidate[] => {
  const radiusKm = radiusForRound(round);
  return candidates
    .filter((c) => isEligible(c, job, radiusKm))
    .map((c) => ({
      ...c,
      linked: c.type === 'store' && c.linkedStoreIds.includes(job.storeId),
      etaMin: c.roadEtaMin ?? fallbackEtaMin(c.position, job.pickup),
      distanceKm: haversineKm(c.position, job.pickup),
    }))
    .sort((a, b) => {
      if (a.linked !== b.linked) return a.linked ? -1 : 1;
      if (a.etaMin !== b.etaMin) return a.etaMin - b.etaMin;
      if (a.jobsToday !== b.jobsToday) return a.jobsToday - b.jobsToday;
      return a.riderId.localeCompare(b.riderId);
    });
};

export interface OfferPlan {
  riderId: string;
  mode: 'auto' | 'manual';
  round: number;
  expiresInSeconds: number;
}

/**
 * Simulates the offer sequence: every eligible rider is offered in rank order;
 * auto riders are assigned instantly, manual riders get a 30 s window.
 * Returns the plan for the first rider that would accept (all manual riders
 * are assumed to time out unless `accepts` says otherwise).
 */
export const planDispatch = (
  candidates: DispatchCandidate[],
  job: DispatchJobInput,
  accepts: (riderId: string, round: number) => boolean = () => false,
): { winner?: OfferPlan; rounds: OfferPlan[][]; escalated: boolean } => {
  const rounds: OfferPlan[][] = [];
  const declined = new Set<string>();
  for (let round = 1; round <= DISPATCH.maxRounds; round++) {
    const ranked = rankCandidates(candidates, job, round).filter((c) => !declined.has(c.riderId));
    const plans: OfferPlan[] = [];
    for (const c of ranked) {
      const plan: OfferPlan = {
        riderId: c.riderId,
        mode: c.acceptance,
        round,
        expiresInSeconds: c.acceptance === 'auto' ? 0 : DISPATCH.offerWindowSeconds,
      };
      plans.push(plan);
      if (c.acceptance === 'auto' || accepts(c.riderId, round)) {
        rounds.push(plans);
        return { winner: plan, rounds, escalated: false };
      }
      declined.add(c.riderId);
    }
    rounds.push(plans);
  }
  return { rounds, escalated: true };
};
