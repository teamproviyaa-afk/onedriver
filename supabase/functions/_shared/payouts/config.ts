/** Builds the payout service from Supabase secrets. Nothing here ever reaches the app. */
import type { PayoutStore } from './types.ts';
import { PayoutError } from './types.ts';
import { createCashfreeClient } from './cashfree.ts';
import type { PayoutServiceDeps } from './service.ts';
import { createSupabasePayoutStore } from './store/supabaseRest.ts';
import type { FetchLike } from '../messaging/providers/http.ts';

export type EnvGetter = (key: string) => string | undefined;

export interface PayoutsConfig {
  deps: PayoutServiceDeps;
  apiSecret: string;
  environment: 'sandbox' | 'production';
}

export const loadPayoutsConfig = (env: EnvGetter, opts: { fetch?: FetchLike; store?: PayoutStore; log?: PayoutServiceDeps['log'] } = {}): PayoutsConfig => {
  const get = (k: string) => env(k)?.trim() || undefined;
  const missing: string[] = [];
  const need = (k: string) => {
    const v = get(k);
    if (!v) missing.push(k);
    return v ?? '';
  };
  const environment = (get('CASHFREE_ENV') ?? 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
  const payout = { clientId: need('CASHFREE_PAYOUT_CLIENT_ID'), clientSecret: need('CASHFREE_PAYOUT_CLIENT_SECRET'), publicKeyPem: get('CASHFREE_PAYOUT_PUBLIC_KEY') };
  const verification = {
    clientId: get('CASHFREE_VERIFICATION_CLIENT_ID') ?? payout.clientId,
    clientSecret: get('CASHFREE_VERIFICATION_CLIENT_SECRET') ?? payout.clientSecret,
    publicKeyPem: get('CASHFREE_VERIFICATION_PUBLIC_KEY') ?? payout.publicKeyPem,
  };
  const payloadKey = need('PAYOUT_PAYLOAD_KEY');
  const apiSecret = need('PAYOUTS_API_SECRET');
  const rupees = (k: string, d: number) => {
    const v = Number(get(k) ?? d);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : Math.round(d * 100);
  };

  const store =
    opts.store ??
    createSupabasePayoutStore({ url: need('SUPABASE_URL'), serviceKey: get('SUPABASE_SERVICE_ROLE_KEY') ?? get('SUPABASE_SECRET_KEY') ?? need('SUPABASE_SERVICE_ROLE_KEY'), fetch: opts.fetch });
  if (missing.length) throw new PayoutError('unconfigured', `Missing secrets: ${[...new Set(missing)].join(', ')}`, 500);

  const notifyUrl = get('NOTIFY_URL');
  const notifySecret = get('NOTIFY_API_SECRET');
  const callbackUrl = get('PAYOUT_STATUS_CALLBACK_URL');
  return {
    environment,
    apiSecret,
    deps: {
      store,
      cashfree: createCashfreeClient({
        environment,
        payout,
        verification,
        bankVerificationPath: get('CASHFREE_BANK_VERIFICATION_PATH'),
        upiVerificationPath: get('CASHFREE_UPI_VERIFICATION_PATH'),
        fetch: opts.fetch,
      }),
      webhookSecret: payout.clientSecret,
      payloadKey,
      limits: { minAmountPaise: rupees('PAYOUT_MIN_AMOUNT', 1), maxAmountPaise: rupees('PAYOUT_MAX_AMOUNT', 50000) },
      notify: notifyUrl && notifySecret ? { url: notifyUrl, secret: notifySecret } : undefined,
      statusCallback: callbackUrl ? { url: callbackUrl, secret: apiSecret } : undefined,
      fetch: opts.fetch,
      log: opts.log,
    },
  };
};
