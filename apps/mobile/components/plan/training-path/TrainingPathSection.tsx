import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { DailyTrainingAdjustmentPoint } from "@/lib/training-path/dailyTrainingPathModel";
import { TrainingPathLoadChartSection } from "./TrainingPathLoadChartSection";
import {
  TrainingPathSelectedDaySummaryCard,
  TrainingPathWeekSummaryCard,
} from "./TrainingPathWeekSummaryCard";
import type {
  TrainingPathCompletedActivity,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
  TrainingPathViewModel,
} from "./trainingPathTypes";

type TrainingPathSectionProps = {
  model: TrainingPathViewModel;
  dailyPoints?: DailyTrainingAdjustmentPoint[];
  selectedDate?: string | null;
  selectedWeekGoals: TrainingPathSelectedGoal[];
  selectedWeekEvents: TrainingPathScheduledItem[];
  selectedWeekGroupEvents: TrainingPathScheduledItem[];
  selectedWeekCompletedActivities: TrainingPathCompletedActivity[];
  selectedWeekLoading?: boolean;
  chartLoading?: boolean;
  onScrollNearEnd?: () => void;
  onScrollNearStart?: () => void;
  onOpenActivity: (activityId: string) => void;
  onCreateGoal?: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGroup?: (groupId: string) => void;
  onOpenGroupEvent: (eventId: string) => void;
  onOpenScheduledEvent: (eventId: string) => void;
  onOpenSettings: () => void;
  onWeekScrollStart?: () => void;
  onSelectedWeekChange: (weekStart: string) => void;
  onSelectedDateChange?: (date: string) => void;
};

export function TrainingPathSection({
  model,
  dailyPoints,
  selectedDate,
  selectedWeekGoals,
  selectedWeekEvents,
  selectedWeekGroupEvents,
  selectedWeekCompletedActivities,
  selectedWeekLoading = false,
  chartLoading = false,
  onScrollNearEnd,
  onScrollNearStart,
  onOpenActivity,
  onCreateGoal,
  onOpenGoal,
  onOpenGroup,
  onOpenGroupEvent,
  onOpenScheduledEvent,
  onOpenSettings,
  onWeekScrollStart,
  onSelectedWeekChange,
  onSelectedDateChange,
}: TrainingPathSectionProps) {
  const selectedWeek = model.selectedWeekSummary;
  const [chartScrolling, setChartScrolling] = useState(false);
  const lastSelectedWeekStartRef = useRef<string | null>(selectedWeek?.weekStart ?? null);
  const [displayedWeekStart, setDisplayedWeekStart] = useState<string | null>(
    selectedWeek?.weekStart ?? null,
  );
  const weekReviewLoading = selectedWeekLoading || chartScrolling;
  const hasDailyPoints = !!dailyPoints?.length;

  useEffect(() => {
    const previousSelectedWeekStart = lastSelectedWeekStartRef.current;
    lastSelectedWeekStartRef.current = selectedWeek?.weekStart ?? null;
    if (selectedWeekLoading) return;
    if (
      chartScrolling &&
      selectedWeek?.weekStart !== previousSelectedWeekStart &&
      selectedWeek?.weekStart === displayedWeekStart
    ) {
      setChartScrolling(false);
    }
    if (chartScrolling) return;
    setDisplayedWeekStart(selectedWeek?.weekStart ?? null);
  }, [chartScrolling, displayedWeekStart, selectedWeek?.weekStart, selectedWeekLoading]);

  const beginWeekProgress = (weekStart?: string) => {
    if (weekStart) setDisplayedWeekStart(weekStart);
    setChartScrolling(true);
    onWeekScrollStart?.();
  };

  return (
    <View className="gap-4" testID="training-path-section">
      <TrainingPathLoadChartSection
        dailyPoints={dailyPoints}
        dailyDensity="standard"
        loading={chartLoading}
        model={model}
        onCreateGoal={onCreateGoal}
        onOpenSettings={onOpenSettings}
        onScrollNearEnd={onScrollNearEnd}
        onScrollNearStart={onScrollNearStart}
        onScrollInteractionSettled={() => setChartScrolling(false)}
        onScrollInteractionStart={() => {
          beginWeekProgress();
        }}
        onDisplayedWeekChange={setDisplayedWeekStart}
        renderBelowChart={(context) => {
          if (!hasDailyPoints) {
            const displayedWeekLabel = model.weeks.find(
              (week) => week.weekStart === displayedWeekStart,
            )?.label;
            return (
              <TrainingPathWeekSummaryCard
                loading={weekReviewLoading}
                loadingDateLabel={displayedWeekLabel ?? selectedWeek?.dateLabel}
                summary={selectedWeek}
                goals={selectedWeekGoals}
                events={selectedWeekEvents}
                groupEvents={selectedWeekGroupEvents}
                completedActivities={selectedWeekCompletedActivities}
                onOpenActivity={onOpenActivity}
                onOpenGoal={onOpenGoal}
                onOpenGroup={onOpenGroup}
                onOpenGroupEvent={onOpenGroupEvent}
                onOpenScheduledEvent={onOpenScheduledEvent}
              />
            );
          }
          const selectedDayDate = context.selectedDate ?? selectedDate ?? null;
          return (
            <TrainingPathSelectedDaySummaryCard
              loading={weekReviewLoading}
              date={selectedDayDate}
              point={context.selectedDayPoint}
              goals={selectedWeekGoals.filter((goal) => goal.targetDate === selectedDayDate)}
              events={selectedWeekEvents.filter((event) => event.date === selectedDayDate)}
              groupEvents={selectedWeekGroupEvents.filter(
                (event) => event.date === selectedDayDate,
              )}
              completedActivities={selectedWeekCompletedActivities.filter(
                (activity) => activity.date === selectedDayDate,
              )}
              onOpenActivity={onOpenActivity}
              onOpenGoal={onOpenGoal}
              onOpenGroup={onOpenGroup}
              onOpenGroupEvent={onOpenGroupEvent}
              onOpenScheduledEvent={onOpenScheduledEvent}
            />
          );
        }}
        selectedDate={selectedDate}
        selectionMode="day"
        showSelectedPointTray={false}
        onSelectedDateChange={onSelectedDateChange}
        onSelectedWeekChange={(weekStart) => {
          beginWeekProgress(weekStart);
          onSelectedWeekChange(weekStart);
        }}
      />
    </View>
  );
}
