# Rider KYC — Cashfree Secure ID

Riders are verified automatically instead of by upload and manual review. Every check runs on the
server through **Cashfree Secure ID**, so the app holds no keys and never sees anyone else's data:

| Check | How | Refused when |
|---|---|---|
| **Aadhaar** | DigiLocker consent (the rider signs in to DigiLocker; Cashfree returns the e-Aadhaar) | the Aadhaar name doesn't match the profile name, consent is refused, or the session expires |
| **PAN** | Cashfree PAN verification, name-matched to the **Aadhaar** name | not valid, or registered to someone else |
| **Selfie** | Face liveness, then face match with the Aadhaar photo | not a live face, or a different person |
| **Driving licence** | Number + date of birth (taken from Aadhaar) | not found, expired, or someone else's |
| **Vehicle RC** | Registration lookup (on the vehicle step) | not found, suspended / cancelled, or expired. Rented vehicles in someone else's name are allowed |

```
Rider app ──► One Local server ──► kyc Edge Function (Supabase) ──► Cashfree Secure ID
   │ POST /rider/kyc/digilocker/start       POST /digilocker/start
   │ opens DigiLocker ─────────────────────────────────────────────► DigiLocker consent
   │ ◄── onelocalrider://onboarding/kyc?digilocker=<id> ◄── /digilocker/return (302)
   │ POST /rider/kyc/documents {kind…}      POST /digilocker/complete · /pan · /selfie · /driving-licence
   │ PUT  /rider/vehicle                    POST /vehicle-rc
```

## Go live

1. **Keys.** Cashfree dashboard → Secure ID → Developers → API Keys gives a **Client ID** and a
   **Client Secret** (`cfsk_ma_prod_…` = production, `cfsk_ma_test_…` = test). Then Developers →
   Two-Factor Authentication → choose **Public Key** and download it. Supabase has no fixed IP to
   whitelist, so without the public key Cashfree answers "IP not whitelisted".
2. **Configure and deploy** (from the repository root, on your computer):
   ```bash
   cp supabase/.env.kyc.example supabase/.env.kyc     # put the Client ID, Client Secret and Public Key here — git-ignored, never commit it
   export SUPABASE_ACCESS_TOKEN=sbp_…                 # supabase.com/dashboard/account/tokens
   bash supabase/setup-kyc.sh
   ```
3. **Try it** (production checks are billed by Cashfree):
   ```bash
   bash supabase/setup-kyc.sh test-pan ABCDE1234F "Your Name"
   bash supabase/setup-kyc.sh test-digilocker          # open the link, sign in to DigiLocker, then:
   bash supabase/setup-kyc.sh complete <verificationId> "Your name as on Aadhaar"
   ```
4. Make sure the products you use (DigiLocker, PAN, Driving Licence, Vehicle RC, Face Liveness, Face
   Match) are enabled on your Secure ID account and that it has balance: Cashfree answers 422
   "Insufficient balance" otherwise.

The same Secure ID keys can also verify payout bank accounts / UPI IDs: put them in
`supabase/.env.payouts` as `CASHFREE_VERIFICATION_CLIENT_ID`, `CASHFREE_VERIFICATION_CLIENT_SECRET`
and `CASHFREE_VERIFICATION_PUBLIC_KEY` (see [PAYOUTS.md](PAYOUTS.md)).

**Keep the Client Secret secret.** It lives only in `supabase/.env.kyc` and Supabase secrets. If it
was ever pasted into a chat, email or ticket, generate a new one in the dashboard and run the setup again.

## Rules

