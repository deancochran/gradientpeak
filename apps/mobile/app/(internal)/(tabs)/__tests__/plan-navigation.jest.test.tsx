import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
const refreshMock = jest.fn();
let planView: "overview" | "calendar" = "overview";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ view: planView }),
  useRouter: () => ({ navigate: navigateMock }),
}));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/components/shared", () => ({ AppHeader: createHost("AppHeader") }));
jest.mock("@/components/calendar", () => ({
  CalendarTabView: () => React.createElement("View", { testID: "calendar-tab-view" }),
}));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("@/components/plan/training-path/usePlanTrainingPathData", () => ({
  usePlanTrainingPathData: () => ({
    chartLoading: false,
    chartUnavailable: false,
    dailyTrainingPathPoints: [{ date: "2026-04-15", fitnessCtl: 42 }],
    goalMarkers: [],
    handleRefresh: refreshMock,
    handleSelectedDateChange: jest.fn(),
    handleSelectedWeekChange: jest.fn(),
    hasUsableData: true,
    queryFailureCount: 0,
    refreshing: false,
    selectedDate: "2026-04-15",
    timelineDaysByDate: {},
    trainingPath: { todayKey: "2026-04-15" },
  }),
}));
jest.mock("@/components/plan/training-path/PlanDashboardContent", () => ({
  PlanDashboardContent: ({
    onCreateGoal,
    onOpenGoal,
    onOpenGoals,
    onOpenSourceActivity,
    onViewDetails,
  }: Record<string, (...args: never[]) => void>) =>
    React.createElement(
      "View",
      { testID: "plan-command-center" },
      React.createElement("View", { testID: "plan-selected-day" }),
      React.createElement("TouchableOpacity", {
        onPress: onCreateGoal,
        testID: "create-goal",
      }),
      React.createElement("TouchableOpacity", {
        onPress: onOpenGoals,
        testID: "open-all-goals",
      }),
      React.createElement("TouchableOpacity", {
        onPress: () => onOpenGoal("goal-1" as never),
        testID: "open-goal",
      }),
      React.createElement("TouchableOpacity", {
        onPress: () => onOpenSourceActivity("activity-1" as never),
        testID: "open-source-activity",
      }),
      React.createElement("TouchableOpacity", {
        onPress: () => onViewDetails("2026-04-15" as never, "day" as never),
        testID: "open-day-breakdown",
      }),
      React.createElement("TouchableOpacity", {
        onPress: () => onViewDetails("2026-04-15" as never, "week" as never),
        testID: "open-week-breakdown",
      }),
    ),
}));

const Plan = require("../plan").default;

describe("Plan dashboard navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    planView = "overview";
  });

  it("is vertically scrollable and renders one Plan command center", async () => {
    await renderNative(<Plan />);

    expect(screen.getByTestId("plan-scroll")).toBeTruthy();
    expect(screen.getByTestId("plan-command-center")).toBeTruthy();
    expect(screen.queryByTestId("plan-active-plan-section")).toBeNull();
    expect(screen.queryByTestId("plan-week-overview")).toBeNull();
    expect(screen.getByTestId("plan-selected-day")).toBeTruthy();
  });

  it("routes between the overview and calendar views", async () => {
    await renderNative(<Plan />);

    expect(screen.getByTestId("plan-scroll")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("plan-view-calendar"));
    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/(internal)/(tabs)/plan",
      params: { view: "calendar" },
    });

    planView = "calendar";
    await renderNative(<Plan />);
    expect(screen.getByTestId("calendar-tab-view")).toBeTruthy();
    expect(screen.queryByTestId("plan-scroll")).toBeNull();
  });

  it("opens goals, activities, and the same training breakdown for days and weeks", async () => {
    await renderNative(<Plan />);
    await fireEvent.press(screen.getByTestId("create-goal"));
    expect(navigateMock).toHaveBeenCalledWith(ROUTES.GOALS.CREATE);
    await fireEvent.press(screen.getByTestId("open-all-goals"));
    expect(navigateMock).toHaveBeenCalledWith(ROUTES.GOALS.LIST);
    await fireEvent.press(screen.getByTestId("open-goal"));
    expect(navigateMock).toHaveBeenCalledWith(ROUTES.GOALS.DETAIL("goal-1"));
    await fireEvent.press(screen.getByTestId("open-source-activity"));
    expect(navigateMock).toHaveBeenCalledWith(ROUTES.ACTIVITIES.DETAIL("activity-1"));
    await fireEvent.press(screen.getByTestId("open-day-breakdown"));
    expect(navigateMock).toHaveBeenCalledWith(
      ROUTES.PLAN.PLANNING_LEDGER({ anchorDate: "2026-04-15", period: "day" }),
    );
    await fireEvent.press(screen.getByTestId("open-week-breakdown"));
    expect(navigateMock).toHaveBeenCalledWith(
      ROUTES.PLAN.PLANNING_LEDGER({ anchorDate: "2026-04-15", period: "week" }),
    );
  });
});
