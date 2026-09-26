# Implementation decisions and documented conflicts

| # | Topic | Decision |
|---|---|---|
| 1 | Repository state | Both `onedriver` and `onelatur2.0` were empty; there was no existing OL-ui, API client, Supabase setup or env system to reuse. The app was scaffolded with `create-expo-app` (SDK 57 default template, `src/app` router root) and everything else built new. |
| 2 | Figma assets | The sandbox blocks figma.com downloads. Raster illustrations were captured at native resolution through the Figma MCP screenshot channel (`assets/figma/*.png`). Icons are Lucide glyphs in the design → `lucide-react-native` (vector). iOS status-bar glyphs are never rendered by the app. |
| 3 | Tab bar | Figma home frames show HOME / JOBS / EARNINGS / PROFILE while every other frame shows TASKS / EARNINGS / ALERTS / PROFILE; the PDF says "Tasks · Earnings · Alerts · Profile, plus Home". Implemented one 5-tab bar (HOME, TASKS, EARNINGS, ALERTS, PROFILE) in the majority visual style (lime active pill). |
| 4 | `picked_up` step | The PDF step body omits `picked_up` although the state exists. Added it to `StepTarget` so "Proceed to delivery" is an explicit transition. |
| 5 | Earnings breakdown card | Figma delivery-detail uses near-black text on a black card; rendered with white/lime text for legibility. |
| 6 | Cash screen | No Figma frame exists for cash-in-hand / deposit; built in the same visual language (spec requires it). |
| 7 | Support screen | Referenced by help buttons but not designed; built minimally. |
| 8 | Customer-unavailable wait | Spec: "mandatory wait timer"; value not fixed → 5:00 (server-configurable via `waitSeconds`). |
| 9 | Order-not-ready threshold | 10 minutes free, then wait compensation at the rule's per-minute rate (configuration-driven, demo ₹2/min). |
| 10 | Demo GPS | In `local_demo` a route simulator drives the rider to pickup/drop so testers can complete the journey anywhere; device GPS can be enabled from the DEV panel. |
| 11 | Expo Go limits | Android foreground-service location and remote push need a development build; the app degrades to foreground GPS + local notifications in Expo Go. |
| 12 | V2 / coming soon | Taxi Partner, rental marketplace, combined delivery, withdraw earnings, chat, masked numbers → "Coming soon" sheets, never operational. |
| 13 | Supabase | Auth architecture is wired (`SupabaseAuthProvider`, publishable key only). It activates when `DATA_MODE≠local_demo` and `PROVIYAA_API_BASE_URL` is set; MSG91/DLT are server-side. |
| 14 | Connectivity banner | The four Figma states are implemented in `ConnectivityBanner`/`ConnectivityBadge`. Only the non-nominal states (OFFLINE MODE ACTIVATED, SYNCING QUEUED TASKS, SYNC ERROR • RETRYING) overlay screens; the nominal ONLINE • HEARTBEAT ON state is shown by the Home online banner and the developer panel so it never covers screen content. |
| 15 | Home radar | The captured radar PNG had no transparency, so the pulse is drawn with Views (100 px translucent lime ring → 64 px #E8F8D5 ring → 24 px lime dot). |
| 16 | Multiply-blend overlays | The Figma intro-3 and location-permission frames composite a character with `mix-blend-mode: multiply`; the base illustrations already contain the character and React Native Web cannot blend, so the overlays are not rendered. |
| 17 | Web navigation handoff | On web, "Start navigation" opens Google Maps directions in a new tab; on Android/iOS it hands off to the navigation app on coordinates exactly as specified. |
| 18 | Offer screen param | `/offer/[id]` takes the job id (what push notifications and dispatch events carry); the screen also accepts an offer id. |
