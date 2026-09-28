import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PAYLOAD_KEY } from './helpers.ts';
import { loadNotifyConfig } from '../functions/_shared/messaging/config.ts';
import { createMessenger } from '../functions/_shared/messaging/orchestrator.ts';
import { createNotifyHandler, createNotifyHandlerFromEnv, routeOf } from '../functions/_shared/messaging/router.ts';
import { createMemoryStore } from '../functions/_shared/messaging/store/memory.ts';
import type { MockProvider } from '../functions/_shared/messaging/providers/mock.ts';

const BASE = 'https://ref.supabase.co/functions/v1/notify';
const HOOK_SECRET = 'v1,whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const ENV: Record<string, string> = {
  MESSAGE_HASH_PEPPER: 'pepper',
  MESSAGE_PAYLOAD_KEY: PAYLOAD_KEY,
  NOTIFY_API_SECRET: 'server-secret',
  NOTIFY_PUBLIC_URL: BASE,
  WHATSAPP_PROVIDER: 'mock',
  SMS_PROVIDER: 'mock',
  EMAIL_PROVIDER: 'mock',
  MOCK_NO_WHATSAPP: '9000000001',
  META_APP_SECRET: 'app-secret',
  META_WEBHOOK_VERIFY_TOKEN: 'verify-me',
  TWILIO_AUTH_TOKEN: 'twilio-token',
  SEND_SMS_HOOK_SECRET: HOOK_SECRET,
};

const make = () => {
  const store = createMemoryStore();
  const cfg = loadNotifyConfig((k) => ENV[k], { store });
  const messenger = createMessenger(cfg.deps);
  const handler = createNotifyHandler(cfg, messenger, { nowSeconds: () => 1_700_000_000 });
  return { handler, store, whatsapp: cfg.deps.whatsapp as MockProvider, sms: cfg.deps.sms as MockProvider };
};

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const delivery = { template: 'delivery_otp', to: { phone: '9876543210' }, params: { name: 'Amit', order: '#9830', otp: '4821' } };

test('routeOf handles local and hosted paths', () => {
  assert.equal(routeOf('/notify/send'), 'send');
  assert.equal(routeOf('/functions/v1/notify/webhooks/meta'), 'webhooks/meta');
});

test('/send requires the server secret', async () => {
  const { handler } = make();
  assert.equal((await handler(post('send', delivery))).status, 401);
  assert.equal((await handler(post('send', delivery, { 'x-notify-secret': 'wrong' }))).status, 401);
  const ok = await handler(post('send', delivery, { 'x-notify-secret': 'server-secret' }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.phone.channel, 'whatsapp');
});

test('/send: number without WhatsApp comes back as SMS fallback; validation is a 400', async () => {
  const { handler, sms } = make();
  const r = await handler(post('send', { ...delivery, to: { phone: '9000000001' } }, { authorization: 'Bearer server-secret' }));
  const body = await r.json();
  assert.equal(body.phone.channel, 'sms');
  assert.equal(body.phone.fallbackReason, 'no_whatsapp');
  assert.equal(sms.sent.length, 1);
  const bad = await handler(post('send', { ...delivery, to: { phone: '123' } }, { 'x-notify-secret': 'server-secret' }));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'validation');
});

test('Meta webhook: verification challenge and signed status → SMS fallback', async () => {
  const { handler, store, sms } = make();
  const ch = await handler(new Request(`${BASE}/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42`));
  assert.equal(await ch.text(), '42');
  assert.equal((await handler(new Request(`${BASE}/webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`))).status, 403);

  await handler(post('send', delivery, { 'x-notify-secret': 'server-secret' }));
  const pid = [...store.records.values()].find((r) => r.channel === 'whatsapp')?.providerMessageId;
  // The mock provider stands in for Meta here; statuses are looked up by (provider, id).
  for (const r of store.records.values()) store.records.set(r.id, { ...r, provider: 'meta' });
  const payload = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: pid, status: 'failed', errors: [{ code: 131026 }] }] } }] }] });
  const unsigned = await handler(post('webhooks/meta', payload));
  assert.equal(unsigned.status, 401);
  const sig = `sha256=${createHmac('sha256', 'app-secret').update(payload).digest('hex')}`;
  const res = await handler(post('webhooks/meta', payload, { 'x-hub-signature-256': sig }));
  assert.deepEqual(await res.json(), { received: 1, applied: 1 });
  assert.equal(sms.sent.length, 1);
});

test('Twilio status callback is signature-checked', async () => {
  const { handler } = make();
  const params = { MessageSid: 'SMx', MessageStatus: 'delivered' };
  const form = new URLSearchParams(params).toString();
  const req = (sig: string) => new Request(`${BASE}/webhooks/twilio`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }, body: form });
  assert.equal((await handler(req('bad'))).status, 401);
  const sig = createHmac('sha1', 'twilio-token').update(`${BASE}/webhooks/twilio` + 'MessageSidSMx' + 'MessageStatusdelivered').digest('base64');
  assert.equal((await handler(req(sig))).status, 204);
});

test('Supabase Auth send-SMS hook sends the login OTP (WhatsApp first)', async () => {
  const { handler, whatsapp } = make();
  const body = JSON.stringify({ user: { id: 'u-1', phone: '919876543210' }, sms: { otp: '123456' } });
  const id = 'msg_1';
  const ts = '1700000000';
  const signature = createHmac('sha256', Buffer.from('MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  const bad = await handler(post('hooks/send-sms', body, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': 'v1,nope' }));
  assert.equal(bad.status, 401);
  const ok = await handler(post('hooks/send-sms', body, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${signature}` }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), {});
  const sent = whatsapp.sent[0];
  assert.equal(sent?.template, 'login_otp');
  assert.equal(sent?.to, '+919876543210');
  assert.equal(sent?.content.kind === 'whatsapp' ? sent.content.otpButtonParam : null, '123456');
});

test('unknown route 404; health hides providers without the secret', async () => {
  const { handler } = make();
  assert.equal((await handler(new Request(`${BASE}/nope`))).status, 404);
  assert.deepEqual(await (await handler(new Request(`${BASE}/health`))).json(), { ok: true });
  const detailed = await (await handler(new Request(`${BASE}/health`, { headers: { 'x-notify-secret': 'server-secret' } }))).json();
  assert.deepEqual(detailed.providers, { whatsapp: 'mock', sms: 'mock', email: 'mock' });
});

test('missing secrets → 500 "unconfigured" naming them (values never echoed)', async () => {
  const handler = createNotifyHandlerFromEnv((k) => ({ WHATSAPP_PROVIDER: 'meta', META_WA_ACCESS_TOKEN: 'secret-token' })[k]);
  const r = await handler(new Request(`${BASE}/health`));
  assert.equal(r.status, 500);
  const text = await r.text();
  assert.match(text, /MESSAGE_HASH_PEPPER/);
  assert.match(text, /META_WA_PHONE_NUMBER_ID/);
  assert.equal(text.includes('secret-token'), false);
});
