import {
  aggregateCommonLoad,
  aggregateCommonLoadEnvelopes,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadAggregate,
  commonLoadResultSchema,
  type DailyCommonLoadObservation,
} from "@repo/core/load";
import { activities } from "@repo/db";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivitySegmentDerivedSummaries,
  loadActivitySegmentsByActivityId,
  type SegmentDerivedSummary,
} from "../../lib/activity-analysis";

export const dailyCommonLoadActivityLimit = 10_000;
type Db = ReturnType<typeof getRequiredDb>;

export type DailyCommonLoadObservationsInput = {
  start_date: string;
  end_date: string;
  timezone: string;
};

export class DailyCommonLoadActivityLimitExceededError extends Error {
  constructor() {
    super(
      `Daily common Load observations support at most ${dailyCommonLoadActivityLimit} activities; narrow the date range.`,
    );
  }
}

function localDate(startedAt: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    calendar: "gregory",
    day: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(startedAt);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

/**
 * Aggregates only persisted common Load results. Missing or partial activity
 * evidence is retained in the aggregate rather than converted to zero.
 */
export function aggregateDailyCommonLoadObservations(input: {
  activities: Array<{ id: string; started_at: Date }>;
  segmentSummaries: SegmentDerivedSummary[];
  startDate: string;
  endDate: string;
  timezone: string;
}): DailyCommonLoadObservation[] {
  const dateByActivityId = new Map(
    input.activities.map((activity) => [
      activity.id,
      localDate(activity.started_at, input.timezone),
    ]),
  );
  const summariesByActivityId = new Map<string, SegmentDerivedSummary[]>();
  for (const summary of input.segmentSummaries) {
    summariesByActivityId.set(summary.activity_id, [
      ...(summariesByActivityId.get(summary.activity_id) ?? []),
      summary,
    ]);
  }
  const aggregatesByDate = new Map<string, CommonLoadAggregate[]>();
  for (const activity of input.activities) {
    const date = dateByActivityId.get(activity.id);
    if (!date || date < input.startDate || date > input.endDate) continue;
    const results = (summariesByActivityId.get(activity.id) ?? []).flatMap((summary) => {
      const parsed = commonLoadResultSchema.safeParse(summary.common_load);
      return parsed.success ? [parsed.data] : [];
    });
    // An activity with no common-model segment result is explicitly unavailable,
    // while retaining its count in day-level coverage.
    const activityAggregate = aggregateCommonLoad(
      results.length > 0
        ? results
        : [
            commonLoadResultSchema.parse({
              status: "unavailable",
              model: COMMON_RELATIVE_LOAD_MODEL,
              version: COMMON_RELATIVE_LOAD_VERSION,
              sport: "other",
              method: null,
              quality: null,
              thresholdEvidence: null,
              evidenceFingerprint: null,
              computedAsOf: activity.started_at.toISOString(),
              contributingDurationSeconds: null,
              reason: "activity_data_missing",
            }),
          ],
    );
    aggregatesByDate.set(date, [...(aggregatesByDate.get(date) ?? []), activityAggregate]);
  }
  return [...aggregatesByDate]
    .map(([date, aggregates]) => ({ date, aggregate: aggregateCommonLoadEnvelopes(aggregates) }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export async function getDailyCommonLoadObservations(input: {
  db: Db;
  profileId: string;
  range: DailyCommonLoadObservationsInput;
}) {
  const envelopeStart = new Date(`${input.range.start_date}T00:00:00.000Z`);
  envelopeStart.setUTCDate(envelopeStart.getUTCDate() - 1);
  const envelopeEnd = new Date(`${input.range.end_date}T00:00:00.000Z`);
  envelopeEnd.setUTCDate(envelopeEnd.getUTCDate() + 2);
  const activityRows = await input.db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        gte(activities.started_at, envelopeStart),
        lt(activities.started_at, envelopeEnd),
      ),
    )
    .orderBy(asc(activities.started_at), asc(activities.id))
    .limit(dailyCommonLoadActivityLimit + 1);
  if (activityRows.length > dailyCommonLoadActivityLimit) {
    throw new DailyCommonLoadActivityLimitExceededError();
  }
  const segments = await loadActivitySegmentsByActivityId(
    input.db,
    activityRows.map((activity) => activity.id),
  );
  const segmentSummaries = await buildActivitySegmentDerivedSummaries({
    store: createActivityAnalysisStore(input.db),
    profileId: input.profileId,
    activities: activityRows.map((activity) => ({
      ...activity,
      segments: segments.get(activity.id) ?? [],
    })),
  });
  return {
    ...input.range,
    day_policy: "activity_started_at_in_requested_timezone" as const,
    observations: aggregateDailyCommonLoadObservations({
      activities: activityRows,
      segmentSummaries,
      startDate: input.range.start_date,
      endDate: input.range.end_date,
      timezone: input.range.timezone,
    }),
  };
}
