// HTTP API. See README.md for the route summary.
import express from 'express';
import { z } from 'zod';
import { seed } from './db.js';
import { listItems, updateItem } from './catalog.js';
import { ApiError, confirmProposal, cancelProposal, getProposal, listOrders, getLastOrder, getOrder } from './orders.js';
import { startRun, logToolCall, finishRun, getRunTrace, listRuns } from './trace.js';
import { runAgentTurn, LIMITS } from './agent/runner.js';

const deviceId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'device_id must be 8-64 url-safe characters');

const schemas = {
  turn: z.strictObject({
    device_id: deviceId,
    session_id: z.string().max(64).nullish(),
    text: z.string().trim().min(1, 'text is empty').max(LIMITS.maxInputChars),
  }),
  confirm: z.strictObject({
    device_id: deviceId,
    expected_item_id: z.string().max(40),
    expected_total: z.number().int().nonnegative(),
  }),
  cancel: z.strictObject({ device_id: deviceId }),
  deviceAction: z.strictObject({
    device_id: deviceId,
    order_id: z.string().max(64),
    action: z.literal('open_maps'),
    outcome: z.enum(['maps_opened', 'browser_fallback_opened', 'could_not_open_directions']),
    detail: z.string().max(200).optional(),
  }),
  devItem: z.strictObject({
    price: z.number().int().nonnegative().optional(),
    available: z.boolean().optional(),
  }),
};

function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new ApiError(400, 'invalid_request', z.prettifyError(r.error));
  return r.data;
}

function directionsAction(order) {
  return { type: 'open_maps', order_id: order.id, latitude: order.latitude, longitude: order.longitude, label: order.restaurant_name };
}

