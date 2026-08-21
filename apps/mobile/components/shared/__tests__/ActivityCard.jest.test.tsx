import type { ActivityDisplayModel, SemanticMetric } from "@repo/core";
import { formatDurationSec } from "@repo/core/utils/dates";
import { fireEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Alert, Pressable, View } from "react-native";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { createActivityDisplay } from "../../../test/activity-display-fixture";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityCard as ProjectionActivityCard } from "../ActivityCard";

const toggleLikeMutateMock = jest.fn();
const shareMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: mockCreateHost("Pressable"),
  Share: { share: shareMock },
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
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
jest.mock("@repo/ui/components/text", () => {
  const { createHost } = jest.requireActual("../../../test/mock-components");
  return { __esModule: true, Text: createHost("Text") };
});

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
  Share2: mockCreateHost("Share2"),
  Waves: mockCreateHost("Waves"),
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

const availableMetrics: SemanticMetric[] = [
  {
    key: "common_load",
    label: "Load",
    status: "available",
    value: 64,
    unit: "score",
    reason: null,
  },
  {
    key: "normalized_intensity",
    label: "Intensity",
    status: "available",
    value: 0.8,
    unit: "ratio",
    reason: null,
  },
];
const unavailableMetrics: SemanticMetric[] = [
  {
    key: "common_load",
    label: "Load",
    status: "unavailable",
    value: null,
    unit: "score",
    reason: "unavailable",
  },
  {
    key: "normalized_intensity",
    label: "Intensity",
    status: "unavailable",
    value: null,
    unit: "ratio",
    reason: "unavailable",
  },
];

function ActivityCard({
  activity,
  owner,
  ...props
}: Omit<ComponentProps<typeof ProjectionActivityCard>, "activity"> & {
  activity: Partial<ActivityDisplayModel>;
  owner?: { id?: string | null; username?: string | null; avatar_url?: string | null } | null;
}) {
  return (
    <ProjectionActivityCard
      {...props}
      activity={createActivityDisplay({
        ...activity,
        ...(owner
          ? {
              owner: {
                id: owner.id ?? "owner-1",
                username: owner.username ?? null,
                avatarUrl: owner.avatar_url ?? null,
              },
            }
          : {}),
      })}
    />
  );
}

