import { fireEvent } from "@testing-library/react-native";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPlanCard } from "../TrainingPlanCard";

const toggleLikeMutateMock = jest.fn();
const canonicalStructure = {
  version: 1,
  activity_category: ["run"],
  durationWeeks: { recommended: 10 },
  experienceLevel: ["intermediate"],
  sessions: [
    { offset_days: 0, activity_plan_id: "11111111-1111-4111-8111-111111111111" },
    { offset_days: 63, activity_plan_id: "11111111-1111-4111-8111-111111111111" },
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

  it("renders title, an authored-average metric, and a truthful compact schedule distribution", async () => {
    await renderNative(
      <TrainingPlanCard
        plan={{
          id: "training-plan-1",
          name: "Half Marathon Build",
          description: "Ten weeks of progressive threshold and long-run work.",
          structure: canonicalStructure,
          updated_at: "2026-03-21T08:00:00.000",
          owner: null,
        }}
        variant="compact"
      />,
    );

    expect(screen.getByText("Half Marathon Build")).toBeTruthy();
    expect(screen.getByText("Plan schedule")).toBeTruthy();
    expect(screen.getByText("10 weeks")).toBeTruthy();
    expect(screen.getByText("Authored avg: 0.2/week")).toBeTruthy();
    expect(screen.getByTestId("training-plan-planned-preview-training-plan-1")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-week-9")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-empty-1")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-bar-0")).toBeTruthy();
    expect(screen.queryByTestId("training-plan-visual-bar-1")).toBeNull();
    expect(
      screen.getByLabelText(
        /Plan schedule\. 2 scheduled sessions across 10 weeks\..*empty weeks have a baseline only.*not athlete-specific training load/,
      ),
    ).toBeTruthy();
    expect(screen.getByText("GradientPeak")).toBeTruthy();
    expect(screen.getByText("Mar 21, 2026 • 8:00 AM")).toBeTruthy();
  });

  it("shows owner and last updated metadata in the footer", async () => {
    await renderNative(
      <TrainingPlanCard
        plan={{
          id: "training-plan-1",
          name: "Half Marathon Build",
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
    expect(screen.getByText("Mar 21, 2026 • 8:00 AM")).toBeTruthy();
  });

  it("renders a dense list card without social, attribution, or visual content", async () => {
    const onPress = jest.fn();

    await renderNative(
      <TrainingPlanCard
        onPress={onPress}
        plan={{
          id: "training-plan-1",
          name: "Half Marathon Build",
          description: "Ten weeks of progressive threshold and long-run work.",
          structure: canonicalStructure,
          likes_count: 3,
          updated_at: "2026-03-21T08:00:00.000",
          owner: { id: "owner-1", username: "Coach Kim", avatar_url: null },
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Half Marathon Build")).toBeTruthy();
    expect(screen.getByText("10 weeks")).toBeTruthy();
    expect(screen.getByText("Authored avg: 0.2/week")).toBeTruthy();
    expect(screen.getByText("run")).toBeTruthy();
    expect(screen.queryByText("Level")).toBeNull();
    expect(screen.queryByTestId("training-plan-card-like-button-training-plan-1")).toBeNull();
    expect(screen.queryByText("Coach Kim")).toBeNull();
    expect(screen.queryByText("Mar 21, 2026 • 8:00 AM")).toBeNull();
    expect(screen.queryByText("Plan schedule")).toBeNull();
    expect(screen.queryByTestId("training-plan-planned-preview-training-plan-1")).toBeNull();
    expect(screen.getByTestId("training-plan-card-training-plan-1")).toBeTruthy();

    await fireEvent.press(screen.getByText("Half Marathon Build"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps navigation and training plan likes independent", async () => {
    const onPress = jest.fn();

    await renderNative(
      <TrainingPlanCard
        onPress={onPress}
        plan={{
          id: "training-plan-1",
          name: "Half Marathon Build",
          likes_count: 3,
          has_liked: false,
        }}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Open training plan Half Marathon Build"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(toggleLikeMutateMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("training-plan-card-like-button-training-plan-1"));

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "training-plan-1",
      entity_type: "training_plan",
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Plan schedule")).toBeNull();
  });

  it("uses the explicit session target instead of deriving an authored average", async () => {
    await renderNative(
      <TrainingPlanCard
        plan={{
          id: "training-plan-1",
          name: "Half Marathon Build",
          sessions_per_week_target: 4,
          structure: canonicalStructure,
        }}
      />,
    );

    expect(screen.getByText("Target: 4/week")).toBeTruthy();
  });

  it("renders metadata from a flattened public template projection", async () => {
    await renderNative(
      <TrainingPlanCard
        plan={{
          id: "template-1",
          name: "Public Base Builder",
          durationWeeks: { recommended: 12 },
          activity_category: "run",
          experienceLevel: "beginner",
          sessionsPerWeek: 3,
        }}
      />,
    );

    expect(screen.getByText("12 weeks")).toBeTruthy();
    expect(screen.getByText("run")).toBeTruthy();
    expect(screen.getByText("beginner")).toBeTruthy();
    expect(screen.getByText("Authored avg: 3/week")).toBeTruthy();
    expect(screen.queryByText("--")).toBeNull();
    expect(screen.queryByText("Mixed")).toBeNull();
    expect(screen.queryByText("All levels")).toBeNull();
  });
});
