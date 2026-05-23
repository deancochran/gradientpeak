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

function WeekReviewEmptyRow({ children }: { children: string }) {
  return <Text className="text-xs text-muted-foreground">{children}</Text>;
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
      {goals.length > 0 ? (
        <WeekReviewSection title="Goals this week">
          {goals.map((goal) => (
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
          ))}
        </WeekReviewSection>
      ) : (
        <WeekReviewEmptyRow>No goals this week.</WeekReviewEmptyRow>
      )}
      {scheduledItems.length > 0 ? (
        <WeekReviewSection title="Scheduled this week">
          {scheduledItems.map((item) =>
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
          )}
        </WeekReviewSection>
      ) : (
        <WeekReviewEmptyRow>No scheduled events this week.</WeekReviewEmptyRow>
      )}
      {completedActivities.length > 0 ? (
        <WeekReviewSection title="Activities this week">
          {completedActivities.map((activity) =>
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
          )}
        </WeekReviewSection>
      ) : (
        <WeekReviewEmptyRow>No activities this week.</WeekReviewEmptyRow>
      )}
    </View>
  );
}
