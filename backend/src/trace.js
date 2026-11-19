// Run / tool-call trace. Stores observable actions and short code-generated decision
// summaries only: never API keys, never audio, never hidden model reasoning.
import crypto from 'node:crypto';
import { nowIso } from './db.js';

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function startRun(db, { kind, session_id = null, device_id = null, user_text = null, model = null }) {
  const run = { id: newId('run'), kind, started_at: nowIso(), t0: Date.now() };
  db.prepare(
    `INSERT INTO runs (id, kind, session_id, device_id, user_text, status, model, started_at)
     VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`
  ).run(run.id, kind, session_id, device_id, user_text, model, run.started_at);
  run.seq = 0;
  return run;
}

export function logToolCall(db, run, { tool, input, status, decision, outcome, started_at }) {
  run.seq += 1;
  db.prepare(
    `INSERT INTO tool_calls (run_id, seq, tool, input_json, status, decision, outcome_json, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    run.id,
    run.seq,
    tool,
    input === undefined ? null : JSON.stringify(input),
    status,
    decision ?? null,
    outcome === undefined ? null : JSON.stringify(outcome),
    started_at ?? nowIso(),
    nowIso()
  );
}

export function finishRun(db, run, { status, summary = null, error = null, iterations = 0, usage = null }) {
  db.prepare(
    `UPDATE runs SET status = ?, summary = ?, error = ?, iterations = ?, prompt_tokens = ?, completion_tokens = ?,
       finished_at = ?, latency_ms = ? WHERE id = ?`
  ).run(
    status,
    summary,
    error,
    iterations,
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    nowIso(),
    Date.now() - run.t0,
    run.id
  );
}

export function getRunTrace(db, runId) {
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
  if (!run) return null;
  const steps = db
    .prepare('SELECT seq, tool, input_json, status, decision, outcome_json, started_at, finished_at FROM tool_calls WHERE run_id = ? ORDER BY seq')
    .all(runId)
    .map((s) => ({
      seq: s.seq,
      tool: s.tool,
      input: s.input_json ? JSON.parse(s.input_json) : null,
      status: s.status,
      decision: s.decision,
      outcome: s.outcome_json ? JSON.parse(s.outcome_json) : null,
      started_at: s.started_at,
      finished_at: s.finished_at,
    }));
  return { ...run, steps };
}

export function listRuns(db, { device_id, limit = 20 }) {
  const rows = db
    .prepare('SELECT id FROM runs WHERE device_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?')
    .all(device_id, Math.min(Math.max(limit, 1), 100));
  return rows.map((r) => getRunTrace(db, r.id));
}
