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
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activitySourceReferences,
  integrations,
  providerSyncState,
} from "@repo/db";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { type getRequiredDb, withRepeatableReadSnapshot } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivitySegmentDerivedSummaries,
  loadActivitySegmentsByActivityId,
  type SegmentDerivedSummary,
} from "../../lib/activity-analysis";
import { type ActivitySourceEvidence, resolveActivitySourceIntegrity } from "../../utils/workload";

export const commonLoadHistoryActivityLimit = 10_000;
const strictCoverageTimestampSchema = z.string().datetime({ offset: true });

function parseStrictCoverageTimestamp(value: unknown): number {
  if (typeof value !== "string" || !strictCoverageTimestampSchema.safeParse(value).success) {
    return Number.NaN;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
    value,
  );
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute, second, fraction, offset] = match;
  if (!offset) return Number.NaN;
  const offsetMinutes =
    offset === "Z" ? 0 : Number(offset.slice(0, 3)) * 60 + Number(offset.slice(4));
  const milliseconds = fraction ? Number(`0${fraction}`) * 1000 : 0;
  const localTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp === localTime - offsetMinutes * 60_000
    ? timestamp
    : Number.NaN;
}

type Db = ReturnType<typeof getRequiredDb>;
type ActivityIdentity = { id: string; started_at: Date; sourceEvidence?: ActivitySourceEvidence };
type ActivityContribution = {
  coverageStatus: "complete" | "partial";
  observationQuantification: ActivityObservationQuantificationBundle | null;
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
  const relevant = integrationRows.filter(
    (integration) =>
      integration.provider === "wahoo" &&
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
    const coverageStart = parseStrictCoverageTimestamp(coverageStartValue);
    const coverageEnd = parseStrictCoverageTimestamp(coverageEndValue);
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
  sourceEvidence: ActivitySourceEvidence | undefined,
): ActivityContribution | null {
  if (!sourceEvidence) return null;
  if (summaries.length === 0) {
    if (
      resolveActivitySourceIntegrity({
        evidence: sourceEvidence,
        observationQuantification: null,
      }) !== "trusted"
    ) {
      return null;
    }
    return {
      coverageStatus: "partial",
      observationQuantification: null,
      fingerprint: fingerprint([
        "trusted-unquantified-activity-contribution",
        ...[...sourceEvidence.currentArtifactIds].sort(),
        ...sourceEvidence.providerReferences
          .map((reference) => `${reference.provider}:${reference.externalId}`)
          .sort(),
      ]),
    };
  }
  const observationQuantification = createObservationQuantificationBundle({
    members: summaries.flatMap((summary) => summary.observationQuantification.members),
    summaryScope: "components",
  });
  if (
    resolveActivitySourceIntegrity({
      evidence: sourceEvidence,
      observationQuantification,
    }) !== "trusted"
  ) {
    return null;
  }
  const aggregate = observationQuantification.summary;
  const calculationCutoff = Date.parse(calculationAsOf);
  if (
    observationQuantification.members.some((member) => {
      const computedAt = member.calculationIdentity.computedAt;
      return computedAt === null || Date.parse(computedAt) > calculationCutoff;
    })
  ) {
    return null;
  }
  return {
    coverageStatus: aggregate.commonLoad.status === "complete" ? "complete" : "partial",
    observationQuantification,
    fingerprint: fingerprint([
      aggregate.commonLoad.status === "complete"
        ? "quantified-activity-contribution"
        : "known-zero-activity-contribution",
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
      parseActivitySegments(
        summariesByActivity.get(activity.id) ?? [],
        input.calculatedAsOf,
        activity.sourceEvidence,
      ),
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
    const contributions = activitySegmentResults.flatMap((contribution) =>
      contribution === null ? [] : [contribution],
    );
    const quantifiedContributions = contributions.filter(
      (
        contribution,
      ): contribution is ActivityContribution & {
        observationQuantification: ActivityObservationQuantificationBundle;
      } =>
        contribution.coverageStatus === "complete" &&
        contribution.observationQuantification !== null,
    );
    const dailyCoverageStatus = contributions.some(
      (contribution) => contribution.coverageStatus === "partial",
    )
      ? "partial"
      : coverageStatus;
    const evidenceFingerprints = contributions
      .map((contribution) => contribution.fingerprint)
      .sort();
    if (quantifiedContributions.length === 0) {
      return {
        state: "known_zero",
        date,
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        calculatedAsOf: input.calculatedAsOf,
        coverageStatus: dailyCoverageStatus,
        evidenceFingerprints,
      };
    }
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
        coverageStatus: dailyCoverageStatus,
        evidenceFingerprints,
      };
    }
    return {
      state: "observed",
      date,
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      calculatedAsOf: input.calculatedAsOf,
      coverageStatus: dailyCoverageStatus,
      aggregate: {
        ...aggregate,
      },
      evidenceFingerprints,
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
    return await withRepeatableReadSnapshot(input.db, async (tx) => {
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

      const activityIds = windowActivityRows.map((activity) => activity.id);
      const currentArtifactRows =
        activityIds.length === 0
          ? []
          : await tx
              .select({
                activityId: activityArtifactLinks.activity_id,
                artifactId: activityArtifactLinks.artifact_id,
              })
              .from(activityArtifactLinks)
              .innerJoin(
                activityArtifacts,
                and(
                  eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
                  eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
                  eq(activityArtifacts.availability, "accepted"),
                ),
              )
              .where(
                and(
                  eq(activityArtifactLinks.profile_id, input.profileId),
                  inArray(activityArtifactLinks.activity_id, activityIds),
                  eq(activityArtifactLinks.role, "source"),
                  eq(activityArtifactLinks.is_current, true),
                ),
              );
      const providerReferenceRows =
        activityIds.length === 0
          ? []
          : await tx
              .select({
                activityId: activitySourceReferences.activity_id,
                provider: activitySourceReferences.provider,
                externalId: activitySourceReferences.provider_external_id,
              })
              .from(activitySourceReferences)
              .where(
                and(
                  eq(activitySourceReferences.profile_id, input.profileId),
                  inArray(activitySourceReferences.activity_id, activityIds),
                ),
              );
      const sourceEvidenceByActivity = new Map<
        string,
        {
          currentArtifactIds: string[];
          providerReferences: Array<{ provider: string; externalId: string }>;
        }
      >();
      const sourceEvidenceFor = (activityId: string) => {
        const existing = sourceEvidenceByActivity.get(activityId);
        if (existing) return existing;
        const created = { currentArtifactIds: [], providerReferences: [] };
        sourceEvidenceByActivity.set(activityId, created);
        return created;
      };
      for (const row of currentArtifactRows) {
        sourceEvidenceFor(row.activityId).currentArtifactIds.push(row.artifactId);
      }
      for (const row of providerReferenceRows) {
        sourceEvidenceFor(row.activityId).providerReferences.push({
          provider: row.provider,
          externalId: row.externalId,
        });
      }
      const sourcedActivityRows = windowActivityRows.map((activity) => ({
        ...activity,
        sourceEvidence: sourceEvidenceByActivity.get(activity.id),
      }));

      const segments = await loadActivitySegmentsByActivityId(tx, activityIds);
      const activitiesWithSegments = sourcedActivityRows.map((activity) => ({
        ...activity,
        segments: segments.get(activity.id) ?? [],
      }));
      const segmentSummaries = await buildActivitySegmentDerivedSummaries({
        store: createActivityAnalysisStore(tx),
        profileId: input.profileId,
        activities: activitiesWithSegments,
        computedAsOf: input.asOf,
      });
      const observations = buildCommonLoadHistoryObservations({
        activities: sourcedActivityRows,
        calculatedAsOf,
        segmentSummaries,
        currentPlanningDate: input.currentPlanningDate,
        evidenceScopeFingerprint,
        planningTimezone: input.planningTimezone,
        coverageStatus: "complete",
        replayDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
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
        // Core's current replay output only admits complete days. These partial
        // markers describe known activities whose accepted numeric contribution
        // is zero, not incomplete provider/source history; their evidence remains
        // in the replay identity while quantified contributions stay unchanged.
        observations: observations.map((observation) =>
          observation.coverageStatus === "partial"
            ? { ...observation, coverageStatus: "complete" as const }
            : observation,
        ),
      });
    });
  } catch {
    return unavailableWindow(input);
  }
}
