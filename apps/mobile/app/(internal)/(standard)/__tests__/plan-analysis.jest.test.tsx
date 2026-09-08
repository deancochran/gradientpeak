import { fireEvent } from "@testing-library/react-native";
import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const replace = jest.fn();
const navigate = jest.fn();
const trainingInsightProps = jest.fn();
const captureProductAnalytics = jest.fn();
const getGoalProgressQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: undefined,
  isError: false,
  isLoading: false,
}));
const getThresholdOverviewQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: undefined,
  isError: false,
  isLoading: false,
}));
let mockParams = {
  anchorDate: "2026-04-15",
  goalId: "55555555-5555-4555-8555-555555555555",
  metric: "fitness",
  range: "1y",
  view: "training",
};

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ navigate, replace }),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("@/lib/analytics/productAnalytics", () => ({
  useProductAnalytics: () => ({ capture: captureProductAnalytics }),
}));
jest.mock("@/lib/api", () => ({
  api: {
    athleteIntelligence: {
      getGoalProgress: {
        useQuery: (input: unknown, options: unknown) => getGoalProgressQuery(input, options),
      },
      getThresholdOverview: {
        useQuery: (input: unknown, options: unknown) => getThresholdOverviewQuery(input, options),
      },
    },
  },
}));
jest.mock("@/components/plan/training-path/usePlanTrainingPathData", () => ({
  usePlanTrainingPathData: () => ({
    dailyTrainingPathPoints: [
      { date: "2026-03-01", fitnessCtl: 38 },
      { date: "2026-04-15", fitnessCtl: 42 },
      { date: "2026-05-20", scheduledFitnessCtl: 46 },
    ],
    goalMarkers: [
      {
        activityCategory: "bike",
        id: "55555555-5555-4555-8555-555555555555",
        label: "250 W FTP",
        priority: 8,
        targetDate: "2026-05-20",
      },
    ],
    timelineEndDate: "2026-05-20",
    timelineStartDate: "2026-03-01",
    trainingPath: {
      fitnessHistoryNotice: "Fitness is verified through Apr 15, 2026.",
      todayKey: "2026-04-15",
    },
  }),
}));
jest.mock("@/components/plan/insights/PlanProgressInsight", () => ({
  PlanProgressInsight: () => React.createElement("View", { testID: "progress-insight" }),
}));
jest.mock("@/components/plan/insights/PlanTrainingInsight", () => ({
  PlanTrainingInsight: (props: Record<string, unknown>) => {
    trainingInsightProps(props);
    return React.createElement("View", { testID: "training-insight" });
  },
}));

const PlanAnalysis = require("../plan-analysis").default;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {
    anchorDate: "2026-04-15",
    goalId: "55555555-5555-4555-8555-555555555555",
    metric: "fitness",
    range: "1y",
    view: "training",
  };
});

it("keeps semantic view, metric, range, goal, and anchor state in the route", async () => {
  await renderNative(<PlanAnalysis />);

  expect(screen.getByTestId("plan-analysis-screen")).toBeTruthy();
  expect(screen.getByTestId("plan-analysis-view-training").props.accessibilityState).toEqual({
    selected: true,
  });
  expect(screen.getByTestId("plan-analysis-metric-fitness").props.accessibilityState).toEqual({
    selected: true,
  });
  expect(screen.getByTestId("plan-analysis-metric-load")).toBeTruthy();
  expect(screen.getByTestId("plan-analysis-metric-fatigue")).toBeTruthy();
  expect(screen.getByTestId("plan-analysis-metric-form")).toBeTruthy();
  expect(screen.queryByTestId("plan-analysis-metric-threshold")).toBeNull();
  expect(
    screen.getByTestId("plan-analysis-training-controls-range-1y").props.accessibilityState,
  ).toEqual({
    selected: true,
  });
  expect(trainingInsightProps).toHaveBeenCalledWith(
    expect.objectContaining({ metric: "fitness", selectedDate: "2026-04-15" }),
  );

  await fireEvent.press(screen.getByTestId("plan-analysis-training-controls-range-6w"));
  expect(replace).toHaveBeenCalledWith(
    ROUTES.PLAN.ANALYSIS({
      anchorDate: "2026-04-15",
      goalId: "55555555-5555-4555-8555-555555555555",
      metric: "fitness",
      range: "6w",
      view: "training",
    }),
  );
  expect(captureProductAnalytics).toHaveBeenCalledWith("plan.range_selected", { range: "6w" });
});

it("renders a progress month range without evaluating a week range as months", async () => {
  mockParams = {
    anchorDate: "2026-04-15",
    goalId: "55555555-5555-4555-8555-555555555555",
    metric: "threshold",
    range: "3m",
    view: "progress",
  };
  await renderNative(<PlanAnalysis />);

  expect(screen.getByTestId("plan-analysis-view-progress").props.accessibilityState).toEqual({
    selected: true,
  });
  expect(
    screen.getByTestId("plan-analysis-progress-controls-range-3m").props.accessibilityState,
  ).toEqual({
    selected: true,
  });
  expect(screen.getByTestId("progress-insight")).toBeTruthy();
});

it.each([
  { anchorDate: "2026-02-30", goalId: "55555555-5555-4555-8555-555555555555" },
  { anchorDate: "2026-04-15", goalId: "not-a-uuid" },
])("rejects malformed deep links before enabling analysis queries", async ({
  anchorDate,
  goalId,
}) => {
  mockParams = { anchorDate, goalId, metric: "threshold", range: "3m", view: "progress" };

  await renderNative(<PlanAnalysis />);

  expect(screen.getByTestId("plan-analysis-invalid")).toBeTruthy();
  expect(getGoalProgressQuery).not.toHaveBeenCalled();
  expect(getThresholdOverviewQuery).not.toHaveBeenCalled();
});
