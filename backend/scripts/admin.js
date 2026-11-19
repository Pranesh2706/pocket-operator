// Development-only CLI for evaluators. Works directly on the SQLite file, so the server
// can keep running (changes are visible to the next request).
//
//   npm run catalog                         list items
//   npm run item -- m4 --available false    make Veg Lunch Box unavailable
//   npm run item -- m4 --price 210          change a price
//   npm run reset                           reseed from data/catalog.json and wipe orders/proposals/traces
//   npm run trace -- <run_id>               print one run trace as JSON
//   npm run trace -- --last                 print the newest agent run trace
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, seed, DEFAULT_DB_PATH } from '../src/db.js';
import { listItems, updateItem } from '../src/catalog.js';
import { getRunTrace } from '../src/trace.js';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const db = openDb(process.env.DB_PATH || DEFAULT_DB_PATH);

const [cmd, ...rest] = process.argv.slice(2);

function flag(name) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

function table() {
  console.table(
    listItems(db).map((i) => ({ id: i.id, restaurant: i.restaurant_name, name: i.name, veg: i.vegetarian, price: i.price, available: i.available }))
  );
}

switch (cmd) {
  case 'list':
    table();
    break;
  case 'reset':
    seed(db, { wipe: true });
    console.log('Reset: catalogue reseeded from data/catalog.json; orders, proposals, sessions and traces cleared.');
    table();
    break;
  case 'item': {
    const id = rest[0];
    const price = flag('price');
    const available = flag('available');
    if (!id || (price === undefined && available === undefined)) {
      console.error('Usage: npm run item -- <item_id> [--price <int>] [--available true|false]');
      process.exit(1);
    }
    if (available !== undefined && !['true', 'false'].includes(available)) {
      console.error('--available must be true or false');
      process.exit(1);
    }
    const item = updateItem(db, id, {
      price: price === undefined ? undefined : Number(price),
      available: available === undefined ? undefined : available === 'true',
    });
    if (!item) {
      console.error(`No item ${id}`);
      process.exit(1);
    }
    console.log(`Updated ${id}`);
    table();
    break;
  }
  case 'trace': {
    const id =
      rest[0] === '--last' ? db.prepare("SELECT id FROM runs WHERE kind = 'agent' ORDER BY started_at DESC, rowid DESC LIMIT 1").get()?.id : rest[0];
    const trace = id && getRunTrace(db, id);
    if (!trace) {
      console.error('Run not found');
      process.exit(1);
    }
    console.log(JSON.stringify(trace, null, 2));
    break;
  }
  default:
    console.error('Commands: list | reset | item <id> [--price N] [--available true|false] | trace <run_id>|--last');
    process.exit(1);
}
