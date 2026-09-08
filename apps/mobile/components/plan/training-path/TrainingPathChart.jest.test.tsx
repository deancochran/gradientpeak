import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPathChart } from "./TrainingPathChart";

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));

const model = {
  domains: { fitness: [0, 80] as [number, number], load: [0, 200] as [number, number] },
  emptyState: null,
  goalMarkers: [{ id: "goal-1", label: "Race", targetDate: "2026-04-12", weekStart: "2026-04-06" }],
  selectedWeekSummary: null,
  todayKey: "2026-04-06",
  weeks: [
    {
      weekStart: "2026-04-06",
      weekEnd: "2026-04-12",
      label: "Apr 6",
      completedLoad: 20,
      plannedLoad: 40,
      targetLoad: null,
      effectiveLoadStatus: "complete" as const,
      effectiveLoad: 60,
      effectiveIntensity: 0.8,
      effectiveCompletedLoad: 20,
      effectiveRemainingLoad: 40,
      fitness: 40,
      scheduledFitness: 42,
      recommendedLoadStatus: "complete" as const,
      recommendedLoad: 70,
      targetFitness: 45,
      fatigue: null,
      form: null,
      riskZone: null,
      isCurrent: true,
      isSelected: true,
    },
  ],
};

it("renders the fixed factual weekly chart with model-owned Today and goal markers", async () => {
  await renderNative(<TrainingPathChart model={model} onSelectedWeekChange={jest.fn()} />);
  expect(screen.getByLabelText("Weekly training path chart")).toBeTruthy();
  expect(
    screen.container.queryAll((node) => node.props.testID === "training-path-today-boundary"),
  ).toHaveLength(1);
  expect(screen.getByLabelText("Left axis: Load, Common Load")).toBeTruthy();
});

it("renders finite weekly load without exposing its internal partial status", async () => {
  await renderNative(
    <TrainingPathChart
      model={{
        ...model,
        weeks: [
          {
            ...model.weeks[0],
            completedLoadStatus: "partial" as const,
            effectiveLoadStatus: "partial" as const,
            effectiveRemainingLoadStatus: "partial" as const,
          },
        ],
      }}
      onSelectedWeekChange={jest.fn()}
    />,
  );

  const chart = screen.getByLabelText("Weekly training path chart");
  expect(chart.props.accessibilityValue.text).toContain("Common Load 60");
  expect(chart.props.accessibilityValue.text).toContain("Normalized intensity 0.80");
  expect(chart.props.accessibilityValue.text).toContain("Completed Common Load 20");
  expect(chart.props.accessibilityValue.text).toContain("Planned Common Load 40");
  expect(chart.props.accessibilityValue.text).not.toMatch(
    /~60|~20|~40|partial|incomplete|subtotal/i,
  );
});

it("renders production-model weekly load fields without effective aliases", async () => {
  await renderNative(
    <TrainingPathChart
      model={{
        ...model,
        weeks: [
          {
            ...model.weeks[0],
            completedLoad: 20,
            completedLoadStatus: "partial" as const,
            effectiveCompletedLoad: undefined,
            effectiveRemainingLoad: undefined,
            plannedLoad: 40,
            plannedLoadStatus: "partial" as const,
          },
        ],
      }}
      onSelectedWeekChange={jest.fn()}
    />,
  );

  const chart = screen.getByLabelText("Weekly training path chart");
  expect(chart.props.accessibilityValue.text).toContain("Completed Common Load 20");
  expect(chart.props.accessibilityValue.text).toContain("Planned Common Load 40");
  expect(chart.props.accessibilityValue.text).not.toMatch(/partial|subtotal|~/i);
});
