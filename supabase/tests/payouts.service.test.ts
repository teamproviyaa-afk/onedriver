import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PAYLOAD_KEY, START } from './helpers.ts';
import { createPayoutService } from '../functions/_shared/payouts/service.ts';
import { createMemoryPayoutStore } from '../functions/_shared/payouts/store/memory.ts';
import { matchNames } from '../functions/_shared/payouts/names.ts';
import type { CashfreeClient, CfResult, CfTransfer } from '../functions/_shared/payouts/cashfree.ts';
import { PayoutError } from '../functions/_shared/payouts/types.ts';

const SECRET = 'CF_SECRET';

const fakeCashfree = () => {
  const remote = new Map<string, CfTransfer>();
  const calls = { transfers: [] as { transfer_id: string; transfer_amount: number; transfer_mode: string; beneficiary_details: { beneficiary_id: string } }[], beneficiaries: [] as unknown[], getTransfer: 0 };
  let onTransfer: (id: string) => CfResult<CfTransfer> = (id) => ({ ok: true, status: 200, data: { transfer_id: id, cf_transfer_id: 777, status: 'RECEIVED' } });
  let bank: CfResult<Record<string, unknown>> = { ok: true, status: 200, data: { account_status: 'VALID', name_at_bank: 'RAHUL KUMAR SHARMA', bank_name: 'HDFC BANK', name_match_result: 'GOOD_PARTIAL_MATCH' } };
  let upi: CfResult<Record<string, unknown>> = { ok: true, status: 200, data: { status: 'VALID', name_at_bank: 'RAHUL SHARMA', vpa: 'rahul.sharma@ybl' } };
  const client: CashfreeClient = {
    async verifyBankAccount() { return bank as never; },
    async verifyUpi() { return upi as never; },
    async createBeneficiary(req) { calls.beneficiaries.push(req); return { ok: true, status: 200, data: { beneficiary_id: req.beneficiary_id, beneficiary_status: 'VERIFIED' } }; },
    async getBeneficiary(id) { return { ok: true, status: 200, data: { beneficiary_id: id } }; },
    async createTransfer(req) {
      calls.transfers.push(req);
      const r = onTransfer(req.transfer_id);
      if (r.ok) remote.set(req.transfer_id, r.data);
      return r;
    },
    async getTransfer(id) {
      calls.getTransfer += 1;
      const d = remote.get(id);
      return d ? { ok: true, status: 200, data: d } : { ok: false, status: 404, code: 'transfer_not_found', message: 'Transfer not found' };
    },
  };
  return {
    client, calls, remote,
    setTransfer: (fn: typeof onTransfer) => { onTransfer = fn; },
    setBank: (r: typeof bank) => { bank = r; },
    setUpi: (r: typeof upi) => { upi = r; },
  };
};

