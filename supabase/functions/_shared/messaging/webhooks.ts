/** Provider webhook verification and parsing (delivery statuses) + Supabase Auth hook signatures. */
import type { MessageStatus, StatusUpdate } from './types.ts';
import { base64ToBytes, hmacSha1Base64, hmacSha256Base64, hmacSha256Hex, safeEqual } from './crypto.ts';
import { META_NOT_ON_WHATSAPP_CODES } from './providers/metaWhatsApp.ts';
import { TWILIO_NOT_ON_WHATSAPP_CODES } from './providers/twilio.ts';

// ── Meta (WhatsApp Cloud API) ───────────────────────────────────────────────

/** X-Hub-Signature-256: "sha256=<hex HMAC of the raw body with the app secret>". */
export const verifyMetaSignature = async (rawBody: string, header: string | null, appSecret: string): Promise<boolean> => {
  if (!header?.startsWith('sha256=') || !appSecret) return false;
  return safeEqual(header.slice(7), await hmacSha256Hex(appSecret, rawBody));
};

const META_STATUS: Record<string, MessageStatus> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };

export const parseMetaWebhook = (body: unknown): StatusUpdate[] => {
  const out: StatusUpdate[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry ?? [];
  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] }).changes ?? []) {
      const statuses = ((change as { value?: { statuses?: unknown[] } }).value?.statuses ?? []) as {
        id?: string;
        status?: string;
        errors?: { code?: number | string; title?: string; message?: string; error_data?: { details?: string } }[];
      }[];
      for (const s of statuses) {
        const status = s.status ? META_STATUS[s.status] : undefined;
        if (!s.id || !status) continue;
        const err = s.errors?.[0];
        const code = err?.code !== undefined ? String(err.code) : undefined;
        out.push({
          provider: 'meta',
          providerMessageId: s.id,
          status,
          errorCode: code,
          errorMessage: err ? (err.error_data?.details ?? err.message ?? err.title) : undefined,
          notOnWhatsApp: code ? META_NOT_ON_WHATSAPP_CODES.has(code) : false,
        });
      }
    }
  }
  return out;
};

// ── Twilio ──────────────────────────────────────────────────────────────────

/** X-Twilio-Signature: base64 HMAC-SHA1 of the full callback URL + sorted POST params (key+value). */
export const verifyTwilioSignature = async (url: string, params: Record<string, string>, header: string | null, authToken: string): Promise<boolean> => {
  if (!header || !authToken) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return safeEqual(header, await hmacSha1Base64(authToken, data));
};

const TWILIO_STATUS: Record<string, MessageStatus> = {
  accepted: 'sent',
  queued: 'sent',
  sending: 'sent',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  undelivered: 'failed',
  failed: 'failed',
};

export const parseTwilioStatus = (params: Record<string, string>): StatusUpdate | null => {
  const sid = params.MessageSid ?? params.SmsSid;
  const status = TWILIO_STATUS[params.MessageStatus ?? params.SmsStatus ?? ''];
  if (!sid || !status) return null;
  const code = params.ErrorCode || undefined;
  const isWhatsApp = (params.To ?? '').startsWith('whatsapp:') || (params.From ?? '').startsWith('whatsapp:');
  return {
    provider: 'twilio',
    providerMessageId: sid,
    status,
    errorCode: code,
    errorMessage: params.ErrorMessage || params.ChannelStatusMessage || undefined,
    notOnWhatsApp: isWhatsApp && !!code && TWILIO_NOT_ON_WHATSAPP_CODES.has(code),
  };
};

// ── Supabase Auth hooks (Standard Webhooks) ────────────────────────────────

/**
 * Verifies the Send SMS hook call from Supabase Auth: headers webhook-id, webhook-timestamp,
 * webhook-signature ("v1,<base64>" entries); secret as shown in the dashboard ("v1,whsec_<base64>").
 */
export const verifyStandardWebhook = async (
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<boolean> => {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const keyB64 = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  const expected = await hmacSha256Base64(base64ToBytes(keyB64), `${headers.id}.${headers.timestamp}.${rawBody}`);
  return headers.signature
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((sig) => safeEqual(sig, expected));
};
