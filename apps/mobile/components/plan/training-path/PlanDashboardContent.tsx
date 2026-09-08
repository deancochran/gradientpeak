import { useMemo } from "react";
import { View } from "react-native";
import { useProductAnalytics } from "@/lib/analytics/productAnalytics";
import { api } from "@/lib/api";
import { PlanGoalTrajectory } from "./PlanGoalTrajectory";
import { PlanUnifiedTrendDashboard } from "./PlanUnifiedTrendDashboard";
import { buildGoalSignalFreshnessLabel } from "./planDashboardPresentation";
import type { usePlanTrainingPathData } from "./usePlanTrainingPathData";

type PlanData = ReturnType<typeof usePlanTrainingPathData>;

export function PlanDashboardContent({
  data,
  onCreateGoal,
  onOpenGoal,
  onOpenGoals,
  onOpenSourceActivity,
  onViewDetails,
}: {
  data: PlanData;
  onCreateGoal: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGoals: () => void;
  onOpenSourceActivity: (activityId: string) => void;
  onViewDetails: (date: string, period: "day" | "week") => void;
}) {
  const productAnalytics = useProductAnalytics();
  const goalsByDate = useMemo(
    () =>
      [...data.goalMarkers].sort(
        (left, right) =>
          left.targetDate.localeCompare(right.targetDate) ||
          right.priority - left.priority ||
          left.id.localeCompare(right.id),
      ),
    [data.goalMarkers],
  );
  const portfolioQuery = api.athleteIntelligence.getGoalPortfolio.useQuery({});
  const selectedGoal = portfolioQuery.data?.selectedGoal ?? null;

  const assessmentQuery = api.athleteIntelligence.getGoalAssessment.useQuery(
    { goalId: selectedGoal?.id ?? "" },
    { enabled: Boolean(selectedGoal) },
  );
  const progressQuery = api.athleteIntelligence.getGoalProgress.useQuery(
    { goalId: selectedGoal?.id ?? "" },
    { enabled: Boolean(selectedGoal) },
  );
  const selectedDate = data.selectedDate || data.trainingPath.todayKey;
  const signalRevisions = [
    data.projectionRevision,
    assessmentQuery.data?.stateRevision,
    progressQuery.data?.publication?.publishedRevision,
  ];
  const signalsAvailable =
    signalRevisions.every((value): value is number => typeof value === "number") &&
    assessmentQuery.data?.freshness === "fresh" &&
    progressQuery.data?.publication?.status === "available";
  const signalsAligned =
    signalsAvailable && signalRevisions.every((value) => value === signalRevisions[0]);
  const coherenceStatus =
    assessmentQuery.isLoading || progressQuery.isLoading
      ? "Updating goal signals"
      : assessmentQuery.isError || progressQuery.isError
        ? "Some goal signals are unavailable"
        : signalsAligned
          ? null
          : signalsAvailable
            ? "Goal and training signals updated separately"
            : "Some goal signals are stale or unavailable";
  const freshnessLabel = buildGoalSignalFreshnessLabel({
    assessmentComputedAt: assessmentQuery.data?.computedAt,
    assessmentFreshness: assessmentQuery.data?.freshness,
    progressComputedAt: progressQuery.data?.publication?.computedAt,
    progressFreshness: progressQuery.data?.publication?.status,
  });
  const coherenceLabel = coherenceStatus ? `${coherenceStatus}. ${freshnessLabel}` : freshnessLabel;

  return (
    <View className="gap-5" testID="plan-command-center">
      <PlanGoalTrajectory
        coherenceLabel={coherenceLabel}
        markersTruncated={data.goalMarkersTruncated}
        onOpenGoal={(goalId) => {
          productAnalytics.capture("goal.detail_opened", { source: "plan_dashboard" });
          onOpenGoal(goalId);
        }}
        onCreateGoal={onCreateGoal}
        onOpenGoals={onOpenGoals}
        portfolioError={portfolioQuery.isError}
        portfolioLoading={portfolioQuery.isLoading}
        progress={progressQuery.data?.result}
        progressError={progressQuery.isError}
        progressLoading={progressQuery.isLoading}
        readinessLoading={assessmentQuery.isLoading}
        readinessStatus={assessmentQuery.data?.assessment?.status}
        selectedGoal={selectedGoal}
        totalGoalCount={portfolioQuery.data?.totalGoalCount ?? null}
      />
      <PlanUnifiedTrendDashboard
        analysisAnchor={data.analysisAnchor}
        analysisPeriod={data.analysisPeriod}
        analysisWindowLoading={data.analysisWindowLoading}
        dailyPoints={data.dailyTrainingPathPoints}
        goalMarkers={goalsByDate}
        model={data.trainingPath}
        onGoalPress={(goalId) => {
          productAnalytics.capture("goal.detail_opened", { source: "plan_dashboard" });
          onOpenGoal(goalId);
        }}
        onOpenCompletedActivity={onOpenSourceActivity}
        onPeriodShift={(direction) => {
          productAnalytics.capture("plan.chart_engaged", { chart: "training" });
          data.handleAnalysisPeriodShift(direction);
        }}
        onRangeChange={(range) => {
          productAnalytics.capture("plan.range_selected", { range });
          data.handleAnalysisRangeChange(range);
        }}
        onRangeToday={data.handleAnalysisToday}
        onSelectedDateChange={(date) => {
          productAnalytics.capture("plan.chart_engaged", { chart: "training" });
          data.handleSelectedDateChange(date);
        }}
        onViewDetails={(date, period) => {
          productAnalytics.capture("plan.calendar_action", { action: "details" });
          onViewDetails(date, period);
        }}
        primaryGoalId={selectedGoal?.id ?? null}
        selectedDate={selectedDate}
        timelineDaysByDate={data.timelineDaysByDate}
      />
    </View>
  );
}