export function createApp({ db, llm, devRoutes = true, catalogPath } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // Minimal request log: method, path, status, duration. Bodies are never logged.
  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV !== 'test') console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`);
    });
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, llm_configured: Boolean(llm), model: llm?.model ?? null, time: new Date().toISOString() });
  });

  app.get('/api/catalog', (req, res) => res.json({ items: listItems(db) }));

  // One user turn of the assistant (text from the keyboard or from on-device speech recognition).
  app.post('/api/agent/turn', async (req, res) => {
    const body = parse(schemas.turn, req.body);
    const out = await runAgentTurn({ db, llm, device_id: body.device_id, session_id: body.session_id, text: body.text });
    res.json(out);
  });

  app.get('/api/proposals/:id', (req, res) => {
    const p = getProposal(db, req.params.id);
    if (!p) throw new ApiError(404, 'proposal_not_found', 'Proposal not found.');
    const order = p.status === 'confirmed' ? db.prepare('SELECT id FROM orders WHERE proposal_id = ?').get(p.id) : null;
    res.json({ proposal: p, order_id: order?.id ?? null, replacement: p.replaced_by ? getProposal(db, p.replaced_by) : null });
  });

  // The ONLY way an order is created: an explicit user tap on a specific pending proposal.
  app.post('/api/proposals/:id/confirm', (req, res) => {
    const body = parse(schemas.confirm, req.body);
    const run = startRun(db, { kind: 'confirm', device_id: body.device_id, session_id: getProposal(db, req.params.id)?.session_id ?? null });
    const input = { proposal_id: req.params.id, expected_item_id: body.expected_item_id, expected_total: body.expected_total };
    let result;
    try {
      result = confirmProposal(db, req.params.id, {
        device_id: body.device_id,
        expected_item_id: body.expected_item_id,
        expected_total: body.expected_total,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        logToolCall(db, run, { tool: 'confirm_order', input, status: 'rejected', decision: err.message, outcome: { error: err.code } });
        finishRun(db, run, { status: 'rejected', summary: err.message, error: err.code });
      }
      throw err;
    }
    if (result.outcome === 'changed') {
      const decision = result.new_proposal
        ? `Not confirmed: ${result.reason}. New proposal ${result.new_proposal.id} (${result.new_proposal.item_name}, Rs ${result.new_proposal.total}) needs fresh approval`
        : `Not confirmed: ${result.reason}. Nothing else matches the constraints`;
      logToolCall(db, run, { tool: 'confirm_order', input, status: 'rejected', decision, outcome: { error: 'proposal_changed', new_proposal_id: result.new_proposal?.id ?? null } });
      finishRun(db, run, { status: 'proposal_changed', summary: decision });
      return res.status(409).json({
        error: 'proposal_changed',
        message: result.new_proposal
          ? `${capitalize(result.reason)}. Please review the updated proposal: ${result.new_proposal.item_name} at ${result.new_proposal.restaurant_name} for Rs ${result.new_proposal.total}.`
          : `${capitalize(result.reason)}, and nothing else matches your budget and preference.`,
        reason: result.reason,
        proposal: result.proposal,
        new_proposal: result.new_proposal,
        run_id: run.id,
      });
    }
    const { order, proposal } = result;
    const decision =
      result.outcome === 'replayed'
        ? `Retry of an already-confirmed proposal: returned existing order ${order.id}`
        : `Sandbox order saved: ${order.id} (${order.item_name}, Rs ${order.total})`;
    logToolCall(db, run, { tool: 'confirm_order', input, status: 'ok', decision, outcome: { order_id: order.id, replayed: result.outcome === 'replayed' } });
    finishRun(db, run, { status: 'completed', summary: decision });
    res.status(result.outcome === 'created' ? 201 : 200).json({
      outcome: result.outcome,
      order,
      proposal,
      // The server decides whether a device action is allowed; the app only executes it.
      device_action: proposal.open_directions_after_confirm ? directionsAction(order) : null,
      run_id: run.id,
    });
  });

  app.post('/api/proposals/:id/cancel', (req, res) => {
    const body = parse(schemas.cancel, req.body);
    const p = cancelProposal(db, req.params.id, { device_id: body.device_id });
    const run = startRun(db, { kind: 'cancel', device_id: body.device_id, session_id: p.session_id });
    logToolCall(db, run, { tool: 'cancel_proposal', input: { proposal_id: p.id }, status: 'ok', decision: `Proposal ${p.id} cancelled; no order created` });
    finishRun(db, run, { status: 'completed', summary: 'cancelled' });
    res.json({ proposal: p });
  });

  app.get('/api/orders', (req, res) => {
    const device = parse(deviceId, req.query.device_id);
    res.json({ orders: listOrders(db, device) });
  });

  app.get('/api/orders/last', (req, res) => {
    const device = parse(deviceId, req.query.device_id);
    const order = getLastOrder(db, device);
    res.json({ order, device_action: order ? directionsAction(order) : null });
  });

  // The phone reports what happened when it tried the Maps handoff. This never creates orders.
  app.post('/api/device-actions', (req, res) => {
    const body = parse(schemas.deviceAction, req.body);
    const order = getOrder(db, body.order_id);
    const run = startRun(db, { kind: 'device_action', device_id: body.device_id, session_id: null });
    const labels = {
      maps_opened: 'Maps opened',
      browser_fallback_opened: 'Browser fallback opened',
      could_not_open_directions: 'Could not open directions',
    };
    logToolCall(db, run, {
      tool: 'open_directions',
      input: { order_id: body.order_id },
      status: body.outcome === 'could_not_open_directions' ? 'error' : 'ok',
      decision: `${labels[body.outcome]}${order ? ` for ${order.restaurant_name}` : ''}${body.detail ? ` (${body.detail})` : ''}`,
      outcome: { outcome: body.outcome },
    });
    finishRun(db, run, { status: 'completed', summary: labels[body.outcome] });
    res.json({ ok: true, run_id: run.id });
  });

  app.get('/api/runs', (req, res) => {
    const device = parse(deviceId, req.query.device_id);
    res.json({ runs: listRuns(db, { device_id: device, limit: Number(req.query.limit ?? 20) }) });
  });

  app.get('/api/runs/:id', (req, res) => {
    const trace = getRunTrace(db, req.params.id);
    if (!trace) throw new ApiError(404, 'run_not_found', 'Run not found.');
    res.json(trace);
  });

  if (devRoutes) {
    // Development-only evaluation hooks. Disabled when DEV_ROUTES=0 (production would need auth).
    app.get('/api/dev/items', (req, res) => res.json({ items: listItems(db) }));
    app.post('/api/dev/items/:id', (req, res) => {
      const body = parse(schemas.devItem, req.body);
      const item = updateItem(db, req.params.id, body);
      if (!item) throw new ApiError(404, 'item_not_found', 'Item not found.');
      res.json({ item });
    });
    app.post('/api/dev/reset', (req, res) => {
      seed(db, { wipe: true, ...(catalogPath ? { catalogPath } : {}) });
      res.json({ ok: true, items: listItems(db) });
    });
  }

  app.use((req, res) => res.status(404).json({ error: 'not_found', message: `No route ${req.method} ${req.path}` }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON.' });
    console.error('Unhandled error:', process.env.NODE_ENV === 'test' ? err : err?.message);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong on the server. Please retry.' });
  });

  return app;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
