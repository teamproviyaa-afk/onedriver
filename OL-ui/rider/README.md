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

## Security & privacy

* Only the Supabase **publishable** key ships in the app. No service-role, admin, payout or server secrets.
* Privileged operations (pricing, dispatch, geofence verdicts, state) are decided by the One Local server.
* Customer drop address is shown only after `pickup_verified`; the phone only during the active job; nothing customer-related is written to logs, push payloads or persisted caches (`stripPii`).
* Proof photos / signatures are stored in the app's private document directory until upload succeeds.
