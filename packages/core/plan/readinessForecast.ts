import {
  calculateLoadBalance,
  calculateLongTermLoad,
  calculateRecentLoad,
} from "../load/progression";
import { computeProjectionPointReadinessScores } from "./projection/readiness";

export type ForecastConfidence = "high" | "medium" | "low";

export type ForecastConfidenceReasonCode =
  | "missing_recent_history"
  | "missing_scheduled_intensity"
  | "inferred_scheduled_load"
  | "missing_goal_specificity"
  | "safety_cap_constrained"
  | "projection_fallback_baseline"
  | "recommended_path_unavailable"
  | "scheduled_path_unavailable";

export type ReadinessForecastBaseline = {
  start_date: string;
  today: string;
  initial_longTermLoad: number;
  initial_recentLoad: number;
  initial_readiness: number;
  today_longTermLoad?: number;
  today_recentLoad?: number;
  today_readiness?: number;
  source: "history" | "fallback" | "profile_estimate";
  confidence: ForecastConfidence;
  confidence_reason_codes: ForecastConfidenceReasonCode[];
};

export type ReadinessSeriesPoint = {
  date: string;
  readiness: number | null;
  load?: number | null;
  low?: number | null;
  high?: number | null;
  confidence?: ForecastConfidence;
  provenance:
    | "completed_activity"
    | "scheduled_activity"
    | "scheduled_activity_estimate"
    | "recommendation_engine";
  flags?: string[];
};

export type ReadinessSeries = {
  id: "actual" | "scheduled" | "recommended";
  label: "Actual" | "Scheduled" | "Recommended";
  points: ReadinessSeriesPoint[];
};

export type ReadinessZone = {
  id: "underprepared" | "building" | "goal_ready" | "peak_ready";
  label: string;
  min: number;
  max: number;
};

export type ReadinessGoalMarker = {
  goal_id: string;
  title: string;
  target_date: string;
  target_readiness_min: number | null;
  target_readiness_max: number | null;
  scheduled_readiness: number | null;
  recommended_readiness: number | null;
  gap: number | null;
  status: "on_track" | "at_risk" | "constrained" | "unknown";
};

export type ReadinessGapSummary = {
  type:
    | "low_confidence"
    | "overload_risk"
    | "goal_risk"
    | "plan_gap"
    | "adherence_gap"
    | "on_track";
  severity: "info" | "warning" | "critical";
  title_code: string;
  message_code: string;
  primary_delta?: number | null;
  recommended_action_code?: string | null;
};

export type ReadinessForecastTimeline = {
  start_date: string;
  end_date: string;
  today: string;
  current_readiness: number | null;
  current_status: "underprepared" | "building" | "goal_ready" | "peak_ready" | "unknown";
  confidence: ForecastConfidence;
  confidence_reason_codes: ForecastConfidenceReasonCode[];
  series: {
    actual: ReadinessSeries;
    scheduled: ReadinessSeries;
    recommended: ReadinessSeries;
  };
  zones: ReadinessZone[];
  goals: ReadinessGoalMarker[];
  gap_summary: ReadinessGapSummary | null;
  version?: string;
};

export type ReadinessForecastGoalInput = {
  goal_id: string;
  title: string;
  target_date: string;
  target_readiness_min?: number | null;
  target_readiness_max?: number | null;
};

export type ReadinessDailyLoadInput = {
  date: string;
  load: number;
};

export type ScheduledReadinessDailyLoadInput = ReadinessDailyLoadInput & {
  confidence?: ForecastConfidence;
};

export type BuildReadinessForecastTimelineInput = {
  startDate: string;
  endDate: string;
  today: string;
  baseline: ReadinessForecastBaseline;
  actualDailyLoad: ReadinessDailyLoadInput[];
  scheduledDailyLoad: ScheduledReadinessDailyLoadInput[];
  recommendedDailyLoad: ReadinessDailyLoadInput[];
  goals: ReadinessForecastGoalInput[];
  confidenceReasonCodes?: ForecastConfidenceReasonCode[];
};

