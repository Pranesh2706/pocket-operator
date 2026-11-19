// Confirmation approval, stale proposals, duplicate/concurrent confirmation, persistence.
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  startServer,
  prepareViaAgent,
  countOrders,
  scriptedLlm,
  tool,
  say,
  lastObservation,
  DEVICE,
  OTHER_DEVICE,
} from "./helpers.js";
import { openDb, seed } from "../src/db.js";
import { searchMenu } from "../src/catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("sandbox orders", () => {
  let srv;
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());
  beforeEach(async () => {
    await srv.post("/api/dev/reset");
  });

  const confirm = (p, overrides = {}) =>
    srv.post(`/api/proposals/${p.id}/confirm`, {
      device_id: DEVICE,
      expected_item_id: p.item_id,
      expected_total: p.total,
      ...overrides,
    });

  test("seed data: cheapest veg item within an inclusive Rs 200 budget is m4 Veg Lunch Box at Rs 160", () => {
    const { best, matches } = searchMenu(srv.db, {
      diet: "veg",
      max_price: 200,
    });
    assert.equal(best.id, "m4");
    assert.equal(best.price, 160);
    assert.deepEqual(
      matches.map((m) => m.id),
      ["m4", "m1"],
    ); // m3 unavailable, m2/m6 over budget, m5 non-veg
    assert.equal(
      searchMenu(srv.db, { diet: "veg", max_price: 180 }).matches.at(-1).id,
      "m1",
      "budget is inclusive",
    );
  });

  test("price ties are broken by item id", async () => {
    await srv.post("/api/dev/items/m1", { price: 160 });
    assert.equal(
      searchMenu(srv.db, { diet: "veg", max_price: 200 }).best.id,
      "m1",
    );
  });

  describe("approval", () => {
    test("preparing a proposal creates no order; confirm creates exactly one", async () => {
      const turn = await prepareViaAgent(srv);
      assert.equal(turn.proposal.item_id, "m4");
      assert.equal(turn.proposal.total, 160);
      assert.equal(turn.proposal.quantity, 1);
      assert.equal(turn.proposal.status, "pending");
      assert.equal(countOrders(srv.db), 0);

      const r = await confirm(turn.proposal);
      assert.equal(r.status, 201);
      assert.equal(r.body.outcome, "created");
      assert.equal(r.body.order.item_id, "m4");
      assert.equal(r.body.order.total, 160);
      assert.equal(r.body.order.status, "sandbox_confirmed");
      assert.equal(countOrders(srv.db), 1);
    });

    test("cancel leaves zero confirmed orders, and a cancelled proposal cannot be confirmed", async () => {
      const { proposal } = await prepareViaAgent(srv);
      const c = await srv.post(`/api/proposals/${proposal.id}/cancel`, {
        device_id: DEVICE,
      });
      assert.equal(c.status, 200);
      assert.equal(c.body.proposal.status, "cancelled");
      const r = await confirm(proposal);
      assert.equal(r.status, 409);
      assert.equal(r.body.error, "proposal_not_pending");
      assert.equal(countOrders(srv.db), 0);
    });

    test("server rejects confirmation without a valid pending proposal", async () => {
      const r = await srv.post("/api/proposals/prop_doesnotexist/confirm", {
        device_id: DEVICE,
        expected_item_id: "m4",
        expected_total: 160,
      });
      assert.equal(r.status, 404);
      assert.equal(r.body.error, "proposal_not_found");
      assert.equal(countOrders(srv.db), 0);
    });

    test("confirmation must match the exact proposal shown (item and total)", async () => {
      const { proposal } = await prepareViaAgent(srv);
      const wrongTotal = await confirm(proposal, { expected_total: 150 });
      assert.equal(wrongTotal.status, 409);
      assert.equal(wrongTotal.body.error, "proposal_mismatch");
      const wrongItem = await confirm(proposal, { expected_item_id: "m1" });
      assert.equal(wrongItem.body.error, "proposal_mismatch");
      assert.equal(countOrders(srv.db), 0);
    });

    test("a newer proposal supersedes the old one, whose approval can no longer be used", async () => {
      const first = await prepareViaAgent(srv);
      const second = await prepareViaAgent(srv, {
        session_id: first.session_id,
        max: 250,
        text: "actually make it veg under 250",
      });
      assert.notEqual(first.proposal.id, second.proposal.id);
      const r = await confirm(first.proposal);
      assert.equal(r.status, 409);
      assert.equal(r.body.proposal.status, "superseded");
      assert.equal(countOrders(srv.db), 0);
    });

    test("another device cannot confirm my proposal", async () => {
      const { proposal } = await prepareViaAgent(srv);
      const r = await confirm(proposal, { device_id: OTHER_DEVICE });
      assert.equal(r.status, 403);
      assert.equal(countOrders(srv.db), 0);
    });

    test("a deliberately new order (new proposal) creates a second record", async () => {
      const a = await prepareViaAgent(srv);
      assert.equal((await confirm(a.proposal)).status, 201);
      const b = await prepareViaAgent(srv, { session_id: a.session_id });
      assert.equal((await confirm(b.proposal)).status, 201);
      assert.equal(countOrders(srv.db), 2);
    });
  });

  describe("freshness at confirmation", () => {
    test("item became unavailable: no order, next valid option proposed for fresh approval", async () => {
      const { proposal } = await prepareViaAgent(srv);
      await srv.post("/api/dev/items/m4", { available: false });
      const r = await confirm(proposal);
      assert.equal(r.status, 409);
      assert.equal(r.body.error, "proposal_changed");
      assert.match(r.body.reason, /no longer available/);
      assert.equal(r.body.proposal.status, "stale");
      assert.equal(r.body.new_proposal.item_id, "m1");
      assert.equal(r.body.new_proposal.total, 180);
      assert.equal(r.body.new_proposal.status, "pending");
      assert.equal(countOrders(srv.db), 0, "must not silently substitute");

      // Retrying the stale confirm returns the same replacement, not another one.
      const again = await confirm(proposal);
      assert.equal(again.body.new_proposal.id, r.body.new_proposal.id);

      const ok = await confirm(r.body.new_proposal);
      assert.equal(ok.status, 201);
      assert.equal(ok.body.order.item_id, "m1");
      assert.equal(ok.body.order.total, 180);
      assert.equal(countOrders(srv.db), 1);
    });

    test("price changed but still within budget: same item re-proposed at the new total, never charged silently", async () => {
      const { proposal } = await prepareViaAgent(srv);
      await srv.post("/api/dev/items/m4", { price: 170 });
      const r = await confirm(proposal);
      assert.equal(r.status, 409);
      assert.match(r.body.reason, /changed from 160 to 170/);
      assert.equal(r.body.new_proposal.item_id, "m4");
      assert.equal(r.body.new_proposal.total, 170);
      assert.equal(countOrders(srv.db), 0);
    });

    test("price rose above budget: alternative within budget is proposed", async () => {
      const { proposal } = await prepareViaAgent(srv);
      await srv.post("/api/dev/items/m4", { price: 210 });
      const r = await confirm(proposal);
      assert.equal(r.body.new_proposal.item_id, "m1");
    });

    test('freshness keeps the minimum price: m2 drops to Rs 150 (below "above 200") -> next item over 200 is proposed (m6)', async () => {
      srv.setLlm(
        scriptedLlm([
          tool("search_menu", { diet: "veg", min_price_inr: 201 }),
          (m) =>
            tool("prepare_order", {
              item_id: lastObservation(m).best_item_id,
              open_directions_after_confirm: false,
            }),
          say("ok"),
        ]),
      );
      const { proposal } = (
        await srv.post("/api/agent/turn", {
          device_id: DEVICE,
          text: "veg above 200 rupees",
        })
      ).body;
      assert.equal(proposal.item_id, "m2");
      await srv.post("/api/dev/items/m2", { price: 150 });
      const r = await confirm(proposal);
      assert.equal(r.status, 409);
      assert.equal(r.body.new_proposal.item_id, "m6");
      assert.equal(countOrders(srv.db), 0);
    });

    test("nothing matches any more: explained, no new proposal, no order", async () => {
      const { proposal } = await prepareViaAgent(srv);
      await srv.post("/api/dev/items/m4", { available: false });
      await srv.post("/api/dev/items/m1", { available: false });
      const r = await confirm(proposal);
      assert.equal(r.status, 409);
      assert.equal(r.body.new_proposal, null);
      assert.match(r.body.message, /nothing else matches/);
      assert.equal(countOrders(srv.db), 0);
    });

    test("a price change and revert between prepare and confirm still matches (value check, not timestamp)", async () => {
      const { proposal } = await prepareViaAgent(srv);
      await srv.post("/api/dev/items/m4", { price: 999 });
      await srv.post("/api/dev/items/m4", { price: 160 });
      assert.equal((await confirm(proposal)).status, 201);
    });
  });

  describe("duplicate protection", () => {
    test("retry after a lost response returns the same order", async () => {
      const { proposal } = await prepareViaAgent(srv);
      const first = await confirm(proposal);
      const retry = await confirm(proposal);
      assert.equal(first.status, 201);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.outcome, "replayed");
      assert.equal(retry.body.order.id, first.body.order.id);
      assert.equal(countOrders(srv.db), 1);
    });

    test("25 concurrent HTTP confirms of one proposal create exactly one order", async () => {
      const { proposal } = await prepareViaAgent(srv);
      const results = await Promise.all(
        Array.from({ length: 25 }, () => confirm(proposal)),
      );
      const created = results.filter((r) => r.status === 201);
      const replayed = results.filter((r) => r.status === 200);
      assert.equal(created.length, 1);
      assert.equal(replayed.length, 24);
      assert.equal(new Set(results.map((r) => r.body.order.id)).size, 1);
      assert.equal(countOrders(srv.db), 1);
    });

    test("concurrent confirms from 4 separate OS processes on the same database create exactly one order", async () => {
      const { proposal } = await prepareViaAgent(srv);
      const worker = path.join(here, "fixtures", "confirm-worker.js");
      const run = () =>
        new Promise((resolve, reject) => {
          const p = spawn(process.execPath, [
            "--disable-warning=ExperimentalWarning",
            worker,
            srv.dbPath,
            proposal.id,
            DEVICE,
            proposal.item_id,
            String(proposal.total),
          ]);
          let out = "";
          p.stdout.on("data", (d) => (out += d));
          p.stderr.on("data", (d) => (out += d));
          p.on("close", (code) =>
            code === 0 ? resolve(JSON.parse(out)) : reject(new Error(out)),
          );
        });
      const outs = await Promise.all([run(), run(), run(), run()]);
      assert.equal(outs.filter((o) => o.outcome === "created").length, 1);
      assert.equal(new Set(outs.map((o) => o.order_id)).size, 1);
      assert.equal(countOrders(srv.db), 1);
    });
  });

  test("every confirmed order offers directions (the app shows a button; nothing opens by itself)", async () => {
    const { proposal } = await prepareViaAgent(srv, { directions: false });
    const r = await confirm(proposal);
    assert.equal(r.status, 201);
    assert.equal(r.body.device_action.type, "open_maps");
    assert.equal(r.body.directions_requested, false);
  });

  test("device-action reports (Maps opened / failed) never create orders", async () => {
    const { proposal } = await prepareViaAgent(srv);
    const { body } = await confirm(proposal);
    assert.equal(body.device_action.type, "open_maps");
    assert.equal(body.device_action.latitude, 11.02);
    assert.equal(body.device_action.longitude, 76.96);
    for (const outcome of [
      "could_not_open_directions",
      "browser_fallback_opened",
      "maps_opened",
    ]) {
      const r = await srv.post("/api/device-actions", {
        device_id: DEVICE,
        order_id: body.order.id,
        action: "open_maps",
        outcome,
      });
      assert.equal(r.status, 200);
    }
    assert.equal(countOrders(srv.db), 1);
  });

  test("orders, proposals and traces persist across a server restart", async () => {
    const { proposal, run_id } = await prepareViaAgent(srv);
    const { body } = await confirm(proposal);
    const reopened = openDb(srv.dbPath);
    try {
      assert.equal(
        reopened
          .prepare("SELECT COUNT(*) AS n FROM orders WHERE id = ?")
          .get(body.order.id).n,
        1,
      );
      assert.equal(
        reopened
          .prepare("SELECT status FROM proposals WHERE id = ?")
          .get(proposal.id).status,
        "confirmed",
      );
      assert.ok(
        reopened
          .prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE run_id = ?")
          .get(run_id).n >= 2,
      );
    } finally {
      reopened.close();
    }
    const hist = await srv.get(`/api/orders?device_id=${DEVICE}`);
    assert.equal(hist.body.orders.length, 1);
  });

  test("a database from the previous version (no min_price column) is migrated on open", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const p = srv.dbPath + ".old.db";
    const old = new DatabaseSync(p);
    old.exec(
      "CREATE TABLE proposals (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, device_id TEXT NOT NULL, run_id TEXT, item_id TEXT NOT NULL, restaurant_id TEXT NOT NULL, item_name TEXT NOT NULL, restaurant_name TEXT NOT NULL, vegetarian INTEGER NOT NULL, quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL, total INTEGER NOT NULL, currency TEXT NOT NULL, diet TEXT NOT NULL, max_price INTEGER NOT NULL, open_directions INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, status_reason TEXT, replaced_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    old.close();
    const db = openDb(p);
    const cols = db
      .prepare("PRAGMA table_info(proposals)")
      .all()
      .map((c) => c.name);
    db.close();
    assert.ok(cols.includes("min_price"));
  });

  test("reset restores seed data and clears orders", async () => {
    await srv.post("/api/dev/items/m4", { available: false });
    const r = await srv.post("/api/dev/reset");
    assert.equal(r.body.items.find((i) => i.id === "m4").available, true);
    assert.equal(countOrders(srv.db), 0);
    // seed() is also callable directly (used by `npm run reset`)
    seed(srv.db, { wipe: true });
  });
});
