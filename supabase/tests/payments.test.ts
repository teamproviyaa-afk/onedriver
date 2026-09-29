import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { jsonResponse } from './helpers.ts';
import { cashfreePhone, createCashfreePgClient, environmentOfSecretKey, mapLinkStatus, pgBaseUrl, toPaise } from '../functions/_shared/payments/cashfreePg.ts';
import { loadPaymentsConfig } from '../functions/_shared/payments/config.ts';
import { createPaymentsHandler, createPaymentsHandlerFromEnv, routeOf } from '../functions/_shared/payments/router.ts';
import { createPaymentsService } from '../functions/_shared/payments/service.ts';
import { createMemoryDepositStore } from '../functions/_shared/payments/store/memory.ts';
import { createSupabaseDepositStore } from '../functions/_shared/payments/store/supabaseRest.ts';
import { PaymentError } from '../functions/_shared/payments/types.ts';

const SECRET = 'cfsk_ma_test_0123456789abcdef_fake';
const FN = 'https://ref.supabase.co/functions/v1/payments';
const START = Date.parse('2026-09-29T10:00:00.000Z');

/** A small fake of Cashfree PG (payment links, orders, payments). */
const fakePg = (opts: { failCreate?: 'network' | 'network-after-create' | 'reject' } = {}) => {
  const links = new Map<string, Record<string, unknown>>();
  const orders = new Map<string, Record<string, unknown>[]>();
  const payments = new Map<string, Record<string, unknown>[]>();
  const calls: { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  let failCreate = opts.failCreate;
  const fn = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ method: String(init.method), path: u.pathname, headers: (init.headers ?? {}) as Record<string, string>, body });
    if (u.host === 'onelocal.example') return jsonResponse({ ok: true });
    const p = u.pathname.replace(/^\/pg/, '');
    let m: RegExpMatchArray | null;
    if (init.method === 'POST' && p === '/links') {
      const id = String(body.link_id);
      if (links.has(id)) return jsonResponse({ code: 'link_post_failed', message: 'link_id already exists', type: 'invalid_request_error' }, 409);
      if (failCreate === 'reject') return jsonResponse({ code: 'customer_phone_invalid', message: 'customer_details.customer_phone : invalid', type: 'invalid_request_error' }, 400);
      if (failCreate === 'network') {
        failCreate = undefined;
        throw new TypeError('fetch failed');
      }
      const link = { cf_link_id: 900 + links.size, link_id: id, link_status: 'ACTIVE', link_amount: body.link_amount, link_amount_paid: 0, link_url: `https://payments.cashfree.com/links/${id}`, link_expiry_time: body.link_expiry_time };
      links.set(id, link);
      if (failCreate === 'network-after-create') {
        failCreate = undefined;
        throw new TypeError('socket hang up');
      }
      return jsonResponse(link);
    }
    if (init.method === 'GET' && (m = p.match(/^\/links\/([^/]+)$/))) {
      const l = links.get(decodeURIComponent(m[1]!));
      return l ? jsonResponse(l) : jsonResponse({ code: 'link_not_found', message: 'link does not exist' }, 404);
    }
    if (init.method === 'GET' && (m = p.match(/^\/links\/([^/]+)\/orders$/))) return jsonResponse(orders.get(decodeURIComponent(m[1]!)) ?? []);
    if (init.method === 'GET' && (m = p.match(/^\/orders\/([^/]+)\/payments$/))) return jsonResponse(payments.get(decodeURIComponent(m[1]!)) ?? []);
    return jsonResponse({ code: 'not_found', message: `${init.method} ${p}` }, 404);
  };
  const pay = (linkId: string, amount?: number) => {
    const l = links.get(linkId)!;
    const paid = amount ?? Number(l.link_amount);
    links.set(linkId, { ...l, link_status: paid >= Number(l.link_amount) ? 'PAID' : 'PARTIALLY_PAID', link_amount_paid: paid });
    const orderId = `CFPay_${linkId}`;
    orders.set(linkId, [{ cf_order_id: 7001, order_id: orderId, order_status: 'PAID', order_amount: paid }]);
    payments.set(orderId, [
      { cf_payment_id: 55, order_id: orderId, payment_status: 'FAILED', payment_group: 'upi' },
      { cf_payment_id: 56, order_id: orderId, payment_status: 'SUCCESS', payment_amount: paid, payment_group: 'upi', bank_reference: '426512345678', payment_completion_time: '2026-09-29T15:31:00+05:30' },
    ]);
  };
  const setStatus = (linkId: string, status: string) => links.set(linkId, { ...links.get(linkId)!, link_status: status });
  return { fn, links, calls, pay, setStatus };
};

