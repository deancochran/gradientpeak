import { createHash, randomUUID } from "node:crypto";
import {
  type CanonicalSwimCssProtocolEvidence,
  CSS_TEST_PROTOCOL,
  canonicalSwimCssProtocolEvidenceSchema,
  evaluateCssFrom400m200mTest,
  SWIMMING_CSS_PROTOCOL_EVIDENCE_VERSION,
  SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION,
  SWIMMING_CSS_SOURCE_EFFORT_METHOD,
  type SwimmingCssProtocolQualificationReason,
  swimmingCssProtocolIdForActivity,
} from "@repo/core";
import { completedSegmentSummarySchema } from "@repo/core/activity-segments";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import {
  deleteSwimmingCssProtocolEvidenceForActivity,
  readSwimmingCssProtocolSourceSnapshot,
  type SwimmingCssProtocolEvidenceTransaction,
  type SwimmingCssProtocolSourceEffort,
  type SwimmingCssProtocolSourceSnapshot,
  upsertSwimmingCssProtocolEvidence,
} from "../../repositories/swimming-css-protocol-evidence-repository";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

const uuidSchema = z.string().uuid();
const sourceEffortProvenanceSchema = z
  .object({
    observation_id: uuidSchema,
    protocol_id: z.string().trim().min(1).max(256),
    protocol: z.literal(CSS_TEST_PROTOCOL),
    activity_id: uuidSchema,
    segment_id: uuidSchema,
    derived_from: z.literal("activity_file_swim_segment"),
    source_series: z.literal("swim_distance"),
    distance_meters: z.union([z.literal(400), z.literal(200)]),
    active_duration_seconds: z.number().int().positive().max(14_400),
    segment_start_offset_ms: z.number().int().nonnegative(),
    segment_end_offset_ms: z.number().int().positive(),
    environment: z.enum(["pool", "open_water", "unresolved"]),
    timing_basis: z.enum(["pool_length_timing", "open_water_continuous_timing", "unresolved"]),
    pool_length_meters: z.number().finite().min(10).max(100).nullable(),
    calculation_version: z.literal(SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION),
  })
  .strict();

export type SwimmingCssProtocolReconciliationResult =
  | {
      status: "qualified";
      reasons: [];
      evidence: CanonicalSwimCssProtocolEvidence;
    }
  | {
      status: "rejected";
      reasons: [SwimmingCssProtocolQualificationReason];
      evidence: null;
    };

function rejected(
  reason: SwimmingCssProtocolQualificationReason,
): SwimmingCssProtocolReconciliationResult {
  return { status: "rejected", reasons: [reason], evidence: null };
}

function approximatelyEqual(left: number, right: number, tolerance = 0.001): boolean {
  return Math.abs(left - right) <= tolerance;
}

function canonicalEvidenceId(input: {
  activityId: string;
  artifactDigest: string;
  evidenceRevision: number;
  poolLengthMeters: number;
  efforts: readonly [SwimmingCssProtocolSourceEffort, SwimmingCssProtocolSourceEffort];
}): string {
  const identity = JSON.stringify([
    SWIMMING_CSS_PROTOCOL_EVIDENCE_VERSION,
    input.activityId,
    input.artifactDigest,
    input.evidenceRevision,
    input.poolLengthMeters,
    ...input.efforts.flatMap((effort) => [
      effort.id,
      effort.segment_id,
      effort.recorded_at.toISOString(),
      effort.distance_meters,
      effort.duration_seconds,
      effort.segment_start_offset_ms,
      effort.segment_end_offset_ms,
      effort.calculation_version,
    ]),
  ]);
  return `sha256:${createHash("sha256").update(identity).digest("hex")}`;
}

