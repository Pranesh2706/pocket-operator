// Typography + gradient primitives shared by every screen.
import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { C, FONT } from "./theme";

function withFont(style: any) {
  const flat = StyleSheet.flatten(style) || {};
  const weight = String(flat.fontWeight ?? "400");
  const family = FONT[weight] ?? FONT["400"];
  // Android needs an explicit family per weight; drop fontWeight so it doesn't fake-bold.
  const { fontWeight, ...rest } = flat;
  return [{ color: C.ink }, rest, { fontFamily: family }];
}

/** Text with the app font. Use instead of <Text>. */
export function T({ style, ...props }: TextProps) {
  return <Text {...props} style={withFont(style)} />;
}

/** TextInput with the app font and theme colours. */
export function Input({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={C.muted}
      keyboardAppearance={C.dark ? "dark" : "light"}
      selectionColor={C.brand}
      {...props}
      style={withFont(style)}
    />
  );
}

export function Grad({
  colors,
  style,
  children,
}: {
  colors: [string, string];
  style?: any;
  children?: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
