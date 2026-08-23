import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/feed", () => ({
  __esModule: true,
  FeedList: () =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement("Text", null, "Latest activity"),
      React.createElement("Text", null, "Catch up on the athletes you follow."),
      React.createElement("Text", null, "Feed list rendered"),
    ),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: ({ title }: { title: string }) => React.createElement("Text", null, `Header:${title}`),
}));

jest.mock("@/components/shared/ScreenState", () => ({
  __esModule: true,
  EmptyState: ({ title }: { title: string }) => React.createElement("Text", null, title),
  ErrorState: ({ title }: { title: string }) => React.createElement("Text", null, title),
  LoadingState: ({ message }: { message: string }) => React.createElement("Text", null, message),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    home: {
      getDashboard: {
        useQuery: jest.fn(),
      },
    },
  },
}));

jest.mock("@/lib/performance", () => ({
  __esModule: true,
  usePerformanceScreenReady: jest.fn(),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

const HomeScreen = require("../index").default;
const { api } = require("@/lib/api");

const dashboard = {
  activePlan: { id: "plan-1", name: "Build Base" },
  consistency: { streak: 4, weeklyCount: 3 },
  currentLoadStatus: {
    coverageStatus: "complete",
    loadBalance: -2.4,
    longTermLoad: 42.1,
    maturity: "mature",
    recentLoad: 44.5,
  },
};

describe("home screen", () => {
  beforeEach(() => {
    api.home.getDashboard.useQuery.mockReturnValue({
      data: dashboard,
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });
  });

  it("renders the feed tab shell", async () => {
    await renderNative(<HomeScreen />);

    expect(screen.getByText("Header:Home")).toBeTruthy();
    expect(screen.getByText("Latest activity")).toBeTruthy();
    expect(screen.getByText("Catch up on the athletes you follow.")).toBeTruthy();
    expect(screen.getByText("Feed list rendered")).toBeTruthy();
    expect(screen.queryByText("Your training, at a glance")).toBeNull();
    expect(screen.getByTestId("home-view-tab-feed").props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it("shows only the personal training dashboard after selecting Dashboard", async () => {
    await renderNative(<HomeScreen />);
    await fireEvent.press(screen.getByTestId("home-view-tab-dashboard"));

    expect(screen.getByText("Your training, at a glance")).toBeTruthy();
    expect(screen.getByText("Check your current load, consistency, and active plan.")).toBeTruthy();
    expect(screen.getByText("Fitness")).toBeTruthy();
    expect(screen.getByText("42.1")).toBeTruthy();
    expect(screen.getByText("Fatigue")).toBeTruthy();
    expect(screen.getByText("44.5")).toBeTruthy();
    expect(screen.getByText("Form")).toBeTruthy();
    expect(screen.getByText("-2.4")).toBeTruthy();
    expect(screen.getByText("Consistency")).toBeTruthy();
    expect(screen.getByText("4 days")).toBeTruthy();
    expect(screen.getByText("Active plan")).toBeTruthy();
    expect(screen.getByText("Build Base")).toBeTruthy();
    expect(screen.queryByText("Feed list rendered")).toBeNull();
    expect(screen.getByTestId("home-view-tab-dashboard").props.accessibilityState).toEqual({
      selected: true,
    });

    await fireEvent.press(screen.getByTestId("home-view-tab-feed"));

    expect(screen.getByText("Feed list rendered")).toBeTruthy();
    expect(screen.queryByText("Your training, at a glance")).toBeNull();
  });

  it.each([
    [
      "loading",
      { data: undefined, isError: false, isLoading: true, refetch: jest.fn() },
      "Loading current training...",
    ],
    [
      "error",
      { data: undefined, isError: true, isLoading: false, refetch: jest.fn() },
      "Current training could not be loaded",
    ],
    [
      "unavailable",
      { data: { currentLoadStatus: null }, isError: false, isLoading: false, refetch: jest.fn() },
      "Your training dashboard is not ready yet",
    ],
  ])("shows the Dashboard %s state", async (_state, queryState, expectedMessage) => {
    api.home.getDashboard.useQuery.mockReturnValue(queryState);
    await renderNative(<HomeScreen />);
    await fireEvent.press(screen.getByTestId("home-view-tab-dashboard"));

    expect(screen.getByText(expectedMessage)).toBeTruthy();
    expect(screen.queryByText("Feed list rendered")).toBeNull();
  });
});
