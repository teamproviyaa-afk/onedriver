// Real Postgres (PGlite, in-process WASM) with PostGIS, for testing the SQL migrations.
//
// Supabase pieces the migrations rely on are stood in for here: the auth schema with auth.uid()
// (read from the request.jwt.claim.sub setting, as PostgREST does), the anon / authenticated /
// service_role roles with Supabase's default grants, the Realtime publication, the Storage bucket
// table, and stubs for pg_cron, pg_net and Vault (their extensions don't exist in PGlite; the
// migrations' `create extension` lines for them are skipped).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { postgis } from '@electric-sql/pglite-postgis';

const SUPABASE = fileURLToPath(new URL('..', import.meta.url));

const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create publication supabase_realtime;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), phone text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
create function cron.unschedule(id bigint) returns boolean language sql as $$
  delete from cron.job where jobid = id returning true
$$;

create schema net;
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ select 1::bigint $$;

create schema vault;
create table vault.secrets (name text primary key, secret text);
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
`;

/** Lines that need a real Supabase extension (stubbed above). */
const SKIP = /^[ \t]*create extension if not exists (pg_cron|pg_net)\b.*$/gim;

export const migrationFiles = () =>
  readdirSync(`${SUPABASE}migrations`)
    .filter((f) => f.endsWith('.sql'))
    .sort();

export const readSupabaseFile = (path: string) => readFileSync(`${SUPABASE}${path}`, 'utf8');

/**
 * A fresh database with the migrations applied (all of them unless `migrations` lists some) and
 * the seed (unless `seed: false`). `before` runs first, e.g. to create tables that already exist.
 */
export const createDb = async (opts: { seed?: boolean; before?: string; migrations?: string[] } = {}) => {
  const db = await PGlite.create({ extensions: { postgis, pgcrypto } });
  await db.exec(SHIM);
  if (opts.before) await db.exec(opts.before);
  for (const file of opts.migrations ?? migrationFiles()) {
    try {
      await db.exec(readSupabaseFile(`migrations/${file}`).replace(SKIP, '-- (test) $&'));
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
  if (opts.seed !== false) await db.exec(readSupabaseFile('seed.sql'));
  return db;
};

export type Db = Awaited<ReturnType<typeof createDb>>;

/** Runs `fn` as a signed-in app user (role authenticated, JWT sub = userId), like PostgREST does. */
export const asUser = async <T>(db: Db, userId: string | null, fn: () => Promise<T>): Promise<T> => {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`);
  }
};

/** The error message of a statement that must fail. */
export const failure = async (db: Db, sql: string, params: unknown[] = []) => {
  try {
    await db.query(sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`expected to fail: ${sql}`);
};
