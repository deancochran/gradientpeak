import {
  type CanonicalQualifiedDurationEffortEvidence,
  canonicalQualifiedDurationEffortEvidenceSchema,
  DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS,
  DURATION_PERFORMANCE_MAX_INPUT_EFFORTS,
} from "@repo/core";
import { completedSegmentSummarySchema } from "@repo/core/activity-segments";
import { BEST_EFFORT_CALCULATION_VERSION } from "@repo/core/calculations";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
  profileMetrics,
} from "@repo/db";
import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor, getRequiredDb } from "../db";

type DbClient = ReturnType<typeof getRequiredDb>;
type EvidenceReadClient = DrizzleQueryExecutor;

export const ATHLETE_PERFORMANCE_EFFORT_QUERY_LIMIT = DURATION_PERFORMANCE_MAX_INPUT_EFFORTS + 1;
export const ATHLETE_PERFORMANCE_HEART_RATE_QUERY_LIMIT = 101;
export const ATHLETE_PERFORMANCE_BATCH_REQUEST_LIMIT = 525;
export const ATHLETE_PERFORMANCE_BATCH_PROFILE_LIMIT = 5;
export const ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT = 50_000;

const dateSchema = z.date().refine((value) => Number.isFinite(value.getTime()), {
  message: "Evidence timestamp must be a valid instant",
});
const uuidSchema = z.string().uuid();
const sourceSeriesSchema = z.enum(["power", "raw_speed", "grade_adjusted_speed", "swim_speed"]);

const activityFileEffortProvenanceSchema = z
  .object({
    observation_id: uuidSchema,
    activity_id: uuidSchema,
    segment_id: uuidSchema,
    derived_from: z.literal("activity_file_stream"),
    source_series: sourceSeriesSchema,
    interval_convention: z.literal("current_sample_applies_to_preceding_interval"),
    exact_window_start_timestamp_seconds: z.number().finite().nonnegative(),
    exact_window_end_timestamp_seconds: z.number().finite().positive(),
    exact_window_start_offset_seconds: z.number().finite().nonnegative(),
    exact_window_end_offset_seconds: z.number().finite().positive(),
    duration_seconds: z.number().int().min(5).max(14_400),
    contributing_duration_seconds: z.number().finite().positive().max(14_400),
    window_coverage: z.literal(1),
    source_time_coverage: z.number().finite().min(0).max(1),
    output_window_coverage: z.number().finite().min(0).max(1).optional(),
    maximum_gap_seconds: z.number().finite().nonnegative().optional(),
    output_coefficient_of_variation: z.number().finite().nonnegative().nullable().optional(),
    extraction_status: z.enum(["available", "partial"]),
    extraction_reason: z.literal("source_incomplete").nullable(),
    persisted_start_offset_quantization: z.literal("nearest_millisecond_v1"),
    calculation_version: z.literal(BEST_EFFORT_CALCULATION_VERSION),
    swimming_environment: z.enum(["pool", "open_water"]).optional(),
    timing_basis: z.enum(["pool_length_timing", "open_water_continuous_timing"]).optional(),
    pool_length_meters: z.number().finite().min(10).max(100).nullable().optional(),
  })
  .strict();

export type ActivityEffortPerformanceRow = Pick<
  typeof activityEfforts.$inferSelect,
  | "id"
  | "profile_id"
  | "activity_id"
  | "segment_id"
  | "recorded_at"
  | "activity_category"
  | "effort_type"
  | "source_series"
  | "duration_seconds"
  | "source_artifact_id"
  | "source_revision"
  | "start_offset_ms"
  | "end_offset_ms"
  | "window_coverage"
  | "max_gap_seconds"
  | "unit"
  | "value"
  | "source"
  | "method"
  | "calculation_version"
  | "provenance"
> & {
  segment_revision: number;
  accepted_segments_revision: number;
  segment_role: string;
  segment_activity_category: string | null;
  segment_summary: unknown;
  segment_source_artifact_id: string | null;
  current_artifact_id: string;
  current_artifact_profile_id: string;
  current_artifact_role: string;
  current_artifact_is_current: boolean;
  artifact_owner_profile_id: string;
  artifact_availability: string;
  activity_pool_length_meters: number | null;
};

export type HeartRateCalibrationCandidateRow = Pick<
  typeof profileMetrics.$inferSelect,
  | "id"
  | "profile_id"
  | "metric_type"
  | "recorded_at"
  | "unit"
  | "value"
  | "source"
  | "method"
  | "calculation_version"
  | "provenance"
  | "reference_activity_id"
> & {
  activity_category: "bike" | "run" | "swim";
  reference_activity_finished_at?: Date;
};

function approximatelyEqual(left: number, right: number, tolerance = 0.001): boolean {
  return Math.abs(left - right) <= tolerance;
}

function fail(message: string): never {
  throw new Error(`Incompatible canonical performance evidence: ${message}`);
}

/**
 * Strict persistence-to-domain boundary. It accepts only the current activity-file
 * evidence identity; incomplete or legacy rows fail instead of being normalized.
 */
