// Thin typed client for the backend. Every call has a timeout and returns a discriminated
// result instead of throwing, so screens always end in an understandable state.
import type {
  ConfirmChanged,
  ConfirmOk,
  DeviceAction,
  Order,
  Proposal,
  RunTrace,
  TurnResponse,
} from "./types";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; kind: "network"; message: string }
  | {
      ok: false;
      kind: "http";
      status: number;
      code: string;
      message: string;
      body: any;
    };

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl.replace(/\/+$/, "") + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        // Skips ngrok's free-plan browser interstitial when the backend is exposed through a tunnel.
        "ngrok-skip-browser-warning": "true",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (res.ok) return { ok: true, status: res.status, data: body as T };
    return {
      ok: false,
      kind: "http",
      status: res.status,
      code: body?.error ?? "http_error",
      message: body?.message ?? `Server returned HTTP ${res.status}`,
      body,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return {
      ok: false,
      kind: "network",
      message: aborted
        ? "The server took too long to respond."
        : "Could not reach the server. Check the backend URL and your connection.",
    };
  } finally {
    clearTimeout(timer);
  }
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const api = {
  health: (base: string) =>
    request<{ ok: boolean; llm_configured: boolean; model: string | null }>(
      base,
      "/api/health",
      {},
      5000,
    ),

  // Agent turns can take several model round trips, so they get a longer timeout.
  turn: (
    base: string,
    device_id: string,
    session_id: string | null,
    text: string,
  ) =>
    request<TurnResponse>(
      base,
      "/api/agent/turn",
      post({ device_id, session_id, text }),
      60000,
    ),

  getProposal: (base: string, id: string) =>
    request<{
      proposal: Proposal;
      order_id: string | null;
      replacement: Proposal | null;
    }>(base, `/api/proposals/${id}`),

  confirm: (base: string, device_id: string, p: Proposal) =>
    request<ConfirmOk>(
      base,
      `/api/proposals/${p.id}/confirm`,
      post({ device_id, expected_item_id: p.item_id, expected_total: p.total }),
    ),

  cancel: (base: string, device_id: string, id: string) =>
    request<{ proposal: Proposal }>(
      base,
      `/api/proposals/${id}/cancel`,
      post({ device_id }),
    ),

  orders: (base: string, device_id: string) =>
    request<{ orders: Order[] }>(
      base,
      `/api/orders?device_id=${encodeURIComponent(device_id)}`,
    ),

  lastOrder: (base: string, device_id: string) =>
    request<{ order: Order | null; device_action: DeviceAction | null }>(
      base,
      `/api/orders/last?device_id=${encodeURIComponent(device_id)}`,
    ),

  runs: (base: string, device_id: string) =>
    request<{ runs: RunTrace[] }>(
      base,
      `/api/runs?device_id=${encodeURIComponent(device_id)}&limit=15`,
    ),

  reportDeviceAction: (
    base: string,
    device_id: string,
    order_id: string,
    outcome: string,
    detail?: string,
  ) =>
    request<{ ok: true }>(
      base,
      "/api/device-actions",
      post({ device_id, order_id, action: "open_maps", outcome, detail }),
      5000,
    ),
};

export function isProposalChanged(r: ApiResult<unknown>): r is {
  ok: false;
  kind: "http";
  status: 409;
  code: "proposal_changed";
  message: string;
  body: ConfirmChanged;
} {
  return !r.ok && r.kind === "http" && r.code === "proposal_changed";
}
