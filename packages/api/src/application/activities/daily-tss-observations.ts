import type { ActivityListDerivedSummary } from "@repo/core";
import { activities } from "@repo/db";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivitySegmentDerivedSummaries,
  loadActivitySegmentsByActivityId,
  type SegmentDerivedSummary,
} from "../../lib/activity-analysis";

export const dailyTssActivityLimit = 10_000;
type Db = ReturnType<typeof getRequiredDb>;
type TssIdentity = NonNullable<ActivityListDerivedSummary["tss_identity"]>;

export type DailyTssObservationsInput = { start_date: string; end_date: string; timezone: string };

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
      reason: "tss_unavailable";
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
  activities: Array<{ id: string; started_at: Date }>;
  segmentSummaries: SegmentDerivedSummary[];
  startDate: string;
  endDate: string;
  timezone: string;
}): DailyTssObservation[] {
  type StreamObservation = DailyTssObservation & { stream: string };
  const activityDates = new Map(
    input.activities.map((activity) => [
      activity.id,
      localDate(activity.started_at, input.timezone),
    ]),
  );
  const observations: StreamObservation[] = [];
  for (const summary of input.segmentSummaries) {
    const date = activityDates.get(summary.activity_id);
    if (!date || date < input.startDate || date > input.endDate) continue;
    if (
      summary.tss === null ||
      !Number.isFinite(summary.tss) ||
      summary.tss < 0 ||
      summary.tss_identity === null ||
      summary.load_stream_key === null
    ) {
      observations.push({
        date,
        state: "unavailable",
        value: null,
        tss_identity: null,
        activity_count: 1,
        unavailable_activity_count: 1,
        reason: "tss_unavailable",
        stream: summary.dedupe_key,
      });
      continue;
    }
    observations.push({
      date,
      state: "calculated",
      value: summary.tss,
      tss_identity: summary.tss_identity,
      activity_count: 1,
      unavailable_activity_count: 0,
      stream: summary.load_stream_key,
    });
  }
  const grouped = new Map<string, StreamObservation>();
  for (const observation of observations) {
    const key = `${observation.date}:${observation.stream}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, observation);
    } else if (current.state === "calculated" && observation.state === "calculated") {
      grouped.set(key, {
        ...current,
        value: current.value + observation.value,
        activity_count: current.activity_count + observation.activity_count,
      });
    } else if (current.state === "unavailable" && observation.state === "unavailable") {
      grouped.set(key, {
        ...current,
        activity_count: current.activity_count + observation.activity_count,
        unavailable_activity_count:
          current.unavailable_activity_count + observation.unavailable_activity_count,
      });
    }
  }
  return [...grouped.values()]
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.stream.localeCompare(right.stream),
    )
    .map(({ stream: _stream, ...observation }) => observation);
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
    .limit(dailyTssActivityLimit + 1);
  if (activityRows.length > dailyTssActivityLimit) throw new DailyTssActivityLimitExceededError();
  const segments = await loadActivitySegmentsByActivityId(
    input.db,
    activityRows.map((activity) => activity.id),
  );
  const activitiesWithSegments = activityRows.map((activity) => ({
    ...activity,
    segments: segments.get(activity.id) ?? [],
  }));
  const segmentSummaries = await buildActivitySegmentDerivedSummaries({
    store: createActivityAnalysisStore(input.db),
    profileId: input.profileId,
    activities: activitiesWithSegments,
  });
  return {
    ...input.range,
    day_policy: "activity_started_at_in_requested_timezone" as const,
    observations: aggregateDailyTssObservations({
      activities: activityRows,
      segmentSummaries,
      startDate: input.range.start_date,
      endDate: input.range.end_date,
      timezone: input.range.timezone,
    }),
  };
}
