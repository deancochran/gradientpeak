import {
  type ActivityListDerivedSummary,
  analyzeActivityDerivedMetrics,
  segmentSummarySchemaV1,
} from "@repo/core";
import {
  type ActivityRow,
  type ActivitySegmentRow,
  activitySegments,
  type DrizzleDbClient,
} from "@repo/db";
import { asc, inArray } from "drizzle-orm";
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
  db: DrizzleDbClient,
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

function contextRequestKey(input: { asOf: Date; profileId: string }): string {
  return `${input.profileId}\u0000${input.asOf.toISOString()}`;
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
}): Promise<SegmentDerivedSummary[]> {
  const { store, profileId, activities } = input;
  if (activities.length === 0) return [];
  const requests = activities.map((activity) => ({
    asOf: activity.started_at,
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

  const output: SegmentDerivedSummary[] = [];
  for (const activity of activities) {
    const evidence = (store.loadContextEvidence
      ? evidenceByProfileId.get(activity.profile_id)
      : evidenceByRequest.get(
          contextRequestKey({ asOf: activity.started_at, profileId: activity.profile_id }),
        )) ?? {
      profile: { dob: null, gender: null },
      profileMetrics: [],
      recentEfforts: [],
    };
    const context = resolveActivityContextFromEvidence({
      evidence,
      activityTimestamp: activity.started_at,
      activityId: activity.id,
    });
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
          computed_as_of: startedAt.toISOString(),
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
          computed_as_of: startedAt.toISOString(),
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
          normalized_power: null,
          normalized_speed_mps: null,
          normalized_graded_speed_mps: null,
        },
        context,
      });
      const compact: ActivityListDerivedSummary = {
        tss: derived.stress.tss,
        tss_identity: derived.stress.tss_identity,
        intensity_factor: derived.stress.intensity_factor,
        method: derived.stress.method,
        unavailable_reason: derived.stress.unavailable_reason,
        calibration_quality: derived.stress.calibration_quality,
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

/** Parent summaries exist only when every load-bearing segment belongs to one compatible stream. */
export async function buildActivityDerivedSummaryMap(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivityWithSegments[];
}): Promise<Map<string, ActivityListDerivedSummary>> {
  const segments = await buildActivitySegmentDerivedSummaries(input);
  return buildParentDerivedSummaryMap(input.activities, segments);
}

function buildParentDerivedSummaryMap(
  activities: ActivityWithSegments[],
  segments: SegmentDerivedSummary[],
): Map<string, ActivityListDerivedSummary> {
  const result = new Map<string, ActivityListDerivedSummary>();
  for (const segment of segments) result.set(segment.segment_id, segment);
  for (const activity of activities) {
    const parts = segments.filter((segment) => segment.activity_id === activity.id);
    const available = parts.filter(
      (part) => part.tss !== null && part.tss_identity !== null && part.load_stream_key !== null,
    );
    if (parts.length !== 1 || available.length !== 1) continue;
    const first = available[0];
    if (!first) continue;
    result.set(activity.id, {
      ...first,
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
  const byDate = new Map<string, number>();
  const streamKeys = new Set<string>();
  let complete = true;
  for (const summary of segmentSummaries) {
    if (summary.tss === null || !summary.load_stream_key) {
      complete = false;
      continue;
    }
    streamKeys.add(summary.load_stream_key);
    const activity = input.activities.find((candidate) => candidate.id === summary.activity_id);
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
