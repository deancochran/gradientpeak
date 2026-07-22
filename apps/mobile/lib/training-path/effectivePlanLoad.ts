import {
  aggregateCommonLoad,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
  commonLoadResultSchema,
  composeEffectivePlanLoad,
  type EffectiveCompositionItem,
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
  tentativeLoad: number | null;
  hasUnavailableCompletedLoad: boolean;
  reason: string | null;
};

export type EffectivePlanMetricPeriod = {
  key: string;
  startDate: string;
  endDate: string;
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

function summarizeItems(input: {
  items: readonly EffectiveCompositionItem[];
  tentativeItems: readonly Extract<EffectiveCompositionItem, { kind: "scheduled" }>[];
  completedSourceComplete: boolean;
  scheduledSourceComplete: boolean;
}): EffectivePlanMetricSummary {
  const completedResults = input.items.flatMap((item) =>
    item.kind === "completed" ? [item.commonLoad] : [],
  );
  const remainingResults = input.items.flatMap((item) =>
    item.kind === "scheduled" ? [item.commonLoad] : [],
  );
  const hasUnavailableCompletedLoad = completedResults.some(
    (load) => load.status === "unavailable" || load.load === null,
  );
  const tentativeAggregate = aggregateCommonLoad(
    input.tentativeItems.map((item) => item.commonLoad),
  );
  const hasIncompleteTentativeLoad =
    input.tentativeItems.length > 0 && tentativeAggregate.status !== "complete";
  const tentativeLoad =
    tentativeAggregate.status === "unavailable" ? null : tentativeAggregate.load;
  const sourcesComplete = input.completedSourceComplete && input.scheduledSourceComplete;
  if (input.items.length === 0) {
    if (hasIncompleteTentativeLoad) {
      return {
        status: "unavailable",
        load: null,
        intensity: null,
        completedLoad: null,
        remainingLoad: null,
        tentativeLoad: null,
        hasUnavailableCompletedLoad,
        reason: "common_load_unavailable",
      };
    }
    return sourcesComplete
      ? {
          status: "known_zero",
          load: 0,
          intensity: null,
          completedLoad: null,
          remainingLoad: null,
          tentativeLoad,
          hasUnavailableCompletedLoad,
          reason: null,
        }
      : {
          status: "unavailable",
          load: null,
          intensity: null,
          completedLoad: null,
          remainingLoad: null,
          tentativeLoad,
          hasUnavailableCompletedLoad,
          reason: input.scheduledSourceComplete
            ? "completed_source_incomplete"
            : "scheduled_source_incomplete",
        };
  }
  const aggregate = aggregateCommonLoad(input.items.map((item) => item.commonLoad));
  if (aggregate.status === "unavailable") {
    return {
      status: "unavailable",
      load: null,
      intensity: null,
      completedLoad: sumKnownLoads(completedResults),
      remainingLoad: sumKnownLoads(remainingResults),
      tentativeLoad,
      hasUnavailableCompletedLoad,
      reason: "common_load_unavailable",
    };
  }
  return {
    status:
      sourcesComplete && aggregate.status === "complete" && !hasIncompleteTentativeLoad
        ? "complete"
        : "partial",
    load: aggregate.load,
    intensity: aggregate.intensity,
    completedLoad: sumKnownLoads(completedResults),
    remainingLoad: sumKnownLoads(remainingResults),
    tentativeLoad,
    hasUnavailableCompletedLoad,
    reason:
      sourcesComplete && aggregate.status === "complete" && !hasIncompleteTentativeLoad
        ? null
        : "incomplete_common_load",
  };
}

/** Parses and composes the bounded source range once, then aggregates requested periods by date. */
export function buildEffectivePlanMetricSummaries(input: {
  asOfInstant: string;
  completedActivities: readonly CompletedActivitySource[];
  completedSourceComplete: boolean;
  coverageEndDate?: string;
  coverageStartDate?: string;
  periods: readonly EffectivePlanMetricPeriod[];
  planningTimezone: string;
  scheduledEvents: readonly ScheduledPlanSource[];
  scheduledSourceComplete: boolean;
}): Map<string, EffectivePlanMetricSummary> {
  if (input.periods.length === 0) return new Map();
  const startDate = input.periods.reduce(
    (earliest, period) => (period.startDate < earliest ? period.startDate : earliest),
    input.periods[0]?.startDate ?? "",
  );
  const endDate = input.periods.reduce(
    (latest, period) => (period.endDate > latest ? period.endDate : latest),
    input.periods[0]?.endDate ?? "",
  );
  const coverageStartDate = input.coverageStartDate ?? startDate;
  const coverageEndDate = input.coverageEndDate ?? endDate;
  const scheduledEvents = input.scheduledEvents.filter(
    (event) =>
      typeof event.scheduled_date !== "string" ||
      (event.scheduled_date >= coverageStartDate && event.scheduled_date <= coverageEndDate),
  );
  const linkedCompletedActivityIds = new Set(
    scheduledEvents.flatMap((event) => {
      const linkedId = event.linked_activity_id?.trim();
      return linkedId ? [linkedId] : [];
    }),
  );
  let compositionStartDate = coverageStartDate;
  let compositionEndDate = coverageEndDate;
  const completedActivities = input.completedActivities.filter((activity) => {
    const completedDate = dateKey(activity.started_at, input.planningTimezone);
    const isLinkedReplacement =
      typeof activity.id === "string" && linkedCompletedActivityIds.has(activity.id);
    if (isLinkedReplacement && completedDate !== null) {
      if (completedDate < compositionStartDate) compositionStartDate = completedDate;
      if (completedDate > compositionEndDate) compositionEndDate = completedDate;
    }
    return (
      completedDate === null ||
      isLinkedReplacement ||
      (completedDate >= coverageStartDate && completedDate <= coverageEndDate)
    );
  });
  const prepared = prepareEffectivePlanSources({
    ...input,
    completedActivities,
    scheduledEvents,
    startDate: compositionStartDate,
    endDate: compositionEndDate,
  });
  const result = composeEffectivePlanLoad({
    ...prepared.sources,
    planningTimezone: input.planningTimezone,
    asOfInstant: input.asOfInstant,
  });
  if (result.status === "integrity_unavailable") {
    return new Map(
      input.periods.map((period) => [
        period.key,
        {
          status: "unavailable" as const,
          load: null,
          intensity: null,
          completedLoad: null,
          remainingLoad: null,
          tentativeLoad: null,
          hasUnavailableCompletedLoad: false,
          reason: result.reason,
        },
      ]),
    );
  }
  const itemsByDate = groupByDate(result.items);
  const tentativeItemsByDate = groupByDate(result.tentativeItems);
  return new Map(
    input.periods.map((period) => {
      const items: EffectiveCompositionItem[] = [];
      const tentativeItems: Extract<EffectiveCompositionItem, { kind: "scheduled" }>[] = [];
      for (let date = period.startDate; date <= period.endDate; date = nextDate(date)) {
        items.push(...(itemsByDate.get(date) ?? []));
        tentativeItems.push(...(tentativeItemsByDate.get(date) ?? []));
      }
      return [
        period.key,
        summarizeItems({
          items,
          tentativeItems,
          completedSourceComplete:
            prepared.completedSourceComplete &&
            period.startDate >= coverageStartDate &&
            period.endDate <= coverageEndDate,
          scheduledSourceComplete:
            prepared.scheduledSourceComplete &&
            period.startDate >= coverageStartDate &&
            period.endDate <= coverageEndDate,
        }),
      ];
    }),
  );
}

function groupByDate<T extends { date: string }>(items: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const dateItems = grouped.get(item.date) ?? [];
    dateItems.push(item);
    grouped.set(item.date, dateItems);
  }
  return grouped;
}

