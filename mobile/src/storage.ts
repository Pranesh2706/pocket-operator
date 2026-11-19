// Local persistence so a prepared order, the conversation and history survive the app being
// backgrounded or killed. The server stays the source of truth; this is a cache plus ids.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { ActionStatus, ChatMessage, Order, Proposal } from "./types";

const KEY = "pocket-operator/state/v1";

export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8787"; // 10.0.2.2 = host machine from the Android emulator

export type PersistedState = {
  deviceId: string;
  apiUrl: string;
  /** True only when someone typed a URL in Developer options; otherwise the built-in server is used. */
  apiUrlCustom: boolean;
  sessionId: string | null;
  language: "en-IN" | "ta-IN";
  messages: ChatMessage[];
  proposal: Proposal | null;
  /** Set while a confirm is in flight, so a lost response can be retried after a restart. */
  confirmInFlight: string | null;
  /** Outcome chips for the latest confirm / phone action, e.g. [order_saved, maps_opened]. */
  statuses: ActionStatus[];
  orders: Order[];
};

export function newDeviceId(): string {
  return `dev_${Crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function initialState(): PersistedState {
  return {
    deviceId: newDeviceId(),
    apiUrl: DEFAULT_API_URL,
    apiUrlCustom: false,
    sessionId: null,
    language: "en-IN",
    messages: [],
    proposal: null,
    confirmInFlight: null,
    statuses: [],
    orders: [],
  };
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return initialState();
    const merged: PersistedState = { ...initialState(), ...JSON.parse(raw) };
    // Like a normal app: always use the server built into this APK unless a developer overrode it.
    if (!merged.apiUrlCustom) merged.apiUrl = DEFAULT_API_URL;
    return merged;
  } catch {
    return initialState();
  }
}

export async function saveState(s: PersistedState): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...s, messages: s.messages.slice(-60) }),
    );
  } catch {
    // Storage full or unavailable: the server still holds proposals and orders.
  }
}
