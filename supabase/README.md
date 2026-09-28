# Supabase — OneLocal messaging service

`functions/notify` sends WhatsApp, SMS and email for the OneLocal platform: WhatsApp first, SMS when
the number is not on WhatsApp, fails, times out, or the code is requested again. Setup, secrets,
webhooks, cron and the request format are in
[`OL-ui/rider/docs/MESSAGING.md`](../OL-ui/rider/docs/MESSAGING.md).

```
functions/_shared/messaging/   orchestrator, templates, providers (Meta, Twilio, MSG91, Resend, mock), stores, webhooks
functions/notify/index.ts      Edge Function entry (Deno.serve)
migrations/                    message_log + whatsapp_capability (RLS-locked)
tests/                         node:test suite — cd tests && npm install && npm test
```
