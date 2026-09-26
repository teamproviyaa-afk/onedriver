import { DISPATCH, planDispatch, radiusForRound, rankCandidates, type DispatchCandidate, type DispatchJobInput } from '@/domain/dispatch';

const job: DispatchJobInput = { storeId: 'store-a', pickup: { lat: 18.4062, lng: 76.5711 }, pickupZoneId: 'latur-central', neighbourZoneIds: ['latur-east'], allowedVehicleClasses: ['2w', '3w'] };

const base = (over: Partial<DispatchCandidate>): DispatchCandidate => ({
  riderId: 'r',
  type: 'solo',
  acceptance: 'manual',
  online: true,
  status: 'approved',
  onJob: false,
  cashInHand: 0,
  cashLimit: 2000,
  vehicleClass: '2w',
  linkedStoreIds: [],
  zoneId: 'latur-central',
  jobsToday: 0,
  position: { lat: 18.41, lng: 76.575 },
  ...over,
});

describe('dispatch ranking', () => {
  it('prefers linked store riders even when a solo rider is closer', () => {
    const linked = base({ riderId: 'linked', type: 'store', linkedStoreIds: ['store-a'], position: { lat: 18.42, lng: 76.58 } });
    const solo = base({ riderId: 'solo', position: { lat: 18.4063, lng: 76.5712 } });
    const ranked = rankCandidates([solo, linked], job);
    expect(ranked.map((r) => r.riderId)).toEqual(['linked', 'solo']);
  });

  it('ranks solo riders by road ETA, ties broken by fewer jobs today', () => {
    const a = base({ riderId: 'a', roadEtaMin: 6, jobsToday: 5 });
    const b = base({ riderId: 'b', roadEtaMin: 4, jobsToday: 2 });
    const c = base({ riderId: 'c', roadEtaMin: 4, jobsToday: 1 });
    expect(rankCandidates([a, b, c], job).map((r) => r.riderId)).toEqual(['c', 'b', 'a']);
  });

  it('excludes riders that are offline, on a job, suspended, over cash limit, wrong vehicle or out of zone', () => {
    const cands = [
      base({ riderId: 'offline', online: false }),
      base({ riderId: 'busy', onJob: true }),
      base({ riderId: 'suspended', status: 'suspended' }),
      base({ riderId: 'cash', cashInHand: 2500 }),
      base({ riderId: 'car', vehicleClass: '4w' }),
      base({ riderId: 'far-zone', zoneId: 'pune-1' }),
      base({ riderId: 'ok' }),
    ];
    expect(rankCandidates(cands, job).map((r) => r.riderId)).toEqual(['ok']);
  });

  it('expands the radius by 2 km per round up to 8 km', () => {
    expect(radiusForRound(1)).toBe(2);
    expect(radiusForRound(2)).toBe(4);
    expect(radiusForRound(4)).toBe(8);
    expect(radiusForRound(9)).toBe(8);
  });

  it('auto-accept riders are assigned immediately, manual riders get a 30 s window', () => {
    const auto = base({ riderId: 'auto', acceptance: 'auto', roadEtaMin: 9 });
    const manual = base({ riderId: 'manual', roadEtaMin: 3 });
    const plan = planDispatch([auto, manual], job, () => false);
    expect(plan.winner?.riderId).toBe('auto');
    expect(plan.rounds[0]?.[0]).toMatchObject({ riderId: 'manual', mode: 'manual', expiresInSeconds: DISPATCH.offerWindowSeconds });
  });

  it('manual timeout moves to the next candidate and escalates after 3 rounds', () => {
    const r1 = base({ riderId: 'r1', roadEtaMin: 3 });
    const r2 = base({ riderId: 'r2', roadEtaMin: 5 });
    const plan = planDispatch([r1, r2], job, () => false);
    expect(plan.escalated).toBe(true);
    expect(plan.rounds.length).toBe(DISPATCH.maxRounds);
    expect(plan.rounds[0]?.map((p) => p.riderId)).toEqual(['r1', 'r2']);
    const accepted = planDispatch([r1, r2], job, (id) => id === 'r2');
    expect(accepted.winner?.riderId).toBe('r2');
    expect(accepted.escalated).toBe(false);
  });
});
