import {
  type AthleteTrainingSettings,
  resolveGoalReadinessTarget,
  resolveGoalReadinessViewModel,
} from "@repo/core";
import { useMemo } from "react";
import { buildGoalOverlays } from "@/lib/analytics/goalOverlays";
import { resolveGoalSpecificFallbackReadiness } from "@/lib/analytics/goalReadiness";
import type { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import type { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";

type PlanGoals = Pick<ReturnType<typeof useProfileGoals>, "goals" | "goalsCount">;
type PlanSnapshot = ReturnType<typeof useTrainingPlanSnapshot>;
export type PlanProjectionDashboard = NonNullable<
  PlanSnapshot["insightTimeline"]
>["projection_dashboard"];
export type PlanReadinessForecast = NonNullable<
  PlanSnapshot["insightTimeline"]
>["readiness_forecast"];

export type PlanReadinessComparisonPoint = {
  date: string;
  actual: number | null;
  scheduled: number | null;
  recommended: number | null;
  recommendedLow: number | null;
  recommendedHigh: number | null;
};

export type PlanReadinessGoalMarker = {
  id: string;
  targetDate: string;
  label?: string;
  status?: string;
  color?: string;
  targetMetric?: string | null;
};

export type PlanWeeklyLoadBar = {
  weekStart: string;
  weekEnd: string | null;
  label: string;
  actual: number;
  scheduled: number;
  recommended: number;
  isCurrentWeek: boolean;
};

export type PlanUpcomingImpact = {
  id: string;
  title: string;
  scheduledAt: string;
  sport: string;
  estimatedLoad: number | null;
  readinessDelta: number | null;
  fitnessContribution: number | null;
  confidence: string;
  explanation: string;
};

export type PlanScheduleAction = {
  label: string;
  date: string;
  rationale: string;
} | null;

export type PlanActivityMatch = {
  id: string;
  name: string;
  targetDate: string;
  activityCategory: string | null;
  estimatedTss: number | null;
  estimatedDurationSeconds: number | null;
  score: number;
  targetTssDelta: number;
  absoluteTssGap: number | null;
  reasonLabels: string[];
};

export type PlanActivityMatchEmptyReason =
  | "no_positive_gap"
  | "no_activity_plans"
  | "no_estimated_tss"
  | "low_confidence"
  | null;

export type PlanBaselineEstimate = {
  weeklyLoad: number | null;
  weeklyDurationMinutes: number | null;
  sessionsPerWeek: number | null;
  source: "forecast" | "preferences";
};

export type PlanGoalReadinessStatus =
  | "Above target range"
  | "In target range"
  | "Building toward target"
  | "Below target range"
  | "Estimating";

export type PlanGoalReadinessItem = {
  goal: PlanGoals["goals"][number];
  forecast: NonNullable<PlanProjectionDashboard>["goal_forecasts"][number] | null;
  readinessPercent: number | null;
  readinessTarget: number;
  projectedCtl: number | null;
  targetCtl: number | null;
  status: PlanGoalReadinessStatus;
};

export type PlanGoalOutlookCard = PlanGoalReadinessItem & {
  label: "Next goal" | "Top priority";
};

const GOAL_OUTLOOK_MAX_VISIBLE = 4;

type ActivePlanInput = {
  id?: string | null;
  next_event_at?: string | null;
  training_plan?: {
    name?: string | null;
  } | null;
} | null;

type PlannedEventInput = {
  training_plan_id?: string | null;
  starts_at: string;
};

type UsePlanDashboardViewModelParams = {
  activePlan: ActivePlanInput | undefined;
  goals: PlanGoals;
  profileSettings: AthleteTrainingSettings;
  snapshot: PlanSnapshot;
  upcomingPlannedEvents: PlannedEventInput[] | null | undefined;
  recentPlannedEvents: PlannedEventInput[] | null | undefined;
  today: Date;
};

function getWeekStart(value: Date) {
  const date = new Date(value);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
}

function getWeekEnd(weekStart: Date) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function getWeekStartDateKey(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().split("T")[0] ?? value;
}

function compactDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0] ?? value;
}

