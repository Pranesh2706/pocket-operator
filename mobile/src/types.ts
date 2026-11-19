// Shapes returned by the backend (see backend/src/app.js).

export type Proposal = {
  id: string;
  session_id: string;
  item_id: string;
  item_name: string;
  restaurant_id: string;
  restaurant_name: string;
  vegetarian: boolean;
  quantity: number;
  unit_price: number;
  total: number;
  currency: string;
  constraints: { diet: string; max_price: number };
  open_directions_after_confirm: boolean;
  status: 'pending' | 'confirmed' | 'cancelled' | 'superseded' | 'stale';
  status_reason: string | null;
  replaced_by: string | null;
  label: string;
  created_at: string;
};

export type Order = {
  id: string;
  proposal_id: string;
  item_id: string;
  item_name: string;
  restaurant_name: string;
  latitude: number;
  longitude: number;
  quantity: number;
  total: number;
  currency: string;
  fulfilment: string;
  status: string;
  created_at: string;
};

export type DeviceAction = {
  type: 'open_maps';
  order_id: string;
  latitude: number;
  longitude: number;
  label: string;
};

export type ActivityStep = { tool: string; status: 'ok' | 'rejected' | 'error'; decision: string | null };

export type TurnResponse = {
  run_id: string;
  session_id: string;
  status: 'completed' | 'llm_error' | 'llm_unavailable' | 'iteration_limit' | 'timeout';
  reply: string;
  retryable: boolean;
  proposal: Proposal | null;
  device_action: DeviceAction | null;
  activity: ActivityStep[];
  latency_ms: number;
};

export type ConfirmOk = {
  outcome: 'created' | 'replayed';
  order: Order;
  proposal: Proposal;
  device_action: DeviceAction | null;
  run_id: string;
};

export type ConfirmChanged = {
  error: 'proposal_changed';
  message: string;
  reason: string;
  proposal: Proposal;
  new_proposal: Proposal | null;
};

export type RunTrace = {
  id: string;
  kind: string;
  user_text: string | null;
  status: string;
  summary: string | null;
  model: string | null;
  iterations: number;
  prompt_tokens: number;
  completion_tokens: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  latency_ms: number | null;
  steps: {
    seq: number;
    tool: string;
    input: unknown;
    status: string;
    decision: string | null;
    outcome: unknown;
    started_at: string;
    finished_at: string;
  }[];
};

/** What the user sees after a phone action; the four states the brief asks us to distinguish. */
export type ActionStatus =
  | { kind: 'order_saved'; text: string }
  | { kind: 'maps_opened'; text: string }
  | { kind: 'browser_fallback_opened'; text: string }
  | { kind: 'could_not_open_directions'; text: string };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** Present on failed turns: lets the user resend the same text. */
  retryText?: string;
  activity?: ActivityStep[];
  latencyMs?: number;
};
