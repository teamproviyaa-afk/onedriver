# Messaging — WhatsApp → SMS fallback and email

Every WhatsApp, SMS and email is sent **by the server**, from the Supabase Edge Function
[`supabase/functions/notify`](../../../supabase/functions/notify). Provider keys live only in
Supabase secrets. The rider app never holds them and never sends a message itself: it asks the
One Local server, which checks the request and calls `notify`.

## When a message goes by SMS instead of WhatsApp

Phone messages try WhatsApp first. SMS is sent when:

| Reason (`fallback_reason`) | What happened |
|---|---|
| `no_whatsapp` | WhatsApp rejected the number as not having an account (Meta error 131026, Twilio 63003/63024), at send time or later through the delivery webhook |
| `known_no_whatsapp` | The number failed that way in the last 30 days, so WhatsApp is skipped |
| `whatsapp_failed` | Any other WhatsApp failure |
| `whatsapp_timeout` | WhatsApp accepted it but did not confirm delivery before the deadline (30 s for codes) |
| `resend_escalated` | The same code was requested again within 5 minutes of a WhatsApp send |
| `whatsapp_unavailable` | No WhatsApp provider or template is configured |

The fallback SMS is claimed atomically in the database, so a delivery webhook and the timeout
sweep can never both send it. SOS alerts go on WhatsApp **and** SMS at the same time.

## Messages

| Template | To | Channels | SMS fallback after |
|---|---|---|---|
| `login_otp` | rider | WhatsApp → SMS (via the Supabase Auth Send-SMS hook) | 30 s |
| `delivery_otp` | customer | WhatsApp → SMS, sent at pickup; rider can resend | 30 s |
| `order_delivered` | customer | WhatsApp → SMS, plus email receipt when an email is on file | 5 min |
| `rider_approved` | rider | WhatsApp → SMS, plus email | 10 min |
| `payout_sent` | rider | WhatsApp → SMS, plus email | 10 min |
| `weekly_statement` | rider | email only (PDF link) | — |
| `sos_alert` | rider's emergency contact | WhatsApp + SMS together | — |

Limits: 5 codes per number per 15 minutes; a resend needs 30 s between sends.

## Privacy

* Numbers and emails are stored only as a peppered SHA-256 hash plus a masked form (`+91 ******3210`).
* The data needed for a pending SMS fallback is AES-256-GCM encrypted and deleted as soon as
  WhatsApp delivers, the SMS is sent, or after one day.
* Logs contain ids, template, channel, provider and error codes — never numbers, emails or codes.
* `message_log` and `whatsapp_capability` have RLS on with no client policies; the app's
  publishable key cannot read them.
* The rider app never receives a customer's number, not even masked; it only sees the channel.

## Setup (production)

### 1. Provider accounts

* **WhatsApp**: Meta WhatsApp Business (Cloud API) or Twilio. Create and get approved:
  `onelocal_login_otp` (Authentication category, one variable, copy-code button),
  `onelocal_delivery_otp` (Utility: name, order, otp), `onelocal_order_delivered` (name, order, time),
  `onelocal_rider_approved` (name), `onelocal_payout_sent` (name, amount, period),
  `onelocal_sos_alert` (name, location). Other names can be mapped with `WA_TEMPLATE_<ID>`.
* **SMS (India)**: MSG91 (or Twilio). Register each SMS text from
  [`templates.ts`](../../../supabase/functions/_shared/messaging/templates.ts) as a DLT template,
  create a MSG91 Flow per template with variables named exactly like the params, and set
  `MSG91_FLOW_<ID>`.
* **Email**: Resend with a verified sending domain.

### 2. Database

```bash
supabase link --project-ref ywylhzcxuoeilygzdonx
supabase db push            # applies supabase/migrations/*_messaging.sql
```

### 3. Secrets

```bash
supabase secrets set \
  MESSAGE_HASH_PEPPER=$(openssl rand -hex 32) \
  MESSAGE_PAYLOAD_KEY=$(openssl rand -base64 32) \
  NOTIFY_API_SECRET=$(openssl rand -hex 32) \
  NOTIFY_PUBLIC_URL=https://ywylhzcxuoeilygzdonx.supabase.co/functions/v1/notify \
  WHATSAPP_PROVIDER=meta META_WA_ACCESS_TOKEN=… META_WA_PHONE_NUMBER_ID=… \
  META_APP_SECRET=… META_WEBHOOK_VERIFY_TOKEN=$(openssl rand -hex 16) \
  SMS_PROVIDER=msg91 MSG91_AUTH_KEY=… \
  MSG91_FLOW_LOGIN_OTP=… MSG91_FLOW_DELIVERY_OTP=… MSG91_FLOW_ORDER_DELIVERED=… \
  MSG91_FLOW_RIDER_APPROVED=… MSG91_FLOW_PAYOUT_SENT=… MSG91_FLOW_SOS_ALERT=… \
  EMAIL_PROVIDER=resend RESEND_API_KEY=… EMAIL_FROM="OneLocal <no-reply@your-domain>" \
  SEND_SMS_HOOK_SECRET="v1,whsec_…"
```

