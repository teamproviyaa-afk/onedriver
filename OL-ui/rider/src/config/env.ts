import { z } from 'zod';

/**
 * Runtime environment.
 *
 * Canonical variables (APP_ENV, DATA_MODE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
 * PROVIYAA_API_BASE_URL, SYNC_ENABLED) live in `.env`. Expo inlines only
 * `EXPO_PUBLIC_*` values into the bundle, so `.env` mirrors each canonical
 * variable to its EXPO_PUBLIC_ twin via dotenv-expand. This module is the ONLY
 * place that touches `process.env`; everything else imports `env`.
 *
 * Security: only the Supabase *publishable* key is ever present here. No
 * service-role, admin, payout or server secrets exist in the client.
 */
const schema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  DATA_MODE: z.enum(['local_demo', 'api', 'supabase']).default('local_demo'),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_PUBLISHABLE_KEY: z.string().default(''),
  PROVIYAA_API_BASE_URL: z.string().default(''),
  SYNC_ENABLED: z.boolean().default(false),
});

const toBool = (v: string | undefined, fallback = false): boolean => {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

// Each EXPO_PUBLIC_* reference must be a static member access so Metro can inline it.
const raw = {
  APP_ENV: process.env.EXPO_PUBLIC_APP_ENV || 'local',
  DATA_MODE: process.env.EXPO_PUBLIC_DATA_MODE || 'local_demo',
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  PROVIYAA_API_BASE_URL: process.env.EXPO_PUBLIC_PROVIYAA_API_BASE_URL ?? '',
  SYNC_ENABLED: toBool(process.env.EXPO_PUBLIC_SYNC_ENABLED, false),
};

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  // Fall back to demo defaults rather than crashing the app on a bad .env.
  console.warn('[env] invalid environment, falling back to local_demo', parsed.error.issues);
}

export const env = parsed.success ? parsed.data : schema.parse({});

/** True when the app must run entirely on the deterministic local demo provider. */
export const isLocalDemo = env.DATA_MODE === 'local_demo' || env.PROVIYAA_API_BASE_URL === '';
/** True when the One Local server is configured. */
export const hasApiBase = env.PROVIYAA_API_BASE_URL.trim().length > 0;
/** True when Supabase auth can be used (URL + publishable key present). */
export const hasSupabase = env.SUPABASE_URL.length > 0 && env.SUPABASE_PUBLISHABLE_KEY.length > 0;
/**
 * Real phone sign-in: Supabase Auth, with the code delivered on WhatsApp or SMS by the `notify`
 * Edge Function (Send-SMS hook). DATA_MODE=supabase keeps the local demo data for everything else;
 * DATA_MODE=api also uses the One Local server. DATA_MODE=local_demo signs in with code 123456.
 */
export const isLiveAuth = hasSupabase && env.DATA_MODE !== 'local_demo';
/**
 * Development controls (scenario switcher, debug panels): dev bundles and local-demo
 * release builds (the demo APK) only. Never true when APP_ENV=production.
 */
export const isDevBuild = env.APP_ENV !== 'production' && (__DEV__ || isLocalDemo);

export const appMeta = {
  appHeader: 'onlatur-rider',
  version: '1.0.0',
} as const;
