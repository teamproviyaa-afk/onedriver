# Rider payouts — Cashfree

Riders withdraw their earnings to their own UPI ID or bank account, and anything they don't withdraw
is paid every Monday. Money goes out through **Cashfree Payouts**; UPI IDs and bank accounts are
checked with **Cashfree Secure ID** (the account must be active and in the rider's name).

The app never talks to Cashfree and holds no payout keys. The flow is:

```
Rider app ──► One Local server ──► payouts Edge Function (Supabase) ──► Cashfree
   │  GET /rider/wallet            POST /transfers (x-payouts-secret)     │
   │  POST /rider/payouts/withdraw ◄── status callback (signed) ◄──── webhooks + reconciliation
```

* `supabase/functions/payouts` — verification, idempotent transfers, webhooks and reconciliation.
* The One Local server owns the rider's balance and limits. It calls the function with a server secret.
* The app shows the balance, takes the amount, and follows the transfer until the bank answers.

## Go live in 5 steps

1. **Cashfree account.** Sign up at cashfree.com with the business PAN. Complete KYC and activate
   **Payouts** (and **Secure ID** for verification). Payouts need a **business current account**; you
   load money into the Payouts balance from it.
2. **Keys.** In the Cashfree dashboard → Payouts → Developers:
   * API keys → copy the Client ID and Client Secret (start with the **Test/Sandbox** keys);
   * Two-Factor Authentication → choose **Public Key** and download it (Supabase has no fixed IP to whitelist).
   * Bank / UPI verification uses **Secure ID**: its keys go in `CASHFREE_VERIFICATION_CLIENT_ID`,
     `CASHFREE_VERIFICATION_CLIENT_SECRET` and `CASHFREE_VERIFICATION_PUBLIC_KEY` (the same keys as KYC —
     see [KYC.md](KYC.md)); left empty, the payout keys are used.
3. **Configure and deploy** (from the repository root, on your computer):
   ```bash
   cp supabase/.env.payouts.example supabase/.env.payouts    # paste the keys there — never commit this file
   export SUPABASE_ACCESS_TOKEN=sbp_…                         # supabase.com/dashboard/account/tokens
   bash supabase/setup-payouts.sh
   ```
   It creates the tables, uploads the secrets, deploys the function and starts reconciliation (every
   minute). If `supabase/setup-messaging.sh` has run, riders also get a WhatsApp/SMS "payout sent" message.
4. **Webhook.** Cashfree dashboard → Payouts → Developers → Webhooks → add
   `https://ywylhzcxuoeilygzdonx.supabase.co/functions/v1/payouts/webhooks/cashfree` (v2, all transfer events).
5. **Try it in sandbox**, then switch `CASHFREE_ENV=production` with the production keys and re-run step 3:
   ```bash
   bash supabase/setup-payouts.sh verify-upi yourname@okaxis "Your Name"
   bash supabase/setup-payouts.sh test-payout 100            # sandbox only
   ```

If the Vault step prints a warning, run this once in the Supabase SQL editor (values from
`supabase/.env.payouts`):

```sql
select vault.create_secret('<PAYOUTS_API_SECRET>', 'payouts_api_secret');
select vault.create_secret('https://ywylhzcxuoeilygzdonx.supabase.co/functions/v1/payouts/sweep', 'payouts_sweep_url');
```

## Rules

| Rule | How |
|---|---|
| Only the rider's own account | Cashfree returns the name registered at the bank / UPI. It is compared with the rider's legal name (initials and titles allowed). A poor match is refused (`name_mismatch`); a partial match is allowed and shown. |
| Never paid twice | The app sends an `Idempotency-Key` per withdrawal. The function turns (rider, key) into a fixed Cashfree `transfer_id`, stores the payout **before** calling Cashfree, and returns the existing payout for a repeated key. A timeout leaves the payout `unknown`; reconciliation asks Cashfree and it is **never re-sent**. |
| Final status | Cashfree webhooks (signature checked) and a reconciliation sweep every minute. `success` carries the UTR; `failed` / `reversed` give the money back to the balance. |
| Limits | Per payout min/max (`PAYOUT_MIN_AMOUNT`, `PAYOUT_MAX_AMOUNT`). The One Local server sets per-day count, fee, and any block (e.g. cash in hand above the limit). |
| Privacy | Account numbers and UPI IDs are shown masked (`A/C ****4521`, `UPI ra•••••@ybl`). The contact used for the "payout sent" message is kept encrypted and deleted after use (or after 7 days). Nothing is logged in full. |
| Money | Paise integers on the server; rupees with ≤ 2 decimals at the edges. |

## In the app

| Screen | What it does |
|---|---|
| Earnings → **WITHDRAW EARNINGS** → `/earnings/withdraw` | Available balance, amount with quick picks (₹500 / ₹1,000 / All), destination, fee and "you receive", confirm sheet, live status (Processing → Credited with UTR, or Failed → back in balance), recent payouts, next weekly payout. |
| `/onboarding/payout/upi` · `/bank` | Onboarding: verify and submit. With `?mode=manage` (Profile → payout method, Withdraw → Change) the rider changes the account; refusals show inline ("This account is registered to …"). |
| Profile | The verified payout account (masked). |
| Alerts | "Withdrawal credited" / "Withdrawal failed". |

If the server reports `instant.enabled = false`, the screen shows only the weekly payout (the V1
"coming soon" behaviour).

### Local demo (`DATA_MODE=local_demo`)

The demo server simulates everything: the returning rider (`9876543210`) has ₹1,420 unpaid since
yesterday's ₹3,120 weekly payout. A withdrawal is credited after 5 s with a UTR and a "payout sent"
WhatsApp in the dev outbox. Limits: ₹100–₹5,000, 3 a day, no fee.

| Try | Result |
|---|---|
| UPI `invalid@ybl` · bank A/C ending `0000` | Account not active / closed |
| UPI `mismatch@ybl` · bank A/C ending `9999` · a holder name that isn't yours | Registered to someone else → refused |
| Holder "Rahul Verma" for Rahul Sharma | Partial match → allowed, noted |
| Dev scenarios → **Withdrawal Fails** | The next withdrawal fails; the amount returns to the balance |
| Dev scenarios → **Cash Limit** | Withdrawals blocked until the cash in hand is deposited |

## Server contract

### App ↔ One Local server

| Endpoint | Response |
|---|---|
| `PUT /rider/payout` `{ method: "upi", vpa }` or `{ method: "bank", holder, account_no, ifsc }` | `{ id, method, vpa?, account_last4?, ifsc?, bank_name?, verified_name, name_match, status: "verified", provider: "cashfree" }` · 422 `account_invalid` / `name_mismatch` |
| `GET /rider/wallet` | `{ balance, available, in_flight, instant: { enabled, min_amount, max_amount, fee, withdrawals_left_today, blocked_reason? }, weekly: { next_payout_at, description }, payout_method, recent: [payout] }` |
| `POST /rider/payouts/withdraw` `{ amount }` + `Idempotency-Key` | `payout` · 422 `validation` / `insufficient_balance` / `payout_blocked`, 409 `no_payout_account`, 429 `rate_limited` |
| `GET /rider/payouts?cursor=` | `{ items: [payout], next_cursor }` |
| `GET /rider/payouts/:id` | `payout` (the app polls it every 2.5 s until final) |

`payout = { id, kind: "instant" | "weekly", mode: "upi" | "imps", amount, fee, net, status: "processing" | "unknown" | "success" | "failed" | "reversed", utr?, status_description?, destination, period_label?, created_at, completed_at? }`

### One Local server ↔ `payouts` function

All calls carry `x-payouts-secret: <PAYOUTS_API_SECRET>`.

| Call | Body → response |
|---|---|
| `POST /payouts/accounts/verify` | `{ riderId, riderName, method, vpa? , accountNumber?, ifsc?, phone?, email? }` → account view (masked) · 422 `account_invalid` / `name_mismatch` |
| `POST /payouts/transfers` | `{ riderId, amount, kind, idempotencyKey, periodLabel?, contact?: { name, phone?, email? } }` → payout view |
| `GET /payouts/transfers/<transferId>` | payout view (refreshed from Cashfree while pending) |
| `GET /payouts/riders/<riderId>/payouts?limit=` | `{ payouts: [...] }` |

Withdrawal on the One Local server:

1. In one database transaction: check the rider's balance, limits and blocks, and **reserve** the amount.
2. Call `POST /payouts/transfers` with `amount` = net amount (after any fee) and the app's
   `Idempotency-Key` as `idempotencyKey`. On a timeout, call it again with the same key — never a new one.
3. Set `PAYOUT_STATUS_CALLBACK_URL`: the function POSTs `{ event: "payout.updated", payout }` on every final
   status, signed with `x-onelocal-signature` = hex HMAC-SHA256(`PAYOUTS_API_SECRET`, raw body). On
   `failed` / `reversed`, release the reservation; on `success`, mark it paid.

The weekly run does the same with `kind: "weekly"`, `idempotencyKey: "weekly:<rider>:<ISO week>"` and a
`periodLabel` such as `21–27 Sep`.
