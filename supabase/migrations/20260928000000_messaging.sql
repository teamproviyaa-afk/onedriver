-- OneLocal messaging: WhatsApp → SMS fallback log and WhatsApp capability cache.
--
-- Server-only tables: RLS is enabled with no policies and client roles are revoked, so the
-- rider app's publishable key can neither read nor write them. The `notify` Edge Function
-- uses the service key. Phone numbers and emails are stored only as a peppered hash plus a
-- masked form; the payload needed for a pending SMS fallback is AES-GCM encrypted and purged
-- as soon as WhatsApp delivers, the fallback is sent, or after one day at the latest.

create table if not exists public.message_log (
  id uuid primary key,
  request_id uuid not null,
  idempotency_key text unique,
  template text not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  provider text not null,
  provider_message_id text,
  to_hash text not null,
  to_masked text not null,
  status text not null check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  error_message text,
  fallback_of uuid references public.message_log (id) on delete set null,
  fallback_due_at timestamptz,
  fallback_sent_at timestamptz,
  fallback_reason text,
  payload_enc text,
  related_type text,
  related_id text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_log_provider_msg_idx on public.message_log (provider, provider_message_id) where provider_message_id is not null;
create index if not exists message_log_recipient_idx on public.message_log (template, to_hash, created_at desc);
create index if not exists message_log_due_fallback_idx on public.message_log (fallback_due_at) where fallback_sent_at is null and payload_enc is not null;
create index if not exists message_log_request_idx on public.message_log (request_id);
create index if not exists message_log_related_idx on public.message_log (related_type, related_id);

create table if not exists public.whatsapp_capability (
  phone_hash text primary key,
  capable boolean not null,
  reason text,
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.message_log enable row level security;
alter table public.whatsapp_capability enable row level security;
revoke all on table public.message_log from anon, authenticated;
revoke all on table public.whatsapp_capability from anon, authenticated;

-- Safety net: encrypted fallback payloads never outlive a day.
create or replace function public.purge_message_payloads()
returns void
language sql
security definer
set search_path = public
as $$
  update public.message_log
     set payload_enc = null, updated_at = now()
   where payload_enc is not null
     and created_at < now() - interval '1 day';
$$;
revoke all on function public.purge_message_payloads() from public, anon, authenticated;
