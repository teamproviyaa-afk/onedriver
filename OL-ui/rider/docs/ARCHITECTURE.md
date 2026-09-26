# Architecture

## Layers

| Layer | Location | Notes |
|---|---|---|
| Routes / screens | `src/app/**` (expo-router) | one file per Figma frame; nested `_layout.tsx` stacks; `(tabs)` group with custom `BottomTabBar` |
| Feature components | `src/features/<area>/` | screen-local widgets (onboarding cards, job drawers, status variants, earnings chart) |
| Shared components | `src/components/ui`, `src/components/app` | design-system primitives and app widgets (OTPInput, SignaturePad, QRCodeScanner, PhotoCapture, RiderMap, ConnectivityBanner, ActiveJobBar…) |
| Hooks | `src/hooks` | TanStack Query queries, `useJobActions`, `useAvailability`, `useOfferActions`, `useAuthActions`, `useQueueBridge` |
| Stores | `src/stores` | Zustand: auth, rider, onboarding (persisted draft), delivery (selective subscriptions), connectivity (persisted state), offline queue (persisted), earnings cache, dev |
| Offline | `src/offline` | `queueEngine.ts` (runOrQueue / processQueue), `connectivityMonitor.ts` (NetInfo) |
| Providers | `src/providers` | `types.ts` contract, `localDemoProvider.ts`, `oneLocalApiProvider.ts`, registry `index.ts` |
| Auth | `src/auth` | `DemoAuthProvider` (deterministic OTP, SecureStore session) · `SupabaseAuthProvider` (phone OTP) |
| Domain | `src/domain` | pure rules with tests: geofence, dispatch, earnings, cash, privacy, navigation, tracking, otp, geo |
| State machine | `src/state-machine/deliveryStateMachine.ts` | 12 states, forward-only transitions, expected version, exception map, `routeForJob` |
| Location | `src/location` | `locationService` (expo-location + TaskManager foreground service), `demoRouteSimulator`, `trackBatcher`, `useLocationEngine` |
| Notifications | `src/notifications/notificationService.ts` | channels, permission, Expo push token → `PUT /rider/push-token`, local offer alerts, deep links |
| Theme | `src/theme` | colors / typography / spacing / radius / shadows / dimensions extracted from Figma |
| Types | `src/types` | domain models (DTO → domain mapping in `src/api/mappers.ts`) |

## Delivery state machine

`available → offered → accepted → to_pickup → at_pickup → pickup_verified → picked_up → to_drop → at_drop → handover → proof → delivered`
Terminal: `delivered | failed | returned | cancelled`. `transition(job, to, { expectedVersion })` is the only way to change
state; screens call `useJobActions().step/verifyPickup/submitProof/raiseException` and navigate with `routeForJob(job)`.
Exceptions per state: to_pickup→vehicle · at_pickup→not_ready · pickup_verified→mismatch/incomplete · picked_up→safety ·
to_drop→vehicle/safety · at_drop→unavailable/address · handover→refused · proof→proof_failed (SOS from any active state).

## Offline-first queue

Every state-changing call is a `QueueItem { id, entityType, entityId, action, payload, idempotencyKey, recordedAt, createdAt, retryCount, status }`.
`runOrQueue` executes immediately when online (and nothing is queued ahead), otherwise queues and applies an optimistic
local transition (`pendingSync`). `processQueue` replays in order on reconnect: transient errors → retry with backoff
(`SYNC ERROR • RETRYING`), `version_conflict` → item dropped and the server job refetched (server wins), business errors →
surfaced and dropped. The connectivity banner derives its four states from NetInfo + queue state.

## GPS

`trackingModeFor(online, onJob, speed)` → `off | heartbeat (30 s) | job_moving (5 s / 25 m) | job_stationary (30 s)`.
Track points are batched every 10 s (≤ 60) through the queue. Android uses a foreground service during a job
(`expo-location` + `expo-task-manager`; falls back to `watchPositionAsync` in Expo Go). In `local_demo` a route simulator
moves the rider toward the pickup / drop so geofences can be exercised anywhere (switchable to device GPS in DEV).

## Resume after kill

`resolveEntryRoute()` restores the auth session → `GET /rider/me` → status routing → `GET /rider/jobs/current` (server
copy replaces stale local copy) → `routeForJob()`; else `GET /rider/offers/current` → `/offer/[id]`; else `/home`.
`useAppServices` repeats the job check whenever the app returns to the foreground.
