// Supabase Edge Function: OneLocal cash deposits on Cashfree Payment Gateway (payment links, webhooks).
// Deploy: supabase functions deploy payments --no-verify-jwt   (routes authenticate themselves)
import { createPaymentsHandlerFromEnv } from '../_shared/payments/router.ts';

Deno.serve(createPaymentsHandlerFromEnv((key) => Deno.env.get(key)));