const make = (opts: Parameters<typeof fakePg>[0] = {}) => {
  let t = START;
  let n = 0;
  const api = fakePg(opts);
  const store = createMemoryDepositStore();
  const logs: string[] = [];
  const service = createPaymentsService({
    store,
    cashfree: createCashfreePgClient({ environment: 'sandbox', appId: 'APP_ID', secretKey: SECRET, fetch: api.fn, newId: () => `req-${++n}` }),
    webhookSecret: SECRET,
    functionUrl: FN,
    limits: { minAmountPaise: 100, maxAmountPaise: 5_000_000 },
    linkMinutes: 30,
    paymentMethods: 'upi',
    statusCallback: { url: 'https://onelocal.example/hooks/deposits', secret: 'server-secret' },
    fetch: api.fn,
    now: () => new Date(t),
    newId: () => `dep-${++n}`,
    log: (event) => logs.push(event),
  });
  return { service, api, store, logs, advance: (s: number) => (t += s * 1000) };
};

const input = (over: Record<string, unknown> = {}) => ({ riderId: 'rider-1001', amount: 320, idempotencyKey: 'k1', customer: { phone: '+91 98765 43210', name: 'Rahul Sharma' }, ...over });
const sign = (body: string, ts = '1759140000', secret = SECRET) => ({ signature: createHmac('sha256', secret).update(ts + body).digest('base64'), timestamp: ts });
const linkEvent = (linkId: string) => JSON.stringify({ type: 'PAYMENT_LINK_EVENT', data: { link_id: linkId, link_status: 'PAID' } });

test('Cashfree PG client: base URLs, headers, idempotency and payment-link body', async () => {
  assert.equal(pgBaseUrl('sandbox'), 'https://sandbox.cashfree.com/pg');
  assert.equal(pgBaseUrl('production'), 'https://api.cashfree.com/pg');
  const { service, api } = make();
  const d = await service.createDeposit(input());
  const c = api.calls[0]!;
  assert.equal(c.method, 'POST');
  assert.equal(c.path, '/pg/links');
  assert.equal(c.headers['x-client-id'], 'APP_ID');
  assert.equal(c.headers['x-client-secret'], SECRET);
  assert.equal(c.headers['x-api-version'], '2026-01-01');
  assert.equal(c.headers['x-idempotency-key'], c.body.link_id);
  assert.ok(c.headers['x-request-id']);
  assert.match(String(c.body.link_id), /^ol_dep_[0-9a-f]{32}$/);
  assert.ok(String(c.body.link_id).length <= 50);
  assert.equal(c.body.link_amount, 320);
  assert.equal(c.body.link_currency, 'INR');
  assert.equal(c.body.link_partial_payments, false);
  assert.deepEqual(c.body.customer_details, { customer_phone: '9876543210', customer_name: 'Rahul Sharma' });
  assert.deepEqual(c.body.link_notify, { send_sms: false, send_email: false });
  assert.deepEqual(c.body.link_notes, { deposit_id: d.id });
  assert.deepEqual(c.body.link_meta, { return_url: `${FN}/return?d=${d.id}`, notify_url: `${FN}/webhooks/cashfree`, payment_methods: 'upi' });
  assert.equal(c.body.link_expiry_time, '2026-09-29T10:30:00.000Z');
  assert.equal(d.status, 'pending');
  assert.equal(d.checkoutUrl, `https://payments.cashfree.com/links/${c.body.link_id}`);
});

test('helpers: key environment, status map, paise, payer phone', () => {
  assert.equal(environmentOfSecretKey('cfsk_ma_prod_abc'), 'production');
  assert.equal(environmentOfSecretKey('cfsk_ma_test_abc'), 'sandbox');
  assert.equal(environmentOfSecretKey('something'), null);
  assert.equal(mapLinkStatus('PAID'), 'paid');
  assert.equal(mapLinkStatus('EXPIRED'), 'expired');
  assert.equal(mapLinkStatus('CANCELLED'), 'cancelled');
  assert.equal(mapLinkStatus('PARTIALLY_PAID'), 'pending');
  assert.equal(mapLinkStatus('ACTIVE'), 'pending');
  assert.equal(toPaise('320.50'), 32050);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(cashfreePhone('+91 98765 43210'), '9876543210');
  assert.equal(cashfreePhone('09876543210'), '9876543210');
  assert.equal(cashfreePhone('12345'), null);
  assert.equal(cashfreePhone('1234567890'), null);
});

