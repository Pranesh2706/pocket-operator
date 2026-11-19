// Pocket Operator: voice/text assistant that prepares fictional sandbox pickup orders.
// Screen sections: Assistant (chat + review card), History (saved orders), Activity (run traces), Settings.
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import { api, isProposalChanged } from './src/api';
import { openDirections } from './src/maps';
import { DEFAULT_API_URL, loadState, PersistedState, saveState } from './src/storage';
import { useVoice } from './src/useVoice';
import { Bubble, Button, C, OrderRow, ProposalCard, RunCard, StatusChips, rupees } from './src/components';
import type { ActionStatus, ChatMessage, DeviceAction, Order, Proposal, RunTrace } from './src/types';

type Tab = 'assistant' | 'history' | 'activity' | 'settings';

const msgId = () => Crypto.randomUUID();

export default function App() {
  const [st, setSt] = useState<PersistedState | null>(null);
  const stRef = useRef<PersistedState | null>(null);
  const [tab, setTab] = useState<Tab>('assistant');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [runs, setRuns] = useState<RunTrace[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [health, setHealth] = useState<string | null>(null);
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
    (m: Omit<ChatMessage, 'id'>) => update((s) => ({ ...s, messages: [...s.messages, { id: msgId(), ...m }] })),
    [update]
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
      addMsg({ role: 'system', text: res.status.text });
      const cur = stRef.current;
      if (cur) api.reportDeviceAction(cur.apiUrl, cur.deviceId, a.order_id, res.outcome, res.detail); // best effort, never creates orders
    },
    [update, addMsg]
  );

  // ---------- assistant turn ----------
  const send = useCallback(
    async (raw: string) => {
      const s = stRef.current;
      const text = raw.trim();
      if (!s || !text || sending) return;
      setSending(true);
      setInput('');
      addMsg({ role: 'user', text });
      const r = await api.turn(s.apiUrl, s.deviceId, s.sessionId, text);
      setSending(false);
      if (!r.ok) {
        addMsg({ role: 'system', text: `${r.message} Your message was not processed.`, retryText: text });
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
        role: 'assistant',
        text: t.reply,
        activity: t.activity,
        latencyMs: t.latency_ms,
        retryText: t.retryable ? text : undefined,
      });
      if (t.device_action) await runDeviceAction(t.device_action);
    },
    [sending, addMsg, update, runDeviceAction]
  );

  // ---------- confirm / cancel ----------
  const confirm = useCallback(async () => {
    const s = stRef.current;
    const p = s?.proposal;
    if (!s || !p || p.status !== 'pending' || confirmLock.current) return; // UI guard only; the server enforces uniqueness
    confirmLock.current = true;
    setConfirming(true);
    update((x) => ({ ...x, confirmInFlight: p.id }));
    const r = await api.confirm(s.apiUrl, s.deviceId, p);
    setConfirming(false);
    confirmLock.current = false;

    if (r.ok) {
      const { order, proposal, device_action, outcome } = r.data;
      const saved: ActionStatus = {
        kind: 'order_saved',
        text: `Sandbox order saved: ${order.item_name} from ${order.restaurant_name}, ${rupees(order.total)}. Fictional pickup, nothing was paid.`,
      };
      update((x) => ({
        ...x,
        proposal,
        confirmInFlight: null,
        statuses: [saved],
        orders: [order, ...x.orders.filter((o) => o.id !== order.id)],
      }));
      addMsg({ role: 'system', text: outcome === 'replayed' ? `${saved.text} (Already saved earlier; no duplicate created.)` : saved.text });
      if (device_action) await runDeviceAction(device_action, [saved]);
      return;
    }
    if (isProposalChanged(r)) {
      const b = r.body;
      update((x) => ({ ...x, proposal: b.new_proposal ?? b.proposal, confirmInFlight: null, statuses: [] }));
      addMsg({
        role: 'assistant',
        text: b.new_proposal ? `${b.message} Nothing was ordered. Please review and confirm again.` : `${b.message} Nothing was ordered.`,
      });
      return;
    }
    if (r.kind === 'network') {
      // Keep confirmInFlight: the save may have succeeded. Retrying is safe (server returns the same order).
      addMsg({ role: 'system', text: `${r.message} Your order may or may not have been saved. Tap “Retry confirm”; it will not create a duplicate.` });
      return;
    }
    // proposal_not_pending / mismatch / not found: re-sync with the server's view.
    update((x) => ({ ...x, confirmInFlight: null, proposal: r.body?.proposal ?? x.proposal }));
    addMsg({ role: 'system', text: `${r.message} No order was created.` });
  }, [update, addMsg, runDeviceAction]);

  const cancel = useCallback(async () => {
    const s = stRef.current;
    const p = s?.proposal;
    if (!s || !p) return;
    setCancelling(true);
    const r = await api.cancel(s.apiUrl, s.deviceId, p.id);
    setCancelling(false);
    if (r.ok) {
      update((x) => ({ ...x, proposal: r.data.proposal, confirmInFlight: null, statuses: [] }));
      addMsg({ role: 'system', text: 'Proposal cancelled. No order was placed.' });
    } else if (r.kind === 'network') {
      addMsg({ role: 'system', text: `${r.message} The proposal was not cancelled yet; try again.` });
    } else {
      update((x) => ({ ...x, proposal: r.body?.proposal ?? x.proposal }));
      addMsg({ role: 'system', text: r.message });
    }
  }, [update, addMsg]);

  // ---------- sync with server (resume / tab switch) ----------
  const syncProposal = useCallback(async () => {
    const s = stRef.current;
    const p = s?.proposal;
    if (!s || !p || (p.status !== 'pending' && !s.confirmInFlight)) return;
    const r = await api.getProposal(s.apiUrl, p.id);
    if (!r.ok) return; // offline: keep the cached card; actions will report errors
    const { proposal, replacement, order_id } = r.data;
    if (proposal.status === 'confirmed' && order_id) {
      // A confirm whose response was lost actually succeeded.
      const o = await api.orders(s.apiUrl, s.deviceId);
      const order = o.ok ? o.data.orders.find((x) => x.id === order_id) : undefined;
      update((x) => ({
        ...x,
        proposal,
        confirmInFlight: null,
        orders: o.ok ? o.data.orders : x.orders,
        statuses: order ? [{ kind: 'order_saved', text: `Sandbox order saved: ${order.item_name}, ${rupees(order.total)}.` }] : x.statuses,
      }));
    } else if (proposal.status === 'stale' && replacement) {
      update((x) => ({ ...x, proposal: replacement, confirmInFlight: null }));
      addMsg({ role: 'assistant', text: `${proposal.status_reason}. Updated proposal: ${replacement.item_name} for ${rupees(replacement.total)}. Please review.` });
    } else {
      update((x) => ({ ...x, proposal, confirmInFlight: proposal.status === 'pending' ? x.confirmInFlight : null }));
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
    if (tab === 'history') loadOrders();
    if (tab === 'activity') loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, !!st]);

  useEffect(() => {
    if (st) syncProposal();
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') {
        syncProposal();
        if (tab === 'history') loadOrders();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!st, tab]);

  // ---------- voice ----------
  const voice = useVoice(st?.language ?? 'en-IN', (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)));

  const directionsForOrder = useCallback(
    (o: Order) => runDeviceAction({ type: 'open_maps', order_id: o.id, latitude: o.latitude, longitude: o.longitude, label: o.restaurant_name }),
    [runDeviceAction]
  );

  if (!st) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior="padding">
      <ExpoStatusBar style="dark" />
      <View style={{ paddingTop: topPad + 8, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>Pocket Operator</Text>
        <Text style={{ fontSize: 12, color: C.muted }}>Sandbox demo · fictional restaurants · no real orders or payments</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }} accessibilityRole="tablist">
          {(['assistant', 'history', 'activity', 'settings'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: tab === t ? C.accent : C.bg }}
            >
              <Text style={{ color: tab === t ? '#fff' : C.ink, fontWeight: '600', fontSize: 13 }}>{t[0].toUpperCase() + t.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'assistant' && (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={chatRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, gap: 2 }}
            data={st.messages}
            keyExtractor={(m) => m.id}
            onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={{ padding: 16 }}>
                <Text style={{ color: C.muted, fontSize: 15, lineHeight: 22 }}>
                  Hold the mic and say, or type:{'\n'}“Find me the cheapest vegetarian lunch for no more than 200 rupees. Prepare an order and then show me how to get there.”
                </Text>
              </View>
            }
            renderItem={({ item }) => <Bubble m={item} onRetry={send} busy={sending} />}
            ListFooterComponent={
              <View style={{ gap: 10, marginTop: 8 }}>
                {sending ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <ActivityIndicator color={C.accent} />
                    <Text style={{ color: C.muted }}>Searching the sandbox catalogue…</Text>
                  </View>
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
            <View style={{ marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: C.warnSoft }}>
              <Text style={{ color: C.warn }}>{voice.notice.text}</Text>
              {voice.notice.canOpenSettings ? (
                <Pressable onPress={voice.openSettings} accessibilityRole="link">
                  <Text style={{ color: C.info, marginTop: 4, fontWeight: '600' }}>Open app settings</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {voice.state !== 'idle' ? (
            <View style={{ marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: C.dangerSoft, flexDirection: 'row', gap: 8, alignItems: 'center' }} accessibilityLiveRegion="assertive">
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.danger }} />
              <Text style={{ color: C.danger, fontWeight: '700' }}>{voice.state === 'listening' ? 'Listening… release to stop' : 'Finishing…'}</Text>
              <Text style={{ color: C.ink, flex: 1 }} numberOfLines={2}>
                {voice.interim}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 20, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, alignItems: 'flex-end' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={voice.state === 'listening' ? 'Recording. Release to stop' : 'Hold to talk'}
              onPressIn={voice.start}
              onPressOut={voice.stop}
              disabled={sending}
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: voice.state === 'listening' ? C.danger : voice.available ? C.accentSoft : C.line,
              }}
            >
              <Text style={{ fontSize: 22 }}>{voice.state === 'listening' ? '●' : '🎤'}</Text>
            </Pressable>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={voice.available ? 'Type, or hold 🎤 to talk' : 'Type your request'}
              placeholderTextColor={C.muted}
              multiline
              accessibilityLabel="Request text. Voice transcripts appear here for review before sending."
              style={{ flex: 1, minHeight: 52, maxHeight: 120, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink, backgroundColor: C.bg }}
            />
            <View style={{ width: 76 }}>
              <Button label="Send" onPress={() => send(input)} disabled={!input.trim() || voice.state !== 'idle'} busy={sending} />
            </View>
          </View>
        </View>
      )}

      {tab === 'history' && (
        <FlatList
          contentContainerStyle={{ padding: 12, gap: 10 }}
          data={st.orders}
          keyExtractor={(o) => o.id}
          refreshing={loadingList}
          onRefresh={loadOrders}
          ListHeaderComponent={
            <View style={{ gap: 8 }}>
              {listError ? <Text style={{ color: C.warn }}>{listError}</Text> : null}
              <StatusChips statuses={st.statuses} />
            </View>
          }
          ListEmptyComponent={<Text style={{ color: C.muted, padding: 8 }}>No saved sandbox orders yet.</Text>}
          renderItem={({ item }) => <OrderRow o={item} onDirections={() => directionsForOrder(item)} />}
        />
      )}

      {tab === 'activity' && (
        <FlatList
          contentContainerStyle={{ padding: 12, gap: 10 }}
          data={runs}
          keyExtractor={(r) => r.id}
          refreshing={loadingList}
          onRefresh={loadRuns}
          ListHeaderComponent={
            <Text style={{ color: C.muted, fontSize: 13 }}>
              Observable actions only: tools called, validated inputs, outcomes and timing. {listError ? `\n${listError}` : ''}
            </Text>
          }
          ListEmptyComponent={<Text style={{ color: C.muted, padding: 8 }}>No activity yet.</Text>}
          renderItem={({ item }) => <RunCard r={item} onShare={() => Share.share({ title: `Run ${item.id}`, message: JSON.stringify(item, null, 2) })} />}
        />
      )}

      {tab === 'settings' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>Backend URL</Text>
          <TextInput
            value={urlDraft}
            onChangeText={setUrlDraft}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: C.card, color: C.ink }}
          />
          <Text style={{ color: C.muted, fontSize: 12 }}>
            Emulator: http://10.0.2.2:8787 · Phone on same Wi-Fi: http://YOUR-PC-LAN-IP:8787 · Build default: {DEFAULT_API_URL}
          </Text>
          <Button
            label="Save and test connection"
            onPress={async () => {
              const url = urlDraft.trim().replace(/\/+$/, '');
              update((x) => ({ ...x, apiUrl: url }));
              setHealth('Testing…');
              const r = await api.health(url);
              setHealth(r.ok ? `Connected. Model: ${r.data.llm_configured ? r.data.model : 'NOT CONFIGURED on server'}` : r.message);
            }}
          />
          {health ? <Text style={{ color: C.ink }}>{health}</Text> : null}

          <Text style={{ fontWeight: '700', color: C.ink, marginTop: 12 }}>Voice language</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['en-IN', 'ta-IN'] as const).map((l) => (
              <View key={l} style={{ flex: 1 }}>
                <Button kind={st.language === l ? 'primary' : 'secondary'} label={l === 'en-IN' ? 'English' : 'தமிழ் (optional)'} onPress={() => update((x) => ({ ...x, language: l }))} />
              </View>
            ))}
          </View>

          <Text style={{ fontWeight: '700', color: C.ink, marginTop: 12 }}>Conversation</Text>
          <Button
            kind="secondary"
            label="Start a new conversation"
            onPress={() => update((x) => ({ ...x, sessionId: null, messages: [], proposal: null, confirmInFlight: null, statuses: [] }))}
          />
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 12 }}>Device id (sent with requests; no account or personal data): {st.deviceId}</Text>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
