// Supabase Edge Function: OneLocal rider KYC on Cashfree Secure ID (DigiLocker Aadhaar, PAN, selfie
// liveness + face match, driving licence, vehicle RC).
// Deploy: supabase functions deploy kyc --no-verify-jwt   (routes authenticate themselves)
import { createKycHandlerFromEnv } from '../_shared/kyc/router.ts';

Deno.serve(createKycHandlerFromEnv((key) => Deno.env.get(key)));
