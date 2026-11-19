// Pocket Operator: voice/text assistant that prepares fictional sandbox pickup orders.
// Screen sections: Assistant (chat + review card), History (saved orders), Activity (run traces), Settings.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import { api, isProposalChanged } from "./src/api";
import { openDirections } from "./src/maps";
import {
  DEFAULT_API_URL,
  loadState,
  PersistedState,
  saveState,
} from "./src/storage";
import { useVoice } from "./src/useVoice";
import {
  Bubble,
  Button,
  C,
  Header,
  MicButton,
  OrderRow,
  ProposalCard,
  RunCard,
  StatusChips,
  TabBar,
  TypingIndicator,
  Welcome,
  rupees,
} from "./src/components";
import type { TabKey } from "./src/components";
import type {
  ActionStatus,
  ChatMessage,
  DeviceAction,
  Order,
  Proposal,
  RunTrace,
} from "./src/types";

type Tab = TabKey;

const msgId = () => Crypto.randomUUID();

export default function App() {
  const [st, setSt] = useState<PersistedState | null>(null);
  const stRef = useRef<PersistedState | null>(null);
  const [tab, setTab] = useState<Tab>("assistant");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [runs, setRuns] = useState<RunTrace[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [health, setHealth] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const confirmLock = useRef(false);
  const chatRef = useRef<FlatList<ChatMessage>>(null);

  // ---------- state + persistence ----------
  const update = useCallback((fn: (s: PersistedState) => PersistedState) => {
    setSt((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      stRef.current = next;
      saveState(next);
      return next;
    });
  }, []);

  const addMsg = useCallback(
    (m: Omit<ChatMessage, "id">) =>
      update((s) => ({
        ...s,
        messages: [...s.messages, { id: msgId(), ...m }],
      })),
    [update],
  );

  useEffect(() => {
    loadState().then((loaded) => {
      stRef.current = loaded;
      setSt(loaded);
      setUrlDraft(loaded.apiUrl);
      saveState(loaded); // persists a newly generated device id
    });
  }, []);

  // ---------- phone action ----------
  const runDeviceAction = useCallback(
    async (a: DeviceAction, prefix: ActionStatus[] = []) => {
      const res = await openDirections(a);
      update((s) => ({ ...s, statuses: [...prefix, res.status] }));
      addMsg({ role: "system", text: res.status.text });
      const cur = stRef.current;
      if (cur)
        api.reportDeviceAction(
          cur.apiUrl,
          cur.deviceId,
          a.order_id,
          res.outcome,
          res.detail,
        ); // best effort, never creates orders
    },
    [update, addMsg],
  );

  // ---------- assistant turn ----------
  const send = useCallback(
    async (raw: string) => {
      const s = stRef.current;
      const text = raw.trim();
      if (!s || !text || sending) return;
      setSending(true);
      setInput("");
      addMsg({ role: "user", text });
      const r = await api.turn(s.apiUrl, s.deviceId, s.sessionId, text);
      setSending(false);
      setOnline(r.ok || r.kind === "http");
      if (!r.ok) {
        addMsg({
          role: "system",
          text: `${r.message} Your message was not processed.`,
          retryText: text,
        });
        return;
      }
      const t = r.data;
      update((x) => ({
        ...x,
        sessionId: t.session_id,
        // A new proposal replaces the old card; the server has already invalidated the old one.
        proposal: t.proposal ?? x.proposal,
        confirmInFlight: t.proposal ? null : x.confirmInFlight,
        statuses: t.proposal ? [] : x.statuses,
      }));
      addMsg({
        role: "assistant",
        text: t.reply,
        activity: t.activity,
        latencyMs: t.latency_ms,
        retryText: t.retryable ? text : undefined,
      });
      if (t.device_action) await runDeviceAction(t.device_action);
    },
    [sending, addMsg, update, runDeviceAction],
  );

  // ---------- confirm / cancel ----------
  const confirm = useCallback(async () => {
    const s = stRef.current;
    const p = s?.proposal;
    if (!s || !p || p.status !== "pending" || confirmLock.current) return; // UI guard only; the server enforces uniqueness
    confirmLock.current = true;
    setConfirming(true);
    update((x) => ({ ...x, confirmInFlight: p.id }));
    const r = await api.confirm(s.apiUrl, s.deviceId, p);
    setConfirming(false);
    confirmLock.current = false;

    if (r.ok) {
      const { order, proposal, device_action, outcome } = r.data;
      const saved: ActionStatus = {
        kind: "order_saved",
        text: `Sandbox order saved: ${order.item_name} from ${order.restaurant_name}, ${rupees(order.total)}. Fictional pickup, nothing was paid.`,
      };
      update((x) => ({
        ...x,
        proposal,
        confirmInFlight: null,
        statuses: [saved],
        orders: [order, ...x.orders.filter((o) => o.id !== order.id)],
      }));
      addMsg({
        role: "system",
        text:
          outcome === "replayed"
            ? `${saved.text} (Already saved earlier; no duplicate created.)`
            : saved.text,
      });
      if (device_action) await runDeviceAction(device_action, [saved]);
      return;
    }
    if (isProposalChanged(r)) {
      const b = r.body;
      update((x) => ({
        ...x,
        proposal: b.new_proposal ?? b.proposal,
        confirmInFlight: null,
        statuses: [],
      }));
      addMsg({
        role: "assistant",
        text: b.new_proposal
          ? `${b.message} Nothing was ordered. Please review and confirm again.`
          : `${b.message} Nothing was ordered.`,
      });
      return;
    }
    if (r.kind === "network") {
      // Keep confirmInFlight: the save may have succeeded. Retrying is safe (server returns the same order).
      addMsg({
        role: "system",
        text: `${r.message} Your order may or may not have been saved. Tap “Retry confirm”; it will not create a duplicate.`,
      });
      return;
    }
    // proposal_not_pending / mismatch / not found: re-sync with the server's view.
    update((x) => ({
      ...x,
      confirmInFlight: null,
      proposal: r.body?.proposal ?? x.proposal,
    }));
    addMsg({ role: "system", text: `${r.message} No order was created.` });
  }, [update, addMsg, runDeviceAction]);

  const cancel = useCallback(async () => {
    const s = stRef.current;
    const p = s?.proposal;
    if (!s || !p) return;
    setCancelling(true);
    const r = await api.cancel(s.apiUrl, s.deviceId, p.id);
    setCancelling(false);
    if (r.ok) {
      update((x) => ({
        ...x,
        proposal: r.data.proposal,
        confirmInFlight: null,
        statuses: [],
      }));
      addMsg({
        role: "system",
        text: "Proposal cancelled. No order was placed.",
      });
    } else if (r.kind === "network") {
      addMsg({
        role: "system",
        text: `${r.message} The proposal was not cancelled yet; try again.`,
      });
    } else {
      update((x) => ({ ...x, proposal: r.body?.proposal ?? x.proposal }));
      addMsg({ role: "system", text: r.message });
    }
  }, [update, addMsg]);

  // ---------- sync with server (resume / tab switch) ----------
  const syncProposal = useCallback(async () => {
    const s = stRef.current;
    const p = s?.proposal;
    if (!s || !p || (p.status !== "pending" && !s.confirmInFlight)) return;
    const r = await api.getProposal(s.apiUrl, p.id);
    if (!r.ok) return; // offline: keep the cached card; actions will report errors
    const { proposal, replacement, order_id } = r.data;
    if (proposal.status === "confirmed" && order_id) {
      // A confirm whose response was lost actually succeeded.
      const o = await api.orders(s.apiUrl, s.deviceId);
      const order = o.ok
        ? o.data.orders.find((x) => x.id === order_id)
        : undefined;
      update((x) => ({
        ...x,
        proposal,
        confirmInFlight: null,
        orders: o.ok ? o.data.orders : x.orders,
        statuses: order
          ? [
              {
                kind: "order_saved",
                text: `Sandbox order saved: ${order.item_name}, ${rupees(order.total)}.`,
              },
            ]
          : x.statuses,
      }));
    } else if (proposal.status === "stale" && replacement) {
      update((x) => ({ ...x, proposal: replacement, confirmInFlight: null }));
      addMsg({
        role: "assistant",
        text: `${proposal.status_reason}. Updated proposal: ${replacement.item_name} for ${rupees(replacement.total)}. Please review.`,
      });
    } else {
      update((x) => ({
        ...x,
        proposal,
        confirmInFlight:
          proposal.status === "pending" ? x.confirmInFlight : null,
      }));
    }
  }, [update, addMsg]);

  const loadOrders = useCallback(async () => {
    const s = stRef.current;
    if (!s) return;
    setLoadingList(true);
    const r = await api.orders(s.apiUrl, s.deviceId);
    setLoadingList(false);
    if (r.ok) {
      update((x) => ({ ...x, orders: r.data.orders }));
      setListError(null);
    } else setListError(`${r.message} Showing saved copy.`);
  }, [update]);

  const loadRuns = useCallback(async () => {
    const s = stRef.current;
    if (!s) return;
    setLoadingList(true);
    const r = await api.runs(s.apiUrl, s.deviceId);
    setLoadingList(false);
    if (r.ok) {
      setRuns(r.data.runs);
      setListError(null);
    } else setListError(r.message);
  }, []);

  useEffect(() => {
    if (!st) return;
    if (tab === "history") loadOrders();
    if (tab === "activity") loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, !!st]);

  const ping = useCallback(async () => {
    const s = stRef.current;
    if (!s) return;
    const r = await api.health(s.apiUrl);
    setOnline(r.ok);
  }, []);

  useEffect(() => {
    if (st) {
      syncProposal();
      ping();
    }
    const sub = AppState.addEventListener("change", (a) => {
      if (a === "active") {
        syncProposal();
        ping();
        if (tab === "history") loadOrders();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!st, tab]);

  // ---------- voice ----------
  const voice = useVoice(st?.language ?? "en-IN", (t) =>
    setInput((prev) => (prev ? `${prev} ${t}` : t)),
  );

  const directionsForOrder = useCallback(
    (o: Order) =>
      runDeviceAction({
        type: "open_maps",
        order_id: o.id,
        latitude: o.latitude,
        longitude: o.longitude,
        label: o.restaurant_name,
      }),
    [runDeviceAction],
  );

  if (!st) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.bg,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  const topPad =
    Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 44;
  const listening = voice.state !== "idle";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ExpoStatusBar style="light" />
      <Header topPad={topPad} online={online} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {tab === "assistant" && (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={chatRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
              data={st.messages}
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() =>
                chatRef.current?.scrollToEnd({ animated: true })
              }
              ListEmptyComponent={<Welcome onPick={(t) => setInput(t)} />}
              renderItem={({ item }) => (
                <Bubble m={item} onRetry={send} busy={sending} />
              )}
              ListFooterComponent={
                <View style={{ gap: 12, marginTop: 6 }}>
                  {sending ? (
                    <TypingIndicator text="Searching the sandbox menu…" />
                  ) : null}
                  {st.proposal ? (
                    <ProposalCard
                      proposal={st.proposal}
                      confirmInFlight={st.confirmInFlight === st.proposal.id}
                      confirming={confirming}
                      cancelling={cancelling}
                      onConfirm={confirm}
                      onCancel={cancel}
                    />
                  ) : null}
                  <StatusChips statuses={st.statuses} />
                </View>
              }
            />

            {voice.notice ? (
              <View style={styles.notice}>
                <Text style={{ fontSize: 16 }}>🎙️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.warn, fontSize: 13, lineHeight: 19 }}>
                    {voice.notice.text}
                  </Text>
                  {voice.notice.canOpenSettings ? (
                    <Pressable
                      onPress={voice.openSettings}
                      accessibilityRole="link"
                    >
                      <Text
                        style={{
                          color: C.info,
                          marginTop: 4,
                          fontWeight: "700",
                        }}
                      >
                        Open app settings ›
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  onPress={voice.clearNotice}
                  accessibilityLabel="Dismiss"
                  hitSlop={10}
                >
                  <Text style={{ color: C.warn, fontSize: 16 }}>✕</Text>
                </Pressable>
              </View>
            ) : null}

            {listening ? (
              <View
                style={styles.recording}
                accessibilityLiveRegion="assertive"
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: C.danger,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: C.danger,
                      fontWeight: "800",
                      fontSize: 12,
                      letterSpacing: 0.5,
                    }}
                  >
                    {voice.state === "listening"
                      ? "LISTENING · RELEASE TO STOP"
                      : "FINISHING…"}
                  </Text>
                  <Text
                    style={{ color: C.ink, fontSize: 14 }}
                    numberOfLines={2}
                  >
                    {voice.interim || "Speak now…"}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.composer}>
              <MicButton
                listening={voice.state === "listening"}
                available={voice.available}
                disabled={sending}
                onPressIn={voice.start}
                onPressOut={voice.stop}
              />
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={
                  voice.available
                    ? "Hold 🎤 to talk, or type…"
                    : "Type your request…"
                }
                placeholderTextColor={C.muted}
                multiline
                accessibilityLabel="Request text. Voice transcripts appear here for review before sending."
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                onPress={() => send(input)}
                disabled={!input.trim() || listening || sending}
                style={({ pressed }) => [
                  styles.send,
                  {
                    opacity: !input.trim() || listening || sending ? 0.4 : 1,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  },
                ]}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}
                  >
                    ➤
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {tab === "history" && (
          <FlatList
            contentContainerStyle={{ padding: 14, gap: 12 }}
            data={st.orders}
            keyExtractor={(o) => o.id}
            refreshing={loadingList}
            onRefresh={loadOrders}
            ListHeaderComponent={
              <View style={{ gap: 10 }}>
                <Text style={styles.pageTitle}>Your sandbox orders</Text>
                {listError ? (
                  <Text style={{ color: C.warn }}>{listError}</Text>
                ) : null}
                <StatusChips statuses={st.statuses} />
              </View>
            }
            ListEmptyComponent={
              <Empty
                icon="🧾"
                title="No orders yet"
                text="Confirmed sandbox orders will appear here and stay after you close the app."
              />
            }
            renderItem={({ item }) => (
              <OrderRow
                o={item}
                onDirections={() => directionsForOrder(item)}
              />
            )}
          />
        )}

        {tab === "activity" && (
          <FlatList
            contentContainerStyle={{ padding: 14, gap: 12 }}
            data={runs}
            keyExtractor={(r) => r.id}
            refreshing={loadingList}
            onRefresh={loadRuns}
            ListHeaderComponent={
              <View style={{ gap: 4 }}>
                <Text style={styles.pageTitle}>Activity</Text>
                <Text style={{ color: C.muted, fontSize: 13 }}>
                  What the assistant actually did: tools called, validated
                  inputs, outcomes and timing.
                  {listError ? `\n${listError}` : ""}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <Empty
                icon="📊"
                title="No activity yet"
                text="Ask the assistant something and each step will show up here."
              />
            }
            renderItem={({ item }) => (
              <RunCard
                r={item}
                onShare={() =>
                  Share.share({
                    title: `Run ${item.id}`,
                    message: JSON.stringify(item, null, 2),
                  })
                }
              />
            )}
          />
        )}

        {tab === "settings" && (
          <ScrollView
            contentContainerStyle={{ padding: 14, gap: 14 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.pageTitle}>Settings</Text>

            <View style={styles.settingsCard}>
              <Text style={styles.settingsTitle}>🔌 Backend server</Text>
              <TextInput
                value={urlDraft}
                onChangeText={setUrlDraft}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.urlInput}
              />
              <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
                Emulator: http://10.0.2.2:8787{"\n"}Phone on same Wi-Fi:
                http://YOUR-PC-IP:8787{"\n"}Build default: {DEFAULT_API_URL}
              </Text>
              <Button
                icon="⚡"
                label="Save and test connection"
                onPress={async () => {
                  const url = urlDraft.trim().replace(/\/+$/, "");
                  update((x) => ({ ...x, apiUrl: url }));
                  setHealth("Testing…");
                  const r = await api.health(url);
                  setOnline(r.ok);
                  setHealth(
                    r.ok
                      ? `✅ Connected · model: ${r.data.llm_configured ? r.data.model : "NOT CONFIGURED on server"}`
                      : `❌ ${r.message}`,
                  );
                }}
              />
              {health ? (
                <Text style={{ color: C.ink, fontSize: 14 }}>{health}</Text>
              ) : null}
            </View>

            <View style={styles.settingsCard}>
              <Text style={styles.settingsTitle}>🗣️ Voice language</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["en-IN", "ta-IN"] as const).map((l) => (
                  <View key={l} style={{ flex: 1 }}>
                    <Button
                      kind={st.language === l ? "primary" : "secondary"}
                      label={l === "en-IN" ? "English" : "தமிழ்"}
                      onPress={() => update((x) => ({ ...x, language: l }))}
                    />
                  </View>
                ))}
              </View>
              <Text style={{ color: C.muted, fontSize: 12 }}>
                Tamil is optional and needs the Tamil speech pack on the phone.
              </Text>
            </View>

            <View style={styles.settingsCard}>
              <Text style={styles.settingsTitle}>💬 Conversation</Text>
              <Button
                kind="secondary"
                icon="✨"
                label="Start a new conversation"
                onPress={() => {
                  update((x) => ({
                    ...x,
                    sessionId: null,
                    messages: [],
                    proposal: null,
                    confirmInFlight: null,
                    statuses: [],
                  }));
                  setTab("assistant");
                }}
              />
            </View>

            <Text style={{ color: C.muted, fontSize: 11, textAlign: "center" }}>
              Sandbox demo · fictional restaurants · no real orders or payments
              {"\n"}Device id: {st.deviceId}
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <TabBar
        tab={tab}
        onChange={setTab}
        badge={st.orders.length || undefined}
      />
    </View>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <View style={{ alignItems: "center", padding: 32, gap: 6 }}>
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <Text style={{ fontSize: 17, fontWeight: "700", color: C.ink }}>
        {title}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: C.muted,
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.warnSoft,
  },
  recording: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.dangerSoft,
    borderWidth: 1,
    borderColor: "#F3C5C0",
  },
  composer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 120,
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  send: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  pageTitle: { fontSize: 22, fontWeight: "800", color: C.ink, marginBottom: 2 },
  settingsCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    gap: 10,
  },
  settingsTitle: { fontSize: 15, fontWeight: "800", color: C.ink },
  urlInput: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    backgroundColor: C.bg,
    color: C.ink,
  },
});