function confidenceLabel(confidence?: string | null) {
  return confidence === "high"
    ? "High confidence"
    : confidence === "medium"
      ? "Medium confidence"
      : "Low confidence";
}

function confidenceReasonCopy(code: string) {
  switch (code) {
    case "missing_recent_history":
      return "Recent activity history is limited.";
    case "missing_scheduled_intensity":
      return "Some scheduled sessions are missing intensity detail.";
    case "inferred_scheduled_load":
      return "Scheduled load is estimated from available plan details.";
    case "missing_goal_specificity":
      return "Add a dated, specific goal for a sharper forecast.";
    case "projection_fallback_baseline":
      return "Current fitness is using a fallback baseline.";
    case "recommended_path_unavailable":
      return "Recommended path data is not available yet.";
    case "scheduled_path_unavailable":
      return "Scheduled activity data is not available yet.";
    case "safety_cap_constrained":
      return "Safety caps are limiting the recommended path.";
    default:
      return null;
  }
}

function activityPlanMatchReasonCopy(code: string) {
  switch (code) {
    case "near_target_tss":
      return "Near target load";
    case "same_activity_category":
      return "Same activity type";
    case "reasonable_duration":
      return "Duration estimated";
    case "owned_plan":
      return "Saved plan";
    case "recently_created":
      return "Recently created";
    default:
      return null;
  }
}

function gapTitle(type?: string | null) {
  switch (type) {
    case "low_confidence":
      return "Forecast needs better inputs";
    case "overload_risk":
      return "Scheduled load looks too high";
    case "goal_risk":
      return "Goal readiness is at risk";
    case "plan_gap":
      return "Schedule trails the recommended path";
    case "adherence_gap":
      return "Completed work is behind schedule";
    case "on_track":
      return "Readiness path is on track";
    default:
      return "Readiness forecast";
  }
}

function gapMessage(type?: string | null, delta?: number | null) {
  const roundedDelta =
    typeof delta === "number" && Number.isFinite(delta) ? Math.round(Math.abs(delta)) : null;
  switch (type) {
    case "low_confidence":
      return "Add recent activities, schedule details, or a dated goal to improve the forecast.";
    case "overload_risk":
      return roundedDelta === null
        ? "Your scheduled load is above the recommended path."
        : `Your scheduled load is about ${roundedDelta}% above the recommended path.`;
    case "goal_risk":
      return roundedDelta === null
        ? "Your scheduled path is below the readiness target for the next goal."
        : `Your scheduled path is about ${roundedDelta} readiness points below target.`;
    case "plan_gap":
      return roundedDelta === null
        ? "The recommended path creates a clearer route to the goal than the current schedule."
        : `Recommended readiness is about ${roundedDelta} points higher near the goal.`;
    case "adherence_gap":
      return roundedDelta === null
        ? "Completed work is not matching the scheduled readiness path."
        : `Completed readiness is about ${roundedDelta} points below the scheduled path.`;
    case "on_track":
      return "Your scheduled path is aligned with the recommended trajectory.";
    default:
      return "Compare actual, scheduled, and recommended readiness before your next goal.";
  }
}

function goalReadinessStatus(
  readinessPercent: number | null,
  forecast: NonNullable<PlanProjectionDashboard>["goal_forecasts"][number] | null,
  readinessTarget: number,
): PlanGoalReadinessStatus {
  const band = forecast?.feasibility_band;
  if (band === "unsafe" || band === "infeasible") return "Below target range";
  return resolveGoalReadinessViewModel({
    value: readinessPercent,
    target: readinessTarget,
  }).label as PlanGoalReadinessStatus;
}

