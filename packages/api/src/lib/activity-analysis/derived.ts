import {
  type ActivityListDerivedSummary,
  aggregateCommonLoad,
  analyzeActivityDerivedMetrics,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  commonLoadResultSchema,
  segmentSummarySchemaV1,
} from "@repo/core";
import { type ActivityRow, type ActivitySegmentRow, activitySegments } from "@repo/db";
import { asc, inArray } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../../db";
import type { ActivityAnalysisStore } from "../../repositories";
import { resolveActivityContextFromEvidence } from "./context";

export type ActivitySegmentReadRow = Pick<
  ActivitySegmentRow,
  | "id"
  | "activity_id"
  | "ordinal"
  | "role"
  | "category"
  | "start_offset_ms"
  | "end_offset_ms"
  | "timing_coverage"
  | "active_ms"
  | "moving_ms"
  | "summary"
>;

export type ActivityWithSegments = Pick<
  ActivityRow,
  | "id"
  | "profile_id"
  | "started_at"
  | "finished_at"
  | "elapsed_ms"
  | "active_ms"
  | "moving_ms"
  | "timing_coverage"
  | "distance_meters"
  | "avg_heart_rate"
  | "max_heart_rate"
> & { segments: ActivitySegmentReadRow[] };

export type SegmentDerivedSummary = ActivityListDerivedSummary & {
  activity_id: string;
  segment_id: string;
  category: NonNullable<ActivitySegmentReadRow["category"]>;
  dedupe_key: string;
  load_stream_key: string | null;
};

export function summarizeSegmentTss(
  summaries: readonly SegmentDerivedSummary[],
  activityIds: ReadonlySet<string>,
): { tss: number; complete: boolean } {
  const selected = summaries.filter((summary) => activityIds.has(summary.activity_id));
  const representedActivityIds = new Set(selected.map((summary) => summary.activity_id));
  return {
    tss: selected.reduce((total, summary) => total + (summary.tss ?? 0), 0),
    complete:
      representedActivityIds.size === activityIds.size &&
      selected.every((summary) => summary.tss !== null),
  };
}

export function orderedActivitySegments(segments: readonly ActivitySegmentReadRow[]) {
  return segments
    .filter(
      (
        segment,
      ): segment is ActivitySegmentReadRow & {
        category: NonNullable<ActivitySegmentReadRow["category"]>;
      } => segment.role === "activity" && segment.category !== null,
    )
    .sort((left, right) => left.ordinal - right.ordinal);
}

export function deriveActivityParentClassification(segments: readonly ActivitySegmentReadRow[]) {
  const categories = orderedActivitySegments(segments).map((segment) => segment.category);
  return {
    kind:
      categories.length === 0
        ? ("unknown" as const)
        : categories.length === 1
          ? ("single" as const)
          : ("multisport" as const),
    categories,
    category: categories.length === 1 ? (categories[0] ?? null) : null,
  };
}

function millisecondsToSeconds(value: number | null): number | null {
  return value === null ? null : value / 1_000;
}

export function deriveActivityDurations(
  activity: Pick<ActivityRow, "elapsed_ms" | "active_ms" | "moving_ms" | "timing_coverage">,
) {
  return {
    elapsed_seconds: activity.elapsed_ms / 1_000,
    active_seconds:
      activity.timing_coverage === "unavailable" ? null : millisecondsToSeconds(activity.active_ms),
    moving_seconds:
      activity.timing_coverage === "unavailable" ? null : millisecondsToSeconds(activity.moving_ms),
  };
}

