import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.ts';
import { MessagingError } from '../functions/_shared/messaging/types.ts';

const CUSTOMER = '9876543210';
const E164 = '+919876543210';
const deliveryOtp = (over: Record<string, unknown> = {}) => ({ template: 'delivery_otp' as const, to: { phone: CUSTOMER }, params: { name: 'Amit', order: '#9830', otp: '4821' }, ...over });

test('WhatsApp first: accepted message waits for delivery, no SMS yet', async () => {
  const s = setup();
  const r = await s.messenger.send(deliveryOtp());
  assert.equal(r.phone?.channel, 'whatsapp');
  assert.equal(r.phone?.status, 'sent');
  assert.equal(r.phone?.fallbackUsed, false);
  assert.equal(r.phone?.fallbackPending, true);
  assert.equal(r.phone?.toMasked, '+91 ******3210');
  assert.equal(s.whatsapp?.sent.length, 1);
  assert.equal(s.sms?.sent.length, 0);
  const wa = s.whatsapp?.sent[0];
  assert.equal(wa?.to, E164);
  assert.deepEqual(wa?.content.kind === 'whatsapp' ? wa.content.bodyParams : null, ['Amit', '#9830', '4821']);
  assert.ok(s.waRecord()?.payloadEnc?.startsWith('v1.'));
});

