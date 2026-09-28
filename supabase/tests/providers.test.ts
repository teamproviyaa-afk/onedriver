import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFetch, jsonResponse } from './helpers.ts';
import { createMetaWhatsAppProvider } from '../functions/_shared/messaging/providers/metaWhatsApp.ts';
import { createTwilioProvider } from '../functions/_shared/messaging/providers/twilio.ts';
import { createMsg91SmsProvider } from '../functions/_shared/messaging/providers/msg91.ts';
import { createResendProvider } from '../functions/_shared/messaging/providers/resend.ts';
import { DEFAULT_CONTENT_CONFIG, renderEmail, renderSms, renderWhatsApp } from '../functions/_shared/messaging/templates.ts';
import type { OutboundMessage } from '../functions/_shared/messaging/types.ts';

const cfg = { ...DEFAULT_CONTENT_CONFIG, twilioContentSids: { login_otp: 'HX123' }, msg91FlowIds: { delivery_otp: 'flow-1' } };
const loginWa = (): OutboundMessage => ({ id: 'm1', channel: 'whatsapp', to: '+919876543210', template: 'login_otp', content: renderWhatsApp('login_otp', { otp: '123456' }, cfg)! });
const deliverySms = (): OutboundMessage => ({ id: 'm2', channel: 'sms', to: '+919876543210', template: 'delivery_otp', content: renderSms('delivery_otp', { name: 'Amit', order: '#9830', otp: '4821' }, cfg)! });

test('Meta: template message with OTP copy-code button', async () => {
  const f = fakeFetch(() => jsonResponse({ messages: [{ id: 'wamid.ABC' }] }));
  const p = createMetaWhatsAppProvider({ accessToken: 'tok', phoneNumberId: '1234', graphVersion: 'v23.0', fetch: f.fn });
  const r = await p.send(loginWa());
  assert.deepEqual(r, { ok: true, providerMessageId: 'wamid.ABC' });
  const call = f.calls[0]!;
  assert.equal(call.url, 'https://graph.facebook.com/v23.0/1234/messages');
  assert.equal((call.init.headers as Record<string, string>).Authorization, 'Bearer tok');
  const body = JSON.parse(String(call.init.body));
  assert.equal(body.to, '919876543210');
  assert.equal(body.template.name, 'onelocal_login_otp');
  assert.deepEqual(body.template.components, [
    { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] },
  ]);
});

test('Meta: error 131026 is reported as "not on WhatsApp"', async () => {
  const f = fakeFetch(() => jsonResponse({ error: { code: 131026, message: 'Message undeliverable' } }, 400));
  const r = await createMetaWhatsAppProvider({ accessToken: 't', phoneNumberId: '1', graphVersion: 'v23.0', fetch: f.fn }).send(loginWa());
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.notOnWhatsApp, true);
  assert.equal(!r.ok && r.code, '131026');
});

test('Meta: network error is retryable, never thrown', async () => {
  const p = createMetaWhatsAppProvider({ accessToken: 't', phoneNumberId: '1', graphVersion: 'v23.0', fetch: async () => { throw new Error('ECONNRESET'); } });
  const r = await p.send(loginWa());
  assert.equal(!r.ok && r.code, 'network');
  assert.equal(!r.ok && r.retryable, true);
});

