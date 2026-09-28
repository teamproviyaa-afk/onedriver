import { ApiError } from '@/types';
import { LocalDemoProvider } from '@/providers/localDemoProvider';
import { DemoAuthProvider } from '@/auth/demoAuthProvider';
import { DEMO_RETURNING_PHONE } from '@/demo/constants';
import { DEMO_NO_WHATSAPP_PHONES, MESSAGING, demoHasWhatsApp, describeDelivery, routeMessage } from '@/domain/messaging';

const HUB = { lat: 18.4062, lng: 76.5711, accuracyM: 10 };

const newRider = async () => {
  const p = new LocalDemoProvider();
  await p.attachPhone(DEMO_RETURNING_PHONE);
  return p;
};

/** Accept #9830 and drive it to picked_up (the moment the customer gets their code). */
const driveToPickedUp = async (p: LocalDemoProvider) => {
  await p.setAvailability({ online: true, ...HUB });
  await p.forceDispatchNow();
  const offer = await p.getCurrentOffer();
  if (!offer) throw new Error('no offer');
  let job = await p.acceptOffer(offer.id);
  job = await p.step(job.id, { to: 'to_pickup', version: job.version, lat: HUB.lat, lng: HUB.lng, accuracyM: 10 });
  job = await p.step(job.id, { to: 'at_pickup', version: job.version, lat: job.pickup.lat, lng: job.pickup.lng, accuracyM: 10 });
  const v = await p.verifyPickup(job.id, { method: 'code', code: job.pickupCodeHint!, items: job.items.map((i) => ({ id: i.id, ok: true })), version: job.version });
  job = v.job;
  return p.step(job.id, { to: 'picked_up', version: job.version, lat: job.pickup.lat, lng: job.pickup.lng, accuracyM: 10 });
};

describe('messaging rules (mirror of the server orchestrator)', () => {
  it('routes WhatsApp first and falls back to SMS', () => {
    expect(routeMessage({ policy: 'whatsapp_then_sms', hasWhatsApp: true })).toEqual({ channels: ['whatsapp'], primary: 'whatsapp', fallbackUsed: false });
    expect(routeMessage({ policy: 'whatsapp_then_sms', hasWhatsApp: false })).toMatchObject({ primary: 'sms', fallbackUsed: true, fallbackReason: 'no_whatsapp' });
    expect(routeMessage({ policy: 'whatsapp_then_sms', hasWhatsApp: true, knownNoWhatsApp: true })).toMatchObject({ primary: 'sms', fallbackReason: 'known_no_whatsapp' });
    expect(routeMessage({ policy: 'whatsapp_then_sms', hasWhatsApp: true, recentWhatsAppSend: true })).toMatchObject({ primary: 'sms', fallbackReason: 'resend_escalated' });
    expect(routeMessage({ policy: 'whatsapp_and_sms', hasWhatsApp: true }).channels).toEqual(['whatsapp', 'sms']);
    expect(routeMessage({ policy: 'whatsapp_and_sms', hasWhatsApp: false }).channels).toEqual(['sms']);
    expect(routeMessage({ policy: 'email', hasWhatsApp: true }).primary).toBe('email');
  });

  it('describes the delivery for the rider', () => {
    expect(describeDelivery({ channel: 'whatsapp', status: 'sent' })).toBe('on WhatsApp');
    expect(describeDelivery({ channel: 'sms', status: 'sent', fallbackReason: 'no_whatsapp' })).toBe('by SMS (not on WhatsApp)');
    expect(describeDelivery({ channel: 'sms', status: 'sent', fallbackReason: 'resend_escalated' })).toBe('by SMS');
    expect(describeDelivery({ channel: null, status: 'failed' })).toBe('could not be sent');
    expect(demoHasWhatsApp(DEMO_RETURNING_PHONE)).toBe(true);
    expect(demoHasWhatsApp(`+91 ${DEMO_NO_WHATSAPP_PHONES[0]}`)).toBe(false);
  });
});

describe('sign-in code (demo auth)', () => {
  it('goes on WhatsApp, by SMS for a number without WhatsApp, and by SMS on a quick resend', async () => {
    const auth = new DemoAuthProvider();
    expect((await auth.sendOtp(DEMO_RETURNING_PHONE)).delivery).toEqual({ channel: 'whatsapp', fallbackReason: undefined });
    expect((await auth.sendOtp(DEMO_RETURNING_PHONE, { resend: true })).delivery).toEqual({ channel: 'sms', fallbackReason: 'resend_escalated' });
    expect((await auth.sendOtp(DEMO_NO_WHATSAPP_PHONES[0]!)).delivery).toEqual({ channel: 'sms', fallbackReason: 'no_whatsapp' });
  });
});

describe('dev outbox', () => {
  it('keeps the sign-in code recorded before the phone is attached', async () => {
    const p = new LocalDemoProvider();
    const challenge = await new DemoAuthProvider().sendOtp(DEMO_RETURNING_PHONE);
    await p.recordLoginOtp(challenge);
    await p.attachPhone(DEMO_RETURNING_PHONE);
    expect((await p.getDemoOutbox())[0]).toMatchObject({ template: 'login_otp', channel: 'whatsapp', toMasked: '+91 ******3210' });
  });
});

