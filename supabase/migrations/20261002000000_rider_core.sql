-- =============================================================================================
-- OneLocal Rider — core schema (spec §6, "Schema", additive).
--
-- Geography, riders, onboarding, dispatch, the 12-state delivery engine, proofs, exceptions,
-- earnings, the cash ledger and notifications. Messaging, payouts, UPI cash deposits and KYC have
-- their own migrations (message_log, payout_accounts / payouts, cash_deposits, kyc_profiles).
--
-- Rules (spec): RLS on every table; server-only writes (service role); a rider may only *read*
-- their own rows where the app needs Realtime; no customer data is readable by riders directly.
-- Money is numeric(10,2) rupees here (the Cashfree tables keep paise).
-- =============================================================================================

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
set search_path = public, extensions;

-- ── Platform tables (owned by the One Local Master) ───────────────────────────────────────────
-- Created (and locked down) only when missing, so this project is self-contained. On the Master
-- database they already exist and are left exactly as they are: no columns, comments, grants or
-- RLS changes.

do $master$
begin
  if to_regclass('public.organizations') is null then
    create table public.organizations (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      kind text not null default 'merchant',
      created_at timestamptz not null default now()
    );
    comment on table public.organizations is 'Master: merchant / store-chain organisations.';
    alter table public.organizations enable row level security;
    revoke all on table public.organizations from anon, authenticated;
  end if;

  if to_regclass('public.ol_service_areas') is null then
    create table public.ol_service_areas (
      city_id text primary key,
      name text not null,
      center geography(point),
      radius_km numeric(6,2),
      active boolean not null default true
    );
    comment on table public.ol_service_areas is 'Master: cities where One Local operates (centre + radius = the outer boundary).';
    alter table public.ol_service_areas enable row level security;
    revoke all on table public.ol_service_areas from anon, authenticated;
  end if;

  if to_regclass('public.ol_stores') is null then
    create table public.ol_stores (
      id text primary key,
      organization_id uuid references public.organizations (id),
      name text not null,
      city_id text references public.ol_service_areas (city_id),
      location geography(point),
      address text,
      active boolean not null default true,
      created_at timestamptz not null default now()
    );
    comment on table public.ol_stores is 'Master: merchant stores (pickup points).';
    alter table public.ol_stores enable row level security;
    revoke all on table public.ol_stores from anon, authenticated;
  end if;

  if to_regclass('public.ol_orders') is null then
    create table public.ol_orders (
      id uuid primary key default gen_random_uuid(),
      store_id text references public.ol_stores (id),
      order_ref text not null,
      status text not null default 'placed',
      created_at timestamptz not null default now()
    );
    comment on table public.ol_orders is 'Master: shopper orders. Customer contact details stay in the Master, never in delivery tables.';
    alter table public.ol_orders enable row level security;
    revoke all on table public.ol_orders from anon, authenticated;
  end if;

  if to_regclass('public.app_devices') is null then
    create table public.app_devices (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      app text not null,
      platform text not null check (platform in ('android', 'ios', 'web')),
      push_token text not null,
      app_version text,
      updated_at timestamptz not null default now(),
      unique (app, push_token)
    );
    comment on table public.app_devices is 'Master (D2): push tokens per app and device. The rider app registers with app = ''rider''.';
    alter table public.app_devices enable row level security;
    revoke all on table public.app_devices from anon, authenticated;
  end if;
end $master$;

-- ── Shared helpers ────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Geography (Master-owned) ──────────────────────────────────────────────────────────────────

create table public.geo_states (
  code text primary key,
  name text not null,
  default_language text check (default_language in ('en', 'hi', 'mr', 'kn'))
);
comment on table public.geo_states is 'Indian states (e.g. MH). default_language seeds a new rider''s app language.';

create table public.geo_cities (
  id text primary key references public.ol_service_areas (city_id),
  state_code text not null references public.geo_states (code),
  name text not null,
  boundary geography(multipolygon),
  center geography(point),
  timezone text not null default 'Asia/Kolkata',
  cash_limit numeric(10,2) not null default 2000 check (cash_limit >= 0)
);
comment on table public.geo_cities is 'Cities. cash_limit is the default cash-in-hand limit above which a rider cannot go online.';

