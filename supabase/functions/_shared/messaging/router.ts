/**
 * HTTP surface of the `notify` Edge Function (runtime-agnostic: standard Request/Response).
 *
 *   POST /send               server-to-server: send a template            (x-notify-secret)
 *   POST /sweep              SMS for WhatsApp messages past their deadline (x-notify-secret, cron)
 *   GET  /webhooks/meta      WhatsApp webhook verification challenge
 *   POST /webhooks/meta      WhatsApp delivery statuses                    (X-Hub-Signature-256)
 *   POST /webhooks/twilio    Twilio status callbacks                       (X-Twilio-Signature)
 *   POST /hooks/send-sms     Supabase Auth "Send SMS" hook → login OTP     (Standard Webhooks)
 *   GET  /health             liveness (+ provider summary with the secret)
 */
import type { Messenger } from './orchestrator.ts';
import { createMessenger } from './orchestrator.ts';
import type { EnvGetter, NotifyConfig } from './config.ts';
import { loadNotifyConfig } from './config.ts';
import { MessagingError } from './types.ts';
import type { SendRequest } from './types.ts';
import { safeEqual } from './crypto.ts';
import { parseMetaWebhook, parseTwilioStatus, verifyMetaSignature, verifyStandardWebhook, verifyTwilioSignature } from './webhooks.ts';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const errorJson = (code: string, message: string, status: number): Response => json({ error: { code, message } }, status);

/** "/notify/send", "/functions/v1/notify/send" → "send". */
export const routeOf = (pathname: string): string => {
  const parts = pathname.split('/').filter(Boolean);
  const i = parts.lastIndexOf('notify');
  return (i >= 0 ? parts.slice(i + 1) : parts).join('/');
};

export interface HandlerOptions {
  nowSeconds?: () => number;
  log?: (event: string, data: Record<string, unknown>) => void;
}

export const createNotifyHandler = (cfg: NotifyConfig, messenger: Messenger, opts: HandlerOptions = {}) => {
  const nowSeconds = opts.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const log = opts.log ?? (() => {});

  const authorized = (req: Request): boolean => {
    if (!cfg.apiSecret) return false; // never open without a secret
    const header = req.headers.get('x-notify-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    return safeEqual(header, cfg.apiSecret);
  };

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const route = routeOf(url.pathname);
    try {
      if (route === 'health' && req.method === 'GET') {
        return json(authorized(req) ? { ok: true, providers: cfg.summary } : { ok: true });
      }

      if (route === 'send' && req.method === 'POST') {
        if (!authorized(req)) return errorJson('unauthorized', 'Missing or invalid x-notify-secret', 401);
        const body = (await req.json().catch(() => null)) as SendRequest | null;
        if (!body) return errorJson('validation', 'JSON body expected', 400);
        return json(await messenger.send(body));
      }

      if (route === 'sweep' && req.method === 'POST') {
        if (!authorized(req)) return errorJson('unauthorized', 'Missing or invalid x-notify-secret', 401);
        return json(await messenger.sweep());
      }

      if (route === 'webhooks/meta' && req.method === 'GET') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token') ?? '';
        const challenge = url.searchParams.get('hub.challenge') ?? '';
        if (mode === 'subscribe' && cfg.metaVerifyToken && safeEqual(token, cfg.metaVerifyToken)) return new Response(challenge, { status: 200 });
        return errorJson('forbidden', 'Verification failed', 403);
      }

      if (route === 'webhooks/meta' && req.method === 'POST') {
        const raw = await req.text();
        if (!(await verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), cfg.metaAppSecret))) return errorJson('unauthorized', 'Bad signature', 401);
        const updates = parseMetaWebhook(JSON.parse(raw) as unknown);
        let applied = 0;
        for (const u of updates) if ((await messenger.handleStatus(u)) === 'updated') applied += 1;
        return json({ received: updates.length, applied });
      }

      if (route === 'webhooks/twilio' && req.method === 'POST') {
        const raw = await req.text();
        const params = Object.fromEntries(new URLSearchParams(raw));
        const signedUrl = cfg.publicUrl ? `${cfg.publicUrl}/webhooks/twilio` : `${url.origin}${url.pathname}`;
        if (!(await verifyTwilioSignature(signedUrl, params, req.headers.get('x-twilio-signature'), cfg.twilioAuthToken))) return errorJson('unauthorized', 'Bad signature', 401);
        const update = parseTwilioStatus(params);
        if (update) await messenger.handleStatus(update);
        return new Response(null, { status: 204 });
      }

      if (route === 'hooks/send-sms' && req.method === 'POST') {
        const raw = await req.text();
        const ok = await verifyStandardWebhook(
          raw,
          { id: req.headers.get('webhook-id'), timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature') },
          cfg.sendSmsHookSecret,
          nowSeconds(),
        );
        if (!ok) return json({ error: { http_code: 401, message: 'Invalid hook signature' } }, 401);
        const body = JSON.parse(raw) as { user?: { id?: string; phone?: string }; sms?: { otp?: string } };
        const phone = body.user?.phone ?? '';
        const otp = body.sms?.otp ?? '';
        const result = await messenger.send({ template: 'login_otp', to: { phone: phone.startsWith('+') ? phone : `+${phone}` }, params: { otp }, related: { type: 'auth_user', id: body.user?.id ?? 'unknown' } });
        if (result.phone?.status === 'sent') return json({});
        return json({ error: { http_code: 502, message: 'Could not deliver the code. Try again.' } }, 502);
      }

      return errorJson('not_found', `No route ${req.method} /${route}`, 404);
    } catch (e) {
      if (e instanceof MessagingError) {
        if (route === 'hooks/send-sms') return json({ error: { http_code: e.status, message: e.message } }, e.status);
        return errorJson(e.code, e.message, e.status);
      }
      log('notify.error', { route, error: e instanceof Error ? e.message : String(e) });
      return errorJson('internal', 'Internal error', 500);
    }
  };
};

/** Lazily builds config + messenger from the environment so a missing secret is a clear 500, not a crash. */
export const createNotifyHandlerFromEnv = (env: EnvGetter) => {
  const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ event, ...data }));
  let handler: ((req: Request) => Promise<Response>) | null = null;
  return async (req: Request): Promise<Response> => {
    if (!handler) {
      try {
        const cfg = loadNotifyConfig(env, { log });
        handler = createNotifyHandler(cfg, createMessenger(cfg.deps), { log });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log('notify.config_error', { error: message });
        return errorJson('unconfigured', message, 500);
      }
    }
    return handler(req);
  };
};