export async function loadActivitySegmentsByActivityId(
  db: DrizzleQueryExecutor,
  activityIds: readonly string[],
): Promise<Map<string, ActivitySegmentReadRow[]>> {
  if (activityIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: activitySegments.id,
      activity_id: activitySegments.activity_id,
      ordinal: activitySegments.ordinal,
      role: activitySegments.role,
      category: activitySegments.category,
      start_offset_ms: activitySegments.start_offset_ms,
      end_offset_ms: activitySegments.end_offset_ms,
      timing_coverage: activitySegments.timing_coverage,
      active_ms: activitySegments.active_ms,
      moving_ms: activitySegments.moving_ms,
      summary: activitySegments.summary,
    })
    .from(activitySegments)
    .where(inArray(activitySegments.activity_id, [...activityIds]))
    .orderBy(asc(activitySegments.activity_id), asc(activitySegments.ordinal));
  const byActivityId = new Map<string, ActivitySegmentReadRow[]>();
  for (const row of rows) {
    byActivityId.set(row.activity_id, [...(byActivityId.get(row.activity_id) ?? []), row]);
  }
  return byActivityId;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function contextRequestKey(input: {
  asOf: Date;
  effortLookbackAsOf?: Date;
  profileId: string;
}): string {
  return `${input.profileId}\u0000${input.asOf.toISOString()}\u0000${input.effortLookbackAsOf?.toISOString() ?? ""}`;
}

function streamKey(summary: ActivityListDerivedSummary): string | null {
  const identity = summary.tss_identity;
  return identity
    ? `${identity.sport}:${identity.method}:${identity.source}:${identity.version}`
    : null;
}

