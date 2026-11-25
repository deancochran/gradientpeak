import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { PlanAnalysisWindowPeriod } from "@repo/core";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";
import {
  aggregateDailyTrainingAdjustmentPoints,
  getPlanChartBucketDate,
} from "./dailyTrainingAdjustmentChartPresentation";
import { PlanSelectedDay } from "./PlanSelectedDay";
import { PlanSelectedPeriodReview } from "./PlanSelectedPeriodReview";
import { PlanTrainingChart } from "./PlanTrainingChart";
import type { PlanTrainingChartRange, TrainingPathViewModel } from "./trainingPathTypes";

type Projection = inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];
type ProjectionDay = NonNullable<Projection["timeline"]>["days"][number];
type GoalMarker = Projection["goalMarkers"][number];

/** One range-aware Load timeline plus one canonical selected-day context. */
export function PlanUnifiedTrendDashboard({
  analysisAnchor,
  analysisPeriod,
  analysisWindowLoading,
  dailyPoints,
  goalMarkers,
  model,
  onGoalPress,
  onOpenCompletedActivity,
  onOpenPlannedSession,
  onPeriodShift,
  onRangeChange,
  onRangeToday,
  onSelectedDateChange,
  onViewDetails,
  primaryGoalId,
  selectedDate,
  timelineDaysByDate,
}: {
  analysisAnchor: string;
  analysisPeriod: PlanAnalysisWindowPeriod;
  analysisWindowLoading: boolean;
  dailyPoints: DailyTrainingAdjustmentPoint[];
  goalMarkers: readonly GoalMarker[];
  model: TrainingPathViewModel;
  onGoalPress: (goalId: string) => void;
  onOpenCompletedActivity: (activityId: string) => void;
  onOpenPlannedSession: (sessionId: string) => void;
  onPeriodShift: (direction: -1 | 1) => void;
  onRangeChange: (period: PlanAnalysisWindowPeriod) => void;
  onRangeToday: () => void;
  onSelectedDateChange: (date: string) => void;
  onViewDetails: (date: string, period: "day" | "week") => void;
  primaryGoalId: string | null;
  selectedDate: string;
  timelineDaysByDate: Record<string, ProjectionDay>;
}) {
  const [binning, setBinning] = useState<PlanTrainingChartRange>("daily");
  const chartPoints = useMemo(
    () => aggregateDailyTrainingAdjustmentPoints(dailyPoints, binning),
    [binning, dailyPoints],
  );
  const selectedBucketKey = getPlanChartBucketDate(selectedDate, binning);
  const selectedIndex = dailyPoints.findIndex((point) => point.date === selectedDate);
  const selectedPoint = dailyPoints[selectedIndex] ?? null;
  const selectedDay = timelineDaysByDate[selectedDate] ?? null;
  const selectedGoals = goalMarkers.filter((goal) => goal.targetDate === selectedDate);
  const selectedPeriod = binning === "weekly" ? "week" : "day";
  const periodReviewQuery = api.trainingPlans.getPlanPeriodReview.useQuery(
    { anchorDate: selectedDate, period: selectedPeriod },
    { retry: false },
  );
  const selectedDayCalendarQuery = api.calendar.day.useQuery(
    { date: selectedDate },
    { enabled: selectedPeriod === "day", retry: false },
  );
  const selectedDayActivities = useMemo(
    () =>
      selectedDayCalendarQuery.data?.projection.items.flatMap((item) =>
        item.activity ? [item.activity] : [],
      ) ?? [],
    [selectedDayCalendarQuery.data],
  );

  return (
    <View className="gap-3" testID="plan-unified-trends">
      <PlanTrainingChart
        analysisAnchor={analysisAnchor}
        analysisPeriod={analysisPeriod}
        analysisWindowLoading={analysisWindowLoading}
        binning={binning}
        dailyPoints={dailyPoints}
        goalMarkers={goalMarkers}
        onBinningChange={setBinning}
        onGoalPress={onGoalPress}
        onPeriodShift={onPeriodShift}
        onRangeChange={onRangeChange}
        onRangeToday={onRangeToday}
        onSelectedDateChange={onSelectedDateChange}
        primaryGoalId={primaryGoalId}
        selectedDate={selectedDate}
        todayKey={model.todayKey}
      />
      {selectedPeriod !== "day" ? (
        <PlanSelectedPeriodReview
          fallbackPoint={
            chartPoints.find(
              (point) => getPlanChartBucketDate(point.date, binning) === selectedBucketKey,
            ) ?? null
          }
          loading={periodReviewQuery.isLoading || periodReviewQuery.isFetching}
          onOpenDetails={() => onViewDetails(selectedDate, selectedPeriod)}
          onRetry={() => void periodReviewQuery.refetch()}
          review={periodReviewQuery.data ?? null}
        />
      ) : (
        <PlanSelectedDay
          completedActivities={selectedDayActivities}
          completedActivitiesState={
            selectedDayCalendarQuery.isLoading || selectedDayCalendarQuery.isFetching
              ? "loading"
              : selectedDayCalendarQuery.isError
                ? "error"
                : "ready"
          }
          day={selectedDay}
          goals={selectedGoals}
          onOpenCompletedActivity={onOpenCompletedActivity}
          onOpenDayDetails={(date) => onViewDetails(date, "day")}
          onOpenGoal={onGoalPress}
          onOpenPlannedSession={onOpenPlannedSession}
          onRetryCompletedActivities={() => void selectedDayCalendarQuery.refetch()}
          point={selectedPoint}
          selectedDate={selectedDate}
          todayKey={model.todayKey}
        />
      )}
    </View>
  );
}
