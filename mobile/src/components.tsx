// Presentational components. No network or storage logic lives here.
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  ActionStatus,
  ActivityStep,
  ChatMessage,
  Order,
  Proposal,
  RunTrace,
} from "./types";

export const C = {
  bg: "#FBF8F1", // warm cream
  card: "#FFFFFF",
  ink: "#1F2421",
  muted: "#7A7F76",
  line: "#ECE7DA",
  brand: "#14532D", // deep leaf green
  brand2: "#1F7A44",
  brandSoft: "#E3F1E6",
  saffron: "#E8833A",
  saffronSoft: "#FDEBDC",
  danger: "#B3261E",
  dangerSoft: "#FBE7E5",
  warn: "#8A5A00",
  warnSoft: "#FFF3D4",
  info: "#1E4E8C",
  infoSoft: "#E4EDF9",
  nonveg: "#8B2E16",
};

export function rupees(n: number) {
  return `₹${n}`;
}

// ---------- primitives ----------

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  busy,
  accessibilityHint,
  icon,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
  icon?: string;
}) {
  const bg = {
    primary: C.brand,
    secondary: C.card,
    danger: C.dangerSoft,
    ghost: "transparent",
  }[kind];
  const fg = {
    primary: "#fff",
    secondary: C.ink,
    danger: C.danger,
    ghost: C.brand,
  }[kind];
  const border = kind === "secondary" ? C.line : bg;
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
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        kind === "primary" && !disabled && s.btnShadow,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[s.btnText, { color: fg }]}>
          {icon ? `${icon}  ` : ""}
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Indian food-label style marker: green square+dot = veg, brown square+triangle = non-veg. */
export function DietMark({ veg, size = 16 }: { veg: boolean; size?: number }) {
  const color = veg ? C.brand2 : C.nonveg;
  return (
    <View
      accessibilityLabel={veg ? "Vegetarian" : "Non-vegetarian"}
      style={{
        width: size,
        height: size,
        borderWidth: 1.5,
        borderColor: color,
        borderRadius: 3,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {veg ? (
        <View
          style={{
            width: size * 0.45,
            height: size * 0.45,
            borderRadius: size,
            backgroundColor: color,
          }}
        />
      ) : (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: size * 0.25,
            borderRightWidth: size * 0.25,
            borderBottomWidth: size * 0.45,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: color,
          }}
        />
      )}
    </View>
  );
}

export function Pill({
  text,
  bg,
  fg,
}: {
  text: string;
  bg: string;
  fg: string;
}) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          color: fg,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.5,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

// ---------- header + tabs ----------

export function Header({
  topPad,
  online,
}: {
  topPad: number;
  online: boolean | null;
}) {
  const dot = online === null ? "#C9C2AE" : online ? "#5BD38A" : "#FF7A6E";
  const label =
    online === null
      ? "Checking server…"
      : online
        ? "Server connected"
        : "Server offline";
  return (
    <View style={[s.header, { paddingTop: topPad + 10 }]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={s.logo}>
            <Text style={{ fontSize: 22 }}>🥡</Text>
          </View>
          <View>
            <Text style={s.title}>Pocket Operator</Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
              accessibilityLabel={label}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: dot,
                }}
              />
              <Text style={s.subtitle}>{label}</Text>
            </View>
          </View>
        </View>
        <Pill text="SANDBOX" bg="rgba(255,255,255,0.16)" fg="#FFE7C7" />
      </View>
    </View>
  );
}

export type TabKey = "assistant" | "history" | "activity" | "settings";