function effortHasCanonicalIdentity(input: {
  effort: SwimmingCssProtocolSourceEffort;
  expectedDistance: 400 | 200;
  profileId: string;
  activityId: string;
  protocolId: string;
}): boolean {
  const provenance = sourceEffortProvenanceSchema.safeParse(input.effort.provenance);
  if (!provenance.success) return false;
  const effort = input.effort;
  return (
    effort.id === provenance.data.observation_id &&
    effort.profile_id === input.profileId &&
    effort.segment_profile_id === input.profileId &&
    effort.activity_id === input.activityId &&
    effort.segment_id === provenance.data.segment_id &&
    provenance.data.activity_id === input.activityId &&
    provenance.data.protocol_id === input.protocolId &&
    provenance.data.distance_meters === input.expectedDistance &&
    effort.distance_meters === input.expectedDistance &&
    effort.activity_category === "swim" &&
    effort.segment_activity_category === "swim" &&
    effort.segment_role === "activity" &&
    effort.effort_type === "speed" &&
    effort.unit === "meters_per_second" &&
    effort.source === "imported" &&
    effort.method === SWIMMING_CSS_SOURCE_EFFORT_METHOD &&
    effort.calculation_version === SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION &&
    effort.duration_seconds === provenance.data.active_duration_seconds &&
    effort.segment_start_offset_ms === provenance.data.segment_start_offset_ms &&
    effort.segment_end_offset_ms === provenance.data.segment_end_offset_ms &&
    approximatelyEqual(effort.value, input.expectedDistance / effort.duration_seconds)
  );
}

/**
 * Qualifies one exact 400 m then 200 m pool protocol. It never calculates or
 * persists CSS; rejected source evidence remains ordinary activity evidence.
 */
