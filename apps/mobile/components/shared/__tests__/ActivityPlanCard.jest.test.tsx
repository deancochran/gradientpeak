import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { ActivityPlanCard } from "../ActivityPlanCard";

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
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    routes: {
      get: {
        useQuery: () => ({ data: null }),
      },
      loadFull: {
        useQuery: () => ({ data: null }),
      },
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: jest.fn() }),
      },
    },
  },
}));

describe("ActivityPlanCard", () => {
  it("shows the footer on one justified row under the intensity chart", () => {
    const { getByTestId } = renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-1",
          name: "Tempo Builder",
          description: "Progressive tempo with a strong finish.",
          activity_category: "run",
          updated_at: "2026-03-21T08:00:00.000",
          owner: null,
        }}
        variant="compact"
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
          activity_category: "run",
          updated_at: "2026-03-21T08:00:00.000",
          owner: {
            id: "owner-1",
            username: "Coach Kim",
            avatar_url: null,
          },
        }}
        variant="compact"
      />,
    );

    expect(screen.queryByText("By")).toBeNull();
    expect(screen.getByText("Coach Kim")).toBeTruthy();
    expect(screen.queryByText("Updated Mar 21, 2026")).toBeNull();
  });

  it("renders list cards as a dense, tappable identity and metrics scan", () => {
    const onPress = jest.fn();

    renderNative(
      <ActivityPlanCard
        activityPlan={{
          id: "plan-list-1",
          name: "Tempo Builder",
          description: "Progressive tempo with a strong finish.",
          activity_category: "run",
          authoritative_metrics: {
            estimated_duration: 3600,
            estimated_tss: 72,
            intensity_factor: 0.82,
          },
          route_id: "route-1",
          structure: { route: { name: "River Loop" } },
          created_at: "2026-03-21T08:00:00.000",
          owner: {
            id: "owner-1",
            username: "Coach Kim",
            avatar_url: null,
          },
        }}
        loadRoutePreview
        onPress={onPress}
        showScheduleInfo
        testID="activity-plan-list-card"
        variant="list"
      />,
    );

    expect(screen.getByTestId("activity-plan-list-card")).toBeTruthy();
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
    expect(screen.queryByText("Progressive tempo with a strong finish.")).toBeNull();
    expect(screen.queryByText("River Loop")).toBeNull();
    expect(screen.queryByText("Mar 21, 2026 • 8:00 AM")).toBeNull();

    fireEvent.press(screen.getByTestId("activity-plan-list-card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
