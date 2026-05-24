import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
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
          activity_category: "outdoor_run",
          updated_at: "2026-03-21T12:00:00.000Z",
          owner: null,
        }}
        variant="compact"
      />,
    );

    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    expect(screen.getByText("Progressive tempo with a strong finish.")).toBeTruthy();
    expect(screen.getByText("Outdoor Run")).toBeTruthy();
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
          activity_category: "outdoor_run",
          updated_at: "2026-03-21T12:00:00.000Z",
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
});
