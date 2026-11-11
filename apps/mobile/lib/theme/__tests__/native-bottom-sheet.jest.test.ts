import { THEME } from "@repo/tailwindcss/native";
import { getNativeBottomSheetVisualTokens } from "@/lib/theme/native-bottom-sheet";

describe("getNativeBottomSheetVisualTokens", () => {
  it.each(["light", "dark"] as const)("resolves %s semantic surface and handle colors", (mode) => {
    expect(getNativeBottomSheetVisualTokens(mode)).toEqual({
      backgroundStyle: { backgroundColor: THEME[mode].popover },
      handleIndicatorStyle: { backgroundColor: THEME[mode].mutedForeground },
    });
  });
});
