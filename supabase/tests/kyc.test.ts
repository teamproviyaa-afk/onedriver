import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { PAYLOAD_KEY, jsonResponse } from './helpers.ts';
import { createSecureIdClient, sniffImageType } from '../functions/_shared/kyc/secureId.ts';
import { createKycService, isDl, isPan, isVehicleNumber, maskDl, maskPan, normalizeDob } from '../functions/_shared/kyc/service.ts';
import { loadKycConfig } from '../functions/_shared/kyc/config.ts';
import { createKycHandler, createKycHandlerFromEnv, routeOf } from '../functions/_shared/kyc/router.ts';
import { createMemoryKycStore } from '../functions/_shared/kyc/store/memory.ts';
import { createSupabaseKycStore } from '../functions/_shared/kyc/store/supabaseRest.ts';
import { KycError } from '../functions/_shared/kyc/types.ts';

const FN = 'https://ref.supabase.co/functions/v1/kyc';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

interface FakeOpts {
  digilocker?: 'PENDING' | 'AUTHENTICATED' | 'EXPIRED';
  aadhaarName?: string;
  photo?: 'data' | 'https' | 'none';
  pan?: { valid?: boolean; registered_name?: string; name_match_result?: string } | 'error500';
  dl?: { status?: string; name?: string; to?: string };
  rc?: { status?: string; rc_status?: string; owner?: string; rc_expiry_date?: string };
  liveness?: boolean;
  faceMatch?: 'YES' | 'NO';
}

/** A small fake of Cashfree Secure ID, reached through the real client. */
const fakeSecureId = (opts: FakeOpts = {}) => {
  const calls: { method: string; path: string; query: URLSearchParams; headers: Record<string, string>; body: unknown }[] = [];
  const fn = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const body = init.body instanceof FormData ? init.body : init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: String(init.method), path: u.pathname, query: u.searchParams, headers: (init.headers ?? {}) as Record<string, string>, body });
    if (u.host === 'photos.example') return new Response(PNG, { status: 200 });
    const p = u.pathname.replace(/^\/verification/, '');
    switch (`${init.method} ${p}`) {
      case 'POST /digilocker':
        return jsonResponse({ verification_id: (body as { verification_id: string }).verification_id, reference_id: 11, url: 'https://verification.cashfree.com/dgl?x=1', status: 'PENDING' });
      case 'GET /digilocker':
        return jsonResponse({ verification_id: u.searchParams.get('verification_id'), status: opts.digilocker ?? 'AUTHENTICATED', user_details: { name: 'Rahul Sharma', dob: '12-03-1994' } });
      case 'GET /digilocker/document/AADHAAR':
        return jsonResponse({
          name: opts.aadhaarName ?? 'RAHUL KUMAR SHARMA',
          dob: '12-03-1994',
          gender: 'M',
          uid: 'xxxxxxxx4821',
          reference_id: 12,
          photo_link: opts.photo === 'none' ? undefined : opts.photo === 'https' ? 'https://photos.example/a.png' : `data:image/jpeg;base64,${b64(JPEG)}`,
        });
      case 'POST /pan': {
        if (opts.pan === 'error500') return jsonResponse({ code: 'internal', message: 'something went wrong' }, 500);
        const b = body as { pan: string; name: string };
        return jsonResponse({ pan: b.pan, valid: true, registered_name: 'RAHUL KUMAR SHARMA', name_match_result: 'GOOD_PARTIAL_MATCH', reference_id: 21, ...(opts.pan ?? {}) });
      }
      case 'POST /driving-license':
        return jsonResponse({
          status: opts.dl?.status ?? 'VALID',
          reference_id: 31,
          dl_validity: { non_transport: { from: '2014-01-01', to: opts.dl?.to ?? '2034-03-11' } },
          details_of_driving_licence: { name: opts.dl?.name ?? 'RAHUL KUMAR SHARMA' },
        });
      case 'POST /vehicle-rc':
        return jsonResponse({ status: opts.rc?.status ?? 'VALID', reference_id: 41, owner: opts.rc?.owner ?? 'RAHUL SHARMA', rc_status: opts.rc?.rc_status ?? 'ACTIVE', rc_expiry_date: opts.rc?.rc_expiry_date ?? '2038-01-01', model: 'IQUBE', vehicle_manufacturer_name: 'TVS', vehicle_insurance_upto: '2027-05-01', class: '2WN' });
      case 'POST /face-liveness':
        return jsonResponse({ status: 'SUCCESS', reference_id: 51, liveness: opts.liveness ?? true, liveness_score: 0.93 });
      case 'POST /face-match':
        return jsonResponse({ status: 'SUCCESS', ref_id: 61, face_match_result: opts.faceMatch ?? 'YES', face_match_score: opts.faceMatch === 'NO' ? 0.31 : 0.88 });
      default:
        return jsonResponse({ code: 'not_found', message: `${init.method} ${p}` }, 404);
    }
  };
  return { fn, calls };
};

