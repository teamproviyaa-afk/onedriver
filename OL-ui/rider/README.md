# OneLocal Rider (OnLatur Rider) — V1

React Native + Expo (SDK 57) rider application for OnLatur / OneLocal delivery operations.
Second Expo app in the platform monorepo (`OL-ui/rider/`), calling the One Local server under `/api/rider/*`.

**Sources of truth:** Figma `rider app` file (visual) · `RIDER_APP_E2E_V1.pdf` (functional).
**Data mode:** `DATA_MODE=local_demo` — the whole journey works without any backend, SMS, maps key, DigiLocker or payout provider.

## Run

```bash
cd OL-ui/rider
npm install
npx expo start            # scan the QR with Expo Go (Android / iOS) or press a / i
npx expo start --android
npx expo start --ios
npm run typecheck         # tsc --noEmit
npm test                  # jest (state machine, dispatch, geofence, earnings, privacy, queue, demo provider)
npm run lint              # expo lint
npx expo export --platform android   # native Hermes bundle for the Android app (not viewable in a browser)
```

### Build for Android and iOS (EAS)

Run from `OL-ui/rider` after `npx eas-cli@latest login`. On the first build EAS asks to create a project (answer **Yes**; it saves `extra.eas.projectId` into `app.json`) and to create signing credentials (answer **Yes**). Demo builds (`preview*`) run fully offline on the built-in demo data and keep the DEV · SCENARIOS switcher; `production` never shows it.

| Goal | Command | Needs |
|---|---|---|
| Android APK to sideload | `npx eas-cli@latest build -p android --profile preview` | free Expo account |
| iOS app in the Mac's iOS Simulator | `npx eas-cli@latest build -p ios --profile preview-simulator` | Xcode (Simulator) on the Mac |
| iOS app on a real iPhone | `npx eas-cli@latest device:create`, then `npx eas-cli@latest build -p ios --profile preview` | Apple Developer Program |
| Google Play (AAB) | `npx eas-cli@latest build -p android --profile production`, then `npx eas-cli@latest submit -p android` | Google Play Console + service account key |
| App Store / TestFlight | `npx eas-cli@latest build -p ios --profile production`, then `npx eas-cli@latest submit -p ios` | Apple Developer Program + App Store Connect app |

The `production` profile expects the One Local server (`PROVIYAA_API_BASE_URL`); publish demo builds only to internal testing.

**Maps.** iOS uses Apple Maps and needs no key. Android shows the built-in map drawing until a Google Maps key is provided: create an Android-restricted key for `com.onelocal.rider` (Maps SDK for Android) and store it in EAS, never in git:

```bash
npx eas-cli@latest env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment preview --environment production --visibility sensitive
```

**Local Android build** (Android Studio with SDK 36 + NDK 27.1, JDK 17, `ANDROID_HOME` set):

```bash
npx expo prebuild --platform android --clean     # generates android/ from app.config.ts (not committed)
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk (signed with the debug key, for sideloading)
```

**Local iOS build** (Xcode on a Mac): `npx expo run:ios --configuration Release` builds and launches it in the Simulator or on a connected iPhone.

### Preview a static build in a browser

`npx expo export --platform android` writes the **native** JS bundle (`dist/_expo/…/entry-….hbc`) that the Android app loads — serving that folder with a web server only lists `_expo/`, `assets/` and `metadata.json`. For a browser preview export the **web** target, then serve it with a single-page fallback:

```bash
npm run export:web        # expo export --platform web  → dist/index.html + dist/_expo/static/…
npm run serve:web         # npx serve dist --single --listen 3000  → http://localhost:3000
```

`npx expo start --web` gives the same app with live reload; a phone with Expo Go (`npx expo start`, scan the QR) runs it natively.

Builds (EAS): `npx eas-cli@latest build --platform android --profile preview` / `--platform ios --profile preview` (see `eas.json`).
The Android foreground-service location and push notifications need a development build (`npx expo run:android`); Expo Go covers every screen and flow with foreground GPS.

## Environment

`.env` (committed, demo only) keeps the canonical variables and mirrors them to `EXPO_PUBLIC_*` (dotenv-expand) because Expo only inlines `EXPO_PUBLIC_*` into the bundle:

