# QA — automated + manual test plan (spec §10)

## Automated (Jest, `npm test`)

| Area | Test file | Cases |
|---|---|---|
| Sign-in | `demoAuthProvider.test.ts` | new vs returning phone, wrong OTP (attempts left), invalid phone, resend window 30 s, session restore / sign-out |
| Onboarding | `localDemoProvider.test.ts` | zone detected vs out-of-zone, hub pin outside zone refused, invalid invite code, taxi → coming soon, KYC re-upload, document expiry blocks going online, status progression submitted → verification_pending → approved |
| Availability | `localDemoProvider.test.ts` | cash above limit, out of zone, suspended |
| Dispatch | `dispatch.test.ts`, `localDemoProvider.test.ts` | linked rider preferred, solo ETA ranking + fairness tie-break, eligibility filters, radius +2 km/round ≤ 8 km, manual timeout → next rider, auto-accept, two riders one offer → one winner, 3 rounds → escalation |
| Geofence | `geofence.test.ts` | 120 m pickup ✓, 600 m pickup → reason, poor accuracy → reason, 100 m drop auto-prompt, > 500 m arrival → reason (flagged), 350 m proof → flagged |
| Job engine | `deliveryStateMachine.test.ts`, `localDemoProvider.test.ts` | 12 states in order, no skipped state, no repeated state, version conflict, terminal states, exception map, screen routing, too_far with reason + flag |
| Pickup verification | `localDemoProvider.test.ts` | mismatch → incomplete → verified, bypass with reason |
| Proof | `localDemoProvider.test.ts` | correct OTP delivers, 5 wrong OTPs → locked → photo fallback, signature/photo for parcels, cash collected → ledger, far proof flagged |
| Exceptions | `localDemoProvider.test.ts` | vehicle → reassigned, refused → returned, unavailable wait → escalate → returned, address dispute corrects the pin + confidence |
| Money | `earnings.test.ts` | base + distance + peak + wait + tip, tip 100 %, surge, rule version stored, ledger insert-only balance, cash limit |
| Privacy | `privacy.test.ts`, `localDemoProvider.test.ts` | address hidden before pickup_verified, phone unavailable after delivery, other rider's job → 404, PII stripped from caches |
| Offline | `queueEngine.test.ts` | queue while offline, ordered replay, version conflict dropped (server wins), transient retry + SYNC ERROR state, idempotency keys, recordedAt preserved |
| Navigation / tracking | `navigation.test.ts` | coordinate-only URLs with platform fallbacks, cadence rules, INR formatting |
| Cash deposits | `cashDeposits.test.ts` | never more than the cash in hand, min / max, API mapping, demo: pay → ledger credited + notification, same key never charges twice, cancelled / expired takes nothing, cash-limit rider unblocked |
| Payouts | `payouts.test.ts` | amount parsing, withdrawal checks in server order, quick amounts, masking, name match (initials / titles / partial / someone else), next Monday 10:00, API mapping, demo wallet balance since last weekly payout, processing → credited with UTR + payout_sent WhatsApp, same idempotency key never pays twice, min / balance / 3-a-day limits, failed transfer returns the money, cash limit and suspension block withdrawals, UPI / bank verification refusals |

Static checks: `npm run typecheck` (tsc strict), `npm run lint` (eslint-config-expo incl. React Compiler rules), `npx expo export --platform android` (Metro bundle).

## Manual demo script (Expo Go, DATA_MODE=local_demo)

1. Splash → Intro (3 cards, Skip/Next/Get Started) → Find Orders Nearby (Allow / Not now).
2. Welcome back → phone `9876543210` → OTP `123456` → Home (offline) as Rahul Sharma.  
   New rider: any other number → Register → OTP → Profile → Zone → Hub → Confirm → Alerts permission → Rider type → (Store: Link store `MEGA-2024` → KYC → Vehicle → Categories → Stores → Acceptance → Priority → Submit) / (Solo: KYC → Vehicle → Categories → Acceptance → Bank or UPI → Submit) → Approval pending → auto-approves after ~20 s → You're approved → Home.
3. GO ONLINE → "YOU'RE ONLINE" → offer #9830 arrives in ~4 s with a 30 s countdown → Accept.
4. Current job → START NAVIGATION (opens Google/Apple Maps on coordinates) → demo GPS drives to the store → ARRIVED AT STORE → At pickup checklist → VERIFY PICKUP → Scan QR / Enter code `OL-9830` / Bypass → Pickup confirmed → PROCEED TO DELIVERY → Navigation handoff → START NAVIGATION → active delivery (customer card, call) → ARRIVED AT DESTINATION (auto-prompt inside 100 m) → You have arrived → Start delivery verification → Secure OTP `4821` → Delivered → Back to home.
5. Earnings tab (today), View weekly, tap a job → breakdown; Tasks tab (today/yesterday) → task detail timeline; Alerts; Profile.
6. DEV chip → scenarios: Auto Accept, Order Not Ready, Mismatch, Incomplete, Vehicle Breakdown, Customer Unavailable, Wrong Address, Customer Refused, OTP Failed, Photo Proof, Signature Proof, Offline Job (toggle "Simulate network loss" mid-job, take steps, toggle back → SYNCING → synced), Version Conflict, Cash Limit (/cash → record deposit), Suspended Rider, Out-of-zone.
7. Kill the app mid-job → relaunch → resumes on the correct job screen.

## Headless web run (npx expo start --web + Playwright/Chromium, 390×844)

Driven end to end in a fresh browser profile with `DATA_MODE=local_demo`; every step captured and reviewed against the Figma frames.

