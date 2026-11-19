# Engineering note: Pocket Operator

> Author: Pranesh · Tested on vivo T3, Android 16.

## Architecture

**Mobile (Expo / React Native, TypeScript).** One screen with four sections: Assistant, History, Activity, Settings.

- _Voice:_ push-to-talk with Android's `SpeechRecognizer` (`expo-speech-recognition`). Only text comes back. No audio file is recorded, stored or uploaded. The transcript goes into the editable text box, so the user can review or fix it before sending. Errors are handled for denied permission (with a link to Settings), an empty recording or no speech, recogniser unavailable, and the app going to the background (the mic is aborted). Text input works in every case.
- _State:_ the conversation, current proposal, any in-flight confirmation and the cached order history are kept in AsyncStorage. On resume, the app re-syncs the proposal with the server. If a confirm whose response was lost actually succeeded, the app shows the saved order instead of asking again.
- _Phone action:_ after every confirmed order the app shows an **Open directions** button; Maps never opens without a tap. The button fires an Android `geo:` intent via `Linking.openURL`, which opens any installed map handler. If no handler exists, the app falls back to an HTTPS Google Maps link in the browser; if that fails too, it shows "could not open directions". Each outcome is shown as a distinct chip, and reported to the backend for the trace only. No location permission is used (location permissions are explicitly blocked in the manifest).

**Backend (Node 22, Express 5, zod, SQLite via built-in `node:sqlite`).**

- Tables: `restaurants`, `items`, `sessions` (short chat history), `proposals`, `orders` (`proposal_id UNIQUE`), `runs`, `tool_calls`.
- **Selection rule in code:** `searchMenu()` filters by diet, availability, an inclusive budget and an optional minimum price ("above X" / "at least X"), then sorts by price and breaks ties by item id. The model never ranks items. If the model puts a "below 200" number in the minimum field (or the reverse), code corrects it from the user's own words and notes the correction in the trace.
- **Agent loop** (`src/agent/runner.js`): an OpenAI-compatible chat-completions call with four allowlisted tools (`search_menu`, `prepare_order`, `get_last_order`, `open_directions`). Limits are 6 model calls and 8 tool calls per turn, a 20 s timeout per call with one retry on 429/5xx, and a 45 s cap on the whole turn. Each tool's arguments are validated with a strict zod schema, and the same schema generates the JSON schema the model sees.
- **Deterministic guards around the LLM:**
  - `search_menu` is rejected unless the budget number and the dietary preference both appear in the user's own messages. This enforces "ask, don't invent": the model receives `missing_user_constraint` and asks a follow-up.
  - `prepare_order` only accepts the `best_item_id` from a search in the _current_ turn. It re-runs the search inside a `BEGIN IMMEDIATE` transaction before creating the proposal.
  - There is **no confirm tool**. Orders are created only by `POST /proposals/:id/confirm`, triggered by a user tap. That call must echo the exact item and total shown on the card.
  - `open_directions` only accepts a confirmed order owned by the device. Coordinates come from the database, not from the model.
  - A regex policy guard answers "Order on Swiggy/Zomato/..." without calling the model at all.
  - Tool results label catalogue text as data, and the system prompt says to ignore instructions inside it. A labelled defensive fixture test covers this.
- **Confirm** (`src/orders.js`) runs in one `BEGIN IMMEDIATE` transaction:
  1. If the proposal is already confirmed, return the same order (idempotent replay).
  2. If it is stale, return the same replacement it already got.
  3. If it is not pending, or doesn't match what the user saw, reject it.
  4. Re-read the item. If availability, price or diet changed, mark the proposal `stale`, create a new pending proposal from the same constraints (or none if nothing matches), and return `409` so the user approves again.
  5. Otherwise insert the order. `UNIQUE(proposal_id)` guarantees one order, even across processes.
- **Trace:** each turn, confirm, cancel and device action is a `run` with its tool steps: validated input, ok/rejected/error, a short code-generated decision line, the outcome JSON and timestamps. Token counts and latency are stored per run. API keys, audio and model chain-of-thought are never stored.

## Model / provider and why

**Google Gemini** through Google's OpenAI-compatible endpoint, temperature 0. Most testing used `gemini-3.1-flash-lite`; when its free-tier quota ran out, the final runs used `gemini-3-flash-preview` with no code change (only `LLM_MODEL` in `.env`).

- Chosen for reliable tool calling, low latency, low cost, and a free tier for development.
- During testing, `gemini-2.5-flash` returned 404: it is no longer available to new API users. `gemini-3.8-flash` returned 503 ("high demand"). Both failures surfaced in the app as the designed retryable error state, with no crash and no partial order.
- Gemini 3 models return a "thought signature" with each tool call. The client now echoes these back unchanged; without that, multi-step tool calling fails. A test covers it.
- The client is plain OpenAI-compatible `fetch`, so switching to OpenAI, Groq, OpenRouter or a local Ollama model is a `.env` change.
- Correctness never depends on the model being smart: selection, grounding, approval, freshness and the last-order directions action are all enforced or completed in code.

## Observed latency and cost