export function qualifySwimmingCssProtocolSourceSnapshot(input: {
  profileId: string;
  activityId: string;
  observationId: string;
  snapshot: SwimmingCssProtocolSourceSnapshot;
}): SwimmingCssProtocolReconciliationResult {
  const { activity, currentArtifact } = input.snapshot;
  if (
    activity === null ||
    activity.id !== input.activityId ||
    activity.profile_id !== input.profileId
  ) {
    return rejected("css_protocol_identity_mismatch");
  }

  const fourHundredCandidates = input.snapshot.efforts.filter(
    (effort) => effort.distance_meters === 400,
  );
  const twoHundredCandidates = input.snapshot.efforts.filter(
    (effort) => effort.distance_meters === 200,
  );
  if (fourHundredCandidates.length === 0 || twoHundredCandidates.length === 0) {
    return rejected("css_protocol_efforts_missing");
  }
  if (fourHundredCandidates.length !== 1 || twoHundredCandidates.length !== 1) {
    return rejected("css_protocol_efforts_ambiguous");
  }
  const fourHundred = fourHundredCandidates[0];
  const twoHundred = twoHundredCandidates[0];
  if (fourHundred === undefined || twoHundred === undefined) {
    return rejected("css_protocol_efforts_missing");
  }

  if (
    currentArtifact === null ||
    currentArtifact.profile_id !== input.profileId ||
    currentArtifact.role !== "source" ||
    !currentArtifact.is_current ||
    currentArtifact.availability !== "accepted" ||
    !/^[0-9a-f]{64}$/.test(currentArtifact.digest)
  ) {
    return rejected("css_source_artifact_not_current");
  }

  const protocolId = swimmingCssProtocolIdForActivity(input.activityId);
  if (
    !effortHasCanonicalIdentity({
      effort: fourHundred,
      expectedDistance: 400,
      profileId: input.profileId,
      activityId: input.activityId,
      protocolId,
    }) ||
    !effortHasCanonicalIdentity({
      effort: twoHundred,
      expectedDistance: 200,
      profileId: input.profileId,
      activityId: input.activityId,
      protocolId,
    })
  ) {
    return rejected("css_protocol_identity_mismatch");
  }

  if (
    fourHundred.segment_revision !== activity.segments_revision ||
    twoHundred.segment_revision !== activity.segments_revision ||
    fourHundred.segment_source_artifact_id !== currentArtifact.artifact_id ||
    twoHundred.segment_source_artifact_id !== currentArtifact.artifact_id
  ) {
    return fourHundred.segment_source_artifact_id !== currentArtifact.artifact_id ||
      twoHundred.segment_source_artifact_id !== currentArtifact.artifact_id
      ? rejected("css_source_artifact_not_current")
      : rejected("css_source_segment_not_current");
  }

  const fourHundredSummary = completedSegmentSummarySchema.safeParse(fourHundred.segment_summary);
  const twoHundredSummary = completedSegmentSummarySchema.safeParse(twoHundred.segment_summary);
  const poolLength = activity.pool_length_meters;
  if (
    poolLength === null ||
    !Number.isFinite(poolLength) ||
    poolLength < 10 ||
    poolLength > 100 ||
    !fourHundredSummary.success ||
    !twoHundredSummary.success ||
    fourHundredSummary.data.swim?.poolLengthMeters !== poolLength ||
    twoHundredSummary.data.swim?.poolLengthMeters !== poolLength
  ) {
    return rejected("css_pool_context_missing");
  }

  const fourHundredProvenance = sourceEffortProvenanceSchema.parse(fourHundred.provenance);
  const twoHundredProvenance = sourceEffortProvenanceSchema.parse(twoHundred.provenance);
  if (
    fourHundredProvenance.environment !== "pool" ||
    twoHundredProvenance.environment !== "pool" ||
    fourHundredProvenance.timing_basis !== "pool_length_timing" ||
    twoHundredProvenance.timing_basis !== "pool_length_timing" ||
    fourHundredProvenance.pool_length_meters !== poolLength ||
    twoHundredProvenance.pool_length_meters !== poolLength
  ) {
    return rejected("css_pool_context_missing");
  }

  const fourHundredTiming = fourHundredSummary.data.swim?.timingEvidence;
  const twoHundredTiming = twoHundredSummary.data.swim?.timingEvidence;
  if (
    fourHundred.segment_timing_coverage !== "complete" ||
    twoHundred.segment_timing_coverage !== "complete" ||
    fourHundred.segment_active_ms === null ||
    twoHundred.segment_active_ms === null ||
    fourHundredSummary.data.timing.timingCoverage !== "complete" ||
    twoHundredSummary.data.timing.timingCoverage !== "complete" ||
    fourHundredTiming?.status !== "available" ||
    twoHundredTiming?.status !== "available" ||
    !Number.isInteger(fourHundredTiming.activeDurationSeconds) ||
    !Number.isInteger(twoHundredTiming.activeDurationSeconds) ||
    fourHundred.segment_active_ms !== fourHundredTiming.activeDurationSeconds * 1_000 ||
    twoHundred.segment_active_ms !== twoHundredTiming.activeDurationSeconds * 1_000 ||
    fourHundred.duration_seconds !== fourHundredTiming.activeDurationSeconds ||
    twoHundred.duration_seconds !== twoHundredTiming.activeDurationSeconds ||
    fourHundredSummary.data.distanceMeters !== 400 ||
    twoHundredSummary.data.distanceMeters !== 200
  ) {
    return rejected("css_timing_incomplete");
  }

  if (
    fourHundred.id === twoHundred.id ||
    fourHundred.segment_id === twoHundred.segment_id ||
    fourHundred.segment_ordinal >= twoHundred.segment_ordinal ||
    fourHundred.segment_end_offset_ms > twoHundred.segment_start_offset_ms ||
    fourHundred.recorded_at.getTime() > twoHundred.recorded_at.getTime()
  ) {
    return rejected("css_effort_order_invalid");
  }

  if (
    evaluateCssFrom400m200mTest({
      time400Seconds: fourHundred.duration_seconds,
      time200Seconds: twoHundred.duration_seconds,
    }).status !== "available"
  ) {
    return rejected("css_protocol_invalid");
  }

  const evidenceId = canonicalEvidenceId({
    activityId: input.activityId,
    artifactDigest: currentArtifact.digest,
    evidenceRevision: activity.segments_revision,
    poolLengthMeters: poolLength,
    efforts: [fourHundred, twoHundred],
  });
  const commonEffort = {
    protocolId,
    evidenceRevision: activity.segments_revision,
    athleteId: input.profileId,
    unit: "seconds" as const,
    activityId: input.activityId,
    sourceArtifactId: currentArtifact.artifact_id,
    environment: "pool" as const,
    poolLengthMeters: poolLength,
    timingBasis: "pool_length_timing" as const,
    timingCoverage: "complete" as const,
    calculationVersion: SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION,
  };
  const evidence = canonicalSwimCssProtocolEvidenceSchema.parse({
    protocolId,
    observationId: input.observationId,
    evidenceId,
    evidenceRevision: activity.segments_revision,
    athleteId: input.profileId,
    activityId: input.activityId,
    recordedAt: twoHundred.recorded_at.toISOString(),
    sourceArtifactId: currentArtifact.artifact_id,
    sourceArtifactDigest: currentArtifact.digest,
    environment: "pool",
    poolLengthMeters: poolLength,
    timingBasis: "pool_length_timing",
    protocol: CSS_TEST_PROTOCOL,
    status: "qualified",
    reasons: [],
    calculationVersion: SWIMMING_CSS_PROTOCOL_EVIDENCE_VERSION,
    efforts: [
      {
        ...commonEffort,
        observationId: fourHundred.id,
        distanceMeters: 400,
        sequence: 1,
        activeDurationSeconds: fourHundred.duration_seconds,
        segmentId: fourHundred.segment_id,
        recordedAt: fourHundred.recorded_at.toISOString(),
        startOffsetMs: fourHundred.segment_start_offset_ms,
        endOffsetMs: fourHundred.segment_end_offset_ms,
      },
      {
        ...commonEffort,
        observationId: twoHundred.id,
        distanceMeters: 200,
        sequence: 2,
        activeDurationSeconds: twoHundred.duration_seconds,
        segmentId: twoHundred.segment_id,
        recordedAt: twoHundred.recorded_at.toISOString(),
        startOffsetMs: twoHundred.segment_start_offset_ms,
        endOffsetMs: twoHundred.segment_end_offset_ms,
      },
    ],
  });
  return { status: "qualified", reasons: [], evidence };
}

