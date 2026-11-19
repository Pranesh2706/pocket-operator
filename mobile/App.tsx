// Pocket Operator: voice/text assistant that prepares fictional sandbox pickup orders.
// Screen sections: Assistant (chat + review card), History (saved orders), Activity (run traces), Settings.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
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
import { Grad, Input, T } from "./src/ui";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import {
  Bubble,
  Button,
  C,
  Header,
  Icon,
  LockedRecordingBar,
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
import type { IconName, TabKey } from "./src/components";
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
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [st, setSt] = useState<PersistedState | null>(null);
  const stRef = useRef<PersistedState | null>(null);
  const [tab, setTab] = useState<Tab>("assistant");

  // Page transition: content fades in and slides from the side you are moving towards.
  const pageOpacity = useRef(new Animated.Value(1)).current;
  const pageX = useRef(new Animated.Value(0)).current;
  const prevTab = useRef<Tab>("assistant");
  useEffect(() => {
    const order: Tab[] = ["assistant", "history", "activity", "settings"];
    const dir = order.indexOf(tab) >= order.indexOf(prevTab.current) ? 1 : -1;
    if (prevTab.current === tab) return;
    prevTab.current = tab;
    pageOpacity.setValue(0);
    pageX.setValue(dir * 28);
    Animated.parallel([
      Animated.timing(pageOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pageX, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [tab, pageOpacity, pageX]);
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
  const [devOpen, setDevOpen] = useState(false);
  // 7-tap unlock for Developer options.
  const APP_VERSION = "1.0.0";
  const [tapHint, setTapHint] = useState<string | null>(null);
  const taps = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVersionTap = () => {
    const s = stRef.current;
    if (!s) return;
    if (s.devUnlocked) {
      setTapHint("Developer options are already enabled.");
      return;
    }
    taps.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      taps.current = 0;
      setTapHint(null);
    }, 1500);
    const left = 7 - taps.current;
    if (left <= 0) {
      taps.current = 0;
      update((x) => ({ ...x, devUnlocked: true }));
      setDevOpen(true);
      setTapHint("Developer options enabled.");
    } else if (left <= 4) {
      setTapHint(
        `You are ${left} tap${left > 1 ? "s" : ""} away from developer options.`,
      );
    }
  };
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
        pendingDirections: t.proposal ? null : x.pendingDirections,
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
        pendingDirections: device_action ?? null,
      }));
      addMsg({
        role: "system",
        text:
          outcome === "replayed"
            ? `${saved.text} (Already saved earlier; no duplicate created.)`
            : saved.text,
      });
      // Maps does not open automatically: the user taps "Open directions" when ready.
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

  // WhatsApp-style lock: slide the mic up to keep recording without holding.
  const [micLocked, setMicLocked] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  useEffect(() => {
    if (voice.state === "idle") {
      setMicLocked(false);
      setRecSeconds(0);
      return;
    }
    const t0 = Date.now();
    const id = setInterval(
      () => setRecSeconds(Math.floor((Date.now() - t0) / 1000)),
      500,
    );
    return () => clearInterval(id);
  }, [voice.state === "idle"]);

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

  if (!st || !fontsLoaded) {
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
        <Animated.View
          style={{
            flex: 1,
            opacity: pageOpacity,
            transform: [{ translateX: pageX }],
          }}
        >
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
                    {st.pendingDirections ? (
                      <Button
                        icon="navigate"
                        label={`Open directions to ${st.pendingDirections.label}`}
                        accessibilityHint="Opens your Maps app at the restaurant"
                        onPress={() => {
                          const a = st.pendingDirections!;
                          const saved = st.statuses.filter(
                            (x) => x.kind === "order_saved",
                          );
                          update((x) => ({ ...x, pendingDirections: null }));
                          runDeviceAction(a, saved);
                        }}
                      />
                    ) : null}
                  </View>
                }
              />

              {voice.notice ? (
                <View style={styles.notice}>
                  <Icon name="mic-off" size={18} color={C.warn} />
                  <View style={{ flex: 1 }}>
                    <T style={{ color: C.warn, fontSize: 13, lineHeight: 19 }}>
                      {voice.notice.text}
                    </T>
                    {voice.notice.canOpenSettings ? (
                      <Pressable
                        onPress={voice.openSettings}
                        accessibilityRole="link"
                      >
                        <T
                          style={{
                            color: C.info,
                            marginTop: 4,
                            fontWeight: "700",
                          }}
                        >
                          Open app settings ›
                        </T>
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={voice.clearNotice}
                    accessibilityLabel="Dismiss"
                    hitSlop={10}
                  >
                    <Icon name="close" size={18} color={C.warn} />
                  </Pressable>
                </View>
              ) : null}

              {listening && !micLocked ? (
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
                    <T
                      style={{
                        color: C.danger,
                        fontWeight: "800",
                        fontSize: 12,
                        letterSpacing: 0.5,
                      }}
                    >
                      {voice.state === "listening"
                        ? "LISTENING · RELEASE TO STOP · SLIDE UP TO LOCK"
                        : "FINISHING…"}
                    </T>
                    <T style={{ color: C.ink, fontSize: 14 }} numberOfLines={2}>
                      {voice.interim || "Speak now…"}
                    </T>
                  </View>
                </View>
              ) : null}

              <View style={styles.composer}>
                {micLocked && listening ? (
                  <LockedRecordingBar
                    seconds={recSeconds}
                    interim={voice.interim}
                    onCancel={voice.cancel}
                    onStop={voice.stop}
                  />
                ) : (
                  <>
                    <MicButton
                      listening={voice.state === "listening"}
                      locked={micLocked}
                      available={voice.available}
                      disabled={sending}
                      onStart={voice.start}
                      onStop={voice.stop}
                      onLock={() => setMicLocked(true)}
                    />
                    <Input
                      value={input}
                      onChangeText={setInput}
                      placeholder={
                        voice.available
                          ? "Hold mic to talk, or type…"
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
                          opacity:
                            !input.trim() || listening || sending ? 0.4 : 1,
                          transform: [{ scale: pressed ? 0.94 : 1 }],
                        },
                      ]}
                    >
                      {!(!input.trim() || listening || sending) || sending ? (
                        <Grad
                          colors={C.brandGrad}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : null}
                      {sending ? (
                        <ActivityIndicator color={C.onBrand} />
                      ) : (
                        <Icon name="arrow-up" size={22} color={C.onBrand} />
                      )}
                    </Pressable>
                  </>
                )}
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
                  <T style={styles.pageTitle}>Your sandbox orders</T>
                  {listError ? (
                    <T style={{ color: C.warn }}>{listError}</T>
                  ) : null}
                  <StatusChips statuses={st.statuses} />
                </View>
              }
              ListEmptyComponent={
                <Empty
                  icon="receipt-outline"
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
                  <T style={styles.pageTitle}>Activity</T>
                  <T style={{ color: C.muted, fontSize: 13 }}>
                    What the assistant actually did: tools called, validated
                    inputs, outcomes and timing.
                    {listError ? `\n${listError}` : ""}
                  </T>
                </View>
              }
              ListEmptyComponent={
                <Empty
                  icon="pulse-outline"
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
              <T style={styles.pageTitle}>Settings</T>

              <View style={styles.settingsCard}>
                <SettingsTitle icon="language-outline" text="Voice language" />
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
                <T style={{ color: C.muted, fontSize: 12 }}>
                  Tamil is optional and needs the Tamil speech pack on the
                  phone.
                </T>
              </View>

              <View style={styles.settingsCard}>
                <SettingsTitle icon="chatbubbles-outline" text="Conversation" />
                <Button
                  kind="secondary"
                  icon="add-circle-outline"
                  label="Start a new conversation"
                  onPress={() => {
                    update((x) => ({
                      ...x,
                      sessionId: null,
                      messages: [],
                      proposal: null,
                      confirmInFlight: null,
                      statuses: [],
                      pendingDirections: null,
                    }));
                    setTab("assistant");
                  }}
                />
              </View>

              {st.devUnlocked || st.apiUrlCustom ? (
                <View style={styles.settingsCard}>
                  <Pressable
                    onPress={() => setDevOpen((o) => !o)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: devOpen }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <SettingsTitle
                      icon="code-slash-outline"
                      text="Developer options"
                    />
                    <Icon
                      name={devOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={C.muted}
                    />
                  </Pressable>
                  <T style={{ color: C.muted, fontSize: 12 }}>
                    {st.apiUrlCustom
                      ? "Using a custom server"
                      : "Using the built-in server"}{" "}
                    ·{" "}
                    {online
                      ? "connected"
                      : online === false
                        ? "offline"
                        : "checking…"}
                  </T>
                  {devOpen ? (
                    <View style={{ gap: 10, marginTop: 4 }}>
                      <T style={{ fontSize: 13, fontWeight: "700" }}>
                        Backend URL
                      </T>
                      <Input
                        value={urlDraft}
                        onChangeText={setUrlDraft}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        style={styles.urlInput}
                      />
                      <T
                        style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}
                      >
                        Only needed to point the app at your own local backend.
                        {"\n"}Emulator: http://10.0.2.2:8787 · Same Wi-Fi:
                        http://YOUR-PC-IP:8787{"\n"}Built-in: {DEFAULT_API_URL}
                      </T>
                      <Button
                        icon="flash"
                        label="Save and test"
                        onPress={async () => {
                          const url = urlDraft.trim().replace(/\/+$/, "");
                          update((x) => ({
                            ...x,
                            apiUrl: url,
                            apiUrlCustom: url !== DEFAULT_API_URL,
                          }));
                          setHealth("Testing…");
                          const r = await api.health(url);
                          setOnline(r.ok);
                          setHealth(
                            r.ok
                              ? `Connected · model: ${r.data.llm_configured ? r.data.model : "NOT CONFIGURED on server"}`
                              : `Not connected: ${r.message}`,
                          );
                        }}
                      />
                      {st.apiUrlCustom ? (
                        <Button
                          kind="secondary"
                          icon="refresh"
                          label="Use built-in server"
                          onPress={async () => {
                            update((x) => ({
                              ...x,
                              apiUrl: DEFAULT_API_URL,
                              apiUrlCustom: false,
                            }));
                            setUrlDraft(DEFAULT_API_URL);
                            const r = await api.health(DEFAULT_API_URL);
                            setOnline(r.ok);
                            setHealth(
                              r.ok
                                ? "Connected to the built-in server"
                                : `Not connected: ${r.message}`,
                            );
                          }}
                        />
                      ) : null}
                      {health ? (
                        <T style={{ color: C.ink, fontSize: 14 }}>{health}</T>
                      ) : null}
                      <Button
                        kind="ghost"
                        icon="eye-off-outline"
                        label="Hide developer options"
                        onPress={() => {
                          update((x) => ({ ...x, devUnlocked: false }));
                          setDevOpen(false);
                          setTapHint(null);
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Pressable
                onPress={onVersionTap}
                accessibilityRole="button"
                accessibilityLabel={`Version ${APP_VERSION}`}
                style={{ alignItems: "center", paddingVertical: 6 }}
              >
                <T style={{ color: C.muted, fontSize: 13, fontWeight: "600" }}>
                  Version {APP_VERSION}
                </T>
                {tapHint ? (
                  <T style={{ color: C.brand, fontSize: 12, marginTop: 4 }}>
                    {tapHint}
                  </T>
                ) : null}
              </Pressable>

              <T style={{ color: C.muted, fontSize: 11, textAlign: "center" }}>
                Sandbox demo · fictional restaurants · no real orders or
                payments{"\n"}Device id: {st.deviceId}
              </T>
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>

      <TabBar
        tab={tab}
        onChange={setTab}
        badge={st.orders.length || undefined}
      />
    </View>
  );
}

function SettingsTitle({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: C.brandSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={18} color={C.brand} />
      </View>
      <T style={styles.settingsTitle}>{text}</T>
    </View>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <View style={{ alignItems: "center", padding: 32, gap: 6 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 24,
          backgroundColor: C.brandSoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        <Icon name={icon} size={34} color={C.brand} />
      </View>
      <T style={{ fontSize: 17, fontWeight: "700", color: C.ink }}>{title}</T>
      <T
        style={{
          fontSize: 14,
          color: C.muted,
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {text}
      </T>
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
    borderColor: C.danger + "40",
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
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  send: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
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
