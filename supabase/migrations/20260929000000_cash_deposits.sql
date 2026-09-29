-- OneLocal cash deposits on Cashfree Payment Gateway: a rider pays the COD cash they hold back to
-- OneLocal through a payment link (UPI by default). Server-only: RLS on, no client policies,
-- client roles revoked. No card or bank details are stored — only Cashfree references.

create table if not exists public.cash_deposits (
  id uuid primary key,
  link_id text not null unique,
  rider_id text not null,
  amount_paise bigint not null check (amount_paise > 0),
  amount_paid_paise bigint not null default 0 check (amount_paid_paise >= 0),
  status text not null check (status in ('pending', 'paid', 'expired', 'cancelled', 'failed')),
  cf_link_id text,
  link_url text,
  expires_at timestamptz,
  cf_order_id text,
  cf_payment_id text,
  bank_reference text,
  payment_group text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists cash_deposits_rider_idx on public.cash_deposits (rider_id, created_at desc);
create index if not exists cash_deposits_pending_idx on public.cash_deposits (updated_at) where status = 'pending';

alter table public.cash_deposits enable row level security;
revoke all on table public.cash_deposits from anon, authenticated;

-- Reconciliation: every minute the function re-reads deposits still pending from Cashfree.
-- URL and secret come from Vault at run time (stored by supabase/setup-payments.sh).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'payments-sweep';

select cron.schedule('payments-sweep', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'payments_sweep_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-payments-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'payments_api_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'payments_sweep_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'payments_api_secret');
$job$);