test('same idempotency key → same link, one Cashfree call', async () => {
  const { service, api } = make();
  const a = await service.createDeposit(input());
  const b = await service.createDeposit(input());
  assert.equal(b.id, a.id);
  assert.equal(b.checkoutUrl, a.checkoutUrl);
  assert.equal(api.calls.filter((c) => c.method === 'POST' && c.path === '/pg/links').length, 1);
  const other = await service.createDeposit(input({ riderId: 'rider-2002' }));
  assert.notEqual(other.id, a.id, 'the key is scoped per rider');
});

test('lost response: the record exists before Cashfree is called and a retry recovers the same link', async () => {
  const { service, api, store } = make({ failCreate: 'network-after-create' });
  await assert.rejects(service.createDeposit(input()), (e: unknown) => e instanceof PaymentError && e.code === 'provider_error' && e.status === 502);
  const [rec] = [...store.deposits.values()];
  assert.equal(rec?.status, 'pending');
  assert.equal(rec?.linkUrl, null);
  const again = await service.createDeposit(input());
  assert.equal(again.id, rec?.id);
  assert.equal(again.status, 'pending');
  assert.match(String(again.checkoutUrl), /payments\.cashfree\.com\/links\/ol_dep_/);
  assert.equal(api.links.size, 1, 'never a second link');
});

test('network failure before Cashfree: retry creates the link', async () => {
  const { service } = make({ failCreate: 'network' });
  await assert.rejects(service.createDeposit(input()), /try again/i);
  const d = await service.createDeposit(input());
  assert.ok(d.checkoutUrl);
});

test('Cashfree rejects the link → failed, reason kept', async () => {
  const { service, store } = make({ failCreate: 'reject' });
  await assert.rejects(service.createDeposit(input()), /refused/);
  assert.equal([...store.deposits.values()][0]?.status, 'failed');
});

test('validation: amount, decimals, limits, key and phone', async () => {
  const { service } = make();
  await assert.rejects(service.createDeposit(input({ amount: 0.5 })), /Minimum deposit/);
  await assert.rejects(service.createDeposit(input({ amount: 60000 })), /Maximum deposit/);
  await assert.rejects(service.createDeposit(input({ amount: 10.001 })), /2 decimals/);
  await assert.rejects(service.createDeposit(input({ idempotencyKey: '' })), /idempotencyKey/);
  await assert.rejects(service.createDeposit(input({ customer: { phone: '123' } })), /mobile number/);
});

test('webhook: bad signature refused; a signed event makes us re-read Cashfree → paid with UTR, callback signed', async () => {
  const { service, api, store } = make();
  const d = await service.createDeposit(input());
  const linkId = String(api.calls[0]!.body.link_id);
  const body = linkEvent(linkId);
  await assert.rejects(service.handleWebhook(body, { signature: 'nope', timestamp: '1' }), (e: unknown) => e instanceof PaymentError && e.status === 401);

  // A forged/early "PAID" while Cashfree still says ACTIVE changes nothing.
  assert.equal(await service.handleWebhook(body, sign(body)), 'updated');
  assert.equal((await store.getDeposit(d.id))?.status, 'pending');

  api.pay(linkId);
  assert.equal(await service.handleWebhook(body, sign(body)), 'updated');
  const view = await service.getDeposit(d.id);
  assert.equal(view.status, 'paid');
  assert.equal(view.amountPaid, 320);
  assert.equal(view.reference, '426512345678');
  assert.equal(view.method, 'upi');
  assert.equal(view.checkoutUrl, null, 'no checkout link once paid');
  assert.equal(view.paidAt, '2026-09-29T10:01:00.000Z');

  const cb = api.calls.find((c) => c.path === '/hooks/deposits')!;
  assert.equal(cb.body.event, 'deposit.updated');
  assert.equal((cb.body.deposit as { status: string }).status, 'paid');
  assert.equal(cb.headers['x-onelocal-signature'], createHmac('sha256', 'server-secret').update(JSON.stringify(cb.body)).digest('hex'));

  // Replays do nothing more.
  await service.handleWebhook(body, sign(body));
  assert.equal(api.calls.filter((c) => c.path === '/hooks/deposits').length, 1);
});

