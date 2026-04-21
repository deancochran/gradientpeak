import React from "react";

import { renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const navigateMock = jest.fn();
const eventsListUseQueryMock = jest.fn(() => ({
  data: { items: [] },
  isLoading: false,
  refetch: jest.fn(async () => undefined),
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

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
    Screen: (props: any) =>
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
  EmptyStateCard: createHost("EmptyStateCard"),
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
  });

  it("switches to the calendar tab for schedule actions", () => {
    renderNative(<ScheduledActivitiesListScreen />);

    screen.getByTestId("scheduled-activities-list-calendar-trigger").props.onPress();

    expect(navigateMock).toHaveBeenCalledWith("/(internal)/(tabs)/calendar");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