describe('customer delivery OTP (demo server)', () => {
  it('is sent on WhatsApp at pickup; the receipt never exposes the customer number', async () => {
    const p = await newRider();
    const job = await driveToPickedUp(p);
    expect(job.otpDelivery).toMatchObject({ channel: 'whatsapp', status: 'sent', fallbackUsed: false, fallbackPending: true });
    expect(job.otpDelivery?.toMasked).toBeUndefined();
    const out = (await p.getDemoOutbox());
    expect(out[0]).toMatchObject({ template: 'delivery_otp', audience: 'customer', channel: 'whatsapp' });
    expect((await p.getJob(job.id)).otpDelivery?.channel).toBe('whatsapp');
  });

  it('resend: 30 s cooldown, then by SMS ("didn\'t get it")', async () => {
    const p = await newRider();
    const job = await driveToPickedUp(p);
    await expect(p.resendDeliveryOtp(job.id)).rejects.toMatchObject({ code: 'rate_limited' });
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + (MESSAGING.resendCooldownSeconds + 1) * 1000);
    try {
      const r = await p.resendDeliveryOtp(job.id);
      expect(r).toMatchObject({ channel: 'sms', fallbackUsed: true, fallbackReason: 'resend_escalated' });
      expect((await p.getDemoOutbox())[0]).toMatchObject({ template: 'delivery_otp', channel: 'sms', fallbackReason: 'resend_escalated' });
    } finally {
      spy.mockRestore();
    }
  });

  it('customer not on WhatsApp → OTP and receipt by SMS', async () => {
    const p = await newRider();
    await p.applyScenario('customer_no_whatsapp');
    const job = await driveToPickedUp(p);
    expect(job.otpDelivery).toMatchObject({ channel: 'sms', fallbackUsed: true, fallbackReason: 'no_whatsapp', fallbackPending: false });
    let j = await p.step(job.id, { to: 'to_drop', version: job.version, lat: job.pickup.lat, lng: job.pickup.lng, accuracyM: 10 });
    j = await p.step(j.id, { to: 'at_drop', version: j.version, lat: j.drop.lat, lng: j.drop.lng, accuracyM: 10 });
    j = await p.step(j.id, { to: 'handover', version: j.version, lat: j.drop.lat, lng: j.drop.lng, accuracyM: 10 });
    const otp = await p.getDemoDeliveryOtp(j.id);
    await p.submitProof(j.id, { method: 'otp', code: otp!, version: j.version, lat: j.drop.lat, lng: j.drop.lng });
    expect((await p.getDemoOutbox())[0]).toMatchObject({ template: 'order_delivered', channel: 'sms', fallbackReason: 'known_no_whatsapp' });
  });

  it('cannot be resent before the package is picked up', async () => {
    const p = await newRider();
    await p.setAvailability({ online: true, ...HUB });
    await p.forceDispatchNow();
    const offer = await p.getCurrentOffer();
    const job = await p.acceptOffer(offer!.id);
    await expect(p.resendDeliveryOtp(job.id)).rejects.toMatchObject({ code: 'invalid_transition' });
  });
});

describe('email and SOS (demo server)', () => {
  it('weekly statement needs an email on file, then goes by email to the masked address', async () => {
    const p = await newRider();
    await expect(p.emailStatement('2026-W39')).rejects.toMatchObject({ code: 'validation' });
    const me = await p.getMe();
    await expect(p.updateProfile({ fullName: me.rider.fullName, emergencyPhone: me.rider.emergencyPhone ?? '', email: 'not-an-email', language: 'en' })).rejects.toBeInstanceOf(ApiError);
    const r = await p.updateProfile({ fullName: me.rider.fullName, emergencyPhone: me.rider.emergencyPhone ?? '', email: ' Rahul.Sharma@Example.com ', language: 'en' });
    expect(r.email).toBe('rahul.sharma@example.com');
    const receipt = await p.emailStatement('2026-W39');
    expect(receipt).toMatchObject({ channel: 'email', status: 'sent', toMasked: 'r***@example.com' });
    expect((await p.getDemoOutbox())[0]).toMatchObject({ template: 'weekly_statement', channel: 'email' });
  });

  it('SOS alerts the emergency contact on WhatsApp and SMS together', async () => {
    const p = await newRider();
    const res = await p.sos({ lat: HUB.lat, lng: HUB.lng });
    expect(res.contactAlert).toMatchObject({ channel: 'whatsapp', status: 'sent', fallbackUsed: false });
    expect(res.contactAlert?.toMasked).toBe('+91 ******1223');
    const sos = (await p.getDemoOutbox()).filter((m) => m.template === 'sos_alert');
    expect(sos.map((m) => m.channel).sort()).toEqual(['sms', 'whatsapp']);
  });
});
