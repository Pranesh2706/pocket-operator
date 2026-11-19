// The real HTTP LLM client against a fake OpenAI-compatible server: request shape, tool-call
// parsing, retries, timeouts, and that the API key is sent only as a header.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createOpenAiCompatibleLlm, LlmError } from "../src/agent/llm.js";
import { startServer, DEVICE } from "./helpers.js";

describe("OpenAI-compatible client", () => {
  let fake;
  let url;
  const seen = [];
  let mode = "normal";
  let hits = 0;

  before(async () => {
    fake = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        hits++;
        const json = JSON.parse(body);
        seen.push({ auth: req.headers.authorization, body: json });
        if (mode === "flaky" && hits === 1) {
          res.writeHead(503).end("busy");
          return;
        }
        if (mode === "slow") return; // never answers -> client timeout
        const lastTool = [...json.messages]
          .reverse()
          .find((m) => m.role === "tool");
        let message;
        if (!lastTool) {
          message = {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "t1",
                type: "function",
                extra_content: { google: { thought_signature: "sig-abc" } },
                function: {
                  name: "search_menu",
                  arguments: '{"diet":"veg","max_price_inr":200}',
                },
              },
            ],
          };
        } else {
          const obs = JSON.parse(lastTool.content);
          message =
            obs.best_item_id && !obs.proposal_id
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "t2",
                      type: "function",
                      function: {
                        name: "prepare_order",
                        arguments: JSON.stringify({
                          item_id: obs.best_item_id,
                          open_directions_after_confirm: true,
                        }),
                      },
                    },
                  ],
                }
              : {
                  role: "assistant",
                  content: `Prepared ${obs.meal} for Rs ${obs.total_inr}. Tap Confirm.`,
                };
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [{ message }],
            usage: { prompt_tokens: 900, completion_tokens: 30 },
          }),
        );
      });
    });
    await new Promise((r) => fake.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${fake.address().port}/v1`;
  });
  after(() => {
    fake.closeAllConnections();
    fake.close();
  });

  test("full agent turn through the real client", async () => {
    mode = "normal";
    const llm = createOpenAiCompatibleLlm({
      baseUrl: url,
      apiKey: "sk-test-secret",
      model: "fake-model",
    });
    const srv = await startServer({ llm });
    try {
      const r = await srv.post("/api/agent/turn", {
        device_id: DEVICE,
        text: "cheapest vegetarian lunch, max 200 rupees",
      });
      assert.equal(r.body.status, "completed");
      assert.equal(
        r.body.reply,
        "Prepared Veg Lunch Box for Rs 160. Tap Confirm.",
      );
      assert.equal(r.body.proposal.item_id, "m4");
      const req = seen.at(-1);
      // Gemini 3 thought signatures must be echoed back on the assistant tool_call.
      const echoed = req.body.messages.find(
        (m) => m.role === "assistant" && m.tool_calls?.[0]?.id === "t1",
      );
      assert.equal(
        echoed.tool_calls[0].extra_content.google.thought_signature,
        "sig-abc",
      );
      assert.equal(req.auth, "Bearer sk-test-secret");
      assert.equal(req.body.model, "fake-model");
      assert.deepEqual(req.body.tools.map((t) => t.function.name).sort(), [
        "get_last_order",
        "open_directions",
        "prepare_order",
        "search_menu",
      ]);
      // Key must never land in the trace database.
      const dump =
        JSON.stringify(srv.db.prepare("SELECT * FROM runs").all()) +
        JSON.stringify(srv.db.prepare("SELECT * FROM tool_calls").all());
      assert.ok(!dump.includes("sk-test-secret"));
      const run = srv.db
        .prepare(
          "SELECT prompt_tokens, completion_tokens, iterations FROM runs WHERE id = ?",
        )
        .get(r.body.run_id);
      assert.deepEqual(
        { ...run },
        { prompt_tokens: 2700, completion_tokens: 90, iterations: 3 },
      );
    } finally {
      await srv.close();
    }
  });

  test("retries once on 503", async () => {
    mode = "flaky";
    hits = 0;
    const llm = createOpenAiCompatibleLlm({
      baseUrl: url,
      apiKey: "k",
      model: "m",
    });
    const out = await llm.chat([{ role: "user", content: "hi" }], []);
    assert.equal(out.tool_calls[0].name, "search_menu");
    assert.equal(hits, 2);
  });

  test("times out with a retryable LlmError", async () => {
    mode = "slow";
    const llm = createOpenAiCompatibleLlm({
      baseUrl: url,
      apiKey: "k",
      model: "m",
      timeoutMs: 150,
      maxRetries: 0,
    });
    await assert.rejects(
      llm.chat([{ role: "user", content: "hi" }], []),
      (e) => e instanceof LlmError && /timed out/.test(e.message),
    );
  });
});
