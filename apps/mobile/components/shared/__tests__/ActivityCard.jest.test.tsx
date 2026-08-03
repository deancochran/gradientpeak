import { decodePolyline } from "@repo/core";
import { formatDurationSec } from "@repo/core/utils/dates";
import { fireEvent } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityCard } from "../ActivityCard";
import { createObservationQuantificationBundleFixture } from "./activityQuantificationFixture";

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
}));

jest.mock("@repo/core/utils/dates", () => ({
  __esModule: true,
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

const availableQuantification = createObservationQuantificationBundleFixture({
  estimated: false,
});
const partialQuantification = createObservationQuantificationBundleFixture({
  status: "partial",
});

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
          name: "Brick activity",
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

  it("does not show the legacy activity-category-specific breakdown for multisport activities", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-multisport-load",
          name: "Brick activity",
          activity_kind: "multisport",
          activity_categories: ["bike", "run"],
          distance_meters: 20_000,
          elapsed_ms: 4_500_000,
          derived: null,
          segment_loads: [
            {
              segment_id: "segment-bike",
              activity_category: "bike",
              observationQuantification: null,
            },
            {
              segment_id: "segment-run",
              activity_category: "run",
              observationQuantification: null,
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("ActivityCategory-specific load")).toBeNull();
    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
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
            observationQuantification: availableQuantification,
          },
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("10.0 km")).toBeTruthy();
    expect(screen.getByText("Elapsed")).toBeTruthy();
    expect(screen.getByText("60 min")).toBeTruthy();
    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(
      screen.getByText("Derived. Common Load is available using Run pace threshold."),
    ).toBeTruthy();
    expect(screen.getByText("Observed intensity: RPE 7/10 · Observed")).toBeTruthy();
    expect(screen.queryByText("Avg Pace")).toBeNull();
    expect(screen.queryByText("Avg Power")).toBeNull();
    expect(screen.queryByText("Avg HR")).toBeNull();
  });

  it("uses elapsed time before active time for the Elapsed metric", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-elapsed",
          name: "Paused Ride",
          elapsed_ms: 3_600_000,
          active_ms: 3_000_000,
        }}
      />,
    );

    expect(jest.mocked(formatDurationSec)).toHaveBeenCalledWith(3600);
    expect(screen.getByText("Elapsed")).toBeTruthy();
    expect(screen.queryByText("Active")).toBeNull();
  });

  it("labels active-only timing as Active", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-active-only",
          name: "Indoor Ride",
          active_ms: 3_000_000,
        }}
      />,
    );

    expect(jest.mocked(formatDurationSec)).toHaveBeenCalledWith(3000);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.queryByText("Elapsed")).toBeNull();
  });

  it("marks partial Common Load and normalized intensity incomplete", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-partial",
          name: "Partial Run",
          derived: { observationQuantification: partialQuantification },
        }}
      />,
    );

    expect(screen.getByText("32")).toBeTruthy();
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(screen.getByText(/Derived · Partial/)).toBeTruthy();
  });

  it("renders a canonical unavailable diagnostic", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-unsupported",
          name: "Strength session",
          derived: {
            observationQuantification: createObservationQuantificationBundleFixture({
              activityCategory: "strength",
              status: "unsupported",
            }),
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        "This activity category is not supported for canonical Load. Canonical Load is not available for this activity category.",
      ),
    ).toBeTruthy();
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

    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("distinguishes absent canonical evidence from an unavailable canonical bundle", () => {
    const { rerender } = renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Strength Session",
          activity_kind: "single",
          activity_categories: ["strength"],
          elapsed_ms: 1_800_000,
          derived: {},
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);

    rerender(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Strength Session",
          activity_kind: "single",
          activity_categories: ["strength"],
          elapsed_ms: 1_800_000,
          derived: {
            observationQuantification: createObservationQuantificationBundleFixture({
              activityCategory: "strength",
              status: "unsupported",
            }),
          },
        }}
        variant="list"
      />,
    );

    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(
        "This activity category is not supported for canonical Load. Canonical Load is not available for this activity category.",
      ),
    ).toBeTruthy();
  });

  it("emits canonical fields without retired metric aliases", () => {
    const rendered = renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          activity_kind: "single",
          activity_categories: ["run"],
          started_at: "2026-07-21T00:00:00.000Z",
          elapsed_ms: 3_600_000,
          derived: { observationQuantification: availableQuantification },
        }}
      />,
    );

    expect(JSON.stringify(rendered.toJSON())).not.toMatch(
      /TSS|\bIF\b|intensityFactor|category_load|heart_rate_threshold/,
    );
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
