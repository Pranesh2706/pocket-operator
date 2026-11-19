// Catalogue queries. This module is the single source of truth for what "matches" means:
// diet + inclusive budget + available, cheapest first, ties broken by item id.
import { nowIso } from './db.js';

export const DIETS = ['veg', 'non_veg', 'any'];

const ITEM_SELECT = `
  SELECT i.id, i.restaurant_id, i.name, i.vegetarian, i.price, i.available, i.description, i.updated_at,
         r.name AS restaurant_name, r.latitude, r.longitude
  FROM items i JOIN restaurants r ON r.id = i.restaurant_id`;

function rowToItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    restaurant_name: row.restaurant_name,
    name: row.name,
    vegetarian: row.vegetarian === 1,
    price: row.price,
    available: row.available === 1,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    updated_at: row.updated_at,
  };
}

export function getItem(db, id) {
  return rowToItem(db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id));
}

export function listItems(db) {
  return db.prepare(`${ITEM_SELECT} ORDER BY i.id`).all().map(rowToItem);
}

export function dietMatches(item, diet) {
  if (diet === 'veg') return item.vegetarian;
  if (diet === 'non_veg') return !item.vegetarian;
  return true;
}

/** Deterministic comparator: price ascending, then item id (numeric-aware, so m2 < m10). */
export function compareItems(a, b) {
  if (a.price !== b.price) return a.price - b.price;
  return a.id.localeCompare(b.id, 'en', { numeric: true });
}

/**
 * Search the live catalogue. Returns all matches sorted by the selection rule plus counts of
 * why other items were excluded, so the agent (and the trace) can explain "nothing matches".
 */
export function searchMenu(db, { diet, max_price, min_price = 0 }) {
  const all = listItems(db);
  const excluded = { wrong_diet: 0, over_budget: 0, under_minimum: 0, unavailable: 0 };
  const matches = [];
  for (const item of all) {
    if (!dietMatches(item, diet)) excluded.wrong_diet++;
    else if (!item.available) excluded.unavailable++;
    else if (item.price > max_price) excluded.over_budget++; // budget is inclusive
    else if (item.price < min_price) excluded.under_minimum++; // "at least X" is inclusive
    else matches.push(item);
  }
  matches.sort(compareItems);
  return { matches, best: matches[0] ?? null, excluded, total_items: all.length };
}

/** Development-only mutation used by the admin CLI and /api/dev routes. */
export function updateItem(db, id, { price, available }) {
  const item = getItem(db, id);
  if (!item) return null;
  if (price !== undefined && (!Number.isInteger(price) || price < 0)) throw new Error('price must be a non-negative integer');
  db.prepare('UPDATE items SET price = ?, available = ?, updated_at = ? WHERE id = ?').run(
    price ?? item.price,
    available === undefined ? (item.available ? 1 : 0) : available ? 1 : 0,
    nowIso(),
    id
  );
  return getItem(db, id);
}
