import { getResolvedThemeScale } from "@/lib/theme";

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: () => null,
  BottomSheetBackdrop: () => null,
  BottomSheetView: () => null,
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: () => null,
  CardContent: () => null,
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: () => null }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: () => null }));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: () => null,
  CompactInsightCard: () => null,
}));

jest.mock("@/components/shared/AppBottomSheet", () => ({
  __esModule: true,
  AppBottomSheetContent: () => null,
}));

jest.mock("@/lib/api", () => ({ __esModule: true, api: {} }));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: () => null,
  Circle: () => null,
  Line: () => null,
  Path: () => null,
}));

const { getTrendNativeVisualTokens } = require("../trends");

describe("getTrendNativeVisualTokens", () => {
  it.each(["light", "dark"] as const)("resolves %s native props from semantic tokens", (mode) => {
    const theme = getResolvedThemeScale(mode);

    expect(getTrendNativeVisualTokens(mode)).toEqual({
      activityIndicatorColor: theme.primary,
      bottomSheetBackgroundStyle: { backgroundColor: theme.popover },
      bottomSheetHandleIndicatorStyle: { backgroundColor: theme.mutedForeground },
      inputPlaceholderColor: theme.mutedForeground,
      refreshControlColor: theme.primary,
    });
  });
});
