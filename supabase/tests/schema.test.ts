// The SQL schema on a real Postgres + PostGIS (PGlite): every migration and the seed, then the
// rules the database itself enforces — RLS, the delivery engine, the cash ledger, geography.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { asUser, createDb, failure, readSupabaseFile, type Db } from './db.ts';

const CORE = '20261002000000_rider_core.sql';
const STATES = ['created', 'offered', 'accepted', 'to_pickup', 'at_pickup', 'pickup_verified', 'picked_up', 'to_drop', 'at_drop', 'handover', 'proof', 'delivered', 'failed', 'returned', 'cancelled'];
const HAPPY_PATH = ['to_pickup', 'at_pickup', 'pickup_verified', 'picked_up', 'to_drop', 'at_drop', 'handover', 'proof', 'delivered'];
const STORE_A = { lat: 18.4062, lng: 76.5711 };
const DROP = { lat: 18.4211, lng: 76.5793 };

/** TRANSITIONS from the app's state machine, read from its source. */
const appTransitions = () => {
  const src = readFileSync(new URL('../../OL-ui/rider/src/state-machine/deliveryStateMachine.ts', import.meta.url), 'utf8');
  const block = /const TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src)?.[1];
  assert.ok(block, 'TRANSITIONS not found in deliveryStateMachine.ts');
  const map: Record<string, string[]> = {};
  for (const [, from, to] of block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    map[from!] = [...to!.matchAll(/'(\w+)'/g)].map((m) => m[1]!);
  }
  return map;
};

let n = 0;
const newRider = async (db: Db, over: { status?: string } = {}) => {
  n += 1;
  const user = (await db.query<{ id: string }>(`insert into auth.users (phone) values ($1) returning id`, [`+9198000000${String(n).padStart(2, '0')}`])).rows[0]!.id;
  const rider = (
    await db.query<{ id: string }>(
      `insert into riders (user_id, rider_code, phone, full_name, type, status, city_id, zone_id)
       values ($1, $2, $3, $4, 'solo', $5, 'latur', 'latur-central') returning id`,
      [user, `RIDER-${1000 + n}`, `98000000${String(n).padStart(2, '0')}`, `Rider ${n}`, over.status ?? 'approved'],
    )
  ).rows[0]!.id;
  return { user, rider };
};

const newJob = async (db: Db, state = 'created') =>
  (
    await db.query<{ id: string; version: number }>(
      `insert into delivery_jobs (order_ref, store_id, city_id, pickup_zone_id, category, state, pickup, drop, pickup_point, drop_point, cash_to_collect)
       values ('OL-' || floor(random() * 1e6)::int, 'store-express-megamart', 'latur', 'latur-central', 'on_order', $1,
               '{"name": "Express MegaMart"}', '{"area": "Shanti Enclave"}',
               ST_MakePoint($2, $3)::geography, ST_MakePoint($4, $5)::geography, 340)
       returning id, version`,
      [state, STORE_A.lng, STORE_A.lat, DROP.lng, DROP.lat],
    )
  ).rows[0]!;

const job = async (db: Db, id: string) =>
  (
    await db.query<{ state: string; version: number; rider_id: string | null; accepted_at: string | null; picked_up_at: string | null; delivered_at: string | null }>(
      `select state, version, rider_id, accepted_at, picked_up_at, delivered_at from delivery_jobs where id = $1`,
      [id],
    )
  ).rows[0]!;

const moveTo = (db: Db, id: string, state: string, riderId?: string) =>
  riderId
    ? db.query(`update delivery_jobs set state = $2, rider_id = $3 where id = $1`, [id, state, riderId])
    : db.query(`update delivery_jobs set state = $2 where id = $1`, [id, state]);

const signals = async (db: Db, jobId: string) =>
  (await db.query<{ rider_id: string; state: string; version: number }>(`select rider_id, state, version from rider_job_signals where job_id = $1 order by updated_at`, [jobId])).rows;