function nextDate(date: string): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + 1);
  return instant.toISOString().slice(0, 10);
}

function prepareEffectivePlanSources(input: {
  asOfInstant: string;
  completedActivities: readonly CompletedActivitySource[];
  completedSourceComplete: boolean;
  endDate: string;
  scheduledEvents: readonly ScheduledPlanSource[];
  scheduledSourceComplete: boolean;
  startDate: string;
  planningTimezone: string;
}) {
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
  const completedActivityIds = new Set(
    completedActivities.map((activity) => activity.completedActivityId),
  );
  let invalidScheduledEventCount = 0;
  const scheduledItems = input.scheduledEvents.flatMap((event) => {
    if (!event.id || !event.scheduled_date) {
      invalidScheduledEventCount += 1;
      return [];
    }
    const activityPlan = activityPlanLoadSourceSchema.safeParse(event.activity_plan);
    const activityPlanData = activityPlan.success ? activityPlan.data : null;
    const normalizedStatus = event.status?.trim().toLowerCase();
    const isCancelled = normalizedStatus === "cancelled" || normalizedStatus === "canceled";
    const linkedCompletedActivityId = event.linked_activity_id?.trim() || null;
    if (
      !isCancelled &&
      linkedCompletedActivityId &&
      !completedActivityIds.has(linkedCompletedActivityId)
    ) {
      completedActivities.push({
        completedActivityId: linkedCompletedActivityId,
        completedDate: event.scheduled_date,
        commonLoad: unavailableLoad({
          asOfInstant: input.asOfInstant,
          sport: activityPlanData?.activity_category,
        }),
      });
      completedActivityIds.add(linkedCompletedActivityId);
    }
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
        status: isCancelled ? ("cancelled" as const) : ("active" as const),
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
  return {
    completedSourceComplete,
    scheduledSourceComplete,
    sources: {
      scheduledItems,
      completedActivities,
      scheduledSource: scheduledSourceComplete
        ? ({ status: "complete", startDate: input.startDate, endDate: input.endDate } as const)
        : ({
            status: "incomplete",
            reason: "fetch_partial",
            startDate: input.startDate,
            endDate: input.endDate,
          } as const),
      completedSource: completedSourceComplete
        ? ({ status: "complete", startDate: input.startDate, endDate: input.endDate } as const)
        : ({
            status: "incomplete",
            reason: "fetch_partial",
            startDate: input.startDate,
            endDate: input.endDate,
          } as const),
    },
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
  return (
    buildEffectivePlanMetricSummaries({
      ...input,
      periods: [{ key: "summary", startDate: input.startDate, endDate: input.endDate }],
    }).get("summary") ?? {
      status: "unavailable",
      load: null,
      intensity: null,
      completedLoad: null,
      remainingLoad: null,
      tentativeLoad: null,
      hasUnavailableCompletedLoad: false,
      reason: "common_load_unavailable",
    }
  );
}
