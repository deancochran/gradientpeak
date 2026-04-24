import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Heart } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, View } from "react-native";
import { EntityOwnerRow } from "@/components/shared/EntityOwnerRow";
import { TrainingPlanPeriodizationPreview } from "@/components/shared/TrainingPlanPeriodizationPreview";
import {
  deriveTrainingPlanSummaryMetrics,
  deriveTrainingPlanVisual,
} from "@/lib/trainingPlanVisual";
import { TrainingPlanSummaryHeader } from "./TrainingPlanSummaryHeader";

interface TrainingPlanDetailHeaderActionsSectionProps {
  handleToggleLike: () => void;
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
  isLiked,
  likesCount,
  overview,
  plan,
}: TrainingPlanDetailHeaderActionsSectionProps) {
  const summaryMetrics = useMemo(() => deriveTrainingPlanSummaryMetrics(plan), [plan]);
  const visualModel = useMemo(() => deriveTrainingPlanVisual(plan), [plan]);

  return (
    <View className="gap-4 rounded-3xl border border-border bg-card p-4">
      <TrainingPlanSummaryHeader
        title={plan.name}
        description={plan.description || undefined}
        isActive={false}
        inactiveLabel="Template"
        createdAt={plan.created_at}
        showStatusDot={false}
        formatStartedDate={(date) =>
          date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        }
        rightAccessory={
          <Pressable
            onPress={handleToggleLike}
            className="rounded-full border border-border bg-background px-3 py-2"
            testID="training-plan-like-button"
          >
            <View className="flex-row items-center gap-1.5">
              <Icon
                as={Heart}
                size={16}
                className={isLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
              />
              <Text
                className={
                  isLiked ? "text-red-500 text-sm font-medium" : "text-muted-foreground text-sm"
                }
              >
                {likesCount > 0 ? `${likesCount}` : isLiked ? "Liked" : "Like"}
              </Text>
            </View>
          </Pressable>
        }
      />

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
            <SummaryMetricCard label="Linked workouts" value={`${overview.linkedWorkouts}`} />
            <SummaryMetricCard label="Route-backed workouts" value={`${overview.routeBacked}`} />
            <SummaryMetricCard label="Planned TSS" value={`${overview.plannedTss}`} />
            <SummaryMetricCard label="Planned time" value={overview.plannedTime} />
          </View>
        </View>
      ) : null}
      {plan?.owner ? <EntityOwnerRow owner={plan.owner} subtitle="Plan owner" /> : null}
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