export type ReadinessScheduleAdjustmentSimulation = {
  adjustment: {
    date: string;
    load_delta: number;
    resulting_scheduled_load: number;
  };
  comparison_date: string;
  scheduled_readiness: number | null;
  simulated_readiness: number | null;
  readiness_delta: number | null;
  scheduled_load: number | null;
  simulated_load: number | null;
  confidence: ForecastConfidence;
};

type ModelState = {
  longTermLoad: number;
  recentLoad: number;
  readiness: number | null;
};

type SimulatedPoint = ReadinessSeriesPoint & {
  longTermLoad: number;
  recentLoad: number;
};

const CONFIDENCE_REASON_ORDER: ForecastConfidenceReasonCode[] = [
  "missing_recent_history",
  "missing_scheduled_intensity",
  "inferred_scheduled_load",
  "missing_goal_specificity",
  "safety_cap_constrained",
  "projection_fallback_baseline",
  "recommended_path_unavailable",
  "scheduled_path_unavailable",
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function enumerateDates(startDate: string, endDate: string): string[] {
  if (startDate > endDate) {
    return [];
  }

  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function uniqueReasonCodes(
  codes: Array<ForecastConfidenceReasonCode | undefined>,
): ForecastConfidenceReasonCode[] {
  const present = new Set(codes.filter((code): code is ForecastConfidenceReasonCode => !!code));
  return CONFIDENCE_REASON_ORDER.filter((code) => present.has(code));
}

function confidenceRank(confidence: ForecastConfidence): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function confidenceFromRank(rank: number): ForecastConfidence {
  return rank >= 3 ? "high" : rank >= 2 ? "medium" : "low";
}

function uncertaintyMargin(confidence?: ForecastConfidence): number {
  return confidence === "high" ? 4 : confidence === "medium" ? 8 : 12;
}

function loadByDate(loads: ReadinessDailyLoadInput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const load of [...loads].sort((left, right) => left.date.localeCompare(right.date))) {
    map.set(load.date, (map.get(load.date) ?? 0) + clampNonNegative(load.load));
  }
  return map;
}

function scheduledConfidenceByDate(
  loads: ScheduledReadinessDailyLoadInput[],
): Map<string, ForecastConfidence> {
  const map = new Map<string, ForecastConfidence>();
  for (const load of loads) {
    if (!load.confidence) {
      continue;
    }
    const current = map.get(load.date);
    if (!current || confidenceRank(load.confidence) < confidenceRank(current)) {
      map.set(load.date, load.confidence);
    }
  }
  return map;
}

function simulatePoints(input: {
  dates: string[];
  loadsByDate: Map<string, number>;
  initialLongTermLoad: number;
  initialRecentLoad: number;
  provenance: ReadinessSeriesPoint["provenance"];
  confidenceByDate?: Map<string, ForecastConfidence>;
}): SimulatedPoint[] {
  let longTermLoad = input.initialLongTermLoad;
  let recentLoad = input.initialRecentLoad;
  const modelPoints = input.dates.map((date) => {
    const load = input.loadsByDate.get(date) ?? 0;
    longTermLoad = calculateLongTermLoad(longTermLoad, load);
    recentLoad = calculateRecentLoad(recentLoad, load);
    return {
      date,
      load,
      longTermLoad,
      recentLoad,
      loadBalance: calculateLoadBalance(longTermLoad, recentLoad),
    };
  });
  const readinessScores = computeProjectionPointReadinessScores({
    points: modelPoints.map((point) => ({
      date: point.date,
      predicted_fitness_longTermLoad: point.longTermLoad,
      predicted_fatigue_recentLoad: point.recentLoad,
      predicted_form_loadBalance: point.loadBalance,
    })),
  });

  return modelPoints.map((point, index) => ({
    date: point.date,
    readiness: readinessScores[index] ?? null,
    load: round1(point.load),
    confidence: input.confidenceByDate?.get(point.date),
    provenance: input.provenance,
    longTermLoad: point.longTermLoad,
    recentLoad: point.recentLoad,
  }));
}

function withUncertaintyRange(
  series: ReadinessSeries,
  confidence: ForecastConfidence,
): ReadinessSeries {
  const margin = uncertaintyMargin(confidence);
  return {
    ...series,
    points: series.points.map((point) =>
      point.readiness === null
        ? point
        : {
            ...point,
            low: round1(Math.max(0, point.readiness - margin)),
            high: round1(Math.min(100, point.readiness + margin)),
          },
    ),
  };
}

export function simulateReadinessSeries(input: {
  id: ReadinessSeries["id"];
  label: ReadinessSeries["label"];
  startDate: string;
  endDate: string;
  initialLongTermLoad: number;
  initialRecentLoad: number;
  dailyLoad: ScheduledReadinessDailyLoadInput[];
  provenance: ReadinessSeriesPoint["provenance"];
}): ReadinessSeries {
  const dates = enumerateDates(input.startDate, input.endDate);
  const points = simulatePoints({
    dates,
    loadsByDate: loadByDate(input.dailyLoad),
    initialLongTermLoad: input.initialLongTermLoad,
    initialRecentLoad: input.initialRecentLoad,
    provenance: input.provenance,
    confidenceByDate: scheduledConfidenceByDate(input.dailyLoad),
  });

  return {
    id: input.id,
    label: input.label,
    points: points.map(
      ({ longTermLoad: _longTermLoad, recentLoad: _recentLoad, ...point }) => point,
    ),
  };
}

function deriveTodayState(input: BuildReadinessForecastTimelineInput): {
  state: ModelState;
  usedFallback: boolean;
} {
  if (input.actualDailyLoad.length > 0 && input.startDate <= input.today) {
    const points = simulatePoints({
      dates: enumerateDates(input.startDate, input.today),
      loadsByDate: loadByDate(input.actualDailyLoad),
      initialLongTermLoad: input.baseline.initial_longTermLoad,
      initialRecentLoad: input.baseline.initial_recentLoad,
      provenance: "completed_activity",
    });
    const todayPoint = points[points.length - 1];
    if (todayPoint) {
      return {
        state: {
          longTermLoad: todayPoint.longTermLoad,
          recentLoad: todayPoint.recentLoad,
          readiness: todayPoint.readiness,
        },
        usedFallback: false,
      };
    }
  }

  return {
    state: {
      longTermLoad: input.baseline.today_longTermLoad ?? input.baseline.initial_longTermLoad,
      recentLoad: input.baseline.today_recentLoad ?? input.baseline.initial_recentLoad,
      readiness: input.baseline.today_readiness ?? input.baseline.initial_readiness,
    },
    usedFallback: true,
  };
}

export function buildReadinessZones(): ReadinessZone[] {
  return [
    { id: "underprepared", label: "Underprepared", min: 0, max: 39 },
    { id: "building", label: "Building", min: 40, max: 69 },
    { id: "goal_ready", label: "Goal Ready", min: 70, max: 84 },
    { id: "peak_ready", label: "Peak Ready", min: 85, max: 100 },
  ];
}

export function classifyReadinessStatus(
  readiness: number | null,
): ReadinessForecastTimeline["current_status"] {
  if (readiness === null) {
    return "unknown";
  }
  if (readiness >= 85) {
    return "peak_ready";
  }
  if (readiness >= 70) {
    return "goal_ready";
  }
  if (readiness >= 40) {
    return "building";
  }
  return "underprepared";
}

export function resolveForecastConfidence(input: {
  baseline: ReadinessForecastBaseline;
  confidenceReasonCodes: ForecastConfidenceReasonCode[];
  usedFallbackBaseline: boolean;
}): ForecastConfidence {
  let rank = confidenceRank(input.baseline.confidence);
  if (input.usedFallbackBaseline || input.baseline.source !== "history") {
    rank = Math.min(rank, confidenceRank("medium"));
  }
  if (
    input.confidenceReasonCodes.includes("scheduled_path_unavailable") ||
    input.confidenceReasonCodes.includes("recommended_path_unavailable")
  ) {
    rank = Math.min(rank, confidenceRank("low"));
  }
  if (
    input.confidenceReasonCodes.includes("missing_scheduled_intensity") ||
    input.confidenceReasonCodes.includes("inferred_scheduled_load")
  ) {
    rank = Math.min(rank, confidenceRank("medium"));
  }
  return confidenceFromRank(rank);
}

function nearestPointOnOrBefore(
  series: ReadinessSeries,
  date: string,
): ReadinessSeriesPoint | undefined {
  return [...series.points].reverse().find((point) => point.date <= date);
}

function _nearestPointOnOrAfter(
  series: ReadinessSeries,
  date: string,
): ReadinessSeriesPoint | undefined {
  return series.points.find((point) => point.date >= date);
}

function pointForDate(series: ReadinessSeries, date: string): ReadinessSeriesPoint | undefined {
  return series.points.find((point) => point.date === date);
}

function buildGoalMarkers(input: {
  goals: ReadinessForecastGoalInput[];
  scheduled: ReadinessSeries;
  recommended: ReadinessSeries;
}): ReadinessGoalMarker[] {
  return [...input.goals]
    .sort((left, right) => left.target_date.localeCompare(right.target_date))
    .map((goal) => {
      const scheduledReadiness = pointForDate(input.scheduled, goal.target_date)?.readiness ?? null;
      const recommendedReadiness =
        pointForDate(input.recommended, goal.target_date)?.readiness ?? null;
      const gap =
        scheduledReadiness === null || recommendedReadiness === null
          ? null
          : round1(recommendedReadiness - scheduledReadiness);
      const min = goal.target_readiness_min ?? null;
      const max = goal.target_readiness_max ?? null;
      const status: ReadinessGoalMarker["status"] =
        scheduledReadiness === null
          ? "unknown"
          : min !== null && scheduledReadiness < min
            ? "at_risk"
            : max !== null && scheduledReadiness > max
              ? "constrained"
              : "on_track";

      return {
        goal_id: goal.goal_id,
        title: goal.title,
        target_date: goal.target_date,
        target_readiness_min: min,
        target_readiness_max: max,
        scheduled_readiness: scheduledReadiness,
        recommended_readiness: recommendedReadiness,
        gap,
        status,
      };
    });
}

function sumLoad(series: ReadinessSeries, startDate: string, endDate: string): number {
  return series.points.reduce(
    (sum, point) =>
      point.date >= startDate && point.date <= endDate ? sum + (point.load ?? 0) : sum,
    0,
  );
}

export function buildReadinessGapSummary(input: {
  confidence: ForecastConfidence;
  confidenceReasonCodes: ForecastConfidenceReasonCode[];
  today: string;
  endDate: string;
  goals: ReadinessGoalMarker[];
  series: ReadinessForecastTimeline["series"];
}): ReadinessGapSummary | null {
  const hasLowConfidenceCause = input.confidenceReasonCodes.some((code) =>
    [
      "missing_recent_history",
      "missing_scheduled_intensity",
      "inferred_scheduled_load",
      "projection_fallback_baseline",
      "recommended_path_unavailable",
      "scheduled_path_unavailable",
    ].includes(code),
  );
  if (input.confidence === "low" && hasLowConfidenceCause) {
    return {
      type: "low_confidence",
      severity: "warning",
      title_code: "readiness_forecast.low_confidence.title",
      message_code: "readiness_forecast.low_confidence.message",
      recommended_action_code: "readiness_forecast.action.improve_inputs",
    };
  }

  const nextGoal = input.goals.find((goal) => goal.target_date >= input.today) ?? input.goals[0];
  const summaryEndDate = nextGoal?.target_date ?? input.endDate;
  const scheduledLoad = sumLoad(input.series.scheduled, input.today, summaryEndDate);
  const recommendedLoad = sumLoad(input.series.recommended, input.today, summaryEndDate);
  if (recommendedLoad > 0 && scheduledLoad >= recommendedLoad * 1.15) {
    return {
      type: "overload_risk",
      severity: "critical",
      title_code: "readiness_forecast.overload_risk.title",
      message_code: "readiness_forecast.overload_risk.message",
      primary_delta: round1((scheduledLoad / recommendedLoad - 1) * 100),
      recommended_action_code: "readiness_forecast.action.reduce_scheduled_load",
    };
  }

  if (
    nextGoal?.scheduled_readiness !== null &&
    nextGoal?.target_readiness_min !== null &&
    nextGoal !== undefined &&
    nextGoal.scheduled_readiness < nextGoal.target_readiness_min
  ) {
    return {
      type: "goal_risk",
      severity: "critical",
      title_code: "readiness_forecast.goal_risk.title",
      message_code: "readiness_forecast.goal_risk.message",
      primary_delta: round1(nextGoal.scheduled_readiness - nextGoal.target_readiness_min),
      recommended_action_code: "readiness_forecast.action.adjust_goal_or_schedule",
    };
  }

  if (nextGoal?.gap !== null && nextGoal !== undefined && nextGoal.gap >= 8) {
    return {
      type: "plan_gap",
      severity: "warning",
      title_code: "readiness_forecast.plan_gap.title",
      message_code: "readiness_forecast.plan_gap.message",
      primary_delta: nextGoal.gap,
      recommended_action_code: "readiness_forecast.action.follow_recommendation",
    };
  }

  const actualComparable = nearestPointOnOrBefore(input.series.actual, input.today);
  const scheduledComparable = actualComparable
    ? pointForDate(input.series.scheduled, actualComparable.date)
    : undefined;
  if (
    actualComparable?.readiness !== null &&
    actualComparable !== undefined &&
    scheduledComparable?.readiness !== null &&
    scheduledComparable !== undefined &&
    scheduledComparable.readiness - actualComparable.readiness >= 8
  ) {
    return {
      type: "adherence_gap",
      severity: "warning",
      title_code: "readiness_forecast.adherence_gap.title",
      message_code: "readiness_forecast.adherence_gap.message",
      primary_delta: round1(scheduledComparable.readiness - actualComparable.readiness),
      recommended_action_code: "readiness_forecast.action.review_adherence",
    };
  }

  return {
    type: "on_track",
    severity: "info",
    title_code: "readiness_forecast.on_track.title",
    message_code: "readiness_forecast.on_track.message",
    primary_delta: nextGoal?.gap ?? null,
    recommended_action_code: null,
  };
}

function buildActualSeries(input: BuildReadinessForecastTimelineInput): ReadinessSeries {
  if (input.actualDailyLoad.length === 0 || input.startDate > input.today) {
    return { id: "actual", label: "Actual", points: [] };
  }
  return simulateReadinessSeries({
    id: "actual",
    label: "Actual",
    startDate: input.startDate,
    endDate: input.today < input.endDate ? input.today : input.endDate,
    initialLongTermLoad: input.baseline.initial_longTermLoad,
    initialRecentLoad: input.baseline.initial_recentLoad,
    dailyLoad: input.actualDailyLoad,
    provenance: "completed_activity",
  });
}

function buildReanchoredSeries(input: {
  id: "scheduled" | "recommended";
  label: "Scheduled" | "Recommended";
  startDate: string;
  endDate: string;
  today: string;
  initialLongTermLoad: number;
  initialRecentLoad: number;
  todayState: ModelState;
  dailyLoad: ScheduledReadinessDailyLoadInput[];
  provenance: ReadinessSeriesPoint["provenance"];
  historicalStartDate?: string;
}): ReadinessSeries {
  const historicalEndDate = input.today < input.endDate ? input.today : input.endDate;
  const historicalStartDate = input.historicalStartDate ?? input.startDate;
  const historicalDates =
    historicalStartDate <= historicalEndDate
      ? enumerateDates(historicalStartDate, historicalEndDate)
      : [];
  const futureStartDate = addDays(input.today, 1);
  const futureDates =
    futureStartDate <= input.endDate ? enumerateDates(futureStartDate, input.endDate) : [];
  const loads = loadByDate(input.dailyLoad);
  const confidenceByDate = scheduledConfidenceByDate(input.dailyLoad);
  const historicalPoints = simulatePoints({
    dates: historicalDates,
    loadsByDate: loads,
    initialLongTermLoad: input.initialLongTermLoad,
    initialRecentLoad: input.initialRecentLoad,
    provenance: input.provenance,
    confidenceByDate,
  });
  const futurePoints = simulatePoints({
    dates: futureDates,
    loadsByDate: loads,
    initialLongTermLoad: input.todayState.longTermLoad,
    initialRecentLoad: input.todayState.recentLoad,
    provenance: input.provenance,
    confidenceByDate,
  });

  return {
    id: input.id,
    label: input.label,
    points: [...historicalPoints, ...futurePoints]
      .filter(
        (point) =>
          input.dailyLoad.some((load) => load.date <= input.today) || point.date > input.today,
      )
      .map(({ longTermLoad: _longTermLoad, recentLoad: _recentLoad, ...point }) => point),
  };
}

export function buildReadinessForecastTimeline(
  input: BuildReadinessForecastTimelineInput,
): ReadinessForecastTimeline {
  const todayState = deriveTodayState(input);
  const actual = buildActualSeries(input);
  const scheduledProvenance = input.scheduledDailyLoad.some(
    (load) => load.confidence && load.confidence !== "high",
  )
    ? "scheduled_activity_estimate"
    : "scheduled_activity";
  const scheduled = buildReanchoredSeries({
    id: "scheduled",
    label: "Scheduled",
    startDate: input.startDate,
    endDate: input.endDate,
    today: input.today,
    initialLongTermLoad: input.baseline.initial_longTermLoad,
    initialRecentLoad: input.baseline.initial_recentLoad,
    todayState: todayState.state,
    dailyLoad: input.scheduledDailyLoad,
    provenance: scheduledProvenance,
  });
  const recommendedBase = buildReanchoredSeries({
    id: "recommended",
    label: "Recommended",
    startDate: input.startDate,
    endDate: input.endDate,
    today: input.today,
    initialLongTermLoad: input.baseline.initial_longTermLoad,
    initialRecentLoad: input.baseline.initial_recentLoad,
    todayState: todayState.state,
    dailyLoad: input.recommendedDailyLoad,
    provenance: "recommendation_engine",
    historicalStartDate:
      input.recommendedDailyLoad
        .filter((load) => load.date <= input.today)
        .map((load) => load.date)
        .sort()[0] ?? addDays(input.today, 1),
  });
  const reasonCodes = uniqueReasonCodes([
    ...input.baseline.confidence_reason_codes,
    ...(input.confidenceReasonCodes ?? []),
    todayState.usedFallback ? "projection_fallback_baseline" : undefined,
    input.actualDailyLoad.length === 0 ? "missing_recent_history" : undefined,
    input.scheduledDailyLoad.some((load) => load.confidence === "low")
      ? "missing_scheduled_intensity"
      : undefined,
    input.scheduledDailyLoad.some((load) => load.confidence === "medium")
      ? "inferred_scheduled_load"
      : undefined,
  ]);
  const confidence = resolveForecastConfidence({
    baseline: input.baseline,
    confidenceReasonCodes: reasonCodes,
    usedFallbackBaseline: todayState.usedFallback,
  });
  const currentReadiness = todayState.state.readiness;
  const recommended = withUncertaintyRange(recommendedBase, confidence);
  const goals = buildGoalMarkers({ goals: input.goals, scheduled, recommended });
  const series = { actual, scheduled, recommended };

  return {
    start_date: input.startDate,
    end_date: input.endDate,
    today: input.today,
    current_readiness: currentReadiness,
    current_status: classifyReadinessStatus(currentReadiness),
    confidence,
    confidence_reason_codes: reasonCodes,
    series,
    zones: buildReadinessZones(),
    goals,
    gap_summary: buildReadinessGapSummary({
      confidence,
      confidenceReasonCodes: reasonCodes,
      today: input.today,
      endDate: input.endDate,
      goals,
      series,
    }),
    version: "readiness_forecast.v1",
  };
}

function applyScheduleAdjustment(input: {
  scheduledDailyLoad: ScheduledReadinessDailyLoadInput[];
  date: string;
  loadDelta: number;
}): ScheduledReadinessDailyLoadInput[] {
  const byDate = new Map<string, ScheduledReadinessDailyLoadInput>();
  for (const load of input.scheduledDailyLoad) {
    const existing = byDate.get(load.date);
    byDate.set(load.date, {
      date: load.date,
      load: (existing?.load ?? 0) + clampNonNegative(load.load),
      confidence:
        existing?.confidence && load.confidence
          ? confidenceRank(existing.confidence) < confidenceRank(load.confidence)
            ? existing.confidence
            : load.confidence
          : (existing?.confidence ?? load.confidence),
    });
  }

  const current = byDate.get(input.date);
  const nextLoad = Math.max(0, (current?.load ?? 0) + input.loadDelta);
  byDate.set(input.date, {
    date: input.date,
    load: round1(nextLoad),
    confidence: current?.confidence ?? "medium",
  });

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function resolveSimulationComparisonDate(forecast: ReadinessForecastTimeline): string {
  return (
    forecast.goals.find((goal) => goal.target_date >= forecast.today)?.target_date ??
    forecast.end_date
  );
}

export function simulateReadinessScheduleAdjustment(input: {
  forecastInput: BuildReadinessForecastTimelineInput;
  date: string;
  loadDelta: number;
  comparisonDate?: string;
}): ReadinessScheduleAdjustmentSimulation {
  const baseForecast = buildReadinessForecastTimeline(input.forecastInput);
  const adjustedScheduledDailyLoad = applyScheduleAdjustment({
    scheduledDailyLoad: input.forecastInput.scheduledDailyLoad,
    date: input.date,
    loadDelta: input.loadDelta,
  });
  const simulatedForecast = buildReadinessForecastTimeline({
    ...input.forecastInput,
    scheduledDailyLoad: adjustedScheduledDailyLoad,
  });
  const comparisonDate = input.comparisonDate ?? resolveSimulationComparisonDate(baseForecast);
  const scheduledPoint = pointForDate(baseForecast.series.scheduled, comparisonDate);
  const simulatedPoint = pointForDate(simulatedForecast.series.scheduled, comparisonDate);
  const scheduledLoad = pointForDate(baseForecast.series.scheduled, input.date)?.load ?? 0;
  const simulatedLoad = pointForDate(simulatedForecast.series.scheduled, input.date)?.load ?? 0;
  const scheduledReadiness = scheduledPoint?.readiness ?? null;
  const simulatedReadiness = simulatedPoint?.readiness ?? null;

  return {
    adjustment: {
      date: input.date,
      load_delta: round1(input.loadDelta),
      resulting_scheduled_load: round1(simulatedLoad),
    },
    comparison_date: comparisonDate,
    scheduled_readiness: scheduledReadiness,
    simulated_readiness: simulatedReadiness,
    readiness_delta:
      scheduledReadiness === null || simulatedReadiness === null
        ? null
        : round1(simulatedReadiness - scheduledReadiness),
    scheduled_load: round1(scheduledLoad),
    simulated_load: round1(simulatedLoad),
    confidence: simulatedForecast.confidence,
  };
}
