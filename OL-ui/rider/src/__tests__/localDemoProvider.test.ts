import { ApiError } from '@/types';
import { LocalDemoProvider } from '@/providers/localDemoProvider';
import { DEMO_RETURNING_PHONE } from '@/demo/constants';
import { PUNE_CENTER } from '@/demo/seed';

const HUB = { lat: 18.4062, lng: 76.5711, accuracyM: 10 };

const newRider = async () => {
  const p = new LocalDemoProvider();
  await p.attachPhone(DEMO_RETURNING_PHONE);
  return p;
};

const goOnlineAndGetOffer = async (p: LocalDemoProvider) => {
  await p.setAvailability({ online: true, ...HUB });
  await p.forceDispatchNow();
  const offer = await p.getCurrentOffer();
  if (!offer) throw new Error('no offer');
  return offer;
};

const driveToProof = async (p: LocalDemoProvider) => {
  const offer = await goOnlineAndGetOffer(p);
  let job = await p.acceptOffer(offer.id);
  job = await p.step(job.id, { to: 'to_pickup', version: job.version, lat: HUB.lat, lng: HUB.lng, accuracyM: 10 });
  job = await p.step(job.id, { to: 'at_pickup', version: job.version, lat: job.pickup.lat, lng: job.pickup.lng, accuracyM: 10 });
  const v = await p.verifyPickup(job.id, { method: 'code', code: job.pickupCodeHint!, items: job.items.map((i) => ({ id: i.id, ok: true })), version: job.version });
  if (v.result !== 'verified') throw new Error('expected verified');
  job = v.job;
  job = await p.step(job.id, { to: 'picked_up', version: job.version, lat: job.pickup.lat, lng: job.pickup.lng, accuracyM: 10 });
  job = await p.step(job.id, { to: 'to_drop', version: job.version, lat: job.pickup.lat, lng: job.pickup.lng, accuracyM: 10 });
  job = await p.step(job.id, { to: 'at_drop', version: job.version, lat: job.drop.lat, lng: job.drop.lng, accuracyM: 10 });
  job = await p.step(job.id, { to: 'handover', version: job.version, lat: job.drop.lat, lng: job.drop.lng, accuracyM: 10 });
  return job;
};

describe('LocalDemoProvider — auth & onboarding', () => {
  it('returning phone is an approved store rider; a new phone must register', async () => {
    const p = await newRider();
    const me = await p.getMe();
    expect(me.rider.fullName).toBe('Rahul Sharma');
    expect(me.rider.riderCode).toBe('RIDER-1001');
    expect(me.rider.status).toBe('approved');
    expect(me.vehicle?.registrationNo).toBe('MH 24 AB 1234');
    expect(me.today.earnings).toBe(780);

    const q = new LocalDemoProvider();
    await q.attachPhone('9999900000');
    await expect(q.getMe()).rejects.toMatchObject({ code: 'not_enrolled' });
    const r = await q.register({ fullName: 'Asha Patil', phone: '9999900000' });
    expect(r.status).toBe('draft');
  });

  it('detects the zone or reports out_of_zone; refuses a hub pin outside the zone', async () => {
    const p = new LocalDemoProvider();
    await p.attachPhone('9999900001');
    await p.register({ fullName: 'Asha', phone: '9999900001' });
    const inZone = await p.lookupZone(18.407, 76.568);
    expect(inZone.status).toBe('in_zone');
    const out = await p.lookupZone(PUNE_CENTER.lat, PUNE_CENTER.lng);
    expect(out.status).toBe('out_of_zone');
    await expect(p.setHub({ zoneId: 'latur-central', lat: 18.407, lng: 76.608, address: 'x' })).rejects.toMatchObject({ code: 'out_of_zone' });
    const hub = await p.setHub({ zoneId: 'latur-central', lat: 18.407, lng: 76.568, address: 'Main road' });
    expect(hub.zoneId).toBe('latur-central');
  });

  it('rejects an invalid store invite code and taxi type is coming soon', async () => {
    const p = new LocalDemoProvider();
    await p.attachPhone('9999900002');
    await p.register({ fullName: 'Asha', phone: '9999900002' });
    await expect(p.linkStore('WRONG-1')).rejects.toMatchObject({ code: 'not_found' });
    const link = await p.linkStore('mega-2024');
    expect(link.storeName).toBe('Express MegaMart');
    await expect(p.setType('taxi')).rejects.toMatchObject({ code: 'coming_soon' });
  });

  it('progresses submitted → verification_pending → approved over time', async () => {
    const p = new LocalDemoProvider();
    await p.attachPhone('9999900003');
    await p.register({ fullName: 'Asha', phone: '9999900003' });
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now');
    spy.mockReturnValue(now);
    expect((await p.submitApplication()).status).toBe('submitted');
    spy.mockReturnValue(now + 7000);
    expect((await p.getStatus()).status).toBe('verification_pending');
    spy.mockReturnValue(now + 20000);
    expect((await p.getStatus()).status).toBe('approved');
    spy.mockRestore();
  });
});

