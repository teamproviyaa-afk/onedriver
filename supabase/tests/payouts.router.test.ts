import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PAYLOAD_KEY, jsonResponse } from './helpers.ts';
import { loadPayoutsConfig } from '../functions/_shared/payouts/config.ts';
import { createPayoutService } from '../functions/_shared/payouts/service.ts';
import { createPayoutsHandler, createPayoutsHandlerFromEnv, routeOf } from '../functions/_shared/payouts/router.ts';
import { createMemoryPayoutStore } from '../functions/_shared/payouts/store/memory.ts';

const BASE = 'https://ref.supabase.co/functions/v1/payouts';
const ENV: Record<string, string> = {
  CASHFREE_ENV: 'sandbox',
  CASHFREE_PAYOUT_CLIENT_ID: 'CF_ID',
  CASHFREE_PAYOUT_CLIENT_SECRET: 'CF_SECRET',
  PAYOUTS_API_SECRET: 'server-secret',
  PAYOUT_PAYLOAD_KEY: PAYLOAD_KEY,
  PAYOUT_MIN_AMOUNT: '100',
  PAYOUT_MAX_AMOUNT: '5000',
  NOTIFY_URL: 'https://ref.supabase.co/functions/v1/notify',
  NOTIFY_API_SECRET: 'notify-secret',
};

/** A tiny fake of the Cashfree API, reached through the real client. */
const fakeCashfreeApi = () => {
  const transfers = new Map<string, Record<string, unknown>>();
  const seen: string[] = [];
  const fn = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    seen.push(`${init.method} ${u.host}${u.pathname}`);
    if (u.host === 'ref.supabase.co') return jsonResponse({ phone: { channel: 'whatsapp', status: 'sent' } });
    const body = init.body ? JSON.parse(String(init.body)) : {};
    switch (`${init.method} ${u.pathname}`) {
      case 'POST /verification/upi/advance':
        return jsonResponse({ status: 'VALID', vpa: body.vpa, name_at_bank: 'RAHUL SHARMA' });
      case 'POST /payout/beneficiary':
        return jsonResponse({ beneficiary_id: body.beneficiary_id, beneficiary_status: 'VERIFIED' });
      case 'POST /payout/transfers': {
        const t = { transfer_id: body.transfer_id, cf_transfer_id: 555, status: 'RECEIVED', transfer_amount: body.transfer_amount };
        transfers.set(body.transfer_id, t);
        return jsonResponse(t);
      }
      case 'GET /payout/transfers': {
        const t = transfers.get(u.searchParams.get('transfer_id') ?? '');
        return t ? jsonResponse(t) : jsonResponse({ code: 'transfer_not_found', message: 'not found' }, 404);
      }
      default:
        return jsonResponse({ code: 'not_found', message: `${init.method} ${u.pathname}` }, 404);
    }
  };
  return { fn, transfers, seen };
};

const make = () => {
  const api = fakeCashfreeApi();
  const store = createMemoryPayoutStore();
  const cfg = loadPayoutsConfig((k) => ENV[k], { store, fetch: api.fn });
  return { handler: createPayoutsHandler(cfg, createPayoutService(cfg.deps)), api, store };
};
const post = (path: string, body: unknown, headers: Record<string, string> = { 'x-payouts-secret': 'server-secret' }) =>
  new Request(`${BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('routeOf', () => {
  assert.deepEqual(routeOf('/functions/v1/payouts/riders/r1/payouts'), ['riders', 'r1', 'payouts']);
  assert.deepEqual(routeOf('/payouts/transfers'), ['transfers']);
});

test('end to end: verify UPI → withdraw → webhook SUCCESS → history, through the real client', async () => {
  const { handler, api } = make();
  assert.equal((await handler(post('accounts/verify', { riderId: 'rider-1001', riderName: 'Rahul Sharma', method: 'upi', vpa: 'rahul@ybl' }, {}))).status, 401);
  const acc = await (await handler(post('accounts/verify', { riderId: 'rider-1001', riderName: 'Rahul Sharma', method: 'upi', vpa: 'rahul@ybl' }))).json();
  assert.equal(acc.verifiedName, 'RAHUL SHARMA');

  const created = await handler(post('transfers', { riderId: 'rider-1001', amount: 750, kind: 'instant', idempotencyKey: 'w1', contact: { name: 'Rahul', phone: '9876543210' } }));
  assert.equal(created.status, 200);
  const p = await created.json();
  assert.equal(p.status, 'processing');

  const body = JSON.stringify({ type: 'TRANSFER_SUCCESS', data: { transfer_id: p.transferId, status: 'SUCCESS', transfer_utr: 'UTR42' } });
  const ts = '1759053600';
  const unsigned = await handler(post('webhooks/cashfree', body, {}));
  assert.equal(unsigned.status, 401);
  const signed = await handler(post('webhooks/cashfree', body, { 'x-webhook-signature': createHmac('sha256', 'CF_SECRET').update(ts + body).digest('base64'), 'x-webhook-timestamp': ts }));
  assert.deepEqual(await signed.json(), { result: 'updated' });

  const status = await (await handler(new Request(`${BASE}/transfers/${p.transferId}`, { headers: { 'x-payouts-secret': 'server-secret' } }))).json();
  assert.deepEqual([status.status, status.utr], ['success', 'UTR42']);
  const history = await (await handler(new Request(`${BASE}/riders/rider-1001/payouts`, { headers: { 'x-payouts-secret': 'server-secret' } }))).json();
  assert.equal(history.payouts.length, 1);
  assert.ok(api.seen.includes('POST ref.supabase.co/functions/v1/notify/send'), 'payout_sent went to the messaging function');
  assert.ok(api.seen.includes('POST sandbox.cashfree.com/payout/transfers'));
});

test('errors come back as { error: { code, message } } with the right status', async () => {
  const { handler } = make();
  const noAccount = await handler(post('transfers', { riderId: 'rider-9', amount: 500, kind: 'instant', idempotencyKey: 'x' }));
  assert.equal(noAccount.status, 409);
  assert.equal((await noAccount.json()).error.code, 'no_payout_account');
  const badJson = await handler(post('transfers', '{nope'));
  assert.equal(badJson.status, 400);
  assert.equal((await handler(new Request(`${BASE}/nope`, { headers: { 'x-payouts-secret': 'server-secret' } }))).status, 404);
  assert.deepEqual(await (await handler(new Request(`${BASE}/health`))).json(), { ok: true });
});

test('missing secrets → 500 naming them, values never echoed', async () => {
  const handler = createPayoutsHandlerFromEnv((k) => ({ CASHFREE_PAYOUT_CLIENT_SECRET: 'super-secret' })[k]);
  const r = await handler(new Request(`${BASE}/health`));
  assert.equal(r.status, 500);
  const text = await r.text();
  assert.match(text, /CASHFREE_PAYOUT_CLIENT_ID/);
  assert.match(text, /PAYOUTS_API_SECRET/);
  assert.equal(text.includes('super-secret'), false);
});