test('webhook by deposit id (order-level events) and unknown links', async () => {
  const { service, api } = make();
  const d = await service.createDeposit(input());
  api.pay(String(api.calls[0]!.body.link_id));
  const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'CFPay_x', order_tags: { deposit_id: d.id } } } });
  assert.equal(await service.handleWebhook(body, sign(body)), 'updated');
  assert.equal((await service.getDeposit(d.id)).status, 'paid');
  const unknown = linkEvent('ol_dep_unknown');
  assert.equal(await service.handleWebhook(unknown, sign(unknown)), 'unknown');
  const noId = JSON.stringify({ type: 'X', data: {} });
  assert.equal(await service.handleWebhook(noId, sign(noId)), 'ignored');
});

test('a short payment is never credited', async () => {
  const { service, api } = make();
  const d = await service.createDeposit(input());
  const linkId = String(api.calls[0]!.body.link_id);
  api.pay(linkId, 100);
  api.setStatus(linkId, 'PAID');
  assert.equal((await service.getDeposit(d.id)).status, 'pending');
});

test('expired link → expired (callback); a payment that lands at expiry still counts', async () => {
  const { service, api } = make();
  const d = await service.createDeposit(input());
  const linkId = String(api.calls[0]!.body.link_id);
  api.setStatus(linkId, 'EXPIRED');
  assert.equal((await service.getDeposit(d.id)).status, 'expired');
  assert.equal((await service.getDeposit(d.id)).checkoutUrl, null);
  api.pay(linkId);
  const body = linkEvent(linkId);
  await service.handleWebhook(body, sign(body));
  assert.equal((await service.getDeposit(d.id)).status, 'paid');
  assert.deepEqual(api.calls.filter((c) => c.path === '/hooks/deposits').map((c) => (c.body.deposit as { status: string }).status), ['expired', 'paid']);
});

test('sweep re-reads pending deposits older than 30 s', async () => {
  const { service, api, advance } = make();
  const d = await service.createDeposit(input());
  api.pay(String(api.calls[0]!.body.link_id));
  assert.deepEqual(await service.sweep(), { checked: 0, changed: 0 });
  advance(31);
  assert.deepEqual(await service.sweep(), { checked: 1, changed: 1 });
  assert.equal((await service.getDeposit(d.id)).status, 'paid');
});

test('return URL goes back into the app and only carries a safe id', () => {
  const { service } = make();
  assert.equal(service.returnLocation('onelocalrider://cash', 'dep-1'), 'onelocalrider://cash?deposit=dep-1');
  assert.equal(service.returnLocation('onelocalrider://cash?x=1', 'dep-1'), 'onelocalrider://cash?x=1&deposit=dep-1');
  assert.equal(service.returnLocation('onelocalrider://cash', 'https://evil.example/'), 'onelocalrider://cash');
  assert.equal(service.returnLocation('onelocalrider://cash', null), 'onelocalrider://cash');
});

