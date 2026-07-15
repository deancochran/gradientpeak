import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const refresh = jest.fn();
let hasUsableData = true;

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Pressable") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("Fallback"),
}));
jest.mock("@/components/shared", () => ({ AppHeader: createHost("AppHeader") }));
jest.mock("@/components/plan/training-path/TrainingPathSection", () => ({
  TrainingPathSection: (props: Record<string, unknown>) =>
    React.createElement("View", { testID: "training-path", ...props }),
}));
jest.mock("@/components/plan/training-path/usePlanTrainingPathData", () => ({
  usePlanTrainingPathData: () => ({
    refreshing: false,
    handleRefresh: refresh,
    queryFailureCount: 2,
    hasUsableData,
    dailyTrainingPathPoints: [],
    chartLoading: false,
    trainingPath: {},
    selectedDate: "2026-01-01",
    selectedWeekGoals: [],
    selectedWeekEvents: [],
    selectedWeekGroupEvents: [],
    selectedWeekCompletedActivities: [],
    selectedWeekLoading: false,
    extendTrainingPathWindowEnd: jest.fn(),
    extendTrainingPathWindowStart: jest.fn(),
    handleWeekScrollStart: jest.fn(),
    handleSelectedDateChange: jest.fn(),
    handleSelectedWeekChange: jest.fn(),
  }),
}));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("@/lib/stores/trainingPreferencesSheetStore", () => ({
  useTrainingPreferencesSheetStore: () => jest.fn(),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: jest.fn() }) }));

const Plan = require("../plan").default;

it("retains usable plan data and retries partial failures", () => {
  renderNative(<Plan />);
  expect(screen.getByText("Some plan details could not be refreshed")).toBeTruthy();
  expect(screen.getByTestId("training-path")).toBeTruthy();
  fireEvent.press(screen.getByTestId("plan-query-retry"));
  expect(refresh).toHaveBeenCalled();
});

it("labels a full load failure accurately", () => {
  hasUsableData = false;
  renderNative(<Plan />);
  expect(screen.getByText("Your plan could not be loaded")).toBeTruthy();
});
