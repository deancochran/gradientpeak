import {
  ATHLETE_PERFORMANCE_MODEL_SNAPSHOT_VERSION,
  type AthletePerformanceModelSnapshot,
  type AthletePerformanceTargetFacts,
  athletePerformanceModelSnapshotSchema,
  CYCLING_DURATION_PERFORMANCE_INPUT_VERSION,
  calculateCyclingDurationPerformance,
  calculateRunningDurationPerformance,
  calculateStrengthOtherPerformance,
  calculateSwimmingDurationPerformance,
  HEART_RATE_CALIBRATION_POLICY_VERSION,
  heartRateCalibrationFactSchema,
  projectAthletePerformanceTargetFacts,
  RUNNING_DURATION_PERFORMANCE_INPUT_VERSION,
  STRENGTH_OTHER_PERFORMANCE_INPUT_VERSION,
  SWIMMING_DURATION_PERFORMANCE_INPUT_VERSION,
} from "@repo/core";
import { z } from "zod";
import {
  type AthletePerformanceEvidenceReads,
  type AthletePerformanceModelReadInput,
  type AthletePerformanceModelRepository,
  adaptActivityEffortToCanonicalPerformanceEvidence,
  adaptQualifiedSwimmingCssProtocolEvidence,
  adaptQualifiedSwimmingPerformanceEvidence,
  type HeartRateCalibrationCandidateRow,
} from "../../repositories/athlete-performance-model-repository";

const HEART_RATE_FRESHNESS_WINDOW_MS = 90 * 86_400_000;
const uuidSchema = z.string().uuid();

const maxHrProvenanceSchema = z
  .object({
    activity_id: uuidSchema,
    segment_id: uuidSchema,
    derived_from: z.literal("progressive_max_hr_test"),
    protocol: z.literal("progressive_max_hr"),
    source_series: z.literal("heart_rate"),
    calculation_version: z.literal("max_hr_progressive_test_v1"),
  })
  .strict();

type ActivityCategory = "bike" | "run" | "swim";
type HeartRateMetric = "lthr" | "max_hr";

function unavailableHeartRateFact(input: {
  activityCategory: ActivityCategory;
  metric: HeartRateMetric;
  reason: "no_eligible_evidence" | "stale_evidence" | "evidence_read_truncated";
}) {
  return heartRateCalibrationFactSchema.parse({
    status: "unavailable",
    activityCategory: input.activityCategory,
    metric: input.metric,
    unit: "beats_per_minute",
    policyVersion: HEART_RATE_CALIBRATION_POLICY_VERSION,
    valueBpm: null,
    observedAt: null,
    expiresAt: null,
    sourceEvidenceId: null,
    sourceActivityId: null,
    source: null,
    method: null,
    calculationVersion: null,
    reason: input.reason,
  });
}

function adaptHeartRateFact(input: {
  activityCategory: ActivityCategory;
  metric: "max_hr";
  rows: readonly HeartRateCalibrationCandidateRow[];
  truncated: boolean;
  asOf: Date;
}) {
  if (input.truncated) {
    return unavailableHeartRateFact({
      activityCategory: input.activityCategory,
      metric: input.metric,
      reason: "evidence_read_truncated",
    });
  }
  const row = input.rows[0];
  if (!row) {
    return unavailableHeartRateFact({
      activityCategory: input.activityCategory,
      metric: input.metric,
      reason: "no_eligible_evidence",
    });
  }
  if (
    row.profile_id.trim().length === 0 ||
    row.metric_type !== input.metric ||
    row.activity_category !== input.activityCategory ||
    row.reference_activity_id === null ||
    row.source !== "derived" ||
    row.unit !== "bpm" ||
    !Number.isFinite(row.value) ||
    row.recorded_at.getTime() > input.asOf.getTime()
  ) {
    throw new Error("Incompatible heart-rate calibration row identity");
  }
  const expectedMethod = "max_hr_progressive_test_v1";
  const expectedCalculationVersion = "max_hr_progressive_test_v1";
  if (
    row.method !== expectedMethod ||
    row.calculation_version !== expectedCalculationVersion ||
    row.value < 100 ||
    row.value > 250
  ) {
    throw new Error("Incompatible heart-rate calibration method, version, or value");
  }

  const provenance = maxHrProvenanceSchema.parse(row.provenance);
  if (provenance.activity_id !== row.reference_activity_id) {
    throw new Error("Incompatible max-HR provenance identity");
  }

  const expiresAt = new Date(row.recorded_at.getTime() + HEART_RATE_FRESHNESS_WINDOW_MS);
  if (input.asOf.getTime() > expiresAt.getTime()) {
    return unavailableHeartRateFact({
      activityCategory: input.activityCategory,
      metric: input.metric,
      reason: "stale_evidence",
    });
  }
  return heartRateCalibrationFactSchema.parse({
    status: "available",
    activityCategory: input.activityCategory,
    metric: input.metric,
    unit: "beats_per_minute",
    policyVersion: HEART_RATE_CALIBRATION_POLICY_VERSION,
    valueBpm: row.value,
    observedAt: row.recorded_at.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sourceEvidenceId: row.id,
    sourceActivityId: row.reference_activity_id,
    source: "activity_file",
    method: expectedMethod,
    calculationVersion: expectedCalculationVersion,
    reason: null,
  });
}