| Canonical | Value | Purpose |
|---|---|---|
| `APP_ENV` | `local` | build flavour |
| `DATA_MODE` | `local_demo` | `local_demo` → LocalDemoProvider, otherwise OneLocalApiProvider |
| `SUPABASE_URL` | `https://ywylhzcxuoeilygzdonx.supabase.co` | Supabase phone auth (publishable key only) |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | client-safe key — never a service-role key |
| `PROVIYAA_API_BASE_URL` | *(empty)* | One Local server base; empty keeps the demo provider active |
| `SYNC_ENABLED` | `false` | offline queue still records/replays locally |
| `GOOGLE_MAPS_ANDROID_API_KEY` | *(optional)* | react-native-maps on native Android builds; absent → development map drawing |

`src/config/env.ts` is the only module that reads `process.env`.

## Demo credentials

| What | Value |
|---|---|
| Returning rider (approved Store Rider) | phone **9876543210** · OTP **123456** |
| New rider registration | any other 10-digit number · OTP **123456** |
| Store invite codes | `MEGA-2024`, `STORE-A`, `ONELOCAL` |
| Pickup verification codes | `OL-9830`, `OL-9824`, `OL-9825` (shown as a demo hint on the verify screen) |
| Delivery OTPs | `4821` (#9830), `7364` (#9824), `1905` (#9825) (shown as a demo hint) |
| Demo rider | Rahul Sharma · RIDER-1001 · Store Rider · TVS iQube MH 24 AB 1234 · VIP · Latur Central · Store A |
| Demo money | today ₹780 · week ₹3,420 · peak incentive ₹50 · offer #9830 ₹142.50 (illustrative only) |

Development scenarios: tap the floating **DEV · SCENARIOS** chip (dev builds only) → `/dev/scenarios`.

## Architecture

```
UI (src/app routes, src/features)
 └─ hooks (src/hooks: TanStack Query + action hooks)
     └─ stores (src/stores: Zustand — auth, rider, onboarding, delivery, connectivity, offline queue, earnings, dev)
         └─ offline queue (src/offline: idempotent, ordered replay, conflict handling)
             └─ data provider (src/providers/types.ts)
                 ├─ LocalDemoProvider   (src/providers/localDemoProvider.ts — deterministic offline server)
                 ├─ OneLocalApiProvider (src/providers/oneLocalApiProvider.ts — /api/rider/*, /api/geo/*)
                 └─ auth: DemoAuthProvider | SupabaseAuthProvider (src/auth)
```

Cross-cutting: `src/state-machine/deliveryStateMachine.ts` (12-state engine, versions, exception map, screen routing),
`src/domain/*` (geofence, dispatch, earnings, cash, privacy, navigation, tracking, otp), `src/location` (GPS cadence,
Android foreground service, demo route simulator, track batching), `src/notifications`, `src/navigation/resume.ts`
(resume after app kill — server state wins), `src/theme` (Figma tokens), `src/components/ui` + `src/components/app`.

See `docs/ARCHITECTURE.md`, `docs/API_MAP.md`, `docs/DECISIONS.md`, `docs/QA.md`.

## Messaging (WhatsApp → SMS, email)

Sign-in codes, the customer's delivery OTP, receipts, approvals, payouts, statements and SOS alerts are
sent by the server-side `notify` Edge Function in [`supabase/`](../../supabase): WhatsApp first, SMS when
the number is not on WhatsApp (or WhatsApp fails, times out, or the code is requested again), email
alongside. The app only shows the channel used. Setup and provider accounts: [docs/MESSAGING.md](docs/MESSAGING.md).

Real sign-in codes on your phone: deploy with `bash supabase/setup-messaging.sh`, then `npm run start:live`
(or the `preview-live` EAS profile). `DATA_MODE=supabase` uses real Supabase phone auth with demo data.

## Payouts (Cashfree)

Earnings → **WITHDRAW EARNINGS** sends the rider's unpaid balance to their verified UPI ID or bank account
through Cashfree Payouts; the rest is paid every Monday. UPI IDs and bank accounts are verified with
Cashfree (must be in the rider's name). The app holds no payout keys — the server-side `payouts` Edge
Function in [`supabase/`](../../supabase) talks to Cashfree. Setup: [docs/PAYOUTS.md](docs/PAYOUTS.md).
In the local demo it is fully simulated (dev scenario **Withdrawal Fails**, test UPI IDs `invalid@ybl`, `mismatch@ybl`).

## Security & privacy

* Only the Supabase **publishable** key ships in the app. No service-role, admin, payout or server secrets.
* Privileged operations (pricing, dispatch, geofence verdicts, state) are decided by the One Local server.
* Customer drop address is shown only after `pickup_verified`; the phone only during the active job; nothing customer-related is written to logs, push payloads or persisted caches (`stripPii`).
* Proof photos / signatures are stored in the app's private document directory until upload succeeds.
