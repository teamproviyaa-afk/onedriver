/**
 * HTTP surface of the `payments` Edge Function (server-to-server, except the checkout return).
 *
 *   POST /deposits                     create a cash deposit link (idempotencyKey required)   (x-payments-secret)
 *   GET  /deposits/<id>                status (refreshed from Cashfree while pending)          (x-payments-secret)
 *   GET  /riders/<riderId>/deposits    deposit history                                         (x-payments-secret)
 *   POST /webhooks/cashfree            Cashfree PG events (x-webhook-signature)
 *   GET  /return?d=<id>                checkout return → 302 back into the app
 *   POST /sweep                        reconcile pending deposits (cron)                       (x-payments-secret)
 *   GET  /health
 */
import { safeEqual } from '../messaging/crypto.ts';
import type { EnvGetter, PaymentsConfig } from './config.ts';
import { loadPaymentsConfig } from './config.ts';
import { createPaymentsService } from './service.ts';
import type { PaymentsService } from './service.ts';
import { PaymentError } from './types.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const error = (code: string, message: string, status: number, meta?: Record<string, unknown>) => json({ error: { code, message, ...(meta ? { meta } : {}) } }, status);

export const routeOf = (pathname: string): string[] => {
  const parts = pathname.split('/').filter(Boolean);
  const fn = parts.indexOf('payments');
  return fn >= 0 ? parts.slice(fn + 1) : parts;
};

export const createPaymentsHandler = (cfg: PaymentsConfig, service: PaymentsService) => {
  const authorized = (req: Request) => {
    if (!cfg.apiSecret) return false;
    const got = req.headers.get('x-payments-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    return safeEqual(got, cfg.apiSecret);
  };
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const r = routeOf(url.pathname);
    const route = r.join('/');
    try {
      if (route === 'health' && req.method === 'GET') return json(authorized(req) ? { ok: true, environment: cfg.environment } : { ok: true });
      if (route === 'return' && req.method === 'GET') {
        return new Response('Payment finished. You can go back to the OneLocal Rider app.', {
          status: 302,
          headers: { Location: service.returnLocation(cfg.appReturnUrl, url.searchParams.get('d')), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      if (route === 'webhooks/cashfree' && req.method === 'POST') {
        const raw = await req.text();
        const result = await service.handleWebhook(raw, { signature: req.headers.get('x-webhook-signature'), timestamp: req.headers.get('x-webhook-timestamp') });
        return json({ result });
      }
      if (!authorized(req)) return error('unauthorized', 'Missing or invalid x-payments-secret', 401);
      if (route === 'deposits' && req.method === 'POST') return json(await service.createDeposit((await req.json()) as never));
      if (r[0] === 'deposits' && r.length === 2 && req.method === 'GET') return json(await service.getDeposit(decodeURIComponent(r[1] ?? '')));
      if (r[0] === 'riders' && r[2] === 'deposits' && r.length === 3 && req.method === 'GET') return json({ deposits: await service.listDeposits(decodeURIComponent(r[1] ?? ''), Number(url.searchParams.get('limit') ?? 20)) });
      if (route === 'sweep' && req.method === 'POST') return json(await service.sweep());
      return error('not_found', `No route ${req.method} /${route}`, 404);
    } catch (e) {
      if (e instanceof PaymentError) return error(e.code, e.message, e.status, e.meta);
      if (e instanceof SyntaxError) return error('validation', 'JSON body expected', 400);
      console.log(JSON.stringify({ event: 'payments.error', route, error: e instanceof Error ? e.message : String(e) }));
      return error('internal', 'Internal error', 500);
    }
  };
};

export const createPaymentsHandlerFromEnv = (env: EnvGetter) => {
  const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ event, ...data }));
  let handler: ((req: Request) => Promise<Response>) | null = null;
  return async (req: Request): Promise<Response> => {
    if (!handler) {
      try {
        const cfg = loadPaymentsConfig(env, { log });
        handler = createPaymentsHandler(cfg, createPaymentsService(cfg.deps));
      } catch (e) {
        return error('unconfigured', e instanceof Error ? e.message : String(e), 500);
      }
    }
    return handler(req);
  };
};
