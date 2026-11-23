import { TrainingStateChart } from "../training-state-chart/index.native";
import { type SessionScenarioComparisonProps, toSessionScenarioComparisonVisual } from "./shared";

export * from "./shared";

export function SessionScenarioComparison(props: SessionScenarioComparisonProps) {
  return (
    <TrainingStateChart
      accessibilityLabel="Baseline and alternative training-load projections shown over the same planning horizon."
      description="Solid lines show the baseline; dashed lines show the selected alternative. A source with one point is shown as a marker. Both use the same planning horizon and units."
      emptyMessage={props.emptyMessage ?? "No scenario projection is available."}
      series={[
        { metric: "fitness", source: "recorded" },
        { metric: "fitness", source: "projected" },
        { metric: "fatigue", source: "recorded" },
        { metric: "fatigue", source: "projected" },
        { metric: "form", source: "recorded" },
        { metric: "form", source: "projected" },
      ]}
      sourceLabels={{ recorded: "Baseline", projected: "Alternative" }}
      title="Scenario comparison"
      visual={toSessionScenarioComparisonVisual(props)}
    />
  );
}
