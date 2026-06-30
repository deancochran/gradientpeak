import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import { View } from "react-native";
import type { BuilderPlanCreationViewModel } from "@/lib/training-plan-creation/view-model";

type BuilderLoadProjectionSummaryModel = Pick<
  BuilderPlanCreationViewModel,
  "currentBaseline" | "dailyTrainingPathChart" | "recommendedLoad" | "timelineWeeks"
>;

interface BuilderLoadProjectionSummaryProps {
  model: BuilderLoadProjectionSummaryModel;
  className?: string;
}

const statusToneByStatus: Record<
  NonNullable<BuilderLoadProjectionSummaryModel["recommendedLoad"]>["status"],
  string
> = {
  above: "bg-destructive/10 text-destructive",
  below: "bg-muted text-foreground",
  needs_sessions: "bg-muted text-muted-foreground",
  on_track: "bg-primary/10 text-primary",
};

const statusLabelByStatus: Record<
  NonNullable<BuilderLoadProjectionSummaryModel["recommendedLoad"]>["status"],
  string
> = {
  above: "Above range",
  below: "Below range",
  needs_sessions: "Needs sessions",
  on_track: "On track",
};

export function BuilderLoadProjectionSummary({
  className,
  model,
}: BuilderLoadProjectionSummaryProps) {
  const { recommendedLoad } = model;

  if (!recommendedLoad) {
    return null;
  }

  const fitnessProjection = getFitnessProjection(model);

  return (
    <View className={cn("gap-3 rounded-2xl bg-background px-3 py-3", className)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-sm leading-5 text-foreground">
            Aim for {recommendedLoad.label} ({recommendedLoad.rangeMinTss}-
            {recommendedLoad.rangeMaxTss} TSS/wk).
          </Text>
        </View>
        <Text
          className={cn(
            "rounded-full px-2 py-1 text-[11px] font-semibold",
            statusToneByStatus[recommendedLoad.status],
          )}
        >
          {statusLabelByStatus[recommendedLoad.status]}
        </Text>
      </View>

      <View className="flex-row gap-2">
        <SummaryValue label="Planned" value={`${recommendedLoad.plannedAverageTss} TSS/wk`} />
        <SummaryValue
          label={recommendedLoad.sourceLabel}
          value={recommendedLoad.loadDeltaLabel ?? "Goal based"}
        />
      </View>

      <Text className="text-xs leading-4 text-muted-foreground">{recommendedLoad.guidance}</Text>

      {fitnessProjection ? (
        <View className="border-t border-border pt-2">
          <Text className="text-xs leading-4 text-muted-foreground">{fitnessProjection}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="text-sm font-semibold text-foreground">{value}</Text>
    </View>
  );
}

function getFitnessProjection(model: BuilderLoadProjectionSummaryModel) {
  const projection = [...model.dailyTrainingPathChart.weeks]
    .reverse()
    .find((week) => week.scheduledFitness !== null || week.targetFitness !== null);

  if (projection?.scheduledFitness === null || projection?.scheduledFitness === undefined) {
    return null;
  }

  const weekCount = model.timelineWeeks.length;
  const baseline = model.currentBaseline.ctl;
  const plannedFitness = Math.round(projection.scheduledFitness);
  const targetFitness =
    projection.targetFitness !== null ? Math.round(projection.targetFitness) : null;
  const startText = baseline !== null ? ` from ${Math.round(baseline)} CTL` : "";
  const targetText =
    targetFitness !== null ? `; the recommended path trends toward ${targetFitness} CTL` : "";
  const timelineText = weekCount > 1 ? ` by week ${weekCount}` : "";

  return `Projected fitness reaches ${plannedFitness} CTL${timelineText}${startText}${targetText}.`;
}
