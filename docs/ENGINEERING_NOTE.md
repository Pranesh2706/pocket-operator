# Engineering note: Pocket Operator

> Items marked **[FILL IN]** need your own measured values before submission.

## Architecture

**Mobile (Expo / React Native, TypeScript).** One screen with four sections: Assistant, History, Activity, Settings.
- *Voice:* push-to-talk with Android's `SpeechRecognizer` (`expo-speech-recognition`). Only text comes back. No audio file is recorded, stored or uploaded. The transcript goes into the editable text box, so the user can review or fix it before sending. Errors are handled for denied permission (with a link to Settings), an empty recording or no speech, recogniser unavailable, and the app going to the background (the mic is aborted). Text input works in every case.
- *State:* the conversation, current proposal, any in-flight confirmation and the cached order history are kept in AsyncStorage. On resume, the app re-syncs the proposal with the server. If a confirm whose response was lost actually succeeded, the app shows the saved order instead of asking again.
- *Phone action:* an Android `geo:` intent via `Linking.openURL`, which opens any installed map handler. If no handler exists, the app falls back to an HTTPS Google Maps link in the browser; if that fails too, it shows "could not open directions". Each outcome is shown as a distinct chip, and reported to the backend for the trace only. No location permission is used (location permissions are explicitly blocked in the manifest).

**Backend (Node 22, Express 5, zod, SQLite via built-in `node:sqlite`).**
- Tables: `restaurants`, `items`, `sessions` (short chat history), `proposals`, `orders` (`proposal_id UNIQUE`), `runs`, `tool_calls`.
- **Selection rule in code:** `searchMenu()` filters by diet, availability and an inclusive budget, then sorts by price and breaks ties by item id. The model never ranks items.
- **Agent loop** (`src/agent/runner.js`): an OpenAI-compatible chat-completions call with four allowlisted tools (`search_menu`, `prepare_order`, `get_last_order`, `open_directions`). Limits are 6 model calls and 8 tool calls per turn, a 20 s timeout per call with one retry on 429/5xx, and a 45 s cap on the whole turn. Each tool's arguments are validated with a strict zod schema, and the same schema generates the JSON schema the model sees.
- **Deterministic guards around the LLM:**
  - `search_menu` is rejected unless the budget number and the dietary preference both appear in the user's own messages. This enforces "ask, don't invent": the model receives `missing_user_constraint` and asks a follow-up.
  - `prepare_order` only accepts the `best_item_id` from a search in the *current* turn. It re-runs the search inside a `BEGIN IMMEDIATE` transaction before creating the proposal.
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

Default: **Google Gemini 2.5 Flash** through Google's OpenAI-compatible endpoint, with `reasoning_effort=low`.
- Reliable tool calling, fast, and cheap, with a free tier for development.
- Because the client is plain OpenAI-compatible `fetch`, switching to OpenAI, Groq, OpenRouter or a local Ollama model is a `.env` change, with no code change.
- Temperature is 0. Correctness doesn't depend on the model being smart: the server enforces selection, grounding, approval and freshness.

**[FILL IN if you used a different model.]**

## Observed latency and cost

- Observed latency for the example request (3 model calls: search → prepare → reply): **[FILL IN from Activity tab / `npm run trace -- --last` → `latency_ms`]**. Confirm calls take a few milliseconds plus network.
- Token use per example turn, from the `runs` table (`prompt_tokens`, `completion_tokens`): **[FILL IN]**. Estimate: about 3 calls × ~1,500 prompt tokens (system prompt + tool schemas + history) ≈ 4,500 input tokens, and ~150 output tokens.
- Cost at Gemini 2.5 Flash list price ($0.30 per 1M input tokens, $2.50 per 1M output tokens): 4,500 × $0.30/1M + 150 × $2.50/1M ≈ **$0.0017 per turn (≈ ₹0.15)**. That is about $1.70 per 1,000 example turns. Assumptions: no context caching; reasoning tokens kept low by `reasoning_effort=low` (thinking tokens are billed as output); history capped at 12 messages. The free tier costs $0 within its rate limits.

## Time spent

**[FILL IN]**: e.g. backend + tests ~X h, mobile ~Y h, device testing + demo + docs ~Z h.

## AI assistance and reused code

**[FILL IN honestly. For example:]** "I used Claude (Anthropic) as an AI coding assistant to generate the initial backend, tests, mobile app and docs, then reviewed, ran, tested on device and modified the code myself." Name any other tools you used.

Reused code:
- `create-expo-app` blank-typescript template.
- Open-source libraries: Express, zod, expo-speech-recognition, @react-native-async-storage/async-storage, expo-crypto, expo-build-properties.
- No other copied code.

## Known limitations

- No authentication. A random `device_id` scopes orders and traces. Anyone who knows a device id could read its sandbox history.
- Cleartext HTTP is enabled for LAN demos.
- Grounding checks are lexical. A budget must appear as digits or simple English number words ("two hundred"). A diet must use common words (veg/vegetarian/non-veg/chicken/no preference...). Unusual phrasing, or a budget in Tamil numerals, makes the assistant ask again instead of guessing. It fails safe.
- Only one dietary dimension: vegetarian yes or no. No vegan, Jain or allergen handling.
- Proposals don't expire by time. They are invalidated by a newer proposal, by cancel, or by a catalogue change detected at confirm.
- Tamil voice depends on the phone having the ta-IN recognition language installed. Replies are in English unless the model follows the user's language.
- Maps handoff success means Android accepted the intent. It does not prove the map loaded or that navigation started (the UI says so).
- A single Node process with SQLite. Fine for the demo; see below for production.

## First two production improvements

1. **Auth and transport security.** Real user accounts with short-lived tokens, so orders belong to a user rather than a device id. Use HTTPS only (remove cleartext), put rate limiting on `/agent/turn`, and remove the `/api/dev/*` routes from production builds. An admin UI with its own auth would replace them.
2. **Durability and observability at scale.** Move to Postgres with the same transactional confirm and unique constraint, plus an `Idempotency-Key` header table for all POSTs. Add proposal expiry. Add structured logs, metrics and OpenTelemetry tracing of each run, with alerts on LLM error rates and latency. Add an evaluation set of reworded requests run in CI against the real model.
