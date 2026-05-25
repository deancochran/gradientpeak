import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

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
    max_heart_rate: 181,
    avg_speed_mps: 3.33,
    avg_power: 278,
    likes_count: 0,
    is_private: false,
    notes: "Steady through the middle block.",
    activity_file_path: null,
    activity_plan_id: "plan-1",
    activity_plans: {
      id: "plan-1",
      name: "Threshold Builder",
      structure: { intervals: [] },
    },
    ingestion: null as null | { status: string; last_error_message?: string | null },
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
const deleteMutateMock = jest.fn();
const authState = { profile: { threshold_hr: 170 }, user: { id: "profile-1" } };
const streamsData = {
  records: [
    { timestamp: "2026-03-23T09:00:00.000Z", heartRate: 142 },
    { timestamp: "2026-03-23T09:01:00.000Z", heartRate: 158 },
    { timestamp: "2026-03-23T09:02:00.000Z", heartRate: 171 },
  ],
  laps: [] as Array<{ totalDistance: number; totalTimerTime: number }>,
};

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
jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));
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
  useAuth: () => authState,
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
        useMutation: () => ({ mutate: deleteMutateMock, isPending: false }),
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
    activityFiles: {
      getStreams: {
        useQuery: () => ({ data: streamsData, isLoading: false, error: null }),
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
  formatDurationSec: (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  },
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  ChevronRight: createHost("ChevronRight"),
  Clock: createHost("Clock"),
  Ellipsis: createHost("Ellipsis"),
  Heart: createHost("Heart"),
  Lock: createHost("Lock"),
  MapPin: createHost("MapPin"),
  MessageCircle: createHost("MessageCircle"),
  Route: createHost("Route"),
  Timer: createHost("Timer"),
  TrendingUp: createHost("TrendingUp"),
  Waves: createHost("Waves"),
  Zap: createHost("Zap"),
}));

const ActivityDetailScreen = require("../activity-detail").default;

describe("activity detail screen", () => {
  beforeEach(() => {
    deleteMutateMock.mockReset();
    toggleLikeMutateMock.mockReset();
    authState.user.id = "profile-1";
    activityData.activity.ingestion = null;
    streamsData.laps = [];
  });

  it("shows the new identity-first activity layout", () => {
    const rendered = renderNative(<ActivityDetailScreen />);

    expect(screen.getByTestId("activity-detail-options-delete")).toBeTruthy();
    expect(screen.getByTestId("activity-detail-like-button")).toBeTruthy();
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getAllByText("10.40 km").length).toBeGreaterThan(0);
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getAllByText("52:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TSS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("~84").length).toBeGreaterThan(0);
    expect(screen.getByText("IF")).toBeTruthy();
    expect(screen.getAllByText("~0.88").length).toBeGreaterThan(0);
    expect((rendered as any).UNSAFE_getAllByType("ZoneDistributionCard")[0].props.zones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Zone 2 (Endurance)" }),
        expect.objectContaining({ label: "Zone 3 (Tempo)" }),
        expect.objectContaining({ label: "Zone 5 (VO2 Max)" }),
      ]),
    );
    expect((rendered as any).UNSAFE_getByType("ActivityPlanComparison").props.onPress).toEqual(
      expect.any(Function),
    );
    expect((rendered as any).UNSAFE_getByType("ActivityRouteMap")).toBeTruthy();
  });

  it("routes likes through the social mutation", () => {
    renderNative(<ActivityDetailScreen />);

    fireEvent.press(screen.getByTestId("activity-detail-like-button"));

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-4111-8111-111111111111",
      entity_type: "activity",
    });
  });

  it("shows lap splits as a comparative visualization", () => {
    streamsData.laps = [
      { totalDistance: 1000, totalTimerTime: 310 },
      { totalDistance: 1000, totalTimerTime: 295 },
      { totalDistance: 1000, totalTimerTime: 322 },
    ];

    renderNative(<ActivityDetailScreen />);

    expect(screen.getByTestId("lap-visualization-card")).toBeTruthy();
    expect(screen.queryByText("Fastest")).toBeNull();
    expect(screen.queryByText("Lap 2")).toBeNull();
    expect(screen.queryByText("1.00 km")).toBeNull();
    expect(screen.getByText("Pace")).toBeTruthy();
    expect(screen.getAllByText("4:55").length).toBeGreaterThan(0);
  });

  it("hides owner-only overflow actions for non-owners", () => {
    authState.user.id = "profile-2";

    renderNative(<ActivityDetailScreen />);

    expect(screen.queryByTestId("activity-detail-options-trigger")).toBeNull();
  });

  it("uses a confirm modal before deleting an activity", () => {
    renderNative(<ActivityDetailScreen />);

    fireEvent.press(screen.getByTestId("activity-detail-options-delete"));

    expect(screen.getByTestId("activity-detail-delete-modal")).toBeTruthy();
    expect(deleteMutateMock).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("activity-detail-delete-confirm"));

    expect(deleteMutateMock).toHaveBeenCalledWith({ id: "11111111-1111-4111-8111-111111111111" });
  });

  it("shows processing state in the analysis charts section while ingestion is pending", () => {
    activityData.activity.ingestion = { status: "processing" };

    renderNative(<ActivityDetailScreen />);

    expect(screen.getByText("Activity file is still processing.")).toBeTruthy();
  });
});