create table public.geo_zones (
  id text primary key,
  city_id text not null references public.geo_cities (id),
  name text not null,
  boundary geography(polygon) not null,
  neighbours text[] not null default '{}',
  active boolean not null default true
);
create index geo_zones_boundary on public.geo_zones using gist (boundary);
comment on table public.geo_zones is 'Dispatch zones. A rider must be inside an active zone to go online; neighbours widen dispatch rounds.';

create table public.hubs (
  id uuid primary key default gen_random_uuid(),
  zone_id text not null references public.geo_zones (id),
  kind text not null check (kind in ('store', 'dark_store', 'rider_start')),
  organization_id uuid references public.organizations (id),
  store_id text references public.ol_stores (id),
  name text,
  location geography(point) not null,
  address text,
  landmark text,
  accuracy_m int check (accuracy_m >= 0),
  source text check (source in ('merchant_pin', 'rider_confirmed', 'customer_pin', 'geocoded', 'rider_corrected', 'rider_start')),
  entrance_note text,
  photo_asset_id uuid,
  created_at timestamptz not null default now()
);
create index hubs_location on public.hubs using gist (location);
comment on table public.hubs is 'Start points: a store / dark store, or the rider''s own start pin. Coordinates first; text is secondary (R4).';

-- ── Riders ────────────────────────────────────────────────────────────────────────────────────

create table public.riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id),
  rider_code text unique,
  phone text not null,
  full_name text not null,
  email text,
  photo_asset_id uuid,
  emergency_phone text,
  language text not null default 'en' check (language in ('en', 'hi', 'mr', 'kn')),
  type text not null check (type in ('store', 'solo', 'taxi')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'verification_pending', 'approved', 'rejected', 'documents_expired', 'suspended')),
  status_reason text,
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'vip')),
  city_id text references public.geo_cities (id),
  zone_id text references public.geo_zones (id),
  hub_id uuid references public.hubs (id),
  organization_id uuid references public.organizations (id),
  acceptance text not null default 'manual' check (acceptance in ('auto', 'manual')),
  categories text[] not null default '{on_order}' check (categories <@ array['quick_drop', 'on_order', 'pick_drop']),
  multi_store boolean not null default false,
  cash_limit numeric(10,2) check (cash_limit >= 0),
  referral_code text unique,
  referred_by uuid references public.riders (id),
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index riders_zone_status on public.riders (zone_id, status);
create trigger riders_updated_at before update on public.riders for each row execute function public.set_updated_at();
comment on table public.riders is 'One row per rider; identity is auth.users by phone (D1). Only status = approved may go online.';
comment on column public.riders.cash_limit is 'Per-rider override of geo_cities.cash_limit (null = city default).';
comment on column public.riders.rider_code is 'Human-readable id shown in the app, e.g. RIDER-1001.';

create table public.rider_store_links (
  rider_id uuid not null references public.riders (id) on delete cascade,
  store_id text not null references public.ol_stores (id),
  priority int not null default 1 check (priority >= 1),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  payout_multiplier numeric(4,2) not null default 1 check (payout_multiplier > 0),
  invited_with text,
  created_at timestamptz not null default now(),
  primary key (rider_id, store_id)
);
comment on table public.rider_store_links is 'Store riders linked to stores (invite code). Linked riders get those stores'' orders first.';

create table public.rider_assets (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders (id) on delete cascade,
  kind text not null check (kind in ('profile_photo', 'selfie', 'dl', 'rc', 'aadhaar', 'pan', 'permit', 'fitness', 'proof_photo', 'signature', 'exception', 'hub_photo')),
  storage_path text not null unique,
  content_type text not null,
  bytes int check (bytes >= 0),
  created_at timestamptz not null default now()
);
comment on table public.rider_assets is 'Uploads in the private Storage bucket rider-private (KYC images, proofs). Served only through short-lived signed URLs.';

create table public.rider_documents (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders (id) on delete cascade,
  kind text not null check (kind in ('aadhaar', 'pan', 'dl', 'rc', 'selfie', 'permit', 'fitness')),
  number_masked text,
  asset_id uuid references public.rider_assets (id),
  source text check (source in ('digilocker', 'upload')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'expired')),
  rejection_reason text,
  expires_on date,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rider_id, kind)
);
create index rider_documents_expiry on public.rider_documents (expires_on) where status = 'verified' and expires_on is not null;
create trigger rider_documents_updated_at before update on public.rider_documents for each row execute function public.set_updated_at();
comment on table public.rider_documents is 'Current KYC document per kind (re-uploads replace it; every check is audited in kyc_checks). Masked numbers only.';