export function adaptActivityEffortToCanonicalPerformanceEvidence(
  input: ActivityEffortPerformanceRow,
): CanonicalQualifiedDurationEffortEvidence {
  const row = z
    .object({
      id: uuidSchema,
      profile_id: uuidSchema,
      activity_id: uuidSchema,
      segment_id: uuidSchema,
      recorded_at: dateSchema,
      activity_category: z.enum(["bike", "run", "swim"]),
      effort_type: z.enum(["power", "speed"]),
      source_series: sourceSeriesSchema,
      duration_seconds: z.number().int().min(5).max(14_400),
      source_artifact_id: uuidSchema,
      source_revision: z.number().int().positive().max(1_000_000),
      start_offset_ms: z.number().int().nonnegative(),
      end_offset_ms: z.number().int().positive(),
      window_coverage: z.number().finite().min(0).max(1),
      max_gap_seconds: z.number().finite().positive(),
      unit: z.enum(["watts", "meters_per_second"]),
      value: z.number().finite().positive(),
      source: z.literal("imported"),
      method: z.literal("activity_file_best_effort"),
      calculation_version: z.literal(BEST_EFFORT_CALCULATION_VERSION),
      provenance: activityFileEffortProvenanceSchema,
      segment_revision: z.number().int().positive().max(1_000_000),
      accepted_segments_revision: z.number().int().positive().max(1_000_000),
      segment_role: z.literal("activity"),
      segment_activity_category: z.enum(["bike", "run", "swim"]),
      segment_summary: z.unknown(),
      segment_source_artifact_id: uuidSchema,
      current_artifact_id: uuidSchema,
      current_artifact_profile_id: uuidSchema,
      current_artifact_role: z.literal("source"),
      current_artifact_is_current: z.literal(true),
      artifact_owner_profile_id: uuidSchema,
      artifact_availability: z.literal("accepted"),
      activity_pool_length_meters: z.number().finite().min(10).max(100).nullable(),
    })
    .strict()
    .parse(input);
  const provenance = row.provenance;

  if (
    provenance.observation_id !== row.id ||
    provenance.activity_id !== row.activity_id ||
    provenance.segment_id !== row.segment_id ||
    row.segment_activity_category !== row.activity_category ||
    provenance.source_series !== row.source_series ||
    row.segment_revision !== row.accepted_segments_revision ||
    row.source_revision !== row.segment_revision ||
    row.source_artifact_id !== row.segment_source_artifact_id ||
    row.segment_source_artifact_id !== row.current_artifact_id ||
    row.current_artifact_profile_id !== row.profile_id ||
    row.artifact_owner_profile_id !== row.profile_id
  ) {
    fail(
      "row, owner, accepted segment revision, current artifact, and provenance identities must agree",
    );
  }
  if (
    provenance.duration_seconds !== row.duration_seconds ||
    provenance.calculation_version !== row.calculation_version
  ) {
    fail("duration and calculation revision must agree with provenance");
  }
  if (
    !approximatelyEqual(
      provenance.exact_window_end_offset_seconds - provenance.exact_window_start_offset_seconds,
      row.duration_seconds,
      0.000_001,
    ) ||
    !approximatelyEqual(
      provenance.exact_window_end_timestamp_seconds -
        provenance.exact_window_start_timestamp_seconds,
      row.duration_seconds,
      0.000_001,
    ) ||
    !approximatelyEqual(provenance.contributing_duration_seconds, row.duration_seconds, 0.000_001)
  ) {
    fail("exact windows and contributing duration must span the persisted duration");
  }
  if (
    row.start_offset_ms !== Math.round(provenance.exact_window_start_offset_seconds * 1_000) ||
    row.end_offset_ms !== Math.round(provenance.exact_window_end_offset_seconds * 1_000) ||
    row.end_offset_ms - row.start_offset_ms !== row.duration_seconds * 1_000 ||
    row.window_coverage !== provenance.window_coverage
  ) {
    fail("persisted millisecond offsets and coverage must match the exact window");
  }
  if (
    !approximatelyEqual(
      row.recorded_at.getTime() / 1_000,
      provenance.exact_window_end_timestamp_seconds,
    )
  ) {
    fail("recorded_at must be the exact effort-window end instant");
  }
  const expectedReason = provenance.extraction_status === "partial" ? "source_incomplete" : null;
  if (provenance.extraction_reason !== expectedReason) {
    fail("extraction status and reason must agree");
  }

  const common = {
    observationId: provenance.observation_id,
    evidenceId: row.id,
    evidenceRevision: row.segment_revision,
    athleteId: row.profile_id,
    activityId: row.activity_id,
    segmentId: row.segment_id,
    recordedAt: row.recorded_at.toISOString(),
    durationSeconds: row.duration_seconds,
    source: row.source,
    method: row.method,
    calculationVersion: row.calculation_version,
    provenance: {
      observationId: provenance.observation_id,
      activityId: provenance.activity_id,
      segmentId: provenance.segment_id,
      derivedFrom: provenance.derived_from,
      sourceSeries: provenance.source_series,
      exactWindowStartOffsetSeconds: provenance.exact_window_start_offset_seconds,
      exactWindowEndOffsetSeconds: provenance.exact_window_end_offset_seconds,
      durationSeconds: provenance.duration_seconds,
      contributingDurationSeconds: provenance.contributing_duration_seconds,
      windowCoverage: provenance.window_coverage,
      sourceTimeCoverage: provenance.source_time_coverage,
      extractionStatus: provenance.extraction_status,
      extractionReason: provenance.extraction_reason,
      calculationVersion: provenance.calculation_version,
    },
  } as const;

  if (row.activity_category === "bike") {
    if (
      row.effort_type !== "power" ||
      row.unit !== "watts" ||
      provenance.source_series !== "power"
    ) {
      fail("bike evidence requires power/watts/power-series identity");
    }
    return canonicalQualifiedDurationEffortEvidenceSchema.parse({
      ...common,
      activityCategory: "bike",
      metric: "power",
      value: row.value,
      unit: "watts",
      evidenceContext: { kind: "cycling_power" },
    });
  }

  if (row.activity_category === "run") {
    if (
      row.effort_type !== "speed" ||
      row.unit !== "meters_per_second" ||
      (provenance.source_series !== "raw_speed" &&
        provenance.source_series !== "grade_adjusted_speed")
    ) {
      fail("run evidence requires explicit raw- or grade-adjusted-speed identity");
    }
    return canonicalQualifiedDurationEffortEvidenceSchema.parse({
      ...common,
      activityCategory: "run",
      metric: "speed",
      value: row.value,
      unit: "meters_per_second",
      evidenceContext: { kind: "running_speed", basis: provenance.source_series },
    });
  }

  if (
    row.effort_type !== "speed" ||
    row.unit !== "meters_per_second" ||
    provenance.source_series !== "swim_speed"
  ) {
    fail("swim evidence requires speed units and the swim-speed source series");
  }
  const summary = completedSegmentSummarySchema.parse(row.segment_summary);
  const environment = provenance.swimming_environment;
  const timingBasis = provenance.timing_basis;
  const poolLengthMeters = provenance.pool_length_meters;
  if (environment === undefined || timingBasis === undefined || poolLengthMeters === undefined) {
    fail("swim evidence requires explicit environment, timing basis, and pool-length identity");
  }
  if (environment === "pool") {
    if (
      timingBasis !== "pool_length_timing" ||
      poolLengthMeters === null ||
      row.activity_pool_length_meters !== poolLengthMeters ||
      summary.swim?.poolLengthMeters !== poolLengthMeters ||
      (summary.swim.timingEvidence?.status !== "available" &&
        summary.swim.timingEvidence?.status !== "partial")
    ) {
      fail("pool evidence requires matching pool length and pool-length timing");
    }
  } else if (
    timingBasis !== "open_water_continuous_timing" ||
    poolLengthMeters !== null ||
    row.activity_pool_length_meters !== null ||
    summary.swim?.poolLengthMeters !== undefined
  ) {
    fail("open-water evidence cannot inherit pool timing or pool length");
  }

  return canonicalQualifiedDurationEffortEvidenceSchema.parse({
    ...common,
    activityCategory: "swim",
    metric: "speed",
    value: row.value,
    unit: "meters_per_second",
    evidenceContext: {
      kind: "swimming_speed",
      environment,
      timingBasis,
      poolLengthMeters,
    },
  });
}

