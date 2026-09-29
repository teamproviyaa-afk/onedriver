/**
 * HTTP surface of the `kyc` Edge Function (server-to-server, except the DigiLocker return).
 *
 *   POST /digilocker/start       { riderId }                              → { verificationId, url }
 *   GET  /digilocker/return?v=   DigiLocker consent done → 302 back into the app
 *   POST /digilocker/complete    { riderId, riderName, verificationId? }  → result (aadhaar)
 *   POST /pan                    { riderId, riderName?, pan }             → result
 *   POST /selfie                 { riderId, imageBase64 | imageUrl }      → result (liveness + face match)
 *   POST /driving-licence        { riderId, riderName?, dlNumber, dob? }  → result
 *   POST /vehicle-rc             { riderId, riderName?, vehicleNumber }   → result
 *   GET  /riders/<riderId>       masked KYC summary
 *   GET  /health
 * Everything except /digilocker/return and /health needs x-kyc-secret.
 */
import { safeEqual } from '../messaging/crypto.ts';
import type { EnvGetter, KycConfig } from './config.ts';
import { loadKycConfig } from './config.ts';
import { createKycService } from './service.ts';
import type { KycService } from './service.ts';
import { KycError } from './types.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const error = (code: string, message: string, status: number, meta?: Record<string, unknown>) => json({ error: { code, message, ...(meta ? { meta } : {}) } }, status);

export const routeOf = (pathname: string): string[] => {
  const parts = pathname.split('/').filter(Boolean);
  const fn = parts.indexOf('kyc');
  return fn >= 0 ? parts.slice(fn + 1) : parts;
};

export const createKycHandler = (cfg: KycConfig, service: KycService) => {
  const authorized = (req: Request) => {
    if (!cfg.apiSecret) return false;
    const got = req.headers.get('x-kyc-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    return safeEqual(got, cfg.apiSecret);
  };
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const r = routeOf(url.pathname);
    const route = r.join('/');
    try {
      if (route === 'health' && req.method === 'GET') return json(authorized(req) ? { ok: true, environment: cfg.environment, signed: cfg.signed } : { ok: true });
      if (route === 'digilocker/return' && req.method === 'GET') {
        return new Response('DigiLocker finished. You can go back to the OneLocal Rider app.', {
          status: 302,
          headers: { Location: service.returnLocation(cfg.appReturnUrl, url.searchParams.get('v') ?? url.searchParams.get('verification_id')), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      if (!authorized(req)) return error('unauthorized', 'Missing or invalid x-kyc-secret', 401);
      const body = async () => (await req.json()) as never;
      if (req.method === 'POST') {
        if (route === 'digilocker/start') return json(await service.startDigilocker(await body()));
        if (route === 'digilocker/complete') return json(await service.completeDigilocker(await body()));
        if (route === 'pan') return json(await service.verifyPan(await body()));
        if (route === 'selfie') return json(await service.verifySelfie(await body()));
        if (route === 'driving-licence') return json(await service.verifyDrivingLicence(await body()));
        if (route === 'vehicle-rc') return json(await service.verifyVehicleRc(await body()));
      }
      if (r[0] === 'riders' && r.length === 2 && req.method === 'GET') return json(await service.getSummary(decodeURIComponent(r[1] ?? '')));
      return error('not_found', `No route ${req.method} /${route}`, 404);
    } catch (e) {
      if (e instanceof KycError) return error(e.code, e.message, e.status, e.meta);
      if (e instanceof SyntaxError) return error('validation', 'JSON body expected', 400);
      console.log(JSON.stringify({ event: 'kyc.error', route, error: e instanceof Error ? e.message : String(e) }));
      return error('internal', 'Internal error', 500);
    }
  };
};

export const createKycHandlerFromEnv = (env: EnvGetter) => {
  const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ event, ...data }));
  let handler: ((req: Request) => Promise<Response>) | null = null;
  return async (req: Request): Promise<Response> => {
    if (!handler) {
      try {
        const cfg = loadKycConfig(env, { log });
        handler = createKycHandler(cfg, createKycService(cfg.deps));
      } catch (e) {
        return error('unconfigured', e instanceof Error ? e.message : String(e), 500);
      }
    }
    return handler(req);
  };
};
