import { invalidateGoalQueries } from "@repo/api/react";
import {
  buildGoalIntelligence,
  buildGoalReadinessTrajectory,
  formatGoalTypeLabel,
  type GoalReadinessTrajectoryPointInput,
  getGoalObjectiveSummary,
  getManualBaselineCtlWarning,
  getProfileGoalLifecycleStatus,
  parseProfileGoalRecord,
  resolveGoalReadinessTarget,
} from "@repo/core";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, Bike, CalendarDays, Dumbbell, Footprints, Waves } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { PlanReadinessComparisonChart } from "@/components/charts/PlanReadinessComparisonChart";
import { GoalReadinessRing } from "@/components/plan/GoalReadinessRing";
import {
  DetailDeleteConfirmModal,
  DetailOverflowMenu,
  DetailScaffold,
} from "@/components/shared/detail";
import { resolveGoalSpecificFallbackReadiness } from "@/lib/analytics/goalReadiness";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";

type ReadinessChartPoint = {
  date: string;
  actual: number | null;
  scheduled: number | null;
  recommended: number | null;
  recommendedLow: number | null;
  recommendedHigh: number | null;
};

function SectionCard({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <Card className="rounded-3xl border border-border bg-card" testID={testID}>
      <CardContent className="gap-4 p-4">{children}</CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm font-semibold text-foreground">{children}</Text>;
}

function ReadinessNote({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <View className="rounded-2xl border border-border bg-muted/20 px-3 py-2" testID={testID}>
      <Text className="text-xs leading-5 text-muted-foreground">{children}</Text>
    </View>
  );
}

function formatActivityCategory(value: string | null | undefined) {
  if (!value) return "Activity";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getActivityCategoryIcon(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("run")) return Footprints;
  if (normalized.includes("bike") || normalized.includes("cycling")) return Bike;
  if (normalized.includes("swim")) return Waves;
  if (normalized.includes("strength")) return Dumbbell;
  return Activity;
}

function extractReadinessScore(record: unknown): number | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const candidate =
    "readiness_score" in record
      ? record.readiness_score
      : "readinessScore" in record
        ? record.readinessScore
        : null;

  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function todayDateKey() {
  return new Date().toISOString().split("T")[0] ?? "";
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0] ?? value;
}

