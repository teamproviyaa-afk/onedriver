// Supabase Edge Function: OneLocal rider payouts on Cashfree (verification, transfers, webhooks).
// Deploy: supabase functions deploy payouts --no-verify-jwt   (routes authenticate themselves)
import { createPayoutsHandlerFromEnv } from '../_shared/payouts/router.ts';

Deno.serve(createPayoutsHandlerFromEnv((key) => Deno.env.get(key)));