const make = (opts: FakeOpts = {}, attemptsPerDay = 5) => {
  let t = Date.parse('2026-09-29T10:00:00.000Z');
  let n = 0;
  const api = fakeSecureId(opts);
  const store = createMemoryKycStore();
  const service = createKycService({
    store,
    secureId: createSecureIdClient({ environment: 'sandbox', clientId: 'CID', clientSecret: 'cfsk_ma_test_x', fetch: api.fn, newId: () => `req-${++n}` }),
    payloadKey: PAYLOAD_KEY,
    functionUrl: FN,
    attemptsPerDay,
    faceMatchThreshold: 0.75,
    fetch: api.fn,
    now: () => new Date(t),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  return { service, api, store, advance: (s: number) => (t += s * 1000) };
};

const withAadhaar = async (opts: FakeOpts = {}) => {
  const m = make(opts);
  const { verificationId } = await m.service.startDigilocker({ riderId: 'rider-1' });
  const r = await m.service.completeDigilocker({ riderId: 'rider-1', riderName: 'Rahul Sharma', verificationId });
  return { ...m, verificationId, aadhaar: r };
};

test('helpers: dates, PAN, licence, vehicle numbers, masking, image types', () => {
  assert.equal(normalizeDob('12-03-1994'), '1994-03-12');
  assert.equal(normalizeDob('12/03/1994'), '1994-03-12');
  assert.equal(normalizeDob('1994-03-12'), '1994-03-12');
  assert.equal(normalizeDob('31-02-1994'), null);
  assert.equal(normalizeDob('soon'), null);
  assert.ok(isPan('ABCDE1234F'));
  assert.ok(!isPan('ABCD1234F'));
  assert.equal(maskPan('ABCDE1234F'), 'ABXXXXX34F');
  assert.ok(isDl('MH1420110012345'));
  assert.ok(!isDl('1234'));
  assert.equal(maskDl('MH1420110012345'), 'MH14•••••••2345');
  assert.ok(isVehicleNumber('MH24AB1234'));
  assert.ok(isVehicleNumber('22BH1234AA'));
  assert.ok(!isVehicleNumber('HELLO'));
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(new Uint8Array([1, 2, 3, 4])), null);
});

test('client: headers, version, 2FA signature and multipart images', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const api = fakeSecureId();
  const client = createSecureIdClient({ environment: 'production', clientId: 'CID', clientSecret: 'SECRET', publicKeyPem: pem, fetch: api.fn, now: () => 1759140000_000, newId: () => 'rid' });
  await client.verifyPan({ pan: 'ABCDE1234F', name: 'Rahul' });
  const c = api.calls[0]!;
  assert.equal(`${c.method} ${c.path}`, 'POST /verification/pan');
  assert.equal(c.headers['x-client-id'], 'CID');
  assert.equal(c.headers['x-client-secret'], 'SECRET');
  assert.equal(c.headers['x-api-version'], '2023-12-18');
  assert.equal(c.headers['Content-Type'], 'application/json');
  const decrypted = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, Buffer.from(c.headers['x-cf-signature']!, 'base64')).toString();
  assert.equal(decrypted, 'CID.1759140000');

  await client.faceLiveness('v1', JPEG, 'image/jpeg');
  const live = api.calls[1]!;
  assert.equal(live.path, '/verification/face-liveness');
  assert.equal(live.headers['Content-Type'], undefined, 'fetch sets the multipart boundary');
  const form = live.body as FormData;
  assert.equal(form.get('verification_id'), 'v1');
  assert.equal((form.get('image') as File).type, 'image/jpeg');

  await client.getAadhaarDocument('v2');
  assert.equal(api.calls[2]!.path, '/verification/digilocker/document/AADHAAR');
  assert.equal(api.calls[2]!.query.get('verification_id'), 'v2');
});

