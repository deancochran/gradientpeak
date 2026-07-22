import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
  commonLoadResultSchema,
  composeEffectivePlanLoad,
  type EffectiveCompositionResult,
} from "@repo/core";
import { z } from "zod";

type ScheduledPlanSource = {
  id?: string | null;
  scheduled_date?: string | null;
  status?: string | null;
  completed?: boolean | null;
  tentative?: boolean | null;
  linked_activity_id?: string | null;
  activity_plan?: unknown;
};

type CompletedActivitySource = {
  id?: string | null;
  started_at?: string | Date | null;
  activity_type?: string | null;
  duration_seconds?: number | null;
  moving_seconds?: number | null;
  derived?: { stress?: { common_load?: unknown } | null; common_load?: unknown } | null;
};

export type EffectivePlanMetricSummary = {
  status: "complete" | "partial" | "known_zero" | "unavailable";
  load: number | null;
  intensity: number | null;
  completedLoad: number | null;
  remainingLoad: number | null;
  hasUnavailableCompletedLoad: boolean;
  reason: string | null;
};

const activityPlanLoadSourceSchema = z
  .object({
    common_load: z.unknown().optional(),
    activity_category: z.string().nullable().optional(),
  })
  .passthrough();

function canonicalSport(value: string | null | undefined): CommonLoadResult["sport"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "bike" || normalized === "cycling" || normalized === "ride") return "bike";
  if (normalized === "run" || normalized === "running") return "run";
  if (normalized === "swim" || normalized === "swimming") return "swim";
  if (normalized === "strength") return "strength";
  return "other";
}

function unavailableLoad(input: {
  asOfInstant: string;
  durationSeconds?: number | null;
  sport?: string | null;
}): CommonLoadResult {
  const duration = input.durationSeconds;
  return {
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport: canonicalSport(input.sport),
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: input.asOfInstant,
    contributingDurationSeconds:
      typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : null,
    reason: "activity_data_missing",
  };
}

