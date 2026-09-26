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
