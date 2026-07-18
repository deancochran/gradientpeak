import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { type ComponentProps, useMemo, useState } from "react";
import { View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { BuilderTrainingPathReviewSection } from "@/components/training-plan/create/BuilderTrainingPathReviewSection";

type BuilderProjectionOverviewProps = ComponentProps<typeof BuilderTrainingPathReviewSection>;

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function BuilderProjectionOverview({
  chartReview,
  renderBelowChart,
}: BuilderProjectionOverviewProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const model = useMemo(() => {
    const weeks = chartReview.chart.weeks;
    if (weeks.length === 0) return null;
    const first = weeks[0];
    const last = weeks.at(-1);
    if (!first || !last) return null;

    const startFitness = finite(first.fitness) ? first.fitness : first.scheduledFitness;
    const endFitness = finite(last.scheduledFitness) ? last.scheduledFitness : last.fitness;
    const peakPlannedLoad = Math.max(
      0,
      ...weeks.map((week) => (week.plannedLoad ?? 0) + (week.tentativePlannedLoad ?? 0)),
    );
    const peakTargetLoad = Math.max(0, ...weeks.map((week) => week.targetLoad ?? 0));
    const loadScale = Math.max(1, peakPlannedLoad, peakTargetLoad);
    const goal = chartReview.chart.goalMarkers[0];
    const fitnessSummary =
      finite(startFitness) && finite(endFitness)
        ? `Fitness ${Math.round(startFitness)} → ${Math.round(endFitness)}`
        : "Fitness is calibrating";
    const goalSummary = goal ? `${goal.label} · ${goal.targetDate}` : null;
    const accessibilitySummary = [
      `${weeks.length} week projection`,
      finite(startFitness) && finite(endFitness)
        ? `Fitness starts at ${Math.round(startFitness)} and reaches ${Math.round(endFitness)}`
        : "Fitness is still calibrating",
      `Peak planned load ${Math.round(peakPlannedLoad)} TSS per week`,
      goal ? `Goal ${goal.label} on ${goal.targetDate}` : "No goal date",
    ].join(". ");
    const visibleWeeks = weeks.filter(
      (_week, index) =>
        index === weeks.length - 1 || index % Math.max(1, Math.ceil(weeks.length / 12)) === 0,
    );

    return {
      accessibilitySummary,
      fitnessSummary,
      goalSummary,
      loadScale,
      peakPlannedLoad,
      visibleWeeks,
      weekCount: weeks.length,
    };
  }, [chartReview.chart.goalMarkers, chartReview.chart.weeks]);

  return (
    <View
      className="gap-3 rounded-2xl border border-border bg-card p-3"
      testID="builder-projection-overview"
    >
      {model ? (
        <View
          accessible
          accessibilityLabel={model.accessibilitySummary}
          accessibilityRole="text"
          className="gap-3"
          testID="builder-projection-summary"
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-semibold text-foreground">Projected outcome</Text>
              <Text className="text-xs text-muted-foreground">
                {model.weekCount} week training path
              </Text>
            </View>
            <Text className="text-xs font-medium text-primary">{model.fitnessSummary}</Text>
          </View>

          <View
            accessibilityElementsHidden
            className="h-10 flex-row items-end gap-1 rounded-lg bg-muted/20 px-2 pt-1"
            importantForAccessibility="no-hide-descendants"
          >
            {model.visibleWeeks.map((week) => {
              const planned = (week.plannedLoad ?? 0) + (week.tentativePlannedLoad ?? 0);
              return (
                <View
                  key={week.weekStart}
                  className="min-w-1 flex-1 rounded-t-sm bg-primary/70"
                  style={{ height: Math.max(3, Math.round((planned / model.loadScale) * 36)) }}
                />
              );
            })}
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1 gap-0.5">
              <Text className="text-[11px] uppercase text-muted-foreground">Peak planned</Text>
              <Text className="text-sm font-semibold text-foreground">
                {Math.round(model.peakPlannedLoad)} TSS/wk
              </Text>
            </View>
            {model.goalSummary ? (
              <View className="flex-1 gap-0.5">
                <Text className="text-[11px] uppercase text-muted-foreground">Goal</Text>
                <Text className="text-sm font-semibold text-foreground" numberOfLines={2}>
                  {model.goalSummary}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View accessibilityLabel="Training projection is being calculated" accessibilityRole="text">
          <Text className="text-sm font-semibold text-foreground">Projected outcome</Text>
          <Text className="text-xs text-muted-foreground">
            Add goals, preferences, and sessions to build your training path.
          </Text>
        </View>
      )}

      <Button
        accessibilityLabel="Review full training projection"
        className="min-h-11"
        onPress={() => setDetailsOpen(true)}
        variant="outline"
      >
        <Text>Review projection</Text>
      </Button>

      {detailsOpen ? (
        <AppFormModal
          description="Inspect planned load, target load, fitness paths, goals, and individual days."
          onClose={() => setDetailsOpen(false)}
          testID="builder-projection-modal"
          title="Training Projection"
        >
          <BuilderTrainingPathReviewSection
            chartHeight={320}
            chartReview={chartReview}
            {...(renderBelowChart ? { renderBelowChart } : {})}
          />
        </AppFormModal>
      ) : null}
    </View>
  );
}
