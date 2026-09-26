import { checkDropArrival, checkPickupArrival, checkProofDistance, GEOFENCE } from '@/domain/geofence';
import { haversineM, offsetM } from '@/domain/geo';

const store = { lat: 18.4088, lng: 76.5604 };
const drop = { lat: 18.4211, lng: 76.5793 };

describe('geofences', () => {
  it('allows arrival at pickup within 150 m with accuracy ≤ 50 m (120 m case)', () => {
    const rider = offsetM(store, 120, 0);
    expect(Math.round(haversineM(rider, store))).toBeCloseTo(120, -1);
    const r = checkPickupArrival(rider, store, 20);
    expect(r.allowed).toBe(true);
    expect(r.needsReason).toBe(false);
  });

  it('requires a reason at 600 m from the store', () => {
    const rider = offsetM(store, 600, 0);
    const r = checkPickupArrival(rider, store, 10);
    expect(r.allowed).toBe(false);
    expect(r.needsReason).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('requires a reason when accuracy is poor even if close', () => {
    const r = checkPickupArrival(offsetM(store, 50, 0), store, 80);
    expect(r.allowed).toBe(false);
    expect(r.needsReason).toBe(true);
  });

  it('auto-prompts arrival within 100 m of the drop', () => {
    const r = checkDropArrival(offsetM(drop, 0, 90), drop);
    expect(r.autoPrompt).toBe(true);
    expect(r.allowed).toBe(true);
  });

  it('allows arrival with a reason beyond 500 m (flagged, never silently blocked)', () => {
    const r = checkDropArrival(offsetM(drop, 500 + 60, 0), drop);
    expect(r.autoPrompt).toBe(false);
    expect(r.needsReason).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('flags proof recorded more than 300 m from the drop pin (350 m case)', () => {
    const r = checkProofDistance(offsetM(drop, 350, 0), drop);
    expect(r.flagged).toBe(true);
    expect(Math.round(r.distanceM)).toBeGreaterThan(GEOFENCE.proofFlagM);
    expect(checkProofDistance(offsetM(drop, 40, 0), drop).flagged).toBe(false);
  });
});
