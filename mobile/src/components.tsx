// Presentational components. No network or storage logic lives here.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Grad, T } from "./ui";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 18,
  color = C.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
import type {
  ActionStatus,
  ActivityStep,
  ChatMessage,
  Order,
  Proposal,
  RunTrace,
} from "./types";

import { C } from "./theme";
export { C };

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
  icon?: IconName;
}) {
  const bg = {
    primary: C.brand,
    secondary: C.card,
    danger: C.dangerSoft,
    ghost: "transparent",
  }[kind];
  const fg = {
    primary: C.onBrand,
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
      {kind === "primary" ? (
        <Grad colors={C.brandGrad} style={StyleSheet.absoluteFill} />
      ) : null}
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <T style={[s.btnText, { color: fg }]}>{label}</T>
        </View>
      )}
    </Pressable>
  );
}

/** Indian food-label style marker: green square+dot = veg, brown square+triangle = non-veg. */
export function DietMark({ veg, size = 16 }: { veg: boolean; size?: number }) {
  const color = veg ? C.veg : C.nonveg;
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
  icon,
}: {
  text: string;
  bg: string;
  fg: string;
  icon?: IconName;
}) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      {icon ? <Icon name={icon} size={11} color={fg} /> : null}
      <T
        style={{
          color: fg,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.5,
        }}
      >
        {text}
      </T>
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
    <Grad colors={C.headerGrad} style={[s.header, { paddingTop: topPad + 10 }]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={s.logo}>
            <MaterialCommunityIcons
              name="food-takeout-box"
              size={24}
              color={C.headerInk}
            />
          </View>
          <View>
            <T style={s.title}>Pocket Operator</T>
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
              <T style={s.subtitle}>{label}</T>
            </View>
          </View>
        </View>
        <Pill text="SANDBOX" bg={C.headerPill} fg={C.headerPillInk} />
      </View>
    </Grad>
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
    { key: "assistant", icon: "chatbubble-ellipses", label: "Assistant" },
    { key: "history", icon: "receipt", label: "Orders" },
    { key: "activity", icon: "pulse", label: "Activity" },
    { key: "settings", icon: "settings-sharp", label: "Settings" },
  ];
  const index = Math.max(
    0,
    items.findIndex((i) => i.key === tab),
  );
  const [barWidth, setBarWidth] = useState(0);
  const slot = barWidth / items.length;
  const x = useRef(new Animated.Value(index)).current;

  // Uber-style: the highlight pill slides across the tabs in between to the one you tapped.
  useEffect(() => {
    // Smooth glide (no bounce): ease-out cubic, ~280 ms, on the native thread.
    Animated.timing(x, {
      toValue: index,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, x]);

  const PILL = 64;
  const translateX = x.interpolate({
    inputRange: [0, items.length - 1],
    outputRange: [
      (slot - PILL) / 2,
      (slot - PILL) / 2 + slot * (items.length - 1),
    ],
  });

  return (
    <View style={s.tabBarWrap}>
      <View
        style={s.tabBar}
        accessibilityRole="tablist"
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {barWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[s.tabPill, { width: PILL, transform: [{ translateX }] }]}
          />
        ) : null}
        {items.map((it, i) => {
          const active = i === index;
          return (
            <Pressable
              key={it.key}
              accessibilityRole="tab"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(it.key)}
              style={s.tabItem}
              hitSlop={6}
            >
              <View>
                <Icon
                  name={
                    (active
                      ? it.icon
                      : `${it.icon.replace("-sharp", "")}-outline`) as IconName
                  }
                  size={19}
                  color={active ? C.brand : C.muted}
                />
                {it.key === "history" && badge ? (
                  <View style={s.badge}>
                    <T
                      style={{
                        color: C.onBrand,
                        fontSize: 9,
                        fontWeight: "800",
                      }}
                    >
                      {badge}
                    </T>
                  </View>
                ) : null}
              </View>
              <T
                style={[
                  s.tabLabel,
                  active && { color: C.brand, fontWeight: "800" },
                ]}
              >
                {it.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- assistant ----------

export function Welcome({ onPick }: { onPick: (t: string) => void }) {
  const suggestions = [
    {
      icon: "leaf" as IconName,
      text: "Find me the cheapest vegetarian lunch for no more than 200 rupees. Prepare an order and then show me how to get there.",
    },
    { icon: "flame" as IconName, text: "Non-veg meal under 250 rupees" },
    { icon: "navigate" as IconName, text: "Open directions for my last order" },
  ];
  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 12, gap: 14 }}>
      <Grad colors={C.brandGrad} style={s.welcomeCard}>
        <View style={s.decoCircle} />
        <View
          style={[
            s.decoCircle,
            { width: 120, height: 120, right: -30, top: 70, opacity: 0.07 },
          ]}
        />
        <View style={s.heroIcon}>
          <MaterialCommunityIcons
            name="silverware-fork-knife"
            size={24}
            color={C.onBrand}
          />
        </View>
        <T style={[s.welcomeTitle, { color: C.onBrand }]}>
          What are you hungry for?
        </T>
        <T style={[s.welcomeText, { color: C.onBrand, opacity: 0.85 }]}>
          Hold the mic and speak, or type. Tell me your budget and veg or
          non-veg. I'll find the best match and prepare a sandbox pickup for you
          to approve.
        </T>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 6,
            flexWrap: "wrap",
          }}
        >
          <Pill icon="mic" text="VOICE" bg={C.headerPill} fg={C.onBrand} />
          <Pill
            icon="shield-checkmark"
            text="YOU APPROVE"
            bg={C.headerPill}
            fg={C.onBrand}
          />
          <Pill icon="map" text="MAPS" bg={C.headerPill} fg={C.onBrand} />
        </View>
      </Grad>
      <T style={s.sectionLabel}>TRY SAYING</T>
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
          <View style={s.iconBubble}>
            <Icon name={sg.icon} size={18} color={C.brand} />
          </View>
          <T style={{ flex: 1, color: C.ink, fontSize: 14, lineHeight: 20 }}>
            {sg.text}
          </T>
          <Icon name="chevron-forward" size={18} color={C.muted} />
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
        <T style={{ color: C.muted, fontSize: 13 }}>{text}</T>
      </View>
    </View>
  );
}

