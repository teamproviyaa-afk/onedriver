/**
 * HTTP surface of the `payouts` Edge Function (server-to-server; the rider app never calls it).
 *
 *   POST /accounts/verify              verify bank / UPI with Cashfree, save as primary   (x-payouts-secret)
 *   POST /transfers                    create a payout (idempotencyKey required)          (x-payouts-secret)
 *   GET  /transfers/<transferId>       status (refreshed from Cashfree while pending)     (x-payouts-secret)
 *   GET  /riders/<riderId>/payouts     payout history                                     (x-payouts-secret)
 *   POST /webhooks/cashfree            Cashfree transfer events (x-webhook-signature)
 *   POST /sweep                        reconcile pending payouts (cron)                   (x-payouts-secret)
 *   GET  /health
 */
import { safeEqual } from '../messaging/crypto.ts';
import type { EnvGetter, PayoutsConfig } from './config.ts';
import { loadPayoutsConfig } from './config.ts';
import { createPayoutService } from './service.ts';
import type { PayoutService } from './service.ts';
import { PayoutError } from './types.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const error = (code: string, message: string, status: number, meta?: Record<string, unknown>) => json({ error: { code, message, ...(meta ? { meta } : {}) } }, status);

export const routeOf = (pathname: string): string[] => {
  const parts = pathname.split('/').filter(Boolean);
  const i = parts.lastIndexOf('payouts');
  // "/functions/v1/payouts/riders/r1/payouts" → the function name is the first "payouts" after v1.
  const fn = parts.indexOf('payouts');
  return fn >= 0 && i >= 0 ? parts.slice(fn + 1) : parts;
};

export const createPayoutsHandler = (cfg: PayoutsConfig, service: PayoutService) => {
  const authorized = (req: Request) => {
    if (!cfg.apiSecret) return false;
    const got = req.headers.get('x-payouts-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    return safeEqual(got, cfg.apiSecret);
  };
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const r = routeOf(url.pathname);
    const route = r.join('/');
    try {
      if (route === 'health' && req.method === 'GET') return json(authorized(req) ? { ok: true, environment: cfg.environment } : { ok: true });
      if (route === 'webhooks/cashfree' && req.method === 'POST') {
        const raw = await req.text();
        const result = await service.handleWebhook(raw, { signature: req.headers.get('x-webhook-signature'), timestamp: req.headers.get('x-webhook-timestamp') });
        return json({ result });
      }
      if (!authorized(req)) return error('unauthorized', 'Missing or invalid x-payouts-secret', 401);
      if (route === 'accounts/verify' && req.method === 'POST') return json(await service.verifyAccount((await req.json()) as never));
      if (route === 'transfers' && req.method === 'POST') return json(await service.createPayout((await req.json()) as never));
      if (r[0] === 'transfers' && r.length === 2 && req.method === 'GET') return json(await service.getPayout(decodeURIComponent(r[1] ?? '')));
      if (r[0] === 'riders' && r[2] === 'payouts' && r.length === 3 && req.method === 'GET') return json({ payouts: await service.listPayouts(decodeURIComponent(r[1] ?? ''), Number(url.searchParams.get('limit') ?? 20)) });
      if (route === 'sweep' && req.method === 'POST') return json(await service.sweep());
      return error('not_found', `No route ${req.method} /${route}`, 404);
    } catch (e) {
      if (e instanceof PayoutError) return error(e.code, e.message, e.status, e.meta);
      if (e instanceof SyntaxError) return error('validation', 'JSON body expected', 400);
      console.log(JSON.stringify({ event: 'payouts.error', route, error: e instanceof Error ? e.message : String(e) }));
      return error('internal', 'Internal error', 500);
    }
  };
};

export const createPayoutsHandlerFromEnv = (env: EnvGetter) => {
  const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ event, ...data }));
  let handler: ((req: Request) => Promise<Response>) | null = null;
  return async (req: Request): Promise<Response> => {
    if (!handler) {
      try {
        const cfg = loadPayoutsConfig(env, { log });
        handler = createPayoutsHandler(cfg, createPayoutService(cfg.deps));
      } catch (e) {
        return error('unconfigured', e instanceof Error ? e.message : String(e), 500);
      }
    }
    return handler(req);
  };
};