/**
 * Swimming source rows remain durable even when their environment or timing
 * identity is insufficient. Such rows are ineligible for the canonical model,
 * rather than fatal to the athlete's whole as-of snapshot.
 */
export function adaptQualifiedSwimmingPerformanceEvidence(
  input: ActivityEffortPerformanceRow,
): CanonicalQualifiedDurationEffortEvidence | null {
  if (input.activity_category !== "swim") return null;
  try {
    const evidence = adaptActivityEffortToCanonicalPerformanceEvidence(input);
    return evidence.activityCategory === "swim" ? evidence : null;
  } catch {
    return null;
  }
}

export type AthletePerformanceModelReadInput = {
  athleteId: string;
  asOf: Date;
  excludedActivityId?: string;
};

export type AthletePerformanceEffortReads = Readonly<
  Record<
    "bike" | "run" | "swim",
    Readonly<{ rows: readonly ActivityEffortPerformanceRow[]; truncated: boolean }>
  >
>;

export type AthletePerformanceHeartRateReads = Readonly<
  Record<
    "bike" | "run" | "swim",
    Readonly<
      Record<
        "maxHr",
        Readonly<{ rows: readonly HeartRateCalibrationCandidateRow[]; truncated: boolean }>
      >
    >
  >
>;

export type AthletePerformanceEvidenceReads = Readonly<{
  effortReads: AthletePerformanceEffortReads;
  heartRateReads: AthletePerformanceHeartRateReads;
}>;

export type AthletePerformanceModelRepository = {
  readAthletePerformanceEvidenceSnapshot(
    input: AthletePerformanceModelReadInput,
  ): Promise<AthletePerformanceEvidenceReads>;
  readEvidenceBatch?(
    inputs: AthletePerformanceModelReadInput[],
  ): Promise<AthletePerformanceEvidenceReads[]>;
};

export type AthletePerformanceHeartRateRepository = {
  readHeartRateCapabilityEvidenceBatch(
    executor: DrizzleQueryExecutor,
    inputs: readonly AthletePerformanceModelReadInput[],
  ): Promise<AthletePerformanceHeartRateReads[]>;
};