describe('database schema', () => {
  let db: Db;
  before(async () => {
    db = await createDb();
  });

  describe('lockdown', () => {
    it('enables row level security on every table', async () => {
      const { rows } = await db.query<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
          where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      assert.deepEqual(rows, []);
    });

    it('gives the app roles nothing except reading four tables (filtered by RLS)', async () => {
      const { rows } = await db.query<{ table_name: string; grantee: string; privilege_type: string }>(
        `select table_name, grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2, 3`,
      );
      const rider = new Set(['riders', 'delivery_offers', 'rider_job_signals', 'rider_notifications']);
      const coreTables = (await db.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public'`)).rows.map((r) => r.tablename);
      assert.ok(coreTables.length >= 36);
      assert.deepEqual(
        rows.map((r) => `${r.table_name}:${r.grantee}:${r.privilege_type}`),
        [...rider].sort().map((t) => `${t}:authenticated:SELECT`),
      );
    });

    it('keeps the server helpers out of PostgREST /rpc', async () => {
      for (const fn of ['riders_near(double precision, double precision, double precision)', 'zone_for_point(double precision, double precision)', 'purge_track_points(interval)', 'delivery_transition_allowed(text, text)']) {
        for (const role of ['anon', 'authenticated']) {
          const { rows } = await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'execute') ok`, [role, `public.${fn}`]);
          assert.equal(rows[0]!.ok, false, `${role} can execute ${fn}`);
        }
      }
      const { rows } = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.current_rider_id()', 'execute') ok`);
      assert.equal(rows[0]!.ok, true);
    });

    it('publishes only the read-own tables to Realtime and creates a private bucket', async () => {
      const pub = await db.query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`);
      assert.deepEqual(pub.rows.map((r) => r.tablename), ['delivery_offers', 'rider_job_signals', 'rider_notifications', 'riders']);
      const bucket = await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'rider-private'`);
      assert.deepEqual(bucket.rows, [{ public: false }]);
    });

    it('schedules the daily retention job', async () => {
      const { rows } = await db.query<{ command: string }>(`select command from cron.job where jobname = 'rider-retention'`);
      assert.match(rows[0]!.command, /purge_track_points\(\).*purge_idempotency_keys\(\).*purge_job_signals\(\)/);
    });
  });

  describe('row level security as the rider app', () => {
    it('lets a rider read only their own rows, and nothing else', async () => {
      const a = await newRider(db);
      const b = await newRider(db);
      const j1 = await newJob(db, 'offered');
      const j2 = await newJob(db, 'offered');
      await db.query(
        `insert into delivery_offers (job_id, rider_id, round, mode, expires_at) values ($1, $2, 1, 'manual', now() + interval '30 seconds'), ($3, $4, 1, 'manual', now() + interval '30 seconds')`,
        [j1.id, a.rider, j2.id, b.rider],
      );
      await db.query(`insert into rider_notifications (rider_id, kind, title) values ($1, 'system', 'Hi A'), ($2, 'system', 'Hi B')`, [a.rider, b.rider]);
      await moveTo(db, j1.id, 'accepted', a.rider);
      await moveTo(db, j2.id, 'accepted', b.rider);

      await asUser(db, a.user, async () => {
        const me = await db.query<{ id: string }>(`select id from riders`);
        assert.deepEqual(me.rows, [{ id: a.rider }]);
        const offers = await db.query<{ job_id: string }>(`select job_id from delivery_offers`);
        assert.deepEqual(offers.rows, [{ job_id: j1.id }]);
        const sig = await db.query<{ job_id: string; state: string }>(`select job_id, state from rider_job_signals`);
        assert.deepEqual(sig.rows, [{ job_id: j1.id, state: 'accepted' }]);
        const alerts = await db.query<{ title: string }>(`select title from rider_notifications`);
        assert.deepEqual(alerts.rows, [{ title: 'Hi A' }]);
        const id = await db.query<{ id: string }>(`select public.current_rider_id() id`);
        assert.equal(id.rows[0]!.id, a.rider);

        assert.match(await failure(db, `select * from delivery_jobs`), /permission denied/);
        assert.match(await failure(db, `select * from rider_cash_balance`), /permission denied/);
        assert.match(await failure(db, `select * from kyc_profiles`), /permission denied/);
        assert.match(await failure(db, `select * from payouts`), /permission denied/);
        assert.match(await failure(db, `update riders set status = 'approved'`), /permission denied/);
        assert.match(await failure(db, `insert into rider_notifications (rider_id, kind, title) values ($1, 'system', 'x')`, [a.rider]), /permission denied/);
        assert.match(await failure(db, `select * from riders_near(18.4, 76.5, 5000)`), /permission denied/);
      });
    });

    it('gives anonymous callers nothing', async () => {
      await asUser(db, null, async () => {
        for (const t of ['riders', 'delivery_offers', 'rider_job_signals', 'rider_notifications', 'delivery_jobs', 'geo_zones', 'message_log']) {
          assert.match(await failure(db, `select * from ${t}`), /permission denied/, t);
        }
      });
    });

    it('keeps customer data out of every table the app can read', async () => {
      const { rows } = await db.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name in ('delivery_offers', 'rider_job_signals', 'rider_notifications')
            and column_name ~ '(drop|customer|address|phone|otp|pickup)'`,
      );
      assert.deepEqual(rows, []);
    });
  });

  describe('delivery engine', () => {
    it('allows exactly the transitions of the app state machine', async () => {
      const app = appTransitions();
      assert.deepEqual(Object.keys(app).sort(), [...STATES].sort());
      const { rows } = await db.query<{ f: string; t: string; ok: boolean }>(
        `select f, t, public.delivery_transition_allowed(f, t) ok from unnest($1::text[]) f, unnest($1::text[]) t`,
        [STATES],
      );
      const mismatches = rows.filter((r) => r.ok !== app[r.f]!.includes(r.t)).map((r) => `${r.f}→${r.t}`);
      assert.deepEqual(mismatches, []);
    });

    it('starts a job as created (version 0) and refuses any other start', async () => {
      const j = await newJob(db);
      assert.deepEqual(await job(db, j.id), { state: 'created', version: 0, rider_id: null, accepted_at: null, picked_up_at: null, delivered_at: null });
      await db.query(`update delivery_jobs set version = 99, merchant_note = 'Packing now' where id = $1`, [j.id]);
      assert.equal((await job(db, j.id)).version, 1, 'the version is set by the database, never by the caller');
      const msg = await failure(
        db,
        `insert into delivery_jobs (order_ref, city_id, category, state, pickup, drop, pickup_point, drop_point)
         values ('X', 'latur', 'on_order', 'accepted', '{}', '{}', ST_MakePoint(76.57, 18.4)::geography, ST_MakePoint(76.58, 18.42)::geography)`,
      );
      assert.match(msg, /invalid_transition/);
    });

    it('walks the 12 steps forward, bumping the version and stamping the times', async () => {
      const r = await newRider(db);
      const j = await newJob(db);
      await moveTo(db, j.id, 'offered');
      assert.match(await failure(db, `update delivery_jobs set state = 'accepted' where id = $1`, [j.id]), /accepted needs a rider/);
      await moveTo(db, j.id, 'accepted', r.rider);
      let row = await job(db, j.id);
      assert.equal(row.version, 2);
      assert.ok(row.accepted_at);
      for (const state of HAPPY_PATH) await moveTo(db, j.id, state);
      row = await job(db, j.id);
      assert.equal(row.state, 'delivered');
      assert.equal(row.version, 2 + HAPPY_PATH.length);
      assert.ok(row.picked_up_at && row.delivered_at);
      assert.deepEqual(await signals(db, j.id), [{ rider_id: r.rider, state: 'delivered', version: row.version }]);
    });

    it('refuses skipped steps, going back, and leaving a final state', async () => {
      const r = await newRider(db);
      const j = await newJob(db, 'offered');
      await moveTo(db, j.id, 'accepted', r.rider);
      await moveTo(db, j.id, 'to_pickup');
      assert.match(await failure(db, `update delivery_jobs set state = 'picked_up' where id = $1`, [j.id]), /invalid_transition: to_pickup -> picked_up/);
      assert.match(await failure(db, `update delivery_jobs set state = 'accepted' where id = $1`, [j.id]), /invalid_transition/);
      await moveTo(db, j.id, 'cancelled');
      for (const s of ['offered', 'to_pickup', 'delivered']) {
        assert.match(await failure(db, `update delivery_jobs set state = $2 where id = $1`, [j.id, s]), /invalid_transition/);
      }
      assert.equal((await job(db, j.id)).state, 'cancelled');
    });

    it('supports optimistic concurrency: a stale version updates nothing', async () => {
      const j = await newJob(db);
      const first = await db.query(`update delivery_jobs set state = 'offered' where id = $1 and version = 0`, [j.id]);
      const stale = await db.query(`update delivery_jobs set state = 'cancelled' where id = $1 and version = 0`, [j.id]);
      assert.equal(first.affectedRows, 1);
      assert.equal(stale.affectedRows, 0);
      assert.deepEqual(await job(db, j.id).then((x) => [x.state, x.version]), ['offered', 1]);
    });

    it('reassigns: the rider is released and their app gets a last "reassigned" signal', async () => {
      const a = await newRider(db);
      const b = await newRider(db);
      const j = await newJob(db, 'offered');
      await moveTo(db, j.id, 'accepted', a.rider);
      await moveTo(db, j.id, 'offered');
      const row = await job(db, j.id);
      assert.equal(row.rider_id, null);
      assert.equal(row.accepted_at, null);
      await moveTo(db, j.id, 'accepted', b.rider);
      await moveTo(db, j.id, 'to_pickup');
      const sig = await signals(db, j.id);
      assert.deepEqual(
        sig.map((s) => [s.rider_id, s.state]),
        [
          [a.rider, 'reassigned'],
          [b.rider, 'to_pickup'],
        ],
      );
    });

    it('accepts only one offer per job', async () => {
      const a = await newRider(db);
      const b = await newRider(db);
      const j = await newJob(db, 'offered');
      await db.query(
        `insert into delivery_offers (job_id, rider_id, round, mode, expires_at, outcome) values ($1, $2, 1, 'manual', now(), 'accepted')`,
        [j.id, a.rider],
      );
      const msg = await failure(db, `insert into delivery_offers (job_id, rider_id, round, mode, expires_at, outcome) values ($1, $2, 2, 'manual', now(), 'accepted')`, [j.id, b.rider]);
      assert.match(msg, /one_accepted_offer_per_job/);
      assert.match(await failure(db, `insert into delivery_offers (job_id, rider_id, round, mode, expires_at) values ($1, $2, 4, 'auto', now())`, [j.id, b.rider]), /check/);
    });

    it('replays an offline step once (idempotency key per job)', async () => {
      const j = await newJob(db);
      const ins = `insert into delivery_events (job_id, from_state, to_state, actor, idempotency_key, recorded_at) values ($1, 'created', 'offered', 'server', 'k-1', now())`;
      await db.query(ins, [j.id]);
      assert.match(await failure(db, ins, [j.id]), /delivery_events_idempotent/);
    });
  });

  describe('cash ledger', () => {
    it('is insert-only and adds up to the cash in hand', async () => {
      const r = await newRider(db);
      const j = await newJob(db);
      await db.query(
        `insert into rider_cash_ledger (rider_id, job_id, kind, amount, source, ref) values
           ($1, $2::uuid, 'collected', 500, 'cod', 'job:' || $2::text),
           ($1, null, 'deposited', 200, 'upi', 'deposit:abc'),
           ($1, null, 'adjustment', -50, 'operations', null)`,
        [r.rider, j.id],
      );
      const bal = await db.query<{ cash_in_hand: string; cash_limit: string }>(`select cash_in_hand, cash_limit from rider_cash_balance where rider_id = $1`, [r.rider]);
      assert.deepEqual(bal.rows[0], { cash_in_hand: '250.00', cash_limit: '2000.00' });

      assert.match(await failure(db, `update rider_cash_ledger set amount = 1 where rider_id = $1`, [r.rider]), /insert-only/);
      assert.match(await failure(db, `delete from rider_cash_ledger where rider_id = $1`, [r.rider]), /insert-only/);
      assert.match(await failure(db, `insert into rider_cash_ledger (rider_id, kind, amount, ref) values ($1, 'deposited', 200, 'deposit:abc')`, [r.rider]), /rider_cash_ledger_ref_key/);
      assert.match(await failure(db, `insert into rider_cash_ledger (rider_id, kind, amount) values ($1, 'collected', -5)`, [r.rider]), /check/);
    });

    it('uses the rider override, then the city default, as the limit', async () => {
      const r = await newRider(db);
      await db.query(`update riders set cash_limit = 1500 where id = $1`, [r.rider]);
      const bal = await db.query<{ cash_in_hand: string; cash_limit: string }>(`select cash_in_hand, cash_limit from rider_cash_balance where rider_id = $1`, [r.rider]);
      assert.deepEqual(bal.rows[0], { cash_in_hand: '0.00', cash_limit: '1500.00' });
    });
  });

  describe('geography', () => {
    it('finds the zone of a point (null outside every zone)', async () => {
      const { rows } = await db.query<{ store: string; east: string; pune: string | null }>(
        `select zone_for_point(18.4062, 76.5711) store, zone_for_point(18.40, 76.61) east, zone_for_point(18.5204, 73.8567) pune`,
      );
      assert.deepEqual(rows[0], { store: 'latur-central', east: 'latur-east', pune: null });
    });

    it('lists online, approved, free riders nearest first', async () => {
      const near = await newRider(db);
      const far = await newRider(db);
      const busy = await newRider(db);
      const offline = await newRider(db);
      const pending = await newRider(db, { status: 'verification_pending' });
      const at = (lat: number, lng: number) => `ST_MakePoint(${lng}, ${lat})::geography`;
      await db.query(
        `insert into rider_presence (rider_id, online, location, current_job_id) values
           ($1, true, ${at(18.4065, 76.5715)}, null),
           ($2, true, ${at(18.42, 76.58)}, null),
           ($3, true, ${at(18.4063, 76.5712)}, gen_random_uuid()),
           ($4, false, ${at(18.4062, 76.5711)}, null),
           ($5, true, ${at(18.4062, 76.5711)}, null)`,
        [near.rider, far.rider, busy.rider, offline.rider, pending.rider],
      );
      const { rows } = await db.query<{ rider_id: string; m: number }>(`select rider_id, round(distance_m)::int m from riders_near(18.4062, 76.5711, 3000)`);
      assert.deepEqual(rows.map((r) => r.rider_id), [near.rider, far.rider]);
      assert.ok(rows[0]!.m < 100 && rows[1]!.m > 1000);
      const small = await db.query(`select rider_id from riders_near(18.4062, 76.5711, 200)`);
      assert.equal(small.rows.length, 1);
    });

    it('seeds Latur: 4 zones, the city outline, Store A hub and earnings rule v3', async () => {
      const { rows } = await db.query<{ zones: number; covered: boolean; hub: string; base: string; peaks: number }>(
        `select (select count(*)::int from geo_zones where city_id = 'latur') zones,
                (select ST_Covers(boundary, ST_MakePoint(76.5711, 18.4062)::geography) from geo_cities where id = 'latur') covered,
                (select zone_id from hubs where name = 'Store A') hub,
                (select base::text from earnings_rules where city_id = 'latur' and version = 3) base,
                (select jsonb_array_length(peak) from earnings_rules where city_id = 'latur' and version = 3) peaks`,
      );
      assert.deepEqual(rows[0], { zones: 4, covered: true, hub: 'latur-central', base: '45.00', peaks: 2 });
      await db.exec(readSupabaseFile('seed.sql'));
      const again = await db.query<{ n: number }>(`select count(*)::int n from geo_zones`);
      assert.equal(again.rows[0]!.n, 4);
    });
  });

  describe('retention', () => {
    it('summarises old track points into the distance travelled, then deletes them', async () => {
      const j = await newJob(db);
      await db.query(
        `insert into delivery_track_points (job_id, recorded_at, location) values
           ($1, now() - interval '31 days', ST_MakePoint(76.5711, 18.4062)::geography),
           ($1, now() - interval '31 days' + interval '5 minutes', ST_MakePoint(76.5793, 18.4211)::geography),
           ($1, now() - interval '1 day', ST_MakePoint(76.58, 18.43)::geography)`,
        [j.id],
      );
      const removed = await db.query<{ n: number }>(`select public.purge_track_points() n`);
      assert.equal(removed.rows[0]!.n, 2);
      const km = await db.query<{ km: string }>(`select distance_travelled_km::text km from delivery_jobs where id = $1`, [j.id]);
      assert.equal(km.rows[0]!.km, '1.86');
      const left = await db.query<{ n: number }>(`select count(*)::int n from delivery_track_points where job_id = $1`, [j.id]);
      assert.equal(left.rows[0]!.n, 1);
    });

    it('drops idempotency keys after 7 days and signals of finished jobs', async () => {
      const r = await newRider(db);
      await db.query(
        `insert into idempotency_keys (key, rider_id, endpoint, request_hash, created_at) values ('old', $1, 'POST /x', 'h', now() - interval '8 days'), ('new', $1, 'POST /x', 'h', now())`,
        [r.rider],
      );
      await db.query(`select public.purge_idempotency_keys()`);
      const keys = await db.query<{ key: string }>(`select key from idempotency_keys where rider_id = $1`, [r.rider]);
      assert.deepEqual(keys.rows, [{ key: 'new' }]);

      const done = await newJob(db, 'offered');
      await moveTo(db, done.id, 'accepted', r.rider);
      await moveTo(db, done.id, 'cancelled');
      const live = await newJob(db, 'offered');
      await moveTo(db, live.id, 'accepted', r.rider);
      await db.query(`update rider_job_signals set updated_at = now() - interval '8 days' where rider_id = $1`, [r.rider]);
      await db.query(`select public.purge_job_signals()`);
      const left = await db.query<{ job_id: string }>(`select job_id from rider_job_signals where rider_id = $1`, [r.rider]);
      assert.deepEqual(left.rows, [{ job_id: live.id }]);
    });
  });
});

describe('on the One Local Master database', () => {
  it('leaves existing platform tables exactly as they are', async () => {
    const db = await createDb({
      seed: false,
      migrations: [CORE],
      before: `
        create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, legal_name text);
        comment on table public.organizations is 'Owned by the Master';
        grant select on public.organizations to anon;
        create table public.ol_service_areas (city_id text primary key, name text not null, radius_km numeric);
        create table public.ol_stores (id text primary key, name text not null);
        create table public.ol_orders (id uuid primary key default gen_random_uuid());
        create table public.app_devices (id uuid primary key default gen_random_uuid(), user_id uuid, app text, push_token text);
      `,
    });
    const { rows } = await db.query<{ rls: boolean; comment: string; anon: boolean; cols: number }>(
      `select c.relrowsecurity rls, obj_description(c.oid, 'pg_class') comment,
              has_table_privilege('anon', 'public.organizations', 'select') anon,
              (select count(*)::int from information_schema.columns where table_name = 'organizations') cols
         from pg_class c where c.oid = 'public.organizations'::regclass`,
    );
    assert.deepEqual(rows[0], { rls: false, comment: 'Owned by the Master', anon: true, cols: 3 });
    const fk = await db.query<{ n: number }>(`select count(*)::int n from information_schema.table_constraints where table_name = 'riders' and constraint_type = 'FOREIGN KEY'`);
    assert.ok(fk.rows[0]!.n >= 5);
    await db.close();
  });
});
