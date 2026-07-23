import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";
import { BuilderProjectionOverview } from "../BuilderProjectionOverview";
import { BuilderStrategyComposer } from "../BuilderStrategyComposer";

jest.mock("@/components/shared/AppFormModal", () => ({
  AppFormModal: ({
    children,
    onClose,
    testID,
  }: ComponentProps<typeof View> & { onClose: () => void }) => (
    <View testID={testID}>
      <Text onPress={onClose}>Close projection</Text>
      {children}
    </View>
  ),
}));

jest.mock("../BuilderTrainingPathReviewSection", () => ({
  BuilderTrainingPathReviewSection: () => <View testID="full-builder-training-path" />,
}));

const chartReview = {
  chart: {
    dailyPoints: [],
    domains: { fitness: [0, 80], load: [0, 300] },
    emptyState: null,
    goalMarkers: [
      {
        id: "goal-1",
        label: "Summer race",
        targetDate: "2026-09-12",
        weekStart: "2026-09-07",
      },
    ],
    selectedWeekSummary: null,
    todayKey: "2026-07-18",
    weeks: [
      {
        completedLoad: 100,
        fatigue: null,
        fitness: 40,
        form: null,
        isCurrent: true,
        isSelected: true,
        label: "Jul 13",
        plannedLoad: 180,
        riskZone: null,
        scheduledFitness: 42,
        targetFitness: 43,
        targetLoad: 200,
        tentativePlannedLoad: 20,
        weekEnd: "2026-07-19",
        weekStart: "2026-07-13",
      },
      {
        completedLoad: null,
        fatigue: null,
        fitness: null,
        form: null,
        isCurrent: false,
        isSelected: false,
        label: "Jul 20",
        plannedLoad: 240,
        riskZone: null,
        scheduledFitness: 48,
        targetFitness: 49,
        targetLoad: 260,
        tentativePlannedLoad: 0,
        weekEnd: "2026-07-26",
        weekStart: "2026-07-20",
      },
    ],
  },
} as unknown as ComponentProps<typeof BuilderProjectionOverview>["chartReview"];

describe("BuilderProjectionOverview", () => {
  it("shows a compact accessible outcome and opens the full chart explicitly", () => {
    render(<BuilderProjectionOverview chartReview={chartReview} />);

    expect(screen.getByText("Fitness 40 → 48")).toBeTruthy();
    expect(screen.getByText("240 Load/wk")).toBeTruthy();
    expect(screen.getByText("Summer race · 2026-09-12")).toBeTruthy();
    expect(screen.getByTestId("builder-projection-summary").props.accessibilityLabel).toContain(
      "Peak planned load 240 Load per week",
    );
    expect(screen.queryByTestId("full-builder-training-path")).toBeNull();

    fireEvent.press(screen.getByLabelText("Review full training projection"));
    expect(screen.getByTestId("builder-projection-modal")).toBeTruthy();
    expect(screen.getByTestId("full-builder-training-path")).toBeTruthy();

    fireEvent.press(screen.getByText("Close projection"));
    expect(screen.queryByTestId("builder-projection-modal")).toBeNull();
  });

  it("is the projection surface rendered by the production strategy composer", () => {
    const props = {
      chartReview,
      modules: [],
      onOpenTarget: jest.fn(),
      planChecks: [],
      savePlan: {
        readiness: { detail: "Ready to review", label: "Ready", status: "ready" },
      },
      state: { details: { description: "Base block", name: "Summer build" } },
      timelineWeeks: [],
    } as unknown as ComponentProps<typeof BuilderStrategyComposer>;

    render(<BuilderStrategyComposer {...props} />);

    expect(screen.getByTestId("builder-strategy-composer")).toBeTruthy();
    expect(screen.getByTestId("builder-projection-overview")).toBeTruthy();
    expect(screen.queryByTestId("full-builder-training-path")).toBeNull();
  });
});
