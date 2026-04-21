import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Heart, TrendingUp } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import { EntityOwnerRow } from "@/components/shared/EntityOwnerRow";
import { TrainingPlanSummaryHeader } from "./TrainingPlanSummaryHeader";

function TrainingPlanDetailChip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
      <Text className="text-xs font-medium capitalize text-foreground">{label}</Text>
    </View>
  );
}

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
  return (
    <Card>
      <CardContent className="gap-4 p-4">
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

        <View className="flex-row flex-wrap gap-2">
          {plan.durationWeeks?.recommended || plan.durationWeeks?.min ? (
            <TrainingPlanDetailChip
              label={`${plan.durationWeeks?.recommended || plan.durationWeeks?.min} week${(plan.durationWeeks?.recommended || plan.durationWeeks?.min) === 1 ? "" : "s"}`}
            />
          ) : null}
          {plan.sessions_per_week_target ? (
            <TrainingPlanDetailChip label={`${plan.sessions_per_week_target} sessions/week`} />
          ) : null}
          {Array.isArray(plan.sport)
            ? plan.sport
                .slice(0, 2)
                .map((sport: string) => <TrainingPlanDetailChip key={sport} label={sport} />)
            : null}
          {Array.isArray(plan.experienceLevel)
            ? plan.experienceLevel
                .slice(0, 1)
                .map((level: string) => <TrainingPlanDetailChip key={level} label={level} />)
            : typeof plan.experienceLevel === "string"
              ? [<TrainingPlanDetailChip key={plan.experienceLevel} label={plan.experienceLevel} />]
              : null}
        </View>

        <View className="rounded-2xl border border-border bg-muted/10 px-4 py-3">
          <View className="flex-row items-center gap-2">
            <Icon as={TrendingUp} size={16} className="text-muted-foreground" />
            <Text className="text-sm font-medium text-foreground">Plan snapshot</Text>
          </View>
          <Text className="mt-1 text-xs text-muted-foreground">
            Review the weekly structure and linked activity plans from the scrollable week tabs
            below.
          </Text>
          {overview ? (
            <View className="mt-3 flex-row flex-wrap gap-3">
              <SummaryMetricCard label="Microcycles" value={`${overview.microcycles}`} />
              <SummaryMetricCard label="Sessions" value={`${overview.sessions}`} />
              <SummaryMetricCard label="Linked workouts" value={`${overview.linkedWorkouts}`} />
              <SummaryMetricCard label="Route-backed workouts" value={`${overview.routeBacked}`} />
              <SummaryMetricCard label="Planned TSS" value={`${overview.plannedTss}`} />
              <SummaryMetricCard label="Planned time" value={overview.plannedTime} />
            </View>
          ) : null}
          {plan?.owner ? (
            <View className="mt-3">
              <EntityOwnerRow owner={plan.owner} subtitle="Plan owner" />
            </View>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

function SummaryMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-28 flex-1 rounded-2xl border border-border/60 bg-background px-3 py-3">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-1 text-base font-semibold text-foreground">{value}</Text>
    </View>
  );
}