export function usePlanDashboardViewModel({
  activePlan,
  goals,
  profileSettings,
  snapshot,
  upcomingPlannedEvents,
  recentPlannedEvents,
  today,
}: UsePlanDashboardViewModelParams) {
  const fitnessHistory = useMemo(
    () => snapshot.actualCurveData?.dataPoints ?? [],
    [snapshot.actualCurveData?.dataPoints],
  );

  const idealFitnessCurve = useMemo(
    () => snapshot.idealCurveData?.dataPoints ?? [],
    [snapshot.idealCurveData?.dataPoints],
  );

  const projectedFitness = useMemo(() => {
    if (!snapshot.idealCurveData?.dataPoints) return [];

    const todayKey = new Date().toISOString().split("T")[0];
    return snapshot.idealCurveData.dataPoints.filter((point) =>
      typeof point.date === "string" ? point.date > todayKey : false,
    );
  }, [snapshot.idealCurveData?.dataPoints]);

  const goalMetrics = useMemo(() => {
    if (snapshot.idealCurveData?.targetCTL && snapshot.idealCurveData?.targetDate) {
      return {
        targetCTL: snapshot.idealCurveData.targetCTL,
        targetDate: snapshot.idealCurveData.targetDate,
        description: `Target: ${snapshot.idealCurveData.targetCTL} CTL by ${new Date(snapshot.idealCurveData.targetDate).toLocaleDateString()}`,
      };
    }

    const nextGoal = [...goals.goals]
      .filter((goal) => goal.target_date)
      .sort((left, right) => left.target_date?.localeCompare(right.target_date!))[0];

    if (nextGoal?.target_date) {
      return {
        targetCTL: 0,
        targetDate: nextGoal.target_date,
        description: `Target: ${nextGoal.title} by ${new Date(`${nextGoal.target_date}T12:00:00.000Z`).toLocaleDateString()}`,
      };
    }

    return null;
  }, [goals.goals, snapshot.idealCurveData]);

  const todayKey = today.toISOString().split("T")[0] ?? "";
  const goalOverlays = useMemo(
    () => buildGoalOverlays({ goals: goals.goals, todayKey }),
    [goals.goals, todayKey],
  );
  const profileGoalMarkers = useMemo(
    () =>
      goalOverlays.map((overlay) => ({
        id: overlay.goalId,
        targetDate: overlay.targetDate,
        label: overlay.label,
        status: overlay.status,
        color: overlay.color,
        targetMetric: overlay.targetMetric,
      })),
    [goalOverlays],
  );

  const projectionDashboard = snapshot.insightTimeline?.projection_dashboard ?? null;
  const readinessForecast = snapshot.insightTimeline?.readiness_forecast ?? null;

  const hasCompletedActivityHistory = useMemo(() => {
    if (fitnessHistory.length > 0) {
      return true;
    }

    return (readinessForecast?.series.actual.points ?? []).some(
      (point) => typeof point.load === "number" && Number.isFinite(point.load) && point.load > 0,
    );
  }, [fitnessHistory.length, readinessForecast?.series.actual.points]);

  const baselineEstimate = useMemo<PlanBaselineEstimate | null>(() => {
    const dose = projectionDashboard?.dose_recommendation;
    const forecastEstimate: PlanBaselineEstimate = {
      weeklyLoad:
        typeof dose?.recommended_weekly_load === "number"
          ? Math.round(dose.recommended_weekly_load)
          : null,
      weeklyDurationMinutes:
        typeof dose?.recommended_weekly_duration_minutes === "number"
          ? Math.round(dose.recommended_weekly_duration_minutes)
          : null,
      sessionsPerWeek:
        typeof dose?.recommended_sessions_per_week === "number"
          ? Math.round(dose.recommended_sessions_per_week)
          : null,
      source: "forecast",
    };

    if (
      forecastEstimate.weeklyLoad !== null ||
      forecastEstimate.weeklyDurationMinutes !== null ||
      forecastEstimate.sessionsPerWeek !== null
    ) {
      return forecastEstimate;
    }

    const minSessions = profileSettings.dose_limits.min_sessions_per_week;
    const maxSessions = profileSettings.dose_limits.max_sessions_per_week;
    const sessionsPerWeek =
      typeof minSessions === "number" && typeof maxSessions === "number"
        ? Math.round((minSessions + maxSessions) / 2)
        : typeof maxSessions === "number"
          ? maxSessions
          : typeof minSessions === "number"
            ? minSessions
            : null;
    const weeklyDurationMinutes =
      typeof profileSettings.dose_limits.max_weekly_duration_minutes === "number"
        ? profileSettings.dose_limits.max_weekly_duration_minutes
        : null;

    if (sessionsPerWeek === null && weeklyDurationMinutes === null) {
      return null;
    }

    return {
      weeklyLoad: null,
      weeklyDurationMinutes,
      sessionsPerWeek,
      source: "preferences",
    };
  }, [profileSettings.dose_limits, projectionDashboard?.dose_recommendation]);

  const forecastReadinessStartsAtToday = useMemo(() => {
    if (!readinessForecast) {
      return false;
    }

    const hasObservedPreTodayReadiness = readinessForecast.series.actual.points.some(
      (point) => point.date < readinessForecast.today && typeof point.readiness === "number",
    );
    const isDefaultOrSparseForecast = readinessForecast.confidence_reason_codes.some(
      (code) => code === "missing_recent_history" || code === "projection_fallback_baseline",
    );

    return isDefaultOrSparseForecast && !hasObservedPreTodayReadiness;
  }, [readinessForecast]);

  const visibleReadinessWindow = useMemo(() => {
    if (!readinessForecast) {
      return null;
    }

    const latestUpcomingGoal = readinessForecast.goals
      .filter((goal) => goal.target_date >= readinessForecast.today)
      .sort((left, right) => right.target_date.localeCompare(left.target_date))[0];
    const startDate = forecastReadinessStartsAtToday
      ? readinessForecast.today
      : readinessForecast.start_date > addDays(readinessForecast.today, -45)
        ? readinessForecast.start_date
        : addDays(readinessForecast.today, -45);
    const goalEndDate = latestUpcomingGoal
      ? addDays(latestUpcomingGoal.target_date, 14)
      : readinessForecast.end_date;
    const endDate =
      goalEndDate < readinessForecast.end_date ? goalEndDate : readinessForecast.end_date;

    return { startDate, endDate };
  }, [forecastReadinessStartsAtToday, readinessForecast]);

  const readinessComparisonPoints = useMemo<PlanReadinessComparisonPoint[]>(() => {
    const pointsByDate = new Map<string, PlanReadinessComparisonPoint>();

    const ensurePoint = (date: string) => {
      const existing = pointsByDate.get(date);
      if (existing) return existing;

      const next = {
        date,
        actual: null,
        scheduled: null,
        recommended: null,
        recommendedLow: null,
        recommendedHigh: null,
      };
      pointsByDate.set(date, next);
      return next;
    };

    const isVisible = (date: string) =>
      !visibleReadinessWindow ||
      (date >= visibleReadinessWindow.startDate && date <= visibleReadinessWindow.endDate);

    for (const point of readinessForecast?.series.actual.points ?? []) {
      if (!point.date || !isVisible(point.date) || typeof point.readiness !== "number") continue;
      ensurePoint(point.date).actual = point.readiness;
    }

    const forecastToday = readinessForecast?.today;

    for (const point of readinessForecast?.series.scheduled.points ?? []) {
      if (forecastReadinessStartsAtToday && forecastToday && point.date < forecastToday) continue;
      if (!point.date || !isVisible(point.date) || typeof point.readiness !== "number") continue;
      ensurePoint(point.date).scheduled = point.readiness;
    }

    for (const point of readinessForecast?.series.recommended.points ?? []) {
      if (forecastReadinessStartsAtToday && forecastToday && point.date < forecastToday) continue;
      if (!point.date || !isVisible(point.date) || typeof point.readiness !== "number") continue;
      const chartPoint = ensurePoint(point.date);
      chartPoint.recommended = point.readiness;
      chartPoint.recommendedLow = typeof point.low === "number" ? point.low : null;
      chartPoint.recommendedHigh = typeof point.high === "number" ? point.high : null;
    }

    return [...pointsByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  }, [forecastReadinessStartsAtToday, readinessForecast, visibleReadinessWindow]);

  const readinessGoalMarkers = useMemo<PlanReadinessGoalMarker[]>(() => {
    const forecastMarkers = readinessForecast?.goals ?? [];
    const sourceMarkers =
      forecastMarkers.length > 0
        ? forecastMarkers.map((goal) => ({
            id: goal.goal_id,
            targetDate: goal.target_date,
            label: goal.title,
            status: goal.status,
            color: profileGoalMarkers.find((marker) => marker.id === goal.goal_id)?.color,
            targetMetric: profileGoalMarkers.find((marker) => marker.id === goal.goal_id)
              ?.targetMetric,
          }))
        : profileGoalMarkers;

    return sourceMarkers.filter(
      (marker) =>
        !visibleReadinessWindow ||
        (marker.targetDate >= visibleReadinessWindow.startDate &&
          marker.targetDate <= visibleReadinessWindow.endDate),
    );
  }, [profileGoalMarkers, readinessForecast?.goals, visibleReadinessWindow]);

  const readinessConfidenceSummary = useMemo(() => {
    if (!readinessForecast) {
      return null;
    }

    const reasons = readinessForecast.confidence_reason_codes
      .map(confidenceReasonCopy)
      .filter((reason) => typeof reason === "string")
      .slice(0, 2);

    return {
      label: confidenceLabel(readinessForecast.confidence),
      reasons,
    };
  }, [readinessForecast]);

  const readinessGapInsight = useMemo(() => {
    const summary = readinessForecast?.gap_summary;
    if (!summary) {
      return null;
    }

    return {
      title: gapTitle(summary.type),
      message: gapMessage(summary.type, summary.primary_delta),
      severity: summary.severity,
    };
  }, [readinessForecast?.gap_summary]);

  const readinessAccessibilitySummary = useMemo(() => {
    if (!readinessForecast) {
      return "Readiness forecast is not available yet.";
    }

    const readiness =
      typeof readinessForecast.current_readiness === "number"
        ? `Current readiness is ${Math.round(readinessForecast.current_readiness)}.`
        : "Current readiness is unknown.";
    const confidence = confidenceLabel(readinessForecast.confidence).toLowerCase();
    const gap = readinessForecast.gap_summary
      ? gapTitle(readinessForecast.gap_summary.type)
      : "No gap insight available";

    return `${readiness} Forecast confidence is ${confidence}. ${gap}.`;
  }, [readinessForecast]);

  const goalReadiness = useMemo<PlanGoalReadinessItem[]>(() => {
    const fallbackReadinessTarget = resolveGoalReadinessTarget(
      profileSettings.goal_strategy_preferences,
    );
    const idealCurve = snapshot.idealCurveData;
    const dataPoints = idealCurve?.dataPoints ?? [];
    const startCtl =
      typeof idealCurve?.startCTL === "number" ? idealCurve.startCTL : (dataPoints[0]?.ctl ?? 0);
    const targetCtl = typeof idealCurve?.targetCTL === "number" ? idealCurve.targetCTL : null;
    const lastPoint = dataPoints[dataPoints.length - 1] ?? null;
    const forecastByGoalId = new Map(
      (projectionDashboard?.goal_forecasts ?? []).map((forecast) => [
        forecast.profile_goal_id,
        forecast,
      ]),
    );
    return goals.goals.map((goal) => {
      const forecast = forecastByGoalId.get(goal.id) ?? null;
      const goalTargetDate = goal.target_date;
      const readinessTarget = forecast?.readiness_target ?? fallbackReadinessTarget;

      const projectedAtGoal = goalTargetDate
        ? (dataPoints.find(
            (point) => typeof point?.date === "string" && point.date >= goalTargetDate,
          ) ?? lastPoint)
        : lastPoint;

      let readinessPercent: number | null = forecast?.readiness_score ?? null;
      if (projectedAtGoal && typeof targetCtl === "number") {
        const numerator = projectedAtGoal.ctl - startCtl;
        const denominator = targetCtl - startCtl;

        readinessPercent ??=
          denominator === 0
            ? projectedAtGoal.ctl >= targetCtl
              ? 100
              : 0
            : Math.max(0, (numerator / denominator) * 100);
      }
      readinessPercent ??= resolveGoalSpecificFallbackReadiness({
        goal,
        currentReadiness: readinessForecast?.current_readiness,
        todayKey,
      });

      return {
        goal,
        forecast,
        readinessPercent,
        readinessTarget,
        projectedCtl: projectedAtGoal?.ctl ?? null,
        targetCtl,
        status: goalReadinessStatus(readinessPercent, forecast, readinessTarget),
      };
    });
  }, [
    goals.goals,
    profileSettings.goal_strategy_preferences,
    projectionDashboard?.goal_forecasts,
    snapshot.idealCurveData,
    readinessForecast?.current_readiness,
    todayKey,
  ]);

  const goalOutlook = useMemo(() => {
    const todayKey = today.toISOString().split("T")[0] ?? "";
    const upcoming = goalReadiness
      .filter((item) => item.goal.target_date && item.goal.target_date >= todayKey)
      .sort((left, right) => {
        const dateComparison = left.goal.target_date?.localeCompare(right.goal.target_date!);
        if (dateComparison !== 0) return dateComparison;
        const priorityComparison = (right.goal.priority ?? 0) - (left.goal.priority ?? 0);
        if (priorityComparison !== 0) return priorityComparison;
        return left.goal.title.localeCompare(right.goal.title);
      });

    const nextTargetDate = upcoming[0]?.goal.target_date ?? null;
    const nextDayGoals = nextTargetDate
      ? upcoming.filter((item) => item.goal.target_date === nextTargetDate)
      : [];

    const visibleNextDayGoals = nextDayGoals.slice(0, GOAL_OUTLOOK_MAX_VISIBLE);
    const featured: PlanGoalOutlookCard[] = visibleNextDayGoals.map((item) => ({
      ...item,
      label: "Next goal",
    }));
    const featuredIds = new Set(featured.map((item) => item.goal.id));

    const topPriority =
      [...upcoming]
        .filter((item) => !featuredIds.has(item.goal.id))
        .sort((left, right) => {
          const priorityComparison = (right.goal.priority ?? 0) - (left.goal.priority ?? 0);
          if (priorityComparison !== 0) return priorityComparison;
          const dateComparison = left.goal.target_date?.localeCompare(right.goal.target_date!);
          if (dateComparison !== 0) return dateComparison;
          return left.goal.title.localeCompare(right.goal.title);
        })[0] ?? null;

    if (topPriority && featured.length < GOAL_OUTLOOK_MAX_VISIBLE) {
      featured.push({ ...topPriority, label: "Top priority" });
    }

    const hiddenNextDayGoalCount = Math.max(0, nextDayGoals.length - visibleNextDayGoals.length);

    return {
      featured,
      hiddenNextDayGoalCount,
      totalUpcomingGoalCount: upcoming.length,
      canAddGoal: featured.length <= 1,
      nextGoal: nextDayGoals[0] ?? null,
      nextTargetDate,
      topPriorityGoal: topPriority,
    };
  }, [goalReadiness, today]);

  const insightTimelinePoints = useMemo(
    () => snapshot.insightTimeline?.timeline ?? [],
    [snapshot.insightTimeline],
  );

  const loadGuidance = snapshot.insightTimeline?.load_guidance;
  const estimationWarning = useMemo(() => {
    const failedPlanCount =
      snapshot.insightTimeline?.projection?.diagnostics?.estimation?.failed_plan_count ?? 0;
    if (failedPlanCount <= 0) {
      return null;
    }

    return failedPlanCount === 1
      ? "One scheduled session could not be estimated and was excluded from planned load."
      : `${failedPlanCount} scheduled sessions could not be estimated and were excluded from planned load.`;
  }, [snapshot.insightTimeline?.projection?.diagnostics?.estimation?.failed_plan_count]);

  const weeklyLoadSummary = useMemo(() => {
    if (insightTimelinePoints.length === 0) {
      return null;
    }

    const now = new Date();
    const currentStart = getWeekStart(now);
    const currentEnd = getWeekEnd(currentStart);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - 7);
    const previousEnd = getWeekEnd(previousStart);

    let currentActual = 0;
    let currentPlanned = 0;
    let currentRecommended = 0;
    let previousActual = 0;

    for (const point of insightTimelinePoints) {
      const pointDate = new Date(`${point.date}T12:00:00.000Z`);
      if (Number.isNaN(pointDate.getTime())) {
        continue;
      }

      if (pointDate >= currentStart && pointDate <= currentEnd) {
        currentActual += point.actual_tss || 0;
        currentPlanned += point.scheduled_tss || 0;
        currentRecommended += point.ideal_tss || 0;
      }

      if (pointDate >= previousStart && pointDate <= previousEnd) {
        previousActual += point.actual_tss || 0;
      }
    }

    const primaryLoad = Math.round(currentActual > 0 ? currentActual : currentPlanned);
    const vsLastWeek = Math.round(primaryLoad - previousActual);

    return {
      primaryLoad,
      vsLastWeek,
      currentPlanned,
      currentRecommended,
    };
  }, [insightTimelinePoints]);

  const weeklyLoadBars = useMemo<PlanWeeklyLoadBar[]>(() => {
    const apiWeeks = snapshot.insightTimeline?.load_comparison?.weeks ?? [];
    if (apiWeeks.length > 0) {
      const todayKey = today.toISOString().split("T")[0] ?? "";
      const bars = apiWeeks
        .map((week) => ({
          weekStart: week.week_start,
          weekEnd: week.week_end ?? null,
          label: compactDateLabel(week.week_start),
          actual: Math.round(week.actual_load ?? 0),
          scheduled: Math.round(week.scheduled_load ?? 0),
          recommended: Math.round(week.recommended_load ?? 0),
          isCurrentWeek:
            todayKey >= week.week_start &&
            todayKey <= (week.week_end ?? addDays(week.week_start, 6)),
        }))
        .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
      const currentIndex = Math.max(
        0,
        bars.findIndex((week) => week.isCurrentWeek),
      );
      return bars.slice(Math.max(0, currentIndex - 1), currentIndex + 7);
    }

    if (insightTimelinePoints.length === 0) {
      return [];
    }

    const todayKey = today.toISOString().split("T")[0] ?? "";
    const currentWeekStart = getWeekStartDateKey(todayKey);
    const buckets = new Map<string, { actual: number; scheduled: number; recommended: number }>();

    for (const point of insightTimelinePoints) {
      const weekStart = getWeekStartDateKey(point.date);
      const bucket = buckets.get(weekStart) ?? { actual: 0, scheduled: 0, recommended: 0 };
      bucket.actual += point.actual_tss || 0;
      bucket.scheduled += point.scheduled_tss || 0;
      bucket.recommended += point.ideal_tss || 0;
      buckets.set(weekStart, bucket);
    }

    const sorted = [...buckets.entries()]
      .map(([weekStart, bucket]) => ({
        weekStart,
        weekEnd: addDays(weekStart, 6),
        label: compactDateLabel(weekStart),
        actual: Math.round(bucket.actual),
        scheduled: Math.round(bucket.scheduled),
        recommended: Math.round(bucket.recommended),
        isCurrentWeek: weekStart === currentWeekStart,
      }))
      .sort((left, right) => left.weekStart.localeCompare(right.weekStart));

    const currentIndex = Math.max(
      0,
      sorted.findIndex((week) => week.isCurrentWeek),
    );
    return sorted.slice(Math.max(0, currentIndex - 1), currentIndex + 7);
  }, [insightTimelinePoints, snapshot.insightTimeline?.load_comparison?.weeks, today]);

  const currentWeekLoadDetail = useMemo(() => {
    const current = weeklyLoadBars.find((week) => week.isCurrentWeek) ?? weeklyLoadBars[0];
    if (!current) return null;

    return {
      ...current,
      scheduledGap: current.scheduled - current.recommended,
      actualGap: current.actual - current.scheduled,
    };
  }, [weeklyLoadBars]);

  const upcomingImpact = useMemo<PlanUpcomingImpact[]>(
    () =>
      (snapshot.insightTimeline?.upcoming_impact ?? []).map((impact) => ({
        id: impact.activity_plan_id,
        title: impact.title,
        scheduledAt: impact.scheduled_at,
        sport: impact.sport,
        estimatedLoad: impact.estimated_load,
        readinessDelta: impact.short_term_readiness_delta,
        fitnessContribution: impact.fitness_contribution,
        confidence: impact.confidence,
        explanation: impact.explanation,
      })),
    [snapshot.insightTimeline?.upcoming_impact],
  );

  const scheduleAction = useMemo<PlanScheduleAction>(() => {
    const apiRecommendation = snapshot.insightTimeline?.schedule_recommendation;
    if (apiRecommendation) {
      return {
        label: apiRecommendation.label,
        date: apiRecommendation.target_date,
        rationale: apiRecommendation.description,
      };
    }

    const firstImpact = upcomingImpact[0];
    const targetDate = firstImpact?.scheduledAt.split("T")[0] ?? currentWeekLoadDetail?.weekStart;
    if (!targetDate) {
      return null;
    }

    const gapType = readinessForecast?.gap_summary?.type;
    if (gapType === "overload_risk") {
      return {
        label: "Review overloaded week",
        date: targetDate,
        rationale: "Open the calendar to reduce or move scheduled load.",
      };
    }

    if (gapType === "plan_gap" || gapType === "goal_risk") {
      return {
        label: "Adjust schedule",
        date: targetDate,
        rationale: "Open the calendar to add or refine sessions toward the recommended path.",
      };
    }

    if (gapType === "low_confidence") {
      return {
        label: "Add schedule details",
        date: targetDate,
        rationale: "Open the calendar to add duration and intensity for upcoming sessions.",
      };
    }

    return firstImpact
      ? {
          label: "View upcoming session",
          date: targetDate,
          rationale: "Open the calendar to inspect the next scheduled session.",
        }
      : null;
  }, [
    currentWeekLoadDetail?.weekStart,
    readinessForecast?.gap_summary?.type,
    snapshot.insightTimeline?.schedule_recommendation,
    upcomingImpact,
  ]);

  const activityPlanMatches = useMemo<PlanActivityMatch[]>(() => {
    const payload = snapshot.insightTimeline?.activity_plan_matches;
    if (!payload || payload.empty_reason === "no_positive_gap") {
      return [];
    }

    return (payload.matches ?? []).map((match) => ({
      id: match.activity_plan_id,
      name: match.name,
      targetDate: payload.target_date,
      activityCategory: match.activity_category,
      estimatedTss: match.estimated_tss,
      estimatedDurationSeconds: match.estimated_duration_seconds,
      score: match.score,
      targetTssDelta: match.target_tss_delta,
      absoluteTssGap: match.absolute_tss_gap,
      reasonLabels: (match.reason_codes ?? [])
        .map(activityPlanMatchReasonCopy)
        .filter((value): value is NonNullable<typeof value> => value !== null)
        .slice(0, 2),
    }));
  }, [snapshot.insightTimeline?.activity_plan_matches]);

  const activityPlanMatchSummary = useMemo(() => {
    const payload = snapshot.insightTimeline?.activity_plan_matches;
    if (!payload) {
      return {
        emptyReason: null as PlanActivityMatchEmptyReason,
        targetDate: null as string | null,
        targetTssDelta: null as number | null,
        hasPositiveGap: false,
      };
    }

    return {
      emptyReason: payload.empty_reason as PlanActivityMatchEmptyReason,
      targetDate: payload.target_date ?? null,
      targetTssDelta:
        typeof payload.target_tss_delta === "number" ? payload.target_tss_delta : null,
      hasPositiveGap: payload.empty_reason !== "no_positive_gap",
    };
  }, [snapshot.insightTimeline?.activity_plan_matches]);

  const nextGoal = useMemo(
    () =>
      [...goalReadiness]
        .filter((item) => item.goal.target_date)
        .sort((left, right) => left.goal.target_date?.localeCompare(right.goal.target_date!))[0] ??
      null,
    [goalReadiness],
  );

  return {
    fitnessHistory,
    goalMarkers: profileGoalMarkers,
    goalMetrics,
    goalOutlook,
    goalReadiness,
    insightTimelinePoints,
    loadGuidance,
    readinessComparisonPoints,
    readinessForecast,
    hasCompletedActivityHistory,
    baselineEstimate,
    readinessGoalMarkers,
    readinessConfidenceSummary,
    readinessGapInsight,
    readinessAccessibilitySummary,
    estimationWarning,
    nextGoal,
    projectedFitness,
    projectionDashboard,
    weeklyLoadSummary,
    weeklyLoadBars,
    currentWeekLoadDetail,
    upcomingImpact,
    activityPlanMatches,
    activityPlanMatchSummary,
    scheduleAction,
    idealFitnessCurve,
  };
}
