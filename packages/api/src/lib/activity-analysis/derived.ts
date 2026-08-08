import {
  type ActivityListDerivedSummary,
  type ActivityObservationQuantification,
  type ActivityObservationQuantificationBundle,
  type ActivitySummaryForAnalysis,
  type AthletePerformanceTargetFacts,
  analyzeActivityDerivedMetrics,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
  commonLoadResultSchema,
  completedSegmentSummarySchema,
  createObservationQuantificationBundle,
  type LoadSeriesIdentity,
  loadSeriesIdentityForAvailableCommonLoad,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { type ActivityRow, type ActivitySegmentRow, activitySegments } from "@repo/db";
import { asc, inArray } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../../db";
import {
  ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_REQUEST_LIMIT,
  type ActivityAnalysisContextEvidenceRequest,
  type ActivityAnalysisContextSnapshot,
  type ActivityAnalysisEffortSnapshot,
  type ActivityAnalysisMetricSnapshot,
  type ActivityAnalysisStore,
} from "../../repositories";

// The store turns each request into a correlated SQL predicate. Keep individual
// statements well below its 525-request safety ceiling so long planning windows
// do not create an unplannable OR expression.
const ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_QUERY_WINDOW_LIMIT = 32;

import { resolveActivityContextFromEvidence } from "./context";

export type ActivitySegmentReadRow = Pick<
  ActivitySegmentRow,
  | "id"
  | "activity_id"
  | "ordinal"
  | "role"
  | "activity_category"
  | "start_offset_ms"
  | "end_offset_ms"
  | "timing_coverage"
  | "active_ms"
  | "moving_ms"
  | "summary"
> &
  Partial<
    Pick<
      ActivitySegmentRow,
      | "source_artifact_id"
      | "source_session_index"
      | "source_message_index"
      | "raw_type_string"
      | "raw_type_integer"
      | "raw_sport_string"
      | "raw_sport_integer"
      | "raw_sub_sport_string"
      | "raw_sub_sport_integer"
      | "summary_version"
      | "segment_revision"
      | "parser_version"
      | "materializer_version"
    >
  >;

export type ActivitySegmentDomainReadRow = Omit<ActivitySegmentReadRow, "summary"> & {
  summary: ReturnType<typeof completedSegmentSummarySchema.parse>;
};

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
> &
  Partial<
    Pick<
      ActivityRow,
      | "canonical_evidence_tier"
      | "segments_revision"
      | "parser_version"
      | "decoded_contract_version"
      | "materializer_version"
    >
  > & { segments: ActivitySegmentReadRow[] };

export type SegmentDerivedSummary = ActivityListDerivedSummary & {
  activity_id: string;
  segment_id: string;
  activity_category: NonNullable<ActivitySegmentReadRow["activity_category"]>;
  observationQuantification: ActivityObservationQuantificationBundle;
  dedupe_key: string;
  load_stream_key: string | null;
};

export type ActivityQuantifiedDerivedSummary = ActivityListDerivedSummary & {
  observationQuantification: ActivityObservationQuantificationBundle;
};

/** Minimal completed-observation handoff for consumers that only own load-series policy. */
export type CanonicalCompletedObservationLoadProjection = {
  /** The activity-role segment identity used by downstream activity models. */
  activityId: string;
  commonLoad: CommonLoadResult;
  loadSeriesIdentity: LoadSeriesIdentity | null;
};

export function summarizeSegmentQuantification(
  summaries: readonly SegmentDerivedSummary[],
  activityIds: ReadonlySet<string>,
) {
  return createObservationQuantificationBundle({
    members: summaries
      .filter((summary) => activityIds.has(summary.activity_id))
      .flatMap((summary) => summary.observationQuantification.members),
  });
}

export function projectCanonicalCompletedObservationLoads(
  summaries: readonly SegmentDerivedSummary[],
): CanonicalCompletedObservationLoadProjection[] {
  // Validation is deliberately performed before projection so duplicate subject
  // delivery is rejected by Core rather than hidden by a downstream keyed map.
  if (summaries.length > 0) {
    createObservationQuantificationBundle({
      members: summaries.flatMap((summary) => summary.observationQuantification.members),
    });
  }
  return summaries.map((summary) => {
    const quantification = singleSegmentObservation(summary);
    const commonLoad = quantification.commonLoad;
    return {
      activityId: summary.segment_id,
      commonLoad,
      loadSeriesIdentity:
        commonLoad.status === "available"
          ? loadSeriesIdentityForAvailableCommonLoad(commonLoad)
          : null,
    };
  });
}

function singleSegmentObservation(
  summary: SegmentDerivedSummary,
): ActivityObservationQuantification {
  const quantification = summary.observationQuantification.members[0];
  if (!quantification || summary.observationQuantification.members.length !== 1) {
    throw new Error("A segment derived summary must contain exactly one observation");
  }
  return quantification;
}

export function summarizeSegmentCommonLoad(
  summaries: readonly SegmentDerivedSummary[],
  activityIds: ReadonlySet<string>,
) {
  return summarizeSegmentQuantification(summaries, activityIds).summary.commonLoad;
}

export function orderedActivitySegments(segments: readonly ActivitySegmentReadRow[]) {
  return segments
    .filter(
      (
        segment,
      ): segment is ActivitySegmentReadRow & {
        activity_category: NonNullable<ActivitySegmentReadRow["activity_category"]>;
      } => segment.role === "activity" && segment.activity_category !== null,
    )
    .sort((left, right) => left.ordinal - right.ordinal);
}

export function deriveActivityParentClassification(segments: readonly ActivitySegmentReadRow[]) {
  const categories = orderedActivitySegments(segments).map((segment) => segment.activity_category);
  return {
    kind:
      categories.length === 0
        ? ("unknown" as const)
        : categories.length === 1
          ? ("single" as const)
          : ("multisport" as const),
    categories,
    activity_category: categories.length === 1 ? (categories[0] ?? null) : null,
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
): Promise<Map<string, ActivitySegmentDomainReadRow[]>> {
  if (activityIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: activitySegments.id,
      activity_id: activitySegments.activity_id,
      ordinal: activitySegments.ordinal,
      role: activitySegments.role,
      activity_category: activitySegments.activity_category,
      start_offset_ms: activitySegments.start_offset_ms,
      end_offset_ms: activitySegments.end_offset_ms,
      source_artifact_id: activitySegments.source_artifact_id,
      source_session_index: activitySegments.source_session_index,
      source_message_index: activitySegments.source_message_index,
      raw_type_string: activitySegments.raw_type_string,
      raw_type_integer: activitySegments.raw_type_integer,
      raw_sport_string: activitySegments.raw_sport_string,
      raw_sport_integer: activitySegments.raw_sport_integer,
      raw_sub_sport_string: activitySegments.raw_sub_sport_string,
      raw_sub_sport_integer: activitySegments.raw_sub_sport_integer,
      timing_coverage: activitySegments.timing_coverage,
      active_ms: activitySegments.active_ms,
      moving_ms: activitySegments.moving_ms,
      summary: activitySegments.summary,
      summary_version: activitySegments.summary_version,
      segment_revision: activitySegments.segment_revision,
      parser_version: activitySegments.parser_version,
      materializer_version: activitySegments.materializer_version,
    })
    .from(activitySegments)
    .where(inArray(activitySegments.activity_id, [...activityIds]))
    .orderBy(asc(activitySegments.activity_id), asc(activitySegments.ordinal));
  const byActivityId = new Map<string, ActivitySegmentDomainReadRow[]>();
  for (const row of rows) {
    const parsedRow: ActivitySegmentDomainReadRow = {
      ...row,
      summary: completedSegmentSummarySchema.parse(row.summary),
    };
    byActivityId.set(row.activity_id, [...(byActivityId.get(row.activity_id) ?? []), parsedRow]);
  }
  return byActivityId;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function contextRequestKey(input: ActivityAnalysisContextEvidenceRequest): string {
  return `${input.profileId}\u0000${input.asOf.toISOString()}\u0000${input.effortLookbackAsOf?.toISOString() ?? ""}\u0000${input.activityIdToExclude ?? ""}`;
}

export class DuplicateActivityAnalysisContextRequestError extends Error {
  readonly requestKey: string;

  constructor(requestKey: string) {
    super(`Duplicate activity analysis context request: ${requestKey}`);
    this.name = DuplicateActivityAnalysisContextRequestError.name;
    this.requestKey = requestKey;
  }
}

function rejectDuplicateContextRequests(
  requests: readonly ActivityAnalysisContextEvidenceRequest[],
): void {
  const seen = new Set<string>();
  for (const request of requests) {
    const key = contextRequestKey(request);
    if (seen.has(key)) throw new DuplicateActivityAnalysisContextRequestError(key);
    seen.add(key);
  }
}

function metricEvidenceKey(metric: ActivityAnalysisMetricSnapshot): string {
  return (
    metric.id ??
    [
      metric.metric_type,
      metric.recorded_at.toISOString(),
      metric.unit,
      metric.value,
      metric.reference_activity_id ?? "",
      metric.reference_activity_category ?? "",
      metric.source ?? "",
      metric.method ?? "",
      metric.calculation_version ?? "",
    ].join("\u0000")
  );
}

function effortEvidenceKey(effort: ActivityAnalysisEffortSnapshot): string {
  return (
    effort.id ??
    [
      effort.activity_id ?? "",
      effort.activity_category,
      effort.effort_type,
      effort.duration_seconds,
      effort.recorded_at.toISOString(),
      effort.unit,
      effort.value,
      effort.source ?? "",
      effort.method ?? "",
      effort.calculation_version ?? "",
    ].join("\u0000")
  );
}

function mergeUniqueEvidence<T>(
  current: readonly T[],
  incoming: readonly T[],
  keyFor: (value: T) => string,
): T[] {
  const merged = new Map(current.map((value) => [keyFor(value), value]));
  for (const value of incoming) merged.set(keyFor(value), value);
  return [...merged.values()];
}

function mergeContextEvidence(
  current: ActivityAnalysisContextSnapshot | undefined,
  incoming: ActivityAnalysisContextSnapshot,
): ActivityAnalysisContextSnapshot {
  if (!current) {
    return {
      profile: incoming.profile,
      profileMetrics: [...incoming.profileMetrics],
      recentEfforts: [...incoming.recentEfforts],
      ...(incoming.calibrationTruncated === true ? { calibrationTruncated: true } : {}),
    };
  }
  return {
    profile: current.profile,
    profileMetrics: mergeUniqueEvidence(
      current.profileMetrics,
      incoming.profileMetrics,
      metricEvidenceKey,
    ),
    recentEfforts: mergeUniqueEvidence(
      current.recentEfforts,
      incoming.recentEfforts,
      effortEvidenceKey,
    ),
    ...(current.calibrationTruncated === true || incoming.calibrationTruncated === true
      ? { calibrationTruncated: true }
      : {}),
  };
}

async function loadBatchedContextEvidence(input: {
  load: NonNullable<ActivityAnalysisStore["loadContextEvidence"]>;
  requests: ActivityAnalysisContextEvidenceRequest[];
}): Promise<Map<string, ActivityAnalysisContextSnapshot>> {
  const evidenceByProfileId = new Map<string, ActivityAnalysisContextSnapshot>();
  for (
    let offset = 0;
    offset < input.requests.length;
    offset += ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_QUERY_WINDOW_LIMIT
  ) {
    const requests = input.requests.slice(
      offset,
      offset + ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_QUERY_WINDOW_LIMIT,
    );
    const batch = await input.load({ requests });
    const profileIds = new Set(requests.map((request) => request.profileId));
    for (const profileId of profileIds) {
      const evidence = batch.get(profileId);
      if (evidence) {
        evidenceByProfileId.set(
          profileId,
          mergeContextEvidence(evidenceByProfileId.get(profileId), evidence),
        );
        continue;
      }
      const current = evidenceByProfileId.get(profileId);
      evidenceByProfileId.set(profileId, {
        profile: current?.profile ?? { dob: null, gender: null },
        profileMetrics: current?.profileMetrics ?? [],
        recentEfforts: current?.recentEfforts ?? [],
        calibrationTruncated: true,
      });
    }
  }
  return evidenceByProfileId;
}

async function loadBatchedPerformanceTargets(input: {
  load: NonNullable<ActivityAnalysisStore["getPerformanceTargetsForRequests"]>;
  requests: ActivityAnalysisContextEvidenceRequest[];
}): Promise<Map<string, AthletePerformanceTargetFacts>> {
  const targetsByRequest = new Map<string, AthletePerformanceTargetFacts>();
  for (
    let offset = 0;
    offset < input.requests.length;
    offset += ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_REQUEST_LIMIT
  ) {
    const requests = input.requests.slice(
      offset,
      offset + ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_REQUEST_LIMIT,
    );
    const targets = await input.load({
      requests: requests.map((request) => ({
        asOf: request.asOf,
        profileId: request.profileId,
        ...(request.activityIdToExclude === undefined
          ? {}
          : { activityIdToExclude: request.activityIdToExclude }),
      })),
    });
    if (targets.length !== requests.length) {
      throw new Error("Performance-target batch returned an invalid result count");
    }
    requests.forEach((request, index) => {
      const targetFacts = targets[index];
      if (targetFacts) targetsByRequest.set(contextRequestKey(request), targetFacts);
    });
  }
  return targetsByRequest;
}

function streamKey(summary: ActivityListDerivedSummary): string | null {
  const envelope = summary.common_load;
  if (envelope.status !== "available" && envelope.status !== "complete") return null;
  return `${"activity_category" in envelope ? envelope.activity_category : "aggregate"}:${envelope.model}:${envelope.version}`;
}

function rawSourceValue(
  stringValue: string | null | undefined,
  integerValue: number | null | undefined,
): string | number | null {
  return stringValue ?? integerValue ?? null;
}

function positiveObservation(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

function nonnegativeObservation(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function resolveVersionedHeartRateDurationSeconds(input: {
  segment: Pick<ActivitySegmentReadRow, "start_offset_ms" | "end_offset_ms">;
  summary: ReturnType<typeof completedSegmentSummarySchema.parse>;
}): number | null {
  const distribution = input.summary.heartRateDistribution;
  if (
    distribution === undefined ||
    !("calculationVersion" in distribution) ||
    distribution.status === "unavailable"
  ) {
    return null;
  }

  const elapsedSeconds = (input.segment.end_offset_ms - input.segment.start_offset_ms) / 1_000;
  const eligibleDurationSeconds = distribution.eligibleDurationSeconds;
  const tolerance = Number.EPSILON * Math.max(1, elapsedSeconds) * 16;
  return Number.isFinite(elapsedSeconds) &&
    elapsedSeconds > 0 &&
    eligibleDurationSeconds > 0 &&
    eligibleDurationSeconds <= elapsedSeconds + tolerance
    ? eligibleDurationSeconds
    : null;
}

export function buildCompletedSegmentAnalysisActivity(input: {
  activityStartedAt: Date;
  segment: ActivitySegmentReadRow & {
    activity_category: NonNullable<ActivitySegmentReadRow["activity_category"]>;
  };
  summary: ReturnType<typeof completedSegmentSummarySchema.parse>;
}): ActivitySummaryForAnalysis {
  const timing = input.summary.timing;
  const durationMs =
    ("activeMs" in timing ? timing.activeMs : undefined) ??
    ("movingMs" in timing ? timing.movingMs : undefined);
  const heartRateDurationSeconds = resolveVersionedHeartRateDurationSeconds(input);
  let durationSeconds: number;
  if (durationMs !== undefined) {
    durationSeconds = durationMs / 1_000;
  } else if (heartRateDurationSeconds !== null) {
    durationSeconds = heartRateDurationSeconds;
  } else {
    throw new Error("Completed segment analysis requires active or moving duration evidence");
  }
  const startedAt = new Date(input.activityStartedAt.getTime() + input.segment.start_offset_ms);
  const finishedAt = new Date(input.activityStartedAt.getTime() + input.segment.end_offset_ms);
  const movingMs = "movingMs" in timing ? (timing.movingMs ?? null) : null;
  return {
    id: input.segment.id,
    type: input.segment.activity_category,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: durationSeconds,
    elapsed_seconds: (input.segment.end_offset_ms - input.segment.start_offset_ms) / 1_000,
    moving_seconds: movingMs === null ? null : movingMs / 1_000,
    timing_coverage: timing.timingCoverage,
    distance_meters: input.summary.distanceMeters ?? null,
    avg_heart_rate: input.summary.averageHeartRateBpm ?? null,
    max_heart_rate: null,
    avg_power: input.summary.averagePowerWatts ?? null,
    max_power: null,
    avg_speed_mps: input.summary.averageSpeedMetersPerSecond ?? null,
    max_speed_mps: null,
    normalized_power_result: input.summary.normalizedPowerResult,
    normalized_speed_mps: input.summary.normalizedSpeedMetersPerSecond ?? null,
    normalized_graded_pace_result: input.summary.normalizedGradedPaceResult ?? null,
  };
}

function buildSegmentDerivedSummary(input: {
  activity: ActivityWithSegments;
  segment: ActivitySegmentReadRow & {
    activity_category: NonNullable<ActivitySegmentReadRow["activity_category"]>;
  };
  summary: ReturnType<typeof completedSegmentSummarySchema.parse>;
  commonLoad: CommonLoadResult;
  computedAsOf: string;
}): SegmentDerivedSummary {
  const { activity, segment, summary, commonLoad, computedAsOf } = input;
  const summaryVersion = segment.summary_version ?? summary.version;
  const sourceVersionsCompatible =
    (segment.parser_version === undefined ||
      activity.parser_version === undefined ||
      segment.parser_version === activity.parser_version) &&
    (segment.materializer_version === undefined ||
      activity.materializer_version === undefined ||
      segment.materializer_version === activity.materializer_version) &&
    (segment.segment_revision === undefined ||
      activity.segments_revision === undefined ||
      segment.segment_revision === activity.segments_revision);
  if (summaryVersion !== 1 || !sourceVersionsCompatible) {
    throw new Error("Persisted activity segment version identity is incompatible");
  }
  const startedAt = new Date(activity.started_at.getTime() + segment.start_offset_ms);
  const finishedAt = new Date(activity.started_at.getTime() + segment.end_offset_ms);
  const timing = summary.timing;
  const sourceArtifactId = segment.source_artifact_id ?? null;
  const sourceSessionIndex = segment.source_session_index ?? null;
  const providerSummary = activity.canonical_evidence_tier === "provider_summary";
  const sourceCapability =
    sourceArtifactId !== null ? "activity_file" : providerSummary ? "provider_summary" : "unknown";
  const distanceBasis =
    sourceSessionIndex !== null
      ? "session_summary"
      : sourceArtifactId !== null
        ? "artifact_summary"
        : providerSummary
          ? "provider_summary"
          : "unknown";
  const providerTimingIsAmbiguous =
    sourceArtifactId !== null &&
    providerSummary &&
    timing.timingCoverage === "partial" &&
    "activeMs" in timing &&
    timing.activeMs !== undefined &&
    (!("movingMs" in timing) || timing.movingMs === undefined);
  const timingSource = providerTimingIsAmbiguous
    ? "unknown"
    : sourceArtifactId !== null
      ? "activity_file"
      : providerSummary
        ? "provider_summary"
        : "unknown";
  const timingBasis =
    timingSource === "activity_file"
      ? "session_timing"
      : timingSource === "provider_summary"
        ? "provider_active_summary"
        : "unknown";
  const quantification = quantifyCompletedActivityObservation({
    activityCategory: segment.activity_category,
    source: {
      activityId: activity.id,
      segmentId: segment.id,
      provider: null,
      externalId: null,
      artifactId: sourceArtifactId,
      capability: sourceCapability,
      parserVersion: segment.parser_version ?? activity.parser_version ?? null,
      decodedContractVersion: activity.decoded_contract_version ?? null,
      materializerVersion: segment.materializer_version ?? activity.materializer_version ?? null,
      segmentsRevision: activity.segments_revision ?? null,
      segmentRevision: segment.segment_revision ?? null,
      summaryVersion,
      sourceSessionIndex,
      sourceMessageIndex: segment.source_message_index ?? null,
      rawType: rawSourceValue(segment.raw_type_string, segment.raw_type_integer),
      rawSport: rawSourceValue(segment.raw_sport_string, segment.raw_sport_integer),
      rawSubSport: rawSourceValue(segment.raw_sub_sport_string, segment.raw_sub_sport_integer),
    },
    timing: {
      coverage: timing.timingCoverage,
      source: timingSource,
      basis: timingBasis,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      elapsedSeconds: (segment.end_offset_ms - segment.start_offset_ms) / 1_000,
      activeSeconds: "activeMs" in timing ? millisecondsToSeconds(timing.activeMs ?? null) : null,
      movingSeconds: "movingMs" in timing ? millisecondsToSeconds(timing.movingMs ?? null) : null,
    },
    distance: {
      meters: summary.distanceMeters ?? null,
      source:
        sourceArtifactId !== null || sourceSessionIndex !== null
          ? "activity_file"
          : sourceCapability === "provider_summary"
            ? "provider_summary"
            : "unknown",
      basis: distanceBasis,
    },
    intensity: {
      averageHeartRateBpm: positiveObservation(summary.averageHeartRateBpm),
      averagePowerWatts: nonnegativeObservation(summary.averagePowerWatts),
      averageSpeedMetersPerSecond: nonnegativeObservation(summary.averageSpeedMetersPerSecond),
      normalizedSpeedMetersPerSecond: positiveObservation(summary.normalizedSpeedMetersPerSecond),
    },
    commonLoad,
  });
  const compact: ActivityListDerivedSummary = {
    common_load: commonLoad,
    computed_as_of: computedAsOf,
  };
  return {
    ...compact,
    activity_id: activity.id,
    segment_id: segment.id,
    activity_category: segment.activity_category,
    observationQuantification: createObservationQuantificationBundle({ members: [quantification] }),
    dedupe_key: `activity-segment:${activity.id}:${segment.id}:load:v1`,
    load_stream_key: streamKey(compact),
  };
}

function completedLoadPerformanceTargetUnavailableReason(
  performanceTargets: AthletePerformanceTargetFacts | null | undefined,
  activityCategory: NonNullable<ActivitySegmentReadRow["activity_category"]>,
  method:
    | "power_threshold"
    | "run_pace_threshold"
    | "swim_pace_threshold"
    | "heart_rate_zones"
    | null,
): "evidence_truncated" | "stale_threshold" | null {
  if (!performanceTargets) return null;
  const reasons =
    method === "power_threshold"
      ? performanceTargets.cycling.planningThresholdPower.reasons
      : method === "run_pace_threshold"
        ? performanceTargets.running.planningThresholdPace.reasons
        : method === "swim_pace_threshold"
          ? performanceTargets.swimming.css.reasons
          : method === "heart_rate_zones" &&
              (activityCategory === "bike" ||
                activityCategory === "run" ||
                activityCategory === "swim")
            ? [performanceTargets.heartRate[activityCategory].lthr.reason]
            : [];
  if (reasons.some((reason) => reason?.includes("truncated"))) return "evidence_truncated";
  return reasons.some((reason) => reason?.includes("stale")) ? "stale_threshold" : null;
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
  const requests = activities.flatMap((activity) =>
    orderedActivitySegments(activity.segments).map((segment) => {
      const asOf = new Date(activity.started_at.getTime() + segment.start_offset_ms);
      return {
        asOf,
        effortLookbackAsOf: asOf,
        profileId: activity.profile_id ?? profileId,
        activityIdToExclude: activity.id,
      };
    }),
  );
  if (requests.length === 0) return [];
  rejectDuplicateContextRequests(requests);
  let evidenceByProfileId = new Map<
    string,
    Awaited<ReturnType<ActivityAnalysisStore["getContextSnapshot"]>>
  >();
  const evidenceByRequest = new Map<
    string,
    Awaited<ReturnType<ActivityAnalysisStore["getContextSnapshot"]>>
  >();
  let performanceTargetsByRequest = new Map<string, AthletePerformanceTargetFacts>();
  if (store.getPerformanceTargetsForRequests) {
    performanceTargetsByRequest = await loadBatchedPerformanceTargets({
      load: store.getPerformanceTargetsForRequests,
      requests,
    });
  } else if (store.getPerformanceTargetsAsOf) {
    const targets = await Promise.all(
      requests.map((request) =>
        store.getPerformanceTargetsAsOf?.({
          asOf: request.asOf,
          profileId: request.profileId,
          ...(request.activityIdToExclude === undefined
            ? {}
            : { activityIdToExclude: request.activityIdToExclude }),
        }),
      ),
    );
    requests.forEach((request, index) => {
      const targetFacts = targets[index];
      if (targetFacts) performanceTargetsByRequest.set(contextRequestKey(request), targetFacts);
    });
  }
  if (store.loadContextEvidence) {
    evidenceByProfileId = await loadBatchedContextEvidence({
      load: store.loadContextEvidence,
      requests,
    });
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
    for (const segment of orderedActivitySegments(activity.segments)) {
      const summary = completedSegmentSummarySchema.parse(segment.summary);
      const timing = summary.timing;
      const startedAt = new Date(activity.started_at.getTime() + segment.start_offset_ms);
      const evidence = (store.loadContextEvidence
        ? evidenceByProfileId.get(activity.profile_id)
        : evidenceByRequest.get(
            contextRequestKey({
              asOf: startedAt,
              effortLookbackAsOf: startedAt,
              profileId: activity.profile_id,
              activityIdToExclude: activity.id,
            }),
          )) ?? {
        ...(store.loadContextEvidence ? { calibrationTruncated: true } : {}),
        profile: { dob: null, gender: null },
        profileMetrics: [],
        recentEfforts: [],
      };
      const requestKey = contextRequestKey({
        asOf: startedAt,
        effortLookbackAsOf: startedAt,
        profileId: activity.profile_id,
        activityIdToExclude: activity.id,
      });
      const resolvedContext = resolveActivityContextFromEvidence({
        evidence,
        activityTimestamp: startedAt,
        activityId: activity.id,
      });
      const performanceTargets = performanceTargetsByRequest.get(requestKey);
      const context =
        performanceTargets === undefined
          ? resolvedContext
          : { ...resolvedContext, performanceTargets };
      const commonUnavailableReason =
        segment.activity_category === "strength" || segment.activity_category === "other"
          ? ("unsupported_modality" as const)
          : ("duration_missing" as const);
      const heartRateDurationSeconds = resolveVersionedHeartRateDurationSeconds({
        segment,
        summary,
      });
      if (timing.timingCoverage === "unavailable" && heartRateDurationSeconds === null) {
        output.push(
          buildSegmentDerivedSummary({
            activity,
            segment,
            summary,
            commonLoad: commonLoadResultSchema.parse({
              status: "unavailable",
              model: COMMON_RELATIVE_LOAD_MODEL,
              version: COMMON_RELATIVE_LOAD_VERSION,
              activity_category: segment.activity_category,
              method: null,
              quality: null,
              thresholdEvidence: null,
              evidenceFingerprint: null,
              computedAsOf,
              contributingDurationSeconds: null,
              reason: commonUnavailableReason,
            }),
            computedAsOf,
          }),
        );
        continue;
      }
      if (
        ("activeMs" in timing ? timing.activeMs : undefined) === undefined &&
        ("movingMs" in timing ? timing.movingMs : undefined) === undefined &&
        heartRateDurationSeconds === null
      ) {
        output.push(
          buildSegmentDerivedSummary({
            activity,
            segment,
            summary,
            commonLoad: commonLoadResultSchema.parse({
              status: "unavailable",
              model: COMMON_RELATIVE_LOAD_MODEL,
              version: COMMON_RELATIVE_LOAD_VERSION,
              activity_category: segment.activity_category,
              method: null,
              quality: null,
              thresholdEvidence: null,
              evidenceFingerprint: null,
              computedAsOf,
              contributingDurationSeconds: null,
              reason: commonUnavailableReason,
            }),
            computedAsOf,
          }),
        );
        continue;
      }
      const derived = analyzeActivityDerivedMetrics({
        activity: buildCompletedSegmentAnalysisActivity({
          activityStartedAt: activity.started_at,
          segment,
          summary,
        }),
        context,
        computedAsOf,
        ...(summary.heartRateDistribution !== undefined
          ? { heartRateDistribution: summary.heartRateDistribution }
          : {}),
      });
      const commonLoadMethod =
        derived.stress.common_load && "method" in derived.stress.common_load
          ? derived.stress.common_load.method
          : null;
      const performanceTargetUnavailableReason = completedLoadPerformanceTargetUnavailableReason(
        context.performanceTargets,
        segment.activity_category,
        commonLoadMethod,
      );
      const commonLoad =
        performanceTargetUnavailableReason !== null &&
        derived.stress.common_load?.status === "unavailable" &&
        derived.stress.common_load.reason === "threshold_missing"
          ? commonLoadResultSchema.parse({
              ...derived.stress.common_load,
              method: null,
              quality: null,
              thresholdEvidence: null,
              evidenceFingerprint: null,
              reason: performanceTargetUnavailableReason,
            })
          : derived.stress.common_load;
      output.push(
        buildSegmentDerivedSummary({
          activity,
          segment,
          summary,
          commonLoad: commonLoadResultSchema.parse(commonLoad),
          computedAsOf: derived.computed_as_of,
        }),
      );
    }
  }
  return output;
}

/** Parent summaries retain only the aggregate common Load envelope. */
export async function buildActivityDerivedSummaryMap(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivityWithSegments[];
}): Promise<Map<string, ActivityQuantifiedDerivedSummary>> {
  return buildParentDerivedSummaryMap(
    input.activities,
    await buildActivitySegmentDerivedSummaries(input),
  );
}

export async function buildActivityDerivedSummaries(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivityWithSegments[];
}): Promise<{
  parent: Map<string, ActivityQuantifiedDerivedSummary>;
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
): Map<string, ActivityQuantifiedDerivedSummary> {
  const result = new Map<string, ActivityQuantifiedDerivedSummary>();
  const segmentsByActivityId = new Map<string, SegmentDerivedSummary[]>();
  for (const segment of segments) {
    const observation = singleSegmentObservation(segment);
    result.set(segment.segment_id, {
      common_load: observation.commonLoad,
      computed_as_of: segment.computed_as_of,
      observationQuantification: segment.observationQuantification,
    });
    const activitySegments = segmentsByActivityId.get(segment.activity_id);
    if (activitySegments) activitySegments.push(segment);
    else segmentsByActivityId.set(segment.activity_id, [segment]);
  }
  for (const activity of activities) {
    const parts = segmentsByActivityId.get(activity.id) ?? [];
    if (parts.length === 0) continue;
    const observationQuantification = createObservationQuantificationBundle({
      members: parts.flatMap((part) => part.observationQuantification.members),
      summaryScope: "components",
    });
    const first = parts[0];
    if (!first) continue;
    result.set(activity.id, {
      common_load: observationQuantification.summary.commonLoad,
      computed_as_of: first.computed_as_of,
      observationQuantification,
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
  if (segmentSummaries.length > 0) {
    createObservationQuantificationBundle({
      members: segmentSummaries.flatMap((summary) => summary.observationQuantification.members),
    });
  }
  const byActivityId = buildParentDerivedSummaryMap(input.activities, segmentSummaries);
  const activitiesById = new Map(input.activities.map((activity) => [activity.id, activity]));
  const byDate = new Map<string, number>();
  const streamKeys = new Set<string>();
  let complete = true;
  for (const summary of segmentSummaries) {
    const load = singleSegmentObservation(summary).commonLoad;
    if (load.status !== "available" || load.load === null || !summary.load_stream_key) {
      complete = false;
      continue;
    }
    streamKeys.add(summary.load_stream_key);
    const activity = activitiesById.get(summary.activity_id);
    const date = activity ? toIsoString(activity.started_at).split("T")[0] : undefined;
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + load.load);
  }
  const first = segmentSummaries.find((summary) => summary.load_stream_key)?.common_load ?? null;
  return {
    byActivityId,
    byDate,
    segmentSummaries,
    seriesIdentity: streamKeys.size === 1 ? first : null,
    complete: complete && segmentSummaries.length > 0 && streamKeys.size === 1,
  };
}
