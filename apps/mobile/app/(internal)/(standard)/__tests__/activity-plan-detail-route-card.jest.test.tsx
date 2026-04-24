import { act } from "@testing-library/react-native";
import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

const localSearchParamsMock = {
  planId: "plan-123",
} as Record<string, string | undefined>;
const routerMock = {
  back: jest.fn(),
  navigate: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};
const navigateToMock = jest.fn();
const routeCardMock = jest.fn((props: any) =>
  React.createElement("RouteCard", props, props.children),
);

const fetchedPlanMock = {
  id: "plan-123",
  name: "Hill Repeats",
  activity_category: "bike",
  profile_id: "profile-1",
  route_id: "route-123",
  structure: { intervals: [] },
};

const routeMock = {
  id: "route-123",
  name: "River Loop",
  activity_category: "bike",
  total_distance: 25000,
  total_ascent: 300,
  total_descent: 300,
  polyline: null,
};

const routeFullMock = {
  coordinates: [
    { latitude: 37.78, longitude: -122.42 },
    { latitude: 37.79, longitude: -122.41 },
  ],
};

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
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
  useRouter: () => routerMock,
  useLocalSearchParams: () => localSearchParamsMock,
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Marker: createHost("Marker"),
  Polyline: createHost("Polyline"),
  PROVIDER_DEFAULT: "default",
}));

jest.mock("@/components/ScheduleActivityModal", () => ({
  __esModule: true,
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

jest.mock("@/components/shared/ActivityPlanSummary", () => ({
  __esModule: true,
  ActivityPlanSummary: createHost("ActivityPlanSummary"),
}));

jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: (props: any) => routeCardMock(props),
}));

jest.mock("@/components/social/EntityCommentsSection", () => ({
  __esModule: true,
  EntityCommentsSection: createHost("EntityCommentsSection"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ profile: { id: "profile-1" } }),
}));

jest.mock("@/lib/hooks/useDeletedDetailRedirect", () => ({
  __esModule: true,
  useDeletedDetailRedirect: () => ({
    beginRedirect: jest.fn(),
    isRedirecting: false,
    redirectOnNotFound: jest.fn(),
  }),
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: jest.fn() },
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      activityPlans: {
        list: { invalidate: jest.fn() },
        getUserPlansCount: { invalidate: jest.fn() },
        getById: { invalidate: jest.fn() },
      },
      events: {
        invalidate: jest.fn(),
        list: { invalidate: jest.fn() },
        getToday: { invalidate: jest.fn() },
      },
      trainingPlans: { invalidate: jest.fn() },
    }),
    activityPlans: {
      getById: { useQuery: () => ({ data: fetchedPlanMock, isLoading: false }) },
      delete: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    events: {
      getById: { useQuery: () => ({ data: null, error: null, isLoading: false }) },
    },
    routes: {
      get: { useQuery: () => ({ data: routeMock }) },
      loadFull: { useQuery: () => ({ data: routeFullMock }) },
    },
    social: {
      toggleLike: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0, hasMore: false, nextCursor: undefined }] },
          refetch: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
      },
      addComment: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
  },
}));

jest.mock("@/lib/activityPlanMetrics", () => ({
  __esModule: true,
  getActivityPlanRoute: () => null,
  getAuthoritativeActivityPlanMetrics: () => ({ estimated_duration: null }),
}));

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));

jest.mock("@/components/activity-plan/useActivityPlanDetailViewModel", () => ({
  __esModule: true,
  useActivityPlanDetailViewModel: () => ({
    activityPlan: fetchedPlanMock,
    detailBadges: ["bike", "My plan"],
    durationLabel: "45m",
    durationMinutes: 45,
    intensityFactor: null,
    isOwnedByUser: true,
    routePreview: null,
    steps: [],
    tss: null,
  }),
}));

jest.mock("@/components/activity-plan/useActivityPlanSchedulingActions", () => ({
  __esModule: true,
  useActivityPlanSchedulingActions: () => ({
    duplicatePending: false,
    handleDuplicate: jest.fn(),
    handleRemoveSchedule: jest.fn(),
    handleReschedule: jest.fn(),
    handleSchedule: jest.fn(),
    isScheduled: false,
    primaryScheduleLabel: "Schedule",
    scheduleModalProps: {},
    scheduledDate: new Date().toISOString(),
  }),
}));

jest.mock("@/components/activity-plan/useActivityPlanSocialController", () => ({
  __esModule: true,
  useActivityPlanSocialController: () => ({
    addCommentPending: false,
    commentCount: 0,
    comments: [],
    handleAddComment: jest.fn(),
    handleToggleLike: jest.fn(),
    isLiked: false,
    likesCount: 0,
    newComment: "",
    setNewComment: jest.fn(),
  }),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronRight: "ChevronRight",
  Ellipsis: "Ellipsis",
  Heart: "Heart",
  MessageCircle: "MessageCircle",
}));

const ActivityPlanDetail = require("../activity-plan-detail").default;

describe("activity plan detail route card", () => {
  beforeEach(() => {
    navigateToMock.mockReset();
    routeCardMock.mockClear();
  });

  it("renders the shared route card and opens route detail on press", () => {
    renderNative(<ActivityPlanDetail />);

    expect(routeCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        route: routeMock,
        routeFull: routeFullMock,
        showAttribution: false,
        variant: "compact",
      }),
    );

    act(() => {
      routeCardMock.mock.calls[0][0].onPress();
    });

    expect(navigateToMock).toHaveBeenCalledWith({
      pathname: "/(internal)/(standard)/route-detail",
      params: { id: "route-123" },
    });
  });
});