const ENV: Record<string, string> = {
  CASHFREE_PG_APP_ID: 'APP_ID',
  CASHFREE_PG_SECRET_KEY: SECRET,
  PAYMENTS_API_SECRET: 'server-secret',
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

test('config: environment comes from the key; a mismatch is refused; UPI only by default', () => {
  const store = createMemoryDepositStore();
  const test = loadPaymentsConfig((k) => ENV[k], { store });
  assert.equal(test.environment, 'sandbox');
  assert.equal(test.deps.paymentMethods, 'upi');
  assert.equal(test.deps.functionUrl, FN);
  assert.equal(test.appReturnUrl, 'onelocalrider://cash');
  const prod = loadPaymentsConfig((k) => ({ ...ENV, CASHFREE_PG_SECRET_KEY: 'cfsk_ma_prod_x' })[k], { store });
  assert.equal(prod.environment, 'production');
  assert.throws(() => loadPaymentsConfig((k) => ({ ...ENV, CASHFREE_PG_SECRET_KEY: 'cfsk_ma_prod_x', CASHFREE_PG_ENV: 'sandbox' })[k], { store }), /production key/);
  assert.equal(loadPaymentsConfig((k) => ({ ...ENV, PAYMENT_METHODS: 'all' })[k], { store }).deps.paymentMethods, undefined);
  assert.throws(() => loadPaymentsConfig(() => undefined, { store }), /CASHFREE_PG_APP_ID, CASHFREE_PG_SECRET_KEY, PAYMENTS_API_SECRET/);
});

test('router end to end: auth, create, webhook, status, history, return redirect, health', async () => {
  const api = fakePg();
  const store = createMemoryDepositStore();
  const cfg = loadPaymentsConfig((k) => ENV[k], { store, fetch: api.fn });
  const handler = createPaymentsHandler(cfg, createPaymentsService(cfg.deps));
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = { 'x-payments-secret': 'server-secret' }) =>
    new Request(`${FN}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });

  assert.deepEqual(routeOf('/functions/v1/payments/riders/r1/deposits'), ['riders', 'r1', 'deposits']);
  assert.equal((await handler(req('POST', 'deposits', input(), {}))).status, 401);
  const created = await (await handler(req('POST', 'deposits', input()))).json();
  assert.equal(created.status, 'pending');
  assert.ok(created.checkoutUrl);

  const linkId = String(api.calls[0]!.body.link_id);
  api.pay(linkId);
  const body = linkEvent(linkId);
  const s = sign(body);
  assert.equal((await handler(req('POST', 'webhooks/cashfree', body, {}))).status, 401);
  const hook = await handler(req('POST', 'webhooks/cashfree', body, { 'x-webhook-signature': s.signature, 'x-webhook-timestamp': s.timestamp }));
  assert.deepEqual(await hook.json(), { result: 'updated' });

  const got = await (await handler(req('GET', `deposits/${created.id}`))).json();
  assert.equal(got.status, 'paid');
  assert.equal(got.reference, '426512345678');
  const list = await (await handler(req('GET', 'riders/rider-1001/deposits'))).json();
  assert.equal(list.deposits.length, 1);

  const ret = await handler(req('GET', `return?d=${created.id}`, undefined, {}));
  assert.equal(ret.status, 302);
  assert.equal(ret.headers.get('location'), `onelocalrider://cash?deposit=${created.id}`);

  assert.deepEqual(await (await handler(req('GET', 'health', undefined, {}))).json(), { ok: true });
  assert.deepEqual(await (await handler(req('GET', 'health'))).json(), { ok: true, environment: 'sandbox' });
  assert.equal((await handler(req('GET', 'nope'))).status, 404);
});

test('unconfigured function explains what is missing', async () => {
  const handler = createPaymentsHandlerFromEnv(() => undefined);
  const res = await handler(new Request(`${FN}/health`));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error.message, /CASHFREE_PG_APP_ID/);
});

test('Supabase store: inserts, finds by link id, lists pending, maps money and times', async () => {
  const calls: { method: string; url: string; body?: string }[] = [];
  const row = { id: 'd1', link_id: 'ol_dep_1', rider_id: 'r1', amount_paise: '32000', amount_paid_paise: 0, status: 'pending', created_at: '2026-09-29T10:00:00+00:00', updated_at: '2026-09-29T10:00:00+00:00' };
  const store = createSupabaseDepositStore({
    url: 'https://ref.supabase.co/',
    serviceKey: 'sb_secret_x',
    fetch: async (url, init = {}) => {
      calls.push({ method: String(init.method), url, body: init.body ? String(init.body) : undefined });
      if (init.method === 'POST') return new Response(null, { status: url.includes('dup') ? 409 : 201 });
      return jsonResponse([row]);
    },
  });
  const got = await store.getDepositByLinkId('ol_dep_1');
  assert.equal(got?.amountPaise, 32000);
  assert.equal(got?.createdAt, '2026-09-29T10:00:00.000Z');
  assert.equal(got?.linkUrl, null);
  assert.match(calls[0]!.url, /\/rest\/v1\/cash_deposits\?link_id=eq\.ol_dep_1&limit=1$/);
  await store.listPendingDeposits('2026-09-29T10:00:00.000Z', 5);
  assert.match(calls[1]!.url, /status=eq\.pending&updated_at=lte\.2026-09-29T10%3A00%3A00\.000Z&order=updated_at\.asc&limit=5/);
  await store.updateDeposit('d1', { status: 'paid', bankReference: 'U1' });
  assert.deepEqual(JSON.parse(calls[2]!.body!), { status: 'paid', bank_reference: 'U1' });
});