function formatDateShort(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDaysUntilGoal(targetDate: string | null, today: string) {
  if (!targetDate) {
    return "No target date";
  }

  const target = new Date(`${targetDate}T12:00:00.000Z`);
  const reference = new Date(`${today}T12:00:00.000Z`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(reference.getTime())) {
    return "Target date set";
  }

  const dayCount = Math.ceil((target.getTime() - reference.getTime()) / 86_400_000);
  if (dayCount < 0) {
    return "Past target date";
  }
  if (dayCount === 0) {
    return "Today";
  }
  return `${dayCount} day${dayCount === 1 ? "" : "s"} out`;
}

function buildGoalReadinessChartPoints(params: {
  readinessForecast: any;
  projectionReadinessPoints?: Array<{
    date?: string;
    readiness_score?: number | null;
    predicted_fitness_ctl?: number | null;
  }>;
  targetDate: string | null;
  today: string;
  currentGoalReadiness: number | null;
  targetGoalReadiness: number;
}) {
  const {
    readinessForecast,
    projectionReadinessPoints,
    targetDate,
    today,
    currentGoalReadiness,
    targetGoalReadiness,
  } = params;
  if (!readinessForecast || !targetDate || targetDate < today) {
    return [] as ReadinessChartPoint[];
  }

  const windowEnd = addDays(targetDate, 1);
  const isVisible = (date: string) => date >= today && date <= windowEnd;
  const projectionPoints = (projectionReadinessPoints ?? [])
    .filter((point) => typeof point.date === "string" && isVisible(point.date))
    .map((point) => ({
      date: point.date!,
      state_readiness: point.readiness_score,
      predicted_fitness_ctl: point.predicted_fitness_ctl,
    }));
  let statePoints: GoalReadinessTrajectoryPointInput[] =
    projectionPoints.length > 0
      ? projectionPoints
      : (readinessForecast.series?.recommended?.points ?? [])
          .filter(
            (point: any) =>
              point.date && isVisible(point.date) && typeof point.readiness === "number",
          )
          .map((point: any) => ({
            date: point.date,
            state_readiness: point.readiness,
          }));
  const hasTodayPoint = statePoints.some((point) => point.date === today);
  if (!hasTodayPoint && typeof currentGoalReadiness === "number") {
    statePoints = [
      {
        date: today,
        state_readiness: currentGoalReadiness,
        predicted_fitness_ctl: projectionPoints[0]?.predicted_fitness_ctl ?? null,
      },
      ...statePoints,
    ].sort((left, right) => left.date.localeCompare(right.date));
  }
  const anchoredPoints = buildGoalReadinessTrajectory({
    points: statePoints,
    goalTargetDate: targetDate,
    currentGoalReadiness,
    targetGoalReadiness,
    confidence: readinessForecast.confidence,
  });

  return anchoredPoints.map((point) => ({
    date: point.date,
    actual: null,
    scheduled: null,
    recommended: point.goal_readiness,
    recommendedLow: point.low,
    recommendedHigh: point.high,
  }));
}

function resolveGoalReadinessPercent(params: {
  goal: {
    activity_category?: string | null;
    priority?: number | null;
    target_date?: string | null;
    target_payload?: unknown;
    objective?: unknown;
  } | null;
  goalId: string;
  targetDate: string | null;
  todayKey: string;
  goalForecasts: Array<{ profile_goal_id?: string; readiness_score?: number | null }>;
  currentReadiness?: number | null;
  idealCurveData?: {
    dataPoints?: Array<{ date?: string; ctl?: number | null }>;
    startCTL?: number | null;
    targetCTL?: number | null;
  } | null;
}) {
  const forecastReadiness = params.goalForecasts.find(
    (forecast) => forecast.profile_goal_id === params.goalId,
  )?.readiness_score;
  if (typeof forecastReadiness === "number" && Number.isFinite(forecastReadiness)) {
    return forecastReadiness;
  }

  const dataPoints = params.idealCurveData?.dataPoints ?? [];
  const startCtl =
    typeof params.idealCurveData?.startCTL === "number"
      ? params.idealCurveData.startCTL
      : (dataPoints[0]?.ctl ?? 0);
  const targetCtl =
    typeof params.idealCurveData?.targetCTL === "number" ? params.idealCurveData.targetCTL : null;
  const lastPoint = dataPoints[dataPoints.length - 1] ?? null;
  const targetDate = params.targetDate;
  const projectedAtGoal = targetDate
    ? (dataPoints.find((point) => typeof point.date === "string" && point.date >= targetDate) ??
      lastPoint)
    : lastPoint;

  if (
    !projectedAtGoal ||
    typeof projectedAtGoal.ctl !== "number" ||
    typeof targetCtl !== "number"
  ) {
    return resolveGoalSpecificFallbackReadiness({
      goal: params.goal ?? { target_date: params.targetDate },
      currentReadiness: params.currentReadiness,
      todayKey: params.todayKey,
    });
  }

  const denominator = targetCtl - startCtl;
  if (denominator === 0) {
    return projectedAtGoal.ctl >= targetCtl ? 100 : 0;
  }

  return Math.max(0, ((projectedAtGoal.ctl - startCtl) / denominator) * 100);
}

export default function GoalDetailScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = typeof id === "string" ? id : "";
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: goal, isLoading } = api.goals.getById.useQuery(
    { id: goalId },
    { enabled: !!goalId },
  );
  const { data: activePlan } = api.trainingPlans.getActivePlan.useQuery(undefined);
  const todayKey = useMemo(() => todayDateKey(), []);
  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
    includeStatus: false,
    includeWeeklySummaries: false,
    curveWindow: "overview",
  });
  const goalRecord = useMemo(() => {
    if (!goal) {
      return null;
    }

    try {
      return parseProfileGoalRecord(goal);
    } catch {
      return null;
    }
  }, [goal]);

  const deleteGoalMutation = api.goals.delete.useMutation({
    onSuccess: async () => {
      await invalidateGoalQueries(utils, { includeGoalDetail: false });
      router.back();
    },
  });

  const objectiveSummary = goalRecord ? getGoalObjectiveSummary(goalRecord) : null;
  const lifecycleStatus = goalRecord ? getProfileGoalLifecycleStatus({ goal: goalRecord }) : null;
  const goalIntelligence = goalRecord
    ? buildGoalIntelligence({
        goal: goalRecord,
        readinessScore: extractReadinessScore(goal),
      })
    : null;
  const targetDate = goalRecord?.target_date ?? null;
  const formattedTargetDate = formatDateShort(targetDate);
  const daysUntilGoal = formatDaysUntilGoal(targetDate, todayKey);
  const ActivityIcon = getActivityCategoryIcon(goalRecord?.activity_category);
  const activityCategoryLabel = formatActivityCategory(goalRecord?.activity_category);
  const goalReadinessForecast = useMemo(
    () =>
      (snapshot.insightTimeline?.projection_dashboard?.goal_forecasts ?? []).find(
        (forecast) => forecast.profile_goal_id === (goalRecord?.id ?? goalId),
      ) ?? null,
    [goalId, goalRecord?.id, snapshot.insightTimeline?.projection_dashboard?.goal_forecasts],
  );
  const targetGoalReadiness = useMemo(
    () =>
      goalReadinessForecast?.readiness_target ??
      resolveGoalReadinessTarget(snapshot.profileSettings.goal_strategy_preferences),
    [goalReadinessForecast?.readiness_target, snapshot.profileSettings],
  );
  const goalReadinessPercent = useMemo(() => {
    return resolveGoalReadinessPercent({
      goal: goalRecord,
      goalId: goalRecord?.id ?? goalId,
      targetDate,
      todayKey,
      goalForecasts: snapshot.insightTimeline?.projection_dashboard?.goal_forecasts ?? [],
      currentReadiness: snapshot.insightTimeline?.readiness_forecast?.current_readiness ?? null,
      idealCurveData: snapshot.idealCurveData,
    });
  }, [
    goalId,
    goalRecord,
    snapshot.idealCurveData,
    snapshot.insightTimeline?.projection_dashboard?.goal_forecasts,
    snapshot.insightTimeline?.readiness_forecast?.current_readiness,
    targetDate,
    todayKey,
  ]);
  const goalReadinessChartPoints = useMemo(
    () =>
      buildGoalReadinessChartPoints({
        readinessForecast: snapshot.insightTimeline?.readiness_forecast,
        projectionReadinessPoints: snapshot.insightTimeline?.projection_dashboard?.readiness_points,
        targetDate,
        today: todayKey,
        currentGoalReadiness: goalReadinessPercent,
        targetGoalReadiness,
      }),
    [
      goalId,
      goalRecord?.id,
      goalReadinessPercent,
      snapshot.insightTimeline?.projection_dashboard?.readiness_points,
      snapshot.insightTimeline?.readiness_forecast,
      targetGoalReadiness,
      targetDate,
      todayKey,
    ],
  );
  const goalReadinessMarker = targetDate
    ? [
        {
          id: goalRecord?.id ?? goalId,
          targetDate,
          label: goalRecord?.title ?? "Goal",
          status: lifecycleStatus?.label,
          color: "rgba(34, 197, 94, 0.68)",
          targetMetric: objectiveSummary,
        },
      ]
    : [];
  const readinessForecast = snapshot.insightTimeline?.readiness_forecast ?? null;
  const readinessReasonCodes = readinessForecast?.confidence_reason_codes ?? [];
  const hasEstimatedReadinessForecast =
    readinessReasonCodes.includes("missing_recent_history") ||
    readinessReasonCodes.includes("projection_fallback_baseline");
  const manualBaselineCtl = snapshot.profileSettings.baseline_fitness?.is_enabled
    ? snapshot.profileSettings.baseline_fitness.override_ctl
    : null;
  const manualBaselineCtlWarning = getManualBaselineCtlWarning(manualBaselineCtl);
  const readinessSummary =
    typeof readinessForecast?.current_readiness === "number"
      ? `Current readiness ${Math.round(readinessForecast.current_readiness)}/100`
      : goalIntelligence?.summary;
  const readinessSectionTitle = hasEstimatedReadinessForecast
    ? "Estimated readiness path"
    : "Readiness to goal";
  const readinessSectionCopy = targetDate
    ? hasEstimatedReadinessForecast
      ? `Estimated from today through ${formattedTargetDate ?? "the goal date"}. This uses your saved baseline and goals until completed activity history is available.`
      : `Forecast from today through ${formattedTargetDate ?? "the goal date"}. ${
          readinessSummary ?? "Readiness forecast is still building."
        }`
    : "Add a target date to show readiness from today until this goal.";

  const handleDeleteGoal = () => {
    if (!goalRecord) {
      return;
    }

    setShowDeleteConfirm(true);
  };

  const renderHeaderActions = () => (
    <DetailOverflowMenu
      actions={
        goalRecord
          ? [
              {
                label: "Edit Goal",
                onPress: () => router.navigate(ROUTES.GOALS.EDIT(goalRecord.id) as never),
                testID: "goal-detail-options-edit",
              },
              {
                label: "Delete Goal",
                onPress: handleDeleteGoal,
                testID: "goal-detail-options-delete",
                variant: "destructive",
              },
            ]
          : []
      }
      testID="goal-detail-options-trigger"
    />
  );

  if (isLoading || !goalRecord) {
    return (
      <DetailScaffold
        headerRight={renderHeaderActions}
        isLoading={isLoading}
        loadingLabel="Loading goal..."
        notFound={!goalRecord}
        notFoundDescription="This goal may have been removed."
        notFoundOnActionPress={() => router.back()}
        notFoundTitle="Goal not found"
      >
        {null}
      </DetailScaffold>
    );
  }

  return (
    <DetailScaffold
      headerRight={renderHeaderActions}
      modals={
        showDeleteConfirm && goalRecord ? (
          <DetailDeleteConfirmModal
            entityLabel="Goal"
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={() => {
              deleteGoalMutation.mutate({ id: goalRecord.id });
            }}
            pending={deleteGoalMutation.isPending}
            testIDPrefix="goal-detail"
          />
        ) : null
      }
    >
      <SectionCard>
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Icon as={ActivityIcon} size={20} className="text-muted-foreground" />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {activityCategoryLabel} · {formatGoalTypeLabel(goalRecord)}
            </Text>
            <Text className="text-xl font-semibold text-foreground" numberOfLines={2}>
              {goalRecord.title}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {formattedTargetDate || "Target date not set"} · {lifecycleStatus?.label ?? "Goal"}
            </Text>
          </View>
          <GoalReadinessRing value={goalReadinessPercent} target={targetGoalReadiness} />
        </View>

        {objectiveSummary ? (
          <Text className="text-sm leading-5 text-muted-foreground">{objectiveSummary}</Text>
        ) : null}

        <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
          <View className="flex-row items-center gap-2">
            <Icon as={CalendarDays} size={15} className="text-muted-foreground" />
            <Text className="text-sm font-medium text-foreground">{daysUntilGoal}</Text>
          </View>
          <Text className="text-xs font-medium text-muted-foreground">
            Priority {goalRecord.priority}/10
          </Text>
        </View>
      </SectionCard>

      <SectionCard testID="goal-readiness-chart-card">
        <View className="gap-1">
          <SectionTitle>{readinessSectionTitle}</SectionTitle>
          <Text className="text-sm leading-5 text-muted-foreground">{readinessSectionCopy}</Text>
        </View>

        {hasEstimatedReadinessForecast ? (
          <ReadinessNote testID="goal-readiness-estimated-note">
            Estimated readiness is lower confidence because no completed activities are available.
          </ReadinessNote>
        ) : null}

        {manualBaselineCtlWarning ? (
          <ReadinessNote testID="goal-readiness-baseline-warning">
            {manualBaselineCtlWarning}
          </ReadinessNote>
        ) : null}

        {goalReadinessChartPoints.length > 0 ? (
          <PlanReadinessComparisonChart
            points={goalReadinessChartPoints}
            goalMarkers={goalReadinessMarker}
            today={todayKey}
            height={260}
            showTitle={false}
            accessibilitySummary={`Readiness forecast for ${goalRecord.title} from today until ${formattedTargetDate ?? "the goal date"}.`}
          />
        ) : (
          <View className="h-44 items-center justify-center rounded-2xl bg-muted/20 px-4">
            <Text className="text-center text-sm font-medium text-foreground">
              No readiness forecast yet
            </Text>
            <Text className="mt-1 text-center text-xs leading-5 text-muted-foreground">
              A dated active plan with readiness forecast data is needed for this chart.
            </Text>
          </View>
        )}
      </SectionCard>

      {goalIntelligence?.keyDrivers.length ? (
        <View className="gap-2 px-1" testID="goal-intelligence-card">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Readiness signals
          </Text>
          {goalIntelligence.keyDrivers.slice(0, 3).map((driver) => (
            <View key={driver.metric} className="flex-row items-center justify-between gap-3 py-1">
              <Text className="flex-1 text-sm text-foreground">{driver.label}</Text>
              <Text className="text-xs capitalize text-muted-foreground">{driver.impact}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </DetailScaffold>
  );
}