create table public.rider_vehicles (
  rider_id uuid primary key references public.riders (id) on delete cascade,
  class text not null check (class in ('2w', '3w', '4w')),
  ownership text not null check (ownership in ('own', 'rent')),
  registration_no text,
  model text,
  rc_document_id uuid references public.rider_documents (id),
  updated_at timestamptz not null default now()
);
create trigger rider_vehicles_updated_at before update on public.rider_vehicles for each row execute function public.set_updated_at();
comment on table public.rider_vehicles is 'The rider''s vehicle; the RC is verified as a rider_documents row (kind rc).';

create table public.rider_presence (
  rider_id uuid primary key references public.riders (id) on delete cascade,
  online boolean not null default false,
  location geography(point),
  accuracy_m int check (accuracy_m >= 0),
  battery int check (battery between 0 and 100),
  app_state text check (app_state in ('active', 'background', 'inactive')),
  last_seen_at timestamptz,
  current_job_id uuid
);
create index rider_presence_location on public.rider_presence using gist (location) where online;
comment on table public.rider_presence is 'Latest heartbeat per rider (every 30 s while online without a job). Dispatch searches it by distance.';

-- ── Delivery jobs ─────────────────────────────────────────────────────────────────────────────

create table public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  ol_order_id uuid references public.ol_orders (id),
  pos_order_id uuid,
  order_ref text not null,
  organization_id uuid references public.organizations (id),
  store_id text references public.ol_stores (id),
  city_id text not null references public.geo_cities (id),
  pickup_zone_id text references public.geo_zones (id),
  drop_zone_id text references public.geo_zones (id),
  category text not null check (category in ('quick_drop', 'on_order', 'pick_drop')),
  state text not null default 'created' check (state in ('created', 'offered', 'accepted', 'to_pickup', 'at_pickup', 'pickup_verified', 'picked_up', 'to_drop', 'at_drop', 'handover', 'proof', 'delivered', 'failed', 'returned', 'cancelled')),
  version int not null default 0,
  rider_id uuid references public.riders (id),
  pickup jsonb not null,
  drop jsonb not null,
  pickup_point geography(point) not null,
  drop_point geography(point) not null,
  items jsonb not null default '[]',
  items_count int check (items_count >= 0),
  cash_to_collect numeric(10,2) not null default 0 check (cash_to_collect >= 0),
  distance_km numeric(6,2) check (distance_km >= 0),
  distance_travelled_km numeric(6,2),
  pickup_code_hash text,
  otp_hash text,
  otp_attempts int not null default 0 check (otp_attempts >= 0),
  otp_locked_at timestamptz,
  proof_methods text[] not null default '{otp,photo}' check (proof_methods <@ array['otp', 'photo', 'signature']),
  payout_estimate numeric(10,2),
  surge_multiplier numeric(4,2) not null default 1 check (surge_multiplier >= 1),
  earnings_rule_version int,
  merchant_note text,
  merchant_ready_at timestamptz,
  pickup_by timestamptz,
  drop_by timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index delivery_jobs_rider_state on public.delivery_jobs (rider_id, state);
create index delivery_jobs_open on public.delivery_jobs (city_id, state) where state in ('created', 'offered');
create index delivery_jobs_pickup_point on public.delivery_jobs using gist (pickup_point);
comment on table public.delivery_jobs is 'One delivery. State follows the 12-state engine (enforced by delivery_jobs_guard); every change bumps version.';
comment on column public.delivery_jobs.drop is 'Customer drop point. The API sends the full address only after pickup_verified and the phone only during the job; riders cannot read this table directly.';
comment on column public.delivery_jobs.otp_hash is 'Hash of the customer''s delivery OTP (never the code itself). 5 wrong attempts lock it (otp_locked_at).';
comment on column public.delivery_jobs.pickup_code_hash is 'Hash of the merchant receipt / QR code checked at pickup.';
comment on column public.delivery_jobs.flags is 'Review flags, e.g. far_arrival, far_proof, bypass_pickup.';

