# Route ↔ Figma frame inventory (55 frames, all V1 unless marked)

| Route (src/app) | Figma frame(s) | Notes |
|---|---|---|
| `/` (index) | Splash | lime gradient + wordmark; restores session / status / active job, then routes |
| `/intro` | screen-intro-1/2/3 | 3-card carousel, Skip / Next / Get Started |
| `/permissions/location` | screen-location | Find Orders Nearby — Allow / Not now |
| `/sign-in` | screen-login | phone +91, Continue, Register here |
| `/register` | screen-register | name, phone, referral, Terms, Send OTP |
| `/otp` | screen-otp | 6-digit boxes, SMS autofill, resend 30 s, wrong-OTP attempts |
| `/onboarding/profile` | screen-profile-setup | selfie sheet, Aadhaar name, emergency contact, language |
| `/onboarding/zone` | location-selection | detected zone + zone list (out-of-zone state) |
| `/onboarding/hub` | address-setup | start hub form + draggable pin |
| `/onboarding/hub/confirm` | location-confirmation | Yes, confirm hub / No, change pin (server validates in-zone) |
| `/permissions/notifications` | notification-permission | Instant Gig Alerts |
| `/onboarding/type` | rider-type-selection | Store · Solo · Taxi Partner (coming soon) |
| `/onboarding/store/link` | store-link | invite code → matched merchant card |
| `/onboarding/kyc` | store-kyc, solo-kyc | DigiLocker Aadhaar, PAN, selfie liveness + face match, DL — verified by Cashfree Secure ID, refusal reasons, re-upload |
| `/onboarding/vehicle` | store-vehicle, solo-vehicle | 2/3/4-wheeler, registration, RC, own/rent |
| `/onboarding/rental` | rental-marketplace | COMING SOON (V2), non-operational |
| `/onboarding/categories` | store-categories, solo-categories | Quick Drop · On-Order · Pick & Drop |
| `/onboarding/stores` | store-assignment | multi-store toggle + preferred hub |
| `/onboarding/acceptance` | acceptance-mode, solo-acceptance-mode | Auto-Accept / Manual 30 s |
| `/onboarding/priority` | priority-explainer | linked store first, Solo fallback → submit |
| `/onboarding/payout/bank` | payout-bank | account holder / number / IFSC → submit |
| `/onboarding/payout/upi` | payout-upi | UPI ID verify → submit |
| `/status` | application-submitted, verification-pending, approval-pending-store/solo, approved, rejected, documents-expired, account-suspended | polled account status hub |
| `/home` (tabs) | home-offline, home-online | GO ONLINE / OFFLINE, cash-limit / out-of-zone / suspended blocks, resume job |
| `/tasks` (tabs) | job-history | Today / Yesterday / Earlier |
| `/earnings` (tabs) | earnings-today | split, WITHDRAW EARNINGS → `/earnings/withdraw` |
| `/earnings/withdraw` | — (no frame) | balance, amount, destination, confirm, live transfer status, recent payouts (Cashfree) |
| `/alerts` (tabs) | notifications | unread / read, deep links |
| `/profile` (tabs) | profile | identity, type, vehicle, KYC, payout, zone/hub, SOS, support, sign out |
| `/offer/[id]` | job-offer-manual, job-auto-accepted | 30 s countdown, accept / decline, expired / taken |
| `/job/[id]` | current-job, active-delivery | map, stepper, Start navigation, Arrived (geofence + reason) |
| `/job/[id]/pickup` | at-pickup | order id, items checklist, Verify pickup, Order not ready |
| `/job/[id]/pickup/verify` | pickup-verification | Scan QR / Enter code / Bypass |
| `/job/[id]/pickup/done` | pickup-confirmed | Proceed to delivery |
| `/job/[id]/pickup/waiting` | order-not-ready | wait timer, compensation threshold, report delay |
| `/job/[id]/pickup/mismatch` | package-mismatch | expected vs scanned, report wrong barcode |
| `/job/[id]/pickup/incomplete` | package-incomplete | missing items, report incomplete |
| `/job/[id]/navigate` | navigation-handoff | full drop address (post-verification), Start navigation |
| `/job/[id]/arrived` | arrival | You have arrived, call customer, start verification |
| `/job/[id]/proof` | delivery-confirmation | OTP / Photo / Signature selector |
| `/job/[id]/proof/otp` | proof-otp | 4-digit keypad, attempts, lock → photo |
| `/job/[id]/proof/photo` | proof-photo | capture, retake, submit (private storage) |
| `/job/[id]/proof/signature` | proof-signature | signature canvas, clear, submit |
| `/job/[id]/done` | delivery-success | earnings, bonus, order, customer, time |
| `/job/[id]/issue` | delivery-failed | unavailable · wrong address · refused · cannot access · safety · other |
| `/job/[id]/issue/unavailable` | customer-unavailable | mandatory wait, call ×2, escalate |
| `/job/[id]/issue/address` | wrong-address | stated vs GPS, share location, dispute |
| `/job/[id]/sos` · `/sos` | safety-exception | SOS, accident report, helpline |
| `/earnings/week` | earnings-weekly | chart, insights, statement PDF |
| `/earnings/job/[id]` | earnings-breakdown | base + distance + peak + wait + tip, rule version |
| `/tasks/[id]` | delivery-detail | timeline, verification, earnings |
| `/cash` | — | cash in hand, limit, ledger, PAY BY UPI (Cashfree checkout), counter deposit (spec §4.3) |
| `/support` | — | helpline, ticket (coming soon), FAQ |
| `/dev/scenarios` | — | development-only scenario switcher |
| `+not-found` | — | branded fallback |
| — | connectivity-states | global `ConnectivityBanner` / `ConnectivityBadge` |
| — | rider-ui-kit | `src/components/ui` + `src/theme` |
| — | rider-state-machine | `src/state-machine/deliveryStateMachine.ts` |
| — | combined-delivery-v2 | V2 — not built (hidden in V1) |
| — | Taxi Partner frames | V2 — coming soon |
