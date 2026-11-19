// Presentational components. No network or storage logic lives here.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ActionStatus, ActivityStep, ChatMessage, Order, Proposal, RunTrace } from './types';

export const C = {
  bg: '#F6F7F4',
  card: '#FFFFFF',
  ink: '#1C1F1A',
  muted: '#6B7066',
  line: '#E3E6DF',
  accent: '#2F6B3B',
  accentSoft: '#E4F0E3',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warn: '#8A5A00',
  warnSoft: '#FFF4D6',
  info: '#1E4E8C',
  infoSoft: '#E5EEFA',
};

export function rupees(n: number) {
  return `₹${n}`;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? C.dangerSoft : C.card;
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? C.danger : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor: kind === 'secondary' ? C.line : bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

const STATUS_STYLE: Record<ActionStatus['kind'], { label: string; bg: string; fg: string }> = {
  order_saved: { label: 'SANDBOX ORDER SAVED', bg: C.accentSoft, fg: C.accent },
  maps_opened: { label: 'MAPS OPENED', bg: C.infoSoft, fg: C.info },
  browser_fallback_opened: { label: 'BROWSER FALLBACK OPENED', bg: C.warnSoft, fg: C.warn },
  could_not_open_directions: { label: 'COULD NOT OPEN DIRECTIONS', bg: C.dangerSoft, fg: C.danger },
};

export function StatusChips({ statuses }: { statuses: ActionStatus[] }) {
  if (!statuses.length) return null;
  return (
    <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
      {statuses.map((st, i) => {
        const v = STATUS_STYLE[st.kind];
        return (
          <View key={i} style={[s.chip, { backgroundColor: v.bg }]}>
            <Text style={[s.chipLabel, { color: v.fg }]}>{v.label}</Text>
            <Text style={[s.chipText, { color: v.fg }]}>{st.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function ProposalCard({
  proposal,
  confirmInFlight,
  confirming,
  cancelling,
  onConfirm,
  onCancel,
}: {
  proposal: Proposal;
  confirmInFlight: boolean;
  confirming: boolean;
  cancelling: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const pending = proposal.status === 'pending';
  const statusText: Record<Proposal['status'], string> = {
    pending: 'Waiting for your approval',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled: no order was placed',
    superseded: 'Replaced by a newer proposal',
    stale: 'Out of date: needs a fresh proposal',
  };
  return (
    <View style={s.card} accessibilityLabel="Order review">
      <View style={s.sandboxTag}>
        <Text style={s.sandboxText}>SANDBOX PICKUP · fictional order · no payment</Text>
      </View>
      <Row label="Restaurant" value={proposal.restaurant_name} />
      <Row label="Meal" value={`${proposal.item_name}${proposal.vegetarian ? ' (veg)' : ' (non-veg)'}`} />
      <Row label="Quantity" value={String(proposal.quantity)} />
      <Row label="Total" value={`${rupees(proposal.total)} (all-inclusive)`} strong />
      {proposal.open_directions_after_confirm ? <Text style={s.small}>Maps will open for directions after you confirm.</Text> : null}
      <Text style={[s.small, { marginTop: 6 }]}>Status: {statusText[proposal.status]}</Text>
      {pending ? (
        <View style={s.rowButtons}>
          <View style={{ flex: 1 }}>
            <Button kind="secondary" label="Cancel" onPress={onCancel} busy={cancelling} disabled={confirming} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={confirmInFlight && !confirming ? 'Retry confirm' : `Confirm ${rupees(proposal.total)}`}
              onPress={onConfirm}
              busy={confirming}
              disabled={cancelling}
              accessibilityHint="Saves this exact sandbox order"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, strong && { fontWeight: '700', fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

export function Bubble({ m, onRetry, busy }: { m: ChatMessage; onRetry: (t: string) => void; busy: boolean }) {
  const mine = m.role === 'user';
  const sys = m.role === 'system';
  return (
    <View style={[s.bubbleWrap, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
      <View style={[s.bubble, mine ? s.mine : sys ? s.sys : s.theirs]}>
        <Text style={[s.bubbleText, mine && { color: '#fff' }]}>{m.text}</Text>
        {m.activity?.length ? <ActivityInline steps={m.activity} latencyMs={m.latencyMs} /> : null}
        {m.retryText ? (
          <View style={{ marginTop: 8 }}>
            <Button kind="secondary" label="Retry" onPress={() => onRetry(m.retryText!)} disabled={busy} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ActivityInline({ steps, latencyMs }: { steps: ActivityStep[]; latencyMs?: number }) {
  return (
    <View style={s.activity}>
      {steps.map((st, i) => (
        <Text key={i} style={s.activityLine}>
          {st.status === 'ok' ? '✓' : '✕'} {st.tool}
          {st.decision ? `: ${st.decision}` : ''}
        </Text>
      ))}
      {latencyMs != null ? <Text style={s.activityLine}>{(latencyMs / 1000).toFixed(1)} s</Text> : null}
    </View>
  );
}

export function OrderRow({ o, onDirections }: { o: Order; onDirections: () => void }) {
  return (
    <View style={s.card}>
      <Text style={s.orderTitle}>
        {o.item_name} · {rupees(o.total)}
      </Text>
      <Text style={s.small}>{o.restaurant_name}</Text>
      <Text style={s.small}>
        {o.status === 'sandbox_confirmed' ? 'Sandbox order saved' : o.status} · {new Date(o.created_at).toLocaleString()}
      </Text>
      <Text style={[s.small, { color: C.muted }]}>Order {o.id}</Text>
      <View style={{ marginTop: 8 }}>
        <Button kind="secondary" label="Open directions" onPress={onDirections} />
      </View>
    </View>
  );
}

export function RunCard({ r, onShare }: { r: RunTrace; onShare: () => void }) {
  const title: Record<string, string> = { agent: 'Assistant turn', confirm: 'Confirm tap', cancel: 'Cancel tap', device_action: 'Phone action' };
  return (
    <View style={s.card}>
      <Text style={s.orderTitle}>
        {title[r.kind] ?? r.kind} · {r.status}
      </Text>
      {r.user_text ? <Text style={s.small}>“{r.user_text}”</Text> : null}
      <Text style={[s.small, { color: C.muted }]}>
        {new Date(r.started_at).toLocaleTimeString()} · {r.latency_ms ?? '?'} ms{r.model ? ` · ${r.model}` : ''}
        {r.iterations ? ` · ${r.iterations} model call(s)` : ''} · {r.id}
      </Text>
      {r.steps.map((st) => (
        <Text key={st.seq} style={s.activityLine}>
          {st.status === 'ok' ? '✓' : '✕'} {st.tool}
          {st.input && Object.keys(st.input as object).length ? ` ${JSON.stringify(st.input)}` : ''}
          {st.decision ? `\n   → ${st.decision}` : ''}
        </Text>
      ))}
      {r.error ? <Text style={[s.small, { color: C.danger }]}>Error: {r.error}</Text> : null}
      <View style={{ marginTop: 8 }}>
        <Button kind="secondary" label="Export trace (JSON)" onPress={onShare} />
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  btnText: { fontSize: 16, fontWeight: '600' },
  chip: { borderRadius: 10, padding: 10 },
  chipLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  chipText: { fontSize: 14, marginTop: 2 },
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, gap: 4 },
  sandboxTag: { alignSelf: 'flex-start', backgroundColor: C.warnSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  sandboxText: { color: C.warn, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: 12 },
  rowLabel: { color: C.muted, fontSize: 15 },
  rowValue: { color: C.ink, fontSize: 15, flexShrink: 1, textAlign: 'right' },
  rowButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  small: { color: C.ink, fontSize: 13 },
  bubbleWrap: { marginVertical: 4 },
  bubble: { maxWidth: '88%', borderRadius: 14, padding: 10 },
  mine: { backgroundColor: C.accent },
  theirs: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  sys: { backgroundColor: C.infoSoft },
  bubbleText: { fontSize: 15, color: C.ink, lineHeight: 21 },
  activity: { marginTop: 6, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
  activityLine: { fontSize: 12, color: C.muted, fontFamily: 'monospace' },
  orderTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
});