create table public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.delivery_jobs (id) on delete cascade,
  rider_id uuid not null references public.riders (id),
  round int not null check (round between 1 and 3),
  mode text not null check (mode in ('auto', 'manual')),
  payout_estimate numeric(10,2),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  outcome text check (outcome in ('accepted', 'declined', 'timed_out', 'withdrawn')),
  reason text,
  answered_at timestamptz,
  unique (job_id, rider_id, round)
);
create unique index one_accepted_offer_per_job on public.delivery_offers (job_id) where outcome = 'accepted';
create index delivery_offers_rider_open on public.delivery_offers (rider_id, expires_at) where outcome is null;
comment on table public.delivery_offers is 'Offers per dispatch round (radius +2 km per round, 3 rounds then escalation). Only one offer per job can be accepted.';

create table public.delivery_events (
  id bigserial primary key,
  job_id uuid not null references public.delivery_jobs (id) on delete cascade,
  from_state text,
  to_state text not null,
  actor text not null check (actor in ('rider', 'server', 'merchant', 'operations', 'customer')),
  rider_id uuid references public.riders (id),
  location geography(point),
  accuracy_m int,
  reason text,
  app text,
  idempotency_key text,
  recorded_at timestamptz,
  created_at timestamptz not null default now()
);
create index delivery_events_job on public.delivery_events (job_id, id);
create unique index delivery_events_idempotent on public.delivery_events (job_id, idempotency_key) where idempotency_key is not null;
comment on table public.delivery_events is 'Audit trail of every state change. recorded_at is the device time of an offline step replayed later.';

create table public.delivery_track_points (
  job_id uuid not null references public.delivery_jobs (id) on delete cascade,
  recorded_at timestamptz not null,
  location geography(point) not null,
  accuracy_m int,
  speed real,
  heading real,
  primary key (job_id, recorded_at)
);
comment on table public.delivery_track_points is 'Live track during a job. Kept 30 days, then summarised into delivery_jobs.distance_travelled_km.';

create table public.delivery_pickup_checks (
  job_id uuid primary key references public.delivery_jobs (id) on delete cascade,
  method text not null check (method in ('scan', 'code', 'bypass')),
  code_scanned text,
  code_expected text,
  result text not null check (result in ('verified', 'mismatch', 'incomplete', 'bypassed')),
  items jsonb,
  missing jsonb,
  reason text,
  checked_at timestamptz not null default now()
);
comment on table public.delivery_pickup_checks is 'Latest pickup verification (scan / code / bypass with reason) and the item checklist.';

create table public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.delivery_jobs (id) on delete cascade,
  method text not null check (method in ('otp', 'photo', 'signature')),
  asset_id uuid references public.rider_assets (id),
  location geography(point),
  distance_from_drop_m int,
  flagged boolean not null default false,
  cash_collected numeric(10,2),
  created_at timestamptz not null default now()
);
comment on table public.delivery_proofs is 'Delivery proof. A proof far from the drop pin is accepted but flagged for review.';

create table public.delivery_exceptions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.delivery_jobs (id) on delete cascade,
  rider_id uuid references public.riders (id),
  kind text not null check (kind in ('not_ready', 'mismatch', 'incomplete', 'vehicle', 'safety', 'unavailable', 'address', 'refused', 'proof_failed', 'cannot_access', 'other', 'sos')),
  note text,
  asset_id uuid references public.rider_assets (id),
  location geography(point),
  corrected_point geography(point),
  wait_started_at timestamptz,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index delivery_exceptions_open on public.delivery_exceptions (status, created_at) where status = 'open';
comment on table public.delivery_exceptions is 'Exceptions raised during a job (one branch per state, plus SOS / safety anywhere) and how operations resolved them.';

create table public.address_quality (
  address_id uuid primary key,
  confidence numeric(3,2) not null default 0.7 check (confidence between 0 and 1),
  deliveries int not null default 0,
  disputes int not null default 0,
  last_rider_point geography(point),
  updated_at timestamptz
);
comment on table public.address_quality is 'Learned confidence of a customer address pin; rider corrections and disputes move it.';

-- Realtime signal for the rider app: which job changed, never what is in it.
create table public.rider_job_signals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.delivery_jobs (id) on delete cascade,
  rider_id uuid not null references public.riders (id) on delete cascade,
  state text not null,
  version int not null,
  updated_at timestamptz not null default now(),
  unique (job_id, rider_id)
);
create index rider_job_signals_rider on public.rider_job_signals (rider_id);
comment on table public.rider_job_signals is 'Realtime: a rider subscribes to their own rows and refetches the job through the API (which applies the privacy rules). state = reassigned when the job left them. Random ids, so Realtime delete events reveal nothing.';