test('DigiLocker: start → pending → Aadhaar verified with masked number, legal name, dob; photo kept encrypted', async () => {
  const pending = make({ digilocker: 'PENDING' });
  const s = await pending.service.startDigilocker({ riderId: 'rider-1' });
  assert.equal(s.url, 'https://verification.cashfree.com/dgl?x=1');
  assert.match(s.verificationId, /^ol_aadhaar_[0-9a-f]{12}_[a-z0-9]+$/);
  assert.ok(s.verificationId.length <= 50);
  assert.ok(!s.verificationId.includes('rider-1'), 'the verification id does not reveal the rider');
  const create = pending.api.calls[0]!.body as Record<string, unknown>;
  assert.deepEqual(create.document_requested, ['AADHAAR']);
  assert.equal(create.redirect_url, `${FN}/digilocker/return?v=${s.verificationId}`);
  assert.equal((await pending.service.completeDigilocker({ riderId: 'rider-1', riderName: 'Rahul Sharma' })).status, 'pending');

  const { aadhaar, store } = await withAadhaar();
  assert.equal(aadhaar.status, 'verified');
  assert.equal(aadhaar.numberMasked, 'XXXX XXXX 4821');
  assert.equal(aadhaar.details.legalName, 'RAHUL KUMAR SHARMA');
  const p = store.profiles.get('rider-1')!;
  assert.equal(p.dob, '1994-03-12');
  assert.equal(p.aadhaarLast4, '4821');
  assert.ok(p.aadhaarPhotoEnc && !p.aadhaarPhotoEnc.includes(b64(JPEG)), 'photo stored encrypted');
  assert.ok(!JSON.stringify(p).includes('xxxxxxxx4821'), 'full uid never stored');
});

test('DigiLocker: someone else\'s session, expired sessions and name mismatches are refused', async () => {
  const m = make();
  const { verificationId } = await m.service.startDigilocker({ riderId: 'rider-1' });
  await assert.rejects(m.service.completeDigilocker({ riderId: 'rider-2', riderName: 'X', verificationId }), (e: unknown) => e instanceof KycError && e.status === 404);
  await assert.rejects(m.service.completeDigilocker({ riderId: 'rider-1', riderName: '', verificationId }), /riderName/);

  const expired = make({ digilocker: 'EXPIRED' });
  await expired.service.startDigilocker({ riderId: 'rider-1' });
  assert.match(String((await expired.service.completeDigilocker({ riderId: 'rider-1', riderName: 'Rahul Sharma' })).reason), /expired/);

  const other = make({ aadhaarName: 'SURESH PATIL' });
  await other.service.startDigilocker({ riderId: 'rider-1' });
  const r = await other.service.completeDigilocker({ riderId: 'rider-1', riderName: 'Rahul Sharma' });
  assert.equal(r.status, 'rejected');
  assert.match(String(r.reason), /SURESH PATIL.*Rahul Sharma/);
  assert.equal(other.store.profiles.get('rider-1')?.aadhaarVerifiedAt, null);
});

test('PAN: matched against the Aadhaar name; invalid or someone else\'s PAN refused; Cashfree outage is retryable', async () => {
  const { service, api } = await withAadhaar();
  const ok = await service.verifyPan({ riderId: 'rider-1', pan: 'abcde1234f' });
  assert.equal(ok.status, 'verified');
  assert.equal(ok.numberMasked, 'ABXXXXX34F');
  assert.deepEqual(api.calls.find((c) => c.path === '/verification/pan')!.body, { pan: 'ABCDE1234F', name: 'RAHUL KUMAR SHARMA' });
  await assert.rejects(service.verifyPan({ riderId: 'rider-1', pan: 'nope' }), /valid PAN/);

  const noMatch = await withAadhaar({ pan: { registered_name: 'SURESH PATIL', name_match_result: 'NO_MATCH' } });
  const r = await noMatch.service.verifyPan({ riderId: 'rider-1', pan: 'ABCDE1234F' });
  assert.equal(r.status, 'rejected');
  assert.match(String(r.reason), /SURESH PATIL/);

  const invalid = await withAadhaar({ pan: { valid: false } });
  assert.equal((await invalid.service.verifyPan({ riderId: 'rider-1', pan: 'ABCDE1234F' })).status, 'rejected');

  const down = await withAadhaar({ pan: 'error500' });
  await assert.rejects(down.service.verifyPan({ riderId: 'rider-1', pan: 'ABCDE1234F' }), (e: unknown) => e instanceof KycError && e.code === 'provider_error' && e.status === 502);

  const noName = make();
  await assert.rejects(noName.service.verifyPan({ riderId: 'rider-9', pan: 'ABCDE1234F' }), /Verify Aadhaar first/);
});

