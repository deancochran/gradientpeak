import React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();

const currentEvent = {
  id: "event-current",
  title: "Request Group Preview Run",
  starts_at: "2026-05-30T03:00:00.000Z",
  ends_at: "2026-05-30T04:00:00.000Z",
  cancelled_at: null,
  location_name: "Community Track",
  description: "Visible event for request-to-join group testing.",
  acceptedRsvpCount: 0,
  activityPlanOptions: [{ id: "option-1" }],
  viewerRsvp: null,
  is_recurring_series: false,
  group: { id: "group-1", name: "Request Group", slug: "request-group", avatar_url: null },
};

const upcomingOnlyEvent = {
  ...currentEvent,
  id: "event-other",
  title: "Track Social Run",
  activityPlanOptions: [],
};

const seriesRootEvent = {
  ...currentEvent,
  id: "event-series-root",
  is_recurring_series: true,
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  Image: createHost("Image"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ groupId: "group-1" }),
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: createHost("DetailOverflowMenu"),
  DetailScaffold: ({ children, screenTestID }: any) =>
    React.createElement("View", { testID: screenTestID }, children),
}));

jest.mock("@/components/groups", () => ({
  __esModule: true,
  CurrentGroupEventPlanCard: ({ event }: any) =>
    React.createElement("View", { testID: `current-event-${event.id}` }, event.title),
  GroupAccessLevelBadge: createHost("GroupAccessLevelBadge"),
  GroupEventCard: ({ event }: any) =>
    React.createElement("View", { testID: `group-event-card-${event.id}` }, event.title),
  GroupEventEmptyState: ({ title }: any) => React.createElement("Text", null, title),
  GroupEventListSkeleton: createHost("GroupEventListSkeleton"),
  GroupJoinPolicyBadge: createHost("GroupJoinPolicyBadge"),
  GroupMembersOnlyLockedState: createHost("GroupMembersOnlyLockedState"),
  GroupPrimaryActionBar: createHost("GroupPrimaryActionBar"),
  GroupRelationshipBadge: createHost("GroupRelationshipBadge"),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string | null | undefined) => url ?? null,
}));

jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupActions: () => ({
    deleteMutation: { isPending: false },
    joinMutation: { isPending: false },
    leaveMutation: { isPending: false },
    requestToJoinMutation: { isPending: false },
  }),
  useGroupDetailViewModel: () => ({
    currentEventPlanOptions: { event: currentEvent },
    currentEventPlanOptionsQuery: { isLoading: false },
    group: {
      id: "group-1",
      name: "Request Group",
      slug: "request-group",
      avatar_url: null,
      cover_url: null,
      access_level: "public",
      join_policy: "open",
      description: null,
    },
    groupId: "group-1",
    isError: false,
    isLoading: false,
    members: [],
    membersQuery: { hasNextPage: false },
    viewer: {
      canCreateGroupEvent: false,
      canViewGroupEvents: true,
      canViewMembers: false,
      relationshipState: "member",
    },
  }),
  useGroupEventListViewModel: (input: { startsBefore?: string }) => ({
    events: input.startsBefore ? [] : [currentEvent, seriesRootEvent, upcomingOnlyEvent],
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
  }),
}));

const GroupDetailScreen = require("../group-detail").default;

describe("group detail events", () => {
  it("does not repeat the current event in the upcoming event list", () => {
    renderNative(<GroupDetailScreen />);

    expect(screen.getByTestId("current-event-event-current")).toBeTruthy();
    expect(screen.queryByTestId("group-event-card-event-current")).toBeNull();
    expect(screen.queryByTestId("group-event-card-event-series-root")).toBeNull();
    expect(screen.getByTestId("group-event-card-event-other")).toBeTruthy();
  });
});
