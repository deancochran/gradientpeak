import { fireEvent } from "@testing-library/react-native";
import React from "react";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPlanCard } from "../TrainingPlanCard";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

const toggleLikeMutateMock = jest.fn();

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

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CalendarRange: createHost("CalendarRange"),
  Heart: createHost("Heart"),
  Target: createHost("Target"),
  TrendingUp: createHost("TrendingUp"),
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

describe("TrainingPlanCard", () => {
  beforeEach(() => {
    toggleLikeMutateMock.mockReset();
  });

  it("renders title, metrics, snapshot, and attribution like the shared cards", () => {
    renderNative(
      <TrainingPlanCard
        plan={{
          id: "training-plan-1",
          name: "Half Marathon Build",
          description: "Ten weeks of progressive threshold and long-run work.",
          sessions_per_week_target: 4,
          durationWeeks: { recommended: 10 },
          sport: ["run"],
          experienceLevel: ["intermediate"],
          updated_at: "2026-03-21T12:00:00.000Z",
          owner: null,
        }}
        variant="compact"
      />,
    );

    expect(screen.getByText("Half Marathon Build")).toBeTruthy();
    expect(screen.getByText("Plan snapshot")).toBeTruthy();
    expect(screen.getByText("10 weeks")).toBeTruthy();
    expect(screen.getByText("4/week")).toBeTruthy();
    expect(screen.getByTestId("training-plan-periodization-preview")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-segment-9")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-recovery-9")).toBeTruthy();
    expect(screen.queryByTestId("training-plan-visual-segment-10")).toBeNull();
    expect(screen.getByText("System Template")).toBeTruthy();
    expect(screen.getByText("Updated Mar 21, 2026")).toBeTruthy();
  });

  it("toggles likes using the training_plan entity type", () => {
    renderNative(
      <TrainingPlanCard
        plan={{
          id: "training-plan-1",
          name: "Half Marathon Build",
          likes_count: 3,
          has_liked: false,
        }}
      />,
    );

    fireEvent.press(screen.getByTestId("training-plan-card-like-button-training-plan-1"));

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "training-plan-1",
      entity_type: "training_plan",
    });
  });
});