test('selfie: liveness, then face match with the Aadhaar photo (deleted after a match)', async () => {
  const { service, store, api } = await withAadhaar();
  const r = await service.verifySelfie({ riderId: 'rider-1', imageBase64: b64(JPEG) });
  assert.equal(r.status, 'verified');
  assert.equal(r.details.faceMatchScore, 0.88);
  assert.equal(store.profiles.get('rider-1')?.aadhaarPhotoEnc, null, 'Aadhaar photo deleted after the match');
  const fm = api.calls.find((c) => c.path === '/verification/face-match')!.body as FormData;
  assert.equal(fm.get('threshold'), '0.75');
  assert.equal((fm.get('second_image') as File).type, 'image/jpeg');

  const spoof = await withAadhaar({ liveness: false });
  assert.equal((await spoof.service.verifySelfie({ riderId: 'rider-1', imageBase64: b64(JPEG) })).status, 'rejected');

  const mismatch = await withAadhaar({ faceMatch: 'NO' });
  const m = await mismatch.service.verifySelfie({ riderId: 'rider-1', imageBase64: b64(JPEG) });
  assert.equal(m.status, 'rejected');
  assert.match(String(m.reason), /does not match your Aadhaar photo/);
  assert.ok(mismatch.store.profiles.get('rider-1')?.aadhaarPhotoEnc, 'kept for a retake');

  const early = make();
  const e = await early.service.verifySelfie({ riderId: 'rider-7', imageBase64: b64(PNG) });
  assert.equal(e.status, 'pending');
  assert.match(String(e.reason), /once Aadhaar is verified/);
  await assert.rejects(early.service.verifySelfie({ riderId: 'rider-7', imageBase64: b64(new Uint8Array([1, 2, 3])) }), /JPEG or PNG/);
  await assert.rejects(early.service.verifySelfie({ riderId: 'rider-7', imageUrl: 'http://insecure.example/x.jpg' }), /JPEG or PNG/);
});

test('selfie: Aadhaar photo from an https link works too', async () => {
  const { service } = await withAadhaar({ photo: 'https' });
  assert.equal((await service.verifySelfie({ riderId: 'rider-1', imageBase64: b64(JPEG) })).status, 'verified');
});

test('driving licence: uses the Aadhaar date of birth; invalid, expired or someone else\'s licence refused', async () => {
  const { service, api } = await withAadhaar();
  const ok = await service.verifyDrivingLicence({ riderId: 'rider-1', dlNumber: 'MH14 20110012345' });
  assert.equal(ok.status, 'verified');
  assert.equal(ok.numberMasked, 'MH14•••••••2345');
  assert.equal(ok.expiresOn, '2034-03-11');
  const req = api.calls.find((c) => c.path === '/verification/driving-license')!.body as Record<string, string>;
  assert.equal(req.dl_number, 'MH1420110012345');
  assert.equal(req.dob, '1994-03-12');

  assert.equal((await (await withAadhaar({ dl: { status: 'INVALID' } })).service.verifyDrivingLicence({ riderId: 'rider-1', dlNumber: 'MH1420110012345' })).status, 'rejected');
  const expired = await (await withAadhaar({ dl: { to: '2025-01-01' } })).service.verifyDrivingLicence({ riderId: 'rider-1', dlNumber: 'MH1420110012345' });
  assert.match(String(expired.reason), /expired on 2025-01-01/);
  const other = await (await withAadhaar({ dl: { name: 'SURESH PATIL' } })).service.verifyDrivingLicence({ riderId: 'rider-1', dlNumber: 'MH1420110012345' });
  assert.match(String(other.reason), /belongs to SURESH PATIL/);

  const noDob = make();
  await assert.rejects(noDob.service.verifyDrivingLicence({ riderId: 'rider-5', dlNumber: 'MH1420110012345' }), /date of birth/);
  assert.equal((await noDob.service.verifyDrivingLicence({ riderId: 'rider-5', riderName: 'Rahul Sharma', dlNumber: 'MH1420110012345', dob: '12/03/1994' })).status, 'verified');
});

