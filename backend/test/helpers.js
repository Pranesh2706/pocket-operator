import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, seed } from '../src/db.js';
import { createApp } from '../src/app.js';

process.env.NODE_ENV = 'test';

export const DEVICE = 'test-device-0001';
export const OTHER_DEVICE = 'test-device-0002';

export function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-op-'));
  return path.join(dir, 'test.db');
}

/** Start a real HTTP server on a random port over a fresh, seeded database file. */
export async function startServer({ llm = null, dbPath = tempDbPath(), catalogPath } = {}) {
  const db = openDb(dbPath);
  seed(db, { wipe: true, ...(catalogPath ? { catalogPath } : {}) });
  // Swappable model so each test can script its own LLM behaviour against one server.
  const holder = { current: llm };
  const proxy = {
    get model() {
      return holder.current?.model ?? null;
    },
    chat: (...args) => holder.current.chat(...args),
  };
  const app = createApp({ db, llm: proxy, devRoutes: true, catalogPath });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return {
    db,
    dbPath,
    base,
    get: (url) => call('GET', url),
    post: (url, body) => call('POST', url, body ?? {}),
    setLlm(l) {
      holder.current = l;
      return l;
    },
    async close() {
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}

export function countOrders(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
}

/**
 * Scripted fake LLM. Each step is either a response object or a function (messages) => response.
 * Response shape matches llm.js: { content, tool_calls: [{ id, name, arguments }] }.
 */
export function scriptedLlm(steps) {
  const calls = [];
  return {
    model: 'scripted-test-llm',
    calls,
    async chat(messages, tools) {
      calls.push({ messages: structuredClone(messages), tools });
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      const out = typeof step === 'function' ? step(messages) : step;
      if (out instanceof Error) throw out;
      return { content: out.content ?? null, tool_calls: out.tool_calls ?? [], usage: { prompt_tokens: 100, completion_tokens: 20 } };
    },
  };
}

export const tool = (name, args, id = `c_${name}`) => ({ tool_calls: [{ id, name, arguments: JSON.stringify(args) }] });
export const say = (content) => ({ content });

/** Last tool observation the agent fed back to the model. */
export function lastObservation(messages) {
  const m = [...messages].reverse().find((x) => x.role === 'tool');
  return m ? JSON.parse(m.content) : null;
}

/** Ask the server to prepare a proposal through the agent using a well-behaved scripted model. */
export async function prepareViaAgent(srv, { text = 'Cheapest vegetarian lunch for no more than 200 rupees, then show me how to get there', diet = 'veg', max = 200, directions = true, device = DEVICE, session_id = null } = {}) {
  srv.setLlm(
    scriptedLlm([
      tool('search_menu', { diet, max_price_inr: max }),
      (msgs) => tool('prepare_order', { item_id: lastObservation(msgs).best_item_id, open_directions_after_confirm: directions }),
      say('Prepared. Tap Confirm.'),
    ])
  );
  const r = await srv.post('/api/agent/turn', { device_id: device, session_id, text });
  return r.body;
}