describe("ActivityCard", () => {
  beforeEach(() => {
    shareMock.mockReset();
    toggleLikeMutateMock.mockReset();
    mockUsePreferredUnitSystem.mockReturnValue("metric");
  });

  it("uses one canonical notes and metrics layout across interaction contexts", () => {
    const activity = {
      id: "activity-1",
      title: "Morning Run",
      notes: "Steady aerobic work.",
      activityComposition: { kind: "single" as const, categories: ["run" as const] },
      time: { startedAt: "2026-03-21T12:00:00.000Z", finishedAt: null },
      metrics: [
        {
          key: "elapsed_duration" as const,
          label: "Elapsed",
          status: "available" as const,
          value: 3600,
          unit: "seconds",
          reason: null,
        },
      ],
      engagement: { likes: 2, comments: 0, viewerHasLiked: false },
    };
    const rendered = renderNative(<ActivityCard activity={activity} />);

    expect(screen.getByText("Morning Run")).toBeTruthy();
    expect(screen.getByText("Steady aerobic work.").props.numberOfLines).toBe(2);
    expect(screen.getByTestId("activity-card-metrics").props.className).toBe(
      "flex-row flex-wrap items-start gap-x-5 gap-y-2 px-1",
    );
    expect(screen.getByTestId("activity-card-like-button-activity-1")).toBeTruthy();
    expect(screen.getByTestId("activity-card-comment-button-activity-1")).toBeTruthy();
    expect(screen.getByTestId("activity-card-share-button-activity-1")).toBeTruthy();

    rendered.rerender(<ActivityCard activity={activity} onPress={jest.fn()} />);

    expect(screen.getByText("Morning Run")).toBeTruthy();
    expect(screen.getByText("Steady aerobic work.").props.numberOfLines).toBe(2);
    expect(screen.getByTestId("activity-card-metrics").props.className).toBe(
      "flex-row flex-wrap items-start gap-x-5 gap-y-2 px-1",
    );
    expect(screen.getByTestId("activity-card-like-button-activity-1")).toBeTruthy();
  });

  it("shows an icon and label for every unique multisport category", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-multisport",
          title: "Brick activity",
          activityComposition: { kind: "multisport", categories: ["run", "bike", "run"] },
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
          title: "Brick activity",
          activityComposition: { kind: "multisport", categories: ["bike", "run"] },
          metrics: [
            ...unavailableMetrics,
            {
              key: "distance",
              label: "Distance",
              status: "available",
              value: 20_000,
              unit: "meters",
              reason: null,
            },
            {
              key: "elapsed_duration",
              label: "Elapsed",
              status: "available",
              value: 4500,
              unit: "seconds",
              reason: null,
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("ActivityCategory-specific load")).toBeNull();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the canonical activity summary metrics", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          title: "Morning Run",
          activityComposition: { kind: "single", categories: ["run"] },
          metrics: [
            ...availableMetrics,
            {
              key: "distance",
              label: "Distance",
              status: "available",
              value: 10_000,
              unit: "meters",
              reason: null,
            },
            {
              key: "elapsed_duration",
              label: "Elapsed",
              status: "available",
              value: 3600,
              unit: "seconds",
              reason: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("10.0 km")).toBeTruthy();
    expect(screen.getByText("Elapsed")).toBeTruthy();
    expect(screen.getByText("60 min")).toBeTruthy();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(
      screen.queryByText("Derived. Common Load is available using Run pace threshold."),
    ).toBeNull();
    expect(screen.queryByText("Observed intensity: RPE 7/10 · Observed")).toBeNull();
    expect(screen.queryByText("Avg Pace")).toBeNull();
    expect(screen.queryByText("Avg Power")).toBeNull();
    expect(screen.queryByText("Avg HR")).toBeNull();
  });

  it("uses elapsed time before active time for the Elapsed metric", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-elapsed",
          title: "Paused Ride",
          metrics: [
            {
              key: "elapsed_duration",
              label: "Elapsed",
              status: "available",
              value: 3600,
              unit: "seconds",
              reason: null,
            },
          ],
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
          title: "Indoor Ride",
          metrics: [
            {
              key: "active_duration",
              label: "Active",
              status: "available",
              value: 3000,
              unit: "seconds",
              reason: null,
            },
          ],
        }}
      />,
    );

    expect(jest.mocked(formatDurationSec)).toHaveBeenCalledWith(3000);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.queryByText("Elapsed")).toBeNull();
  });

  it("marks partial Load and Intensity values as estimates", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-partial",
          title: "Partial Run",
          metrics: [
            {
              key: "common_load",
              label: "Load",
              status: "partial",
              value: 32,
              unit: "score",
              reason: "partial",
            },
            {
              key: "normalized_intensity",
              label: "Intensity",
              status: "partial",
              value: 0.8,
              unit: "ratio",
              reason: "partial",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.queryByText("Load (partial)")).toBeNull();
    expect(screen.queryByText("Intensity (partial)")).toBeNull();
    expect(screen.getByText("~32")).toBeTruthy();
    expect(screen.getByText("~0.80")).toBeTruthy();
    expect(screen.queryByText(/Derived · Partial/)).toBeNull();
  });

  it("does not render an unavailable-load diagnostic in the card", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-unsupported",
          title: "Strength session",
          activityComposition: { kind: "single", categories: ["strength"] },
          metrics: unavailableMetrics,
        }}
      />,
    );

    expect(
      screen.queryByText(
        "This activity category is not supported for canonical Load. Canonical Load is not available for this activity category.",
      ),
    ).toBeNull();
  });

  it("formats activity distance in the viewer's imperial units", () => {
    mockUsePreferredUnitSystem.mockReturnValue("imperial");

    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          title: "Morning Run",
          activityComposition: { kind: "single", categories: ["run"] },
          metrics: [
            {
              key: "distance",
              label: "Distance",
              status: "available",
              value: 5000,
              unit: "meters",
              reason: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("3.1 mi")).toBeTruthy();
  });

  it("keeps load metric slots visible when derived values are unavailable", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          title: "Morning Run",
          activityComposition: { kind: "single", categories: ["run"] },
          metrics: [
            ...unavailableMetrics,
            {
              key: "distance",
              label: "Distance",
              status: "available",
              value: 1000,
              unit: "meters",
              reason: null,
            },
            {
              key: "elapsed_duration",
              label: "Elapsed",
              status: "available",
              value: 600,
              unit: "seconds",
              reason: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("distinguishes absent canonical evidence from an unavailable canonical bundle", () => {
    const { rerender } = renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          title: "Strength Session",
          activityComposition: { kind: "single", categories: ["strength"] },
          metrics: unavailableMetrics,
        }}
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);

    rerender(
      <ActivityCard
        activity={{
          id: "activity-1",
          title: "Strength Session",
          activityComposition: { kind: "single", categories: ["strength"] },
          metrics: unavailableMetrics,
        }}
      />,
    );

    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByText(
        "This activity category is not supported for canonical Load. Canonical Load is not available for this activity category.",
      ),
    ).toBeNull();
  });

  it("emits canonical fields without retired metric aliases", () => {
    const rendered = renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          title: "Morning Run",
          activityComposition: { kind: "single", categories: ["run"] },
          time: { startedAt: "2026-07-21T00:00:00.000Z", finishedAt: null },
          metrics: availableMetrics,
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
          title: "Morning Run",
          engagement: { likes: 2, comments: 0, viewerHasLiked: false },
        }}
      />,
    );

    fireEvent.press(screen.getByTestId("activity-card-like-button-activity-1"));

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "activity-1",
      entity_type: "activity",
    });
  });

  it("keeps the shared social action layout and navigation independent", () => {
    const onCommentPress = jest.fn();
    const onLikePress = jest.fn();
    const onPress = jest.fn();
    const onTopRightActionPress = jest.fn();

    renderNative(
      <ActivityCard
        activity={{
          id: "activity-boundaries",
          title: "Boundary Run",
          engagement: { likes: 2, comments: 4, viewerHasLiked: false },
        }}
        isLiked={false}
        likeCount={2}
        onCommentPress={onCommentPress}
        onLikePress={onLikePress}
        onPress={onPress}
        testID="activity-boundary-card"
        topRightAction={
          <Pressable accessibilityLabel="Activity context action" onPress={onTopRightActionPress} />
        }
      />,
    );

    const navigation = screen.getByLabelText("Open activity Boundary Run");
    const comment = screen.getByLabelText("Comment, 4 comments");
    const like = screen.getByLabelText("Like, 2 likes");
    const topRightAction = screen.getByLabelText("Activity context action");

    expect(navigation.props.accessibilityRole).toBe("button");
    expect(comment.props.accessibilityRole).toBe("button");
    expect(comment.props.className).toContain("min-h-11");
    expect(comment.props.className).toContain("min-w-11");
    expect(like.props.accessibilityRole).toBe("button");
    expect(screen.getByTestId("activity-card-social-actions")).toBeTruthy();

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

    fireEvent.press(topRightAction);
    expect(onTopRightActionPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("uses the same share placement as the activity detail header", () => {
    const onSharePress = jest.fn();

    renderNative(
      <ActivityCard
        activity={{ id: "activity-share", title: "Shareable Run" }}
        onSharePress={onSharePress}
        testID="activity-share-card"
      />,
    );

    const share = screen.getByTestId("activity-card-share-button-activity-share");

    expect(
      screen
        .getByTestId("activity-share-card-action-region")
        .findAllByProps({ testID: "activity-card-share-button-activity-share" }).length,
    ).toBeGreaterThan(0);
    expect(share.props.accessibilityLabel).toBe("Share activity");

    fireEvent.press(share);

    expect(onSharePress).toHaveBeenCalledTimes(1);
  });

  it("keeps Share visible and explains when a private activity cannot be shared", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    renderNative(
      <ActivityCard
        activity={{ id: "activity-private", title: "Private Run", visibility: "private" }}
      />,
    );

    fireEvent.press(screen.getByTestId("activity-card-share-button-activity-private"));

    expect(alert).toHaveBeenCalledWith(
      "Not public",
      "Only public activities have a share link. Change visibility to Public first.",
    );
  });

  it("explains when native sharing fails", async () => {
    shareMock.mockRejectedValueOnce(new Error("share failed"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    renderNative(
      <ActivityCard
        activity={{ id: "activity-public", title: "Public Run", visibility: "public" }}
      />,
    );

    fireEvent.press(screen.getByTestId("activity-card-share-button-activity-public"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Unable to share",
        "The activity could not be shared. Try again.",
      ),
    );
  });

  it("keeps top-right actions in the owner region and below-metrics actions after metrics", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-accessory",
          metrics: [
            {
              key: "elapsed_duration",
              label: "Elapsed",
              status: "available",
              value: 60,
              unit: "seconds",
              reason: null,
            },
          ],
        }}
        belowMetricsActions={<View testID="activity-card-content-action" />}
        testID="activity-card-accessory-placement"
        topRightAction={<View testID="activity-card-top-right-action" />}
      />,
    );

    expect(
      screen
        .getByTestId("activity-card-accessory-placement-action-region")
        .findAllByProps({ testID: "activity-card-top-right-action" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getByTestId("activity-card-below-metrics-actions")
        .findAllByProps({ testID: "activity-card-content-action" }).length,
    ).toBeGreaterThan(0);
  });

  it("keeps owner profile and card navigation independent", () => {
    const onOwnerPress = jest.fn();
    const onPress = jest.fn();

    renderNative(
      <ActivityCard
        activity={{ id: "activity-owner-boundary", title: "Owner Run" }}
        onOwnerPress={onOwnerPress}
        onPress={onPress}
        owner={{ id: "owner-1", username: "Coach Kim" }}
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

  it("never renders route previews or route indicators", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          title: "Morning Run",
          capabilities: {
            canLike: true,
            canComment: true,
            canShare: false,
            canEdit: true,
            canDelete: true,
            hasRoute: true,
          },
        }}
      />,
    );

    expect(screen.queryByTestId("activity-card-route-preview-activity-1")).toBeNull();
    expect(screen.queryByText("Route available")).toBeNull();
  });

  it("does not show ingestion text in feed and list cards", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          title: "Morning Run",
        }}
      />,
    );

    expect(screen.queryByTestId("activity-card-ingestion-status-activity-1")).toBeNull();
    expect(screen.queryByText("Queued for upload")).toBeNull();
  });
});
