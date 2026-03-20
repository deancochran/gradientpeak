import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import ScheduledActivitiesListScreen from "../scheduled-activities-list";

const { pushMock, eventsListUseQueryMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  eventsListUseQueryMock: vi.fn(() => ({
    data: { items: [] },
    isLoading: false,
    refetch: vi.fn(async () => undefined),
  })),
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/plan/calendar/ActivityList", () => ({
  ActivityList: createHost("ActivityList"),
}));

vi.mock("@/components/shared", () => ({
  EmptyStateCard: createHost("EmptyStateCard"),
  ListSkeleton: createHost("ListSkeleton"),
}));

vi.mock("@repo/ui/components/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("lucide-react-native", () => ({
  Calendar: createHost("Calendar"),
  Plus: createHost("Plus"),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      trainingPlans: { invalidate: vi.fn(async () => undefined) },
    }),
    events: {
      list: {
        useQuery: eventsListUseQueryMock,
      },
    },
  },
}));

describe("scheduled activities list", () => {
  it("uses schedule-aware query freshness for list data", () => {
    act(() => {
      TestRenderer.create(<ScheduledActivitiesListScreen />);
    });

    expect(eventsListUseQueryMock).toHaveBeenCalledWith(
      { limit: 100 },
      expect.objectContaining({
        staleTime: 0,
        refetchOnMount: "always",
      }),
    );
  });
});
