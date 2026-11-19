// Minimal OpenAI-compatible chat-completions client with tool calling.
// Works with Google Gemini (OpenAI-compatible endpoint), OpenAI, Groq, OpenRouter, a local
// Ollama/LM Studio server, etc. The API key stays on the backend and is never logged.

export class LlmError extends Error {
  constructor(message, { retryable = false, status = null } = {}) {
    super(message);
    this.retryable = retryable;
    this.status = status;
  }
}

export function createOpenAiCompatibleLlm({
  baseUrl,
  apiKey,
  model,
  timeoutMs = 20000,
  maxRetries = 1,
  reasoningEffort = null,
}) {
  if (!baseUrl || !model)
    throw new Error("LLM_BASE_URL and LLM_MODEL are required");
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";

  async function once(messages, tools) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0,
          // Optional; only sent when configured (e.g. Gemini 2.5 accepts none/low/medium/high).
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut =
        err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new LlmError(
        timedOut
          ? `model timed out after ${timeoutMs} ms`
          : `model request failed: ${err.message}`,
        { retryable: true },
      );
    }
    if (!res.ok) {
      // Read a short snippet of the error body for diagnosis; never echo request headers.
      const body = (await res.text().catch(() => "")).slice(0, 300);
      throw new LlmError(`model HTTP ${res.status}: ${body}`, {
        status: res.status,
        retryable: res.status === 429 || res.status >= 500,
      });
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg)
      throw new LlmError("model returned no message", { retryable: true });
    return {
      content: typeof msg.content === "string" ? msg.content : null,
      tool_calls: (msg.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments ?? "{}",
        // Provider-specific extras (e.g. Gemini 3 "extra_content.google.thought_signature") must be
        // sent back unchanged on the next request, or multi-step tool calling fails.
        extra: Object.fromEntries(
          Object.entries(tc).filter(
            ([k]) => !["id", "type", "function", "index"].includes(k),
          ),
        ),
      })),
      usage: {
        prompt_tokens: data?.usage?.prompt_tokens ?? 0,
        completion_tokens: data?.usage?.completion_tokens ?? 0,
      },
    };
  }

  return {
    model,
    async chat(messages, tools) {
      let lastErr;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await once(messages, tools);
        } catch (err) {
          lastErr = err;
          if (
            !(err instanceof LlmError) ||
            !err.retryable ||
            attempt === maxRetries
          )
            break;
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      throw lastErr;
    },
  };
}

export function llmFromEnv(env = process.env) {
  if (!env.LLM_BASE_URL || !env.LLM_MODEL) return null;
  return createOpenAiCompatibleLlm({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    timeoutMs: Number(env.LLM_TIMEOUT_MS ?? 20000),
    reasoningEffort: env.LLM_REASONING_EFFORT || null,
  });
}