describe('LocalDemoProvider — availability', () => {
  it('blocks going online above the cash limit, out of zone, or when suspended', async () => {
    const p = await newRider();
    await p.applyScenario('cash_limit');
    await expect(p.setAvailability({ online: true, ...HUB })).rejects.toMatchObject({ code: 'cash_limit' });
    await p.applyScenario('out_of_zone');
    await expect(p.setAvailability({ online: true, ...HUB })).rejects.toMatchObject({ code: 'out_of_zone' });
    await p.applyScenario('suspended_rider');
    await expect(p.setAvailability({ online: true, ...HUB })).rejects.toMatchObject({ code: 'suspended' });
    await p.applyScenario('manual_offer');
    expect((await p.setAvailability({ online: true, ...HUB })).online).toBe(true);
  });
});

describe('LocalDemoProvider — dispatch & offers', () => {
  it('offers the manual job, declines move to the next round, and 3 rounds escalate', async () => {
    const p = await newRider();
    const o1 = await goOnlineAndGetOffer(p);
    expect(o1.mode).toBe('manual');
    expect(o1.job.orderRef).toBe('#9830');
    expect(o1.round).toBe(1);
    await p.declineOffer(o1.id, 'too_far');
    await p.forceDispatchNow();
    const o2 = await p.getCurrentOffer();
    expect(o2?.jobId).toBe(o1.jobId);
    expect(o2?.round).toBe(2);
    await p.declineOffer(o2!.id, 'too_far');
    await p.forceDispatchNow();
    const o3 = await p.getCurrentOffer();
    expect(o3?.round).toBe(3);
    await p.declineOffer(o3!.id, 'too_far');
    const notes = await p.listNotifications();
    expect(notes.items.some((n) => n.title.includes('escalated'))).toBe(true);
  });

  it('expired offers cannot be accepted and re-offer after timeout', async () => {
    const p = await newRider();
    const offer = await goOnlineAndGetOffer(p);
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + 31000);
    await expect(p.acceptOffer(offer.id)).rejects.toMatchObject({ code: 'offer_expired' });
    spy.mockRestore();
  });

  it('auto-accept assigns instantly', async () => {
    const p = await newRider();
    await p.applyScenario('auto_accept');
    const offer = await goOnlineAndGetOffer(p);
    expect(offer.mode).toBe('auto');
    expect(offer.job.state).toBe('accepted');
    expect(offer.job.orderRef).toBe('#9824');
    const job = await p.acceptOffer(offer.id);
    expect(job.state).toBe('accepted');
    expect(await p.getCurrentOffer()).toBeNull();
  });

  it('two riders racing for one offer → only one wins (unique accepted offer)', async () => {
    const a = await newRider();
    const offer = await goOnlineAndGetOffer(a);
    const first = await a.acceptOffer(offer.id);
    expect(first.state).toBe('accepted');
    // The second accept on the same (consumed) offer id is idempotent for the winner and expired for anyone else.
    const again = await a.acceptOffer(offer.id);
    expect(again.id).toBe(first.id);
    await expect(a.acceptOffer('offer_other_rider')).rejects.toMatchObject({ code: 'offer_expired' });
  });
});

