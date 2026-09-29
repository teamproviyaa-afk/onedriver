# Cash deposits by UPI — Cashfree Payment Gateway

Riders who collect cash on delivery (COD) hold OneLocal's money. On the **Cash in hand** screen they
can now pay it back by UPI instead of going to the store counter. Payment goes through
**Cashfree Payment Gateway** (Payment Links). As soon as Cashfree confirms it, the cash ledger is
credited and a rider who was blocked by the cash limit can go online again.

The app never talks to Cashfree and holds no keys:

```
Rider app ──► One Local server ──► payments Edge Function (Supabase) ──► Cashfree PG
   │ POST /rider/cash/deposits      POST /deposits (x-payments-secret)      │ payment link
   │ opens checkout_url  ─────────────────────────────────────────────────► Cashfree checkout (UPI)
   │ GET /rider/cash/deposits/:id ◄── status callback (signed) ◄──── webhooks + reconciliation
```

## Go live

1. **Keys.** Cashfree dashboard → Payment Gateway → Developers → API Keys gives an **App ID** and a
   **Secret Key**. Production secret keys start with `cfsk_ma_prod_` (real money); test keys with
   `cfsk_ma_test_`. The function uses the environment the key belongs to.
2. **Configure and deploy** (from the repository root, on your computer):
   ```bash
   cp supabase/.env.payments.example supabase/.env.payments   # put the App ID and Secret Key here — git-ignored, never commit it
   export SUPABASE_ACCESS_TOKEN=sbp_…                         # supabase.com/dashboard/account/tokens
   bash supabase/setup-payments.sh
   ```
   It creates the `cash_deposits` table, uploads the secrets, deploys the function and starts
   reconciliation (every minute).
3. **Webhook.** Cashfree dashboard → Payment Gateway → Developers → Webhooks → add
   `https://ywylhzcxuoeilygzdonx.supabase.co/functions/v1/payments/webhooks/cashfree`
   (payment link and payment success / failed events). Each link also carries this URL, and the
   reconciliation job checks pending deposits, so payments are confirmed either way.
4. **Try ₹1:**
   ```bash
   bash supabase/setup-payments.sh test-deposit 1 <your 10-digit mobile>
   # open the checkoutUrl it prints, pay ₹1 by UPI, then:
   bash supabase/setup-payments.sh status <id>
   ```
   With production keys this is a real ₹1 payment into your Cashfree account.
5. If Cashfree reports that the return URL or domain is not whitelisted, add
   `ywylhzcxuoeilygzdonx.supabase.co` under Developers → Whitelisting.

If the Vault step prints a warning, run this once in the Supabase SQL editor (values from
`supabase/.env.payments`):

```sql
select vault.create_secret('<PAYMENTS_API_SECRET>', 'payments_api_secret');
select vault.create_secret('https://ywylhzcxuoeilygzdonx.supabase.co/functions/v1/payments/sweep', 'payments_sweep_url');
```

**Keep the Secret Key secret.** It is uploaded as a Supabase secret and never ships in the app. If
it was ever pasted into a chat, email or ticket, generate a new one in the Cashfree dashboard, put it
in `supabase/.env.payments` and run the setup again.

## Rules

| Rule | How |
|---|---|
| Never charged twice | The app sends an `Idempotency-Key` per deposit. The function turns (rider, key) into a fixed Cashfree `link_id`, stores the deposit **before** calling Cashfree, and returns the same checkout for a repeated key (also after a lost response). |
| Paid means paid | Webhooks are signature-checked and only trigger a re-read of the link from Cashfree. A deposit is `paid` only when Cashfree reports the **full** amount (partial payments are off). The return URL carries no status. |
| Late payments count | A payment that lands as the link expires still moves the deposit to `paid`. |
| Amount | Up to the cash in hand (the One Local server enforces it), within `PAYMENT_MIN_AMOUNT` / `PAYMENT_MAX_AMOUNT`. |
| Methods | UPI only by default (`PAYMENT_METHODS=upi`, no card fees); `upi,nb,dc` or `all` to widen. |
| Expiry | Links close after `DEPOSIT_LINK_MINUTES` (30). The reconciliation job re-reads pending deposits every minute. |
| Privacy | Cashfree gets the rider's own phone (required for the payer) and name. No card or bank details are stored — only Cashfree references and the UPI/bank reference number. |

## In the app

`/cash` → **PAY BY UPI**: the amount defaults to all cash in hand (editable, never more). **PAY ₹… BY
UPI** opens Cashfree's checkout in the system browser (PhonePe, Google Pay, Paytm or any UPI app).
Afterwards the app shows *Waiting for your UPI payment* until the server confirms it, then *Deposit
received* with the reference. The cash ledger shows "UPI via Cashfree · Ref …" and Alerts shows
"Cash deposit received". Cashfree sends the rider back to `onelocalrider://cash?deposit=<id>`.

If the server does not send `upi_deposit.enabled`, the screen shows counter deposits only.

### Local demo (`DATA_MODE=local_demo`)

No Cashfree page opens: a **Cashfree checkout (demo)** sheet lets you pay or cancel. Paying credits
the ledger with a reference; cancelling or waiting 30 minutes takes nothing. Dev scenario **Cash
Limit** + a UPI deposit shows the rider unblocked straight away.

## Server contract

### App ↔ One Local server

| Endpoint | Response |
|---|---|
| `GET /rider/cash` | `{ cash_in_hand, cash_limit, ledger: [{ id, kind, amount, created_at, job_id?, note? }], deposit_instructions, upi_deposit?: { enabled, min_amount, max_amount } }` |
| `POST /rider/cash/deposits` `{ amount }` + `Idempotency-Key` | `deposit` · 422 `validation` (more than the cash in hand, below the minimum) |
| `GET /rider/cash/deposits/:id` | `deposit` (the app polls it every 3 s while pending) |

`deposit = { id, amount, status: "pending" | "paid" | "expired" | "cancelled" | "failed", checkout_url?, expires_at?, reference?, method?, created_at, paid_at? }`

### One Local server ↔ `payments` function

All calls carry `x-payments-secret: <PAYMENTS_API_SECRET>`.

| Call | Body → response |
|---|---|
| `POST /payments/deposits` | `{ riderId, amount, idempotencyKey, customer: { phone, name?, email? } }` → `{ id, riderId, amount, amountPaid, status, checkoutUrl, expiresAt, reference, method, failureReason, createdAt, paidAt }` |
| `GET /payments/deposits/<id>` | the same (refreshed from Cashfree while pending) |
| `GET /payments/riders/<riderId>/deposits?limit=` | `{ deposits: [...] }` |

Set `PAYMENT_STATUS_CALLBACK_URL`: on every final status the function POSTs
`{ event: "deposit.updated", deposit }`, signed with `x-onelocal-signature` = hex HMAC-SHA256
(`PAYMENTS_API_SECRET`, raw body). On `paid`, insert one `deposited` row in the rider's cash ledger
for `amountPaid` — keyed by the deposit id so a repeated callback is harmless.
