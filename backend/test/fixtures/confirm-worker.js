// Test helper: confirm a proposal from a separate OS process (used by the cross-process duplicate test).
import { openDb } from '../../src/db.js';
import { confirmProposal } from '../../src/orders.js';

const [dbPath, proposalId, device_id, itemId, total] = process.argv.slice(2);
const db = openDb(dbPath);
const r = confirmProposal(db, proposalId, { device_id, expected_item_id: itemId, expected_total: Number(total) });
process.stdout.write(JSON.stringify({ outcome: r.outcome, order_id: r.order?.id ?? null }));
db.close();
