import type { ViewStyle } from "react-native";
import { getResolvedThemeScale, type ResolvedThemeMode } from "@/lib/theme";

type NativeBottomSheetVisualTokens = {
  backgroundStyle: Pick<ViewStyle, "backgroundColor">;
  handleIndicatorStyle: Pick<ViewStyle, "backgroundColor">;
};

/**
 * Resolves native-only bottom-sheet colors from the semantic theme scale.
 * Gorhom's native style props cannot consume NativeWind class tokens directly.
 */
export function getNativeBottomSheetVisualTokens(
  mode: ResolvedThemeMode,
): NativeBottomSheetVisualTokens {
  const theme = getResolvedThemeScale(mode);

  return {
    backgroundStyle: { backgroundColor: theme.popover },
    handleIndicatorStyle: { backgroundColor: theme.mutedForeground },
  };
}
