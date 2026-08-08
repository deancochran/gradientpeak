import { createHash } from "node:crypto";
import {
  type ActivityObservationQuantificationBundle,
  createObservationQuantificationBundle,
  isProviderActivityHistoryReconciliationTarget,
} from "@repo/core";
import { scheduledDateTimeToIsoInstant } from "@repo/core/calendar";
import {
  aggregateCommonLoadEnvelopes,
  COMMON_LOAD_HISTORY_BASIS,
  COMMON_LOAD_HISTORY_CALCULATION_MODEL,
  COMMON_LOAD_HISTORY_CALCULATION_VERSION,
  COMMON_LOAD_HISTORY_MATURE_DAYS,
  COMMON_LOAD_HISTORY_REQUIRED_DAYS,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadHistoryDayObservation,
  type CommonLoadHistoryResult,
  replayCommonLoadHistory,
} from "@repo/core/load";
import { activities, integrations, providerSyncState } from "@repo/db";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
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
type ActivityContribution = {
  observationQuantification: ActivityObservationQuantificationBundle;
  fingerprint: string;
};

async function hasCompleteActivitySourceCoverage(
  db: Parameters<Parameters<Db["transaction"]>[0]>[0],
  input: {
    asOf: Date;
    endDate: string;
    planningTimezone: string;
    profileId: string;
    startDate: string;
  },
): Promise<boolean> {
  const integrationRows = await db
    .select({ id: integrations.id, provider: integrations.provider })
    .from(integrations)
    .where(eq(integrations.profile_id, input.profileId));
  const relevant = integrationRows.filter((integration) =>
    isProviderActivityHistoryReconciliationTarget(integration.provider),
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
  const asOfMilliseconds = input.asOf.getTime();
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
        ? Reflect.get(metadata, "activityHistoryCoverage")
        : null;
    const record =
      coverage && typeof coverage === "object" && !Array.isArray(coverage) ? coverage : null;
    const coverageStartValue = record === null ? null : Reflect.get(record, "start");
    const coverageEndValue = record === null ? null : Reflect.get(record, "end");
    const coverageStart =
      typeof coverageStartValue === "string" ? Date.parse(coverageStartValue) : Number.NaN;
    const coverageEnd =
      typeof coverageEndValue === "string" ? Date.parse(coverageEndValue) : Number.NaN;
    return (
      sync !== undefined &&
      sync.lastSucceededAt !== null &&
      sync.lastSucceededAt.getTime() <= asOfMilliseconds &&
      // An old successful read cannot remain complete merely because its metadata
      // claimed a future boundary. Coverage must be refreshed through this window.
      sync.lastSucceededAt.getTime() >= requiredEnd &&
      sync.highWatermark !== null &&
      sync.highWatermark.getTime() <= asOfMilliseconds &&
      sync.consecutiveFailures === 0 &&
      (sync.lastFailedAt === null ||
        (sync.lastFailedAt.getTime() <= asOfMilliseconds &&
          sync.lastSucceededAt >= sync.lastFailedAt)) &&
      Number.isFinite(coverageStart) &&
      Number.isFinite(coverageEnd) &&
      coverageEnd <= asOfMilliseconds &&
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
  asOf: Date;
  currentPlanningDate: string;
  planningTimezone: string;
}): CommonLoadHistoryResult {
  const calculatedAsOf = input.asOf.toISOString();
  return replayCommonLoadHistory({
    basis: COMMON_LOAD_HISTORY_BASIS,
    calculationIdentity: {
      model: COMMON_LOAD_HISTORY_CALCULATION_MODEL,
      version: COMMON_LOAD_HISTORY_CALCULATION_VERSION,
      asOf: calculatedAsOf,
    },
    currentPlanningDate: input.currentPlanningDate,
    planningTimezone: input.planningTimezone,
    observations: datesForWindow(input.currentPlanningDate).map((date) => ({
      state: "unavailable" as const,
      date,
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      calculatedAsOf,
      reason: "source_incomplete" as const,
      evidenceFingerprints: [],
    })),
  });
}

function parseActivitySegments(
  summaries: readonly SegmentDerivedSummary[],
  calculationAsOf: string,
): ActivityContribution | null {
  if (summaries.length === 0) return null;
  const observationQuantification = createObservationQuantificationBundle({
    members: summaries.flatMap((summary) => summary.observationQuantification.members),
    summaryScope: "components",
  });
  const aggregate = observationQuantification.summary;
  const calculationCutoff = Date.parse(calculationAsOf);
  if (
    aggregate.commonLoad.status !== "complete" ||
    observationQuantification.members.some((member) => {
      const computedAt = member.calculationIdentity.computedAt;
      return computedAt === null || Date.parse(computedAt) > calculationCutoff;
    })
  ) {
    return null;
  }
  return {
    observationQuantification,
    fingerprint: fingerprint([
      "activity-contribution",
      aggregate.subjectIdentity.fingerprint,
      aggregate.evidenceIdentity.fingerprint,
      aggregate.calculationIdentity.fingerprint,
    ]),
  };
}

export function buildCommonLoadHistoryObservations(input: {
  activities: ActivityIdentity[];
  calculatedAsOf: string;
  evidenceScopeFingerprint: string;
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
    summariesByActivity.set(
      summary.activity_id,
      [...(summariesByActivity.get(summary.activity_id) ?? []), summary].sort((left, right) =>
        left.segment_id.localeCompare(right.segment_id),
      ),
    );
  }
  const activitiesByDate = new Map<string, ActivityIdentity[]>();
  for (const activity of [...input.activities].sort(
    (left, right) =>
      left.started_at.getTime() - right.started_at.getTime() || left.id.localeCompare(right.id),
  )) {
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
        calculatedAsOf: input.calculatedAsOf,
        coverageStatus,
        evidenceFingerprints: [
          fingerprint(["complete-bounded-read", input.evidenceScopeFingerprint, date]),
        ],
      };
    }

    const activitySegmentResults = dailyActivities.map((activity) =>
      parseActivitySegments(summariesByActivity.get(activity.id) ?? [], input.calculatedAsOf),
    );
    if (activitySegmentResults.some((result) => result === null)) {
      return {
        state: "unavailable",
        date,
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        calculatedAsOf: input.calculatedAsOf,
        coverageStatus,
        reason: "common_load_unavailable",
        evidenceFingerprints: [],
      };
    }
    const quantifiedContributions = activitySegmentResults.flatMap((contribution) =>
      contribution === null ? [] : [contribution],
    );
    createObservationQuantificationBundle({
      members: quantifiedContributions.flatMap(
        (contribution) => contribution.observationQuantification.members,
      ),
    });
    const aggregate = aggregateCommonLoadEnvelopes(
      quantifiedContributions.map(
        (contribution) => contribution.observationQuantification.summary.commonLoad,
      ),
    );
    if (aggregate.status === "unavailable") {
      return {
        state: "unavailable",
        date,
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        calculatedAsOf: input.calculatedAsOf,
        reason: "common_load_unavailable",
        coverageStatus,
        evidenceFingerprints: quantifiedContributions
          .map((contribution) => contribution.fingerprint)
          .sort(),
      };
    }
    return {
      state: "observed",
      date,
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      calculatedAsOf: input.calculatedAsOf,
      coverageStatus,
      aggregate: {
        ...aggregate,
      },
      evidenceFingerprints: quantifiedContributions
        .map((contribution) => contribution.fingerprint)
        .sort(),
    };
  });
}

