import { decodePolyline } from "@repo/core";
import { fireEvent } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityCard } from "../ActivityCard";

const toggleLikeMutateMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: mockCreateHost("Pressable"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: mockCreateHost("Svg"),
  Polyline: mockCreateHost("Polyline"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@repo/core", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/core"),
  decodePolyline: jest.fn(() => []),
  formatDurationSec: jest.fn(() => "60 min"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: mockCreateHost("Activity"),
  Bike: mockCreateHost("Bike"),
  ChevronRight: mockCreateHost("ChevronRight"),
  Dumbbell: mockCreateHost("Dumbbell"),
  Footprints: mockCreateHost("Footprints"),
  Heart: mockCreateHost("Heart"),
  MessageCircle: mockCreateHost("MessageCircle"),
  Route: mockCreateHost("Route"),
  Waves: mockCreateHost("Waves"),
}));

jest.mock("@/components/shared/StaticRouteMapPreview", () => ({
  __esModule: true,
  StaticRouteMapPreview: mockCreateHost("StaticRouteMapPreview"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: toggleLikeMutateMock }),
      },
    },
  },
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

jest.mock("@/lib/hooks/usePreferredUnitSystem", () => ({
  __esModule: true,
  usePreferredUnitSystem: jest.fn(() => "metric"),
}));

const mockUsePreferredUnitSystem = jest.mocked(usePreferredUnitSystem);

const availableCommonLoad = {
  status: "available" as const,
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  sport: "run" as const,
  method: "run_pace_threshold" as const,
  load: 64,
  intensity: 0.8,
  contributingDurationSeconds: 3600,
  quality: {
    source: "validated_test" as const,
    observed_at: "2026-07-20T12:00:00.000Z",
    confidence: "high" as const,
    stale: false,
    estimate: false,
    calculation_version: "threshold-v1",
    evidence_fingerprint: "quality-run",
  },
  thresholdEvidence: {
    type: "threshold_speed_mps" as const,
    value: 4,
    unit: "meters_per_second" as const,
    source: "validated_test" as const,
    observedAt: "2026-07-20T12:00:00.000Z",
    validAt: "2026-07-20T12:00:00.000Z",
    freshness: "current" as const,
    calculationVersion: "threshold-v1",
    sourceFingerprint: "threshold-run",
  },
  evidenceFingerprint: "activity-run",
  computedAsOf: "2026-07-21T12:00:00.000Z",
  estimated: false,
};
const {
  status: _status,
  load: _load,
  intensity: _intensity,
  contributingDurationSeconds: _duration,
  estimated: _estimated,
  ...commonLoadProvenance
} = availableCommonLoad;
const partialCommonLoad = {
  status: "partial" as const,
  ...commonLoadProvenance,
  load: 32,
  intensity: 0.8,
  contributingDurationSeconds: 1800,
  eligibleDurationSeconds: 3600,
  sourceTimeCoverage: 0.5,
  reason: "activity_data_partial" as const,
};
const unavailableAggregate = {
  status: "unavailable" as const,
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  contributingDurationSeconds: 0,
  knownDurationSeconds: 3_600,
  contributingActivityCount: 0,
  partialActivityCount: 0,
  unavailableActivityCount: 1,
  totalActivityCount: 1,
  activityCountCoverage: 0,
  knownDurationCoverage: 0,
  unknownDurationActivityCount: 0,
  reason: "no_load_data" as const,
};