async function persistQualification(
  tx: SwimmingCssProtocolEvidenceTransaction,
  input: { activityId: string; profileId: string; now: Date },
  result: Extract<SwimmingCssProtocolReconciliationResult, { status: "qualified" }>,
): Promise<void> {
  const [fourHundred, twoHundred] = result.evidence.efforts;
  await upsertSwimmingCssProtocolEvidence(tx, {
    id: result.evidence.observationId,
    protocol_id: result.evidence.protocolId,
    evidence_id: result.evidence.evidenceId,
    evidence_revision: result.evidence.evidenceRevision,
    profile_id: input.profileId,
    activity_id: input.activityId,
    source_artifact_id: result.evidence.sourceArtifactId,
    source_artifact_digest: result.evidence.sourceArtifactDigest,
    observed_at: new Date(result.evidence.recordedAt),
    protocol: result.evidence.protocol,
    environment: result.evidence.environment,
    pool_length_meters: result.evidence.poolLengthMeters,
    timing_basis: result.evidence.timingBasis,
    status: result.evidence.status,
    reasons: result.evidence.reasons,
    effort_400_id: fourHundred.observationId,
    effort_400_evidence_revision: fourHundred.evidenceRevision,
    effort_400_segment_id: fourHundred.segmentId,
    effort_400_observed_at: new Date(fourHundred.recordedAt),
    effort_400_duration_seconds: fourHundred.activeDurationSeconds,
    effort_400_start_offset_ms: fourHundred.startOffsetMs,
    effort_400_end_offset_ms: fourHundred.endOffsetMs,
    effort_200_id: twoHundred.observationId,
    effort_200_evidence_revision: twoHundred.evidenceRevision,
    effort_200_segment_id: twoHundred.segmentId,
    effort_200_observed_at: new Date(twoHundred.recordedAt),
    effort_200_duration_seconds: twoHundred.activeDurationSeconds,
    effort_200_start_offset_ms: twoHundred.startOffsetMs,
    effort_200_end_offset_ms: twoHundred.endOffsetMs,
    calculation_version: result.evidence.calculationVersion,
    created_at: input.now,
    updated_at: input.now,
  });
}

/** Reconciles protocol evidence while the caller already owns the athlete evidence lock. */
export async function reconcileSwimmingCssProtocolEvidenceWithProfileLockHeld(
  tx: TransactionClient,
  input: { activityId: string; profileId: string; now: Date },
): Promise<SwimmingCssProtocolReconciliationResult> {
  const snapshot = await readSwimmingCssProtocolSourceSnapshot(tx, input);
  const result = qualifySwimmingCssProtocolSourceSnapshot({
    ...input,
    observationId: snapshot.existingEvidence?.id ?? randomUUID(),
    snapshot,
  });
  if (result.status === "rejected") {
    await deleteSwimmingCssProtocolEvidenceForActivity(tx, input);
    return result;
  }
  await persistQualification(tx, input, result);
  return result;
}

/** Transactional application entrypoint for explicit activity requalification. */
export async function reconcileSwimmingCssProtocolEvidence(
  db: DbClient,
  input: { activityId: string; profileId: string; now: Date },
): Promise<SwimmingCssProtocolReconciliationResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.profileId}, 0))`);
    return reconcileSwimmingCssProtocolEvidenceWithProfileLockHeld(tx, input);
  });
}
