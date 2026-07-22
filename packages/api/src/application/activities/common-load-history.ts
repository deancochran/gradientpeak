import { createHash } from "node:crypto";
import {
  aggregateCommonLoad,
  COMMON_LOAD_HISTORY_REQUIRED_DAYS,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadHistoryDayObservation,
  type CommonLoadHistoryResult,
  type CommonLoadResult,
  commonLoadResultSchema,
  replayCommonLoadHistory,
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

export const commonLoadHistoryActivityLimit = 10_000;

type Db = ReturnType<typeof getRequiredDb>;
type ActivityIdentity = { id: string; started_at: Date };
type ActivityContribution = { result: CommonLoadResult; fingerprint: string };

function addCalendarDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
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

function fingerprint(parts: readonly string[]): string {
  return `common-load-history:v1:sha256:${createHash("sha256").update(parts.join("\n")).digest("hex")}`;
}

function datesForWindow(currentPlanningDate: string): string[] {
  const startDate = addCalendarDays(currentPlanningDate, -COMMON_LOAD_HISTORY_REQUIRED_DAYS);
  return Array.from({ length: COMMON_LOAD_HISTORY_REQUIRED_DAYS }, (_, index) =>
    addCalendarDays(startDate, index),
  );
}

function unavailableWindow(input: {
  currentPlanningDate: string;
  planningTimezone: string;
}): CommonLoadHistoryResult {
  return replayCommonLoadHistory({
    currentPlanningDate: input.currentPlanningDate,
    planningTimezone: input.planningTimezone,
    observations: datesForWindow(input.currentPlanningDate).map((date) => ({
      state: "unavailable" as const,
      date,
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      reason: "source_incomplete" as const,
      evidenceFingerprints: [],
    })),
  });
}

function parseActivitySegments(
  summaries: readonly SegmentDerivedSummary[],
): ActivityContribution[] | null {
  const results = summaries.map((summary) => commonLoadResultSchema.safeParse(summary.common_load));
  if (results.length === 0 || results.some((result) => !result.success)) return null;
  const commonResults = results.flatMap((result) => (result.success ? [result.data] : []));
  if (commonResults.some((result) => result.status !== "available")) return null;
  return commonResults.map((result, index) => {
    const summary = summaries[index];
    if (!summary || result.status !== "available" || result.evidenceFingerprint === null) {
      throw new Error("Validated available segment contribution expected");
    }
    return {
      result,
      fingerprint: fingerprint([
        "segment-contribution",
        summary.activity_id,
        summary.segment_id,
        result.model,
        result.version,
        String(result.load),
        String(result.intensity),
        String(result.contributingDurationSeconds),
        result.evidenceFingerprint,
      ]),
    };
  });
}

export function buildCommonLoadHistoryObservations(input: {
  activities: ActivityIdentity[];
  segmentSummaries: SegmentDerivedSummary[];
  currentPlanningDate: string;
  planningTimezone: string;
}): CommonLoadHistoryDayObservation[] {
  const dates = datesForWindow(input.currentPlanningDate);
  const startDate = dates[0];
  const endDate = dates.at(-1);
  if (!startDate || !endDate) throw new Error("Common Load history window must not be empty");

  const summariesByActivity = new Map<string, SegmentDerivedSummary[]>();
  for (const summary of input.segmentSummaries) {
    summariesByActivity.set(summary.activity_id, [
      ...(summariesByActivity.get(summary.activity_id) ?? []),
      summary,
    ]);
  }
  const activitiesByDate = new Map<string, ActivityIdentity[]>();
  for (const activity of input.activities) {
    const date = localDate(activity.started_at, input.planningTimezone);
    if (date < startDate || date > endDate) continue;
    activitiesByDate.set(date, [...(activitiesByDate.get(date) ?? []), activity]);
  }

  return dates.map((date) => {
    const dailyActivities = activitiesByDate.get(date) ?? [];
    if (dailyActivities.length === 0) {
      return {
        state: "known_zero",
        date,
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        evidenceFingerprints: [fingerprint(["complete-bounded-read", date])],
      };
    }

    const activitySegmentResults = dailyActivities.map((activity) =>
      parseActivitySegments(summariesByActivity.get(activity.id) ?? []),
    );
    if (activitySegmentResults.some((result) => result === null)) {
      return {
        state: "unavailable",
        date,
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        reason: "common_load_unavailable",
        evidenceFingerprints: [],
      };
    }
    const completeContributions = activitySegmentResults.flatMap((result) => result ?? []);
    const completeResults = completeContributions.map((contribution) => contribution.result);
    const aggregate = aggregateCommonLoad(completeResults);
    if (aggregate.status !== "complete") {
      return {
        state: "unavailable",
        date,
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        reason: aggregate.status === "partial" ? "partial_common_load" : "common_load_unavailable",
        evidenceFingerprints: completeResults.flatMap((result) =>
          result.evidenceFingerprint === null ? [] : [result.evidenceFingerprint],
        ),
      };
    }
    return {
      state: "observed",
      date,
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      aggregate: {
        ...aggregate,
        totalActivityCount: dailyActivities.length,
        includedActivityCount: dailyActivities.length,
        excludedActivityCount: 0,
        contributingActivityCount: dailyActivities.length,
      },
      evidenceFingerprints: completeContributions.map((contribution) => contribution.fingerprint),
    };
  });
}

export async function getCommonLoadHistory(input: {
  db: Db;
  profileId: string;
  currentPlanningDate: string;
  planningTimezone: string;
}): Promise<CommonLoadHistoryResult> {
  const dates = datesForWindow(input.currentPlanningDate);
  const startDate = dates[0];
  const endDate = dates.at(-1);
  if (!startDate || !endDate) return unavailableWindow(input);

  const envelopeStart = new Date(`${startDate}T00:00:00.000Z`);
  envelopeStart.setUTCDate(envelopeStart.getUTCDate() - 1);
  const envelopeEnd = new Date(`${input.currentPlanningDate}T00:00:00.000Z`);
  envelopeEnd.setUTCDate(envelopeEnd.getUTCDate() + 2);

  try {
    return await input.db.transaction(
      async (tx) => {
        const activityRows = await tx
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
          .limit(commonLoadHistoryActivityLimit + 1);
        if (activityRows.length > commonLoadHistoryActivityLimit) return unavailableWindow(input);

        const windowActivityRows = activityRows.filter((activity) => {
          const date = localDate(activity.started_at, input.planningTimezone);
          return date >= startDate && date <= endDate;
        });

        const segments = await loadActivitySegmentsByActivityId(
          tx,
          windowActivityRows.map((activity) => activity.id),
        );
        const activitiesWithSegments = windowActivityRows.map((activity) => ({
          ...activity,
          segments: segments.get(activity.id) ?? [],
        }));
        const segmentSummaries = await buildActivitySegmentDerivedSummaries({
          store: createActivityAnalysisStore(tx),
          profileId: input.profileId,
          activities: activitiesWithSegments,
        });
        return replayCommonLoadHistory({
          currentPlanningDate: input.currentPlanningDate,
          planningTimezone: input.planningTimezone,
          observations: buildCommonLoadHistoryObservations({
            activities: windowActivityRows,
            segmentSummaries,
            currentPlanningDate: input.currentPlanningDate,
            planningTimezone: input.planningTimezone,
          }),
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch {
    return unavailableWindow(input);
  }
}
