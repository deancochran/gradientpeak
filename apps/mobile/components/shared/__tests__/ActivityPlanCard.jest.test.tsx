import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { ActivityPlanCard } from "../ActivityPlanCard";

const toggleLikeMutateMock = jest.fn();
const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const activityPlanStructure = {
  version: 3,
  segments: [
    {
      id: id(1),
      role: "activity",
      category: "run",
      name: "Tempo run",
      intervals: [
        {
          id: id(2),
          name: "Build",
          repetitions: 1,
          steps: [
            {
              id: id(3),
              name: "Tempo",
              duration: { type: "time", seconds: 300 },
              targets: [{ type: "RPE", intensity: 7 }],
            },
          ],
        },
      ],
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
  }: Record<string, unknown> & { testIDPrefix?: string }) => {
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

describe("ActivityPlanCard", () => {
  beforeEach(() => {
    toggleLikeMutateMock.mockReset();
  });

  it("shows the footer on one justified row under the intensity chart", () => {
    const { getByTestId } = renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-1",
          name: "Tempo Builder",
          description: "Progressive tempo with a strong finish.",
          categories: ["run"],
          primary_category: "run",
          updated_at: "2026-03-21T08:00:00.000",
          owner: null,
        }}
      />,
    );

    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    expect(screen.getByText("Progressive tempo with a strong finish.")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Mar 21, 2026 • 8:00 AM")).toBeTruthy();
    expect(screen.getByText("GradientPeak")).toBeTruthy();
    expect(screen.queryByText("Updated Mar 21, 2026")).toBeNull();
    expect(screen.queryByText("By")).toBeNull();
    expect(getByTestId("resource-owner-action-row").props.className).toContain("justify-between");
  });

  it("shows owner and last updated metadata in the footer", () => {
    renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-1",
          name: "Tempo Builder",
          categories: ["run"],
          primary_category: "run",
          updated_at: "2026-03-21T08:00:00.000",
          owner: {
            id: "owner-1",
            username: "Coach Kim",
            avatar_url: null,
          },
        }}
      />,
    );

    expect(screen.queryByText("By")).toBeNull();
    expect(screen.getByText("Coach Kim")).toBeTruthy();
    expect(screen.queryByText("Updated Mar 21, 2026")).toBeNull();
  });

  it("shows every unique category for a multisport activity plan", () => {
    renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-multisport",
          name: "Brick builder",
          categories: ["run", "bike", "run"],
          primary_category: "run",
        }}
      />,
    );

    expect(screen.getByTestId("resource-category-items").props.accessibilityLabel).toBe(
      "Run, Bike",
    );
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Bike")).toBeTruthy();
    expect(screen.queryByLabelText("Open activity plan Brick builder")).toBeNull();
  });

  it("shows available sport-specific TSS and IF without inventing a parent aggregate", () => {
    renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-multisport-load",
          name: "Brick builder",
          categories: ["bike", "run"],
          primary_category: "bike",
          authoritative_metrics: {
            estimated_duration: 5400,
            estimated_tss: null,
            intensity_factor: null,
          },
          category_loads: [
            {
              category: "bike",
              tss: 64,
              intensity_factor: 0.84,
              method: "power_threshold",
            },
            {
              category: "run",
              tss: null,
              intensity_factor: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Sport-specific load")).toBeTruthy();
    expect(screen.getByText("TSS ~64 · IF ~0.84")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryAllByText("TSS")).toHaveLength(0);
  });

  it("does not duplicate aggregate metrics for a single-sport plan", () => {
    renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-single-sport-load",
          name: "Bike tempo",
          categories: ["bike"],
          primary_category: "bike",
          structure: {
            ...activityPlanStructure,
            segments: activityPlanStructure.segments.map((segment) => ({
              ...segment,
              category: "bike",
            })),
          },
          authoritative_metrics: {
            estimated_duration: 3600,
            estimated_tss: 64,
            intensity_factor: 0.84,
          },
          category_loads: [
            {
              category: "bike",
              tss: 64,
              intensity_factor: 0.84,
              method: "power_threshold",
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("Sport-specific load")).toBeNull();
    expect(screen.getAllByText("TSS")).toHaveLength(1);
    expect(screen.getAllByText("~64")).toHaveLength(1);
    expect(screen.getAllByText("Intensity")).toHaveLength(1);
    expect(screen.getAllByText("~0.84")).toHaveLength(1);
  });

  it("keeps compact cards visual, focused, and tappable", () => {
    const onPress = jest.fn();

    renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-list-1",
          name: "Tempo Builder",
          description: "Progressive tempo with a strong finish.",
          categories: ["run"],
          primary_category: "run",
          authoritative_metrics: {
            estimated_duration: 3600,
            estimated_tss: 72,
            intensity_factor: 0.82,
          },
          route_id: "route-1",
          structure: activityPlanStructure,
          created_at: "2026-03-21T08:00:00.000",
          owner: {
            id: "owner-1",
            username: "Coach Kim",
            avatar_url: null,
          },
        }}
        onPress={onPress}
        route={{ name: "River Loop" }}
        testID="activity-plan-compact-card"
        variant="compact"
      />,
    );

    expect(screen.getByTestId("activity-plan-compact-card")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-card-preview-plan-list-1").props.size).toBe("small");
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("~1h")).toBeTruthy();
    expect(screen.getByText("TSS")).toBeTruthy();
    expect(screen.getByText("~72")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("~0.82")).toBeTruthy();
    expect(screen.queryByTestId("resource-owner-action-row")).toBeNull();
    expect(screen.queryByText("Coach Kim")).toBeNull();
    expect(screen.queryByText("Like")).toBeNull();
    expect(screen.getByText("Progressive tempo with a strong finish.")).toBeTruthy();
    expect(screen.getByText("River Loop")).toBeTruthy();

    fireEvent.press(screen.getByTestId("activity-plan-compact-card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("uses supplied route data in the default visual preview", () => {
    renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-route-preview",
          name: "River Tempo",
          categories: ["run"],
          route_id: "route-1",
        }}
        route={{
          id: "route-1",
          name: "River Loop",
          distance: 5000,
          ascent: 120,
          descent: 100,
        }}
        routeFull={{ coordinates: [{ latitude: 35.1, longitude: -80.1 }] }}
      />,
    );

    const preview = screen.getByTestId("activity-plan-card-preview-plan-route-preview");
    expect(preview.props.size).toBe("medium");
    expect(preview.props.route).toEqual({
      id: "route-1",
      name: "River Loop",
      distance: 5000,
      ascent: 120,
      descent: 100,
      total_distance: 5000,
      total_ascent: 120,
      total_descent: 100,
    });
    expect(preview.props.routeFull).toEqual({
      coordinates: [{ latitude: 35.1, longitude: -80.1 }],
    });
  });

  it("keeps navigation and the like action independent", () => {
    const onPress = jest.fn();

    renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-like-boundary",
          name: "Tempo Builder",
          categories: ["run"],
          likes_count: 3,
          has_liked: false,
        }}
        onPress={onPress}
      />,
    );

    fireEvent.press(screen.getByLabelText("Open activity plan Tempo Builder"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(toggleLikeMutateMock).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Like, 3 likes"));

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "plan-like-boundary",
      entity_type: "activity_plan",
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