test('Twilio WhatsApp: Content API template, basic auth, status callback', async () => {
  const f = fakeFetch(() => jsonResponse({ sid: 'SM1', status: 'queued' }, 201));
  const p = createTwilioProvider('whatsapp', { accountSid: 'AC1', authToken: 'secret', whatsappFrom: '+14155238886', statusCallbackUrl: 'https://x/notify/webhooks/twilio', fetch: f.fn });
  const r = await p.send(loginWa());
  assert.deepEqual(r, { ok: true, providerMessageId: 'SM1' });
  const call = f.calls[0]!;
  assert.equal(call.url, 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
  assert.equal((call.init.headers as Record<string, string>).Authorization, `Basic ${btoa('AC1:secret')}`);
  const form = new URLSearchParams(String(call.init.body));
  assert.equal(form.get('To'), 'whatsapp:+919876543210');
  assert.equal(form.get('From'), 'whatsapp:+14155238886');
  assert.equal(form.get('ContentSid'), 'HX123');
  assert.deepEqual(JSON.parse(form.get('ContentVariables') ?? '{}'), { '1': '123456' });
  assert.equal(form.get('StatusCallback'), 'https://x/notify/webhooks/twilio');
});

test('Twilio: WhatsApp without a Content SID fails clearly; SMS uses the messaging service', async () => {
  const f = fakeFetch(() => jsonResponse({ sid: 'SM2' }, 201));
  const noSid = { ...loginWa(), content: renderWhatsApp('login_otp', { otp: '1234' }, DEFAULT_CONTENT_CONFIG)! };
  const wa = await createTwilioProvider('whatsapp', { accountSid: 'AC1', authToken: 's', whatsappFrom: '+1', fetch: f.fn }).send(noSid);
  assert.equal(!wa.ok && wa.code, 'template_missing');
  const sms = await createTwilioProvider('sms', { accountSid: 'AC1', authToken: 's', messagingServiceSid: 'MG1', fetch: f.fn }).send(deliverySms());
  assert.equal(sms.ok, true);
  const form = new URLSearchParams(String(f.calls[0]?.init.body));
  assert.equal(form.get('MessagingServiceSid'), 'MG1');
  assert.match(form.get('Body') ?? '', /OTP for your OneLocal order #9830 is 4821/);
});

test('Twilio: error 63003 on WhatsApp is "not on WhatsApp"', async () => {
  const f = fakeFetch(() => jsonResponse({ code: 63003, message: 'Channel could not find To address' }, 400));
  const r = await createTwilioProvider('whatsapp', { accountSid: 'AC1', authToken: 's', whatsappFrom: '+1', fetch: f.fn }).send(loginWa());
  assert.equal(!r.ok && r.notOnWhatsApp, true);
});

test('MSG91: DLT flow with named variables', async () => {
  const f = fakeFetch(() => jsonResponse({ type: 'success', message: 'req-1' }));
  const r = await createMsg91SmsProvider({ authKey: 'key', fetch: f.fn }).send(deliverySms());
  assert.deepEqual(r, { ok: true, providerMessageId: 'req-1' });
  const call = f.calls[0]!;
  assert.equal(call.url, 'https://control.msg91.com/api/v5/flow');
  assert.equal((call.init.headers as Record<string, string>).authkey, 'key');
  assert.deepEqual(JSON.parse(String(call.init.body)), { template_id: 'flow-1', short_url: '0', recipients: [{ mobiles: '919876543210', name: 'Amit', order: '#9830', otp: '4821' }] });
  const noFlow = await createMsg91SmsProvider({ authKey: 'key', fetch: f.fn }).send({ ...deliverySms(), template: 'login_otp', content: renderSms('login_otp', { otp: '1234' }, cfg)! });
  assert.equal(!noFlow.ok && noFlow.code, 'template_missing');
});

test('Resend: email with idempotency key and tag', async () => {
  const f = fakeFetch(() => jsonResponse({ id: 'email-1' }));
  const content = renderEmail('rider_approved', { name: 'Rahul' }, cfg)!;
  const r = await createResendProvider({ apiKey: 're_x', from: 'OneLocal <no-reply@onelocal.in>', fetch: f.fn }).send({ id: 'm3', channel: 'email', to: 'rahul@example.com', template: 'rider_approved', content });
  assert.deepEqual(r, { ok: true, providerMessageId: 'email-1' });
  const call = f.calls[0]!;
  assert.equal((call.init.headers as Record<string, string>)['Idempotency-Key'], 'm3');
  const body = JSON.parse(String(call.init.body));
  assert.deepEqual(body.to, ['rahul@example.com']);
  assert.equal(body.subject, "You're approved to ride with OneLocal");
});