export function TabBar({
  tab,
  onChange,
  badge,
}: {
  tab: TabKey;
  onChange: (t: TabKey) => void;
  badge?: number;
}) {
  const items: { key: TabKey; icon: string; label: string }[] = [
    { key: "assistant", icon: "💬", label: "Assistant" },
    { key: "history", icon: "🧾", label: "Orders" },
    { key: "activity", icon: "📊", label: "Activity" },
    { key: "settings", icon: "⚙️", label: "Settings" },
  ];
  return (
    <View style={s.tabBar} accessibilityRole="tablist">
      {items.map((it) => {
        const active = tab === it.key;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(it.key)}
            style={s.tabItem}
          >
            <View
              style={[
                s.tabIconWrap,
                active && { backgroundColor: C.brandSoft },
              ]}
            >
              <Text style={{ fontSize: 18, opacity: active ? 1 : 0.6 }}>
                {it.icon}
              </Text>
              {it.key === "history" && badge ? (
                <View style={s.badge}>
                  <Text
                    style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}
                  >
                    {badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                s.tabLabel,
                active && { color: C.brand, fontWeight: "800" },
              ]}
            >
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- assistant ----------

export function Welcome({ onPick }: { onPick: (t: string) => void }) {
  const suggestions = [
    {
      icon: "🥗",
      text: "Find me the cheapest vegetarian lunch for no more than 200 rupees. Prepare an order and then show me how to get there.",
    },
    { icon: "🍗", text: "Non-veg meal under 250 rupees" },
    { icon: "🗺️", text: "Open directions for my last order" },
  ];
  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 12, gap: 14 }}>
      <View style={s.welcomeCard}>
        <Text style={{ fontSize: 30 }}>👋</Text>
        <Text style={s.welcomeTitle}>What are you hungry for?</Text>
        <Text style={s.welcomeText}>
          Hold the mic and speak, or type. Tell me your budget and whether you
          want veg or non-veg. I'll find the best match and prepare a sandbox
          pickup for you to approve.
        </Text>
      </View>
      <Text style={s.sectionLabel}>TRY SAYING</Text>
      {suggestions.map((sg) => (
        <Pressable
          key={sg.text}
          onPress={() => onPick(sg.text)}
          accessibilityRole="button"
          accessibilityHint="Puts this text in the message box"
          style={({ pressed }) => [
            s.suggestion,
            pressed && { backgroundColor: C.brandSoft },
          ]}
        >
          <Text style={{ fontSize: 20 }}>{sg.icon}</Text>
          <Text style={{ flex: 1, color: C.ink, fontSize: 14, lineHeight: 20 }}>
            {sg.text}
          </Text>
          <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function TypingIndicator({ text }: { text: string }) {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 150),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View
      style={[s.bubbleRow, { justifyContent: "flex-start" }]}
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
    >
      <Avatar />
      <View
        style={[
          s.bubble,
          s.theirs,
          { flexDirection: "row", alignItems: "center", gap: 10 },
        ]}
      >
        <View style={{ flexDirection: "row", gap: 4 }}>
          {dots.map((d, i) => (
            <Animated.View
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: C.brand2,
                opacity: d,
              }}
            />
          ))}
        </View>
        <Text style={{ color: C.muted, fontSize: 13 }}>{text}</Text>
      </View>
    </View>
  );
}

function Avatar() {
  return (
    <View style={s.avatar}>
      <Text style={{ fontSize: 14 }}>🥡</Text>
    </View>
  );
}

export function Bubble({
  m,
  onRetry,
  busy,
}: {
  m: ChatMessage;
  onRetry: (t: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (m.role === "system") {
    return (
      <View style={s.systemNote}>
        <Text
          style={{
            color: C.info,
            fontSize: 13,
            lineHeight: 19,
            textAlign: "center",
          }}
        >
          {m.text}
        </Text>
        {m.retryText ? (
          <View style={{ marginTop: 8, alignSelf: "center" }}>
            <Button
              kind="secondary"
              icon="↻"
              label="Retry"
              onPress={() => onRetry(m.retryText!)}
              disabled={busy}
            />
          </View>
        ) : null}
      </View>
    );
  }
  const mine = m.role === "user";
  return (
    <View
      style={[
        s.bubbleRow,
        { justifyContent: mine ? "flex-end" : "flex-start" },
      ]}
    >
      {!mine ? <Avatar /> : null}
      <View style={[s.bubble, mine ? s.mine : s.theirs]}>
        <Text style={[s.bubbleText, mine && { color: "#fff" }]}>{m.text}</Text>
        {m.activity?.length ? (
          <View style={{ marginTop: 8 }}>
            <Pressable
              onPress={() => setOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel={open ? "Hide steps" : "Show steps"}
            >
              <Text style={s.stepsToggle}>
                🔧 {m.activity.length} step{m.activity.length > 1 ? "s" : ""}
                {m.latencyMs != null
                  ? ` · ${(m.latencyMs / 1000).toFixed(1)}s`
                  : ""}{" "}
                {open ? "▴" : "▾"}
              </Text>
            </Pressable>
            {open ? (
              <View style={s.activity}>
                {m.activity.map((st, i) => (
                  <View
                    key={i}
                    style={{ flexDirection: "row", gap: 6, marginTop: 4 }}
                  >
                    <Text
                      style={{
                        color: st.status === "ok" ? C.brand2 : C.danger,
                        fontWeight: "800",
                      }}
                    >
                      {st.status === "ok" ? "✓" : "✕"}
                    </Text>
                    <Text style={s.activityLine}>
                      <Text style={{ fontWeight: "700", color: C.ink }}>
                        {st.tool}
                      </Text>
                      {st.decision ? `  ${st.decision}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {m.retryText ? (
          <View style={{ marginTop: 10 }}>
            <Button
              kind="secondary"
              icon="↻"
              label="Retry"
              onPress={() => onRetry(m.retryText!)}
              disabled={busy}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------- review card ----------

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
  const pending = proposal.status === "pending";
  const statusPill: Record<
    Proposal["status"],
    { text: string; bg: string; fg: string }
  > = {
    pending: {
      text: "AWAITING YOUR APPROVAL",
      bg: C.saffronSoft,
      fg: "#A4501B",
    },
    confirmed: { text: "✓ CONFIRMED", bg: C.brandSoft, fg: C.brand },
    cancelled: { text: "CANCELLED · NO ORDER", bg: "#EEE", fg: C.muted },
    superseded: { text: "REPLACED BY NEWER PROPOSAL", bg: "#EEE", fg: C.muted },
    stale: { text: "OUT OF DATE", bg: C.dangerSoft, fg: C.danger },
  };
  const sp = statusPill[proposal.status];
  return (
    <View
      style={[s.receipt, !pending && { opacity: 0.85 }]}
      accessibilityLabel="Order review"
    >
      <View style={s.sandboxStripe}>
        <Text style={s.sandboxText}>
          SANDBOX PICKUP · FICTIONAL ORDER · NO PAYMENT
        </Text>
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={s.sectionLabel}>REVIEW ORDER</Text>
          <Pill {...sp} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={s.restIcon}>
            <Text style={{ fontSize: 22 }}>🏪</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              Restaurant · pickup
            </Text>
            <Text style={{ color: C.ink, fontSize: 16, fontWeight: "700" }}>
              {proposal.restaurant_name}
            </Text>
          </View>
        </View>

        <View style={s.itemRow}>
          <DietMark veg={proposal.vegetarian} />
          <Text
            style={{ flex: 1, color: C.ink, fontSize: 16, fontWeight: "600" }}
          >
            {proposal.item_name}
          </Text>
          <Text style={{ color: C.muted, fontSize: 14 }}>
            × {proposal.quantity}
          </Text>
        </View>

        <View style={s.dashed} />

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <View>
            <Text style={{ color: C.muted, fontSize: 12 }}>Total</Text>
            <Text style={{ color: C.muted, fontSize: 11 }}>
              All-inclusive · no tax or delivery
            </Text>
          </View>
          <Text style={s.total}>{rupees(proposal.total)}</Text>
        </View>

        {pending && proposal.open_directions_after_confirm ? (
          <View style={s.mapHint}>
            <Text style={{ fontSize: 14 }}>🗺️</Text>
            <Text style={{ color: C.info, fontSize: 13, flex: 1 }}>
              Maps will open with directions after you confirm.
            </Text>
          </View>
        ) : null}

        {pending ? (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
            <View style={{ flex: 1 }}>
              <Button
                kind="secondary"
                label="Cancel"
                onPress={onCancel}
                busy={cancelling}
                disabled={confirming}
              />
            </View>
            <View style={{ flex: 1.6 }}>
              <Button
                label={
                  confirmInFlight && !confirming
                    ? "Retry confirm"
                    : `Confirm ${rupees(proposal.total)}`
                }
                icon={confirmInFlight && !confirming ? "↻" : "✓"}
                onPress={onConfirm}
                busy={confirming}
                disabled={cancelling}
                accessibilityHint="Saves this exact sandbox order"
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------- action outcomes ----------

const STATUS_STYLE: Record<
  ActionStatus["kind"],
  { icon: string; label: string; bg: string; fg: string }
> = {
  order_saved: {
    icon: "✅",
    label: "SANDBOX ORDER SAVED",
    bg: C.brandSoft,
    fg: C.brand,
  },
  maps_opened: { icon: "🗺️", label: "MAPS OPENED", bg: C.infoSoft, fg: C.info },
  browser_fallback_opened: {
    icon: "🌐",
    label: "BROWSER FALLBACK OPENED",
    bg: C.warnSoft,
    fg: C.warn,
  },
  could_not_open_directions: {
    icon: "⚠️",
    label: "COULD NOT OPEN DIRECTIONS",
    bg: C.dangerSoft,
    fg: C.danger,
  },
};

export function StatusChips({ statuses }: { statuses: ActionStatus[] }) {
  if (!statuses.length) return null;
  return (
    <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
      {statuses.map((st, i) => {
        const v = STATUS_STYLE[st.kind];
        return (
          <View
            key={i}
            style={[s.chip, { backgroundColor: v.bg, borderLeftColor: v.fg }]}
          >
            <Text style={{ fontSize: 18 }}>{v.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.chipLabel, { color: v.fg }]}>{v.label}</Text>
              <Text style={[s.chipText, { color: C.ink }]}>{st.text}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------- mic ----------

export function MicButton({
  listening,
  available,
  disabled,
  onPressIn,
  onPressOut,
}: {
  listening: boolean;
  available: boolean;
  disabled?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!listening) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.7],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });
  return (
    <View
      style={{
        width: 56,
        height: 56,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {listening ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: C.danger,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          }}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          listening ? "Recording. Release to stop" : "Hold to talk"
        }
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        style={({ pressed }) => [
          s.mic,
          {
            backgroundColor: listening
              ? C.danger
              : available
                ? C.saffron
                : "#CFC8B6",
            transform: [{ scale: pressed || listening ? 1.08 : 1 }],
          },
        ]}
      >
        <Text style={{ fontSize: 24 }}>{listening ? "🎙️" : "🎤"}</Text>
      </Pressable>
    </View>
  );
}

// ---------- lists ----------

export function OrderRow({
  o,
  onDirections,
}: {
  o: Order;
  onDirections: () => void;
}) {
  return (
    <View style={s.card}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={s.restIcon}>
          <Text style={{ fontSize: 20 }}>🧾</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.orderTitle}>{o.item_name}</Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>
            {o.restaurant_name}
          </Text>
        </View>
        <Text style={{ fontSize: 18, fontWeight: "800", color: C.ink }}>
          {rupees(o.total)}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <Pill
          text={
            o.status === "sandbox_confirmed"
              ? "SANDBOX ORDER SAVED"
              : o.status.toUpperCase()
          }
          bg={C.brandSoft}
          fg={C.brand}
        />
        <Text style={{ color: C.muted, fontSize: 12 }}>
          {new Date(o.created_at).toLocaleString()}
        </Text>
      </View>
      <Text style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
        Order {o.id} · qty {o.quantity} · pickup
      </Text>
      <View style={{ marginTop: 10 }}>
        <Button
          kind="secondary"
          icon="🗺️"
          label="Open directions"
          onPress={onDirections}
        />
      </View>
    </View>
  );
}

export function RunCard({ r, onShare }: { r: RunTrace; onShare: () => void }) {
  const meta: Record<string, { icon: string; title: string }> = {
    agent: { icon: "💬", title: "Assistant turn" },
    confirm: { icon: "✅", title: "Confirm tap" },
    cancel: { icon: "✋", title: "Cancel tap" },
    device_action: { icon: "📱", title: "Phone action" },
  };
  const m = meta[r.kind] ?? { icon: "•", title: r.kind };
  const ok = ["completed"].includes(r.status);
  return (
    <View style={s.card}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={s.orderTitle}>
          {m.icon} {m.title}
        </Text>
        <Pill
          text={r.status.toUpperCase()}
          bg={ok ? C.brandSoft : C.warnSoft}
          fg={ok ? C.brand : C.warn}
        />
      </View>
      {r.user_text ? (
        <Text
          style={{
            color: C.ink,
            fontSize: 14,
            marginTop: 6,
            fontStyle: "italic",
          }}
        >
          “{r.user_text}”
        </Text>
      ) : null}
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
        {new Date(r.started_at).toLocaleTimeString()} · {r.latency_ms ?? "?"} ms
        {r.model ? ` · ${r.model}` : ""}
        {r.iterations ? ` · ${r.iterations} model call(s)` : ""}
      </Text>
      <View
        style={{
          marginTop: 8,
          borderLeftWidth: 2,
          borderLeftColor: C.line,
          paddingLeft: 10,
          gap: 6,
        }}
      >
        {r.steps.map((st) => (
          <View key={st.seq}>
            <Text style={{ fontSize: 13, color: C.ink }}>
              <Text
                style={{
                  color: st.status === "ok" ? C.brand2 : C.danger,
                  fontWeight: "800",
                }}
              >
                {st.status === "ok" ? "✓ " : "✕ "}
              </Text>
              <Text style={{ fontWeight: "700" }}>{st.tool}</Text>
              {st.input && Object.keys(st.input as object).length ? (
                <Text style={s.mono}> {JSON.stringify(st.input)}</Text>
              ) : null}
            </Text>
            {st.decision ? (
              <Text style={{ color: C.muted, fontSize: 12 }}>
                → {st.decision}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {r.error ? (
        <Text style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>
          Error: {r.error}
        </Text>
      ) : null}
      <Text style={{ color: C.muted, fontSize: 10, marginTop: 6 }}>{r.id}</Text>
      <View style={{ marginTop: 8 }}>
        <Button
          kind="ghost"
          icon="⤴"
          label="Export trace (JSON)"
          onPress={onShare}
        />
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  btnShadow: {
    elevation: 3,
    shadowColor: "#14532D",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  btnText: { fontSize: 15, fontWeight: "700" },

  header: {
    backgroundColor: C.brand,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: 0.2 },
  subtitle: { color: "rgba(255,255,255,0.8)", fontSize: 12 },

  tabBar: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 6,
    paddingBottom: 14,
  },
  tabItem: { flex: 1, alignItems: "center", gap: 2 },
  tabIconWrap: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 },
  tabLabel: { fontSize: 11, color: C.muted, fontWeight: "600" },
  badge: {
    position: "absolute",
    top: -2,
    right: 6,
    backgroundColor: C.saffron,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  welcomeCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: C.line,
    gap: 6,
  },
  welcomeTitle: { fontSize: 22, fontWeight: "800", color: C.ink },
  welcomeText: { fontSize: 14, color: C.muted, lineHeight: 21 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: C.muted,
    letterSpacing: 1,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
  },

  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginVertical: 5,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mine: { backgroundColor: C.brand, borderBottomRightRadius: 6 },
  theirs: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { fontSize: 15, color: C.ink, lineHeight: 22 },
  stepsToggle: { fontSize: 12, color: C.brand2, fontWeight: "700" },
  activity: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 4,
  },
  activityLine: { fontSize: 12, color: C.muted, flex: 1, lineHeight: 17 },
  systemNote: {
    alignSelf: "center",
    maxWidth: "92%",
    backgroundColor: C.infoSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 6,
  },

  receipt: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  sandboxStripe: {
    backgroundColor: C.warnSoft,
    paddingVertical: 6,
    alignItems: "center",
  },
  sandboxText: {
    color: C.warn,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  restIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.saffronSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 12,
  },
  dashed: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D9D2C0",
  },
  total: { fontSize: 30, fontWeight: "800", color: C.ink },
  mapHint: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: C.infoSoft,
    borderRadius: 10,
    padding: 10,
  },

  chip: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 14,
    padding: 12,
    borderLeftWidth: 4,
  },
  chipLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  chipText: { fontSize: 13, marginTop: 2, lineHeight: 18 },

  mic: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
  },
  orderTitle: { fontSize: 16, fontWeight: "700", color: C.ink },
  mono: {
    fontFamily: "monospace",
    fontSize: 11,
    color: C.muted,
    fontWeight: "400",
  },
});
