import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

const activityData = {
  activity: {
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "profile-1",
    type: "run",
    name: "Morning Threshold",
    started_at: "2026-03-23T09:00:00.000Z",
    distance_meters: 10400,
    duration_seconds: 3120,
    avg_heart_rate: 162,
    avg_speed_mps: 3.33,
    avg_power: 278,
    likes_count: 0,
    is_private: false,
    notes: "Steady through the middle block.",
    fit_file_path: null,
    activity_plan_id: "plan-1",
    activity_plans: {
      id: "plan-1",
      name: "Threshold Builder",
      structure: { intervals: [] },
    },
    polyline: "encoded",
  },
  derived: {
    stress: {
      tss: 84,
      intensity_factor: 0.88,
    },
    zones: {
      hr: [],
      power: [],
    },
  },
  has_liked: false,
};

const toggleLikeMutateMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

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
  useLocalSearchParams: () => ({ id: activityData.activity.id }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Polyline: createHost("Polyline"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/metric-card", () => ({
  __esModule: true,
  MetricCard: createHost("MetricCard"),
}));
jest.mock("@repo/ui/components/skeleton", () => ({
  __esModule: true,
  Skeleton: createHost("Skeleton"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("@/components/activity", () => ({
  __esModule: true,
  ActivityHeader: createHost("ActivityHeader"),
  ActivityPlanComparison: createHost("ActivityPlanComparison"),
  ZoneDistributionCard: createHost("ZoneDistributionCard"),
}));
jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));
jest.mock("@/components/activity/charts/StreamChart", () => ({
  __esModule: true,
  StreamChart: createHost("StreamChart"),
}));
jest.mock("@/components/activity/maps/ActivityRouteMap", () => ({
  __esModule: true,
  ActivityRouteMap: createHost("ActivityRouteMap"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: "profile-1" } }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      activities: { invalidate: jest.fn() },
      home: { getDashboard: { invalidate: jest.fn() } },
      trends: { invalidate: jest.fn() },
      feed: { getFeed: { invalidate: jest.fn() } },
    }),
    activities: {
      getById: {
        useQuery: () => ({ data: activityData, isLoading: false }),
      },
      delete: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
    profiles: {
      getPublicById: {
        useQuery: () => ({ data: { username: "runner", avatar_url: null } }),
      },
    },
    fitFiles: {
      getStreams: {
        useQuery: () => ({ data: null, isLoading: false, error: null }),
      },
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: toggleLikeMutateMock, isPending: false }),
      },
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0, hasMore: false, nextCursor: undefined }] },
          refetch: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
      },
      addComment: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
  },
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  decodePolyline: () => [
    { latitude: 40.0, longitude: -75.0 },
    { latitude: 40.1, longitude: -75.1 },
  ],
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Clock: createHost("Clock"),
  Ellipsis: createHost("Ellipsis"),
  Heart: createHost("Heart"),
  MapPin: createHost("MapPin"),
  Timer: createHost("Timer"),
  TrendingUp: createHost("TrendingUp"),
  Waves: createHost("Waves"),
  Zap: createHost("Zap"),
}));

const ActivityDetailScreen = require("../activity-detail").default;

describe("activity detail screen", () => {
  beforeEach(() => {
    toggleLikeMutateMock.mockReset();
  });

  it("shows the new identity-first activity layout", () => {
    const rendered = renderNative(<ActivityDetailScreen />);

    expect(screen.getByTestId("activity-detail-options-delete")).toBeTruthy();
    expect(screen.getByTestId("activity-detail-like-button")).toBeTruthy();
    expect(screen.getByText("Distance: 10.40 km")).toBeTruthy();
    expect(screen.getByText("Duration: 52:00")).toBeTruthy();
    expect(screen.getByText("TSS: 84")).toBeTruthy();
    expect(screen.getByText("IF: 0.88")).toBeTruthy();
    expect((rendered as any).UNSAFE_getByType("ActivityPlanComparison")).toBeTruthy();
    expect((rendered as any).UNSAFE_getByType("ActivityRouteMap")).toBeTruthy();
    expect(screen.getByText("Comments (0)")).toBeTruthy();
  });

  it("routes likes through the social mutation", () => {
    renderNative(<ActivityDetailScreen />);

    screen.getByTestId("activity-detail-like-button").props.onPress();

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-4111-8111-111111111111",
      entity_type: "activity",
    });
  });
});
