import React from "react";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityPlanCard } from "../ActivityPlanCard";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

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
    expect(screen.getByText("System Template")).toBeTruthy();
    expect(screen.getByText("Updated Mar 21, 2026")).toBeTruthy();
    expect(screen.queryByText("By")).toBeNull();
    expect(getByTestId("activity-plan-attribution-row").props.className).toContain(
      "justify-between",
    );
  });
});
