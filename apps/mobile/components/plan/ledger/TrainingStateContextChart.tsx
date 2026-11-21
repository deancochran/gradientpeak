import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import {
  TrainingStateChart,
  TrainingStateLegend,
  type TrainingStateVisualPoint,
} from "@repo/ui/components/training-state-chart";
import { Minus, TrendingDown, TrendingUp } from "lucide-react-native";
import { View } from "react-native";
import { useTheme } from "@/lib/stores/theme-store";
import { getPlanChartTheme } from "../training-path/planChartTheme";
import type { PlanningLedgerPresentation } from "./planningLedgerPresentation";

function Metric({
  direction,
  label,
  value,
}: {
  direction: "Falling" | "Rising" | "Stable";
  label: string;
  value: string;
}) {
  const directionIcon =
    direction === "Rising" ? TrendingUp : direction === "Falling" ? TrendingDown : Minus;
  return (
    <View className="flex-1 gap-0.5">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-base font-semibold text-foreground">{value}</Text>
      <View
        accessibilityLabel={`${label} direction: ${direction}`}
        className="flex-row items-center gap-1"
      >
        <Icon as={directionIcon} className="text-muted-foreground" size={12} />
        <Text className="text-[10px] text-muted-foreground">{direction}</Text>
      </View>
    </View>
  );
}

export function TrainingStateContextChart({
  state,
}: {
  state: PlanningLedgerPresentation["state"];
}) {
  const { resolvedTheme } = useTheme();
  const colors = getPlanChartTheme(resolvedTheme);
  const visualPoints: TrainingStateVisualPoint[] = state.points.map((point) => ({
    date: point.date,
    index: point.index,
    projected: {
      fatigue: point.projectedFatigue,
      fitness: point.projectedFitness,
      form: point.projectedForm,
    },
    recorded: {
      fatigue: point.actualFatigue,
      fitness: point.actualFitness,
      form: point.actualForm,
    },
  }));
  const visual = {
    points: visualPoints,
    sourceStatus: state.sourceStatus,
    timeZone: state.timeZone,
    unitLabel: state.unitLabel,
  } as const;
  const sourceStatus = state.sourceStatus;
  const sources =
    sourceStatus === "mixed"
      ? (["recorded", "projected"] as const)
      : sourceStatus === "unavailable"
        ? []
        : [sourceStatus];

  return (
    <View className="gap-3" testID="planning-ledger-training-state">
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          Seven-day training state
        </Text>
        <Text className="text-xs text-muted-foreground">
          Fitness, fatigue, and form in {state.unitLabel.toLowerCase()} ({state.timeZone})
          {sourceStatus !== "unavailable"
            ? ` · ${sourceStatus === "mixed" ? "Recorded and projected values are shown separately" : `Values are ${sourceStatus}`}`
            : ""}
        </Text>
      </View>
      {visualPoints.length ? (
        <TrainingStateChart
          colors={colors.trainingState}
          description={state.summary}
          emptyMessage="Training state is unavailable for this period."
          metric="fitness"
          source={sourceStatus === "projected" ? "projected" : "recorded"}
          testId="planning-ledger-state-chart"
          visual={visual}
        />
      ) : (
        <Text className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          Training state is unavailable for this period.
        </Text>
      )}
      <TrainingStateLegend
        colors={colors.trainingState}
        sources={sources}
        testId="planning-ledger-state-legend"
      />
      <View className="flex-row gap-4">
        <Metric
          direction={state.fitnessDirection}
          label="Fitness"
          value={state.latestFitnessLabel}
        />
        <Metric
          direction={state.fatigueDirection}
          label="Fatigue"
          value={state.latestFatigueLabel}
        />
        <Metric direction={state.formDirection} label="Form" value={state.latestFormLabel} />
      </View>
    </View>
  );
}