| Journey | Steps | Result |
|---|---|---|
| Returning rider, OTP proof | intro → skip permissions → sign in `9876543210` → OTP `123456` → home → GO ONLINE → offer #9830 → accept → current job → START NAVIGATION (new tab) → demo GPS to store → ARRIVED AT STORE → checklist → VERIFY PICKUP → code `OL-9830` → Pickup confirmed → PROCEED TO DELIVERY → START NAVIGATION → ON THE WAY → 100 m geofence auto-prompt "You have arrived?" → Yes → START DELIVERY VERIFICATION → Secure OTP → `4821` → VERIFY & COMPLETE → Delivered ₹135.30 → BACK TO HOME (₹915.30, 5 jobs) → Tasks → task #9830 detail → Earnings → Week → Alerts → Profile → Cash → Dev scenarios | 27/27 steps, 0 console errors |
| Photo proof | same journey up to the method sheet → Photo Proof (preselected for the contactless drop) → CONFIRM METHOD → CAPTURE (reference image on web) → SUBMIT PHOTO → Delivered → home | see `scratchpad` run log |

Defects found and fixed by this run: Tasks tab crashed with "Invalid hook call" (`renderSectionFooter` was given a compiled component instead of a render function); photo proof on web threw `Image.resolveAssetSource is not a function` (now `expo-asset`); today's demo history used fixed clock times that sorted into the future early in the day (now relative to now); expo-haptics vibrate warning on web (haptics skipped on web).

## Messaging (WhatsApp → SMS, email)

Automated: `supabase/tests` (43 node:test tests — every fallback path, provider request formats,
Meta/Twilio/Standard-Webhooks signatures incl. the reference vector, routes, store queries, privacy)
and `src/__tests__/messaging.test.ts` (routing rules, demo sign-in code, delivery OTP at pickup,
resend cooldown → SMS, customer without WhatsApp, email statement, SOS contact alert, dev outbox).

Headless web run (`DATA_MODE=local_demo`), 15/15 steps, 0 console errors:
sign in `9876543210` → "Code sent on WhatsApp" → *Resend by SMS* → "Code sent by SMS" → home →
Dev scenario *Customer Not on WhatsApp* → offer #9830 → pickup → drop → Secure OTP screen reads
"shared with Amit by SMS (not on WhatsApp)" → *Resend by SMS* (stays on the screen, 30 s cooldown) →
OTP `4821` → delivered → Profile: add email → Weekly statement: *Email me this statement* →
"Statement sent to r***@example.com" → Dev → Messages sent lists every message with its channel.

Defects found and fixed by these runs: a job update that did not change the state (the resent code)
made a hidden earlier screen in the stack redirect the rider to the method picker — job-screen
redirects now run only on the focused screen and only when the state changes; the dev outbox read
the demo world before it had loaded and lost the sign-in code when the phone was attached.
Note: in this sandbox Metro does not pick up file edits — restart it with `--clear` after changes.

## Payouts (Cashfree)

Automated: `supabase/tests/payouts.*.test.ts` (20 node:test tests — Cashfree request formats and
signatures, webhook signature, idempotent transfer ids, unknown → reconciled, never re-sent, name match,
status callback, contact data deleted, routes end-to-end against a fake Cashfree API) and
`src/__tests__/payouts.test.ts` (17 tests, above).

Headless web run (`DATA_MODE=local_demo`), 15/15 steps, 0 console errors:
sign in `9876543210` → Earnings → *WITHDRAW EARNINGS* → ₹1,420.00 available, weekly payout history,
"Name verified with the bank" → ₹50 → "The minimum withdrawal is ₹100" (button disabled) → ₹500 chip →
fee Free, you receive ₹500.00 → confirm sheet "will be sent to UPI ra••••••@ybl" → *CONFIRM* →
"Withdrawal in progress", "₹500.00 on its way" → "Money sent", UTR, ₹920.00 left → Dev scenario
*Withdrawal Fails* → ₹300 → "Withdrawal did not go through … back in your balance", still ₹920.00 →
*Change* → `mismatch@ybl` → "This account is registered to SURESH PATIL" → `rahul.s@oksbi` → verified →
*Done* → Withdraw shows "UPI · Google Pay · SBI" → Profile shows the new UPI ID → Alerts: "Withdrawal
credited" and "Withdrawal failed" → Dev scenario *Cash Limit* → "Deposit your cash in hand (₹2,720) first"
→ Dev → Messages sent lists the payout_sent WhatsApp with the UTR.

## Cash deposits by UPI (Cashfree Payment Gateway)

Automated: `supabase/tests/payments.test.ts` (17 node:test tests — Cashfree PG request format and
headers, deterministic link id, same key one link, lost response recovered without a second link,
rejected link, validation, webhook signature, forged "paid" ignored until Cashfree says so, short
payment never credited, expired then late payment, sweep, safe return redirect, key-based environment,
router end to end, Supabase store queries) and `src/__tests__/cashDeposits.test.ts` (6 tests, above).
`setup-payments.sh` checked with stubbed `supabase` / `curl`.

Headless web run (`DATA_MODE=local_demo`), 9/9 steps, 0 console errors: sign in → Cash in hand ₹320 →
PAY BY UPI → ₹99,999 → "you can't deposit more than that" (button disabled) → All → *PAY ₹320.00 BY
UPI* → demo checkout → *Cancel payment* → "Payment not completed · No money was taken" → pay again →
"Deposit received ₹320.00 · UPI · Ref …", ledger "UPI via Cashfree", cash in hand ₹0 → Dev scenario
*Cash Limit* → BLOCKED → pay by UPI → OK → GO ONLINE works → Alerts "Cash deposit received".
