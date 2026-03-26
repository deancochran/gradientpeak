import React from "react";

import { renderNative } from "../../../../test/render-native";

const pushMock = jest.fn();
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
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock }),
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
  Plus: createHost("Plus"),
}));

jest.mock("@/lib/trpc", () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({ trainingPlans: { invalidate: jest.fn(async () => undefined) } }),
    events: { list: { useQuery: eventsListUseQueryMock } },
  },
}));

const ScheduledActivitiesListScreen = require("../scheduled-activities-list").default;

describe("scheduled activities list", () => {
  beforeEach(() => {
    eventsListUseQueryMock.mockClear();
  });

  it("uses schedule-aware query freshness for list data", () => {
    renderNative(<ScheduledActivitiesListScreen />);

    expect(eventsListUseQueryMock).toHaveBeenCalledWith(
      { limit: 100 },
      expect.objectContaining({ staleTime: 0, refetchOnMount: "always" }),
    );
  });
});
