-- OneLocal rider payouts on Cashfree: verified payout accounts (Cashfree beneficiaries) and
-- transfers. Server-only: RLS on, no client policies, client roles revoked. Only masked account
-- data is stored; the contact used for the payout_sent message is AES-GCM encrypted and deleted
-- once the payout is final (at the latest after 7 days).

create table if not exists public.payout_accounts (
  id uuid primary key,
  rider_id text not null,
  method text not null check (method in ('bank', 'upi')),
  beneficiary_id text not null,
  account_last4 text,
  ifsc text,
  vpa_masked text,
  bank_name text,
  name_at_bank text not null,
  name_match text not null check (name_match in ('good', 'partial', 'poor')),
  status text not null check (status in ('verified', 'rejected')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rider_id, beneficiary_id)
);
create index if not exists payout_accounts_primary_idx on public.payout_accounts (rider_id) where is_primary;

create table if not exists public.payouts (
  id uuid primary key,
  transfer_id text not null unique,
  rider_id text not null,
  account_id uuid not null references public.payout_accounts (id),
  amount_paise bigint not null check (amount_paise > 0),
  mode text not null check (mode in ('upi', 'imps')),
  kind text not null check (kind in ('instant', 'weekly')),
  status text not null check (status in ('processing', 'unknown', 'success', 'failed', 'reversed')),
  cf_transfer_id text,
  utr text,
  status_code text,
  status_description text,
  destination_masked text not null,
  period_label text,
  contact_enc text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists payouts_rider_idx on public.payouts (rider_id, created_at desc);
create index if not exists payouts_pending_idx on public.payouts (updated_at) where status in ('processing', 'unknown');

alter table public.payout_accounts enable row level security;
alter table public.payouts enable row level security;
revoke all on table public.payout_accounts from anon, authenticated;
revoke all on table public.payouts from anon, authenticated;

-- Reconciliation: every minute the function asks Cashfree about payouts still in flight.
-- URL and secret come from Vault at run time (stored by supabase/setup-payouts.sh).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname in ('payouts-sweep', 'payouts-purge-contact');

select cron.schedule('payouts-sweep', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'payouts_sweep_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-payouts-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'payouts_api_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'payouts_sweep_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'payouts_api_secret');
$job$);

select cron.schedule('payouts-purge-contact', '23 * * * *', $job$
  update public.payouts set contact_enc = null, updated_at = now()
   where contact_enc is not null and created_at < now() - interval '7 days';
$job$);
