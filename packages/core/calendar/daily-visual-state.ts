import type { CalendarProjectionItem, SemanticMetric } from "../contracts/read-projections";

export type CalendarDayLoadDepth =
  | "none"
  | "unknown"
  | "zero"
  | "quarter"
  | "half"
  | "three_quarters"
  | "full";

export type CalendarDayIntensity =
  | "none"
  | "unavailable"
  | "recovery"
  | "endurance"
  | "tempo"
  | "high"
  | "mixed";

export type CalendarDayTreatment =
  | "none"
  | "planned"
  | "completed"
  | "unplanned_completed"
  | "partial"
  | "missed"
  | "cancelled"
  | "mixed";

export type CalendarDayAdherence =
  | "none"
  | "planned"
  | "complete"
  | "partial"
  | "missed"
  | "cancelled"
  | "unplanned"
  | "mixed";

export type CalendarDaySignal =
  | "rest"
  | "planned"
  | "completed"
  | "completed_with_unaccounted_plan"
  | "goal";

type MetricCoverage = "none" | "available" | "partial" | "unavailable";

export type CalendarDayVisualState = {
  sessionCount: number;
  otherItemCount: number;
  counts: {
    planned: number;
    completedAsPlanned: number;
    completedWithoutPlan: number;
    partiallyCompleted: number;
    missed: number;
    cancelled: number;
  };
  completedLoad: {
    depth: CalendarDayLoadDepth;
    coverage: MetricCoverage;
    value: number | null;
  };
  intensity: {
    family: CalendarDayIntensity;
    coverage: MetricCoverage;
    source: "none" | "completed" | "planned_estimate";
  };
  treatment: CalendarDayTreatment;
  adherence: CalendarDayAdherence;
  signal: {
    kind: CalendarDaySignal;
    loadDepth: CalendarDayLoadDepth;
  };
};

type MetricSummary = {
  coverage: MetricCoverage;
  values: number[];
};

function metricValue(
  metrics: SemanticMetric[],
  key: SemanticMetric["key"],
): { status: "available" | "partial"; value: number } | null {
  const metric = metrics.find((candidate) => candidate.key === key);
  if (
    !metric ||
    metric.status === "unavailable" ||
    !Number.isFinite(metric.value) ||
    metric.value < 0
  ) {
    return null;
  }
  return { status: metric.status, value: metric.value };
}

function summarizeMetric(
  metricSets: SemanticMetric[][],
  key: SemanticMetric["key"],
): MetricSummary {
  if (metricSets.length === 0) return { coverage: "none", values: [] };

  const known = metricSets
    .map((metrics) => metricValue(metrics, key))
    .filter((metric): metric is NonNullable<typeof metric> => metric !== null);
  if (known.length === 0) return { coverage: "unavailable", values: [] };

  const complete =
    known.length === metricSets.length && known.every((metric) => metric.status === "available");
  return {
    coverage: complete ? "available" : "partial",
    values: known.map((metric) => metric.value),
  };
}

function isTrainingItem(item: CalendarProjectionItem): boolean {
  if (item.kind === "planned_activity" || item.kind === "completed_activity") return true;
  if (item.kind === "group_event") {
    return item.plan !== null && item.groupEvent?.viewerRsvpStatus !== "declined";
  }
  if (item.kind !== "event") return false;
  return (
    item.event?.type === "race_target" ||
    item.metrics.some(
      (metric) => metric.key === "common_load" || metric.key === "normalized_intensity",
    )
  );
}

function intensityFamily(
  value: number,
): Exclude<CalendarDayIntensity, "none" | "unavailable" | "mixed"> {
  if (value < 0.65) return "recovery";
  if (value < 0.85) return "endurance";
  if (value < 1) return "tempo";
  return "high";
}

function loadDepth(sessionCount: number, summary: MetricSummary): CalendarDayLoadDepth {
  if (sessionCount === 0) return "none";
  if (summary.values.length === 0) return "unknown";
  const total = summary.values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return "zero";
  if (total <= 35) return "quarter";
  if (total <= 75) return "half";
  if (total <= 120) return "three_quarters";
  return "full";
}

