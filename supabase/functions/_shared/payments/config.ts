/** Builds the payments service from Supabase secrets. Nothing here ever reaches the app. */
import type { FetchLike } from '../messaging/providers/http.ts';
import { createCashfreePgClient, environmentOfSecretKey } from './cashfreePg.ts';
import type { PgEnvironment } from './cashfreePg.ts';
import type { PaymentsServiceDeps } from './service.ts';
import { createSupabaseDepositStore } from './store/supabaseRest.ts';
import type { DepositStore } from './types.ts';
import { PaymentError } from './types.ts';

export type EnvGetter = (key: string) => string | undefined;

export interface PaymentsConfig {
  deps: PaymentsServiceDeps;
  apiSecret: string;
  environment: PgEnvironment;
  /** Where the checkout returns the rider (the app's deep link). */
  appReturnUrl: string;
}

export const loadPaymentsConfig = (env: EnvGetter, opts: { fetch?: FetchLike; store?: DepositStore; log?: PaymentsServiceDeps['log'] } = {}): PaymentsConfig => {
  const get = (k: string) => env(k)?.trim() || undefined;
  const missing: string[] = [];
  const need = (k: string) => {
    const v = get(k);
    if (!v) missing.push(k);
    return v ?? '';
  };
  const appId = need('CASHFREE_PG_APP_ID');
  const secretKey = need('CASHFREE_PG_SECRET_KEY');
  const apiSecret = need('PAYMENTS_API_SECRET');

  // Production keys start with cfsk_ma_prod_, test keys with cfsk_ma_test_: use the environment the key belongs to.
  const fromKey = environmentOfSecretKey(secretKey);
  const declared = get('CASHFREE_PG_ENV')?.toLowerCase();
  const declaredEnv: PgEnvironment | null = declared === 'production' ? 'production' : declared === 'sandbox' ? 'sandbox' : null;
  if (fromKey && declaredEnv && fromKey !== declaredEnv) {
    throw new PaymentError('unconfigured', `CASHFREE_PG_ENV=${declaredEnv} but the secret key is a ${fromKey} key — remove CASHFREE_PG_ENV or use matching keys`, 500);
  }
  const environment: PgEnvironment = fromKey ?? declaredEnv ?? 'sandbox';

  const rupees = (k: string, d: number) => {
    const v = Number(get(k) ?? d);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : Math.round(d * 100);
  };
  const supabaseUrl = get('SUPABASE_URL');
  const functionUrl = get('PAYMENTS_FUNCTION_URL') ?? (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/payments` : need('PAYMENTS_FUNCTION_URL'));
  const store =
    opts.store ??
    createSupabaseDepositStore({ url: supabaseUrl ?? need('SUPABASE_URL'), serviceKey: get('SUPABASE_SERVICE_ROLE_KEY') ?? get('SUPABASE_SECRET_KEY') ?? need('SUPABASE_SERVICE_ROLE_KEY'), fetch: opts.fetch });
  if (missing.length) throw new PaymentError('unconfigured', `Missing secrets: ${[...new Set(missing)].join(', ')}`, 500);

  const minutes = Number(get('DEPOSIT_LINK_MINUTES') ?? 30);
  const callbackUrl = get('PAYMENT_STATUS_CALLBACK_URL');
  const methods = get('PAYMENT_METHODS');
  return {
    environment,
    apiSecret,
    appReturnUrl: get('APP_RETURN_URL') ?? 'onelocalrider://cash',
    deps: {
      store,
      cashfree: createCashfreePgClient({ environment, appId, secretKey, apiVersion: get('CASHFREE_PG_API_VERSION'), fetch: opts.fetch }),
      webhookSecret: secretKey,
      functionUrl,
      limits: { minAmountPaise: rupees('PAYMENT_MIN_AMOUNT', 1), maxAmountPaise: rupees('PAYMENT_MAX_AMOUNT', 50000) },
      linkMinutes: Number.isFinite(minutes) && minutes >= 15 && minutes <= 1440 ? minutes : 30,
      // UPI by default: no card fees on cash deposits. "all" shows every method Cashfree enabled.
      paymentMethods: methods === 'all' ? undefined : (methods ?? 'upi'),
      upiIntent: get('PAYMENT_UPI_INTENT') === 'true',
      statusCallback: callbackUrl ? { url: callbackUrl, secret: apiSecret } : undefined,
      fetch: opts.fetch,
      log: opts.log,
    },
  };
};
