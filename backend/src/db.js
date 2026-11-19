// SQLite persistence (Node's built-in node:sqlite, no native addon to compile).
// All writes that must be atomic run inside BEGIN IMMEDIATE transactions; node:sqlite
// is synchronous, so a transaction can never interleave with another request in this
// process, and the UNIQUE constraint on orders.proposal_id guards across processes too.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = path.resolve(here, '../data/pocket.db');
export const DEFAULT_CATALOG_PATH = path.resolve(here, '../data/catalog.json');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  vegetarian INTEGER NOT NULL CHECK (vegetarian IN (0,1)),
  price INTEGER NOT NULL CHECK (price >= 0),
  available INTEGER NOT NULL CHECK (available IN (0,1)),
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  history_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  run_id TEXT,
  item_id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  vegetarian INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity = 1),
  unit_price INTEGER NOT NULL,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL,
  diet TEXT NOT NULL,
  max_price INTEGER NOT NULL,
  min_price INTEGER NOT NULL DEFAULT 0,
  open_directions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled','superseded','stale')),
  status_reason TEXT,
  replaced_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS proposals_session ON proposals(session_id, status);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
  session_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  quantity INTEGER NOT NULL,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL,
  fulfilment TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_device ON orders(device_id, created_at);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,             -- agent | confirm | cancel | device_action
  session_id TEXT,
  device_id TEXT,
  user_text TEXT,
  status TEXT NOT NULL,
  summary TEXT,
  model TEXT,
  iterations INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  latency_ms INTEGER
);
CREATE INDEX IF NOT EXISTS runs_device ON runs(device_id, started_at);

CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  seq INTEGER NOT NULL,
  tool TEXT NOT NULL,
  input_json TEXT,
  status TEXT NOT NULL,           -- ok | rejected | error
  decision TEXT,                  -- short code-generated summary, not model reasoning
  outcome_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tool_calls_run ON tool_calls(run_id, seq);
`;

export function nowIso() {
  return new Date().toISOString();
}

export function openDb(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive migrations for databases created by an earlier version. */
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(proposals)').all().map((c) => c.name);
  if (!cols.includes('min_price')) db.exec('ALTER TABLE proposals ADD COLUMN min_price INTEGER NOT NULL DEFAULT 0');
}

/** Run fn inside BEGIN IMMEDIATE ... COMMIT, rolling back on any throw. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Load catalog.json into restaurants/items. With wipe=true also clears orders, proposals and traces. */
export function seed(db, { catalogPath = DEFAULT_CATALOG_PATH, wipe = false } = {}) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  validateCatalog(catalog);
  tx(db, () => {
    if (wipe) {
      for (const t of ['tool_calls', 'runs', 'orders', 'proposals', 'sessions']) db.exec(`DELETE FROM ${t}`);
    }
    db.exec('DELETE FROM items');
    db.exec('DELETE FROM restaurants');
    const insR = db.prepare('INSERT INTO restaurants (id, name, latitude, longitude) VALUES (?, ?, ?, ?)');
    for (const r of catalog.restaurants) insR.run(r.id, r.name, r.latitude, r.longitude);
    const insI = db.prepare(
      'INSERT INTO items (id, restaurant_id, name, vegetarian, price, available, description, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const ts = nowIso();
    for (const i of catalog.items) {
      insI.run(i.id, i.restaurant_id, i.name, i.vegetarian ? 1 : 0, i.price, i.available ? 1 : 0, i.description ?? '', ts);
    }
    const setMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    setMeta.run('currency', catalog.currency);
    setMeta.run('fulfilment', catalog.rules?.fulfilment ?? 'sandbox_pickup');
    setMeta.run('seeded_at', ts);
  });
  return catalog;
}

export function seedIfEmpty(db, opts) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM items').get();
  if (n === 0) seed(db, opts);
}

export function getMeta(db, key, fallback) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function validateCatalog(c) {
  if (!c || !Array.isArray(c.restaurants) || !Array.isArray(c.items)) throw new Error('catalog.json: restaurants/items missing');
  const rids = new Set(c.restaurants.map((r) => r.id));
  for (const i of c.items) {
    if (!rids.has(i.restaurant_id)) throw new Error(`catalog.json: item ${i.id} has unknown restaurant ${i.restaurant_id}`);
    if (!Number.isInteger(i.price) || i.price < 0) throw new Error(`catalog.json: item ${i.id} has invalid price`);
  }
}
