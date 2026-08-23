import type { ActivitySegmentAnalysis } from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import React from "react";
import { createObservationQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";
import { APP_BOTTOM_SHEET_PRESENTATIONS } from "@/components/shared/AppBottomSheet";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { createActivityDisplay } from "../../../../test/activity-display-fixture";
import { createActivityPlanDetail } from "../../../../test/activity-plan-projection-fixture";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

type ActivityDetailTestSegment = ActivitySegmentAnalysis & {
  id: string;
  ordinal: number;
  role: "activity";
  activity_category: "run" | "bike";
  startOffsetMs: number;
  endOffsetMs: number;
};

const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

function activitySegment(
  status: "available" | "processing" | "failed" = "available",
  activity_category: "run" | "bike" = "run",
): ActivityDetailTestSegment {
  const identity = {
    id: "22222222-2222-4222-8222-222222222222",
    ordinal: 0,
    role: "activity" as const,
    activity_category,
    startOffsetMs: 0,
    endOffsetMs: 3_120_000,
  };
  if (status === "processing") return { ...identity, status, summary: null };
  if (status === "failed") {
    return { ...identity, status, summary: null, reason: "analysis_failed" };
  }
  return {
    ...identity,
    status,
    summary: {
      version: 1,
      timing: {
        timingCoverage: "complete",
        activeMs: 3_120_000,
        movingMs: 3_000_000,
      },
      normalizedPowerResult: unavailableNormalizedPowerResult,
    },
  };
}

const activitySegments: ActivityDetailTestSegment[] = [activitySegment()];

const activityData = {
  activity: {
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "profile-1",
    profile: { id: "profile-1", username: "runner", avatar_url: null },
    activity_kind: "single",
    segments: activitySegments,
    name: "Morning Threshold",
    started_at: "2026-03-23T09:00:00.000Z",
    distance_meters: 10400,
    elapsed_ms: 3_120_000,
    active_ms: 3_120_000,
    moving_ms: 3_000_000,
    timing_coverage: "complete",
    avg_heart_rate: 162,
    max_heart_rate: 181,
    avg_speed_mps: 3.33,
    avg_power: 278,
    likes_count: 0,
    notes: "Steady through the middle block.",
    current_artifact: {
      id: "33333333-3333-4333-8333-333333333333",
      availability: "accepted",
    } as null | { id: string; availability: string },
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
      method: "run_pace_threshold",
      common_load: {
        status: "available" as const,
        model: "gradientpeak_relative_load" as const,
        version: "1" as const,
        activity_category: "run" as const,
        method: "run_pace_threshold" as const,
        load: (3120 / 3600) * 0.88 ** 2 * 100,
        intensity: 0.88,
        contributingDurationSeconds: 3120,
        estimated: false,
        quality: {
          source: "validated_test" as const,
          observed_at: "2026-03-20T09:00:00.000Z",
          valid_at: "2026-03-20T09:00:00.000Z",
          confidence: "high" as const,
          stale: false,
          estimate: false,
          calculation_version: "threshold-v1",
          evidence_fingerprint: "run-quality",
        },
        thresholdEvidence: {
          type: "threshold_speed_mps" as const,
          value: 4,
          unit: "meters_per_second" as const,
          source: "validated_test" as const,
          observedAt: "2026-03-20T09:00:00.000Z",
          validAt: "2026-03-20T09:00:00.000Z",
          freshness: "current" as const,
          calculationVersion: "threshold-v1",
          sourceFingerprint: "run-threshold",
        },
        evidenceFingerprint: "run-activity",
        computedAsOf: "2026-03-23T09:00:00.000Z",
      },
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
const updatePrivacyMutateMock = jest.fn();
const invalidatePostActivityIngestionQueriesMock = jest.fn();
let deleteMutationOptions: { onSuccess?: () => void } = {};

jest.mock("@repo/api/client", () => ({
  invalidatePostActivityIngestionQueries: invalidatePostActivityIngestionQueriesMock,
}));
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({}),
}));
const getStreamsUseQueryMock = jest.fn();
const shareMock = jest.fn();
const authState = { user: { id: "profile-1" } };