describe('LocalDemoProvider — job engine', () => {
  it('cannot skip or repeat states and surfaces version conflicts', async () => {
    const p = await newRider();
    const offer = await goOnlineAndGetOffer(p);
    const job = await p.acceptOffer(offer.id);
    await expect(p.step(job.id, { to: 'to_drop', version: job.version, lat: 0, lng: 0, accuracyM: 5 })).rejects.toMatchObject({ code: 'invalid_transition' });
    const next = await p.step(job.id, { to: 'to_pickup', version: job.version, lat: HUB.lat, lng: HUB.lng, accuracyM: 5 });
    await expect(p.step(job.id, { to: 'to_pickup', version: job.version, lat: HUB.lat, lng: HUB.lng, accuracyM: 5 })).rejects.toMatchObject({ code: 'version_conflict' });
    expect(next.version).toBe(job.version + 1);
  });

  it('requires a reason to mark arrival far from the pin and flags it', async () => {
    const p = await newRider();
    const offer = await goOnlineAndGetOffer(p);
    let job = await p.acceptOffer(offer.id);
    job = await p.step(job.id, { to: 'to_pickup', version: job.version, lat: HUB.lat, lng: HUB.lng, accuracyM: 5 });
    await expect(p.step(job.id, { to: 'at_pickup', version: job.version, lat: 18.5, lng: 76.7, accuracyM: 5 })).rejects.toMatchObject({ code: 'too_far' });
    job = await p.step(job.id, { to: 'at_pickup', version: job.version, lat: 18.5, lng: 76.7, accuracyM: 5, reason: 'GPS drift between buildings' });
    expect(job.state).toBe('at_pickup');
    expect(job.flags?.some((f) => f.startsWith('pickup_arrival_far'))).toBe(true);
  });

  it('pickup verification returns mismatch, incomplete, then verified', async () => {
    const p = await newRider();
    await p.applyScenario('mismatch');
    const offer = await goOnlineAndGetOffer(p);
    let job = await p.acceptOffer(offer.id);
    job = await p.step(job.id, { to: 'to_pickup', version: job.version, lat: HUB.lat, lng: HUB.lng, accuracyM: 5 });
    job = await p.step(job.id, { to: 'at_pickup', version: job.version, lat: job.pickup.lat, lng: job.pickup.lng, accuracyM: 5 });
    const items = job.items.map((i) => ({ id: i.id, ok: true }));
    const r1 = await p.verifyPickup(job.id, { method: 'scan', code: job.pickupCodeHint!, items, version: job.version });
    expect(r1.result).toBe('mismatch');
    const r2 = await p.verifyPickup(job.id, { method: 'scan', code: job.pickupCodeHint!, items: [{ id: items[0]!.id, ok: false }, ...items.slice(1)], version: job.version });
    expect(r2.result).toBe('incomplete');
    const r3 = await p.verifyPickup(job.id, { method: 'scan', code: job.pickupCodeHint!, items, version: job.version });
    expect(r3.result).toBe('verified');
    expect(r3.job.state).toBe('pickup_verified');
    expect(r3.job.drop.address).toBeTruthy();
  });

  it('OTP: correct code delivers; 5 wrong attempts lock and unlock photo fallback', async () => {
    const p = await newRider();
    const job = await driveToProof(p);
    const otp = await p.getDemoDeliveryOtp(job.id);
    let last = job;
    for (let i = 1; i <= 5; i++) {
      try {
        await p.submitProof(job.id, { method: 'otp', code: '0000', version: last.version, lat: job.drop.lat, lng: job.drop.lng });
        throw new Error('should fail');
      } catch (e) {
        expect(ApiError.is(e)).toBe(true);
        const err = e as ApiError;
        expect(err.code).toBe(i < 5 ? 'otp_invalid' : 'otp_locked');
        last = (err.meta as { job: typeof job }).job;
      }
    }
    expect(last.otpLocked).toBe(true);
    await expect(p.submitProof(job.id, { method: 'otp', code: otp!, version: last.version, lat: job.drop.lat, lng: job.drop.lng })).rejects.toMatchObject({ code: 'otp_locked' });
    const res = await p.submitProof(job.id, { method: 'photo', assetId: 'asset-1', version: last.version, lat: job.drop.lat, lng: job.drop.lng });
    expect(res.job.state).toBe('delivered');
    expect(res.earnings.ruleVersion).toBe(3);
  });

  it('delivery with the right OTP records earnings, tip 100 %, cash ledger and flags far proofs', async () => {
    const p = await newRider();
    const job = await driveToProof(p);
    const otp = await p.getDemoDeliveryOtp(job.id);
    const res = await p.submitProof(job.id, { method: 'otp', code: otp!, version: job.version, lat: job.drop.lat + 0.01, lng: job.drop.lng, cashCollected: job.cashToCollect || undefined });
    expect(res.job.state).toBe('delivered');
    expect(res.flagged).toBe(true);
    expect(res.earnings.tip).toBe(10);
    expect(res.earnings.total).toBe(res.earnings.base + res.earnings.distance + res.earnings.peak + res.earnings.wait + res.earnings.tip + res.earnings.bonus);
    const me = await p.getMe();
    expect(me.today.jobs).toBe(5);
    expect(await p.getCurrentJob()).toBeNull();
    const hist = await p.listJobs();
    expect(hist.items[0]?.id).toBe(job.id);
    const earnings = await p.getEarnings('today');
    expect(earnings.total).toBeGreaterThan(780);
  });

  it('signature proof for Pick & Drop and cash collected goes to the ledger', async () => {
    const p = await newRider();
    await p.applyScenario('auto_accept');
    const job = await driveToProof(p); // #9824 grocery with ₹486 COD
    const before = (await p.getCash()).cashInHand;
    const res = await p.submitProof(job.id, { method: 'photo', assetId: 'a', version: job.version, lat: job.drop.lat, lng: job.drop.lng, cashCollected: 486 });
    expect(res.job.state).toBe('delivered');
    const cash = await p.getCash();
    expect(cash.cashInHand).toBe(before + 486);
    expect(cash.ledger[0]?.kind).toBe('collected');
  });

  it('exceptions: vehicle breakdown reassigns, refused returns, unavailable escalates, address dispute corrects the pin', async () => {
    const p = await newRider();
    const offer = await goOnlineAndGetOffer(p);
    let job = await p.acceptOffer(offer.id);
    job = await p.step(job.id, { to: 'to_pickup', version: job.version, lat: HUB.lat, lng: HUB.lng, accuracyM: 5 });
    await expect(p.raiseException(job.id, { kind: 'refused', version: job.version, lat: 0, lng: 0 })).rejects.toMatchObject({ code: 'invalid_transition' });
    const ex = await p.raiseException(job.id, { kind: 'vehicle', version: job.version, lat: HUB.lat, lng: HUB.lng });
    expect(ex.jobState).toBe('failed');
    expect(ex.nextActions).toContain('reassigned');
    expect(await p.getCurrentJob()).toBeNull();

    const q = await newRider();
    const j2 = await driveToProof(q);
    const refused = await q.raiseException(j2.id, { kind: 'refused', version: j2.version, lat: j2.drop.lat, lng: j2.drop.lng });
    expect(refused.jobState).toBe('returned');

    const r = await newRider();
    const offer3 = await goOnlineAndGetOffer(r);
    let j3 = await r.acceptOffer(offer3.id);
    j3 = await r.step(j3.id, { to: 'to_pickup', version: j3.version, lat: HUB.lat, lng: HUB.lng, accuracyM: 5 });
    j3 = await r.step(j3.id, { to: 'at_pickup', version: j3.version, lat: j3.pickup.lat, lng: j3.pickup.lng, accuracyM: 5 });
    const v = await r.verifyPickup(j3.id, { method: 'bypass', reason: 'Receipt damaged', items: [], version: j3.version });
    expect(v.result).toBe('verified');
    j3 = v.job;
    j3 = await r.step(j3.id, { to: 'picked_up', version: j3.version, lat: j3.pickup.lat, lng: j3.pickup.lng, accuracyM: 5 });
    j3 = await r.step(j3.id, { to: 'to_drop', version: j3.version, lat: j3.pickup.lat, lng: j3.pickup.lng, accuracyM: 5 });
    j3 = await r.step(j3.id, { to: 'at_drop', version: j3.version, lat: j3.drop.lat, lng: j3.drop.lng, accuracyM: 5 });
    const addr = await r.raiseException(j3.id, { kind: 'address', version: j3.version, lat: j3.drop.lat + 0.002, lng: j3.drop.lng, correctedLat: j3.drop.lat + 0.002, correctedLng: j3.drop.lng });
    expect(addr.jobState).toBe('at_drop');
    const corrected = await r.getJob(j3.id);
    expect(corrected.drop.source).toBe('rider_corrected');
    const un = await r.raiseException(j3.id, { kind: 'unavailable', version: corrected.version, lat: j3.drop.lat, lng: j3.drop.lng });
    expect(un.waitSeconds).toBe(300);
    const esc = await r.resolveWait(j3.id, 'unavailable', 'escalate');
    expect(esc.jobState).toBe('returned');
  });

  it('a rider cannot view another rider\'s job (404) and the customer phone is hidden after delivery', async () => {
    const p = await newRider();
    const job = await driveToProof(p);
    const other = new LocalDemoProvider();
    await other.attachPhone('9999900009');
    await other.register({ fullName: 'Other', phone: '9999900009' });
    await expect(other.getJob(job.id)).rejects.toMatchObject({ code: 'not_found' });
    expect((await p.getCallNumber(job.id)).number).toBeTruthy();
    const otp = await p.getDemoDeliveryOtp(job.id);
    await p.submitProof(job.id, { method: 'otp', code: otp!, version: job.version, lat: job.drop.lat, lng: job.drop.lng });
    await expect(p.getCallNumber(job.id)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('an expired document blocks going online until it is re-uploaded', async () => {
    const p = await newRider();
    await p.expireDocument('dl');
    expect((await p.getStatus()).status).toBe('documents_expired');
    expect((await p.getStatus()).expiredDocuments).toEqual(['dl']);
    await expect(p.setAvailability({ online: true, ...HUB })).rejects.toMatchObject({ code: 'not_enrolled' });
    const doc = await p.submitDocument({ kind: 'dl', assetId: 'asset-dl', source: 'upload', number: 'MH24 2019 0001234' });
    expect(doc.status).toBe('pending');
    expect((await p.getStatus()).expiredDocuments).toEqual([]);
  });

  it('KYC rejection can be re-uploaded', async () => {
    const p = new LocalDemoProvider();
    await p.attachPhone('9999900010');
    await p.register({ fullName: 'Asha', phone: '9999900010' });
    const first = await p.submitDocument({ kind: 'selfie', assetId: 'a1', source: 'upload' });
    expect(first.status).toBe('pending');
    const again = await p.submitDocument({ kind: 'selfie', assetId: 'a2', source: 'upload' });
    expect(again.assetId).toBe('a2');
    const me = await p.getMe();
    expect(me.documents.filter((d) => d.kind === 'selfie')).toHaveLength(1);
  });
});