function greaterLoadDepth(
  left: CalendarDayLoadDepth,
  right: CalendarDayLoadDepth,
): CalendarDayLoadDepth {
  const order: CalendarDayLoadDepth[] = [
    "none",
    "unknown",
    "zero",
    "quarter",
    "half",
    "three_quarters",
    "full",
  ];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

/**
 * Converts canonical calendar projection items into one renderer-neutral day story.
 * Calendar dates have already been assigned in the profile's planning timezone;
 * this helper deliberately never reparses or regroups them.
 */
export function deriveCalendarDayVisualState(
  items: readonly CalendarProjectionItem[],
): CalendarDayVisualState {
  const hasGoal = items.some((item) => item.kind === "goal");
  let planned = 0;
  let completedAsPlanned = 0;
  let completedWithoutPlan = 0;
  let partiallyCompleted = 0;
  let missed = 0;
  let cancelled = 0;
  let trainingItemCount = 0;
  const completedMetricSets: SemanticMetric[][] = [];
  const plannedMetricSets: SemanticMetric[][] = [];

  for (const item of items) {
    if (!isTrainingItem(item)) continue;
    trainingItemCount += 1;

    if (item.kind === "completed_activity") {
      completedWithoutPlan += 1;
      completedMetricSets.push(item.metrics);
      continue;
    }

    if (item.status === "completed") {
      completedAsPlanned += 1;
      // Estimated prescription metrics are never completion evidence.
      completedMetricSets.push(item.estimated ? [] : item.metrics);
      if (item.plan) plannedMetricSets.push(item.plan.metrics);

      const completedLoad = item.estimated ? null : metricValue(item.metrics, "common_load");
      const plannedLoad = item.plan ? metricValue(item.plan.metrics, "common_load") : null;
      if (
        completedLoad &&
        plannedLoad &&
        plannedLoad.value > 0 &&
        completedLoad.value / plannedLoad.value < 0.8
      ) {
        partiallyCompleted += 1;
      }
      continue;
    }

    if (item.status === "expired") {
      missed += 1;
      plannedMetricSets.push(item.metrics);
      continue;
    }
    if (item.status === "cancelled") {
      cancelled += 1;
      continue;
    }

    planned += 1;
    plannedMetricSets.push(item.metrics);
  }

  const completedSessions = completedAsPlanned + completedWithoutPlan;
  const completedLoadSummary = summarizeMetric(completedMetricSets, "common_load");
  const plannedLoadSummary = summarizeMetric(plannedMetricSets, "common_load");
  const completedIntensity = summarizeMetric(completedMetricSets, "normalized_intensity");
  const plannedIntensity = summarizeMetric(plannedMetricSets, "normalized_intensity");
  const chosenIntensity =
    completedIntensity.values.length > 0 ? completedIntensity : plannedIntensity;
  const intensitySource =
    completedIntensity.values.length > 0
      ? "completed"
      : plannedIntensity.values.length > 0
        ? "planned_estimate"
        : "none";
  const intensityFamilies = new Set(chosenIntensity.values.map(intensityFamily));
  const intensity =
    intensityFamilies.size === 0
      ? trainingItemCount === 0
        ? "none"
        : "unavailable"
      : intensityFamilies.size > 1
        ? "mixed"
        : ([...intensityFamilies][0] ?? "unavailable");

  const activeKinds = [planned > 0, completedSessions > 0, missed > 0, cancelled > 0].filter(
    Boolean,
  ).length;
  let treatment: CalendarDayTreatment = "none";
  if (activeKinds > 1)
    treatment =
      completedSessions > 0 && (missed > 0 || partiallyCompleted > 0) ? "partial" : "mixed";
  else if (partiallyCompleted > 0) treatment = "partial";
  else if (completedAsPlanned > 0 && completedWithoutPlan === 0) treatment = "completed";
  else if (completedWithoutPlan > 0 && completedAsPlanned === 0) treatment = "unplanned_completed";
  else if (completedSessions > 0) treatment = "mixed";
  else if (planned > 0) treatment = "planned";
  else if (missed > 0) treatment = "missed";
  else if (cancelled > 0) treatment = "cancelled";

  const plannedSessionCount = planned + completedAsPlanned + missed + cancelled;
  let adherence: CalendarDayAdherence = "none";
  if (plannedSessionCount === 0) adherence = completedWithoutPlan > 0 ? "unplanned" : "none";
  else if (completedAsPlanned > 0) {
    adherence =
      planned > 0 || missed > 0 || cancelled > 0 || partiallyCompleted > 0 ? "partial" : "complete";
  } else if (missed > 0) adherence = planned > 0 || cancelled > 0 ? "mixed" : "missed";
  else if (planned > 0) adherence = cancelled > 0 ? "mixed" : "planned";
  else adherence = "cancelled";

  const completedLoadDepth = loadDepth(completedSessions, completedLoadSummary);
  const plannedLoadDepth = loadDepth(plannedMetricSets.length, plannedLoadSummary);
  const hasUnaccountedPlan = completedWithoutPlan > 0 && (planned > 0 || missed > 0);
  const signalKind: CalendarDaySignal = hasGoal
    ? "goal"
    : hasUnaccountedPlan
      ? "completed_with_unaccounted_plan"
      : completedSessions > 0
        ? "completed"
        : planned > 0 || missed > 0
          ? "planned"
          : "rest";

  return {
    sessionCount: trainingItemCount,
    otherItemCount: items.length - trainingItemCount,
    counts: {
      planned,
      completedAsPlanned,
      completedWithoutPlan,
      partiallyCompleted,
      missed,
      cancelled,
    },
    completedLoad: {
      depth: completedLoadDepth,
      coverage: completedLoadSummary.coverage,
      value:
        completedLoadSummary.values.length === 0
          ? null
          : completedLoadSummary.values.reduce((sum, value) => sum + value, 0),
    },
    intensity: {
      family: intensity,
      coverage: chosenIntensity.coverage,
      source: intensitySource,
    },
    treatment,
    adherence,
    signal: {
      kind: signalKind,
      loadDepth:
        signalKind === "goal"
          ? "none"
          : signalKind === "planned"
            ? plannedLoadDepth
            : signalKind === "completed_with_unaccounted_plan"
              ? greaterLoadDepth(completedLoadDepth, plannedLoadDepth)
              : completedLoadDepth,
    },
  };
}

function countPhrase(count: number, singular: string): string | null {
  if (count === 0) return null;
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** English assistive text for the otherwise wordless visual. */
export function describeCalendarDayVisualState(state: CalendarDayVisualState): string {
  const fullyCompletedAsPlanned = Math.max(
    0,
    state.counts.completedAsPlanned - state.counts.partiallyCompleted,
  );
  const sessionParts = [
    countPhrase(state.counts.planned, "planned"),
    countPhrase(fullyCompletedAsPlanned, "completed as planned"),
    countPhrase(state.counts.completedWithoutPlan, "completed without a plan link"),
    countPhrase(state.counts.partiallyCompleted, "partially completed"),
    countPhrase(state.counts.missed, "missed"),
    countPhrase(state.counts.cancelled, "cancelled"),
  ].filter((part): part is string => part !== null);

  const parts = [
    state.sessionCount === 0
      ? "No training sessions"
      : `${state.sessionCount} training session${state.sessionCount === 1 ? "" : "s"}: ${sessionParts.join(", ")}`,
  ];

  if (state.signal.kind === "goal") parts.push("Goal date");

  if (state.completedLoad.depth !== "none") {
    parts.push(
      state.completedLoad.depth === "unknown"
        ? "Completed load unavailable"
        : `Completed load ${state.completedLoad.depth.replace("three_quarters", "high").replace("quarter", "low").replace("half", "moderate").replace("full", "very high")}`,
    );
    if (state.completedLoad.coverage === "partial") parts.push("Completed load data partial");
  }

  if (state.intensity.family !== "none") {
    const prefix =
      state.intensity.source === "planned_estimate" ? "Planned intensity estimate" : "Intensity";
    parts.push(`${prefix} ${state.intensity.family}`);
    if (state.intensity.coverage === "partial") parts.push("Intensity data partial");
  }
  if (state.adherence !== "none") parts.push(`Adherence ${state.adherence}`);
  if (state.otherItemCount > 0) {
    parts.push(
      `${state.otherItemCount} other calendar item${state.otherItemCount === 1 ? "" : "s"}`,
    );
  }
  return `${parts.join(". ")}.`;
}
