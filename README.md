# Pocket Operator

A voice-driven Android assistant that finds a meal in a **fictional** catalogue, prepares a **sandbox pickup** order, asks for approval, saves the confirmed order and hands off to an installed Maps app.

- `mobile/`: Expo (React Native, TypeScript) Android app: push-to-talk + text, review card, history, activity trace, Maps intent with HTTPS fallback.
- `backend/`: Node.js 22 + Express + SQLite (built-in `node:sqlite`): catalogue, proposals, orders, run/tool traces, LLM agent loop.
- `docs/`: engineering note, test results and manual checklist, sample run trace.

All restaurants, menu items and orders are fictional. Nothing is purchased and no real service is contacted.

---

## 1. Prerequisites

| Tool                                                                                                                                    | Version used                                     | Needed for                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| Node.js                                                                                                                                 | 22.13+ (tested on 22.23) or 24 LTS               | backend and app tooling                                             |
| npm                                                                                                                                     | 10+                                              |                                                                     |
| An LLM API key                                                                                                                          | Gemini, OpenAI, Groq, or a local Ollama          | the agent (free Gemini key: https://aistudio.google.com/apikey)     |
| Android phone or emulator                                                                                                               | Android 10+ (tested on: **vivo T3, Android 16**) | running the APK                                                     |
| ngrok (optional)                                                                                                                        | free account                                     | a fixed HTTPS URL so the phone reaches your laptop from any network |
| To build the APK: **either** an Expo account (free) for EAS cloud build, **or** Android Studio (JDK 17 + Android SDK) for a local build |                                                  |                                                                     |

## 2. Backend: install, configure, run

```bash
cd backend
npm install
cp .env.example .env          # then edit .env and set LLM_API_KEY (never commit .env)
npm start                     # http://0.0.0.0:8787, seeds data/pocket.db from data/catalog.json on first start
```

Check it: `curl http://localhost:8787/api/health` should show `"llm_configured": true`.

**Environment variables** (`backend/.env.example`):

| Var                    | Example                                                   | Notes                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT` / `HOST`        | `8787` / `0.0.0.0`                                        | `0.0.0.0` so a phone on the same Wi-Fi can connect                                                                                                                                         |
| `DB_PATH`              | `./data/pocket.db`                                        | SQLite file; survives restarts                                                                                                                                                             |
| `DEV_ROUTES`           | `1`                                                       | `0` disables `/api/dev/*`. **Set `0` whenever the backend is exposed through a tunnel.** The `npm run item` / `npm run reset` CLI still works because it edits the database file directly. |
| `LLM_BASE_URL`         | `https://generativelanguage.googleapis.com/v1beta/openai` | any OpenAI-compatible endpoint with tool calling                                                                                                                                           |
| `LLM_MODEL`            | `gemini-3-flash-preview`                                  | used for the final run; `gemini-3.1-flash-lite` was used for most testing until its free-tier quota ran out. `gemini-3.8-flash` returned 503 (high demand) during testing                  |
| `LLM_API_KEY`          | _(secret)_                                                | stays on the backend; never sent to the app or logged                                                                                                                                      |
| `LLM_TIMEOUT_MS`       | `20000`                                                   | per model call                                                                                                                                                                             |
| `LLM_REASONING_EFFORT` | `low`                                                     | optional; omit for providers that don't support it                                                                                                                                         |

### Seed, reset and change catalogue data (evaluation helpers)

The catalogue is seeded from `backend/data/catalog.json` the first time the server starts. Later restarts keep all data.

```bash
npm run catalog                         # list items
npm run item -- m4 --available false    # make Veg Lunch Box unavailable
npm run item -- m4 --price 210          # change a price
npm run item -- m4 --available true --price 160
npm run reset                           # reseed from catalog.json AND clear orders, proposals, sessions, traces
npm run trace -- --last                 # print newest agent run trace as JSON
npm run trace -- run_xxxxxxxx           # print a specific run
```

The same over HTTP (development only):

```bash
curl -X POST localhost:8787/api/dev/items/m4 -H 'content-type: application/json' -d '{"available":false}'
curl -X POST localhost:8787/api/dev/items/m4 -H 'content-type: application/json' -d '{"price":170}'
curl -X POST localhost:8787/api/dev/reset
```

To use different seed data, replace `backend/data/catalog.json` (same schema) and run `npm run reset`.

### Tests

```bash
cd backend
npm test                       # 58 automated tests, no API key needed (the LLM is scripted)
node scripts/smoke.js          # live end-to-end check against a running server with a real LLM;
                               # writes docs/sample-run-trace.json
```

## 3. Mobile app

### Point the app at the backend

The app works like a normal app: **it connects to the server URL built into the APK and never asks for one.**
That URL comes from `EXPO_PUBLIC_API_URL` in `mobile/eas.json` (preview profile) at build time.

**Option 1: fixed HTTPS URL via ngrok (what the submitted APK uses).**

```bash
# once: sign up at ngrok.com, then
ngrok config add-authtoken <YOUR_TOKEN>
# every time, with the backend running on 8787:
ngrok http --url=<your-dev-domain>.ngrok-free.dev 8787
```

Put `https://<your-dev-domain>.ngrok-free.dev` in `eas.json` → `EXPO_PUBLIC_API_URL` and build. The phone then works on Wi-Fi or mobile data.
The submitted APK points at the author's tunnel, so it is online only while the author's backend + ngrok are running.

**Option 2: your own local backend (evaluators).** No rebuild needed:

1. Start the backend (`npm start`).
2. In the app: **Settings → tap "Version 1.0.0" seven times** → _Developer options_ appear (hidden from normal users, like Android's own).
3. Enter your URL and tap **Save and test**:
   - Emulator: `http://10.0.2.2:8787`
   - Phone on the same Wi-Fi: `http://<your-computer-LAN-IP>:8787` (find it with `ipconfig` / `ip addr`; allow port 8787 through the firewall)
4. **Use built-in server** switches back; **Hide developer options** hides the section again.

Cleartext HTTP is enabled only so option 2 works on a LAN (see Engineering note → production).

### Build the APK, option A: EAS cloud build (no Android SDK needed)

```bash
cd mobile
npm install
npx eas-cli login               # free Expo account
npx eas-cli build -p android --profile preview
```

EAS prints a link to download `*.apk`. Install it with `adb install app.apk` or by opening the link on the phone.

### Build the APK, option B: local build (Android Studio, JDK 17)

```bash
cd mobile
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease      # Windows: gradlew.bat assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk  (signed with the debug key; fine for sideloading)
adb install -r app/build/outputs/apk/release/app-release.apk
```

To bake a different default URL into a local build: `EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 ./gradlew assembleRelease`.

> Voice uses Android's on-device `SpeechRecognizer` (via `expo-speech-recognition`), so it does **not** work in Expo Go. Use the APK. On an emulator, voice needs a Google Play system image with the Google app; text input always works.

## 4. API summary

| Method & path                                                                     | Purpose                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                                                 | status and whether an LLM is configured                                                                                                                                                                                    |
| `GET /api/catalog`                                                                | current catalogue (read-only)                                                                                                                                                                                              |
| `POST /api/agent/turn` `{device_id, session_id?, text}`                           | one assistant turn → `{reply, proposal?, device_action?, activity[], status, retryable, run_id}`                                                                                                                           |
| `GET /api/proposals/:id`                                                          | proposal state (+ order id if confirmed, + replacement if stale)                                                                                                                                                           |
| `POST /api/proposals/:id/confirm` `{device_id, expected_item_id, expected_total}` | **only** way to create an order. `201` created, `200` idempotent replay (same order), `409 proposal_changed` with `new_proposal` when price/availability changed, `409 proposal_not_pending` / `proposal_mismatch`, `404`. |
| `POST /api/proposals/:id/cancel` `{device_id}`                                    | cancel a pending proposal (no order)                                                                                                                                                                                       |
| `GET /api/orders?device_id=`                                                      | saved orders, newest first                                                                                                                                                                                                 |
| `GET /api/orders/last?device_id=`                                                 | last order plus its Maps action                                                                                                                                                                                            |
| `POST /api/device-actions`                                                        | the phone reports `maps_opened` / `browser_fallback_opened` / `could_not_open_directions` (never creates orders)                                                                                                           |
| `GET /api/runs?device_id=` / `GET /api/runs/:id`                                  | run traces (export)                                                                                                                                                                                                        |
| `POST /api/dev/items/:id`, `POST /api/dev/reset`                                  | development-only evaluation hooks                                                                                                                                                                                          |

## 5. How it works (short)

```
 Phone (Expo app)                         Backend (Node + SQLite)                      LLM (OpenAI-compatible)
 ───────────────                          ───────────────────────                      ──────────────────────
 hold mic → on-device speech-to-text
 transcript in editable box → Send ──►  POST /agent/turn
                                         policy guard (Swiggy etc.)
                                         loop ≤6 model calls / ≤8 tools ─────────────► choose tool
                                           search_menu   (zod-validated, budget/diet  ◄─ observation
                                                          must be stated by user)
                                           prepare_order (must be best_item_id of
                                                          current search; re-checked
                                                          in a DB transaction)
                                           get_last_order / open_directions
 review card (exact restaurant, meal,  ◄─ reply + proposal + activity
 qty, total, SANDBOX label)
 tap Confirm ─────────────────────────►  POST /proposals/:id/confirm   (no LLM involved)
                                         BEGIN IMMEDIATE; re-check price/availability;
                                         UNIQUE(orders.proposal_id) → exactly one order
 "Sandbox order saved" ◄──────────────── order + device_action (always offered)
 "Open directions" button (user taps)
 → geo: intent → Maps app, else HTTPS
 fallback → "Maps opened" / "Browser
 fallback opened" / "Could not open
 directions"  ── report ─────────────►  POST /device-actions (trace only)
```

See `docs/ENGINEERING_NOTE.md` for decisions, limits and production notes, and `docs/TESTING.md` for test results and the manual checklist.

## 6. Demo script (3-5 minutes)

1. `npm run reset`, start backend (and ngrok), open the app: the header shows **Server connected**.
2. **Voice:** hold mic, say the example request → release → transcript appears in the box → Send.
3. Show the activity lines (search_menu → prepare_order) and the review card: _Lunch Box (fictional) · Veg Lunch Box · qty 1 · ₹160 · SANDBOX_.
4. Tap **Confirm** → "SANDBOX ORDER SAVED" → an **Open directions** button appears (Maps never opens by itself) → tap it → Maps opens at the restaurant → "MAPS OPENED".
5. **Changed availability:** ask again, _before_ confirming run `npm run item -- m4 --available false`, then tap Confirm → app shows the item is no longer available and a new proposal (Veg Rice Bowl ₹180) that needs fresh approval. Confirm it.
6. Say "Open directions for my last order".
7. Kill and reopen the app → History still shows both orders; restart the backend → still there.
8. Activity tab → "Export trace (JSON)".
9. Optional: "Veg dish above 200 rupees" (minimum price); "Order this on Swiggy"; "I want something vegetarian" (assistant asks for the budget); deny mic permission and show that text still works.

## 7. AI assistance and reused code

Built with Claude (Anthropic) as the AI coding assistant. See `docs/ENGINEERING_NOTE.md` § "AI assistance" for exactly how. The app was scaffolded with `create-expo-app` (blank-typescript template). Libraries: Express, zod, expo-speech-recognition, AsyncStorage, expo-crypto, expo-build-properties, expo-linear-gradient, expo-font, @expo/vector-icons, Plus Jakarta Sans.
