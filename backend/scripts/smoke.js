// End-to-end smoke test against a RUNNING backend with a real LLM configured.
//   npm start            (in one terminal)
//   node scripts/smoke.js [http://localhost:8787]
// Runs the brief's example, confirms, asks for last-order directions, tries the Swiggy case,
// then writes the agent run trace to ../docs/sample-run-trace.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://localhost:8787';
const device_id = 'smoke-test-device';
const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (u) => fetch(base + u).then((r) => r.json());

function show(label, t) {
  console.log(`\n== ${label}  [${t.status}, ${t.latency_ms} ms]`);
  console.log('reply:', t.reply);
  for (const a of t.activity) console.log(`  - ${a.tool} (${a.status}): ${a.decision}`);
}

const health = await get('/api/health');
console.log('health:', health);
if (!health.llm_configured) {
  console.error('LLM is not configured on the server; set LLM_* in backend/.env');
  process.exit(1);
}

const t1 = (await post('/api/agent/turn', {
  device_id,
  text: 'Find me the cheapest vegetarian lunch for no more than 200 rupees. Prepare an order and then show me how to get there.',
})).body;
show('example request', t1);
if (!t1.proposal) {
  console.error('No proposal was prepared');
  process.exit(1);
}
console.log('proposal:', t1.proposal.item_name, '@', t1.proposal.restaurant_name, 'Rs', t1.proposal.total);

const c = await post(`/api/proposals/${t1.proposal.id}/confirm`, { device_id, expected_item_id: t1.proposal.item_id, expected_total: t1.proposal.total });
console.log(`\n== confirm [HTTP ${c.status}]`, c.body.outcome ?? c.body.error, c.body.order?.id ?? '', 'device_action:', JSON.stringify(c.body.device_action));

const t2 = (await post('/api/agent/turn', { device_id, session_id: t1.session_id, text: 'Open directions for my last order' })).body;
show('last-order directions', t2);
console.log('device_action:', JSON.stringify(t2.device_action));

const t3 = (await post('/api/agent/turn', { device_id, text: 'Order this on Swiggy' })).body;
show('unsupported service', t3);

const t4 = (await post('/api/agent/turn', { device_id, text: 'I want something vegetarian for lunch' })).body;
show('missing budget (expect a follow-up question)', t4);

const trace = await get(`/api/runs/${t1.run_id}`);
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/sample-run-trace.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(trace, null, 2));
console.log(`\nTrace for the example run written to ${out}`);