/**
 * Runs each canonical Core category model over one bounded, strict as-of read.
 * No legacy CP/CSS/FTP snapshot is consulted or synthesized.
 */
export function buildAthletePerformanceModelFromEvidenceReads(
  input: AthletePerformanceModelReadInput,
  reads: AthletePerformanceEvidenceReads,
): AthletePerformanceModelSnapshot {
  if (!Number.isFinite(input.asOf.getTime())) throw new Error("Performance-model asOf is invalid");
  const { effortReads, heartRateReads, swimmingCssProtocolRead } = reads;
  const efforts = {
    bike: effortReads.bike.rows.map(adaptActivityEffortToCanonicalPerformanceEvidence),
    run: effortReads.run.rows.map(adaptActivityEffortToCanonicalPerformanceEvidence),
    swim: effortReads.swim.rows.flatMap((row) => {
      const evidence = adaptQualifiedSwimmingPerformanceEvidence(row);
      return evidence === null ? [] : [evidence];
    }),
  };
  if (efforts.bike.some((effort) => effort.activityCategory !== "bike")) {
    throw new Error("Cycling evidence repository lane returned another category");
  }
  if (efforts.run.some((effort) => effort.activityCategory !== "run")) {
    throw new Error("Running evidence repository lane returned another category");
  }
  if (efforts.swim.some((effort) => effort.activityCategory !== "swim")) {
    throw new Error("Swimming evidence repository lane returned another category");
  }
  const asOf = input.asOf.toISOString();
  const readCoverage = (truncated: boolean) =>
    truncated
      ? ({ state: "truncated", reason: "query_limit_reached" } as const)
      : ({ state: "complete", reason: null } as const);

  const bike = calculateCyclingDurationPerformance({
    contractVersion: CYCLING_DURATION_PERFORMANCE_INPUT_VERSION,
    assessmentAsOf: asOf,
    athleteId: input.athleteId,
    effortReadCoverage: readCoverage(effortReads.bike.truncated),
    efforts: efforts.bike.filter((effort) => effort.activityCategory === "bike"),
  });
  const run = calculateRunningDurationPerformance({
    contractVersion: RUNNING_DURATION_PERFORMANCE_INPUT_VERSION,
    assessmentAsOf: asOf,
    athleteId: input.athleteId,
    effortReadCoverage: readCoverage(effortReads.run.truncated),
    efforts: efforts.run.filter((effort) => effort.activityCategory === "run"),
  });
  const swim = calculateSwimmingDurationPerformance({
    contractVersion: SWIMMING_DURATION_PERFORMANCE_INPUT_VERSION,
    assessmentAsOf: asOf,
    athleteId: input.athleteId,
    evidenceReadCoverage: readCoverage(
      effortReads.swim.truncated || swimmingCssProtocolRead.truncated,
    ),
    efforts: efforts.swim.filter((effort) => effort.activityCategory === "swim"),
    cssProtocols: swimmingCssProtocolRead.rows.flatMap((row) => {
      const evidence = adaptQualifiedSwimmingCssProtocolEvidence(row);
      return evidence === null ? [] : [evidence];
    }),
    repeatedEffortProtocols: [],
  });
  const emptySessionModel = (activityCategory: "strength" | "other") =>
    calculateStrengthOtherPerformance({
      contractVersion: STRENGTH_OTHER_PERFORMANCE_INPUT_VERSION,
      assessmentAsOf: asOf,
      athleteId: input.athleteId,
      activityCategory,
      evidenceReadCoverage: { state: "complete", reason: null },
      observations: [],
      repeatedEffortProtocols: [],
    });
  const heartRate = Object.fromEntries(
    (["bike", "run", "swim"] as const).map((activityCategory) => [
      activityCategory,
      {
        // Automatic LTHR has exactly one authority: selected calibration history.
        // Legacy profile_metrics detections are intentionally not a fallback.
        lthr: unavailableHeartRateFact({
          activityCategory,
          metric: "lthr",
          reason: "no_eligible_evidence",
        }),
        maxHr: adaptHeartRateFact({
          activityCategory,
          metric: "max_hr",
          ...heartRateReads[activityCategory].maxHr,
          asOf: input.asOf,
        }),
      },
    ]),
  );

  return athletePerformanceModelSnapshotSchema.parse({
    contractVersion: ATHLETE_PERFORMANCE_MODEL_SNAPSHOT_VERSION,
    athleteId: input.athleteId,
    asOf,
    categories: {
      bike,
      run,
      swim,
      strength: emptySessionModel("strength"),
      other: emptySessionModel("other"),
    },
    heartRate,
    calibrations: reads.calibrationReads ?? [],
  });
}