const setup = () => {
  let t = START;
  let n = 0;
  const store = createMemoryPayoutStore();
  const cf = fakeCashfree();
  const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const service = createPayoutService({
    store,
    cashfree: cf.client,
    webhookSecret: SECRET,
    payloadKey: PAYLOAD_KEY,
    limits: { minAmountPaise: 100_00, maxAmountPaise: 5_000_00 },
    notify: { url: 'https://ref.supabase.co/functions/v1/notify', secret: 'notify-secret' },
    statusCallback: { url: 'https://onelocal.example/api/payouts/callback', secret: 'payouts-secret' },
    fetch: async (url, init) => {
      sent.push({ url, body: JSON.parse(String(init?.body ?? '{}')), headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response('{}', { status: 200 });
    },
    now: () => new Date(t),
    newId: () => `id-${++n}`,
  });
  return { service, store, cf, sent, advance: (s: number) => { t += s * 1000; } };
};

const webhook = async (service: ReturnType<typeof setup>['service'], data: Record<string, unknown>, type = 'TRANSFER_SUCCESS') => {
  const body = JSON.stringify({ type, event_time: '2026-09-28T10:00:00', data });
  const ts = '1759053600';
  return service.handleWebhook(body, { signature: createHmac('sha256', SECRET).update(ts + body).digest('base64'), timestamp: ts });
};

const rahul = { riderId: 'rider-1001', riderName: 'Rahul Sharma', phone: '9876543210' };
const contact = { name: 'Rahul Sharma', phone: '9876543210', email: 'rahul@example.com' };

test('name matching', () => {
  assert.equal(matchNames('Rahul Sharma', 'RAHUL KUMAR SHARMA').result, 'good');
  assert.equal(matchNames('Mr. Rahul Sharma', 'RAHUL SHARMA').result, 'good');
  assert.equal(matchNames('R Sharma', 'RAHUL SHARMA').result, 'good');
  assert.equal(matchNames('Rahul Sharma', 'RAHUL VERMA').result, 'partial');
  assert.equal(matchNames('Rahul Sharma', 'AMIT PATIL').result, 'poor');
});

test('bank account: verified name, Cashfree beneficiary, primary account — no full number returned', async () => {
  const s = setup();
  const view = await s.service.verifyAccount({ ...rahul, method: 'bank', accountNumber: '1234 5678 9012', ifsc: 'hdfc0001234' });
  assert.deepEqual(
    { method: view.method, last4: view.accountLast4, ifsc: view.ifsc, name: view.verifiedName, match: view.nameMatch, bank: view.bankName, provider: view.provider },
    { method: 'bank', last4: '9012', ifsc: 'HDFC0001234', name: 'RAHUL KUMAR SHARMA', match: 'good', bank: 'HDFC BANK', provider: 'cashfree' },
  );
  const b = s.cf.calls.beneficiaries[0] as { beneficiary_id: string; beneficiary_name: string; beneficiary_instrument_details: unknown; beneficiary_contact_details: unknown };
  assert.match(b.beneficiary_id, /^ol_rider1001_bank_[0-9a-f]{10}$/);
  assert.ok(b.beneficiary_id.length <= 50);
  assert.deepEqual(b.beneficiary_instrument_details, { bank_account_number: '123456789012', bank_ifsc: 'HDFC0001234' });
  assert.deepEqual(b.beneficiary_contact_details, { beneficiary_phone: '9876543210', beneficiary_country_code: '+91' });
  assert.equal((await s.store.getPrimaryAccount('rider-1001'))?.id, view.id);
});

test('UPI: masked VPA in the answer; switching accounts moves the primary', async () => {
  const s = setup();
  const bank = await s.service.verifyAccount({ ...rahul, method: 'bank', accountNumber: '123456789012', ifsc: 'HDFC0001234' });
  const upi = await s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'Rahul.Sharma@YBL' });
  assert.equal(upi.vpa, 'ra******@ybl');
  assert.equal(upi.verifiedName, 'RAHUL SHARMA');
  assert.equal((await s.store.getPrimaryAccount('rider-1001'))?.id, upi.id);
  assert.equal((await s.store.getAccount(bank.id))?.isPrimary, false);
});

test('invalid account, name mismatch, provider down, bad input', async () => {
  const s = setup();
  s.cf.setBank({ ok: true, status: 200, data: { account_status: 'INVALID', account_status_code: 'INVALID_ACCOUNT_FAIL' } });
  await assert.rejects(s.service.verifyAccount({ ...rahul, method: 'bank', accountNumber: '123456789012', ifsc: 'HDFC0001234' }), (e: unknown) => e instanceof PayoutError && e.code === 'account_invalid' && e.status === 422);
  s.cf.setUpi({ ok: true, status: 200, data: { status: 'VALID', name_at_bank: 'AMIT PATIL' } });
  await assert.rejects(s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'amit@okaxis' }), (e: unknown) => e instanceof PayoutError && e.code === 'name_mismatch' && (e.meta as { nameAtBank: string }).nameAtBank === 'AMIT PATIL');
  s.cf.setUpi({ ok: false, status: 0, code: 'network', message: 'down' });
  await assert.rejects(s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'rahul@ybl' }), (e: unknown) => e instanceof PayoutError && e.code === 'provider_error');
  await assert.rejects(s.service.verifyAccount({ ...rahul, method: 'bank', accountNumber: '12', ifsc: 'HDFC0001234' }), /valid bank account/);
  await assert.rejects(s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'not-a-vpa' }), /valid UPI ID/);
  assert.equal(s.cf.calls.beneficiaries.length, 0, 'nothing registered for rejected accounts');
});