function parsedLoad(value: unknown, fallback: CommonLoadResult): CommonLoadResult {
  const parsed = commonLoadResultSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function dateKey(value: string | Date | null | undefined, planningTimezone: string): string | null {
  if (!value) return null;
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: planningTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day", string>;
  return `${values.year}-${values.month}-${values.day}`;
}

function sumKnownLoads(results: readonly CommonLoadResult[]): number | null {
  const values = results.flatMap((result) =>
    result.status !== "unavailable" && result.load !== null ? [result.load] : [],
  );
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

function summarize(
  result: EffectiveCompositionResult,
  sourcesComplete: boolean,
): EffectivePlanMetricSummary {
  if (result.status === "integrity_unavailable") {
    return {
      status: "unavailable",
      load: null,
      intensity: null,
      completedLoad: null,
      remainingLoad: null,
      hasUnavailableCompletedLoad: false,
      reason: result.reason,
    };
  }

  const completedResults = result.items.flatMap((item) =>
    item.kind === "completed" ? [item.commonLoad] : [],
  );
  const remainingResults = result.items.flatMap((item) =>
    item.kind === "scheduled" ? [item.commonLoad] : [],
  );
  const hasUnavailableCompletedLoad = completedResults.some(
    (load) => load.status === "unavailable" || load.load === null,
  );
  if (result.aggregate.status === "known_zero") {
    return {
      status: "known_zero",
      load: 0,
      intensity: null,
      completedLoad: null,
      remainingLoad: null,
      hasUnavailableCompletedLoad,
      reason: null,
    };
  }
  if (result.aggregate.status === "unavailable") {
    return {
      status: "unavailable",
      load: null,
      intensity: null,
      completedLoad: sumKnownLoads(completedResults),
      remainingLoad: sumKnownLoads(remainingResults),
      hasUnavailableCompletedLoad,
      reason: result.aggregate.reason,
    };
  }
  const aggregate = result.aggregate.commonLoad;
  if (aggregate.status === "unavailable") {
    return {
      status: "unavailable",
      load: null,
      intensity: null,
      completedLoad: sumKnownLoads(completedResults),
      remainingLoad: sumKnownLoads(remainingResults),
      hasUnavailableCompletedLoad,
      reason: aggregate.reason,
    };
  }
  return {
    status: sourcesComplete && result.aggregate.status === "complete" ? "complete" : "partial",
    load: aggregate.load,
    intensity: aggregate.intensity,
    completedLoad: sumKnownLoads(completedResults),
    remainingLoad: sumKnownLoads(remainingResults),
    hasUnavailableCompletedLoad,
    reason: result.aggregate.status === "partial" ? "incomplete_common_load" : null,
  };
}

export function buildEffectivePlanMetricSummary(input: {
  asOfInstant: string;
  completedActivities: readonly CompletedActivitySource[];
  completedSourceComplete: boolean;
  endDate: string;
  planningTimezone: string;
  scheduledEvents: readonly ScheduledPlanSource[];
  scheduledSourceComplete: boolean;
  startDate: string;
}): EffectivePlanMetricSummary {
  let invalidCompletedActivityCount = 0;
  const completedActivities = input.completedActivities.flatMap((activity) => {
    if (!activity.id) {
      invalidCompletedActivityCount += 1;
      return [];
    }
    const completedDate = dateKey(activity.started_at, input.planningTimezone);
    if (!completedDate) {
      invalidCompletedActivityCount += 1;
      return [];
    }
    const duration = activity.moving_seconds ?? activity.duration_seconds;
    return [
      {
        completedActivityId: activity.id,
        completedDate,
        commonLoad: parsedLoad(
          activity.derived?.stress?.common_load ?? activity.derived?.common_load,
          unavailableLoad({
            asOfInstant: input.asOfInstant,
            durationSeconds: duration,
            sport: activity.activity_type,
          }),
        ),
      },
    ];
  });
  let invalidScheduledEventCount = 0;
  const scheduledItems = input.scheduledEvents.flatMap((event) => {
    if (!event.id || !event.scheduled_date) {
      invalidScheduledEventCount += 1;
      return [];
    }
    const activityPlan = activityPlanLoadSourceSchema.safeParse(event.activity_plan);
    const activityPlanData = activityPlan.success ? activityPlan.data : null;
    const normalizedStatus = event.status?.trim().toLowerCase();
    const linkedCompletedActivityId = event.linked_activity_id?.trim() || null;
    const completedWithoutEvidence =
      linkedCompletedActivityId === null &&
      (event.completed === true || normalizedStatus === "completed");
    if (completedWithoutEvidence) {
      completedActivities.push({
        completedActivityId: `completed-event:${event.id}`,
        completedDate: event.scheduled_date,
        commonLoad: unavailableLoad({
          asOfInstant: input.asOfInstant,
          sport: activityPlanData?.activity_category,
        }),
      });
      return [];
    }
    return [
      {
        scheduledItemId: event.id,
        scheduledDate: event.scheduled_date,
        status:
          normalizedStatus === "cancelled" || normalizedStatus === "canceled"
            ? ("cancelled" as const)
            : ("active" as const),
        tentative: event.tentative === true,
        linkedCompletedActivityId,
        commonLoad: parsedLoad(
          activityPlanData?.common_load,
          unavailableLoad({
            asOfInstant: input.asOfInstant,
            sport: activityPlanData?.activity_category,
          }),
        ),
      },
    ];
  });
  const completedSourceComplete =
    input.completedSourceComplete && invalidCompletedActivityCount === 0;
  const scheduledSourceComplete = input.scheduledSourceComplete && invalidScheduledEventCount === 0;
  const result = composeEffectivePlanLoad({
    scheduledItems,
    completedActivities,
    scheduledSource: scheduledSourceComplete
      ? { status: "complete", startDate: input.startDate, endDate: input.endDate }
      : {
          status: "incomplete",
          reason: "fetch_partial",
          startDate: input.startDate,
          endDate: input.endDate,
        },
    completedSource: completedSourceComplete
      ? { status: "complete", startDate: input.startDate, endDate: input.endDate }
      : {
          status: "incomplete",
          reason: "fetch_partial",
          startDate: input.startDate,
          endDate: input.endDate,
        },
    planningTimezone: input.planningTimezone,
    asOfInstant: input.asOfInstant,
  });
  return summarize(result, scheduledSourceComplete && completedSourceComplete);
}