function Avatar() {
  return (
    <View style={s.avatar}>
      <Icon name="sparkles" size={14} color={C.brand} />
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
        <T
          style={{
            color: C.info,
            fontSize: 13,
            lineHeight: 19,
            textAlign: "center",
          }}
        >
          {m.text}
        </T>
        {m.retryText ? (
          <View style={{ marginTop: 8, alignSelf: "center" }}>
            <Button
              kind="secondary"
              icon="refresh"
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
        {mine ? (
          <Grad colors={C.brandGrad} style={StyleSheet.absoluteFill} />
        ) : null}
        <T style={[s.bubbleText, mine && { color: C.onBrand }]}>{m.text}</T>
        {m.activity?.length ? (
          <View style={{ marginTop: 8 }}>
            <Pressable
              onPress={() => setOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel={open ? "Hide steps" : "Show steps"}
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Icon name="git-commit-outline" size={14} color={C.brand} />
              <T style={s.stepsToggle}>
                {m.activity.length} step{m.activity.length > 1 ? "s" : ""}
                {m.latencyMs != null
                  ? ` · ${(m.latencyMs / 1000).toFixed(1)}s`
                  : ""}
              </T>
              <Icon
                name={open ? "chevron-up" : "chevron-down"}
                size={13}
                color={C.brand}
              />
            </Pressable>
            {open ? (
              <View style={s.activity}>
                {m.activity.map((st, i) => (
                  <View
                    key={i}
                    style={{ flexDirection: "row", gap: 6, marginTop: 4 }}
                  >
                    <Icon
                      name={
                        st.status === "ok" ? "checkmark-circle" : "close-circle"
                      }
                      size={14}
                      color={st.status === "ok" ? C.veg : C.danger}
                    />
                    <T style={s.activityLine}>
                      <T style={{ fontWeight: "700", color: C.ink }}>
                        {st.tool}
                      </T>
                      {st.decision ? `  ${st.decision}` : ""}
                    </T>
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
              icon="refresh"
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
    { text: string; bg: string; fg: string; icon?: IconName }
  > = {
    pending: {
      icon: "time" as IconName,
      text: "AWAITING APPROVAL",
      bg: C.accentSoft,
      fg: C.pendingInk,
    },
    confirmed: {
      icon: "checkmark-circle" as IconName,
      text: "CONFIRMED",
      bg: "#FFFFFF",
      fg: C.brand,
    },
    cancelled: { text: "CANCELLED · NO ORDER", bg: C.pillMuted, fg: C.muted },
    superseded: {
      text: "REPLACED BY NEWER PROPOSAL",
      bg: C.pillMuted,
      fg: C.muted,
    },
    stale: { text: "OUT OF DATE", bg: C.dangerSoft, fg: C.danger },
  };
  const sp = statusPill[proposal.status];
  return (
    <View
      style={[s.receipt, !pending && { opacity: 0.9 }]}
      accessibilityLabel="Order review"
    >
      <Grad colors={C.brandGrad} style={s.receiptHead}>
        <View style={s.decoCircle} />
        <View
          style={[
            s.decoCircle,
            { width: 90, height: 90, right: 40, top: -50, opacity: 0.06 },
          ]}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <T
            style={{
              color: C.onBrand,
              opacity: 0.85,
              fontSize: 11,
              fontWeight: "800",
              letterSpacing: 1.2,
            }}
          >
            REVIEW ORDER
          </T>
          <Pill {...sp} />
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginTop: 12,
          }}
        >
          <View style={s.restIconGlass}>
            <Icon name="storefront" size={22} color={C.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ color: C.onBrand, opacity: 0.8, fontSize: 12 }}>
              Restaurant · pickup
            </T>
            <T style={{ color: C.onBrand, fontSize: 18, fontWeight: "800" }}>
              {proposal.restaurant_name}
            </T>
          </View>
        </View>
      </Grad>

      <View style={s.sandboxStripe}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="flask" size={12} color={C.warn} />
          <T style={s.sandboxText}>
            SANDBOX PICKUP · FICTIONAL ORDER · NO PAYMENT
          </T>
        </View>
      </View>

      <View style={{ padding: 16, gap: 14 }}>
        <View style={s.itemRow}>
          <DietMark veg={proposal.vegetarian} size={18} />
          <View style={{ flex: 1 }}>
            <T style={{ color: C.ink, fontSize: 16, fontWeight: "700" }}>
              {proposal.item_name}
            </T>
            <T style={{ color: C.muted, fontSize: 12 }}>
              {proposal.vegetarian ? "Vegetarian" : "Non-vegetarian"} · Qty{" "}
              {proposal.quantity}
            </T>
          </View>
          <T style={{ color: C.ink, fontSize: 15, fontWeight: "700" }}>
            {rupees(proposal.unit_price)}
          </T>
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
            <T
              style={{
                color: C.muted,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.6,
              }}
            >
              TOTAL
            </T>
            <T style={{ color: C.muted, fontSize: 11 }}>
              All-inclusive · no tax or delivery
            </T>
          </View>
          <T style={s.total}>{rupees(proposal.total)}</T>
        </View>

        {pending && proposal.open_directions_after_confirm ? (
          <View style={s.mapHint}>
            <Icon name="navigate-circle" size={18} color={C.info} />
            <T style={{ color: C.info, fontSize: 13, flex: 1 }}>
              Maps will open with directions after you confirm.
            </T>
          </View>
        ) : null}

        {pending ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                kind="secondary"
                label="Cancel"
                onPress={onCancel}
                busy={cancelling}
                disabled={confirming}
              />
            </View>
            <View style={{ flex: 1.7 }}>
              <Button
                label={
                  confirmInFlight && !confirming
                    ? "Retry confirm"
                    : `Confirm ${rupees(proposal.total)}`
                }
                icon={
                  confirmInFlight && !confirming
                    ? "refresh"
                    : "checkmark-circle"
                }
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
  { icon: IconName; label: string; bg: string; fg: string }
> = {
  order_saved: {
    icon: "checkmark-circle" as IconName,
    label: "SANDBOX ORDER SAVED",
    bg: C.brandSoft,
    fg: C.brand,
  },
  maps_opened: {
    icon: "map" as IconName,
    label: "MAPS OPENED",
    bg: C.infoSoft,
    fg: C.info,
  },
  browser_fallback_opened: {
    icon: "globe" as IconName,
    label: "BROWSER FALLBACK OPENED",
    bg: C.warnSoft,
    fg: C.warn,
  },
  could_not_open_directions: {
    icon: "warning" as IconName,
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
            <Icon name={v.icon} size={22} color={v.fg} />
            <View style={{ flex: 1 }}>
              <T style={[s.chipLabel, { color: v.fg }]}>{v.label}</T>
              <T style={[s.chipText, { color: C.ink }]}>{st.text}</T>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------- mic ----------

const LOCK_DISTANCE = 70;

/**
 * WhatsApp-style push-to-talk: hold to record, release to stop; slide up to lock so recording
 * continues hands-free (then Stop or Cancel from the recording bar).
 */
export function MicButton({
  listening,
  locked,
  available,
  disabled,
  onStart,
  onStop,
  onLock,
}: {
  listening: boolean;
  locked: boolean;
  available: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onLock: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const lockedRef = useRef(locked);
  const cb = useRef({ onStart, onStop, onLock, disabled });
  cb.current = { onStart, onStop, onLock, disabled };
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

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

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !cb.current.disabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          lockedRef.current = false;
          dragY.setValue(0);
          cb.current.onStart();
        },
        onPanResponderMove: (_e, g) => {
          if (lockedRef.current) return;
          const dy = Math.min(0, g.dy);
          dragY.setValue(dy);
          if (dy < -LOCK_DISTANCE) {
            lockedRef.current = true;
            dragY.setValue(0);
            cb.current.onLock();
          }
        },
        onPanResponderRelease: () => {
          dragY.setValue(0);
          if (!lockedRef.current) cb.current.onStop();
        },
        onPanResponderTerminate: () => {
          dragY.setValue(0);
          if (!lockedRef.current) cb.current.onStop();
        },
      }),
    [dragY],
  );

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.7],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });
  const lift = dragY.interpolate({
    inputRange: [-LOCK_DISTANCE, 0],
    outputRange: [-LOCK_DISTANCE, 0],
    extrapolate: "clamp",
  });
  const hintOpacity = dragY.interpolate({
    inputRange: [-LOCK_DISTANCE, 0],
    outputRange: [1, 0.75],
    extrapolate: "clamp",
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
      {listening && !locked ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.lockHint,
            { opacity: hintOpacity, transform: [{ translateY: lift }] },
          ]}
        >
          <Icon name="lock-closed" size={16} color={C.brand} />
          <Icon name="chevron-up" size={14} color={C.muted} />
        </Animated.View>
      ) : null}
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
      <Animated.View
        {...responder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={
          listening
            ? "Recording. Release to stop, or slide up to lock"
            : "Hold to talk. Slide up to lock"
        }
        style={[
          s.mic,
          {
            backgroundColor: listening
              ? C.danger
              : available
                ? C.accent
                : C.pillMuted,
            opacity: disabled ? 0.5 : 1,
            transform: [
              { translateY: listening && !locked ? lift : 0 },
              { scale: listening ? 1.1 : 1 },
            ],
          },
        ]}
      >
        {available && !listening ? (
          <Grad
            colors={C.accentGrad}
            style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
          />
        ) : null}
        <Icon
          name={listening ? "radio-button-on" : "mic"}
          size={26}
          color="#FFFFFF"
        />
      </Animated.View>
    </View>
  );
}

/** Shown instead of the text box while recording is locked. */
export function LockedRecordingBar({
  seconds,
  interim,
  onCancel,
  onStop,
}: {
  seconds: number;
  interim: string;
  onCancel: () => void;
  onStop: () => void;
}) {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <View style={s.lockedBar} accessibilityLiveRegion="polite">
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel recording"
        style={s.lockedBtn}
        hitSlop={8}
      >
        <Icon name="trash-outline" size={20} color={C.danger} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: C.danger,
            }}
          />
          <T
            style={{
              color: C.danger,
              fontWeight: "800",
              fontSize: 12,
              letterSpacing: 0.5,
            }}
          >
            LOCKED · {mm}:{ss}
          </T>
        </View>
        <T
          style={{ color: C.ink, fontSize: 14, marginTop: 2 }}
          numberOfLines={2}
        >
          {interim || "Speak now… tap stop when done"}
        </T>
      </View>
      <Pressable
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel="Stop recording and review text"
        style={[s.lockedBtn, { backgroundColor: C.brand }]}
      >
        <Icon name="stop" size={18} color={C.onBrand} />
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
          <Icon name="bag-check" size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={s.orderTitle}>{o.item_name}</T>
          <T style={{ color: C.muted, fontSize: 13 }}>{o.restaurant_name}</T>
        </View>
        <T style={{ fontSize: 18, fontWeight: "800", color: C.ink }}>
          {rupees(o.total)}
        </T>
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
        <T style={{ color: C.muted, fontSize: 12 }}>
          {new Date(o.created_at).toLocaleString()}
        </T>
      </View>
      <T style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
        Order {o.id} · qty {o.quantity} · pickup
      </T>
      <View style={{ marginTop: 10 }}>
        <Button
          kind="secondary"
          icon="navigate"
          label="Open directions"
          onPress={onDirections}
        />
      </View>
    </View>
  );
}

export function RunCard({ r, onShare }: { r: RunTrace; onShare: () => void }) {
  const meta: Record<string, { icon: IconName; title: string }> = {
    agent: { icon: "chatbubble-ellipses", title: "Assistant turn" },
    confirm: { icon: "checkmark-done-circle", title: "Confirm tap" },
    cancel: { icon: "close-circle", title: "Cancel tap" },
    device_action: { icon: "phone-portrait", title: "Phone action" },
  };
  const m = meta[r.kind] ?? { icon: "ellipse" as IconName, title: r.kind };
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={s.iconBubble}>
            <Icon name={m.icon} size={17} color={C.brand} />
          </View>
          <T style={s.orderTitle}>{m.title}</T>
        </View>
        <Pill
          text={r.status.toUpperCase()}
          bg={ok ? C.brandSoft : C.warnSoft}
          fg={ok ? C.brand : C.warn}
        />
      </View>
      {r.user_text ? (
        <T
          style={{
            color: C.ink,
            fontSize: 14,
            marginTop: 6,
            fontStyle: "italic",
          }}
        >
          “{r.user_text}”
        </T>
      ) : null}
      <T style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
        {new Date(r.started_at).toLocaleTimeString()} · {r.latency_ms ?? "?"} ms
        {r.model ? ` · ${r.model}` : ""}
        {r.iterations ? ` · ${r.iterations} model call(s)` : ""}
      </T>
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Icon
                name={st.status === "ok" ? "checkmark-circle" : "close-circle"}
                size={14}
                color={st.status === "ok" ? C.veg : C.danger}
              />
              <T style={{ fontWeight: "700", fontSize: 13 }}>{st.tool}</T>
            </View>
            <T style={{ fontSize: 13, color: C.ink }}>
              {st.input && Object.keys(st.input as object).length ? (
                <T style={s.mono}> {JSON.stringify(st.input)}</T>
              ) : null}
            </T>
            {st.decision ? (
              <T style={{ color: C.muted, fontSize: 12 }}>{st.decision}</T>
            ) : null}
          </View>
        ))}
      </View>
      {r.error ? (
        <T style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>
          Error: {r.error}
        </T>
      ) : null}
      <T style={{ color: C.muted, fontSize: 10, marginTop: 6 }}>{r.id}</T>
      <View style={{ marginTop: 8 }}>
        <Button
          kind="ghost"
          icon="share-outline"
          label="Export trace (JSON)"
          onPress={onShare}
        />
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  btnShadow: {
    elevation: 3,
    shadowColor: C.brand,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  btnText: { fontSize: 15, fontWeight: "700" },

  header: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.headerPill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: C.headerInk,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: { color: C.headerInk, opacity: 0.75, fontSize: 12 },

  tabBar: {
    flexDirection: "row",
    height: 54,
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  tabItem: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  tabBarWrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 14,
    backgroundColor: C.bg,
  },
  tabPill: {
    position: "absolute",
    left: 0,
    top: 6,
    height: 42,
    borderRadius: 16,
    backgroundColor: C.brandSoft,
  },
  tabIconWrap: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 },
  tabLabel: { fontSize: 10, color: C.muted, fontWeight: "600" },
  badge: {
    position: "absolute",
    top: -5,
    right: -9,
    backgroundColor: C.accent,
    borderRadius: 999,
    minWidth: 15,
    height: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: C.card,
  },

  welcomeCard: {
    overflow: "hidden",
    borderRadius: 24,
    padding: 20,
    gap: 6,
    elevation: 6,
    shadowColor: C.brand,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    elevation: 2,
    shadowColor: C.brand,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
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
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mine: { backgroundColor: C.brand, borderBottomRightRadius: 6 },
  theirs: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderBottomLeftRadius: 6,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
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

  receiptHead: { padding: 16, overflow: "hidden" },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  restIconGlass: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  decoCircle: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#FFFFFF",
    opacity: 0.08,
  },
  receipt: {
    backgroundColor: C.card,
    borderRadius: 24,
    overflow: "hidden",
    elevation: 8,
    shadowColor: C.brand,
    shadowOpacity: C.dark ? 0.4 : 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  sandboxStripe: {
    backgroundColor: C.warnSoft,
    paddingVertical: 7,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
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
    gap: 12,
    backgroundColor: C.cardAlt,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  dashed: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: C.dashed,
  },
  total: {
    fontSize: 34,
    fontWeight: "800",
    color: C.brand,
    letterSpacing: -0.5,
  },
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
    gap: 12,
    alignItems: "center",
    borderRadius: 18,
    padding: 14,
    borderLeftWidth: 4,
  },
  chipLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  chipText: { fontSize: 13, marginTop: 2, lineHeight: 18 },

  lockHint: {
    position: "absolute",
    bottom: 66,
    width: 40,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    gap: 2,
    elevation: 3,
  },
  lockedBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
  },
  lockedBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.dangerSoft,
  },
  mic: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: C.accent,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    elevation: 3,
    shadowColor: C.brand,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  orderTitle: { fontSize: 16, fontWeight: "700", color: C.ink },
  mono: {
    fontFamily: "monospace",
    fontSize: 11,
    color: C.muted,
    fontWeight: "400",
  },
});