export async function getAthletePerformanceModelAsOf(
  input: AthletePerformanceModelReadInput,
  repository: AthletePerformanceModelRepository,
): Promise<AthletePerformanceModelSnapshot> {
  if (!Number.isFinite(input.asOf.getTime())) throw new Error("Performance-model asOf is invalid");
  const repositoryInput = {
    athleteId: input.athleteId,
    asOf: input.asOf,
    ...(input.excludedActivityId === undefined
      ? {}
      : { excludedActivityId: input.excludedActivityId }),
  };
  const evidenceSnapshot = await repository.readAthletePerformanceEvidenceSnapshot(repositoryInput);
  return buildAthletePerformanceModelFromEvidenceReads(input, evidenceSnapshot);
}

export type AthletePerformanceModelReader = (input: {
  actorProfileId: string;
  asOf: Date;
  excludedActivityId?: string;
}) => Promise<AthletePerformanceModelSnapshot>;

export type AthletePerformanceTargetFactsReader = (input: {
  actorProfileId: string;
  asOf: Date;
  excludedActivityId?: string;
}) => Promise<AthletePerformanceTargetFacts>;

export type AthletePerformanceTargetFactsBatchReader = (
  inputs: Array<{
    actorProfileId: string;
    asOf: Date;
    excludedActivityId?: string;
  }>,
) => Promise<AthletePerformanceTargetFacts[]>;

/** Binds the canonical repository once for server runtimes and provider workers. */
export function createAthletePerformanceModelReader(
  repository: AthletePerformanceModelRepository,
): AthletePerformanceModelReader {
  return (input) =>
    getAthletePerformanceModelAsOf(
      {
        athleteId: input.actorProfileId,
        asOf: input.asOf,
        ...(input.excludedActivityId === undefined
          ? {}
          : { excludedActivityId: input.excludedActivityId }),
      },
      repository,
    );
}

/** Narrow target projection for planning, recording, and outbound provider effects. */
export function createAthletePerformanceTargetFactsReader(
  repository: AthletePerformanceModelRepository,
): AthletePerformanceTargetFactsReader {
  const readModel = createAthletePerformanceModelReader(repository);
  return async (input) => projectAthletePerformanceTargetFacts(await readModel(input));
}

/** Set-based target reader for historical segment fan-out; query count is independent of batch size. */
export function createAthletePerformanceTargetFactsBatchReader(
  repository: AthletePerformanceModelRepository,
): AthletePerformanceTargetFactsBatchReader {
  return async (inputs) => {
    if (inputs.length === 0) return [];
    if (!repository.readEvidenceBatch) {
      throw new Error("Canonical performance-model batch reader is unavailable");
    }
    const repositoryInputs = inputs.map((input) => ({
      athleteId: input.actorProfileId,
      asOf: input.asOf,
      ...(input.excludedActivityId === undefined
        ? {}
        : { excludedActivityId: input.excludedActivityId }),
    }));
    const reads = await repository.readEvidenceBatch(repositoryInputs);
    if (reads.length !== inputs.length) {
      throw new Error("Canonical performance-model batch reader returned an invalid result count");
    }
    return repositoryInputs.map((repositoryInput, index) => {
      const evidenceReads = reads[index];
      if (!evidenceReads) {
        throw new Error("Canonical performance-model batch reader omitted a result");
      }
      return projectAthletePerformanceTargetFacts(
        buildAthletePerformanceModelFromEvidenceReads(repositoryInput, evidenceReads),
      );
    });
  };
}