function toActivityProjection(data: typeof activityData) {
  const isOwner = data.activity.profile_id === authState.user.id;
  const commonLoad = data.derived.stress.common_load;
  return {
    detail: {
      contractVersion: "activity-detail-display-v1" as const,
      summary: createActivityDisplay({
        id: data.activity.id,
        href: `/activities/${data.activity.id}`,
        owner: {
          id: data.activity.profile.id,
          username: data.activity.profile.username,
          avatarUrl: data.activity.profile.avatar_url,
        },
        time: { startedAt: data.activity.started_at, finishedAt: null },
        activityComposition: { kind: "single", categories: ["run"] },
        title: data.activity.name,
        notes: data.activity.notes,
        metrics: [
          {
            key: "distance",
            label: "Distance",
            status: "available",
            value: data.activity.distance_meters,
            unit: "meters",
            reason: null,
          },
          {
            key: "elapsed_duration",
            label: "Elapsed",
            status: "available",
            value: data.activity.elapsed_ms / 1_000,
            unit: "seconds",
            reason: null,
          },
          ...(commonLoad.status === "available"
            ? [
                {
                  key: "common_load" as const,
                  label: "Load",
                  status: "available" as const,
                  value: commonLoad.load,
                  unit: "score",
                  reason: null,
                },
                {
                  key: "normalized_intensity" as const,
                  label: "Intensity",
                  status: "available" as const,
                  value: commonLoad.intensity,
                  unit: "ratio",
                  reason: null,
                },
              ]
            : []),
        ],
        visibility:
          "content_visibility" in data.activity
            ? (data.activity.content_visibility as "private" | "followers" | "public")
            : "private",
        engagement: {
          likes: data.activity.likes_count,
          comments: 0,
          viewerHasLiked: data.has_liked,
        },
        capabilities: {
          canLike: true,
          canComment: true,
          canShare: true,
          canEdit: isOwner,
          canDelete: isOwner,
          hasRoute: Boolean(data.activity.polyline),
        },
      }),
      performance: {
        timingCoverage: data.activity.timing_coverage,
        elapsedSeconds: data.activity.elapsed_ms / 1_000,
        activeSeconds: data.activity.active_ms / 1_000,
        movingSeconds: data.activity.moving_ms / 1_000,
        distanceMeters: data.activity.distance_meters,
        elevationGainMeters: null,
        calories: null,
        averageHeartRate: data.activity.avg_heart_rate,
        maximumHeartRate: data.activity.max_heart_rate,
        averagePower: data.activity.avg_power,
        maximumPower: null,
        averageSpeedMetersPerSecond: data.activity.avg_speed_mps,
        maximumSpeedMetersPerSecond: null,
        poolLengthMeters: null,
        totalStrokes: null,
        averageSwolf: null,
      },
      routePolyline: data.activity.polyline,
      laps: streamsData.laps,
      segments: data.activity.segments.map((segment) => ({
        id: segment.id,
        ordinal: segment.ordinal,
        role: segment.role,
        activityCategory: segment.activity_category,
        timingCoverage: segment.summary?.timing.timingCoverage ?? "unavailable",
        status: segment.status,
        summary: segment.summary,
        ...(segment.status === "failed" ? { reason: segment.reason } : {}),
      })),
      linkedPlan: data.activity.activity_plans
        ? { id: data.activity.activity_plans.id, name: data.activity.activity_plans.name }
        : null,
      currentArtifact: data.activity.current_artifact,
      ingestion: data.activity.ingestion
        ? {
            status: data.activity.ingestion.status,
            lastErrorMessage: data.activity.ingestion.last_error_message ?? null,
          }
        : null,
      effectiveSessionRpe: null,
    },
    analysis: {
      derived: data.derived,
      segmentLoads:
        (
          data as typeof activityData & {
            segment_loads?: Array<{
              segment_id: string;
              activity_category: "run" | "bike";
              common_load: typeof unavailableHeartRateSegment;
              observationQuantification: unknown;
            }>;
          }
        ).segment_loads ?? [],
    },
  };
}
const unavailableAggregate = {
  status: "unavailable",
  model: "gradientpeak_relative_load",
  version: "1",
  contributingDurationSeconds: 0,
  knownDurationSeconds: 3_600,
  contributingActivityCount: 0,
  partialActivityCount: 0,
  unavailableActivityCount: 1,
  totalActivityCount: 1,
  activityCountCoverage: 0,
  knownDurationCoverage: 0,
  unknownDurationActivityCount: 0,
  reason: "no_load_data",
} as const;
const unavailableHeartRateSegment = {
  status: "unavailable",
  model: "gradientpeak_relative_load",
  version: "1",
  activity_category: "run",
  method: "heart_rate_zones",
  quality: null,
  thresholdEvidence: null,
  evidenceFingerprint: null,
  computedAsOf: "2026-03-23T09:00:00.000Z",
  contributingDurationSeconds: null,
  reason: "threshold_missing",
} as const;
let activityQueryState: { data: typeof activityData | undefined; isLoading: boolean } = {
  data: activityData,
  isLoading: false,
};
let effortsQueryState: {
  data: Array<{
    id: string;
    activity_category: "run" | "bike";
    effort_type: "speed" | "power" | "heart_rate";
    duration_seconds: number;
    distance_meters: number | null;
    unit: string;
    value: number;
  }>;
  isError: boolean;
  isLoading: boolean;
} = { data: [], isError: false, isLoading: false };
const streamsData = {
  records: [
    { timestamp: "2026-03-23T09:00:00.000Z", heartRate: 142 },
    { timestamp: "2026-03-23T09:01:00.000Z", heartRate: 158 },
    { timestamp: "2026-03-23T09:02:00.000Z", heartRate: 171 },
  ],
  laps: [] as Array<{ totalDistance: number; totalTimerTime: number }>,
  analysis: {
    version: "2" as const,
    activity_category: "run" as const,
    policy: { max_accepted_gap_seconds: 30, minimum_coverage_ratio: 0.7 },
    distributions: {
      heart_rate: {
        quality: {
          status: "sufficient" as const,
          reason: null,
          sample_count: 3,
          observed_span_seconds: 120,
          integrated_seconds: 120,
          coverage_ratio: 1,
          accepted_interval_count: 2,
          rejected_gap_count: 0,
          rejected_gap_seconds: 0,
        },
        threshold: 170,
        threshold_identity: null,
        time_weighted_average: 157,
        zones: [
          { zone: 2, seconds: 60, percentage: 50 },
          { zone: 4, seconds: 60, percentage: 50 },
        ],
      },
      power: {
        quality: {
          status: "insufficient" as const,
          reason: "activity_category_mismatch" as const,
          sample_count: 0,
          observed_span_seconds: 120,
          integrated_seconds: 0,
          coverage_ratio: 0,
          accepted_interval_count: 0,
          rejected_gap_count: 0,
          rejected_gap_seconds: 0,
        },
        threshold: null,
        threshold_identity: null,
        time_weighted_average: null,
        zones: [],
      },
      run_pace: {
        quality: {
          status: "sufficient" as const,
          reason: null,
          sample_count: 3,
          observed_span_seconds: 120,
          integrated_seconds: 120,
          coverage_ratio: 1,
          accepted_interval_count: 2,
          rejected_gap_count: 0,
          rejected_gap_seconds: 0,
        },
        threshold: 3.8,
        threshold_identity: null,
        time_weighted_average: 3.33,
        zones: [{ zone: 3, seconds: 120, percentage: 100 }],
      },
      swim_pace: {
        quality: {
          status: "insufficient" as const,
          reason: "activity_category_mismatch" as const,
          sample_count: 0,
          observed_span_seconds: 120,
          integrated_seconds: 0,
          coverage_ratio: 0,
          accepted_interval_count: 0,
          rejected_gap_count: 0,
          rejected_gap_seconds: 0,
        },
        threshold: null,
        threshold_identity: null,
        time_weighted_average: null,
        zones: [],
      },
    },
    heart_rate_load: {
      value: 62.4,
      reason: null,
      lthr_bpm: 170,
      calculation_version: "lthr_normalized_squared_v1" as const,
      max_heart_rate_bpm: 250 as const,
    },
  },
};