describe("ActivityCard", () => {
  beforeEach(() => {
    toggleLikeMutateMock.mockReset();
    jest.mocked(decodePolyline).mockReturnValue([]);
    mockUsePreferredUnitSystem.mockReturnValue("metric");
  });

  it("shows a like action by default in list mode", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          activity_kind: "single",
          activity_categories: ["run"],
          started_at: "2026-03-21T12:00:00.000Z",
          likes_count: 2,
          has_liked: false,
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Morning Run")).toBeTruthy();
    expect(screen.getByTestId("activity-card-like-button-activity-1")).toBeTruthy();
  });

  it("shows an icon and label for every unique multisport category", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-multisport",
          name: "Brick workout",
          activity_kind: "multisport",
          activity_categories: ["run", "bike", "run"],
        }}
      />,
    );

    expect(screen.getByTestId("resource-category-items").props.accessibilityLabel).toBe(
      "Run, Bike",
    );
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getAllByText("Bike").length).toBeGreaterThan(0);
  });

  it("does not show the legacy sport-specific breakdown for multisport activities", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-multisport-load",
          name: "Brick workout",
          activity_kind: "multisport",
          activity_categories: ["bike", "run"],
          distance_meters: 20_000,
          elapsed_ms: 4_500_000,
          derived: null,
          segment_loads: [
            {
              segment_id: "segment-bike",
              category: "bike",
              tss: 52,
              intensity_factor: 0.81,
              method: "power_threshold",
              unavailable_reason: null,
            },
            {
              segment_id: "segment-run",
              category: "run",
              tss: 38,
              intensity_factor: 0.76,
              method: "run_pace_threshold",
              unavailable_reason: null,
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("Sport-specific load")).toBeNull();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText(/TSS|IF/)).toBeNull();
  });

  it("shows activity summary metrics in list mode", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          activity_kind: "single",
          activity_categories: ["run"],
          distance_meters: 10000,
          elapsed_ms: 3_600_000,
          avg_speed_mps: 2.78,
          avg_power: 240,
          avg_heart_rate: 148,
          derived: {
            common_load: availableCommonLoad,
            stress: {
              tss: 72,
              intensity_factor: 0.82,
              method: "power_threshold",
              unavailable_reason: null,
            },
          },
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("10.0 km")).toBeTruthy();
    expect(screen.getByText("Elapsed")).toBeTruthy();
    expect(screen.getByText("60 min")).toBeTruthy();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("Tempo · 0.80")).toBeTruthy();
    expect(screen.queryByText(/TSS|IF/)).toBeNull();
    expect(screen.queryByText("Avg Pace")).toBeNull();
    expect(screen.queryByText("Avg Power")).toBeNull();
    expect(screen.queryByText("Avg HR")).toBeNull();
  });

  it("marks partial common Load and Intensity incomplete", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-partial",
          name: "Partial Run",
          derived: { common_load: partialCommonLoad },
        }}
      />,
    );

    expect(screen.getByText("32 · Incomplete")).toBeTruthy();
    expect(screen.getByText("Tempo · 0.80 · Incomplete")).toBeTruthy();
  });

  it("renders canonical segment HR coverage for an unavailable parent aggregate", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-aggregate-coverage",
          name: "Incomplete HR Run",
          avg_heart_rate: 150,
          derived: { common_load: unavailableAggregate, unavailable_reason: "threshold_missing" },
          segment_loads: [
            {
              segment_id: "segment-hr",
              category: "run",
              common_load: {
                status: "unavailable",
                model: "gradientpeak_relative_load",
                version: "1",
                sport: "run",
                method: "heart_rate_zones",
                quality: {
                  source: "validated_test",
                  observed_at: "2026-07-20T12:00:00.000Z",
                  confidence: "high",
                  stale: false,
                  estimate: false,
                  calculation_version: "threshold-v1",
                  evidence_fingerprint: "quality-hr",
                },
                thresholdEvidence: {
                  type: "lthr_bpm",
                  value: 170,
                  unit: "beats_per_minute",
                  source: "validated_test",
                  observedAt: "2026-07-20T12:00:00.000Z",
                  validAt: "2026-07-20T12:00:00.000Z",
                  freshness: "current",
                  calculationVersion: "threshold-v1",
                  sourceFingerprint: "threshold-hr",
                },
                sessionRpeEvidence: null,
                evidenceFingerprint: "activity-hr",
                computedAsOf: "2026-07-21T12:00:00.000Z",
                contributingDurationSeconds: 1_200,
                eligibleDurationSeconds: 3_600,
                sourceTimeCoverage: 1 / 3,
                reason: "insufficient_coverage",
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText(
        "Heart-rate samples cover 33% of eligible duration; at least 50% is required. Import activity data with more time-weighted heart-rate samples.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/required threshold is missing/)).toBeNull();
  });

  it("formats activity distance in the viewer's imperial units", () => {
    mockUsePreferredUnitSystem.mockReturnValue("imperial");

    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          activity_kind: "single",
          activity_categories: ["run"],
          distance_meters: 5000,
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("3.1 mi")).toBeTruthy();
  });

  it("keeps load metric slots visible when derived values are unavailable", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          activity_kind: "single",
          activity_categories: ["run"],
          distance_meters: 1000,
          elapsed_ms: 600_000,
          derived: null,
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("does not fall back to compatibility TSS and IF fields", () => {
    const { rerender } = renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Strength Session",
          activity_kind: "single",
          activity_categories: ["strength"],
          elapsed_ms: 1_800_000,
          derived: {
            tss: 32,
            intensity_factor: 0.8,
            method: "heart_rate_threshold",
            unavailable_reason: null,
          },
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText(/HR IF|Estimated HR Load|32|0.80/)).toBeNull();

    rerender(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Strength Session",
          activity_kind: "single",
          activity_categories: ["strength"],
          elapsed_ms: 1_800_000,
          derived: {
            common_load: {
              status: "unavailable",
              model: "gradientpeak_relative_load",
              version: "1",
              sport: "strength",
              method: null,
              quality: null,
              thresholdEvidence: null,
              evidenceFingerprint: null,
              computedAsOf: "2026-07-21T12:00:00.000Z",
              contributingDurationSeconds: 1800,
              reason: "unsupported_modality",
            },
            tss: null,
            intensity_factor: null,
            method: null,
            unavailable_reason: "threshold_missing",
          },
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(
      screen.getByText(
        "This activity type is not supported for canonical Load. Canonical Load is not available for this activity type.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/sport-specific LTHR/)).toBeNull();
  });

  it("shows stale threshold source and age without claiming a tested threshold", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Ride",
          activity_kind: "single",
          activity_categories: ["bike"],
          started_at: "2026-04-11T00:00:00.000Z",
          elapsed_ms: 3_600_000,
          derived: {
            tss: 72,
            intensity_factor: 0.82,
            method: "power_threshold",
            unavailable_reason: null,
            calibration_quality: {
              source: "observed_effort",
              observed_at: "2026-01-01T00:00:00.000Z",
              stale: true,
              estimate: true,
            },
          },
        }}
      />,
    );

    expect(screen.getByText("20-minute effort estimate · 100d old · stale")).toBeTruthy();
    expect(screen.queryByText(/tested/i)).toBeNull();
  });

  it("toggles likes using the activity entity type", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          likes_count: 2,
          has_liked: false,
        }}
        variant="list"
      />,
    );

    fireEvent.press(screen.getByTestId("activity-card-like-button-activity-1"));

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "activity-1",
      entity_type: "activity",
    });
  });

  it("keeps navigation, comment, and like actions independent", () => {
    const onCommentPress = jest.fn();
    const onLikePress = jest.fn();
    const onPress = jest.fn();

    renderNative(
      <ActivityCard
        activity={{
          id: "activity-boundaries",
          name: "Boundary Run",
          comments_count: 4,
          likes_count: 2,
          has_liked: false,
        }}
        isLiked={false}
        likeCount={2}
        onCommentPress={onCommentPress}
        onLikePress={onLikePress}
        onPress={onPress}
        showLike
        testID="activity-boundary-card"
        variant="list"
      />,
    );

    const navigation = screen.getByLabelText("Open activity Boundary Run");
    const comment = screen.getByLabelText("Comment, 4 comments");
    const like = screen.getByLabelText("Like, 2 likes");

    expect(navigation.props.accessibilityRole).toBe("button");
    expect(comment.props.accessibilityRole).toBe("button");
    expect(comment.props.className).toContain("min-h-11");
    expect(comment.props.className).toContain("min-w-11");
    expect(like.props.accessibilityRole).toBe("button");

    fireEvent.press(navigation);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onCommentPress).not.toHaveBeenCalled();
    expect(onLikePress).not.toHaveBeenCalled();

    fireEvent.press(comment);
    expect(onCommentPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLikePress).not.toHaveBeenCalled();

    fireEvent.press(like);
    expect(onLikePress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onCommentPress).toHaveBeenCalledTimes(1);
  });

  it("keeps owner profile and card navigation independent", () => {
    const onOwnerPress = jest.fn();
    const onPress = jest.fn();

    renderNative(
      <ActivityCard
        activity={{ id: "activity-owner-boundary", name: "Owner Run" }}
        onOwnerPress={onOwnerPress}
        onPress={onPress}
        owner={{ id: "owner-1", username: "Coach Kim" }}
        showLike={false}
      />,
    );

    const owner = screen.getByLabelText("Open profile for Coach Kim");
    const navigation = screen.getByLabelText("Open activity Owner Run");

    fireEvent.press(owner);
    expect(onOwnerPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();

    fireEvent.press(navigation);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onOwnerPress).toHaveBeenCalledTimes(1);
  });

  it("renders the shared static map preview for list route thumbnails", () => {
    jest.mocked(decodePolyline).mockReturnValue([
      { latitude: 35.1, longitude: -80.1 },
      { latitude: 35.2, longitude: -80.2 },
    ]);

    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          polyline: "encoded-route",
        }}
        variant="list"
      />,
    );

    expect(
      screen.UNSAFE_root.find(
        (node: ReactTestInstance) => String(node.type) === "StaticRouteMapPreview",
      ),
    ).toBeTruthy();
  });

  it("shows lightweight ingestion state for feed and list cards", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          ingestion: { status: "pending_upload" },
        }}
        variant="list"
      />,
    );

    expect(screen.getByTestId("activity-card-ingestion-status-activity-1")).toBeTruthy();
    expect(screen.getByText("Queued for upload")).toBeTruthy();
  });
});