export async function getCommonLoadHistory(input: {
  asOf: Date;
  db: Db;
  profileId: string;
  currentPlanningDate: string;
  planningTimezone: string;
}): Promise<CommonLoadHistoryResult> {
  const calculatedAsOf = input.asOf.toISOString();
  // Read the full maturity horizon; Core returns only the latest 84 chart points.
  const dates = datesForWindow(input.currentPlanningDate, COMMON_LOAD_HISTORY_MATURE_DAYS);
  const startDate = dates[0];
  const endDate = dates.at(-1);
  if (!startDate || !endDate) return unavailableWindow(input);
  const evidenceScopeFingerprint = fingerprint([
    "completed-activity-history-scope",
    input.profileId,
    input.planningTimezone,
    startDate,
    endDate,
    calculatedAsOf,
  ]);

  const envelopeStart = new Date(`${startDate}T00:00:00.000Z`);
  envelopeStart.setUTCDate(envelopeStart.getUTCDate() - 1);
  const envelopeEnd = new Date(`${input.currentPlanningDate}T00:00:00.000Z`);
  envelopeEnd.setUTCDate(envelopeEnd.getUTCDate() + 2);

  try {
    return await input.db.transaction(
      async (tx) => {
        const sourceCoverageComplete = await hasCompleteActivitySourceCoverage(tx, {
          asOf: input.asOf,
          endDate,
          planningTimezone: input.planningTimezone,
          profileId: input.profileId,
          startDate,
        });
        if (!sourceCoverageComplete) return unavailableWindow(input);
        const activityRows = await tx
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.profile_id, input.profileId),
              gte(activities.started_at, envelopeStart),
              lt(activities.started_at, envelopeEnd),
              lt(activities.started_at, input.asOf),
            ),
          )
          .orderBy(asc(activities.started_at), asc(activities.id))
          .limit(commonLoadHistoryActivityLimit + 1);
        if (activityRows.length > commonLoadHistoryActivityLimit) return unavailableWindow(input);

        const windowActivityRows = activityRows.filter((activity) => {
          const date = localDate(activity.started_at, input.planningTimezone);
          return activity.started_at < input.asOf && date >= startDate && date <= endDate;
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
          computedAsOf: input.asOf,
        });
        return replayCommonLoadHistory({
          basis: COMMON_LOAD_HISTORY_BASIS,
          calculationIdentity: {
            model: COMMON_LOAD_HISTORY_CALCULATION_MODEL,
            version: COMMON_LOAD_HISTORY_CALCULATION_VERSION,
            asOf: calculatedAsOf,
          },
          currentPlanningDate: input.currentPlanningDate,
          planningTimezone: input.planningTimezone,
          observations: buildCommonLoadHistoryObservations({
            activities: windowActivityRows,
            calculatedAsOf,
            segmentSummaries,
            currentPlanningDate: input.currentPlanningDate,
            evidenceScopeFingerprint,
            planningTimezone: input.planningTimezone,
            coverageStatus: "complete",
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
