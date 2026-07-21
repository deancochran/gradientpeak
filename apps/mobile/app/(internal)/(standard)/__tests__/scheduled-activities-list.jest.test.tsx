import React from "react";

import { createHost } from "../../../../test/mock-components";
import { act, fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const navigateMock = jest.fn();
const eventsListUseQueryMock = jest.fn(() => ({
  data: { items: [] as Array<{ id: string }> },
  error: null as Error | null,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: jest.fn(async () => undefined),
}));

type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: StackScreenProps) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useRouter: () => ({ push: pushMock, navigate: navigateMock }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/components/plan/calendar/ActivityList", () => ({
  __esModule: true,
  ActivityList: createHost("ActivityList"),
}));

jest.mock("@/components/shared", () => ({ __esModule: true }));
jest.mock("@repo/ui/components/empty-state-card", () => ({
  __esModule: true,
  EmptyStateCard: ({
    actionLabel,
    description,
    onAction,
    title,
  }: {
    actionLabel?: string;
    description: string;
    onAction?: () => void;
    title: string;
  }) =>
    React.createElement(
      "View",
      null,
      React.createElement("Text", null, title),
      React.createElement("Text", null, description),
      actionLabel
        ? React.createElement(
            "Pressable",
            { accessibilityLabel: actionLabel, accessibilityRole: "button", onPress: onAction },
            actionLabel,
          )
        : null,
    ),
}));
jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  ListSkeleton: createHost("ListSkeleton"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Calendar: createHost("Calendar"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ trainingPlans: { invalidate: jest.fn(async () => undefined) } }),
    events: { list: { useQuery: eventsListUseQueryMock } },
  },
}));

const ScheduledActivitiesListScreen = require("../scheduled-activities-list").default;

describe("scheduled activities list", () => {
  beforeEach(() => {
    eventsListUseQueryMock.mockClear();
    pushMock.mockClear();
    navigateMock.mockClear();
  });

  it("uses schedule-aware query freshness for list data", () => {
    renderNative(<ScheduledActivitiesListScreen />);

    expect(eventsListUseQueryMock).toHaveBeenCalledWith({ limit: 100 }, expect.any(Object));

    const calls = eventsListUseQueryMock.mock.calls as unknown as Array<
      [unknown, Record<string, unknown>?]
    >;
    const options = calls[0]?.[1];
    expect(options).not.toHaveProperty("staleTime");
    expect(options).not.toHaveProperty("refetchOnMount");
    expect(screen.getByTestId("scheduled-activities-list-calendar-trigger")).toBeTruthy();
  });

  it("keeps the calendar action available while loading", () => {
    eventsListUseQueryMock.mockReturnValueOnce({
      data: { items: [] },
      error: null,
      isError: false,
      isFetching: false,
      isLoading: true,
      refetch: jest.fn(async () => undefined),
    });

    renderNative(<ScheduledActivitiesListScreen />);

    expect(screen.getByLabelText("Open calendar")).toBeTruthy();
  });

  it("keeps the calendar action available on errors", () => {
    eventsListUseQueryMock.mockReturnValueOnce({
      data: { items: [] },
      error: new Error("Network unavailable"),
      isError: true,
      isFetching: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    renderNative(<ScheduledActivitiesListScreen />);

    expect(screen.getByLabelText("Open calendar")).toBeTruthy();
    expect(screen.getByText("Unable to load scheduled activities")).toBeTruthy();
  });

  it("keeps cached activities visible with an inline retry warning", async () => {
    const refetch = jest.fn(async () => undefined);
    eventsListUseQueryMock.mockReturnValueOnce({
      data: { items: [{ id: "event-1" }] },
      error: new Error("Refresh failed"),
      isError: true,
      isFetching: false,
      isLoading: false,
      refetch,
    });

    renderNative(<ScheduledActivitiesListScreen />);

    expect(screen.getByText("1 activity scheduled")).toBeTruthy();
    expect(screen.getByText("Refresh failed")).toBeTruthy();
    expect(screen.queryByText("Unable to load scheduled activities")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText("Retry"));
      await Promise.resolve();
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("opens the calendar from the empty-state first-entry action", () => {
    renderNative(<ScheduledActivitiesListScreen />);

    screen.getAllByLabelText("Open calendar")[1]?.props.onPress();

    expect(navigateMock).toHaveBeenCalledWith("/(internal)/(tabs)/calendar");
  });

  it("switches to the calendar tab for schedule actions", () => {
    eventsListUseQueryMock.mockReturnValueOnce({
      data: { items: [{ id: "event-1" }] },
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    renderNative(<ScheduledActivitiesListScreen />);

    screen.getByTestId("scheduled-activities-list-calendar-trigger").props.onPress();

    expect(navigateMock).toHaveBeenCalledWith("/(internal)/(tabs)/calendar");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
