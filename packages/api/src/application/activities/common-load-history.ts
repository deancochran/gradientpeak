import { createHash } from "node:crypto";
import {
  aggregateCommonLoad,
  aggregateCommonLoadEnvelopes,
  COMMON_LOAD_HISTORY_MATURE_DAYS,
  COMMON_LOAD_HISTORY_REQUIRED_DAYS,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadHistoryDayObservation,
  type CommonLoadHistoryResult,
  type CommonLoadResult,
  commonLoadResultSchema,
  replayCommonLoadHistory,
} from "@repo/core/load";
import { scheduledDateTimeToIsoInstant } from "@repo/core/utils/schedule-date";
import { activities, integrations, providerSyncState } from "@repo/db";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivitySegmentDerivedSummaries,
  loadActivitySegmentsByActivityId,
  type SegmentDerivedSummary,
} from "../../lib/activity-analysis";
import { supportsActivityHistorySync } from "../integrations/syncOverviewUseCase";

export const commonLoadHistoryActivityLimit = 10_000;

type Db = ReturnType<typeof getRequiredDb>;
type ActivityIdentity = { id: string; started_at: Date };
type ActivityContribution = { result: CommonLoadResult; fingerprint: string };

async function hasCompleteActivitySourceCoverage(
  db: Parameters<Parameters<Db["transaction"]>[0]>[0],
  input: { endDate: string; planningTimezone: string; profileId: string; startDate: string },
): Promise<boolean> {
  const integrationRows = await db
    .select({ id: integrations.id, provider: integrations.provider })
    .from(integrations)
    .where(eq(integrations.profile_id, input.profileId));
  const relevant = integrationRows.filter((integration) =>
    supportsActivityHistorySync(integration.provider),
  );
  // Neither a never-completed first sync nor a disconnected provider (whose
  // integration/state rows are deleted) proves that this history window is zero.
  if (relevant.length === 0) return false;
  const syncRows = await db
    .select({
      integrationId: providerSyncState.integration_id,
      lastSucceededAt: providerSyncState.last_sync_succeeded_at,
      lastFailedAt: providerSyncState.last_sync_failed_at,
      consecutiveFailures: providerSyncState.consecutive_failures,
      highWatermark: providerSyncState.high_watermark,
      metadata: providerSyncState.metadata,
    })
    .from(providerSyncState)
    .where(
      and(
        inArray(
          providerSyncState.integration_id,
          relevant.map((integration) => integration.id),
        ),
        eq(providerSyncState.resource, "historical_activities"),
      ),
    );
  const byIntegration = new Map(syncRows.map((row) => [row.integrationId, row]));
  const requiredStart = Date.parse(
    scheduledDateTimeToIsoInstant({
      scheduledDate: input.startDate,
      time: "00:00",
      timeZone: input.planningTimezone,
    }),
  );
  const requiredEnd =
    Date.parse(
      scheduledDateTimeToIsoInstant({
        scheduledDate: addCalendarDays(input.endDate, 1),
        time: "00:00",
        timeZone: input.planningTimezone,
      }),
    ) - 1;
  return relevant.every((integration) => {
    const sync = byIntegration.get(integration.id);
    const metadata = sync?.metadata;
    const coverage =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).activityHistoryCoverage
        : null;
    const record =
      coverage && typeof coverage === "object" && !Array.isArray(coverage)
        ? (coverage as Record<string, unknown>)
        : null;
    const coverageStart = typeof record?.start === "string" ? Date.parse(record.start) : Number.NaN;
    const coverageEnd = typeof record?.end === "string" ? Date.parse(record.end) : Number.NaN;
    return (
      sync !== undefined &&
      sync.lastSucceededAt !== null &&
      // An old successful read cannot remain complete merely because its metadata
      // claimed a future boundary. Coverage must be refreshed through this window.
      sync.lastSucceededAt.getTime() >= requiredEnd &&
      sync.highWatermark !== null &&
      sync.consecutiveFailures === 0 &&
      (sync.lastFailedAt === null || sync.lastSucceededAt >= sync.lastFailedAt) &&
      Number.isFinite(coverageStart) &&
      Number.isFinite(coverageEnd) &&
      coverageStart <= requiredStart &&
      coverageEnd >= requiredEnd &&
      sync.highWatermark.getTime() >= requiredEnd
    );
  });
}

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

