# API ↔ screen map (One Local server, spec §5)

Headers on every call: `authorization: Bearer <supabase access token>`, `x-app: onlatur-rider`, `x-app-version`, `x-runtime`, `x-platform`, `idempotency-key` on state-changing POSTs. Errors `{ detail, code }` → `ApiError`.

| Endpoint | Provider method | Screens |
|---|---|---|
| `POST /rider/register` | `register` | /register → /otp |
| `PUT /rider/profile` | `updateProfile` | /onboarding/profile |
| `GET /geo/zones?lat&lng` | `lookupZone` | /onboarding/zone, GO ONLINE (out_of_zone) |
| `GET /geo/cities/:city/zones` | `listZones` | /onboarding/zone |
| `PUT /rider/hub` | `setHub` | /onboarding/hub/confirm |
| `PUT /rider/type` | `setType` | /onboarding/type (taxi → 409 coming_soon) |
| `POST /rider/store-link` | `linkStore` | /onboarding/store/link |
| `POST /rider/kyc/digilocker/start` | `startDigilocker` | /onboarding/kyc |
| `POST /rider/kyc/documents` | `submitDocument` | /onboarding/kyc, /onboarding/vehicle (RC) |
| `PUT /rider/vehicle` | `setVehicle` | /onboarding/vehicle |
| `PUT /rider/preferences` | `setPreferences` | /onboarding/categories → stores → acceptance |
| `PUT /rider/payout` → `{ verified_name, name_match, … }` | `setPayout` | /onboarding/payout/bank, /onboarding/payout/upi (also `?mode=manage` from Profile / Withdraw; 422 `account_invalid` / `name_mismatch`) |
| `POST /rider/submit` | `submitApplication` | /onboarding/priority (store) · /onboarding/payout/* (solo) |
| `GET /rider/status` | `getStatus` | /status (polled) |
| `POST /rider/uploads` | `createUpload` | KYC, RC, proof photo, signature |
| `GET /rider/me` | `getMe` | home, profile, status, resume |
| `POST /rider/availability` | `setAvailability` | home GO ONLINE / OFFLINE (cash_limit, out_of_zone, suspended) |
| `POST /rider/heartbeat` | `heartbeat` | location engine (online, no job, 30 s) |
| `PUT /rider/push-token` | `setPushToken` | app services after approval |
| `GET /rider/offers/current` | `getCurrentOffer` | home (poll), /offer/[id] |
| `POST /rider/offers/:id/accept` | `acceptOffer` | /offer/[id] (offer_expired, already_taken) |
| `POST /rider/offers/:id/decline` | `declineOffer` | /offer/[id] |
| `GET /rider/jobs/current` | `getCurrentJob` | resume, job screens |
| `GET /rider/jobs/:id` | `getJob` / `getJobDetail` | job screens, /tasks/[id] |
| `POST /rider/jobs/:id/step` | `step` | current job (to_pickup, at_pickup), pickup done (picked_up), navigate (to_drop), active delivery (at_drop), arrived (handover) |
| `POST /rider/jobs/:id/pickup/verify` | `verifyPickup` | /job/[id]/pickup/verify |
| `POST /rider/jobs/:id/track` | `track` | track batcher |
| `POST /rider/jobs/:id/proof` | `submitProof` | proof/otp, proof/photo, proof/signature |
| `POST /rider/jobs/:id/exception` | `raiseException` | pickup/waiting, mismatch, incomplete, issue/*, sos |
| `POST /rider/sos` → `{ contact_alert }` | `sos` | /job/[id]/sos, /sos (emergency contact alerted on WhatsApp + SMS) |
| `POST /rider/jobs/:id/otp/resend` | `resendDeliveryOtp` | proof/otp "Customer didn't get it?" (WhatsApp → SMS, 30 s cooldown, 429 `rate_limited`) |
| `POST /rider/jobs/:id/call` | `getCallNumber` | active delivery, arrived, issue screens |
| `GET /rider/earnings?range=` | `getEarnings` | /earnings, /earnings/week |
| `GET /rider/earnings/jobs/:id` | `getJobEarnings` | /earnings/job/[id], /job/[id]/done |
| `GET /rider/jobs?cursor=` | `listJobs` | /tasks |
| `GET /rider/statements/:week.pdf` | `getStatementUrl` | /earnings/week |
| `POST /rider/statements/:week/email` | `emailStatement` | /earnings/week "Email me this statement" (400 `validation` without an email) |
| `GET /rider/cash` | `getCash` | /cash |
| `GET /rider/wallet` | `getWallet` | /earnings/withdraw, Profile (payout method) |
| `POST /rider/payouts/withdraw` `{ amount }` + `Idempotency-Key` | `requestWithdrawal` | /earnings/withdraw (422 `validation` / `insufficient_balance` / `payout_blocked`, 409 `no_payout_account`, 429 `rate_limited`) |
| `GET /rider/payouts` · `GET /rider/payouts/:id` | `listPayouts` / `getPayout` | /earnings/withdraw (status polled until final) |
| `GET /rider/notifications` · `POST /rider/notifications/read` | `listNotifications` / `markNotificationsRead` | /alerts |

Addition to the spec's step list: `to: "picked_up"` (spec §5.2 lists the state but omits it from the step body); the
demo provider and API provider both send it so `pickup_verified → picked_up` is an explicit rider action ("Proceed to delivery").

Messaging (WhatsApp → SMS fallback, email) is sent by the server through the `notify` Edge Function;
job responses may carry `otp_delivery` (how the customer received the delivery OTP, no number) and
`PUT /rider/profile` accepts an optional `email`. See [MESSAGING.md](MESSAGING.md).

Payouts (withdrawals, weekly payouts, UPI / bank verification) go through Cashfree on the server
(`payouts` Edge Function). The app sends an `Idempotency-Key` per withdrawal and reuses it on retry, so a
timeout never pays twice. See [PAYOUTS.md](PAYOUTS.md).
