# Supabase — OneLocal messaging, payouts and payments

`functions/notify` sends WhatsApp, SMS and email for the OneLocal platform: WhatsApp first, SMS when
the number is not on WhatsApp, fails, times out, or the code is requested again. Setup, secrets,
webhooks, cron and the request format are in
[`OL-ui/rider/docs/MESSAGING.md`](../OL-ui/rider/docs/MESSAGING.md).

Go live: `cp .env.notify.example .env.notify`, fill in keys, `export SUPABASE_ACCESS_TOKEN=…`,
then `bash supabase/setup-messaging.sh` and `bash supabase/setup-messaging.sh test <phone>`.

```
setup-messaging.sh             one-command setup/deploy/test
functions/_shared/messaging/   orchestrator, templates, providers (Meta, Twilio, MSG91, Resend, mock), stores, webhooks
functions/notify/index.ts      Edge Function entry (Deno.serve)
migrations/                    message_log + whatsapp_capability (RLS-locked)
tests/                         node:test suite — cd tests && npm install && npm test
```

## Payouts (Cashfree)

`functions/payouts` pays riders through Cashfree Payouts: UPI / bank verification with name match,
idempotent transfers (a retry never pays twice), webhooks and a reconciliation sweep every minute, and a
"payout sent" WhatsApp/SMS through `notify`. It is called by the One Local server (never by the app).
Setup and request format: [`OL-ui/rider/docs/PAYOUTS.md`](../OL-ui/rider/docs/PAYOUTS.md).

Go live: `cp .env.payouts.example .env.payouts`, add the Cashfree keys, `export SUPABASE_ACCESS_TOKEN=…`,
then `bash supabase/setup-payouts.sh` and add the webhook it prints in the Cashfree dashboard.

```
setup-payouts.sh               one-command setup/deploy (+ verify-upi, test-payout in sandbox, health)
functions/_shared/payouts/     service, Cashfree client, name match, stores, router
functions/payouts/index.ts     Edge Function entry (Deno.serve)
migrations/*_payouts.sql       payout_accounts + payouts (RLS-locked), reconciliation + contact purge cron
```

## Cash deposits (Cashfree Payment Gateway)

`functions/payments` lets riders pay the COD cash they hold by UPI: one Cashfree payment link per
(rider, idempotency key), webhooks re-read from Cashfree, a reconciliation sweep every minute, and a
signed callback so the One Local server credits the cash ledger. Setup and request format:
[`OL-ui/rider/docs/PAYMENTS.md`](../OL-ui/rider/docs/PAYMENTS.md).

Go live: `cp .env.payments.example .env.payments`, add the Cashfree PG App ID and Secret Key,
`export SUPABASE_ACCESS_TOKEN=…`, then `bash supabase/setup-payments.sh` and
`bash supabase/setup-payments.sh test-deposit 1 <phone>`.

```
setup-payments.sh              one-command setup/deploy (+ test-deposit, status, health)
functions/_shared/payments/    service, Cashfree PG client, stores, router
functions/payments/index.ts    Edge Function entry (Deno.serve)
migrations/*_cash_deposits.sql cash_deposits (RLS-locked) + reconciliation cron
```
