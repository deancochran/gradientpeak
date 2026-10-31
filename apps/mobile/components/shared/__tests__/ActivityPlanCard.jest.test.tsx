import { Alert as TestAlert } from "@repo/ui/test/react-native";
import type { ComponentProps } from "react";
import { createActivityPlanSummary } from "../../../test/activity-plan-projection-fixture";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";
import { ActivityPlanCard as ProjectionActivityPlanCard } from "../ActivityPlanCard";

const toggleLikeMutateMock = jest.fn();
const openEntityCommentsMock = jest.fn();
let commentsSheetAvailable = true;
const mockAlert = jest.mocked(TestAlert.alert);
const getPublicShareUrlMock = jest.fn((path: string) => `https://share.gradientpeak.test${path}`);
const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const activityPlanStructure = {
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: id(2),
      name: "Build",
      duration: { type: "time", seconds: 300 },
      targets: [{ type: "RPE", intensity: 7 }],
    },
  ],
};
jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  Circle: createHost("Circle"),
  default: createHost("Svg"),
  Polyline: createHost("Polyline"),
}));
jest.mock("@repo/core", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/core"),
  formatDurationSec: jest.fn(() => "60 min"),
}));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Bike: createHost("Bike"),
  Calendar: createHost("Calendar"),
  Dumbbell: createHost("Dumbbell"),
  Footprints: createHost("Footprints"),
  Heart: createHost("Heart"),
  Waves: createHost("Waves"),
  MessageCircle: createHost("MessageCircle"),
  Share2: createHost("Share2"),
}));
jest.mock("@/lib/share/public-share-url", () => ({
  __esModule: true,
  getPublicShareUrl: (path: string) => getPublicShareUrlMock(path),
}));
jest.mock("@/components/social/EntityCommentsSheetProvider", () => ({
  __esModule: true,
  useEntityCommentsSheet: () =>
    commentsSheetAvailable ? { openEntityComments: openEntityCommentsMock } : null,
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));
jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: ({
    testIDPrefix,
    ...props
  }: Record<string, unknown> & {
    testIDPrefix?: string;
  }) => {
    const Preview = createHost("ActivityPlanContentPreview");
    return <Preview {...props} testID={testIDPrefix} />;
  },
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
function ActivityPlanCard({
  activityPlan,
  ...props
}: Omit<ComponentProps<typeof ProjectionActivityPlanCard>, "plan"> & {
  activityPlan: Parameters<typeof createActivityPlanSummary>[0];
}) {
  return <ProjectionActivityPlanCard {...props} plan={createActivityPlanSummary(activityPlan)} />;
}
const availableMetrics = [
  {
    key: "distance" as const,
    label: "Distance",
    value: 5000,
    unit: "meters",
    status: "available" as const,
    reason: null,
    provenance: "estimated" as const,
  },
  {
    key: "elapsed_duration" as const,
    label: "Duration",
    value: 300,
    unit: "seconds",
    status: "available" as const,
    reason: null,
    provenance: "authored" as const,
  },
  {
    key: "common_load" as const,
    label: "Load",
    value: 64,
    unit: "score",
    status: "available" as const,
    reason: null,
    provenance: "estimated" as const,
  },
  {
    key: "objective_intensity" as const,
    label: "Intensity",
    value: 0.8,
    unit: "ratio",
    status: "available" as const,
    reason: null,
    provenance: "estimated" as const,
  },
];
describe("ActivityPlanCard", () => {
  beforeEach(() => {
    toggleLikeMutateMock.mockReset();
    openEntityCommentsMock.mockReset();
    commentsSheetAvailable = true;
    mockAlert.mockReset();
    getPublicShareUrlMock.mockClear();
  });
  it("shows the owner and category footer on one justified row", async () => {
    const { getByTestId } = await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-1",
          name: "Tempo Builder",
          description: "Progressive tempo with a strong finish.",
          activityCategory: "run",
          updatedAt: "2026-03-21T08:00:00.000Z",
          owner: null,
        }}
      />,
    );
    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    expect(screen.getByText("Progressive tempo with a strong finish.")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("GradientPeak")).toBeTruthy();
    expect(screen.queryByText("Updated Mar 21, 2026")).toBeNull();
    expect(screen.queryByText("By")).toBeNull();
    expect(getByTestId("resource-owner-action-row").props.className).toContain("justify-between");
  });
  it("shows owner and last updated metadata in the footer", async () => {
    await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-1",
          name: "Tempo Builder",
          activityCategory: "run",
          updatedAt: "2026-03-21T08:00:00.000Z",
          owner: {
            id: "owner-1",
            username: "Coach Kim",
            avatarUrl: null,
          },
        }}
      />,
    );
    expect(screen.queryByText("By")).toBeNull();
    expect(screen.getByText("Coach Kim")).toBeTruthy();
    expect(screen.queryByText("Updated Mar 21, 2026")).toBeNull();
  });
  it("shows the canonical plan activity category", async () => {
    await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-run",
          name: "Run builder",
          activityCategory: "run",
        }}
      />,
    );
    expect(screen.getByTestId("resource-category-items").props.accessibilityLabel).toBe("Run");
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.queryByLabelText("Open activity plan Run builder")).toBeNull();
  });
  it("keeps unsupported canonical quantification unavailable without retired fields", async () => {
    const rendered = await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-load",
          name: "Strength builder",
          activityCategory: "strength",
          structure: { ...activityPlanStructure, activity_category: "strength" },
          metrics: [
            {
              key: "distance",
              label: "Distance",
              value: null,
              unit: "meters",
              status: "unavailable",
              reason: "not_prescribed",
              provenance: null,
            },
            {
              key: "elapsed_duration",
              label: "Duration",
              value: null,
              unit: "seconds",
              status: "unavailable",
              reason: "not_prescribed",
              provenance: null,
            },
            {
              key: "common_load",
              label: "Load",
              value: null,
              unit: "score",
              status: "unavailable",
              reason: "unsupported",
              provenance: null,
            },
            {
              key: "objective_intensity",
              label: "Intensity",
              value: null,
              unit: "ratio",
              status: "unavailable",
              reason: "unsupported",
              provenance: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText(/^0(?:\.00|m)?$/)).toBeNull();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(
      /TSS|\bIF\b|category_load|intensityFactor/,
    );
  });
  it("does not duplicate aggregate metrics for a single-activity-category plan", async () => {
    await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-single-activity-category-load",
          name: "Bike tempo",
          activityCategory: "run",
          structure: activityPlanStructure,
          metrics: availableMetrics,
        }}
      />,
    );
    expect(screen.getAllByText("Load")).toHaveLength(1);
    expect(screen.getAllByText("~64")).toHaveLength(1);
    expect(screen.getAllByText("Intensity")).toHaveLength(1);
    expect(screen.getAllByText("~0.80")).toHaveLength(1);
    expect(screen.queryByText(/RPE|Prescribed intensity/)).toBeNull();
  });
  it("renders an unavailable objective intensity as an em dash", async () => {
    await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-range-intensity",
          name: "Easy Swim",
          activityCategory: "swim",
          metrics: [
            ...availableMetrics.filter((metric) => metric.key !== "objective_intensity"),
            {
              key: "objective_intensity" as const,
              label: "Intensity",
              value: null,
              unit: "ratio",
              status: "unavailable" as const,
              reason: "incomplete_objective_coverage",
              provenance: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
  it("keeps compact cards visual, focused, and tappable", async () => {
    const onPress = jest.fn();
    await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-list-1",
          name: "Tempo Builder",
          description: "Progressive tempo with a strong finish.",
          activityCategory: "run",
          metrics: availableMetrics,
          structure: activityPlanStructure,
          createdAt: "2026-03-21T08:00:00.000Z",
          owner: {
            id: "owner-1",
            username: "Coach Kim",
            avatarUrl: null,
          },
        }}
        onPress={onPress}
        testID="activity-plan-compact-card"
        variant="compact"
      />,
    );
    expect(screen.getByTestId("activity-plan-compact-card")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-card-preview-plan-list-1")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("5m")).toBeTruthy();
    expect(screen.queryByText(/~5m|~5 min/)).toBeNull();
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("~5 km")).toBeTruthy();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("~64")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("~0.80")).toBeTruthy();
    expect(screen.queryByText(/RPE|Tempo · 5 min|Steps/)).toBeNull();
    expect(screen.queryByTestId("resource-owner-action-row")).toBeNull();
    expect(screen.queryByText("Coach Kim")).toBeNull();
    expect(screen.queryByText("Like")).toBeNull();
    expect(screen.getByText("Progressive tempo with a strong finish.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("activity-plan-compact-card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it("renders the full authored activity timeline through the canonical preview", async () => {
    await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-route-preview",
          name: "Structured Tempo",
          activityCategory: "run",
          structure: activityPlanStructure,
        }}
      />,
    );
    const preview = screen.getByTestId("activity-plan-card-preview-plan-route-preview");
    expect(preview).toBeTruthy();
    expect(preview.props.plan.structure).toEqual(activityPlanStructure);
    expect(preview.props.presentation.occurrences[0]).toMatchObject({
      intensityLabel: "RPE 7",
      duration: { type: "time", seconds: 300 },
    });
  });
  it("keeps navigation and the like action independent", async () => {
    const onPress = jest.fn();
    await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-like-boundary",
          name: "Tempo Builder",
          activityCategory: "run",
          engagement: { likes: 3, viewerHasLiked: false },
        }}
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Open activity plan Tempo Builder"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(toggleLikeMutateMock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Like, 3 likes"));
    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "plan-like-boundary",
      entity_type: "activity_plan",
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it("opens the app-level comments sheet without navigating from a Discover activity-plan card", async () => {
    const onPress = jest.fn();
    await renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-social",
          name: "Social Tempo",
          activityCategory: "run",
          engagement: { likes: 3, viewerHasLiked: false },
          visibility: "public",
        }}
        onPress={onPress}
      />,
    );
    expect(screen.getByTestId("activity-plan-card-share-button-plan-social")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-card-social-actions")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-card-like-button-plan-social")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-card-comments-button-plan-social")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("activity-plan-card-share-button-plan-social"));
    expect(getPublicShareUrlMock).toHaveBeenCalledWith("/share/activity-plans/plan-social");
    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith(
        "Unable to share",
        "The activity plan could not be shared. Try again.",
      ),
    );
    await fireEvent.press(screen.getByTestId("activity-plan-card-comments-button-plan-social"));
    expect(openEntityCommentsMock).toHaveBeenCalledWith({
      entityId: "plan-social",
      entityType: "activity_plan",
    });
    expect(onPress).not.toHaveBeenCalled();
  });
  it("keeps comments safely unavailable when rendered outside the app provider", async () => {
    commentsSheetAvailable = false;
    const onPress = jest.fn();
    await renderNative(
      <ActivityPlanCard
        activityPlan={{ id: "plan-preview", name: "Preview", activityCategory: "run" }}
        onPress={onPress}
      />,
    );
    expect(
      screen.getByTestId("activity-plan-card-comments-button-plan-preview").props.disabled,
    ).toBe(true);
  });
  it("explains why private activity plans cannot be shared", async () => {
    await renderNative(
      <ActivityPlanCard
        activityPlan={{ id: "plan-private", name: "Private Plan", activityCategory: "run" }}
      />,
    );
    await fireEvent.press(screen.getByTestId("activity-plan-card-share-button-plan-private"));
    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith(
        "Not public",
        "Only public activity plans have a share link. Change visibility to Public first.",
      ),
    );
  });
});
