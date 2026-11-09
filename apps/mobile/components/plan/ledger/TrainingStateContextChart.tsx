import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Minus, TrendingDown, TrendingUp } from "lucide-react-native";
import { View } from "react-native";
import { CartesianChart, Line } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";
import { getPlanChartTheme } from "../training-path/planChartTheme";
import type { PlanningLedgerPresentation } from "./planningLedgerPresentation";

type StateDatum = Record<string, unknown> & {
  actualFatigue: number | null;
  actualFitness: number | null;
  actualForm: number | null;
  index: number;
  projectedFatigue: number | null;
  projectedFitness: number | null;
  projectedForm: number | null;
};
type StateKey =
  | "actualFitness"
  | "actualFatigue"
  | "actualForm"
  | "projectedFitness"
  | "projectedFatigue"
  | "projectedForm";

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
  const chartData: StateDatum[] = state.points.map((point) => ({
    actualFatigue: point.actualFatigue,
    actualFitness: point.actualFitness,
    actualForm: point.actualForm,
    index: point.index,
    projectedFatigue: point.projectedFatigue,
    projectedFitness: point.projectedFitness,
    projectedForm: point.projectedForm,
  }));

  return (
    <View className="gap-3" testID="planning-ledger-training-state">
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          Seven-day training state
        </Text>
        <Text className="text-xs text-muted-foreground">
          Fitness, fatigue, and form in context
          {state.latestSource ? ` · Latest values are ${state.latestSource.toLowerCase()}` : ""}
        </Text>
      </View>
      {chartData.length ? (
        <View
          accessible
          accessibilityLabel={state.summary}
          accessibilityRole="image"
          className="h-40 overflow-hidden rounded-2xl border border-border bg-card p-2"
          testID="planning-ledger-state-chart"
        >
          <CartesianChart<StateDatum, "index", StateKey>
            data={chartData}
            domainPadding={{ bottom: 8, left: 8, right: 8, top: 8 }}
            frame={{ lineColor: "transparent", lineWidth: 0 }}
            xKey="index"
            yKeys={[
              "actualFitness",
              "actualFatigue",
              "actualForm",
              "projectedFitness",
              "projectedFatigue",
              "projectedForm",
            ]}
          >
            {({ points }) => (
              <>
                <Line
                  color={colors.fitness}
                  connectMissingData={false}
                  curveType="natural"
                  points={points.actualFitness}
                  strokeWidth={3}
                />
                <Line
                  color={colors.fatigue}
                  connectMissingData={false}
                  curveType="natural"
                  points={points.actualFatigue}
                  strokeWidth={2.5}
                />
                <Line
                  color={colors.form}
                  connectMissingData={false}
                  curveType="natural"
                  points={points.actualForm}
                  strokeWidth={2}
                />
                <Line
                  color={colors.fitness}
                  connectMissingData={false}
                  curveType="natural"
                  opacity={0.45}
                  points={points.projectedFitness}
                  strokeWidth={3}
                />
                <Line
                  color={colors.fatigue}
                  connectMissingData={false}
                  curveType="natural"
                  opacity={0.45}
                  points={points.projectedFatigue}
                  strokeWidth={2.5}
                />
                <Line
                  color={colors.form}
                  connectMissingData={false}
                  curveType="natural"
                  opacity={0.45}
                  points={points.projectedForm}
                  strokeWidth={2}
                />
              </>
            )}
          </CartesianChart>
        </View>
      ) : (
        <Text className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          Training state is unavailable for this period.
        </Text>
      )}
      <View className="flex-row gap-4">
        <Text className="text-xs text-foreground">━ Recorded</Text>
        <Text className="text-xs text-muted-foreground">━ Projected</Text>
      </View>
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
