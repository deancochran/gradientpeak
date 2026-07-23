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
  CompactInsightCard: () => null,
}));

jest.mock("@/components/shared/AppBottomSheet", () => ({
  __esModule: true,
  AppBottomSheet: () => null,
}));

jest.mock("@/lib/api", () => ({ __esModule: true, api: {} }));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: () => null,
  Circle: () => null,
  Line: () => null,
  Path: () => null,
}));

const {
  getTrendNativeVisualTokens,
  getTrendsLoadState,
  hasResolvedCommonLoad,
  refetchTrendsSources,
  TREND_CUSTOM_RANGE_SNAP_POINTS,
} = require("../trends");

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

describe("getTrendsLoadState", () => {
  it("counts successful common-load abstention as resolved but not transport errors", () => {
    expect(hasResolvedCommonLoad("available")).toBe(true);
    expect(hasResolvedCommonLoad("unavailable")).toBe(true);
    expect(hasResolvedCommonLoad("error")).toBe(false);
    expect(hasResolvedCommonLoad("loading")).toBe(false);
  });

  it("keeps initial loading visible until any source, including common load, resolves", () => {
    expect(
      getTrendsLoadState({
        hasError: false,
        hasLoadedSource: false,
        insightCount: 0,
        isLoading: true,
      }),
    ).toEqual({ showInitialLoading: true, showFullError: false, showPartialError: false });

    expect(
      getTrendsLoadState({
        hasError: false,
        hasLoadedSource: true,
        insightCount: 3,
        isLoading: true,
      }).showInitialLoading,
    ).toBe(false);
  });

  it("retains independent insight cards when another query fails", () => {
    expect(
      getTrendsLoadState({
        hasError: true,
        hasLoadedSource: true,
        insightCount: 3,
        isLoading: false,
      }),
    ).toEqual({ showInitialLoading: false, showFullError: false, showPartialError: true });
  });

  it("uses the full error only when no independent insight remains", () => {
    expect(
      getTrendsLoadState({
        hasError: true,
        hasLoadedSource: false,
        insightCount: 0,
        isLoading: false,
      }).showFullError,
    ).toBe(true);
  });
});

describe("trend source refresh", () => {
  it("refetches common load history with every preserved trend source", async () => {
    const sources = Object.fromEntries(
      [
        "commonLoad",
        "consistency",
        "peakPower",
        "performance",
        "profileMetrics",
        "volume",
        "zones",
      ].map((name) => [name, { refetch: jest.fn(async () => name) }]),
    );

    await refetchTrendsSources(sources);

    expect(sources.commonLoad.refetch).toHaveBeenCalledTimes(1);
    expect(Object.values(sources).every(({ refetch }) => refetch.mock.calls.length === 1)).toBe(
      true,
    );
  });
});

describe("custom trend range presentation", () => {
  it("opens with a scroll-friendly snap point and can expand near full height", () => {
    expect(TREND_CUSTOM_RANGE_SNAP_POINTS).toEqual(["60%", "92%"]);
  });
});
