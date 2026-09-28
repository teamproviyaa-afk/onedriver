// Supabase Edge Function: OneLocal messaging (WhatsApp → SMS fallback, email).
// Deploy: supabase functions deploy notify --no-verify-jwt   (routes authenticate themselves)
import { createNotifyHandlerFromEnv } from '../_shared/messaging/router.ts';

Deno.serve(createNotifyHandlerFromEnv((key) => Deno.env.get(key)));
