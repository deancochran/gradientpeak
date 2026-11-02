import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { ActivityDisplayModel } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { TouchableOpacity, View } from "react-native";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { GoalCard } from "@/components/shared/GoalCard";
import { PlannedActivityCard } from "@/components/shared/PlannedActivityCard";
import { parseDateKey } from "@/lib/calendar/dateMath";
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";
import { TrainingPathSelectedDayPanel } from "./TrainingPathSelectedDayPanel";

type Projection = inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];
type ProjectionDay = NonNullable<Projection["timeline"]>["days"][number];
type GoalMarker = Projection["goalMarkers"][number];

function todayRecommendation(
  point: DailyTrainingAdjustmentPoint | null,
  day: ProjectionDay | null,
) {
  const completed = point?.effectiveCompletedLoad ?? point?.completedLoad;
  const planned = point?.plannedLoad;
  const completedStatus =
    point?.effectiveCompletedLoadStatus ??
    (point?.effectiveLoadStatus === "partial" ? "partial" : undefined);
  const recovery = day?.scheduledItems.find((item) => /recovery|rest|easy/i.test(item.title));
  if (
    completedStatus !== "partial" &&
    completedStatus !== "unavailable" &&
    typeof completed === "number" &&
    typeof planned === "number" &&
    completed >= planned
  ) {
    return "Today’s planned Load is complete. Protect recovery before adding more.";
  }
  if (typeof planned === "number" && planned > 0)
    return "Next action: complete today’s planned Load.";
  if (recovery) return `Next action: keep ${recovery.title} in the schedule.`;
  return "Next action: choose or adjust today’s Load deliberately.";
}

export function PlanSelectedDay({
  completedActivities,
  completedActivitiesState,
  day,
  goals,
  onOpenCompletedActivity,
  onOpenDayDetails,
  onOpenGoal,
  onRetryCompletedActivities,
  point,
  selectedDate,
  todayKey,
}: {
  completedActivities: readonly ActivityDisplayModel[];
  completedActivitiesState: "error" | "loading" | "ready";
  day: ProjectionDay | null;
  goals: readonly GoalMarker[];
  onOpenCompletedActivity: (activityId: string) => void;
  onOpenDayDetails: (date: string) => void;
  onOpenGoal: (goalId: string) => void;
  onRetryCompletedActivities: () => void;
  point: DailyTrainingAdjustmentPoint | null;
  selectedDate: string;
  todayKey: string;
}) {
  const temporalState =
    selectedDate < todayKey ? "Past" : selectedDate > todayKey ? "Future" : "Today";
  const visibleCompleted = selectedDate > todayKey ? [] : (day?.completedItems ?? []);
  const completedActivityById = new Map(
    completedActivities.map((activity) => [activity.id, activity]),
  );
  const missingCompletedActivityCount = visibleCompleted.filter(
    (item) => !completedActivityById.has(item.id),
  ).length;
  const visibleScheduled = selectedDate < todayKey ? [] : (day?.scheduledItems ?? []);
  const itemCount = visibleScheduled.length + visibleCompleted.length + goals.length;
  const dateLabel = format(parseDateKey(selectedDate), "EEEE, MMMM d, yyyy");

  return (
    <View className="gap-3" testID="plan-selected-day">
      <TrainingPathSelectedDayPanel
        emptyState="Nothing is scheduled or completed for this day. Add work when it belongs here."
        eventCount={itemCount}
        metadata={[temporalState]}
        action={
          <TouchableOpacity
            accessibilityLabel={`Open training breakdown for ${dateLabel}`}
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-xl border border-border px-3"
            onPress={() => onOpenDayDetails(selectedDate)}
            testID="plan-selected-date-training-breakdown"
          >
            <Text className="text-xs font-semibold text-foreground">Training breakdown</Text>
          </TouchableOpacity>
        }
        testID="plan-selected-day-panel"
        title={dateLabel}
      >
        {selectedDate === todayKey ? (
          <Text
            className="text-sm leading-5 text-muted-foreground"
            testID="plan-today-recommendation"
          >
            {todayRecommendation(point, day)}
          </Text>
        ) : null}
        {goals.map((goal) => (
          <GoalCard
            goal={{
              id: goal.id,
              targetDate: goal.targetDate,
              title: goal.label,
              typeLabel: "Goal",
            }}
            key={goal.id}
            onPress={() => onOpenGoal(goal.id)}
            testID={`plan-selected-day-goal-${goal.id}`}
            variant="compact"
          />
        ))}
        {visibleCompleted.map((item) => {
          const activity = completedActivityById.get(item.id);
          return activity ? (
            <ActivityCard
              activity={activity}
              dateMode="none"
              key={`completed-${item.id}`}
              onPress={() => onOpenCompletedActivity(item.id)}
              showNotes={false}
              testID={`plan-selected-day-activity-card-${item.id}`}
            />
          ) : null;
        })}
        {visibleCompleted.length > 0 && completedActivitiesState === "loading" ? (
          <Text className="text-sm text-muted-foreground">Loading completed activities…</Text>
        ) : null}
        {visibleCompleted.length > 0 && completedActivitiesState === "error" ? (
          <TouchableOpacity
            accessibilityRole="button"
            className="min-h-11 justify-center rounded-xl border border-border px-3"
            onPress={onRetryCompletedActivities}
            testID="plan-selected-day-activities-retry"
          >
            <Text className="text-sm font-medium text-foreground">
              Completed activities unavailable. Retry
            </Text>
          </TouchableOpacity>
        ) : null}
        {completedActivitiesState === "ready" && missingCompletedActivityCount > 0 ? (
          <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
            Some completed activity details are unavailable.
          </Text>
        ) : null}
        {visibleScheduled.map((item) => (
          <PlannedActivityCard
            key={`scheduled-${item.id}`}
            onPress={() => onOpenDayDetails(selectedDate)}
            plannedActivity={{
              calendarDate: item.date,
              id: item.id,
              status: item.status === "cancelled" ? "cancelled" : "scheduled",
              metrics: [],
              plan: null,
              subtitle: item.activityCategory ?? null,
              title: item.title,
            }}
            testID={`plan-selected-day-planned-activity-card-${item.id}`}
            variant="compact"
          />
        ))}
      </TrainingPathSelectedDayPanel>
    </View>
  );
}
