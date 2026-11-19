// Proposals and sandbox orders. The server, not the model, owns every rule here:
//  - an order exists only after an explicit confirm of a specific pending proposal
//  - price/availability/diet/budget are re-checked at confirm time; any change means a new
//    proposal that needs fresh approval (never a silent substitution)
//  - orders.proposal_id is UNIQUE, so retries/double taps/concurrent confirms yield one order
import { tx, nowIso, getMeta } from './db.js';
import { getItem, searchMenu, dietMatches } from './catalog.js';
import { newId } from './trace.js';

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function rowToProposal(r) {
  if (!r) return null;
  return {
    id: r.id,
    session_id: r.session_id,
    device_id: r.device_id,
    run_id: r.run_id,
    item_id: r.item_id,
    item_name: r.item_name,
    restaurant_id: r.restaurant_id,
    restaurant_name: r.restaurant_name,
    vegetarian: r.vegetarian === 1,
    quantity: r.quantity,
    unit_price: r.unit_price,
    total: r.total,
    currency: r.currency,
    constraints: { diet: r.diet, max_price: r.max_price },
    open_directions_after_confirm: r.open_directions === 1,
    status: r.status,
    status_reason: r.status_reason,
    replaced_by: r.replaced_by,
    sandbox: true,
    label: 'SANDBOX PICKUP - fictional order, no payment',
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToOrder(r) {
  if (!r) return null;
  return {
    id: r.id,
    proposal_id: r.proposal_id,
    item_id: r.item_id,
    item_name: r.item_name,
    restaurant_id: r.restaurant_id,
    restaurant_name: r.restaurant_name,
    latitude: r.latitude,
    longitude: r.longitude,
    quantity: r.quantity,
    total: r.total,
    currency: r.currency,
    fulfilment: r.fulfilment,
    status: r.status,
    sandbox: true,
    created_at: r.created_at,
  };
}

export function getProposal(db, id) {
  return rowToProposal(db.prepare('SELECT * FROM proposals WHERE id = ?').get(id));
}

export function getPendingProposal(db, session_id) {
  return rowToProposal(
    db.prepare("SELECT * FROM proposals WHERE session_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(session_id)
  );
}

export function getOrder(db, id) {
  return rowToOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
}

export function getOrderByProposal(db, proposal_id) {
  return rowToOrder(db.prepare('SELECT * FROM orders WHERE proposal_id = ?').get(proposal_id));
}

export function listOrders(db, device_id, limit = 50) {
  return db
    .prepare('SELECT * FROM orders WHERE device_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
    .all(device_id, limit)
    .map(rowToOrder);
}

export function getLastOrder(db, device_id) {
  return listOrders(db, device_id, 1)[0] ?? null;
}

/**
 * Insert a pending proposal for an item. Must be called inside a transaction.
 * Any other pending proposal in the same session is superseded: a changed proposal
 * invalidates the previous one, so its approval can no longer be used.
 */
function insertProposalTx(db, { session_id, device_id, run_id, item, diet, max_price, open_directions }) {
  const id = newId('prop');
  const ts = nowIso();
  db.prepare(
    "UPDATE proposals SET status = 'superseded', status_reason = 'replaced by a newer proposal', replaced_by = ?, updated_at = ? WHERE session_id = ? AND status = 'pending'"
  ).run(id, ts, session_id);
  db.prepare(
    `INSERT INTO proposals (id, session_id, device_id, run_id, item_id, restaurant_id, item_name, restaurant_name, vegetarian,
       quantity, unit_price, total, currency, diet, max_price, open_directions, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    id,
    session_id,
    device_id,
    run_id,
    item.id,
    item.restaurant_id,
    item.name,
    item.restaurant_name,
    item.vegetarian ? 1 : 0,
    item.price,
    item.price, // quantity is always 1; prices are all-inclusive INR
    getMeta(db, 'currency', 'INR'),
    diet,
    max_price,
    open_directions ? 1 : 0,
    ts,
    ts
  );
  return id;
}

/**
 * Create a proposal for exactly the item the deterministic search selects for these constraints.
 * The caller passes the item id the agent chose; we reject it unless it is still the best match.
 */
export function createProposal(db, { session_id, device_id, run_id, item_id, diet, max_price, open_directions }) {
  return tx(db, () => {
    const { best } = searchMenu(db, { diet, max_price });
    if (!best) throw new ApiError(409, 'no_match', 'No available item matches these constraints any more.');
    if (best.id !== item_id) {
      throw new ApiError(409, 'not_best_match', `Item ${item_id} is not the cheapest available match; current best is ${best.id}.`, {
        best_item_id: best.id,
      });
    }
    const id = insertProposalTx(db, { session_id, device_id, run_id, item: best, diet, max_price, open_directions });
    return getProposal(db, id);
  });
}

export function cancelProposal(db, id, { device_id }) {
  return tx(db, () => {
    const p = getProposal(db, id);
    if (!p) throw new ApiError(404, 'proposal_not_found', 'Proposal not found.');
    if (device_id) assertDevice(db, id, device_id);
    if (p.status === 'cancelled') return p; // idempotent
    if (p.status !== 'pending') throw new ApiError(409, 'proposal_not_pending', `Proposal is ${p.status}; nothing to cancel.`, { proposal: p });
    db.prepare("UPDATE proposals SET status = 'cancelled', status_reason = 'cancelled by user', updated_at = ? WHERE id = ?").run(nowIso(), id);
    return getProposal(db, id);
  });
}

function assertDevice(db, proposal_id, device_id) {
  const row = db.prepare('SELECT device_id FROM proposals WHERE id = ?').get(proposal_id);
  if (row && row.device_id !== device_id) throw new ApiError(403, 'wrong_device', 'This proposal belongs to a different device.');
}

/**
 * Confirm a proposal the user approved in the app.
 * Returns { outcome: 'created' | 'replayed', order } or { outcome: 'changed', reason, proposal, new_proposal }.
 * `expected` is what the user saw on the review card (item id + total); it must match exactly.
 */
export function confirmProposal(db, id, { device_id, expected_item_id, expected_total }) {
  return tx(db, () => {
    const p = getProposal(db, id);
    if (!p) throw new ApiError(404, 'proposal_not_found', 'No such proposal. Ask the assistant to prepare an order first.');
    assertDevice(db, id, device_id);

    // Idempotent replay: a retry after a lost response returns the very same order.
    if (p.status === 'confirmed') {
      return { outcome: 'replayed', order: getOrderByProposal(db, id), proposal: p };
    }
    if (p.status === 'stale') {
      // Retried confirm of a proposal that already went stale: return the same replacement again.
      return { outcome: 'changed', reason: p.status_reason, proposal: p, new_proposal: p.replaced_by ? getProposal(db, p.replaced_by) : null };
    }
    if (p.status !== 'pending') {
      throw new ApiError(409, 'proposal_not_pending', `This proposal is ${p.status} and can no longer be confirmed.`, { proposal: p });
    }
    if (expected_item_id !== p.item_id || expected_total !== p.total) {
      throw new ApiError(409, 'proposal_mismatch', 'Confirmation does not match the proposal on the server. Refresh and review again.', {
        proposal: p,
      });
    }

    // Freshness: re-check the live catalogue row.
    const item = getItem(db, p.item_id);
    let reason = null;
    if (!item) reason = 'item no longer exists';
    else if (!item.available) reason = `${p.item_name} is no longer available`;
    else if (item.price !== p.unit_price) reason = `price of ${p.item_name} changed from ${p.unit_price} to ${item.price} ${p.currency}`;
    else if (!dietMatches(item, p.constraints.diet)) reason = `${p.item_name} no longer matches the dietary preference`;

    if (reason) {
      const { best } = searchMenu(db, { diet: p.constraints.diet, max_price: p.constraints.max_price });
      let newId = null;
      if (best) {
        newId = insertProposalTx(db, {
          session_id: p.session_id,
          device_id: p.device_id,
          run_id: p.run_id,
          item: best,
          diet: p.constraints.diet,
          max_price: p.constraints.max_price,
          open_directions: p.open_directions_after_confirm,
        });
      }
      // insertProposalTx superseded p; mark it stale with the real reason instead.
      db.prepare("UPDATE proposals SET status = 'stale', status_reason = ?, replaced_by = ?, updated_at = ? WHERE id = ?").run(
        reason,
        newId,
        nowIso(),
        id
      );
      return { outcome: 'changed', reason, proposal: getProposal(db, id), new_proposal: newId ? getProposal(db, newId) : null };
    }

    const orderId = newId('ord');
    const ts = nowIso();
    // UNIQUE(proposal_id) is the database-level guarantee against duplicates.
    db.prepare(
      `INSERT INTO orders (id, proposal_id, session_id, device_id, item_id, restaurant_id, item_name, restaurant_name,
         latitude, longitude, quantity, total, currency, fulfilment, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sandbox_confirmed', ?)`
    ).run(
      orderId,
      id,
      p.session_id,
      p.device_id,
      item.id,
      item.restaurant_id,
      item.name,
      item.restaurant_name,
      item.latitude,
      item.longitude,
      p.quantity,
      p.total,
      p.currency,
      getMeta(db, 'fulfilment', 'sandbox_pickup'),
      ts
    );
    db.prepare("UPDATE proposals SET status = 'confirmed', status_reason = 'confirmed by user tap', updated_at = ? WHERE id = ?").run(ts, id);
    return { outcome: 'created', order: getOrder(db, orderId), proposal: getProposal(db, id) };
  });
}