function datesForWindow(
  currentPlanningDate: string,
  replayDays:
    | typeof COMMON_LOAD_HISTORY_REQUIRED_DAYS
    | typeof COMMON_LOAD_HISTORY_MATURE_DAYS = COMMON_LOAD_HISTORY_REQUIRED_DAYS,
): string[] {
  const startDate = addCalendarDays(currentPlanningDate, -replayDays);
  return Array.from({ length: replayDays }, (_, index) => addCalendarDays(startDate, index));
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
  if (commonResults.some((result) => result.status === "unavailable")) return null;
  return commonResults.map((result, index) => {
    const summary = summaries[index];
    if (
      !summary ||
      result.status === "unavailable" ||
      (result.status === "partial" && result.load === null)
    ) {
      throw new Error("Validated common Load segment contribution expected");
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
        result.evidenceFingerprint ?? "partial-without-activity-evidence",
        result.thresholdEvidence?.sourceFingerprint ?? "partial-without-threshold-evidence",
      ]),
    };
  });
}

export function buildCommonLoadHistoryObservations(input: {
  activities: ActivityIdentity[];
  segmentSummaries: SegmentDerivedSummary[];
  currentPlanningDate: string;
  planningTimezone: string;
  coverageStatus?: "complete" | "partial";
  replayDays?: typeof COMMON_LOAD_HISTORY_REQUIRED_DAYS | typeof COMMON_LOAD_HISTORY_MATURE_DAYS;
}): CommonLoadHistoryDayObservation[] {
  const dates = datesForWindow(input.currentPlanningDate, input.replayDays);
  const startDate = dates[0];
  const endDate = dates.at(-1);
  if (!startDate || !endDate) throw new Error("Common Load history window must not be empty");

  const summariesByActivity = new Map<string, SegmentDerivedSummary[]>();
  const coverageStatus = input.coverageStatus ?? "complete";
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
        coverageStatus,
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
        coverageStatus,
        reason: "common_load_unavailable",
        evidenceFingerprints: [],
      };
    }
    const parentAggregates = activitySegmentResults.map((contributions) =>
      aggregateCommonLoad((contributions ?? []).map((contribution) => contribution.result)),
    );
    const aggregate = aggregateCommonLoadEnvelopes(parentAggregates);
    if (aggregate.status === "unavailable") {
      return {
        state: "unavailable",
        date,
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        reason: "common_load_unavailable",
        coverageStatus,
        evidenceFingerprints: activitySegmentResults.flatMap((contributions, index) => {
          const activity = dailyActivities[index];
          if (!activity || contributions === null) return [];
          return [
            fingerprint([
              "activity-contribution",
              activity.id,
              ...contributions.map((contribution) => contribution.fingerprint).sort(),
            ]),
          ];
        }),
      };
    }
    return {
      state: "observed",
      date,
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      coverageStatus,
      aggregate: {
        ...aggregate,
      },
      evidenceFingerprints: activitySegmentResults.flatMap((contributions, index) => {
        const activity = dailyActivities[index];
        if (!activity || contributions === null) return [];
        return [
          fingerprint([
            "activity-contribution",
            activity.id,
            ...contributions.map((contribution) => contribution.fingerprint).sort(),
          ]),
        ];
      }),
    };
  });
}

export async function getCommonLoadHistory(input: {
  db: Db;
  profileId: string;
  currentPlanningDate: string;
  planningTimezone: string;
}): Promise<CommonLoadHistoryResult> {
  // Read the full maturity horizon; Core returns only the latest 84 chart points.
  const dates = datesForWindow(input.currentPlanningDate, COMMON_LOAD_HISTORY_MATURE_DAYS);
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
        const sourceCoverageComplete = await hasCompleteActivitySourceCoverage(tx, {
          endDate,
          planningTimezone: input.planningTimezone,
          profileId: input.profileId,
          startDate,
        });
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
            coverageStatus: sourceCoverageComplete ? "complete" : "partial",
            replayDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
          }),
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch {
    return unavailableWindow(input);
  }
}
