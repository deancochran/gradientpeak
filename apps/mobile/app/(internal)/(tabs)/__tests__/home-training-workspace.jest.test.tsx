import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
const setParamsMock = jest.fn();
const retryTimezoneInitializationMock = jest.fn();
const refreshMock = jest.fn();
let trainingPathState: Record<string, unknown>;
let routeDate = "2026-04-15";
const trainingPathInputs: Array<string | null> = [];

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ date: routeDate }),
  useRouter: () => ({ navigate: navigateMock, setParams: setParamsMock }),
}));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/components/shared", () => ({ AppHeader: createHost("AppHeader") }));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("@/components/feed", () => ({
  FeedList: ({ primaryContent }: { primaryContent: React.ReactElement }) =>
    React.createElement("View", { testID: "feed-list" }, primaryContent),
}));
jest.mock("@/components/plan/training-path/usePlanTrainingPathData", () => ({
  usePlanTrainingPathData: (input: string | null) => {
    trainingPathInputs.push(input);
    return trainingPathState;
  },
}));
jest.mock("@/components/plan/training-path/PlanDashboardContent", () => ({
  PlanDashboardContent: (props: {
    onOpenPlannedSession: (sessionId: string) => void;
    onSelectedDateChange: (date: string) => void;
  }) =>
    React.createElement(
      "View",
      { testID: "plan-command-center" },
      React.createElement("TouchableOpacity", {
        onPress: () => props.onSelectedDateChange("2026-04-16"),
        testID: "select-training-date",
      }),
      React.createElement("TouchableOpacity", {
        onPress: () => props.onOpenPlannedSession("session-1"),
        testID: "open-planned-session",
      }),
    ),
}));

const Home = require("../index").default;

function readyTrainingPath() {
  return {
    handleRefresh: refreshMock,
    hasUsableData: true,
    planningTimezoneState: "ready",
    queryFailureCount: 0,
    retryTimezoneInitialization: retryTimezoneInitializationMock,
    timezoneInitializing: false,
    timezoneSetupError: null,
  };
}

describe("Home training workspace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeDate = "2026-04-15";
    trainingPathInputs.length = 0;
    trainingPathState = readyTrainingPath();
  });

  it("puts the selected goal/date/session workspace ahead of the secondary feed and retains date context", async () => {
    const view = await renderNative(<Home />);

    expect(screen.getByTestId("home-training-workspace")).toBeTruthy();
    expect(screen.getByTestId("plan-command-center")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("select-training-date"));
    expect(setParamsMock).toHaveBeenCalledWith({ date: "2026-04-16" });
    await fireEvent.press(screen.getByTestId("open-planned-session"));
    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: { id: "session-1", resourceType: "planned_session" },
    });
    routeDate = "2026-04-17";
    await view.rerender(<Home />);
    expect(trainingPathInputs).toContain("2026-04-17");
  });

  it("keeps cached training data visible behind a refresh warning that retries the training path", async () => {
    trainingPathState = {
      ...readyTrainingPath(),
      queryFailureCount: 1,
    };
    await renderNative(<Home />);

    expect(screen.getByTestId("plan-command-center")).toBeTruthy();
    expect(screen.getByTestId("home-training-refresh-warning")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("home-training-refresh-retry"));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a blocking training failure separate from the feed and provides retry", async () => {
    trainingPathState = {
      ...readyTrainingPath(),
      hasUsableData: false,
      queryFailureCount: 1,
    };
    await renderNative(<Home />);

    expect(screen.getByTestId("home-training-error")).toBeTruthy();
    expect(screen.queryByTestId("plan-command-center")).toBeNull();
    await fireEvent.press(screen.getByTestId("home-training-retry"));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable setup state until planning timezone initialization resolves", async () => {
    trainingPathState = {
      ...readyTrainingPath(),
      planningTimezoneState: "initializing",
      timezoneSetupError: "Plan setup could not be completed. Check your connection and retry.",
    };
    await renderNative(<Home />);

    await fireEvent.press(screen.getByTestId("home-training-setup-retry"));
    expect(retryTimezoneInitializationMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("plan-command-center")).toBeNull();
  });
});