-- ── Money ─────────────────────────────────────────────────────────────────────────────────────

create table public.earnings_rules (
  id serial primary key,
  city_id text not null references public.geo_cities (id),
  version int not null,
  base numeric(8,2) not null check (base >= 0),
  per_km numeric(8,2) not null check (per_km >= 0),
  peak jsonb not null default '[]',
  wait_free_min int not null default 10 check (wait_free_min >= 0),
  wait_per_min numeric(6,2) not null default 0 check (wait_per_min >= 0),
  active_from timestamptz not null,
  unique (city_id, version)
);
comment on table public.earnings_rules is 'Per-city earnings rules (R10). peak = [{from:"19:00", to:"22:00", amount:15, label}]. Earnings store the version they used.';

create table public.rider_earnings (
  job_id uuid primary key references public.delivery_jobs (id),
  rider_id uuid not null references public.riders (id),
  base numeric(8,2),
  distance numeric(8,2),
  peak numeric(8,2),
  wait numeric(8,2),
  tip numeric(8,2),
  bonus numeric(8,2),
  total numeric(10,2) not null check (total >= 0),
  rule_version int not null,
  created_at timestamptz not null default now()
);
create index rider_earnings_rider_time on public.rider_earnings (rider_id, created_at desc);
comment on table public.rider_earnings is 'Final earnings of a delivered job (fixed at delivery; tips pass through 100 %).';

create table public.rider_cash_ledger (
  id bigserial primary key,
  rider_id uuid not null references public.riders (id),
  job_id uuid references public.delivery_jobs (id),
  kind text not null check (kind in ('collected', 'deposited', 'adjustment')),
  amount numeric(10,2) not null,
  source text check (source in ('cod', 'counter', 'upi', 'operations')),
  ref text unique,
  note text,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  check (kind = 'adjustment' or amount > 0)
);
create index rider_cash_ledger_rider on public.rider_cash_ledger (rider_id, created_at desc);
comment on table public.rider_cash_ledger is 'Cash in hand, insert-only: collected (COD) adds, deposited removes, adjustment is signed. ref makes a credit idempotent (e.g. the cash_deposits id).';