type StackScreenProps = {
  options?: { headerRight?: () => React.ReactNode };
  [key: string]: unknown;
};

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: StackScreenProps) =>
      React.createElement(
        "StackScreen",
        { ...props, testID: "activity-detail-navigation-header" },
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
  Share: { share: shareMock },
  Pressable: createHost("Pressable"),
}));

jest.mock("@/components/shared/AppBottomSheet", () => ({
  __esModule: true,
  APP_BOTTOM_SHEET_PRESENTATIONS: {
    inspector: { initialSnapIndex: 0, snapPoints: ["82%", "96%"] },
  },
  AppBottomSheet: ({
    children,
    visible,
    ...props
  }: {
    children: React.ReactNode;
    visible: boolean;
  }) => (visible ? React.createElement("AppBottomSheet", props, children) : null),
}));

jest.mock("@/components/social/EntityCommentsSection", () => ({
  __esModule: true,
  EntityCommentsSection: (props: { testIDPrefix: string }) =>
    React.createElement("EntityCommentsSection", {
      ...props,
      testID: "activity-detail-comments-section",
    }),
}));

jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: ({
    actions,
    testID,
  }: {
    actions: Array<{ disabled?: boolean; onPress: () => void; testID: string }>;
    testID: string;
  }) =>
    React.createElement(
      "View",
      { testID },
      actions.map((action) =>
        React.createElement("Pressable", {
          disabled: action.disabled,
          key: action.testID,
          onPress: action.onPress,
          testID: action.testID,
        }),
      ),
    ),
  DetailDeleteConfirmModal: ({
    onConfirm,
    testIDPrefix,
  }: {
    onConfirm: () => void;
    testIDPrefix: string;
  }) =>
    React.createElement(
      "View",
      { testID: `${testIDPrefix}-delete-modal` },
      React.createElement("Pressable", {
        onPress: onConfirm,
        testID: `${testIDPrefix}-delete-confirm`,
      }),
    ),
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Polyline: createHost("Polyline"),
}));
jest.mock("@/components/shared/StaticRouteMapPreview", () => ({
  __esModule: true,
  StaticRouteMapPreview: createHost("StaticRouteMapPreview"),
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
jest.mock("@/components/activity/SessionRpeCard", () => ({
  __esModule: true,
  SessionRpeCard: createHost("SessionRpeCard"),
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

jest.mock("@/lib/hooks/usePreferredUnitSystem", () => ({
  __esModule: true,
  usePreferredUnitSystem: jest.fn(() => "metric"),
}));

const mockUsePreferredUnitSystem = jest.mocked(usePreferredUnitSystem);

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      activities: { invalidate: jest.fn() },
      home: { getDashboard: { invalidate: jest.fn() } },
      trends: { invalidate: jest.fn() },
      feed: { getFeed: { invalidate: jest.fn() } },
      athleteIntelligence: { getReadModel: { invalidate: jest.fn() } },
    }),
    activities: {
      getById: {
        useQuery: () => ({
          ...activityQueryState,
          data: activityQueryState.data ? toActivityProjection(activityQueryState.data) : undefined,
        }),
      },
      getEfforts: {
        useQuery: () => effortsQueryState,
      },
      delete: {
        useMutation: (options: typeof deleteMutationOptions) => {
          deleteMutationOptions = options;
          return { mutate: deleteMutateMock, isPending: false };
        },
      },
      update: {
        useMutation: () => ({ mutate: updatePrivacyMutateMock, isPending: false }),
      },
    },
    activityPlans: {
      getById: {
        useQuery: () => ({
          data: {
            detail: createActivityPlanDetail({
              id: "plan-1",
              name: "Threshold Builder",
              metrics: [
                {
                  key: "common_load",
                  label: "Load",
                  status: "available",
                  value: activityData.derived.stress.common_load.load,
                  unit: "score",
                  reason: null,
                },
              ],
            }),
            edit: null,
          },
        }),
      },
    },
    profiles: {
      getPublicById: {
        useQuery: () => ({ data: { username: "runner", avatar_url: null } }),
      },
    },
    activityFiles: {
      getStreams: {
        useQuery: (...args: unknown[]) => {
          getStreamsUseQueryMock(...args);
          return { data: streamsData, isLoading: false, error: null };
        },
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
  ...jest.requireActual("@repo/core"),
  decodePolyline: () => [
    { latitude: 40.0, longitude: -75.0 },
    { latitude: 40.1, longitude: -75.1 },
  ],
}));

jest.mock("@repo/core/utils/dates", () => ({
  __esModule: true,
  formatDurationSec: (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  },
}));

jest.mock("@/lib/services/sentry", () => ({
  __esModule: true,
  captureException: jest.fn(),
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
  Share2: createHost("Share2"),
  Timer: createHost("Timer"),
  TrendingUp: createHost("TrendingUp"),
  Waves: createHost("Waves"),
  Zap: createHost("Zap"),
}));

const ReactNative = require("react-native") as typeof import("react-native");
Object.defineProperty(ReactNative, "Share", {
  configurable: true,
  value: { share: shareMock },
});
const ActivityDetailScreen = require("../activity-detail").default;

describe("activity detail screen", () => {
  beforeEach(() => {
    deleteMutateMock.mockReset();
    getStreamsUseQueryMock.mockReset();
    toggleLikeMutateMock.mockReset();
    updatePrivacyMutateMock.mockReset();
    shareMock.mockReset();
    (ReactNative.Alert.alert as jest.Mock).mockClear();
    authState.user.id = "profile-1";
    activitySegments.splice(0, activitySegments.length, activitySegment());
    activityData.activity.ingestion = null;
    delete (activityData.activity as { content_visibility?: string }).content_visibility;
    activityData.activity.current_artifact = {
      id: "33333333-3333-4333-8333-333333333333",
      availability: "accepted",
    };
    activityQueryState = { data: activityData, isLoading: false };
    effortsQueryState = { data: [], isError: false, isLoading: false };
    streamsData.laps = [];
    mockUsePreferredUnitSystem.mockReturnValue("metric");
  });

  it("renders the loading state before activity data is available", async () => {
    activityQueryState = { data: undefined, isLoading: true };

    await renderNative(<ActivityDetailScreen />);

    expect(screen.getByTestId("activity-detail-loading")).toBeTruthy();
  });

  it("does not read ingestion from an unavailable activity after loading settles", async () => {
    activityQueryState = { data: undefined, isLoading: false };

    await renderNative(<ActivityDetailScreen />);

    expect(screen.getByTestId("activity-detail-loading")).toBeTruthy();
  });

  it("uses the canonical card actions in the activity header and keeps the route in Overview", async () => {
    const rendered = await renderNative(<ActivityDetailScreen />);
    const activityHeader = screen.getByTestId("activity-detail-header");
    const summary = screen.getByTestId("activity-detail-summary");
    const summaryActionRegion = screen.getByTestId("activity-detail-summary-action-region");
    const likeButton = screen.getByTestId(
      "activity-card-like-button-11111111-1111-4111-8111-111111111111",
    );
    const commentButton = screen.getByTestId(
      "activity-card-comment-button-11111111-1111-4111-8111-111111111111",
    );

    expect(screen.getByTestId("activity-detail-options-delete")).toBeTruthy();
    expect(screen.getByText("runner")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Morning Threshold")).toBeTruthy();
    expect(screen.getByText("Steady through the middle block.")).toBeTruthy();
    expect(
      activityHeader
        .queryAll((node) => node.props.testID === "activity-detail-summary")
        .map((node) => node.props.testID),
    ).toEqual(["activity-detail-summary"]);
    expect(screen.queryByTestId("activity-detail-action-row")).toBeNull();
    expect(
      summaryActionRegion.queryAll(
        (node) =>
          node.props["testID"] ===
          "activity-card-share-button-11111111-1111-4111-8111-111111111111",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      summary.queryAll(
        (node) =>
          node.props["testID"] ===
          "activity-card-share-button-11111111-1111-4111-8111-111111111111",
      ),
    ).toHaveLength(0);
    expect(
      summary.queryAll((node) => node.props["testID"] === "activity-card-metrics").length,
    ).toBeGreaterThan(0);
    expect(
      summary.queryAll((node) => node.props["testID"] === "activity-card-social-actions").length,
    ).toBeGreaterThan(0);
    expect(summary.queryAll((node) => String(node.type) === "StaticRouteMapPreview")).toHaveLength(
      0,
    );
    expect(
      screen
        .getByTestId("activity-detail-navigation-header")
        .queryAll(
          (node) =>
            node.props["testID"] ===
            "activity-card-share-button-11111111-1111-4111-8111-111111111111",
        ),
    ).toHaveLength(0);
    const shareButton = screen.getByTestId(
      "activity-card-share-button-11111111-1111-4111-8111-111111111111",
    );
    expect(shareButton.props).toMatchObject({
      accessibilityLabel: "Share activity",
      accessibilityRole: "button",
    });
    expect(shareButton.props.className).toContain("min-h-11");
    expect(
      shareButton.queryAll((node) => node.props["children"] === "Share").length,
    ).toBeGreaterThan(0);
    expect(likeButton.props.accessibilityLabel).toBe("Like, 0 likes");
    expect(commentButton.props.accessibilityLabel).toBe("Comment, 0 comments");
    expect(commentButton.props.accessibilityRole).toBe("button");
    expect(commentButton.props.className).toContain("min-h-11");
    expect(rendered.container.queryAll((node) => node.type === "ActivityRouteMap")[0]).toBeTruthy();
    await fireEvent.press(screen.getByTestId("activity-detail-tab-breakdown"));
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getAllByText("10.4 km").length).toBeGreaterThan(0);
    expect(screen.getByText("Elapsed")).toBeTruthy();
    expect(screen.getAllByText("52:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Load").length).toBeGreaterThan(0);
    expect(screen.getAllByText("67").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Intensity").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\.88/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId("activity-detail-tab-analysis"));
    expect(
      rendered.container.queryAll((node) => node.type === "ZoneDistributionCard")[0]?.props.zones,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Zone 2", time: 60 }),
        expect.objectContaining({ label: "Zone 4", time: 60 }),
      ]),
    );
    expect(screen.getByTestId("activity-stream-hr-load-card")).toBeTruthy();
    expect(screen.getByText("62")).toBeTruthy();
    expect(screen.getByText(/does not replace summary training load/)).toBeTruthy();
    expect(
      rendered.container.queryAll((node) => node.type === "ActivityRouteMap")[0],
    ).toBeUndefined();
    await fireEvent.press(screen.getByTestId("activity-detail-tab-overview"));
    const activityPlanComparison = rendered.container.queryAll(
      (node) => node.type === "ActivityPlanComparison",
    )[0];
    if (!activityPlanComparison) throw new Error("Expected activity plan comparison");
    expect(activityPlanComparison.props.onPress).toEqual(expect.any(Function));
    expect(activityPlanComparison.props.actualMetrics).toMatchObject({
      duration: 3120,
    });
    expect(activityPlanComparison.props.actualMetrics).not.toHaveProperty("common_load");
    expect(activityPlanComparison.props.actualMetrics).not.toHaveProperty("tss");
    expect(activityPlanComparison.props.actualMetrics).not.toHaveProperty("intensity");
    expect(activityPlanComparison.props.activityPlan.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "common_load",
          value: activityData.derived.stress.common_load.load,
        }),
      ]),
    );
  });

  it("renders immutable derived effort evidence on the activity detail", async () => {
    effortsQueryState = {
      data: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          activity_category: "run",
          effort_type: "speed",
          duration_seconds: 1200,
          distance_meters: 5000,
          unit: "meters_per_second",
          value: 4.2,
        },
      ],
      isError: false,
      isLoading: false,
    };

    await renderNative(<ActivityDetailScreen />);
    await fireEvent.press(screen.getByTestId("activity-detail-tab-breakdown"));

    expect(screen.getByTestId("activity-derived-efforts")).toBeTruthy();
    expect(screen.getByText("run speed")).toBeTruthy();
    expect(screen.getByText("20:00 · 5000 m")).toBeTruthy();
    expect(screen.getByText("4.20 m/s")).toBeTruthy();
  });

  it("loads streams for the primary activity segment rather than the first segment row", async () => {
    activitySegments.splice(
      0,
      activitySegments.length,
      {
        id: "warmup-segment",
        ordinal: 0,
        role: "warmup",
        activity_category: null,
      } as unknown as ActivityDetailTestSegment,
      { ...activitySegment("available", "bike"), id: "primary-bike-segment", ordinal: 1 },
    );

    await renderNative(<ActivityDetailScreen />);

    expect(getStreamsUseQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { type: "segment", segmentId: "primary-bike-segment" },
      }),
      expect.anything(),
    );
  });

  it("renders a canonical segment diagnostic for an unavailable parent aggregate", async () => {
    const segmentQuantification = createObservationQuantificationBundleFixture({
      status: "threshold_missing",
    });
    const aggregateQuantification = createObservationQuantificationBundleFixture({
      status: "threshold_missing",
    });
    activityQueryState = {
      data: {
        ...activityData,
        derived: {
          ...activityData.derived,
          stress: { ...activityData.derived.stress, common_load: unavailableAggregate },
          observationQuantification: aggregateQuantification,
        },
        segment_loads: [
          {
            segment_id: "segment-hr",
            activity_category: "run",
            common_load: unavailableHeartRateSegment,
            observationQuantification: segmentQuantification,
          },
        ],
      } as unknown as typeof activityData,
      isLoading: false,
    };

    await renderNative(<ActivityDetailScreen />);
    await fireEvent.press(screen.getByTestId("activity-detail-tab-breakdown"));

    expect(
      screen.getAllByText(/activity-category-specific LTHR is missing for this activity/),
    ).toHaveLength(1);
    expect(screen.queryByText("A required threshold is missing.")).toBeNull();
  });

  it("routes likes through the social mutation", async () => {
    await renderNative(<ActivityDetailScreen />);

    await fireEvent.press(
      screen.getByTestId("activity-card-like-button-11111111-1111-4111-8111-111111111111"),
    );

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-4111-8111-111111111111",
      entity_type: "activity",
    });
  });

  it("switches tab content without rendering non-selected sections", async () => {
    await renderNative(<ActivityDetailScreen />);

    expect(screen.getByTestId("activity-detail-tab-overview").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.queryByTestId("activity-derived-efforts")).toBeNull();

    await fireEvent.press(screen.getByTestId("activity-detail-tab-breakdown"));

    expect(screen.getByTestId("activity-detail-tab-breakdown").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId("activity-derived-efforts")).toBeTruthy();
    expect(screen.queryByTestId("activity-stream-hr-load-card")).toBeNull();
  });

  it("opens comments in a sheet rather than rendering them inline", async () => {
    await renderNative(<ActivityDetailScreen />);

    expect(screen.queryByTestId("activity-detail-comments-section")).toBeNull();
    await fireEvent.press(
      screen.getByTestId("activity-card-comment-button-11111111-1111-4111-8111-111111111111"),
    );

    expect(screen.getByTestId("activity-detail-comments-sheet")).toBeTruthy();
    expect(screen.getByTestId("activity-detail-comments-sheet").props).toMatchObject({
      initialSnapIndex: APP_BOTTOM_SHEET_PRESENTATIONS.inspector.initialSnapIndex,
      snapPoints: APP_BOTTOM_SHEET_PRESENTATIONS.inspector.snapPoints,
    });
    expect(screen.getByTestId("activity-detail-comments-section").props).toMatchObject({
      testIDPrefix: "activity-detail",
    });
  });

  it("keeps Share top-right and preserves its public-visibility guard", async () => {
    await renderNative(<ActivityDetailScreen />);

    await fireEvent.press(
      screen.getByTestId("activity-card-share-button-11111111-1111-4111-8111-111111111111"),
    );

    expect(ReactNative.Alert.alert).toHaveBeenCalledWith(
      "Not public",
      "Only public activities have a share link. Change visibility to Public first.",
    );
    expect(shareMock).not.toHaveBeenCalled();
  });

  it("shares the public activity from the top-right action", async () => {
    (
      activityData.activity as typeof activityData.activity & { content_visibility: string }
    ).content_visibility = "public";
    await renderNative(<ActivityDetailScreen />);

    await fireEvent.press(
      screen.getByTestId("activity-card-share-button-11111111-1111-4111-8111-111111111111"),
    );

    expect(shareMock).toHaveBeenCalledWith({
      message: expect.stringContaining("/share/activities/11111111-1111-4111-8111-111111111111"),
      url: expect.stringContaining("/share/activities/11111111-1111-4111-8111-111111111111"),
    });
  });

  it("changes completed activity visibility through the confirmation action", async () => {
    await renderNative(<ActivityDetailScreen />);

    await fireEvent.press(screen.getByTestId("activity-detail-options-visibility"));

    expect(ReactNative.Alert.alert).toHaveBeenCalledWith(
      "Change visibility",
      "Current visibility is Private.",
      expect.any(Array),
    );
    const actions = (ReactNative.Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    actions.find((action) => action.text === "Public")?.onPress?.();

    expect(updatePrivacyMutateMock).toHaveBeenCalledWith({
      id: activityData.activity.id,
      content_visibility: "public",
    });
  });

  it("shows lap splits as a comparative visualization", async () => {
    streamsData.laps = [
      { totalDistance: 1000, totalTimerTime: 310 },
      { totalDistance: 1000, totalTimerTime: 295 },
      { totalDistance: 1000, totalTimerTime: 322 },
    ];

    await renderNative(<ActivityDetailScreen />);
    await fireEvent.press(screen.getByTestId("activity-detail-tab-breakdown"));

    expect(screen.getByTestId("lap-visualization-card")).toBeTruthy();
    expect(screen.queryByText("Fastest")).toBeNull();
    expect(screen.queryByText("Lap 2")).toBeNull();
    expect(screen.queryByText("1.00 km")).toBeNull();
    expect(screen.getByText("Pace")).toBeTruthy();
    expect(screen.getAllByText("4:55").length).toBeGreaterThan(0);
  });

  it("uses imperial pace and split labels for imperial viewers", async () => {
    streamsData.laps = [{ totalDistance: 1000, totalTimerTime: 295 }];
    mockUsePreferredUnitSystem.mockReturnValue("imperial");

    await renderNative(<ActivityDetailScreen />);
    await fireEvent.press(screen.getByTestId("activity-detail-tab-breakdown"));

    expect(screen.getByText("Mi")).toBeTruthy();
    expect(screen.getByText("7:55")).toBeTruthy();
  });

  it("hides owner-only overflow actions for non-owners", async () => {
    authState.user.id = "profile-2";

    await renderNative(<ActivityDetailScreen />);

    expect(screen.queryByTestId("activity-detail-options-trigger")).toBeNull();
    expect(
      screen.getByTestId("activity-card-share-button-11111111-1111-4111-8111-111111111111"),
    ).toBeTruthy();
  });

  it("uses a confirm modal before deleting an activity", async () => {
    await renderNative(<ActivityDetailScreen />);

    await fireEvent.press(screen.getByTestId("activity-detail-options-delete"));

    expect(screen.getByTestId("activity-detail-delete-modal")).toBeTruthy();
    expect(deleteMutateMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("activity-detail-delete-confirm"));

    expect(deleteMutateMock).toHaveBeenCalledWith({ id: "11111111-1111-4111-8111-111111111111" });
  });

  it("invalidates both Plan read models after activity deletion succeeds", async () => {
    await renderNative(<ActivityDetailScreen />);
    deleteMutationOptions.onSuccess?.();
    expect(invalidatePostActivityIngestionQueriesMock).toHaveBeenCalledTimes(1);
  });

  it("shows processing state in the analysis charts section while ingestion is pending", async () => {
    activityData.activity.ingestion = { status: "processing" };

    await renderNative(<ActivityDetailScreen />);
    await fireEvent.press(screen.getByTestId("activity-detail-tab-analysis"));

    expect(screen.getByText("Activity file is still processing.")).toBeTruthy();
  });

  it("renders an explicit processing state instead of reading a missing segment summary", async () => {
    activitySegments.splice(0, activitySegments.length, activitySegment("processing", "bike"));

    await renderNative(<ActivityDetailScreen />);
    await fireEvent.press(screen.getByTestId("activity-detail-tab-breakdown"));

    expect(screen.getByTestId("activity-segment-analysis-processing")).toBeTruthy();
    expect(screen.queryByTestId("activity-normalized-power-card")).toBeNull();
  });

  it("renders an explicit failed state instead of reading a missing segment summary", async () => {
    activitySegments.splice(0, activitySegments.length, activitySegment("failed", "bike"));

    await renderNative(<ActivityDetailScreen />);
    await fireEvent.press(screen.getByTestId("activity-detail-tab-breakdown"));

    expect(screen.getByTestId("activity-segment-analysis-failed")).toBeTruthy();
    expect(screen.getByText("Segment analysis failed: analysis_failed")).toBeTruthy();
    expect(screen.queryByTestId("activity-normalized-power-card")).toBeNull();
  });
});
