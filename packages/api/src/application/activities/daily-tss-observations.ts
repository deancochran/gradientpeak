import type { ActivityListDerivedSummary } from "@repo/core";
import { loadSeriesIdentityForActivityTss, sameLoadSeriesIdentity } from "@repo/core/load";
import { activities } from "@repo/db";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import { buildActivityDerivedSummaryMap } from "../../lib/activity-analysis";

export const dailyTssActivityLimit = 10_000;

type Db = ReturnType<typeof getRequiredDb>;
type ActivityRow = typeof activities.$inferSelect;
type DailyTssActivityRow = Pick<ActivityRow, "id" | "started_at">;
type TssIdentity = NonNullable<ActivityListDerivedSummary["tss_identity"]>;

export type DailyTssObservationsInput = {
  start_date: string;
  end_date: string;
  timezone: string;
};

export type DailyTssObservation =
  | {
      date: string;
      state: "calculated";
      value: number;
      tss_identity: TssIdentity;
      activity_count: number;
      unavailable_activity_count: number;
    }
  | {
      date: string;
      state: "unavailable";
      value: null;
      tss_identity: null;
      activity_count: number;
      unavailable_activity_count: number;
      reason: "tss_unavailable" | "mixed_tss_identities";
    };

export class DailyTssActivityLimitExceededError extends Error {
  constructor() {
    super(
      `Daily TSS observations support at most ${dailyTssActivityLimit} activities; narrow the date range.`,
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

export function aggregateDailyTssObservations(input: {
  activities: DailyTssActivityRow[];
  derivedByActivityId: Map<string, ActivityListDerivedSummary>;
  startDate: string;
  endDate: string;
  timezone: string;
}): DailyTssObservation[] {
  const byDate = new Map<string, DailyTssActivityRow[]>();
  for (const activity of input.activities) {
    const date = localDate(activity.started_at, input.timezone);
    if (date < input.startDate || date > input.endDate) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), activity]);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dayActivities]): DailyTssObservation => {
      const derived = dayActivities.map((activity) => input.derivedByActivityId.get(activity.id));
      const unavailableActivityCount = derived.filter(
        (summary) =>
          summary?.tss_identity == null ||
          summary.tss == null ||
          !Number.isFinite(summary.tss) ||
          summary.tss < 0,
      ).length;

      if (unavailableActivityCount > 0) {
        return {
          date,
          state: "unavailable",
          value: null,
          tss_identity: null,
          activity_count: dayActivities.length,
          unavailable_activity_count: unavailableActivityCount,
          reason: "tss_unavailable",
        };
      }

      const firstIdentity = derived[0]?.tss_identity as TssIdentity;
      const firstSeriesIdentity = loadSeriesIdentityForActivityTss(firstIdentity);
      if (
        derived.some(
          (summary) =>
            !summary?.tss_identity ||
            !sameLoadSeriesIdentity(
              firstSeriesIdentity,
              loadSeriesIdentityForActivityTss(summary.tss_identity),
            ),
        )
      ) {
        return {
          date,
          state: "unavailable",
          value: null,
          tss_identity: null,
          activity_count: dayActivities.length,
          unavailable_activity_count: 0,
          reason: "mixed_tss_identities",
        };
      }

      return {
        date,
        state: "calculated",
        value: derived.reduce((sum, summary) => sum + (summary?.tss as number), 0),
        tss_identity: firstIdentity,
        activity_count: dayActivities.length,
        unavailable_activity_count: 0,
      };
    });
}

export async function getDailyTssObservations(input: {
  db: Db;
  profileId: string;
  range: DailyTssObservationsInput;
}) {
  const envelopeStart = new Date(`${input.range.start_date}T00:00:00.000Z`);
  envelopeStart.setUTCDate(envelopeStart.getUTCDate() - 1);
  const envelopeEnd = new Date(`${input.range.end_date}T00:00:00.000Z`);
  envelopeEnd.setUTCDate(envelopeEnd.getUTCDate() + 2);

  const activityRows = await input.db
    .select({
      id: activities.id,
      type: activities.type,
      started_at: activities.started_at,
      finished_at: activities.finished_at,
      duration_seconds: activities.duration_seconds,
      moving_seconds: activities.moving_seconds,
      distance_meters: activities.distance_meters,
      avg_heart_rate: activities.avg_heart_rate,
      max_heart_rate: activities.max_heart_rate,
      avg_power: activities.avg_power,
      max_power: activities.max_power,
      avg_speed_mps: activities.avg_speed_mps,
      max_speed_mps: activities.max_speed_mps,
      normalized_power: activities.normalized_power,
      normalized_speed_mps: activities.normalized_speed_mps,
      normalized_graded_speed_mps: activities.normalized_graded_speed_mps,
    })
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        gte(activities.started_at, envelopeStart),
        lt(activities.started_at, envelopeEnd),
      ),
    )
    .orderBy(asc(activities.started_at), asc(activities.id))
    .limit(dailyTssActivityLimit + 1);

  if (activityRows.length > dailyTssActivityLimit) {
    throw new DailyTssActivityLimitExceededError();
  }

  const derivedByActivityId = await buildActivityDerivedSummaryMap({
    store: createActivityAnalysisStore(input.db),
    profileId: input.profileId,
    activities: activityRows,
  });

  return {
    ...input.range,
    day_policy: "activity_started_at_in_requested_timezone" as const,
    observations: aggregateDailyTssObservations({
      activities: activityRows,
      derivedByActivityId,
      startDate: input.range.start_date,
      endDate: input.range.end_date,
      timezone: input.range.timezone,
    }),
  };
}
