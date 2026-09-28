import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseMetaWebhook, parseTwilioStatus, verifyMetaSignature, verifyStandardWebhook, verifyTwilioSignature } from '../functions/_shared/messaging/webhooks.ts';

test('Meta signature: matches an independent HMAC, rejects tampering', async () => {
  const body = '{"entry":[]}';
  const sig = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
  assert.equal(await verifyMetaSignature(body, sig, 'app-secret'), true);
  assert.equal(await verifyMetaSignature(`${body} `, sig, 'app-secret'), false);
  assert.equal(await verifyMetaSignature(body, sig, 'other'), false);
  assert.equal(await verifyMetaSignature(body, null, 'app-secret'), false);
});

test('Meta webhook: delivered + failed(131026) statuses', () => {
  const updates = parseMetaWebhook({
    entry: [{ changes: [{ value: { statuses: [
      { id: 'wamid.1', status: 'delivered' },
      { id: 'wamid.2', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] },
      { id: 'wamid.3', status: 'deleted' },
    ] } }] }],
  });
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0], { provider: 'meta', providerMessageId: 'wamid.1', status: 'delivered', errorCode: undefined, errorMessage: undefined, notOnWhatsApp: false });
  assert.equal(updates[1]?.notOnWhatsApp, true);
  assert.equal(updates[1]?.errorCode, '131026');
});

test('Twilio signature: URL + sorted params, HMAC-SHA1', async () => {
  const url = 'https://ref.supabase.co/functions/v1/notify/webhooks/twilio';
  const params = { MessageSid: 'SM1', MessageStatus: 'undelivered', ErrorCode: '63003', To: 'whatsapp:+919876543210' };
  const data = url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join('');
  const sig = createHmac('sha1', 'auth-token').update(data).digest('base64');
  assert.equal(await verifyTwilioSignature(url, params, sig, 'auth-token'), true);
  assert.equal(await verifyTwilioSignature(url, { ...params, ErrorCode: '0' }, sig, 'auth-token'), false);
  const u = parseTwilioStatus(params);
  assert.equal(u?.status, 'failed');
  assert.equal(u?.notOnWhatsApp, true);
  assert.equal(parseTwilioStatus({ MessageSid: 'SM2', MessageStatus: 'delivered', To: '+919876543210' })?.status, 'delivered');
});

test('Standard Webhooks (Supabase Auth hook): reference vector, tolerance, tampering', async () => {
  // Reference example from the Standard Webhooks specification.
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
  const ts = '1614265330';
  const body = '{"test": 2432232314}';
  const expected = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  assert.equal(expected, 'g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  const headers = { id, timestamp: ts, signature: `v1,${expected}` };
  assert.equal(await verifyStandardWebhook(body, headers, secret, 1614265330), true);
  assert.equal(await verifyStandardWebhook(body, headers, `v1,${secret}`, 1614265330), true, 'dashboard format v1,whsec_…');
  assert.equal(await verifyStandardWebhook(body, { ...headers, signature: `v1,bogus v1,${expected}` }, secret, 1614265330), true, 'any listed signature');
  assert.equal(await verifyStandardWebhook(body, headers, secret, 1614265330 + 301), false, 'too old');
  assert.equal(await verifyStandardWebhook('{"test": 1}', headers, secret, 1614265330), false);
});
