import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, maskPhone, normalizeEmail, normalizePhone } from '../functions/_shared/messaging/phone.ts';
import { decryptJson, encryptJson, hashIdentifier } from '../functions/_shared/messaging/crypto.ts';
import { DEFAULT_CONTENT_CONFIG, TEMPLATES, renderEmail, renderSms, validateParams } from '../functions/_shared/messaging/templates.ts';
import { PAYLOAD_KEY } from './helpers.ts';

test('phone normalisation (India first) and masking', () => {
  for (const v of ['9876543210', '09876543210', '919876543210', '+91 98765 43210', '+91-98765-43210']) assert.equal(normalizePhone(v), '+919876543210', v);
  assert.equal(normalizePhone('5876543210'), null, 'Indian mobiles start 6-9');
  assert.equal(normalizePhone('+14155550100'), '+14155550100');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(maskPhone('+919876543210'), '+91 ******3210');
  assert.equal(normalizeEmail(' Rahul@Example.COM '), 'rahul@example.com');
  assert.equal(normalizeEmail('nope'), null);
  assert.equal(maskEmail('rahul@example.com'), 'r***@example.com');
});

test('payload encryption round-trip; wrong key fails; hashes are stable and peppered', async () => {
  const enc = await encryptJson(PAYLOAD_KEY, { to: '+919876543210', params: { otp: '4821' } });
  assert.equal(enc.includes('4821'), false);
  assert.deepEqual(await decryptJson(PAYLOAD_KEY, enc), { to: '+919876543210', params: { otp: '4821' } });
  await assert.rejects(decryptJson(Buffer.from('x'.repeat(32)).toString('base64'), enc));
  await assert.rejects(encryptJson(Buffer.from('short').toString('base64'), {}), /32 bytes/);
  assert.equal(await hashIdentifier('p', 'a'), await hashIdentifier('p', 'a'));
  assert.notEqual(await hashIdentifier('p', 'a'), await hashIdentifier('q', 'a'));
});

test('templates: every phone template has SMS text; params are cleaned', () => {
  for (const def of Object.values(TEMPLATES)) {
    if (def.policy !== 'none') assert.ok(def.sms, `${def.id} needs SMS text for the fallback`);
    if (def.email === 'also') assert.ok(def.emailContent, `${def.id} needs email content`);
  }
  assert.deepEqual(validateParams('order_delivered', { name: ' Amit\n Kumar ', order: '#9830', time: '4:42 PM' }), { name: 'Amit Kumar', order: '#9830', time: '4:42 PM' });
  assert.throws(() => validateParams('weekly_statement', { name: 'a', period: 'b', amount: '1', url: 'http://insecure' }), /https/);
  assert.match(renderSms('login_otp', { otp: '123456' }, DEFAULT_CONTENT_CONFIG)!.text, /^123456 is your OneLocal Rider login OTP/);
});

test('email HTML escapes user-provided values', () => {
  const e = renderEmail('order_delivered', { name: '<script>x</script>', order: '#1', time: 'now' }, DEFAULT_CONTENT_CONFIG)!;
  assert.equal(e.html.includes('<script>'), false);
  assert.ok(e.html.includes('&lt;script&gt;'));
  assert.ok(e.text.includes('<script>x</script>'), 'plain text part is not HTML');
});