test('payout: recorded before Cashfree, deterministic transfer id, success webhook → UTR, one message, contact deleted, signed callback', async () => {
  const s = setup();
  await s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'rahul.sharma@ybl' });
  const p = await s.service.createPayout({ riderId: 'rider-1001', amount: 500.5, kind: 'instant', idempotencyKey: 'withdraw-1', contact });
  assert.equal(p.status, 'processing');
  assert.equal(p.amount, 500.5);
  assert.equal(p.destination, 'UPI ra******@ybl');
  assert.match(p.transferId, /^ol_[0-9a-f]{32}$/);
  assert.ok(p.transferId.length <= 40);
  const req = s.cf.calls.transfers[0]!;
  assert.equal(req.transfer_amount, 500.5);
  assert.equal(req.transfer_mode, 'upi');
  assert.match(req.beneficiary_details.beneficiary_id, /^ol_rider1001_upi_/);

  assert.equal(await webhook(s.service, { transfer_id: p.transferId, cf_transfer_id: 777, status: 'SUCCESS', transfer_utr: 'UTR123456' }), 'updated');
  const done = await s.service.getPayout(p.transferId);
  assert.deepEqual([done.status, done.utr], ['success', 'UTR123456']);
  const notify = s.sent.filter((x) => x.url.endsWith('/notify/send'));
  assert.equal(notify.length, 1);
  assert.deepEqual(notify[0]!.body.params, { name: 'Rahul Sharma', amount: '500.50', period: 'your withdrawal' });
  assert.equal(notify[0]!.headers['x-notify-secret'], 'notify-secret');
  assert.equal((await s.store.getPayoutByTransferId(p.transferId))?.contactEnc, null);
  const cb = s.sent.find((x) => x.url.includes('/callback'))!;
  assert.equal(cb.headers['x-onelocal-signature'], createHmac('sha256', 'payouts-secret').update(JSON.stringify(cb.body)).digest('hex'));
  assert.equal(await webhook(s.service, { transfer_id: p.transferId, status: 'SUCCESS' }), 'ignored', 'duplicate webhook');
  assert.equal(s.sent.filter((x) => x.url.endsWith('/notify/send')).length, 1, 'never messaged twice');
});

test('the same idempotency key can never pay twice', async () => {
  const s = setup();
  await s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'rahul@ybl' });
  const a = await s.service.createPayout({ riderId: 'rider-1001', amount: 300, kind: 'instant', idempotencyKey: 'k1' });
  const b = await s.service.createPayout({ riderId: 'rider-1001', amount: 300, kind: 'instant', idempotencyKey: 'k1' });
  assert.equal(a.transferId, b.transferId);
  assert.equal(s.cf.calls.transfers.length, 1);
  await s.service.createPayout({ riderId: 'rider-1001', amount: 300, kind: 'instant', idempotencyKey: 'k2' });
  assert.equal(s.cf.calls.transfers.length, 2);
});

test('unknown outcome (network) is reconciled, never re-sent', async () => {
  const s = setup();
  await s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'rahul@ybl' });
  s.cf.setTransfer(() => ({ ok: false, status: 0, code: 'network', message: 'timeout' }));
  const p = await s.service.createPayout({ riderId: 'rider-1001', amount: 1000, kind: 'weekly', idempotencyKey: 'week-39', periodLabel: '21-27 Sep', contact });
  assert.equal(p.status, 'processing');
  assert.equal((await s.store.getPayoutByTransferId(p.transferId))?.status, 'unknown');
  // Retrying the same request does not call Cashfree again.
  await s.service.createPayout({ riderId: 'rider-1001', amount: 1000, kind: 'weekly', idempotencyKey: 'week-39' });
  assert.equal(s.cf.calls.transfers.length, 1);
  // It had actually reached Cashfree and succeeded.
  s.cf.remote.set(p.transferId, { transfer_id: p.transferId, status: 'SUCCESS', transfer_utr: 'UTR999' });
  s.advance(30);
  assert.deepEqual(await s.service.sweep(), { checked: 0, updated: 0 }, 'too early');
  s.advance(40);
  assert.deepEqual(await s.service.sweep(), { checked: 1, updated: 1 });
  assert.equal((await s.service.getPayout(p.transferId)).utr, 'UTR999');
  const msg = s.sent.find((x) => x.url.endsWith('/notify/send'))!;
  assert.deepEqual(msg.body.params, { name: 'Rahul Sharma', amount: '1,000.00', period: '21-27 Sep' });
});

test('unknown outcome and Cashfree has no record after 30 min → failed, nothing was sent', async () => {
  const s = setup();
  await s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'rahul@ybl' });
  s.cf.setTransfer(() => ({ ok: false, status: 503, code: 'http_503', message: 'unavailable' }));
  const p = await s.service.createPayout({ riderId: 'rider-1001', amount: 200, kind: 'instant', idempotencyKey: 'k' });
  s.advance(120);
  assert.deepEqual(await s.service.sweep(), { checked: 1, updated: 0 }, 'still waiting');
  s.advance(31 * 60);
  await s.service.sweep();
  const v = await s.service.getPayout(p.transferId);
  assert.equal(v.status, 'failed');
  assert.match(v.statusDescription ?? '', /Nothing was sent/);
});