- Observed latency (`gemini-3.1-flash-lite`, backend on a laptop in India, phone over an ngrok tunnel): **example request ≈ 8.6 s** (3 model calls: search → prepare → reply); **"directions for my last order" ≈ 3.6 s**; **missing-budget follow-up ≈ 1.4–5.8 s** (1 model call); **Swiggy guard ≈ 3 ms** (no model call). Confirm calls take a few ms plus network.
- Token use: a single-call turn measured **959 prompt + 37 completion tokens** (`runs` table). The 3-call example turn is therefore ≈ 3,000–4,500 input and ~150 output tokens.
- Cost: development ran on the **free tier ($0)**. At Google's list price for gemini-3.1-flash-lite (**$0.25 per 1M input tokens, $1.50 per 1M output tokens**): 4,500 × $0.25/1M + 150 × $1.50/1M ≈ **$0.0014 per example turn (≈ ₹0.11)**, i.e. about **$1.35 per 1,000 example turns**. Assumptions: no context caching, history capped at 12 messages, `reasoning_effort=low`. Confirm/cancel/device-action calls do not use the model and cost nothing.

## Time spent

About **7 focused hours** (of the suggested 8–10), plus the remaining demo recording and submission:

- Backend, agent loop and automated tests: ~1.5 h
- LLM provider setup and debugging (Gemini 404 / 503, Gemini 3 thought signatures): ~0.5 h
- Mobile app, APK builds and device/network setup (EAS, ngrok): ~1.5 h
- Device testing and fixes (duplicate voice transcript, "prepare directly" prompt, guaranteed last-order directions): ~1.5 h
- UI polish (theme, vector icons, sliding tab bar, transitions, hidden developer options, app icon): ~1.5 h
- Documentation: ~0.5 h

## AI assistance and reused code

**AI tool used: Claude (Anthropic) only.**

How I used it:

- Claude generated the initial backend (API, SQLite schema, agent loop, tools, tests), the Expo app, the UI iterations, the app icon and the first drafts of these docs, working from the brief and my instructions.
- I ran everything on my own machine and phone:
  - built the APKs with EAS and tested them on a vivo T3 (Android 16);
  - set up Gemini, diagnosed the model errors from the run traces (`gemini-2.5-flash` 404, `gemini-3.8-flash` 503) and chose `gemini-3.1-flash-lite`;
  - set up the ngrok tunnel.
- I found and directed fixes for real-device issues:
  - a duplicated voice transcript;
  - the model asking "shall I prepare it?" instead of preparing;
  - last-order directions not opening Maps.
- I made the product and UI decisions:
  - a built-in server URL with hidden developer options;
  - Android-only scope;
  - keeping SQLite;
  - the theme and icon.
- I reviewed the code, and I can explain and change it live.

Reused code and libraries:

- `create-expo-app` blank-typescript template.
- Open-source libraries: Express, zod, expo-speech-recognition, @react-native-async-storage/async-storage, expo-crypto, expo-build-properties, expo-linear-gradient, expo-font, @expo/vector-icons (Ionicons, Material Community Icons), @expo-google-fonts/plus-jakarta-sans.
- No other copied code.

## Platform scope

Built and tested on **Android only**, as the brief asks. The codebase is cross-platform (Expo). iOS would need two things: an Apple Maps URL scheme in place of the Android `geo:` intent, and an Apple Developer account to distribute builds (TestFlight). Voice, UI and backend already support iOS.

## Deployment for the demo

The backend runs locally. For the demo APK it is exposed through an **ngrok HTTPS tunnel with a fixed dev domain**, which is built into the app via `EXPO_PUBLIC_API_URL`, so users never type a server address. The brief allows a local backend; hosting is optional. Evaluators can point the app at their own backend through **hidden Developer options (tap the version 7 times)** without a rebuild. With a tunnel active, `DEV_ROUTES=0` keeps the dev HTTP routes off the public internet. The CLI admin commands still work locally.

## Known limitations

- No authentication. A random `device_id` scopes orders and traces. Anyone who knows a device id could read its sandbox history.
- Cleartext HTTP is enabled for LAN demos.
- Grounding checks are lexical. A budget must appear as digits or simple English number words ("two hundred"). A diet must use common words (veg/vegetarian/non-veg/chicken/no preference...). Unusual phrasing, or a budget in Tamil numerals, makes the assistant ask again instead of guessing. It fails safe.
- Only one dietary dimension: vegetarian yes or no. No vegan, Jain or allergen handling.
- Proposals don't expire by time. They are invalidated by a newer proposal, by cancel, or by a catalogue change detected at confirm.
- Tamil voice depends on the phone having the ta-IN recognition language installed. Replies are in English unless the model follows the user's language.
- Maps handoff success means Android accepted the intent. It does not prove the map loaded or that navigation started (the UI says so).
- A single Node process with SQLite. Fine for the demo; see below for production.
- The submitted APK's built-in URL is the author's tunnel: it is reachable only while the author's laptop runs the backend and ngrok. Use Developer options to point at another backend.
- The agent endpoint is reachable by anyone who has the tunnel URL. There is no rate limit, so someone could spend the LLM quota. Acceptable for a short demo; production needs auth and rate limiting.
- The APK is a universal build (all CPU ABIs) so it installs on phones and emulators; this makes it larger. A Play Store AAB would roughly halve the per-device download.

## First two production improvements

1. **Auth and transport security.** Real user accounts with short-lived tokens, so orders belong to a user rather than a device id. Use HTTPS only (remove cleartext), put rate limiting on `/agent/turn`, and remove the `/api/dev/*` routes from production builds. An admin UI with its own auth would replace them.
2. **Durability and observability at scale.** Move to Postgres with the same transactional confirm and unique constraint, plus an `Idempotency-Key` header table for all POSTs. Add proposal expiry. Add structured logs, metrics and OpenTelemetry tracing of each run, with alerts on LLM error rates and latency. Add an evaluation set of reworded requests run in CI against the real model.
