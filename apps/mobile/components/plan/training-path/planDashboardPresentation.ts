import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import {
  buildCenteredPlanAnalysisWindow,
  type PlanAnalysisWindowPeriod,
  shiftPlanAnalysisWindow,
} from "@repo/core";
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";
import { addDays, getWeekStartDateKey } from "./trainingPathUtils";

export type PlanThresholdHistoryPoint = {
  activityCategory: "bike" | "run" | "swim";
  confidence?: number;
  effectiveAt: string;
  metric: string;
  method?: string;
  policyVersion?: string;
  sourceActivities?: ReadonlyArray<{ finishedAt: string; id: string; name: string }>;
  thresholdId?: string;
  unit: string;
  value: number;
};

export type PlanThresholdTrend = {
  activityCategory: PlanThresholdHistoryPoint["activityCategory"];
  change: number | null;
  changePercent: number | null;
  current: PlanThresholdHistoryPoint;
  metric: string;
  points: PlanThresholdHistoryPoint[];
  unit: string;
};

export type PlanWeekDayEvidence = {
  completedSessionCount: number;
  date: string;
  plannedSessionCount: number;
};

export type PlanAnalysisView = "progress" | "training";
export type PlanTrainingMetric = "load" | "fitness" | "fatigue" | "form";
export type PlanAnalysisRange = PlanAnalysisWindowPeriod;
export type PlanProgressRange = PlanAnalysisWindowPeriod;
export type PlanTrainingRange = PlanAnalysisWindowPeriod;

export type PlanGoalProgressResult =
  inferRouterOutputs<AppRouter>["athleteIntelligence"]["getGoalProgress"]["result"];

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildComparableThresholdTrend(
  history: readonly PlanThresholdHistoryPoint[],
  preferredCategory?: string | null,
  identity?: { metric: string; unit: string } | null,
): PlanThresholdTrend | null {
  const sorted = [...history].sort((left, right) =>
    left.effectiveAt.localeCompare(right.effectiveAt),
  );
  const preferred =
    preferredCategory === "bike" || preferredCategory === "run" || preferredCategory === "swim"
      ? preferredCategory
      : null;
  const category = preferred ?? sorted.at(-1)?.activityCategory ?? null;
  const current = [...sorted].reverse().find((point) => point.activityCategory === category);
  if (!current) return null;
  const points = sorted.filter(
    (point) =>
      point.activityCategory === current.activityCategory &&
      point.metric === (identity?.metric ?? current.metric) &&
      point.unit === (identity?.unit ?? current.unit),
  );
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const change = points.length >= 2 ? last.value - first.value : null;
  return {
    activityCategory: current.activityCategory,
    change,
    changePercent: change === null || first.value === 0 ? null : (change / first.value) * 100,
    current: last,
    metric: current.metric,
    points,
    unit: current.unit,
  };
}

export function mergeGoalProgressThresholdEvidence(
  history: readonly PlanThresholdHistoryPoint[],
  provenance:
    | { baseline: PlanThresholdHistoryPoint | null; current: PlanThresholdHistoryPoint | null }
    | null
    | undefined,
) {
  const merged = new Map<string, PlanThresholdHistoryPoint>();
  for (const point of history) merged.set(point.thresholdId ?? point.effectiveAt, point);
  if (provenance?.baseline) {
    merged.set(
      provenance.baseline.thresholdId ?? provenance.baseline.effectiveAt,
      provenance.baseline,
    );
  }
  if (provenance?.current) {
    merged.set(
      provenance.current.thresholdId ?? provenance.current.effectiveAt,
      provenance.current,
    );
  }
  return [...merged.values()].sort((left, right) =>
    left.effectiveAt.localeCompare(right.effectiveAt),
  );
}

export function getPlanProgressWindow(anchorDate: string, range: PlanProgressRange) {
  const window = buildCenteredPlanAnalysisWindow({ anchorDate, period: range });
  return { end: window.endDate, start: window.startDate };
}

export function shiftPlanProgressAnchor(
  anchorDate: string,
  range: PlanProgressRange,
  direction: -1 | 1,
) {
  return shiftPlanAnalysisWindow({ anchorDate, direction, period: range }).anchorDate;
}