Twilio instead: `WHATSAPP_PROVIDER=twilio` and/or `SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_SMS_FROM`) and
`TWILIO_CONTENT_SID_<ID>` per WhatsApp template. `SUPABASE_URL` and the service key are provided
to Edge Functions automatically. A missing secret makes the function answer 500 naming it.

### 4. Deploy

```bash
supabase functions deploy notify --no-verify-jwt   # each route checks its own signature/secret
```

### 5. Webhooks and hooks

* **Meta**: App → WhatsApp → Configuration → callback URL `…/functions/v1/notify/webhooks/meta`,
  verify token = `META_WEBHOOK_VERIFY_TOKEN`, subscribe to `messages`.
* **Twilio**: status callbacks are set on each message automatically from `NOTIFY_PUBLIC_URL`.
* **Sign-in codes**: Supabase Dashboard → Authentication → Hooks → *Send SMS* → HTTPS →
  `…/functions/v1/notify/hooks/send-sms`; generate the secret and store it as `SEND_SMS_HOOK_SECRET`.

### 6. Fallback timer (Supabase Cron)

```sql
select vault.create_secret('<NOTIFY_API_SECRET>', 'notify_api_secret');

select cron.schedule('notify-sweep', '15 seconds', $$
  select net.http_post(
    url     := 'https://ywylhzcxuoeilygzdonx.supabase.co/functions/v1/notify/sweep',
    headers := jsonb_build_object('Content-Type', 'application/json',
               'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_api_secret')),
    body    := '{}'::jsonb);
$$);

select cron.schedule('purge-message-payloads', '17 * * * *', $$ select public.purge_message_payloads(); $$);
```

## How the One Local server uses it

Server-to-server call (never from the app):

```http
POST https://ywylhzcxuoeilygzdonx.supabase.co/functions/v1/notify/send
x-notify-secret: <NOTIFY_API_SECRET>
Content-Type: application/json

{ "template": "delivery_otp",
  "to": { "phone": "9876543210" },
  "params": { "name": "Amit", "order": "#9830", "otp": "4821" },
  "idempotencyKey": "job-9830:delivery_otp:1",
  "related": { "type": "job", "id": "job-9830" } }
```

Response: `{ requestId, template, phone: { channel, status, fallbackUsed, fallbackReason, fallbackPending, toMasked }, email }`.
Errors: `400 validation`, `401 unauthorized`, `429 rate_limited`, `500 unconfigured`.

Rider-app endpoints the server exposes (see [API_MAP.md](API_MAP.md)):

| Endpoint | Server does | Returns |
|---|---|---|
| `POST /api/rider/jobs/:id/otp/resend` | checks the job belongs to the rider and is picked up, not OTP-locked; sends `delivery_otp` | receipt without any number |
| `POST /api/rider/statements/:week/email` | sends `weekly_statement` to the rider's email; `400 validation` when none is on file | receipt with the masked email |
| `POST /api/rider/sos` | alerts operations, sends `sos_alert` to the emergency contact | `{ contact_alert }` |
| `PUT /api/rider/profile` | stores the optional `email` | rider |

Also send `delivery_otp` when the package is picked up, `order_delivered` after proof, `rider_approved`
on approval and `payout_sent` after each payout.

## Local testing

* Server: `cd supabase/tests && npm install && npm test` (43 tests: every fallback path, provider
  request formats, signatures, routes, store queries, privacy) and `npm run typecheck`.
* Mock providers: `WHATSAPP_PROVIDER=mock SMS_PROVIDER=mock EMAIL_PROVIDER=mock`, with
  `MOCK_NO_WHATSAPP=9000000001` for a number without WhatsApp.
* App demo (`DATA_MODE=local_demo`): sign in with `9876543210` (code on WhatsApp; *Resend by SMS*
  goes by SMS). Numbers `9000000001` / `9000000002` are "not on WhatsApp". The dev scenario
  *Customer Not on WhatsApp* sends the delivery OTP and receipt by SMS, and **Dev → Messages sent**
  lists everything the simulated server sent.
