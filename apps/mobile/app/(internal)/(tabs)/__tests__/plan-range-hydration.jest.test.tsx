import React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

let hydrated = false;
let range: "daily" | "weekly" | "monthly" = "weekly";
const sectionProps = jest.fn();

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Button") }));
jest.mock("@repo/ui/components/skeleton", () => ({ Skeleton: createHost("Skeleton") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("Fallback"),
}));
jest.mock("@/components/shared", () => ({ AppHeader: createHost("AppHeader") }));
jest.mock("@/components/plan/training-path/TrainingPathSection", () => ({
  TrainingPathSection: (props: Record<string, unknown>) => {
    sectionProps(props);
    return React.createElement("View", { testID: "training-path" });
  },
}));
jest.mock("@/components/plan/training-path/usePlanTrainingPathData", () => ({
  usePlanTrainingPathData: () => ({
    refreshing: false,
    handleRefresh: jest.fn(),
    queryFailureCount: 0,
    hasUsableData: true,
    dailyTrainingPathPoints: [],
    chartLoading: false,
    chartUnavailable: false,
    trainingPath: {},
    selectedDate: "2026-01-01",
    extendTrainingPathWindowEnd: jest.fn(),
    extendTrainingPathWindowStart: jest.fn(),
    handleSelectedDateChange: jest.fn(),
    handleSelectedWeekChange: jest.fn(),
  }),
}));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("@/lib/stores/planDisplayPreferences", () => ({
  usePlanDisplayPreferences: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ hydrated, range, setRange: jest.fn() }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: jest.fn() }) }));

const Plan = require("../plan").default;

describe("Plan range hydration", () => {
  beforeEach(() => {
    hydrated = false;
    range = "weekly";
    sectionProps.mockClear();
  });

  it.each([
    "weekly",
    "monthly",
  ] as const)("never renders Daily before saved %s hydration completes", (savedRange) => {
    range = savedRange;
    const rendered = renderNative(<Plan />);
    expect(screen.getByTestId("plan-chart-preferences-loading")).toBeTruthy();
    expect(screen.queryByTestId("training-path")).toBeNull();
    expect(sectionProps).not.toHaveBeenCalled();

    hydrated = true;
    rendered.rerender(<Plan />);
    expect(sectionProps).toHaveBeenCalledWith(expect.objectContaining({ chartRange: savedRange }));
  });
});
