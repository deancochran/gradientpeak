import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";
import { THEME } from "@repo/ui/theme/native";
import { Appearance, type ColorSchemeName } from "react-native";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedThemeMode = keyof typeof THEME;

export const NAV_THEME: Record<"light" | "dark", Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};

export function resolveThemeMode(
  preference: ThemePreference,
  systemColorScheme: ColorSchemeName = Appearance.getColorScheme(),
): ResolvedThemeMode {
  if (preference === "system") {
    return systemColorScheme === "dark" ? "dark" : "light";
  }

  return preference;
}

export function getNavigationTheme(mode: ResolvedThemeMode): Theme {
  return NAV_THEME[mode];
}

export function getResolvedThemeScale(mode: ResolvedThemeMode) {
  return THEME[mode];
}