create table public.rider_notifications (
  id bigserial primary key,
  rider_id uuid not null references public.riders (id) on delete cascade,
  kind text not null check (kind in ('new_delivery', 'incentive', 'document_expiry', 'payment_disbursed', 'order_reassigned', 'tier_upgrade', 'system')),
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index rider_notifications_rider on public.rider_notifications (rider_id, created_at desc);
comment on table public.rider_notifications is 'In-app alerts. Never contains a customer''s name, phone or address.';

create table public.idempotency_keys (
  key text not null,
  rider_id uuid not null references public.riders (id) on delete cascade,
  endpoint text not null,
  request_hash text not null,
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now(),
  primary key (rider_id, key)
);
create index idempotency_keys_created on public.idempotency_keys (created_at);
comment on table public.idempotency_keys is 'Idempotency-Key of state-changing POSTs: a replay returns the stored response instead of acting twice. Kept 7 days.';

-- ── Delivery engine guard ─────────────────────────────────────────────────────────────────────

/** Allowed transitions — must match TRANSITIONS in OL-ui/rider/src/state-machine/deliveryStateMachine.ts. */
create or replace function public.delivery_transition_allowed(from_state text, to_state text) returns boolean
language sql immutable as $$
  select case from_state
    when 'created'         then to_state in ('offered', 'cancelled')
    when 'offered'         then to_state in ('accepted', 'offered', 'cancelled')
    when 'accepted'        then to_state in ('to_pickup', 'offered', 'cancelled')
    when 'to_pickup'       then to_state in ('at_pickup', 'failed', 'cancelled')
    when 'at_pickup'       then to_state in ('pickup_verified', 'failed', 'cancelled')
    when 'pickup_verified' then to_state in ('picked_up', 'failed', 'cancelled')
    when 'picked_up'       then to_state in ('to_drop', 'failed', 'returned')
    when 'to_drop'         then to_state in ('at_drop', 'failed', 'returned')
    when 'at_drop'         then to_state in ('handover', 'failed', 'returned')
    when 'handover'        then to_state in ('proof', 'returned', 'failed')
    when 'proof'           then to_state in ('delivered', 'returned', 'failed')
    else false
  end
$$;

create or replace function public.delivery_jobs_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.state not in ('created', 'offered') then
      raise exception 'invalid_transition: a job starts as created or offered, not %', new.state using errcode = 'check_violation';
    end if;
    new.version := 0;
    return new;
  end if;
  if new.state is distinct from old.state then
    if not public.delivery_transition_allowed(old.state, new.state) then
      raise exception 'invalid_transition: % -> %', old.state, new.state using errcode = 'check_violation';
    end if;
    if new.state = 'accepted' and new.rider_id is null then
      raise exception 'invalid_transition: accepted needs a rider' using errcode = 'check_violation';
    end if;
    if new.state = 'accepted' then new.accepted_at := coalesce(new.accepted_at, now()); end if;
    if new.state = 'picked_up' then new.picked_up_at := coalesce(new.picked_up_at, now()); end if;
    if new.state = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
    if new.state = 'offered' and old.state = 'accepted' then new.rider_id := null; new.accepted_at := null; end if;
  end if;
  -- Optimistic concurrency: callers update "where id = $1 and version = $expected"; every write bumps it.
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

create trigger delivery_jobs_guard before insert or update on public.delivery_jobs for each row execute function public.delivery_jobs_guard();

create or replace function public.delivery_jobs_signal() returns trigger
language plpgsql as $$
begin
  -- The rider who lost the job (reassigned / released) gets one last signal, then no more.
  if tg_op = 'UPDATE' and old.rider_id is not null and old.rider_id is distinct from new.rider_id then
    update public.rider_job_signals set state = 'reassigned', version = new.version, updated_at = now()
     where job_id = new.id and rider_id = old.rider_id;
  end if;
  if new.rider_id is not null then
    insert into public.rider_job_signals (job_id, rider_id, state, version)
    values (new.id, new.rider_id, new.state, new.version)
    on conflict (job_id, rider_id) do update set state = excluded.state, version = excluded.version, updated_at = now();
  end if;
  return null;
end $$;

create trigger delivery_jobs_signal after insert or update on public.delivery_jobs for each row execute function public.delivery_jobs_signal();

-- ── Cash ledger is insert-only ────────────────────────────────────────────────────────────────

create or replace function public.reject_ledger_change() returns trigger
language plpgsql as $$
begin
  raise exception 'rider_cash_ledger is insert-only; record an adjustment instead' using errcode = 'insufficient_privilege';
end $$;

create trigger rider_cash_ledger_insert_only before update or delete on public.rider_cash_ledger for each row execute function public.reject_ledger_change();

create view public.rider_cash_balance with (security_invoker = true) as
  select r.id as rider_id,
         coalesce(sum(case l.kind when 'collected' then l.amount when 'deposited' then -l.amount else l.amount end), 0)::numeric(10,2) as cash_in_hand,
         coalesce(r.cash_limit, c.cash_limit, 2000)::numeric(10,2) as cash_limit
    from public.riders r
    left join public.geo_cities c on c.id = r.city_id
    left join public.rider_cash_ledger l on l.rider_id = r.id
   group by r.id, r.cash_limit, c.cash_limit;
comment on view public.rider_cash_balance is 'Cash in hand and the limit per rider. cash_in_hand >= cash_limit blocks going online.';

-- ── Geography helpers (used by the server) ───────────────────────────────────────────────────

create or replace function public.zone_for_point(lat double precision, lng double precision) returns text
language sql stable set search_path = public, extensions as $$
  select z.id from public.geo_zones z
   where z.active and ST_Covers(z.boundary, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography)
   order by z.id limit 1
$$;
comment on function public.zone_for_point is 'Active zone containing the point, or null (out_of_zone).';

create or replace function public.riders_near(lat double precision, lng double precision, radius_m double precision)
returns table (rider_id uuid, distance_m double precision)
language sql stable set search_path = public, extensions as $$
  select p.rider_id, ST_Distance(p.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) as distance_m
    from public.rider_presence p
    join public.riders r on r.id = p.rider_id and r.status = 'approved'
   where p.online and p.current_job_id is null
     and ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radius_m)
   order by distance_m
