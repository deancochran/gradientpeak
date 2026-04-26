import type { ColorSchemeName } from "react-native";

export const NATIVE_THEME = {
  light: {
    foreground: "#0a0a0a",
    mutedForeground: "#737373",
    primary: "#171717",
  },
  dark: {
    foreground: "#fafafa",
    mutedForeground: "#a1a1a1",
    primary: "#e5e5e5",
  },
} as const;

export function getResolvedNativeTheme(colorScheme: ColorSchemeName) {
  return NATIVE_THEME[colorScheme === "dark" ? "dark" : "light"];
}