test('vehicle RC: active registration verified (rented vehicles allowed); suspended or expired refused', async () => {
  const { service } = await withAadhaar();
  const ok = await service.verifyVehicleRc({ riderId: 'rider-1', vehicleNumber: 'MH 24 AB 1234' });
  assert.equal(ok.status, 'verified');
  assert.deepEqual(ok.details, { ownerIsRider: true, model: 'TVS IQUBE', vehicleClass: '2WN', insuranceUpto: '2027-05-01' });
  const rented = await (await withAadhaar({ rc: { owner: 'SURESH PATIL' } })).service.verifyVehicleRc({ riderId: 'rider-1', vehicleNumber: 'MH24AB1234' });
  assert.equal(rented.status, 'verified');
  assert.equal(rented.details.ownerIsRider, false);
  assert.equal((await (await withAadhaar({ rc: { rc_status: 'SUSPENDED' } })).service.verifyVehicleRc({ riderId: 'rider-1', vehicleNumber: 'MH24AB1234' })).status, 'rejected');
  assert.equal((await (await withAadhaar({ rc: { rc_expiry_date: '2020-01-01' } })).service.verifyVehicleRc({ riderId: 'rider-1', vehicleNumber: 'MH24AB1234' })).status, 'rejected');
  await assert.rejects(service.verifyVehicleRc({ riderId: 'rider-1', vehicleNumber: 'X' }), /registration number/);
});

test('attempt limit: each check is billed, so a rider gets a few per day', async () => {
  const m = make({ pan: { valid: false } }, 2);
  await m.service.startDigilocker({ riderId: 'r' });
  await m.service.completeDigilocker({ riderId: 'r', riderName: 'Rahul Sharma' });
  await m.service.verifyPan({ riderId: 'r', pan: 'ABCDE1234F' });
  await m.service.verifyPan({ riderId: 'r', pan: 'ABCDE1234F' });
  await assert.rejects(m.service.verifyPan({ riderId: 'r', pan: 'ABCDE1234F' }), (e: unknown) => e instanceof KycError && e.code === 'rate_limited' && e.status === 429);
  m.advance(24 * 3600 + 1);
  assert.equal((await m.service.verifyPan({ riderId: 'r', pan: 'ABCDE1234F' })).status, 'rejected');
});

