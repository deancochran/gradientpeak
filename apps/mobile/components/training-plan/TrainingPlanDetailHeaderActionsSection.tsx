import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Heart, TrendingUp } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import { EntityOwnerRow } from "@/components/shared/EntityOwnerRow";
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
  const summaryBits = [
    plan.durationWeeks?.recommended || plan.durationWeeks?.min
      ? `${plan.durationWeeks?.recommended || plan.durationWeeks?.min} week${(plan.durationWeeks?.recommended || plan.durationWeeks?.min) === 1 ? "" : "s"}`
      : null,
    plan.sessions_per_week_target ? `${plan.sessions_per_week_target} sessions/week` : null,
    Array.isArray(plan.sport) ? plan.sport.slice(0, 2).join(" • ") : null,
    Array.isArray(plan.experienceLevel)
      ? plan.experienceLevel.slice(0, 1).join(" • ")
      : typeof plan.experienceLevel === "string"
        ? plan.experienceLevel
        : null,
  ].filter(Boolean);

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

      {summaryBits.length > 0 ? (
        <Text className="text-xs text-muted-foreground">{summaryBits.join(" • ")}</Text>
      ) : null}

      <View className="flex-row items-center gap-2">
        <Icon as={TrendingUp} size={16} className="text-muted-foreground" />
        <Text className="text-sm font-medium text-foreground">Plan snapshot</Text>
      </View>
      {overview ? (
        <View className="flex-row flex-wrap gap-2">
          <SummaryMetricCard label="Microcycles" value={`${overview.microcycles}`} />
          <SummaryMetricCard label="Sessions" value={`${overview.sessions}`} />
          <SummaryMetricCard label="Linked workouts" value={`${overview.linkedWorkouts}`} />
          <SummaryMetricCard label="Route-backed workouts" value={`${overview.routeBacked}`} />
          <SummaryMetricCard label="Planned TSS" value={`${overview.plannedTss}`} />
          <SummaryMetricCard label="Planned time" value={overview.plannedTime} />
        </View>
      ) : null}
      {plan?.owner ? <EntityOwnerRow owner={plan.owner} subtitle="Plan owner" /> : null}
    </View>
  );
}

function SummaryMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[30%] flex-1 rounded-xl border border-border/50 bg-muted/10 px-2.5 py-2">
      <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-0.5 text-sm font-semibold text-foreground">{value}</Text>
    </View>
  );
}