$$;
comment on function public.riders_near is 'Online, approved riders without a job within radius_m of a point, nearest first (dispatch rounds).';

-- ── Retention (run daily by pg_cron below) ───────────────────────────────────────────────────

/** Track points older than 30 days: store the distance travelled on the job, then delete them. */
create or replace function public.purge_track_points(keep interval default interval '30 days') returns int
language plpgsql set search_path = public, extensions as $$
declare removed int;
begin
  with old as (
    select job_id, ST_Length(ST_MakeLine(location::geometry order by recorded_at)::geography) / 1000 as km
      from public.delivery_track_points
     where recorded_at < now() - keep
     group by job_id
  )
  update public.delivery_jobs j set distance_travelled_km = round(old.km::numeric, 2)
    from old
   where j.id = old.job_id and j.distance_travelled_km is null;
  delete from public.delivery_track_points where recorded_at < now() - keep;
  get diagnostics removed = row_count;
  return removed;
end $$;

create or replace function public.purge_idempotency_keys(keep interval default interval '7 days') returns int
language plpgsql set search_path = public as $$
declare removed int;
begin
  delete from public.idempotency_keys where created_at < now() - keep;
  get diagnostics removed = row_count;
  return removed;
end $$;

/** Signals of finished jobs: the app has long refetched them. */
create or replace function public.purge_job_signals(keep interval default interval '7 days') returns int
language plpgsql set search_path = public as $$
declare removed int;
begin
  delete from public.rider_job_signals s
   using public.delivery_jobs j
   where j.id = s.job_id and s.updated_at < now() - keep
     and (s.state = 'reassigned' or j.state in ('delivered', 'failed', 'returned', 'cancelled'));
  get diagnostics removed = row_count;
  return removed;
end $$;

-- ── Row level security ────────────────────────────────────────────────────────────────────────

/** The rider row of the signed-in user (null for anyone else). */
create or replace function public.current_rider_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.riders where user_id = auth.uid()
$$;

-- Supabase grants EXECUTE on new functions to anon and authenticated (and PostgREST exposes them
-- as /rpc): take it back from every function here; only current_rider_id() is needed by policies.
revoke all on function
  public.set_updated_at(), public.delivery_transition_allowed(text, text), public.delivery_jobs_guard(),
  public.delivery_jobs_signal(), public.reject_ledger_change(),
  public.zone_for_point(double precision, double precision),
  public.riders_near(double precision, double precision, double precision),
  public.purge_track_points(interval), public.purge_idempotency_keys(interval), public.purge_job_signals(interval),
  public.current_rider_id()
from public, anon, authenticated;
grant execute on function public.current_rider_id() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'geo_states', 'geo_cities', 'geo_zones', 'hubs', 'riders', 'rider_store_links', 'rider_assets', 'rider_documents',
    'rider_vehicles', 'rider_presence', 'delivery_jobs', 'delivery_offers', 'delivery_events', 'delivery_track_points',
    'delivery_pickup_checks', 'delivery_proofs', 'delivery_exceptions', 'address_quality', 'rider_job_signals',
    'earnings_rules', 'rider_earnings', 'rider_cash_ledger', 'rider_notifications', 'idempotency_keys'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on public.rider_cash_balance from anon, authenticated;

-- Read-own policies only where the app uses Realtime. Every write goes through the server.
grant select on public.riders, public.delivery_offers, public.rider_job_signals, public.rider_notifications to authenticated;
create policy riders_read_own on public.riders for select to authenticated using (user_id = (select auth.uid()));
create policy offers_read_own on public.delivery_offers for select to authenticated using (rider_id = (select public.current_rider_id()));
create policy job_signals_read_own on public.rider_job_signals for select to authenticated using (rider_id = (select public.current_rider_id()));
create policy notifications_read_own on public.rider_notifications for select to authenticated using (rider_id = (select public.current_rider_id()));

-- ── Supabase extras (skipped where the platform piece is missing) ─────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.riders, public.delivery_offers, public.rider_job_signals, public.rider_notifications;
  end if;
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('rider-private', 'rider-private', false) on conflict (id) do nothing;
  end if;
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'rider-retention';
    perform cron.schedule('rider-retention', '41 3 * * *',
      'select public.purge_track_points(); select public.purge_idempotency_keys(); select public.purge_job_signals();');
  end if;
end $$;
