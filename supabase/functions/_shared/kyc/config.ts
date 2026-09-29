/** Builds the KYC service from Supabase secrets. Nothing here ever reaches the app. */
import type { FetchLike } from '../messaging/providers/http.ts';
import { environmentOfSecretKey } from '../payments/cashfreePg.ts';
import { createSecureIdClient } from './secureId.ts';
import type { SecureIdEnvironment } from './secureId.ts';
import type { KycServiceDeps } from './service.ts';
import { createSupabaseKycStore } from './store/supabaseRest.ts';
import type { KycStore } from './types.ts';
import { KycError } from './types.ts';

export type EnvGetter = (key: string) => string | undefined;

export interface KycConfig {
  deps: KycServiceDeps;
  apiSecret: string;
  environment: SecureIdEnvironment;
  /** Where DigiLocker returns the rider (the app's KYC screen). */
  appReturnUrl: string;
  signed: boolean;
}

export const loadKycConfig = (env: EnvGetter, opts: { fetch?: FetchLike; store?: KycStore; log?: KycServiceDeps['log'] } = {}): KycConfig => {
  const get = (k: string) => env(k)?.trim() || undefined;
  const missing: string[] = [];
  const need = (k: string, ...fallbacks: string[]) => {
    const v = get(k) ?? fallbacks.map(get).find(Boolean);
    if (!v) missing.push(k);
    return v ?? '';
  };
  // Secure ID keys; the payouts function's verification keys work too.
  const clientId = need('CASHFREE_SECURE_ID_CLIENT_ID', 'CASHFREE_VERIFICATION_CLIENT_ID');
  const clientSecret = need('CASHFREE_SECURE_ID_CLIENT_SECRET', 'CASHFREE_VERIFICATION_CLIENT_SECRET');
  const publicKeyPem = get('CASHFREE_SECURE_ID_PUBLIC_KEY') ?? get('CASHFREE_VERIFICATION_PUBLIC_KEY');
  const apiSecret = need('KYC_API_SECRET');
  const payloadKey = need('KYC_PAYLOAD_KEY');

  const fromKey = environmentOfSecretKey(clientSecret);
  const declared = get('CASHFREE_SECURE_ID_ENV')?.toLowerCase();
  const declaredEnv: SecureIdEnvironment | null = declared === 'production' ? 'production' : declared === 'sandbox' ? 'sandbox' : null;
  if (fromKey && declaredEnv && fromKey !== declaredEnv) {
    throw new KycError('unconfigured', `CASHFREE_SECURE_ID_ENV=${declaredEnv} but the client secret is a ${fromKey} key — remove CASHFREE_SECURE_ID_ENV or use matching keys`, 500);
  }
  const environment: SecureIdEnvironment = fromKey ?? declaredEnv ?? 'sandbox';

  const supabaseUrl = get('SUPABASE_URL');
  const functionUrl = get('KYC_FUNCTION_URL') ?? (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/kyc` : need('KYC_FUNCTION_URL'));
  const store =
    opts.store ??
    createSupabaseKycStore({ url: supabaseUrl ?? need('SUPABASE_URL'), serviceKey: get('SUPABASE_SERVICE_ROLE_KEY') ?? get('SUPABASE_SECRET_KEY') ?? need('SUPABASE_SERVICE_ROLE_KEY'), fetch: opts.fetch });
  if (missing.length) throw new KycError('unconfigured', `Missing secrets: ${[...new Set(missing)].join(', ')}`, 500);

  const attempts = Number(get('KYC_ATTEMPTS_PER_DAY') ?? 5);
  const threshold = Number(get('KYC_FACE_MATCH_THRESHOLD') ?? 0.75);
  return {
    environment,
    apiSecret,
    signed: !!publicKeyPem,
    appReturnUrl: get('KYC_APP_RETURN_URL') ?? 'onelocalrider://onboarding/kyc',
    deps: {
      store,
      secureId: createSecureIdClient({ environment, clientId, clientSecret, publicKeyPem, apiVersion: get('CASHFREE_SECURE_ID_API_VERSION'), fetch: opts.fetch }),
      payloadKey,
      functionUrl,
      attemptsPerDay: Number.isFinite(attempts) && attempts >= 1 ? Math.floor(attempts) : 5,
      faceMatchThreshold: Number.isFinite(threshold) && threshold > 0 && threshold < 1 ? threshold : 0.75,
      fetch: opts.fetch,
      log: opts.log,
    },
  };
};