export async function buildActivitySegmentDerivedSummaries(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivityWithSegments[];
  computedAsOf?: Date;
}): Promise<SegmentDerivedSummary[]> {
  const { store, profileId, activities } = input;
  const computedAsOf = (input.computedAsOf ?? new Date()).toISOString();
  if (activities.length === 0) return [];
  const requests = activities.map((activity) => ({
    asOf: activity.started_at,
    effortLookbackAsOf: activity.started_at,
    profileId: activity.profile_id ?? profileId,
  }));
  let evidenceByProfileId = new Map<
    string,
    Awaited<ReturnType<ActivityAnalysisStore["getContextSnapshot"]>>
  >();
  const evidenceByRequest = new Map<
    string,
    Awaited<ReturnType<ActivityAnalysisStore["getContextSnapshot"]>>
  >();
  if (store.loadContextEvidence) {
    evidenceByProfileId = await store.loadContextEvidence({ requests });
  } else {
    const snapshots = await Promise.all(
      requests.map((request) => store.getContextSnapshot(request)),
    );
    requests.forEach((request, index) => {
      const snapshot = snapshots[index];
      if (snapshot) evidenceByRequest.set(contextRequestKey(request), snapshot);
    });
  }

  const sessionRpeByActivityId = store.loadEffectiveSessionRpeEvidence
    ? await store.loadEffectiveSessionRpeEvidence({
        activityIds: activities.map((activity) => activity.id),
        profileId,
      })
    : new Map();

  const output: SegmentDerivedSummary[] = [];
  for (const activity of activities) {
    const evidence = (store.loadContextEvidence
      ? evidenceByProfileId.get(activity.profile_id)
      : evidenceByRequest.get(
          contextRequestKey({
            asOf: activity.started_at,
            effortLookbackAsOf: activity.started_at,
            profileId: activity.profile_id,
          }),
        )) ?? {
      profile: { dob: null, gender: null },
      profileMetrics: [],
      recentEfforts: [],
    };
    const resolvedContext = resolveActivityContextFromEvidence({
      evidence,
      activityTimestamp: activity.started_at,
      activityId: activity.id,
    });
    const sessionRpe = sessionRpeByActivityId.get(activity.id);
    const context = {
      ...resolvedContext,
      sessionRpeEvidence: sessionRpe
        ? {
            rpe: sessionRpe.rpe,
            scale: sessionRpe.scale,
            scaleVersion: sessionRpe.scaleVersion,
            source: sessionRpe.source,
            recordedAt: sessionRpe.recordedAt.toISOString(),
            provenanceFingerprint: sessionRpe.provenanceFingerprint,
          }
        : null,
    };
    for (const segment of orderedActivitySegments(activity.segments)) {
      const summary = segmentSummarySchemaV1.parse(segment.summary);
      const timing = summary.timing;
      const startedAt = new Date(activity.started_at.getTime() + segment.start_offset_ms);
      if (timing.timingCoverage === "unavailable") {
        output.push({
          activity_id: activity.id,
          segment_id: segment.id,
          category: segment.category,
          tss: null,
          tss_identity: null,
          intensity_factor: null,
          method: null,
          unavailable_reason: "activity_data_missing",
          calibration_quality: null,
          common_load: commonLoadResultSchema.parse({
            status: "unavailable",
            model: COMMON_RELATIVE_LOAD_MODEL,
            version: COMMON_RELATIVE_LOAD_VERSION,
            sport: segment.category,
            method: null,
            quality: null,
            thresholdEvidence: null,
            sessionRpeEvidence: null,
            evidenceFingerprint: null,
            computedAsOf,
            contributingDurationSeconds: null,
            reason: "duration_missing",
          }),
          computed_as_of: computedAsOf,
          dedupe_key: `activity-segment:${activity.id}:${segment.id}:load:v1`,
          load_stream_key: null,
        });
        continue;
      }
      const durationMs =
        ("activeMs" in timing ? timing.activeMs : undefined) ??
        ("movingMs" in timing ? timing.movingMs : undefined);
      if (durationMs === undefined) {
        output.push({
          activity_id: activity.id,
          segment_id: segment.id,
          category: segment.category,
          tss: null,
          tss_identity: null,
          intensity_factor: null,
          method: null,
          unavailable_reason: "activity_data_missing",
          calibration_quality: null,
          common_load: commonLoadResultSchema.parse({
            status: "unavailable",
            model: COMMON_RELATIVE_LOAD_MODEL,
            version: COMMON_RELATIVE_LOAD_VERSION,
            sport: segment.category,
            method: null,
            quality: null,
            thresholdEvidence: null,
            sessionRpeEvidence: null,
            evidenceFingerprint: null,
            computedAsOf,
            contributingDurationSeconds: null,
            reason: "duration_missing",
          }),
          computed_as_of: computedAsOf,
          dedupe_key: `activity-segment:${activity.id}:${segment.id}:load:v1`,
          load_stream_key: null,
        });
        continue;
      }
      const durationSeconds = durationMs / 1_000;
      const finishedAt = new Date(activity.started_at.getTime() + segment.end_offset_ms);
      const movingMs = "movingMs" in timing ? (timing.movingMs ?? null) : null;
      const derived = analyzeActivityDerivedMetrics({
        activity: {
          id: segment.id,
          type: segment.category,
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          duration_seconds: durationSeconds,
          moving_seconds: movingMs === null ? null : movingMs / 1_000,
          distance_meters: summary.distanceMeters ?? null,
          avg_heart_rate: summary.averageHeartRateBpm ?? null,
          max_heart_rate: null,
          avg_power: summary.averagePowerWatts ?? null,
          max_power: null,
          avg_speed_mps: summary.averageSpeedMetersPerSecond ?? null,
          max_speed_mps: null,
          normalized_power: summary.normalizedPowerWatts ?? null,
          normalized_speed_mps: summary.normalizedSpeedMetersPerSecond ?? null,
          normalized_graded_speed_mps: summary.normalizedGradedSpeedMetersPerSecond ?? null,
        },
        context,
        computedAsOf,
        ...(summary.heartRateDistribution !== undefined
          ? { heartRateDistribution: summary.heartRateDistribution }
          : {}),
      });
      const compact: ActivityListDerivedSummary = {
        tss: derived.stress.tss,
        tss_identity: derived.stress.tss_identity,
        intensity_factor: derived.stress.intensity_factor,
        method: derived.stress.method,
        unavailable_reason: derived.stress.unavailable_reason,
        calibration_quality: derived.stress.calibration_quality,
        common_load: derived.stress.common_load,
        computed_as_of: derived.computed_as_of,
      };
      output.push({
        ...compact,
        activity_id: activity.id,
        segment_id: segment.id,
        category: segment.category,
        dedupe_key: `activity-segment:${activity.id}:${segment.id}:load:v1`,
        load_stream_key: streamKey(compact),
      });
    }
  }
  return output;
}

/** Parent summaries aggregate modern common Load for every represented segment. */
export async function buildActivityDerivedSummaryMap(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivityWithSegments[];
}): Promise<Map<string, ActivityListDerivedSummary>> {
  return (await buildActivityDerivedSummaries(input)).parent;
}

export async function buildActivityDerivedSummaries(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivityWithSegments[];
}): Promise<{
  parent: Map<string, ActivityListDerivedSummary>;
  segments: SegmentDerivedSummary[];
}> {
  const segments = await buildActivitySegmentDerivedSummaries(input);
  return {
    parent: buildParentDerivedSummaryMap(input.activities, segments),
    segments,
  };
}

