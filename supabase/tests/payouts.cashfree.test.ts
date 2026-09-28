import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fakeFetch, jsonResponse } from './helpers.ts';
import { cashfreeSignature, createCashfreeClient, mapTransferStatus, statusFromEventType, verifyCashfreeWebhook } from '../functions/_shared/payouts/cashfree.ts';

const creds = { clientId: 'CF_ID', clientSecret: 'CF_SECRET' };

test('payout calls: sandbox/production URLs, v2 headers, bodies and queries', async () => {
  const f = fakeFetch(() => jsonResponse({ transfer_id: 'ol_1', cf_transfer_id: 99, status: 'RECEIVED' }));
  const sandbox = createCashfreeClient({ environment: 'sandbox', payout: creds, verification: creds, fetch: f.fn, newId: () => 'req-1' });
  await sandbox.createTransfer({ transfer_id: 'ol_1', transfer_amount: 500.5, transfer_currency: 'INR', transfer_mode: 'upi', beneficiary_details: { beneficiary_id: 'b1' }, transfer_remarks: 'OneLocal withdrawal' });
  const c = f.calls[0]!;
  assert.equal(c.url, 'https://sandbox.cashfree.com/payout/transfers');
  assert.equal(c.init.method, 'POST');
  const h = c.init.headers as Record<string, string>;
  assert.equal(h['x-client-id'], 'CF_ID');
  assert.equal(h['x-client-secret'], 'CF_SECRET');
  assert.equal(h['x-api-version'], '2024-01-01');
  assert.equal(h['x-request-id'], 'req-1');
  assert.equal(h['x-cf-signature'], undefined, 'no signature without a public key');
  assert.deepEqual(JSON.parse(String(c.init.body)), { transfer_id: 'ol_1', transfer_amount: 500.5, transfer_currency: 'INR', transfer_mode: 'upi', beneficiary_details: { beneficiary_id: 'b1' }, transfer_remarks: 'OneLocal withdrawal' });

  const prod = createCashfreeClient({ environment: 'production', payout: creds, verification: creds, fetch: f.fn });
  await prod.getTransfer('ol_1');
  assert.equal(f.calls[1]!.url, 'https://api.cashfree.com/payout/transfers?transfer_id=ol_1');
  assert.equal(f.calls[1]!.init.method, 'GET');
  await prod.createBeneficiary({ beneficiary_id: 'b1', beneficiary_name: 'RAHUL SHARMA', beneficiary_instrument_details: { vpa: 'rahul@ybl' } });
  assert.equal(f.calls[2]!.url, 'https://api.cashfree.com/payout/beneficiary');
  await prod.verifyBankAccount({ bank_account: '123456789012', ifsc: 'HDFC0001234', name: 'Rahul' });
  assert.equal(f.calls[3]!.url, 'https://api.cashfree.com/verification/bank-account/sync');
  assert.equal((f.calls[3]!.init.headers as Record<string, string>)['x-api-version'], '2023-12-18');
  await prod.verifyUpi({ vpa: 'rahul@ybl' });
  assert.equal(f.calls[4]!.url, 'https://api.cashfree.com/verification/upi/advance');
});

test('x-cf-signature: RSA-OAEP(SHA-1) of "<clientId>.<unix seconds>", decryptable with the private key', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-1' }, true, ['encrypt', 'decrypt']);
  const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
  const pem = `-----BEGIN PUBLIC KEY-----\\n${spki.match(/.{1,64}/g)!.join('\\n')}\\n-----END PUBLIC KEY-----`; // escaped newlines, as stored in a secret
  const f = fakeFetch(() => jsonResponse({}));
  const client = createCashfreeClient({ environment: 'sandbox', payout: { ...creds, publicKeyPem: pem }, verification: creds, fetch: f.fn, now: () => 1_700_000_000_123 });
  await client.getTransfer('x');
  const sig = (f.calls[0]!.init.headers as Record<string, string>)['x-cf-signature']!;
  const plain = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, pair.privateKey, Buffer.from(sig, 'base64')));
  assert.equal(plain, 'CF_ID.1700000000');
  assert.notEqual(await cashfreeSignature('CF_ID', pem, 1), await cashfreeSignature('CF_ID', pem, 1), 'OAEP is randomised');
});

test('errors are returned, never thrown', async () => {
  const bad = createCashfreeClient({ environment: 'sandbox', payout: creds, verification: creds, fetch: fakeFetch(() => jsonResponse({ type: 'invalid_request_error', code: 'insufficient_balance', message: 'Not enough balance' }, 400)).fn });
  assert.deepEqual(await bad.createTransfer({ transfer_id: 'x', transfer_amount: 1, transfer_currency: 'INR', transfer_mode: 'imps', beneficiary_details: { beneficiary_id: 'b' } }), {
    ok: false,
    status: 400,
    code: 'insufficient_balance',
    message: 'Not enough balance',
    data: { type: 'invalid_request_error', code: 'insufficient_balance', message: 'Not enough balance' },
  });
  const down = createCashfreeClient({ environment: 'sandbox', payout: creds, verification: creds, fetch: async () => { throw new Error('ECONNRESET'); } });
  const r = await down.getTransfer('x');
  assert.equal(!r.ok && r.code, 'network');
  assert.equal(r.status, 0);
});

test('webhook signature = base64 HMAC-SHA256(secret, timestamp + raw body)', async () => {
  const body = '{"type":"TRANSFER_SUCCESS","data":{"transfer_id":"ol_1"}}';
  const ts = '1700000000';
  const sig = createHmac('sha256', 'CF_SECRET').update(ts + body).digest('base64');
  assert.equal(await verifyCashfreeWebhook(body, sig, ts, 'CF_SECRET'), true);
  assert.equal(await verifyCashfreeWebhook(body, sig, '1700000001', 'CF_SECRET'), false);
  assert.equal(await verifyCashfreeWebhook(body + ' ', sig, ts, 'CF_SECRET'), false);
  assert.equal(await verifyCashfreeWebhook(body, null, ts, 'CF_SECRET'), false);
});

test('status mapping', () => {
  assert.equal(mapTransferStatus('SUCCESS'), 'success');
  for (const s of ['FAILED', 'REJECTED', 'MANUALLY_REJECTED']) assert.equal(mapTransferStatus(s), 'failed');
  assert.equal(mapTransferStatus('REVERSED'), 'reversed');
  for (const s of ['RECEIVED', 'PENDING', 'QUEUED', 'APPROVAL_PENDING', undefined]) assert.equal(mapTransferStatus(s), 'processing');
  assert.equal(statusFromEventType('TRANSFER_REVERSED'), 'REVERSED');
  assert.equal(statusFromEventType('LOW_BALANCE_ALERT'), undefined);
});
