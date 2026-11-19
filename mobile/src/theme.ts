// Colour themes. Change ACTIVE_THEME to switch the whole app (then rebuild the APK).

export type Theme = {
  dark: boolean;
  bg: string;
  card: string;
  cardAlt: string; // inset rows inside cards
  ink: string;
  muted: string;
  line: string;
  headerGrad: [string, string];
  headerInk: string;
  headerPill: string;
  headerPillInk: string;
  brand: string; // primary accents, user bubbles, active tab text
  brandGrad: [string, string]; // primary buttons, send button
  onBrand: string; // text/icons drawn on brand colour
  brandSoft: string;
  accent: string; // mic button
  accentGrad: [string, string];
  accentSoft: string;
  pillMuted: string;
  dashed: string;
  // semantic
  veg: string;
  nonveg: string;
  danger: string;
  dangerSoft: string;
  warn: string;
  warnSoft: string;
  info: string;
  infoSoft: string;
  pendingInk: string;
};

const lightSemantic = {
  veg: "#1F7A44",
  nonveg: "#8B2E16",
  danger: "#B3261E",
  dangerSoft: "#FBE7E5",
  warn: "#8A5A00",
  warnSoft: "#FFF3D4",
  info: "#1E4E8C",
  infoSoft: "#E4EDF9",
  pillMuted: "#EEEEEE",
  onBrand: "#FFFFFF",
  headerInk: "#FFFFFF",
  headerPill: "rgba(255,255,255,0.16)",
  headerPillInk: "#FFE7C7",
  dark: false,
};

export const THEMES: Record<string, Theme> = {
  obsidianGold: {
    dark: true,
    bg: "#0B0B0E",
    card: "#16161B",
    cardAlt: "#1D1D23",
    ink: "#F5F1E8",
    muted: "#9A968C",
    line: "#27272E",
    headerGrad: ["#24221E", "#0B0B0E"],
    headerInk: "#F5F1E8",
    headerPill: "rgba(240,201,135,0.14)",
    headerPillInk: "#F0C987",
    brand: "#E2B46A",
    brandGrad: ["#F3D196", "#C8913F"],
    onBrand: "#1A1408",
    brandSoft: "rgba(226,180,106,0.14)",
    accent: "#E2B46A",
    accentGrad: ["#F3D196", "#C8913F"],
    accentSoft: "rgba(226,180,106,0.12)",
    pillMuted: "rgba(255,255,255,0.08)",
    dashed: "#34343C",
    veg: "#3DBE6E",
    nonveg: "#E0684B",
    danger: "#FF6B5E",
    dangerSoft: "rgba(255,107,94,0.14)",
    warn: "#F2C14E",
    warnSoft: "rgba(242,193,78,0.10)",
    info: "#8DB8FF",
    infoSoft: "rgba(141,184,255,0.10)",
    pendingInk: "#F0C987",
  },
  leaf: {
    ...lightSemantic,
    bg: "#F6F4EC",
    card: "#FFFFFF",
    cardAlt: "#F3F0E6",
    ink: "#17221B",
    muted: "#748070",
    line: "#E7E2D3",
    headerGrad: ["#1F7343", "#0D3A21"],
    headerPillInk: "#FDE7C2",
    brand: "#166235",
    brandGrad: ["#2B8C52", "#135A30"],
    brandSoft: "#E4F1E7",
    accent: "#EE8B3D",
    accentGrad: ["#F7A75C", "#E5762B"],
    accentSoft: "#FDEBDA",
    dashed: "#DCD5C3",
    pendingInk: "#A4501B",
  },
  midnightSaffron: {
    ...lightSemantic,
    bg: "#FAF7F2",
    card: "#FFFFFF",
    cardAlt: "#FAF7F2",
    ink: "#1C1917",
    muted: "#78716C",
    line: "#EAE4DA",
    headerGrad: ["#292524", "#0C0A09"],
    brand: "#EA580C",
    brandGrad: ["#F97316", "#DC4A06"],
    brandSoft: "#FFEDD5",
    accent: "#F59E0B",
    accentGrad: ["#FBBF24", "#F59E0B"],
    accentSoft: "#FEF3C7",
    dashed: "#DDD5C8",
    pendingInk: "#A4501B",
  },
  oceanCoral: {
    ...lightSemantic,
    bg: "#F3F7F7",
    card: "#FFFFFF",
    cardAlt: "#F3F7F7",
    ink: "#13292F",
    muted: "#6B7F84",
    line: "#DDE8E8",
    headerGrad: ["#16677A", "#0B3B47"],
    brand: "#0F4C5C",
    brandGrad: ["#16677A", "#0F4C5C"],
    brandSoft: "#DDEFF1",
    accent: "#FF7A59",
    accentGrad: ["#FF9478", "#FF6A45"],
    accentSoft: "#FFE6DE",
    dashed: "#C9D9DA",
    pendingInk: "#B24A2E",
  },
  plumMango: {
    ...lightSemantic,
    bg: "#F8F6FC",
    card: "#FFFFFF",
    cardAlt: "#F8F6FC",
    ink: "#1E1533",
    muted: "#77708A",
    line: "#E7E2F1",
    headerGrad: ["#6D28D9", "#3B0F7A"],
    brand: "#5B21B6",
    brandGrad: ["#7C3AED", "#5B21B6"],
    brandSoft: "#EDE6FB",
    accent: "#F59E0B",
    accentGrad: ["#FBBF24", "#F59E0B"],
    accentSoft: "#FEF3C7",
    dashed: "#DAD3EA",
    pendingInk: "#9A5B00",
  },
};

export const ACTIVE_THEME: keyof typeof THEMES = "leaf";

const t = THEMES[ACTIVE_THEME];

export const C = {
  ...t,
  // aliases used by existing components
  brand2: t.brand,
  saffron: t.accent,
  saffronSoft: t.accentSoft,
};

/** Font family per weight (Plus Jakarta Sans, bundled with the app). */
export const FONT: Record<string, string> = {
  "400": "PlusJakartaSans_400Regular",
  "500": "PlusJakartaSans_500Medium",
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
  "800": "PlusJakartaSans_800ExtraBold",
  "900": "PlusJakartaSans_800ExtraBold",
};
