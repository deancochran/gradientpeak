import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { View } from "react-native";
import {
  ResourceLikeButton,
  ResourceOwnerActionRow,
} from "@/components/shared/ResourceCardPrimitives";
import { TrainingPlanPeriodizationPreview } from "@/components/shared/TrainingPlanPeriodizationPreview";
import { markEstimated } from "@/lib/estimatedMetrics";
import {
  deriveTrainingPlanSummaryMetrics,
  deriveTrainingPlanVisual,
} from "@/lib/trainingPlanVisual";
import { TrainingPlanSummaryHeader } from "./TrainingPlanSummaryHeader";

interface TrainingPlanDetailHeaderActionsSectionProps {
  handleToggleLike: () => void;
  isCurrentScheduledPlan?: boolean;
  isLiked: boolean;
  likesCount: number;
  overview?: {
    linkedWorkouts: number;
    microcycles: number;
    plannedTime: string;
    plannedTss: number;
    routeBacked: number;
    sessions: number;
  };
  plan: any;
}

export function TrainingPlanDetailHeaderActionsSection({
  handleToggleLike,
  isCurrentScheduledPlan = false,
  isLiked,
  likesCount,
  overview,
  plan,
}: TrainingPlanDetailHeaderActionsSectionProps) {
  const summaryMetrics = useMemo(() => deriveTrainingPlanSummaryMetrics(plan), [plan]);
  const visualModel = useMemo(() => deriveTrainingPlanVisual(plan), [plan]);

  return (
    <View className="gap-4 rounded-3xl border border-border bg-card p-4">
      <ResourceOwnerActionRow
        actions={
          <ResourceLikeButton
            isLiked={isLiked}
            likeCount={likesCount}
            onPress={handleToggleLike}
            testID="training-plan-like-button"
          />
        }
        categoryLabel={isCurrentScheduledPlan ? "Current scheduled plan" : "Template"}
        fallbackLabel="GradientPeak"
        owner={plan?.owner ?? null}
        timestamp={plan.created_at}
      />

      <TrainingPlanSummaryHeader
        title={plan.name}
        description={plan.description || undefined}
        isActive={isCurrentScheduledPlan}
        activeLabel="Current scheduled plan"
        inactiveLabel="Template"
        createdAt={plan.created_at}
        showStatusDot={isCurrentScheduledPlan}
        formatStartedDate={(date) =>
          date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        }
        showMeta={false}
      />

      {isCurrentScheduledPlan ? (
        <View className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3">
          <Text className="text-sm font-medium text-foreground">
            This is your currently scheduled plan.
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Removing the scheduled set keeps completed sessions in history.
          </Text>
        </View>
      ) : null}

      <View className="rounded-lg bg-muted/30 px-2.5 py-2">
        <View className="flex-row justify-between gap-2">
          <SummaryMetricCard label="Duration" value={summaryMetrics.durationLabel} compact />
          <SummaryMetricCard label="Sessions" value={summaryMetrics.sessionsLabel} compact />
          <SummaryMetricCard label="Sport" value={summaryMetrics.sportLabel} compact />
          <SummaryMetricCard label="Level" value={summaryMetrics.experienceLabel} compact />
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">Plan snapshot</Text>
        <TrainingPlanPeriodizationPreview model={visualModel} />
      </View>

      {overview ? (
        <View className="gap-2">
          <Text className="text-sm font-medium text-foreground">Plan overview</Text>
          <View className="flex-row flex-wrap gap-2">
            <SummaryMetricCard label="Microcycles" value={`${overview.microcycles}`} />
            <SummaryMetricCard label="Sessions" value={`${overview.sessions}`} />
            <SummaryMetricCard label="Linked activities" value={`${overview.linkedWorkouts}`} />
            <SummaryMetricCard label="Route-backed activities" value={`${overview.routeBacked}`} />
            <SummaryMetricCard
              label="Planned TSS"
              value={markEstimated(`${overview.plannedTss}`) ?? "0"}
            />
            <SummaryMetricCard label="Planned time" value={overview.plannedTime} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SummaryMetricCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <View
      className={
        compact
          ? "flex-1 items-center gap-0.5"
          : "min-w-[30%] flex-1 rounded-xl border border-border/50 bg-muted/10 px-2.5 py-2"
      }
    >
      <Text
        className={
          compact
            ? "text-[10px] text-muted-foreground"
            : "text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        }
      >
        {label}
      </Text>
      <Text
        className={
          compact
            ? "text-[11px] font-semibold text-foreground"
            : "mt-0.5 text-sm font-semibold text-foreground"
        }
      >
        {value}
      </Text>
    </View>
  );
}