export function getPlanTrainingWindow(input: {
  anchorDate: string;
  range: PlanTrainingRange;
  timelineEnd: string;
  timelineStart: string;
}) {
  const boundedAnchor =
    input.anchorDate < input.timelineStart
      ? input.timelineStart
      : input.anchorDate > input.timelineEnd
        ? input.timelineEnd
        : input.anchorDate;
  const window = buildCenteredPlanAnalysisWindow({
    anchorDate: boundedAnchor,
    period: input.range,
  });
  return { end: window.endDate, start: window.startDate };
}

export function shiftPlanTrainingAnchor(input: {
  anchorDate: string;
  direction: -1 | 1;
  range: PlanTrainingRange;
  timelineEnd: string;
  timelineStart: string;
}) {
  const shifted = shiftPlanAnalysisWindow({
    anchorDate: input.anchorDate,
    direction: input.direction,
    period: input.range,
  }).anchorDate;
  if (shifted < input.timelineStart) return input.timelineStart;
  if (shifted > input.timelineEnd) return input.timelineEnd;
  return shifted;
}

const trajectoryHeadlines: Record<PlanGoalProgressResult["status"], string> = {
  achieved: "Goal achieved",
  action_needed: "Action is needed to recover the trajectory",
  insufficient: "More comparable evidence is needed",
  on_track: "On track for the selected goal",
  unsupported: "Trajectory is not available for this goal",
  watch: "Trajectory needs watching",
};

export function buildGoalTrajectoryAnswer(progress: PlanGoalProgressResult | null | undefined) {
  if (!progress) {
    return {
      body: "Comparable threshold evidence is not available yet.",
      headline: "Trajectory unavailable",
    };
  }
  if (progress.status === "unsupported") {
    return {
      body: "This goal cannot be evaluated from calculated threshold evidence.",
      headline: trajectoryHeadlines.unsupported,
    };
  }
  const current = progress.current;
  const target = progress.target;
  const currentLabel = current
    ? formatPlanThresholdValue(target.activityCategory, current.value)
    : "no current threshold";
  const targetLabel = formatPlanThresholdValue(target.activityCategory, target.targetValue);
  const achievementLabel = formatPlanThresholdValue(
    target.activityCategory,
    target.achievementValue,
  );
  const tolerance =
    target.achievementValue === target.targetValue
      ? ""
      : ` Achievement is recognized at ${achievementLabel} (configured target ${targetLabel}).`;
  const evidence = `${progress.evidence.observationCount} comparable ${
    progress.evidence.observationCount === 1 ? "assessment" : "assessments"
  }`;
  const progressLabel =
    progress.metrics.progressPercent === null
      ? null
      : `${Math.round(progress.metrics.progressPercent)}% of the baseline-to-goal change completed`;
  return {
    body: `Current ${currentLabel}; configured goal ${targetLabel}.${tolerance} ${progressLabel ?? evidence}.`,
    headline: trajectoryHeadlines[progress.status],
  };
}