test('definite rejection, reversal after success, late success after failure', async () => {
  const s = setup();
  await s.service.verifyAccount({ ...rahul, method: 'bank', accountNumber: '123456789012', ifsc: 'HDFC0001234' });
  s.cf.setTransfer(() => ({ ok: false, status: 400, code: 'insufficient_balance', message: 'Insufficient balance in account' }));
  const rejected = await s.service.createPayout({ riderId: 'rider-1001', amount: 400, kind: 'instant', idempotencyKey: 'r1', contact });
  assert.deepEqual([rejected.status, rejected.statusDescription], ['failed', 'Insufficient balance in account']);
  assert.equal(await webhook(s.service, { transfer_id: rejected.transferId, status: 'SUCCESS' }), 'ignored', 'failed is final');
  assert.equal((await s.store.getPayoutByTransferId(rejected.transferId))?.contactEnc, null, 'contact deleted on failure');
  assert.equal(s.sent.filter((x) => x.url.endsWith('/notify/send')).length, 0);

  s.cf.setTransfer((id) => ({ ok: true, status: 200, data: { transfer_id: id, status: 'SUCCESS', transfer_utr: 'U1' } }));
  const ok = await s.service.createPayout({ riderId: 'rider-1001', amount: 400, kind: 'instant', idempotencyKey: 'r2', contact });
  assert.equal(ok.status, 'success');
  assert.equal(ok.mode, 'imps');
  assert.equal(await webhook(s.service, { transfer_id: ok.transferId, status: 'REVERSED' }, 'TRANSFER_REVERSED'), 'updated');
  assert.equal((await s.service.getPayout(ok.transferId)).status, 'reversed');
});

test('limits, missing account, bad webhook signature, unknown transfer', async () => {
  const s = setup();
  await assert.rejects(s.service.createPayout({ riderId: 'rider-1001', amount: 500, kind: 'instant', idempotencyKey: 'x' }), (e: unknown) => e instanceof PayoutError && e.code === 'no_payout_account');
  await s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'rahul@ybl' });
  await assert.rejects(s.service.createPayout({ riderId: 'rider-1001', amount: 99, kind: 'instant', idempotencyKey: 'x' }), /Minimum payout is Rs 100.00/);
  await assert.rejects(s.service.createPayout({ riderId: 'rider-1001', amount: 5000.01, kind: 'instant', idempotencyKey: 'x' }), /Maximum payout is Rs 5,000.00/);
  await assert.rejects(s.service.createPayout({ riderId: 'rider-1001', amount: 100.001, kind: 'instant', idempotencyKey: 'x' }), /2 decimals/);
  await assert.rejects(s.service.createPayout({ riderId: 'rider-1001', amount: 100, kind: 'instant', idempotencyKey: '' }), /idempotencyKey/);
  await assert.rejects(s.service.handleWebhook('{"type":"TRANSFER_SUCCESS"}', { signature: 'nope', timestamp: '1' }), (e: unknown) => e instanceof PayoutError && e.status === 401);
  assert.equal(await webhook(s.service, { transfer_id: 'ol_unknown', status: 'SUCCESS' }), 'unknown');
  assert.equal(await webhook(s.service, { beneficiary_id: 'b' }, 'LOW_BALANCE_ALERT'), 'ignored');
});

test('privacy: stored data never holds the account number, VPA, phone or email in clear text', async () => {
  const s = setup();
  await s.service.verifyAccount({ ...rahul, method: 'bank', accountNumber: '123456789012', ifsc: 'HDFC0001234', email: 'rahul@example.com' });
  await s.service.verifyAccount({ ...rahul, method: 'upi', vpa: 'rahul.sharma@ybl' });
  await s.service.createPayout({ riderId: 'rider-1001', amount: 250, kind: 'instant', idempotencyKey: 'p', contact });
  const dump = JSON.stringify({ accounts: [...s.store.accounts.values()], payouts: [...s.store.payouts.values()] });
  for (const secret of ['123456789012', 'rahul.sharma@ybl', '9876543210', 'rahul@example.com']) assert.equal(dump.includes(secret), false, `leaked ${secret}`);
});