function freezeEvidenceRead<T extends object>(read: { rows: T[]; truncated: boolean }) {
  return Object.freeze({
    rows: Object.freeze(read.rows.map((row) => Object.freeze(row))),
    truncated: read.truncated,
  });
}

function freezeEvidenceSnapshot(input: {
  effortReads: {
    bike: { rows: ActivityEffortPerformanceRow[]; truncated: boolean };
    run: { rows: ActivityEffortPerformanceRow[]; truncated: boolean };
    swim: { rows: ActivityEffortPerformanceRow[]; truncated: boolean };
  };
  heartRateReads: {
    bike: {
      maxHr: { rows: HeartRateCalibrationCandidateRow[]; truncated: boolean };
    };
    run: {
      maxHr: { rows: HeartRateCalibrationCandidateRow[]; truncated: boolean };
    };
    swim: {
      maxHr: { rows: HeartRateCalibrationCandidateRow[]; truncated: boolean };
    };
  };
}): AthletePerformanceEvidenceReads {
  return Object.freeze({
    effortReads: Object.freeze({
      bike: freezeEvidenceRead(input.effortReads.bike),
      run: freezeEvidenceRead(input.effortReads.run),
      swim: freezeEvidenceRead(input.effortReads.swim),
    }),
    heartRateReads: Object.freeze({
      bike: Object.freeze({
        maxHr: freezeEvidenceRead(input.heartRateReads.bike.maxHr),
      }),
      run: Object.freeze({
        maxHr: freezeEvidenceRead(input.heartRateReads.run.maxHr),
      }),
      swim: Object.freeze({
        maxHr: freezeEvidenceRead(input.heartRateReads.swim.maxHr),
      }),
    }),
  });
}

function freezeHeartRateReads(input: {
  bike: { maxHr: { rows: HeartRateCalibrationCandidateRow[]; truncated: boolean } };
  run: { maxHr: { rows: HeartRateCalibrationCandidateRow[]; truncated: boolean } };
  swim: { maxHr: { rows: HeartRateCalibrationCandidateRow[]; truncated: boolean } };
}): AthletePerformanceHeartRateReads {
  return Object.freeze({
    bike: Object.freeze({ maxHr: freezeEvidenceRead(input.bike.maxHr) }),
    run: Object.freeze({ maxHr: freezeEvidenceRead(input.run.maxHr) }),
    swim: Object.freeze({ maxHr: freezeEvidenceRead(input.swim.maxHr) }),
  });
}

