-- OneLocal rider KYC on Cashfree Secure ID. Server-only: RLS on, no client policies, client roles
-- revoked. Only masked numbers are kept (never a full Aadhaar number, never document images).
-- The Aadhaar photo used for the selfie face match is AES-GCM encrypted and deleted after the match,
-- or after 24 hours at the latest.

create table if not exists public.kyc_profiles (
  rider_id text primary key,
  legal_name text,
  dob date,
  gender text,
  aadhaar_last4 text check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  aadhaar_verified_at timestamptz,
  digilocker_verification_id text,
  digilocker_started_at timestamptz,
  aadhaar_photo_enc text,
  aadhaar_photo_at timestamptz,
  pan_masked text,
  pan_verified_at timestamptz,
  liveness_score numeric,
  face_match_score numeric,
  selfie_verified_at timestamptz,
  dl_masked text,
  dl_verified_at timestamptz,
  dl_expires_on date,
  rc_number text,
  rc_verified_at timestamptz,
  rc_expires_on date,
  updated_at timestamptz not null default now()
);

-- One row per Cashfree call: the audit trail and the daily attempt limit. No numbers or images.
create table if not exists public.kyc_checks (
  id uuid primary key,
  rider_id text not null,
  kind text not null check (kind in ('aadhaar', 'pan', 'selfie', 'dl', 'rc')),
  verification_id text not null,
  status text not null check (status in ('verified', 'pending', 'rejected', 'error')),
  reason text,
  reference_id text,
  created_at timestamptz not null default now()
);
create index if not exists kyc_checks_rider_idx on public.kyc_checks (rider_id, kind, created_at desc);

alter table public.kyc_profiles enable row level security;
alter table public.kyc_checks enable row level security;
revoke all on table public.kyc_profiles from anon, authenticated;
revoke all on table public.kyc_checks from anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'kyc-purge-aadhaar-photo';
select cron.schedule('kyc-purge-aadhaar-photo', '17 * * * *', $job$
  update public.kyc_profiles set aadhaar_photo_enc = null, aadhaar_photo_at = null, updated_at = now()
   where aadhaar_photo_enc is not null and aadhaar_photo_at < now() - interval '24 hours';
$job$);