export function buildGoalSignalFreshnessLabel(input: {
  assessmentComputedAt: string | null | undefined;
  assessmentFreshness: "fresh" | "stale" | "unavailable" | undefined;
  progressComputedAt: string | null | undefined;
  progressFreshness: "available" | "stale" | "unavailable" | undefined;
}) {
  if (
    input.assessmentFreshness === "unavailable" ||
    (input.progressFreshness !== "available" && input.progressFreshness !== "stale")
  ) {
    return "Goal signals are unavailable";
  }
  if (input.assessmentFreshness === "stale" || input.progressFreshness === "stale") {
    return "Goal signals may be stale";
  }
  const computedAt = [input.assessmentComputedAt, input.progressComputedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return computedAt ? `Goal signals computed ${computedAt}` : "Goal signals are current";
}

function formatPace(seconds: number) {
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  return `${minutes}:${String(roundedSeconds % 60).padStart(2, "0")}`;
}

export function formatPlanThresholdValue(
  category: PlanThresholdHistoryPoint["activityCategory"],
  value: number,
) {
  if (category === "bike") return `${Math.round(value)} W`;
  if (value <= 0) return "—";
  return category === "run"
    ? `${formatPace(1000 / value)} /km`
    : `${formatPace(100 / value)} /100m`;
}

export function findCurrentTrainingPoint(
  points: readonly DailyTrainingAdjustmentPoint[],
  todayKey: string,
) {
  return (
    [...points].reverse().find((point) => point.date <= todayKey) ??
    points.find((point) => point.date >= todayKey) ??
    null
  );
}

export function buildPlanWeeklyAdherence(input: {
  points: readonly DailyTrainingAdjustmentPoint[];
  todayKey: string;
  weekDayEvidence: readonly PlanWeekDayEvidence[];
}) {
  const weekStart = getWeekStartDateKey(input.todayKey);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const evidenceByDate = new Map(input.weekDayEvidence.map((day) => [day.date, day]));
  const pointByDate = new Map(input.points.map((point) => [point.date, point]));
  const evidence = weekDates.flatMap((date) => {
    const day = evidenceByDate.get(date);
    return day ? [day] : [];
  });
  const completedSessions = evidence.reduce((total, day) => total + day.completedSessionCount, 0);
  const remainingSessions = evidence.reduce((total, day) => total + day.plannedSessionCount, 0);
  const loadPoints = weekDates.flatMap((date) => {
    const point = pointByDate.get(date);
    return point ? [point] : [];
  });
  const plannedValues = loadPoints.map((point) => point.plannedLoad).filter(finite);
  const plannedLoad =
    plannedValues.length === loadPoints.length && loadPoints.length === 7
      ? plannedValues.reduce((total, value) => total + value, 0)
      : null;
  const totalSessions = completedSessions + remainingSessions;

  return {
    completedSessions: evidence.length === 7 ? completedSessions : null,
    completionPercent:
      evidence.length === 7 && totalSessions > 0
        ? Math.round((completedSessions / totalSessions) * 100)
        : null,
    plannedLoad,
    remainingSessions: evidence.length === 7 ? remainingSessions : null,
    totalSessions: evidence.length === 7 ? totalSessions : null,
    weekStart,
  };
}

export function buildPlanTrainingInterpretation(input: {
  currentPoint: DailyTrainingAdjustmentPoint | null;
  thresholdTrend: PlanThresholdTrend | null;
  upcomingTitles: readonly string[];
}) {
  const point = input.currentPoint;
  const form = point?.formTsb;
  let headline = "Training status is still calibrating";
  let stateExplanation =
    "Complete more training with comparable Load data to establish fitness, fatigue, and form.";

  if (finite(form)) {
    if (form <= -10) {
      headline = "Recovery is becoming important";
      stateExplanation = `Form is ${Math.round(form)}, indicating that recent fatigue is materially above fitness.`;
    } else if (form < 0) {
      headline = "Productive load, with recovery pressure building";
      stateExplanation = `Form is ${Math.round(form)}. Training stress is elevated, but remains close to balance.`;
    } else if (form >= 10) {
      headline = "Fresh for quality training";
      stateExplanation = `Form is +${Math.round(form)}, indicating lower recent fatigue relative to fitness.`;
    } else {
      headline = "Training load is balanced";
      stateExplanation = `Form is ${Math.round(form)}, with fitness and recent fatigue in a balanced range.`;
    }
  }

  const thresholdExplanation =
    input.thresholdTrend && input.thresholdTrend.points.length >= 2
      ? input.thresholdTrend.change === null || Math.abs(input.thresholdTrend.change) < 0.001
        ? "Your comparable threshold assessments are stable."
        : input.thresholdTrend.change > 0
          ? `Your comparable threshold has improved ${Math.abs(input.thresholdTrend.changePercent ?? 0).toFixed(1)}%.`
          : `Your latest comparable threshold is ${Math.abs(input.thresholdTrend.changePercent ?? 0).toFixed(1)}% below the first assessment in this range.`
      : "A performance trend requires two or more comparable threshold assessments.";
  const recoverySession = input.upcomingTitles.find((title) => /recovery|rest|easy/i.test(title));
  const nextStep =
    finite(form) && form < 0 && recoverySession
      ? `Keep ${recoverySession} before adding more intensity.`
      : null;

  return {
    body: [thresholdExplanation, stateExplanation, nextStep].filter(Boolean).join(" "),
    headline,
  };
}