/** Owner-scoped, as-of, self-excluding, bounded reads for the canonical model service. */
export function createAthletePerformanceModelRepository(
  db: DbClient,
  readExecutor?: EvidenceReadClient,
): AthletePerformanceModelRepository & AthletePerformanceHeartRateRepository {
  const effortRows = async (
    executor: EvidenceReadClient,
    input: { athleteId: string; asOf: Date; excludedActivityId?: string },
    activityCategory: "bike" | "run" | "swim",
  ) => {
    const cutoff = new Date(
      input.asOf.getTime() - DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS * 86_400_000,
    );
    const rows = await executor
      .select({
        id: activityEfforts.id,
        profile_id: activityEfforts.profile_id,
        activity_id: activityEfforts.activity_id,
        segment_id: activityEfforts.segment_id,
        recorded_at: activityEfforts.recorded_at,
        activity_category: activityEfforts.activity_category,
        effort_type: activityEfforts.effort_type,
        source_series: activityEfforts.source_series,
        duration_seconds: activityEfforts.duration_seconds,
        source_artifact_id: activityEfforts.source_artifact_id,
        source_revision: activityEfforts.source_revision,
        start_offset_ms: activityEfforts.start_offset_ms,
        end_offset_ms: activityEfforts.end_offset_ms,
        window_coverage: activityEfforts.window_coverage,
        max_gap_seconds: activityEfforts.max_gap_seconds,
        unit: activityEfforts.unit,
        value: activityEfforts.value,
        source: activityEfforts.source,
        method: activityEfforts.method,
        calculation_version: activityEfforts.calculation_version,
        provenance: activityEfforts.provenance,
        segment_revision: activitySegments.segment_revision,
        accepted_segments_revision: activities.segments_revision,
        segment_role: activitySegments.role,
        segment_activity_category: activitySegments.activity_category,
        segment_summary: activitySegments.summary,
        segment_source_artifact_id: activitySegments.source_artifact_id,
        current_artifact_id: activityArtifactLinks.artifact_id,
        current_artifact_profile_id: activityArtifactLinks.profile_id,
        current_artifact_role: activityArtifactLinks.role,
        current_artifact_is_current: activityArtifactLinks.is_current,
        artifact_owner_profile_id: activityArtifacts.profile_id,
        artifact_availability: activityArtifacts.availability,
        activity_pool_length_meters: activities.pool_length_meters,
      })
      .from(activityEfforts)
      .innerJoin(
        activitySegments,
        and(
          eq(activitySegments.id, activityEfforts.segment_id),
          eq(activitySegments.activity_id, activityEfforts.activity_id),
          eq(activitySegments.profile_id, activityEfforts.profile_id),
          eq(activitySegments.activity_category, activityEfforts.activity_category),
        ),
      )
      .innerJoin(
        activities,
        and(
          eq(activities.id, activityEfforts.activity_id),
          eq(activities.profile_id, activityEfforts.profile_id),
        ),
      )
      .innerJoin(
        activityArtifactLinks,
        and(
          eq(activityArtifactLinks.activity_id, activityEfforts.activity_id),
          eq(activityArtifactLinks.artifact_id, activitySegments.source_artifact_id),
          eq(activityArtifactLinks.profile_id, activityEfforts.profile_id),
          eq(activityArtifactLinks.role, "source"),
          eq(activityArtifactLinks.is_current, true),
        ),
      )
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
          eq(activityEfforts.profile_id, input.athleteId),
          eq(activityEfforts.activity_category, activityCategory),
          eq(activityEfforts.effort_type, activityCategory === "bike" ? "power" : "speed"),
          eq(activityEfforts.source, "imported"),
          eq(activityEfforts.method, "activity_file_best_effort"),
          eq(activityEfforts.calculation_version, BEST_EFFORT_CALCULATION_VERSION),
          eq(activitySegments.segment_revision, activities.segments_revision),
          lte(activities.finished_at, input.asOf),
          gte(activityEfforts.recorded_at, cutoff),
          lte(activityEfforts.recorded_at, input.asOf),
          input.excludedActivityId === undefined
            ? undefined
            : ne(activityEfforts.activity_id, input.excludedActivityId),
        ),
      )
      .orderBy(desc(activityEfforts.recorded_at), desc(activityEfforts.id))
      .limit(ATHLETE_PERFORMANCE_EFFORT_QUERY_LIMIT);
    return {
      rows: rows.slice(0, DURATION_PERFORMANCE_MAX_INPUT_EFFORTS),
      truncated: rows.length === ATHLETE_PERFORMANCE_EFFORT_QUERY_LIMIT,
    };
  };

  const heartRateRows = async (
    executor: EvidenceReadClient,
    input: { athleteId: string; asOf: Date; excludedActivityId?: string },
    metric: "max_hr",
    activityCategory: "bike" | "run" | "swim",
  ) => {
    const method = "max_hr_progressive_test_v1";
    const calculationVersion = "max_hr_progressive_test_v1";
    const rows = await executor
      .select({
        id: profileMetrics.id,
        profile_id: profileMetrics.profile_id,
        metric_type: profileMetrics.metric_type,
        recorded_at: profileMetrics.recorded_at,
        unit: profileMetrics.unit,
        value: profileMetrics.value,
        source: profileMetrics.source,
        method: profileMetrics.method,
        calculation_version: profileMetrics.calculation_version,
        provenance: profileMetrics.provenance,
        reference_activity_id: profileMetrics.reference_activity_id,
        reference_activity_finished_at: activities.finished_at,
      })
      .from(profileMetrics)
      .innerJoin(
        activities,
        and(
          eq(activities.id, profileMetrics.reference_activity_id),
          eq(activities.profile_id, profileMetrics.profile_id),
        ),
      )
      .where(
        and(
          eq(profileMetrics.profile_id, input.athleteId),
          eq(profileMetrics.metric_type, metric),
          eq(profileMetrics.source, "derived"),
          eq(profileMetrics.method, method),
          eq(profileMetrics.calculation_version, calculationVersion),
          lte(profileMetrics.recorded_at, input.asOf),
          lte(activities.finished_at, input.asOf),
          input.excludedActivityId === undefined
            ? undefined
            : ne(profileMetrics.reference_activity_id, input.excludedActivityId),
          sql`exists (
            select 1
            from ${activitySegments} segment
            join ${activities} activity
              on activity.id = segment.activity_id
             and activity.profile_id = segment.profile_id
             and activity.segments_revision = segment.segment_revision
             and activity.finished_at <= ${input.asOf}
            join ${activityArtifactLinks} current_link
              on current_link.activity_id = segment.activity_id
             and current_link.profile_id = segment.profile_id
             and current_link.artifact_id = segment.source_artifact_id
             and current_link.role = 'source'
             and current_link.is_current = true
            join ${activityArtifacts} accepted_artifact
              on accepted_artifact.id = current_link.artifact_id
             and accepted_artifact.profile_id = current_link.profile_id
             and accepted_artifact.availability = 'accepted'
            where segment.activity_id = ${profileMetrics.reference_activity_id}
              and segment.profile_id = ${input.athleteId}
              and segment.id::text = ${profileMetrics.provenance} ->> 'segment_id'
              and segment.role = 'activity'
              and segment.activity_category = ${activityCategory}
          )`,
          sql`(select count(distinct segment.activity_category) from ${activitySegments} segment where segment.activity_id = ${profileMetrics.reference_activity_id} and segment.profile_id = ${input.athleteId} and segment.role = 'activity') = 1`,
        ),
      )
      .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
      .limit(ATHLETE_PERFORMANCE_HEART_RATE_QUERY_LIMIT);
    return {
      rows: rows.slice(0, ATHLETE_PERFORMANCE_HEART_RATE_QUERY_LIMIT - 1).map((row) => ({
        ...row,
        activity_category: activityCategory,
      })),
      truncated: rows.length === ATHLETE_PERFORMANCE_HEART_RATE_QUERY_LIMIT,
    };
  };

  const batchEffortRows = async (
    executor: EvidenceReadClient,
    inputs: AthletePerformanceModelReadInput[],
    activityCategory: "bike" | "run" | "swim",
  ) => {
    const profileIds = [...new Set(inputs.map((input) => input.athleteId))];
    const earliestCutoff = new Date(
      Math.min(
        ...inputs.map(
          (input) => input.asOf.getTime() - DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS * 86_400_000,
        ),
      ),
    );
    const latestAsOf = new Date(Math.max(...inputs.map((input) => input.asOf.getTime())));
    const rows = await executor
      .select({
        id: activityEfforts.id,
        profile_id: activityEfforts.profile_id,
        activity_id: activityEfforts.activity_id,
        segment_id: activityEfforts.segment_id,
        recorded_at: activityEfforts.recorded_at,
        activity_category: activityEfforts.activity_category,
        effort_type: activityEfforts.effort_type,
        source_series: activityEfforts.source_series,
        duration_seconds: activityEfforts.duration_seconds,
        source_artifact_id: activityEfforts.source_artifact_id,
        source_revision: activityEfforts.source_revision,
        start_offset_ms: activityEfforts.start_offset_ms,
        end_offset_ms: activityEfforts.end_offset_ms,
        window_coverage: activityEfforts.window_coverage,
        max_gap_seconds: activityEfforts.max_gap_seconds,
        unit: activityEfforts.unit,
        value: activityEfforts.value,
        source: activityEfforts.source,
        method: activityEfforts.method,
        calculation_version: activityEfforts.calculation_version,
        provenance: activityEfforts.provenance,
        segment_revision: activitySegments.segment_revision,
        accepted_segments_revision: activities.segments_revision,
        segment_role: activitySegments.role,
        segment_activity_category: activitySegments.activity_category,
        segment_summary: activitySegments.summary,
        segment_source_artifact_id: activitySegments.source_artifact_id,
        current_artifact_id: activityArtifactLinks.artifact_id,
        current_artifact_profile_id: activityArtifactLinks.profile_id,
        current_artifact_role: activityArtifactLinks.role,
        current_artifact_is_current: activityArtifactLinks.is_current,
        artifact_owner_profile_id: activityArtifacts.profile_id,
        artifact_availability: activityArtifacts.availability,
        activity_pool_length_meters: activities.pool_length_meters,
        activity_finished_at: activities.finished_at,
      })
      .from(activityEfforts)
      .innerJoin(
        activitySegments,
        and(
          eq(activitySegments.id, activityEfforts.segment_id),
          eq(activitySegments.activity_id, activityEfforts.activity_id),
          eq(activitySegments.profile_id, activityEfforts.profile_id),
          eq(activitySegments.activity_category, activityEfforts.activity_category),
        ),
      )
      .innerJoin(
        activities,
        and(
          eq(activities.id, activityEfforts.activity_id),
          eq(activities.profile_id, activityEfforts.profile_id),
        ),
      )
      .innerJoin(
        activityArtifactLinks,
        and(
          eq(activityArtifactLinks.activity_id, activityEfforts.activity_id),
          eq(activityArtifactLinks.artifact_id, activitySegments.source_artifact_id),
          eq(activityArtifactLinks.profile_id, activityEfforts.profile_id),
          eq(activityArtifactLinks.role, "source"),
          eq(activityArtifactLinks.is_current, true),
        ),
      )
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
          inArray(activityEfforts.profile_id, profileIds),
          eq(activityEfforts.activity_category, activityCategory),
          eq(activityEfforts.effort_type, activityCategory === "bike" ? "power" : "speed"),
          eq(activityEfforts.source, "imported"),
          eq(activityEfforts.method, "activity_file_best_effort"),
          eq(activityEfforts.calculation_version, BEST_EFFORT_CALCULATION_VERSION),
          eq(activitySegments.segment_revision, activities.segments_revision),
          gte(activityEfforts.recorded_at, earliestCutoff),
          lte(activityEfforts.recorded_at, latestAsOf),
          lte(activities.finished_at, latestAsOf),
        ),
      )
      .orderBy(desc(activityEfforts.recorded_at), desc(activityEfforts.id))
      .limit(ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT + 1);
    return {
      rows: rows.slice(0, ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT),
      truncated: rows.length > ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT,
    };
  };

  const batchHeartRateRows = async (
    executor: EvidenceReadClient,
    inputs: AthletePerformanceModelReadInput[],
    metric: "max_hr",
    activityCategory: "bike" | "run" | "swim",
  ) => {
    const profileIds = [...new Set(inputs.map((input) => input.athleteId))];
    const latestAsOf = new Date(Math.max(...inputs.map((input) => input.asOf.getTime())));
    const method = "max_hr_progressive_test_v1";
    const calculationVersion = "max_hr_progressive_test_v1";
    const rows = await executor
      .select({
        id: profileMetrics.id,
        profile_id: profileMetrics.profile_id,
        metric_type: profileMetrics.metric_type,
        recorded_at: profileMetrics.recorded_at,
        unit: profileMetrics.unit,
        value: profileMetrics.value,
        source: profileMetrics.source,
        method: profileMetrics.method,
        calculation_version: profileMetrics.calculation_version,
        provenance: profileMetrics.provenance,
        reference_activity_id: profileMetrics.reference_activity_id,
        reference_activity_finished_at: activities.finished_at,
      })
      .from(profileMetrics)
      .innerJoin(
        activities,
        and(
          eq(activities.id, profileMetrics.reference_activity_id),
          eq(activities.profile_id, profileMetrics.profile_id),
        ),
      )
      .where(
        and(
          inArray(profileMetrics.profile_id, profileIds),
          eq(profileMetrics.metric_type, metric),
          eq(profileMetrics.source, "derived"),
          eq(profileMetrics.method, method),
          eq(profileMetrics.calculation_version, calculationVersion),
          lte(profileMetrics.recorded_at, latestAsOf),
          lte(activities.finished_at, latestAsOf),
          sql`exists (
            select 1
            from ${activitySegments} segment
            join ${activities} activity
              on activity.id = segment.activity_id
             and activity.profile_id = segment.profile_id
             and activity.segments_revision = segment.segment_revision
             and activity.finished_at <= ${latestAsOf}
            join ${activityArtifactLinks} current_link
              on current_link.activity_id = segment.activity_id
             and current_link.profile_id = segment.profile_id
             and current_link.artifact_id = segment.source_artifact_id
             and current_link.role = 'source'
             and current_link.is_current = true
            join ${activityArtifacts} accepted_artifact
              on accepted_artifact.id = current_link.artifact_id
             and accepted_artifact.profile_id = current_link.profile_id
             and accepted_artifact.availability = 'accepted'
            where segment.activity_id = ${profileMetrics.reference_activity_id}
              and segment.profile_id = ${profileMetrics.profile_id}
              and segment.id::text = ${profileMetrics.provenance} ->> 'segment_id'
              and segment.role = 'activity'
              and segment.activity_category = ${activityCategory}
          )`,
          sql`(select count(distinct segment.activity_category) from ${activitySegments} segment where segment.activity_id = ${profileMetrics.reference_activity_id} and segment.profile_id = ${profileMetrics.profile_id} and segment.role = 'activity') = 1`,
        ),
      )
      .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
      .limit(ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT + 1);
    return {
      rows: rows.slice(0, ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT).map((row) => ({
        ...row,
        activity_category: activityCategory,
      })),
      truncated: rows.length > ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT,
    };
  };

  const heartRateReadFromBatch = (
    input: AthletePerformanceModelReadInput,
    batch: Awaited<ReturnType<typeof batchHeartRateRows>>,
  ) => {
    const matches = batch.rows.filter(
      (row) =>
        row.profile_id === input.athleteId &&
        row.recorded_at.getTime() <= input.asOf.getTime() &&
        row.reference_activity_finished_at !== undefined &&
        row.reference_activity_finished_at.getTime() <= input.asOf.getTime() &&
        (input.excludedActivityId === undefined ||
          row.reference_activity_id !== input.excludedActivityId),
    );
    return {
      rows: matches.slice(0, ATHLETE_PERFORMANCE_HEART_RATE_QUERY_LIMIT - 1),
      truncated: batch.truncated || matches.length >= ATHLETE_PERFORMANCE_HEART_RATE_QUERY_LIMIT,
    };
  };

  const validateBatchInputs = (inputs: readonly AthletePerformanceModelReadInput[]) => {
    if (inputs.length > ATHLETE_PERFORMANCE_BATCH_REQUEST_LIMIT) {
      throw new Error("Performance-model batch request limit exceeded");
    }
    if (inputs.some((input) => !Number.isFinite(input.asOf.getTime()))) {
      throw new Error("Performance-model batch contains an invalid asOf instant");
    }
    if (
      new Set(inputs.map((input) => input.athleteId)).size > ATHLETE_PERFORMANCE_BATCH_PROFILE_LIMIT
    ) {
      throw new Error("Performance-model batch profile limit exceeded");
    }
  };

  return {
    async readHeartRateCapabilityEvidenceBatch(executor, inputs) {
      if (inputs.length === 0) return [];
      validateBatchInputs(inputs);
      const bikeMaxHr = await batchHeartRateRows(executor, [...inputs], "max_hr", "bike");
      const runMaxHr = await batchHeartRateRows(executor, [...inputs], "max_hr", "run");
      const swimMaxHr = await batchHeartRateRows(executor, [...inputs], "max_hr", "swim");
      return inputs.map((input) =>
        freezeHeartRateReads({
          bike: { maxHr: heartRateReadFromBatch(input, bikeMaxHr) },
          run: { maxHr: heartRateReadFromBatch(input, runMaxHr) },
          swim: { maxHr: heartRateReadFromBatch(input, swimMaxHr) },
        }),
      );
    },
    async readAthletePerformanceEvidenceSnapshot(input) {
      const read = async (tx: EvidenceReadClient) => {
        const bike = await effortRows(tx, input, "bike");
        const run = await effortRows(tx, input, "run");
        const swim = await effortRows(tx, input, "swim");
        const bikeMaxHr = await heartRateRows(tx, input, "max_hr", "bike");
        const runMaxHr = await heartRateRows(tx, input, "max_hr", "run");
        const swimMaxHr = await heartRateRows(tx, input, "max_hr", "swim");
        return freezeEvidenceSnapshot({
          effortReads: { bike, run, swim },
          heartRateReads: {
            bike: { maxHr: bikeMaxHr },
            run: { maxHr: runMaxHr },
            swim: { maxHr: swimMaxHr },
          },
        });
      };
      if (readExecutor) return read(readExecutor);
      return db.transaction(read, { accessMode: "read only", isolationLevel: "repeatable read" });
    },
    async readEvidenceBatch(inputs) {
      if (inputs.length === 0) return [];
      validateBatchInputs(inputs);
      return db.transaction(
        async (tx) => {
          const bikeEfforts = await batchEffortRows(tx, inputs, "bike");
          const runEfforts = await batchEffortRows(tx, inputs, "run");
          const swimEfforts = await batchEffortRows(tx, inputs, "swim");
          const bikeMaxHr = await batchHeartRateRows(tx, inputs, "max_hr", "bike");
          const runMaxHr = await batchHeartRateRows(tx, inputs, "max_hr", "run");
          const swimMaxHr = await batchHeartRateRows(tx, inputs, "max_hr", "swim");
          const effortRead = (
            input: AthletePerformanceModelReadInput,
            batch: Awaited<ReturnType<typeof batchEffortRows>>,
          ) => {
            const cutoff =
              input.asOf.getTime() - DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS * 86_400_000;
            const matches = batch.rows.filter(
              (row) =>
                row.profile_id === input.athleteId &&
                row.recorded_at.getTime() >= cutoff &&
                row.recorded_at.getTime() <= input.asOf.getTime() &&
                row.activity_finished_at.getTime() <= input.asOf.getTime() &&
                (input.excludedActivityId === undefined ||
                  row.activity_id !== input.excludedActivityId),
            );
            const canonicalRows = matches.map(
              ({ activity_finished_at: _finishedAt, ...row }) => row,
            );
            return {
              rows: canonicalRows.slice(0, DURATION_PERFORMANCE_MAX_INPUT_EFFORTS),
              truncated:
                batch.truncated || matches.length >= ATHLETE_PERFORMANCE_EFFORT_QUERY_LIMIT,
            };
          };
          const resolveLaneReader = async <T extends object>(
            batchTruncated: boolean,
            readBatch: (input: AthletePerformanceModelReadInput) => T,
            readDirect: (input: AthletePerformanceModelReadInput) => Promise<T>,
          ): Promise<(input: AthletePerformanceModelReadInput) => T> => {
            if (!batchTruncated) return readBatch;

            // A global newest-first cap cannot establish completeness for an
            // earlier cutoff or quieter athlete. Re-read only the capped lane
            // inside this same repeatable-read transaction.
            const directReads = new Map<AthletePerformanceModelReadInput, T>();
            for (const input of inputs) {
              directReads.set(input, await readDirect(input));
            }
            return (input) => {
              const read = directReads.get(input);
              if (read === undefined) {
                throw new Error("Performance-model direct batch fallback omitted a result");
              }
              return read;
            };
          };
          const readBikeEfforts = await resolveLaneReader(
            bikeEfforts.truncated,
            (input) => effortRead(input, bikeEfforts),
            (input) => effortRows(tx, input, "bike"),
          );
          const readRunEfforts = await resolveLaneReader(
            runEfforts.truncated,
            (input) => effortRead(input, runEfforts),
            (input) => effortRows(tx, input, "run"),
          );
          const readSwimEfforts = await resolveLaneReader(
            swimEfforts.truncated,
            (input) => effortRead(input, swimEfforts),
            (input) => effortRows(tx, input, "swim"),
          );
          const readBikeMaxHr = await resolveLaneReader(
            bikeMaxHr.truncated,
            (input) => heartRateReadFromBatch(input, bikeMaxHr),
            (input) => heartRateRows(tx, input, "max_hr", "bike"),
          );
          const readRunMaxHr = await resolveLaneReader(
            runMaxHr.truncated,
            (input) => heartRateReadFromBatch(input, runMaxHr),
            (input) => heartRateRows(tx, input, "max_hr", "run"),
          );
          const readSwimMaxHr = await resolveLaneReader(
            swimMaxHr.truncated,
            (input) => heartRateReadFromBatch(input, swimMaxHr),
            (input) => heartRateRows(tx, input, "max_hr", "swim"),
          );
          const snapshots = [];
          for (const [index, input] of inputs.entries()) {
            void index;
            snapshots.push(
              freezeEvidenceSnapshot({
                effortReads: {
                  bike: readBikeEfforts(input),
                  run: readRunEfforts(input),
                  swim: readSwimEfforts(input),
                },
                heartRateReads: {
                  bike: {
                    maxHr: readBikeMaxHr(input),
                  },
                  run: {
                    maxHr: readRunMaxHr(input),
                  },
                  swim: {
                    maxHr: readSwimMaxHr(input),
                  },
                },
              }),
            );
          }
          return snapshots;
        },
        { accessMode: "read only", isolationLevel: "repeatable read" },
      );
    },
  };
}