| Rule | How |
|---|---|
| Aadhaar data | Only the last 4 digits are kept (`XXXX XXXX 4821`), plus the name, date of birth and gender for later checks. Never the full number, never the XML or document images. |
| Aadhaar photo | Kept AES-GCM encrypted only until the selfie matches it, then deleted; deleted after 24 hours at the latest (cron). |
| Selfie before Aadhaar | Liveness is checked; the result is *pending* until Aadhaar arrives, then the One Local server sends the stored selfie again for the face match. |
| Someone else's session | A DigiLocker session can only be completed by the rider who started it. |
| Cost control | Every Cashfree call is billed, so each rider gets `KYC_ATTEMPTS_PER_DAY` (5) calls per check per 24 h (429 `rate_limited` after that). Every call is recorded in `kyc_checks` (no numbers, no images). |
| Outages | Cashfree down, keys wrong or balance empty → 502 `provider_error` ("try again"), never a false "rejected". |
| Privacy | Verification ids don't contain the rider id; logs carry the check and outcome only. Both tables are RLS-locked from the app. |

## In the app

`/onboarding/kyc` (store and solo):

1. **Aadhaar / PAN** — START opens DigiLocker in the system browser; DigiLocker sends the rider back to
   the app, which asks the server for the result. The PAN sheet opens next ("We check it with the
   Income Tax records and match it to the name on your Aadhaar").
2. **Selfie** — "Liveness and face match verified", or the reason to retake.
3. **Driving licence** — number and photo; the date of birth is asked only while Aadhaar isn't verified.

Refusals show the reason on the card (e.g. "This PAN is registered to SURESH PATIL. Add your own
PAN."). The vehicle step shows the RC refusal as an error and stays on the screen.

### Local demo (`DATA_MODE=local_demo`)

DigiLocker verifies at once (no browser). Test values:

| Try | Result |
|---|---|
| PAN `AAAAA0000A` | Not valid |
| PAN starting `ZZZZZ` (e.g. `ZZZZZ1234Z`) | Registered to SURESH PATIL → refused |
| Licence or vehicle number ending `0000` | Not found → refused |
| Selfie before Aadhaar | Pending, then verified once Aadhaar is done |

## Server contract

### App ↔ One Local server

| Endpoint | Response |
|---|---|
| `POST /rider/kyc/digilocker/start` | `{ redirect_url, verification_id }` |
| `POST /rider/kyc/documents` `{ kind, source, verification_id? , number?, asset_id?, dob? }` | `{ id, kind, status: "verified" \| "pending" \| "rejected", number_masked?, rejection_reason?, expires_on?, source, reviewed_at? }` |
| `PUT /rider/vehicle` | vehicle · 422 `validation` with the RC refusal as `detail` |

`kind` → check: `aadhaar` + `source: "digilocker"` → `/digilocker/complete`; `pan` + `number` → `/pan`;
`selfie` + `asset_id` → `/selfie` (send a short-lived signed URL of the private upload as `imageUrl`,
or the bytes as `imageBase64`); `dl` + `number` (+ `dob`) → `/driving-licence`; the vehicle's
registration → `/vehicle-rc`.

### One Local server ↔ `kyc` function

All calls carry `x-kyc-secret: <KYC_API_SECRET>`; bodies are JSON.

| Call | Body | Returns |
|---|---|---|
| `POST /kyc/digilocker/start` | `{ riderId }` | `{ verificationId, url }` |
| `POST /kyc/digilocker/complete` | `{ riderId, riderName, verificationId? }` | result |
| `POST /kyc/pan` | `{ riderId, riderName?, pan }` | result |
| `POST /kyc/selfie` | `{ riderId, imageBase64 \| imageUrl }` | result |
| `POST /kyc/driving-licence` | `{ riderId, riderName?, dlNumber, dob? }` | result |
| `POST /kyc/vehicle-rc` | `{ riderId, riderName?, vehicleNumber }` | result |
| `GET /kyc/riders/<riderId>` | — | masked summary + `complete` |

`result = { kind, status, numberMasked, reason, expiresOn, verifiedAt, details }` — store `status`,
`numberMasked`, `expiresOn` and `reason` (as `rejection_reason`) on `rider_documents`. Errors:
400 `validation`, 404 `not_found`, 429 `rate_limited`, 502 `provider_error`.