function buildParentDerivedSummaryMap(
  activities: ActivityWithSegments[],
  segments: SegmentDerivedSummary[],
): Map<string, ActivityListDerivedSummary> {
  const result = new Map<string, ActivityListDerivedSummary>();
  const segmentsByActivityId = new Map<string, SegmentDerivedSummary[]>();
  for (const segment of segments) {
    result.set(segment.segment_id, segment);
    const activitySegments = segmentsByActivityId.get(segment.activity_id);
    if (activitySegments) activitySegments.push(segment);
    else segmentsByActivityId.set(segment.activity_id, [segment]);
  }
  for (const activity of activities) {
    const parts = segmentsByActivityId.get(activity.id) ?? [];
    if (parts.length === 0) continue;
    const commonLoad = aggregateCommonLoad(
      parts.flatMap((part) => {
        const parsed = commonLoadResultSchema.safeParse(part.common_load);
        return parsed.success ? [parsed.data] : [];
      }),
    );
    const first = parts[0];
    if (!first) continue;
    if (parts.length === 1) {
      result.set(activity.id, {
        ...first,
        common_load: commonLoad,
      });
      continue;
    }

    const completeCompatibleLegacyParts = parts.every((part) => {
      const parsedCommonLoad = commonLoadResultSchema.safeParse(part.common_load);
      return (
        part.tss !== null &&
        part.tss_identity !== null &&
        part.intensity_factor !== null &&
        part.method !== null &&
        part.unavailable_reason === null &&
        part.load_stream_key !== null &&
        part.load_stream_key === first.load_stream_key &&
        JSON.stringify(part.tss_identity) === JSON.stringify(first.tss_identity) &&
        JSON.stringify(part.calibration_quality) === JSON.stringify(first.calibration_quality) &&
        parsedCommonLoad.success &&
        parsedCommonLoad.data.status === "available"
      );
    });
    const legacyIntensityFactor =
      completeCompatibleLegacyParts && commonLoad.status === "complete"
        ? Math.round(commonLoad.intensity * 100) / 100
        : null;

    result.set(activity.id, {
      ...first,
      tss:
        completeCompatibleLegacyParts && legacyIntensityFactor !== null
          ? parts.reduce((total, part) => total + (part.tss ?? 0), 0)
          : null,
      tss_identity:
        completeCompatibleLegacyParts && legacyIntensityFactor !== null ? first.tss_identity : null,
      intensity_factor: legacyIntensityFactor,
      method: completeCompatibleLegacyParts && legacyIntensityFactor !== null ? first.method : null,
      unavailable_reason:
        completeCompatibleLegacyParts && legacyIntensityFactor !== null
          ? null
          : "activity_data_missing",
      calibration_quality:
        completeCompatibleLegacyParts && legacyIntensityFactor !== null
          ? first.calibration_quality
          : null,
      common_load: commonLoad,
      computed_as_of: first.computed_as_of,
    });
  }
  return result;
}

export async function buildDynamicStressSeries(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivityWithSegments[];
}) {
  const segmentSummaries = await buildActivitySegmentDerivedSummaries(input);
  const byActivityId = buildParentDerivedSummaryMap(input.activities, segmentSummaries);
  const activitiesById = new Map(input.activities.map((activity) => [activity.id, activity]));
  const byDate = new Map<string, number>();
  const streamKeys = new Set<string>();
  let complete = true;
  for (const summary of segmentSummaries) {
    if (summary.tss === null || !summary.load_stream_key) {
      complete = false;
      continue;
    }
    streamKeys.add(summary.load_stream_key);
    const activity = activitiesById.get(summary.activity_id);
    const date = activity ? toIsoString(activity.started_at).split("T")[0] : undefined;
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + summary.tss);
  }
  const first = segmentSummaries.find((summary) => summary.tss_identity)?.tss_identity ?? null;
  return {
    byActivityId,
    byDate,
    segmentSummaries,
    seriesIdentity: streamKeys.size === 1 ? first : null,
    complete: complete && segmentSummaries.length > 0 && streamKeys.size === 1,
  };
}
