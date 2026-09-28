/**
 * MessageStore on Supabase Postgres through PostgREST, using the service key available to
 * Edge Functions. Tables: public.message_log, public.whatsapp_capability (RLS on, no client
 * policies — the app's publishable key can never read them).
 */
import type { FallbackReason, MessageRecord, MessageStore, ProviderName, TemplateId, WhatsAppCapability } from '../types.ts';
import { DuplicateRequestError } from '../types.ts';
import type { FetchLike } from '../providers/http.ts';

export interface SupabaseRestConfig {
  url: string;
  serviceKey: string;
  fetch?: FetchLike;
}

const COLUMNS: Record<keyof MessageRecord, string> = {
  id: 'id',
  requestId: 'request_id',
  idempotencyKey: 'idempotency_key',
  template: 'template',
  channel: 'channel',
  provider: 'provider',
  providerMessageId: 'provider_message_id',
  toHash: 'to_hash',
  toMasked: 'to_masked',
  status: 'status',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  fallbackOf: 'fallback_of',
  fallbackDueAt: 'fallback_due_at',
  fallbackSentAt: 'fallback_sent_at',
  fallbackReason: 'fallback_reason',
  payloadEnc: 'payload_enc',
  relatedType: 'related_type',
  relatedId: 'related_id',
  result: 'result',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};
const TIMESTAMP_KEYS = new Set<keyof MessageRecord>(['fallbackDueAt', 'fallbackSentAt', 'createdAt', 'updatedAt']);

/** Postgres returns "…+00:00"; the orchestrator compares ISO strings, so normalise to "…Z". */
const normTs = (v: unknown): string | null => (typeof v === 'string' && v ? new Date(v).toISOString() : null);

export const toRow = (r: Partial<MessageRecord>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    const col = COLUMNS[k as keyof MessageRecord];
    if (col && v !== undefined) row[col] = v;
  }
  return row;
};

export const fromRow = (row: Record<string, unknown>): MessageRecord => {
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(COLUMNS)) {
    const v = row[col];
    out[k] = TIMESTAMP_KEYS.has(k as keyof MessageRecord) ? normTs(v) : (v ?? null);
  }
  return out as unknown as MessageRecord;
};

const q = (v: string) => encodeURIComponent(v);

export const createSupabaseRestStore = (cfg: SupabaseRestConfig): MessageStore => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  const base = `${cfg.url.replace(/\/$/, '')}/rest/v1`;
  const headers = (prefer?: string): Record<string, string> => ({
    apikey: cfg.serviceKey,
    // Legacy service_role keys are JWTs; new sb_secret_ keys are sent as apikey only.
    ...(cfg.serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${cfg.serviceKey}` } : {}),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  });

  const call = async (method: string, path: string, body?: unknown, prefer?: string): Promise<Response> => {
    const res = await fetchFn(`${base}/${path}`, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
    return res;
  };
  const fail = async (res: Response, what: string): Promise<never> => {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${what} failed (${res.status}): ${text.slice(0, 200)}`);
  };
  const rows = async (res: Response, what: string): Promise<Record<string, unknown>[]> => {
    if (!res.ok) return fail(res, what);
    const v = (await res.json()) as unknown;
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  };
  const one = async (path: string, what: string): Promise<MessageRecord | null> => {
    const r = await rows(await call('GET', path), what);
    return r[0] ? fromRow(r[0]) : null;
  };

  return {
    async insert(record) {
      const res = await call('POST', 'message_log', toRow(record), 'return=minimal');
      if (res.status === 409) throw new DuplicateRequestError();
      if (!res.ok) await fail(res, 'insert');
    },
    async update(id, patch) {
      const res = await call('PATCH', `message_log?id=eq.${q(id)}`, toRow(patch), 'return=minimal');
      if (!res.ok) await fail(res, 'update');
    },
    get: (id) => one(`message_log?id=eq.${q(id)}&limit=1`, 'get'),
    findByIdempotencyKey: (key) => one(`message_log?idempotency_key=eq.${q(key)}&limit=1`, 'find by idempotency key'),
    findByProviderMessageId: (provider: ProviderName, pid: string) => one(`message_log?provider=eq.${q(provider)}&provider_message_id=eq.${q(pid)}&limit=1`, 'find by provider id'),
    async listRecent(template: TemplateId, toHash: string, sinceIso: string) {
      const r = await rows(await call('GET', `message_log?template=eq.${q(template)}&to_hash=eq.${q(toHash)}&created_at=gte.${q(sinceIso)}&order=created_at.desc&limit=50`), 'list recent');
      return r.map(fromRow);
    },
    async claimFallback(id: string, atIso: string, reason: FallbackReason) {
      // Conditional update: only one caller can move fallback_sent_at from NULL.
      const res = await call('PATCH', `message_log?id=eq.${q(id)}&fallback_sent_at=is.null`, { fallback_sent_at: atIso, fallback_reason: reason, updated_at: atIso }, 'return=representation');
      return (await rows(res, 'claim fallback')).length === 1;
    },
    async listDueFallbacks(nowIso: string, limit: number) {
      const r = await rows(
        await call('GET', `message_log?channel=eq.whatsapp&fallback_sent_at=is.null&payload_enc=not.is.null&fallback_due_at=lte.${q(nowIso)}&status=in.(queued,sent)&order=fallback_due_at.asc&limit=${limit}`),
        'list due fallbacks',
      );
      return r.map(fromRow);
    },
    async getCapability(hash: string): Promise<WhatsAppCapability | null> {
      const r = await rows(await call('GET', `whatsapp_capability?phone_hash=eq.${q(hash)}&limit=1`), 'get capability');
      const row = r[0];
      if (!row) return null;
      return { capable: row.capable === true, expiresAt: normTs(row.expires_at) ?? new Date(0).toISOString(), reason: (row.reason as string | null) ?? null };
    },
    async setCapability(hash: string, cap: WhatsAppCapability) {
      const res = await call('POST', 'whatsapp_capability', { phone_hash: hash, capable: cap.capable, expires_at: cap.expiresAt, reason: cap.reason, checked_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
      if (!res.ok) await fail(res, 'set capability');
    },
  };
};
