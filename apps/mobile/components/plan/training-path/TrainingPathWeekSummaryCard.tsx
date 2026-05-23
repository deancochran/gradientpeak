import { Text } from "@repo/ui/components/text";
import type React from "react";
import { View } from "react-native";
import { CalendarEventCard } from "@/components/calendar/CalendarEventCard";
import { GroupEventCard } from "@/components/groups/GroupEventCards";
import { GoalListItem } from "@/components/plan/GoalListItem";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import type {
  TrainingPathCompletedActivity,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
  TrainingPathWeekSummary,
} from "./trainingPathTypes";

type TrainingPathWeekSummaryCardProps = {
  summary: TrainingPathWeekSummary | null;
  goals: TrainingPathSelectedGoal[];
  scheduledItems: TrainingPathScheduledItem[];
  completedActivities: TrainingPathCompletedActivity[];
  onOpenActivity: (activityId: string) => void;
  onOpenActivityPlan: (activityPlanId: string) => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGroupEvent: (eventId: string) => void;
  onOpenScheduledEvent: (eventId: string) => void;
};

function formatLoad(value: number) {
  return `${Math.round(value)} TSS`;
}

function WeekReviewSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View className="gap-2">
      <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function TrainingPathWeekSummaryCard({
  summary,
  goals,
  scheduledItems,
  completedActivities,
  onOpenActivity,
  onOpenActivityPlan,
  onOpenGoal,
  onOpenGroupEvent,
  onOpenScheduledEvent,
}: TrainingPathWeekSummaryCardProps) {
  if (!summary) {
    return null;
  }

  const showProjection =
    typeof summary.projectedFitnessAtGoal === "number" &&
    typeof summary.targetFitnessAtGoal === "number";

  return (
    <View className="gap-4" testID="training-path-week-summary">
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm font-semibold text-foreground">Week Review</Text>
          <Text className="text-xs font-medium text-muted-foreground" numberOfLines={1}>
            {summary.dateLabel}
          </Text>
        </View>
        {summary.body ? (
          <Text className="text-xs leading-5 text-muted-foreground">{summary.body}</Text>
        ) : null}
      </View>
      <WeekReviewSection title="Goals this week">
        {goals.length > 0 ? (
          goals.map((goal) => (
            <GoalListItem
              key={goal.id}
              goal={{
                id: goal.id,
                title: goal.label,
                target_date: goal.targetDate,
                activity_category: goal.activityCategory,
              }}
              readinessPercent={goal.readinessPercent}
              readinessTarget={goal.readinessTarget}
              status={goal.status ?? undefined}
              onPress={() => onOpenGoal(goal.id)}
              testID={`training-path-week-goal-${goal.id}`}
            />
          ))
        ) : (
          <Text className="text-xs text-muted-foreground">No goals found for this week.</Text>
        )}
      </WeekReviewSection>
      <WeekReviewSection title="Scheduled this week">
        {scheduledItems.length > 0 ? (
          scheduledItems.map((item) =>
            item.groupEvent ? (
              <GroupEventCard
                key={item.id}
                event={item.groupEvent}
                onPress={() => item.groupEvent && onOpenGroupEvent(item.groupEvent.id)}
                testID={`training-path-week-group-event-${item.id}`}
              />
            ) : item.event ? (
              <CalendarEventCard
                key={item.id}
                canStart={false}
                event={item.event}
                onPress={() => item.event && onOpenScheduledEvent(item.event.id)}
              />
            ) : item.activityPlan ? (
              <ActivityPlanCard
                key={item.id}
                activityPlan={item.activityPlan}
                plannedActivity={item.plannedActivity ?? undefined}
                onPress={() => item.activityPlanId && onOpenActivityPlan(item.activityPlanId)}
                showScheduleInfo
                testID={`training-path-week-activity-plan-${item.id}`}
                variant="default"
              />
            ) : (
              <View key={item.id} className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-xs font-medium text-foreground" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {typeof item.estimatedLoad === "number"
                    ? formatLoad(item.estimatedLoad)
                    : item.date}
                </Text>
              </View>
            ),
          )
        ) : (
          <Text className="text-xs text-muted-foreground">No scheduled sessions found.</Text>
        )}
      </WeekReviewSection>
      <WeekReviewSection title="Activities this week">
        {completedActivities.length > 0 ? (
          completedActivities.map((activity) =>
            activity.activity ? (
              <ActivityCard
                key={activity.id}
                activity={activity.activity}
                dateMode="absolute"
                onPress={() => onOpenActivity(activity.id)}
                showLike
                testID={`training-path-week-activity-${activity.id}`}
                variant="list"
              />
            ) : (
              <View key={activity.id} className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-xs font-medium text-foreground" numberOfLines={1}>
                  {activity.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {typeof activity.load === "number" ? formatLoad(activity.load) : activity.date}
                </Text>
              </View>
            ),
          )
        ) : summary.completedLoad > 0 ? (
          <Text className="text-xs font-semibold text-foreground">
            {formatLoad(summary.completedLoad)} completed this week
          </Text>
        ) : (
          <Text className="text-xs text-muted-foreground">No completed activities found.</Text>
        )}
      </WeekReviewSection>
      {showProjection ? (
        <Text className="text-xs font-medium text-muted-foreground">
          Fitness at goal: {Math.round(summary.projectedFitnessAtGoal ?? 0)} / ideal{" "}
          {Math.round(summary.targetFitnessAtGoal ?? 0)}
        </Text>
      ) : null}
    </View>
  );
}