const ENV: Record<string, string> = {
  CASHFREE_SECURE_ID_CLIENT_ID: 'CID',
  CASHFREE_SECURE_ID_CLIENT_SECRET: 'cfsk_ma_test_x',
  KYC_API_SECRET: 'server-secret',
  KYC_PAYLOAD_KEY: PAYLOAD_KEY,
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

test('config: environment from the key, payouts verification keys as fallback, clear errors', () => {
  const store = createMemoryKycStore();
  const cfg = loadKycConfig((k) => ENV[k], { store });
  assert.equal(cfg.environment, 'sandbox');
  assert.equal(cfg.signed, false);
  assert.equal(cfg.deps.functionUrl, FN);
  assert.equal(cfg.appReturnUrl, 'onelocalrider://onboarding/kyc');
  const prod = loadKycConfig((k) => ({ ...ENV, CASHFREE_SECURE_ID_CLIENT_ID: undefined, CASHFREE_SECURE_ID_CLIENT_SECRET: undefined, CASHFREE_VERIFICATION_CLIENT_ID: 'V', CASHFREE_VERIFICATION_CLIENT_SECRET: 'cfsk_ma_prod_y' })[k], { store });
  assert.equal(prod.environment, 'production');
  assert.throws(() => loadKycConfig((k) => ({ ...ENV, CASHFREE_SECURE_ID_ENV: 'production' })[k], { store }), /sandbox key/);
  assert.throws(() => loadKycConfig(() => undefined, { store }), /CASHFREE_SECURE_ID_CLIENT_ID, CASHFREE_SECURE_ID_CLIENT_SECRET, KYC_API_SECRET, KYC_PAYLOAD_KEY/);
});

test('router end to end: auth, DigiLocker round trip with return redirect, checks, masked summary', async () => {
  const api = fakeSecureId();
  const store = createMemoryKycStore();
  const cfg = loadKycConfig((k) => ENV[k], { store, fetch: api.fn });
  const handler = createKycHandler(cfg, createKycService(cfg.deps));
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = { 'x-kyc-secret': 'server-secret' }) =>
    new Request(`${FN}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

  assert.deepEqual(routeOf('/functions/v1/kyc/riders/r1'), ['riders', 'r1']);
  assert.equal((await handler(req('POST', 'pan', { riderId: 'r1', pan: 'ABCDE1234F' }, {}))).status, 401);
  const start = await (await handler(req('POST', 'digilocker/start', { riderId: 'rider-1' }))).json();
  const ret = await handler(req('GET', `digilocker/return?v=${start.verificationId}`, undefined, {}));
  assert.equal(ret.status, 302);
  assert.equal(ret.headers.get('location'), `onelocalrider://onboarding/kyc?digilocker=${start.verificationId}`);
  assert.equal((await handler(req('GET', 'digilocker/return?v=<script>', undefined, {}))).headers.get('location'), 'onelocalrider://onboarding/kyc');

  const aadhaar = await (await handler(req('POST', 'digilocker/complete', { riderId: 'rider-1', riderName: 'Rahul Sharma', verificationId: start.verificationId }))).json();
  assert.equal(aadhaar.status, 'verified');
  assert.equal((await (await handler(req('POST', 'pan', { riderId: 'rider-1', pan: 'ABCDE1234F' }))).json()).status, 'verified');
  assert.equal((await (await handler(req('POST', 'selfie', { riderId: 'rider-1', imageBase64: b64(JPEG) }))).json()).status, 'verified');
  assert.equal((await (await handler(req('POST', 'driving-licence', { riderId: 'rider-1', dlNumber: 'MH1420110012345' }))).json()).status, 'verified');
  assert.equal((await (await handler(req('POST', 'vehicle-rc', { riderId: 'rider-1', vehicleNumber: 'MH24AB1234' }))).json()).status, 'verified');
  const bad = await handler(req('POST', 'pan', { riderId: 'rider-1', pan: '123' }));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'validation');

  const summary = await (await handler(req('GET', 'riders/rider-1'))).json();
  assert.equal(summary.complete, true);
  assert.equal(summary.aadhaar.numberMasked, 'XXXX XXXX 4821');
  assert.ok(!JSON.stringify(summary).includes('1994'), 'no date of birth in the summary');
  assert.deepEqual(await (await handler(req('GET', 'health'))).json(), { ok: true, environment: 'sandbox', signed: false });
  assert.deepEqual(await (await handler(req('GET', 'health', undefined, {}))).json(), { ok: true });
});

test('unconfigured function explains what is missing', async () => {
  const res = await createKycHandlerFromEnv(() => undefined)(new Request(`${FN}/health`));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error.message, /CASHFREE_SECURE_ID_CLIENT_ID/);
});

test('Supabase store: upserts profiles, counts checks via Content-Range', async () => {
  const calls: { method: string; url: string; headers: Record<string, string>; body?: string }[] = [];
  const store = createSupabaseKycStore({
    url: 'https://ref.supabase.co',
    serviceKey: 'sb_secret_x',
    fetch: async (url, init = {}) => {
      calls.push({ method: String(init.method), url, headers: init.headers as Record<string, string>, body: init.body ? String(init.body) : undefined });
      if (url.includes('kyc_checks?select')) return new Response('[]', { status: 200, headers: { 'content-range': '*/3' } });
      if (init.method === 'GET') return jsonResponse([{ rider_id: 'r1', legal_name: 'A', liveness_score: '0.9', updated_at: '2026-09-29T10:00:00+00:00' }]);
      return new Response(null, { status: 201 });
    },
  });
  assert.equal(await store.countChecks('r1', 'pan', '2026-09-28T10:00:00.000Z'), 3);
  assert.match(calls[0]!.url, /kyc_checks\?select=id&rider_id=eq\.r1&kind=eq\.pan&created_at=gte\./);
  assert.equal(calls[0]!.headers.Prefer, 'count=exact');
  const p = await store.getProfile('r1');
  assert.equal(p?.livenessScore, 0.9);
  assert.equal(p?.updatedAt, '2026-09-29T10:00:00.000Z');
  await store.saveProfile({ ...p!, panMasked: 'ABXXXXX34F' });
  assert.match(calls[2]!.url, /kyc_profiles\?on_conflict=rider_id$/);
  assert.equal(calls[2]!.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  assert.equal(JSON.parse(calls[2]!.body!).pan_masked, 'ABXXXXX34F');
});
