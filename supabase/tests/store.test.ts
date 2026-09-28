import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFetch, jsonResponse } from './helpers.ts';
import { createSupabaseRestStore, fromRow, toRow } from '../functions/_shared/messaging/store/supabaseRest.ts';
import { DuplicateRequestError } from '../functions/_shared/messaging/types.ts';

test('row mapping: snake_case columns and normalised timestamps', () => {
  assert.deepEqual(toRow({ requestId: 'r', providerMessageId: 'p', fallbackDueAt: '2026-09-28T10:00:30.000Z' }), { request_id: 'r', provider_message_id: 'p', fallback_due_at: '2026-09-28T10:00:30.000Z' });
  const rec = fromRow({ id: 'a', created_at: '2026-09-28T10:00:00+00:00', fallback_due_at: null, result: { ok: 1 } });
  assert.equal(rec.createdAt, '2026-09-28T10:00:00.000Z');
  assert.equal(rec.fallbackDueAt, null);
  assert.deepEqual(rec.result, { ok: 1 });
});

test('claimFallback is a conditional update on fallback_sent_at IS NULL', async () => {
  let rows: unknown[] = [{ id: 'x' }];
  const f = fakeFetch(() => jsonResponse(rows));
  const store = createSupabaseRestStore({ url: 'https://ref.supabase.co/', serviceKey: 'sb_secret_abc', fetch: f.fn });
  assert.equal(await store.claimFallback('x', '2026-09-28T10:00:00.000Z', 'whatsapp_timeout'), true);
  const call = f.calls[0]!;
  assert.equal(call.init.method, 'PATCH');
  assert.equal(call.url, 'https://ref.supabase.co/rest/v1/message_log?id=eq.x&fallback_sent_at=is.null');
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.apikey, 'sb_secret_abc');
  assert.equal(headers.Authorization, undefined, 'new secret keys are not sent as a bearer JWT');
  assert.equal(headers.Prefer, 'return=representation');
  rows = [];
  assert.equal(await store.claimFallback('x', '2026-09-28T10:00:00.000Z', 'whatsapp_timeout'), false);
});

test('insert conflict → DuplicateRequestError; legacy JWT keys also sent as bearer', async () => {
  const f = fakeFetch(() => new Response('{"code":"23505"}', { status: 409 }));
  const store = createSupabaseRestStore({ url: 'https://ref.supabase.co', serviceKey: 'eyJhbGciOi.legacy', fetch: f.fn });
  await assert.rejects(store.insert({ id: 'a' } as never), (e: unknown) => e instanceof DuplicateRequestError);
  assert.equal((f.calls[0]!.init.headers as Record<string, string>).Authorization, 'Bearer eyJhbGciOi.legacy');
});

test('due fallbacks query filters on channel, deadline, status and pending payload', async () => {
  const f = fakeFetch(() => jsonResponse([]));
  const store = createSupabaseRestStore({ url: 'https://ref.supabase.co', serviceKey: 'k', fetch: f.fn });
  await store.listDueFallbacks('2026-09-28T10:00:00.000Z', 25);
  const url = decodeURIComponent(f.calls[0]!.url);
  for (const part of ['channel=eq.whatsapp', 'fallback_sent_at=is.null', 'payload_enc=not.is.null', 'fallback_due_at=lte.2026-09-28T10:00:00.000Z', 'status=in.(queued,sent)', 'limit=25']) assert.ok(url.includes(part), part);
});