test('number not on WhatsApp → SMS immediately, and the number is remembered', async () => {
  const s = setup({ wa: { notOnWhatsApp: (to) => to === E164 } });
  const r = await s.messenger.send(deliveryOtp());
  assert.equal(r.phone?.channel, 'sms');
  assert.equal(r.phone?.fallbackUsed, true);
  assert.equal(r.phone?.fallbackReason, 'no_whatsapp');
  assert.equal(s.sms?.sent.length, 1);
  const sms = s.sms?.sent[0];
  assert.match(sms?.content.kind === 'sms' ? sms.content.text : '', /delivery OTP for your OneLocal order #9830 is 4821/);
  const wa = s.waRecord();
  assert.equal(wa?.status, 'failed');
  assert.equal(wa?.payloadEnc, null);
  assert.ok(wa?.fallbackSentAt);

  // Next message to the same number skips WhatsApp entirely.
  s.advance(3600);
  const r2 = await s.messenger.send({ template: 'order_delivered', to: { phone: CUSTOMER }, params: { name: 'Amit', order: '#9830', time: '4:42 PM' } });
  assert.equal(r2.phone?.channel, 'sms');
  assert.equal(r2.phone?.fallbackReason, 'known_no_whatsapp');
  assert.equal(s.records().filter((x) => x.channel === 'whatsapp').length, 1, 'no second WhatsApp attempt');
});

test('other WhatsApp failure → SMS, number not marked as non-WhatsApp', async () => {
  const s = setup({ wa: { fail: () => true } });
  const r = await s.messenger.send(deliveryOtp());
  assert.equal(r.phone?.channel, 'sms');
  assert.equal(r.phone?.fallbackReason, 'whatsapp_failed');
  assert.equal(s.store.capabilities.size, 0);
});

test('async webhook "not on WhatsApp" triggers exactly one SMS', async () => {
  const s = setup();
  await s.messenger.send(deliveryOtp());
  const pid = s.waRecord()?.providerMessageId ?? '';
  const u = { provider: 'mock' as const, providerMessageId: pid, status: 'failed' as const, errorCode: '131026', notOnWhatsApp: true };
  assert.equal(await s.messenger.handleStatus(u), 'updated');
  assert.equal(await s.messenger.handleStatus(u), 'ignored');
  s.advance(120);
  assert.deepEqual(await s.messenger.sweep(), { due: 0, fallbacksSent: 0 });
  assert.equal(s.sms?.sent.length, 1);
  const smsRec = s.records().find((r) => r.channel === 'sms');
  assert.equal(smsRec?.fallbackOf, s.waRecord()?.id);
  assert.equal(smsRec?.fallbackReason, 'no_whatsapp');
  assert.equal([...s.store.capabilities.values()][0]?.capable, false);
});

test('no delivery confirmation before the deadline → sweep sends SMS once', async () => {
  const s = setup();
  await s.messenger.send(deliveryOtp());
  s.advance(29);
  assert.deepEqual(await s.messenger.sweep(), { due: 0, fallbacksSent: 0 });
  s.advance(2);
  assert.deepEqual(await s.messenger.sweep(), { due: 1, fallbacksSent: 1 });
  assert.deepEqual(await s.messenger.sweep(), { due: 0, fallbacksSent: 0 });
  assert.equal(s.sms?.sent.length, 1);
  assert.equal(s.records().find((r) => r.channel === 'sms')?.fallbackReason, 'whatsapp_timeout');
  assert.equal(s.waRecord()?.payloadEnc, null);
});

test('delivered on WhatsApp → no SMS, payload purged, late failure ignored', async () => {
  const s = setup();
  await s.messenger.send(deliveryOtp());
  const pid = s.waRecord()?.providerMessageId ?? '';
  assert.equal(await s.messenger.handleStatus({ provider: 'mock', providerMessageId: pid, status: 'delivered' }), 'updated');
  assert.equal(s.waRecord()?.payloadEnc, null);
  s.advance(600);
  assert.deepEqual(await s.messenger.sweep(), { due: 0, fallbacksSent: 0 });
  assert.equal(await s.messenger.handleStatus({ provider: 'mock', providerMessageId: pid, status: 'failed', errorCode: '131026', notOnWhatsApp: true }), 'ignored');
  assert.equal(s.sms?.sent.length, 0);
  assert.equal([...s.store.capabilities.values()][0]?.capable, true);
});

test('resend within 5 minutes goes by SMS ("didn\'t get it")', async () => {
  const s = setup();
  await s.messenger.send(deliveryOtp());
  s.advance(40);
  const r = await s.messenger.send(deliveryOtp());
  assert.equal(r.phone?.channel, 'sms');
  assert.equal(r.phone?.fallbackReason, 'resend_escalated');
  s.advance(400);
  const r3 = await s.messenger.send(deliveryOtp());
  assert.equal(r3.phone?.channel, 'whatsapp', 'outside the window WhatsApp is tried again');
});

test('OTP rate limit per number', async () => {
  const s = setup();
  for (let i = 0; i < 5; i++) {
    await s.messenger.send({ template: 'login_otp', to: { phone: CUSTOMER }, params: { otp: '123456' } });
    s.advance(10);
  }
  await assert.rejects(s.messenger.send({ template: 'login_otp', to: { phone: CUSTOMER }, params: { otp: '123456' } }), (e: unknown) => e instanceof MessagingError && e.code === 'rate_limited' && e.status === 429);
  s.advance(900);
  const ok = await s.messenger.send({ template: 'login_otp', to: { phone: CUSTOMER }, params: { otp: '123456' } });
  assert.equal(ok.phone?.status, 'sent');
});

test('idempotency key: second call returns the first result without sending', async () => {
  const s = setup();
  const a = await s.messenger.send(deliveryOtp({ idempotencyKey: 'job-9830:otp:1' }));
  const b = await s.messenger.send(deliveryOtp({ idempotencyKey: 'job-9830:otp:1' }));
  assert.equal(b.deduplicated, true);
  assert.equal(b.requestId, a.requestId);
  assert.equal(s.whatsapp?.sent.length, 1);
});

test('SOS goes to WhatsApp and SMS together', async () => {
  const s = setup();
  const r = await s.messenger.send({ template: 'sos_alert', to: { phone: '9822011223' }, params: { name: 'Rahul Sharma', location: 'https://maps.google.com/?q=18.4088,76.5604' } });
  assert.equal(r.phone?.status, 'sent');
  assert.equal(s.whatsapp?.sent.length, 1);
  assert.equal(s.sms?.sent.length, 1);
  assert.equal(s.waRecord()?.payloadEnc, null, 'nothing kept for a fallback');
});

test('email alongside phone, and email-only statements', async () => {
  const s = setup();
  const r = await s.messenger.send({ template: 'order_delivered', to: { phone: CUSTOMER, email: 'Amit.K@Example.com' }, params: { name: 'Amit', order: '#9830', time: '4:42 PM' } });
  assert.equal(r.email?.status, 'sent');
  assert.equal(r.email?.toMasked, 'a***@example.com');
  assert.equal(s.email?.sent[0]?.to, 'amit.k@example.com');
  const st = await s.messenger.send({ template: 'weekly_statement', to: { email: 'rahul@example.com', phone: CUSTOMER }, params: { name: 'Rahul', period: '21-27 Sep', amount: '3,420', url: 'https://files.onelocal.in/s/abc.pdf' } });
  assert.equal(st.phone, null);
  assert.equal(st.email?.status, 'sent');
  const html = s.email?.sent[1]?.content.kind === 'email' ? s.email.sent[1].content.html : '';
  assert.match(html, /Download statement/);
});

test('no WhatsApp provider configured → SMS with reason whatsapp_unavailable', async () => {
  const s = setup({ noWhatsApp: true });
  const r = await s.messenger.send(deliveryOtp());
  assert.equal(r.phone?.channel, 'sms');
  assert.equal(r.phone?.fallbackReason, 'whatsapp_unavailable');
});

test('WhatsApp fails and no SMS provider → failed, reported honestly', async () => {
  const s = setup({ wa: { notOnWhatsApp: () => true }, noSms: true });
  const r = await s.messenger.send(deliveryOtp());
  assert.equal(r.phone?.status, 'failed');
  assert.equal(r.phone?.channel, null);
  assert.equal(r.phone?.fallbackReason, 'no_whatsapp');
});

test('validation: bad phone, missing params, unknown template, bad OTP', async () => {
  const s = setup();
  await assert.rejects(s.messenger.send(deliveryOtp({ to: { phone: '12345' } })), /Invalid phone/);
  await assert.rejects(s.messenger.send({ template: 'delivery_otp', to: { phone: CUSTOMER }, params: { name: 'Amit', otp: '4821' } }), /Missing parameter "order"/);
  await assert.rejects(s.messenger.send({ template: 'nope' as never, to: { phone: CUSTOMER }, params: {} }), /Unknown template/);
  await assert.rejects(s.messenger.send({ template: 'login_otp', to: { phone: CUSTOMER }, params: { otp: '12ab' } }), /OTP must be 4-8 digits/);
  await assert.rejects(s.messenger.send({ template: 'weekly_statement', to: { phone: CUSTOMER }, params: { name: 'R', period: 'p', amount: '1', url: 'https://x.in/s.pdf' } }), /No recipient/);
});

test('privacy: stored records and logs never contain the number, email or code in clear text', async () => {
  const s = setup({ wa: { notOnWhatsApp: (to) => to === '+919000000001' } });
  await s.messenger.send(deliveryOtp());
  await s.messenger.send({ template: 'delivery_otp', to: { phone: '9000000001' }, params: { name: 'Priya', order: '#9824', otp: '7364' } });
  await s.messenger.send({ template: 'order_delivered', to: { phone: CUSTOMER, email: 'amit@example.com' }, params: { name: 'Amit', order: '#9830', time: '4:42 PM' } });
  const dump = JSON.stringify({ records: s.records(), caps: [...s.store.capabilities.entries()], events: s.events });
  for (const secret of ['9876543210', '9000000001', 'amit@example.com', '4821', '7364']) assert.equal(dump.includes(secret), false, `leaked ${secret}`);
});
