import type {
  CanonicalRunningDurationEffortEvidence,
  CanonicalSwimmingDurationEffortEvidence,
} from "../../contracts";
import type { RunningDurationPerformanceInput } from "../../running";
import type {
  CanonicalSessionPerformanceEvidence,
  CanonicalSessionRepeatProtocolEvidence,
  StrengthOtherPerformanceInput,
} from "../../strength-other";
import type {
  CanonicalSwimRepeatedEffortProtocolEvidence,
  SwimmingDurationPerformanceInput,
} from "../../swimming";

interface RunningEffortFixtureInput {
  evidenceId: string;
  activityId: string;
  durationSeconds: number;
  speedMetersPerSecond: number;
  basis?: "raw_speed" | "grade_adjusted_speed";
  recordedAt?: string;
  extractionStatus?: "available" | "partial";
  sourceTimeCoverage?: number;
  athleteId?: string;
}

export function runningEffortFixture(
  input: RunningEffortFixtureInput,
): CanonicalRunningDurationEffortEvidence {
  const observationId = `observation-${input.evidenceId}`;
  const segmentId = `segment-${input.evidenceId}`;
  const basis = input.basis ?? "raw_speed";
  const extractionStatus = input.extractionStatus ?? "available";
  return {
    observationId,
    evidenceId: input.evidenceId,
    evidenceRevision: 1,
    athleteId: input.athleteId ?? "athlete-1",
    activityId: input.activityId,
    segmentId,
    recordedAt: input.recordedAt ?? "2026-06-30T00:00:00.000Z",
    durationSeconds: input.durationSeconds,
    source: "imported",
    method: "activity_file_best_effort",
    calculationVersion: "best-effort-extraction-v1",
    activityCategory: "run",
    metric: "speed",
    value: input.speedMetersPerSecond,
    unit: "meters_per_second",
    evidenceContext: { kind: "running_speed", basis },
    provenance: {
      observationId,
      activityId: input.activityId,
      segmentId,
      derivedFrom: "activity_file_stream",
      sourceSeries: basis,
      exactWindowStartOffsetSeconds: 0,
      exactWindowEndOffsetSeconds: input.durationSeconds,
      durationSeconds: input.durationSeconds,
      contributingDurationSeconds: input.durationSeconds,
      windowCoverage: 1,
      sourceTimeCoverage: input.sourceTimeCoverage ?? 1,
      extractionStatus,
      extractionReason: extractionStatus === "partial" ? "source_incomplete" : null,
      calculationVersion: "best-effort-extraction-v1",
    },
  };
}

interface SwimmingEffortFixtureInput {
  evidenceId: string;
  activityId: string;
  durationSeconds: number;
  speedMetersPerSecond: number;
  environment?: "pool" | "open_water";
  recordedAt?: string;
  athleteId?: string;
  extractionStatus?: "available" | "partial";
  sourceTimeCoverage?: number;
}

export function swimmingEffortFixture(
  input: SwimmingEffortFixtureInput,
): CanonicalSwimmingDurationEffortEvidence {
  const observationId = `observation-${input.evidenceId}`;
  const segmentId = `segment-${input.evidenceId}`;
  const environment = input.environment ?? "pool";
  const extractionStatus = input.extractionStatus ?? "available";
  return {
    observationId,
    evidenceId: input.evidenceId,
    evidenceRevision: 1,
    athleteId: input.athleteId ?? "athlete-1",
    activityId: input.activityId,
    segmentId,
    recordedAt: input.recordedAt ?? "2026-06-30T00:00:00.000Z",
    durationSeconds: input.durationSeconds,
    source: "imported",
    method: "activity_file_best_effort",
    calculationVersion: "best-effort-extraction-v1",
    activityCategory: "swim",
    metric: "speed",
    value: input.speedMetersPerSecond,
    unit: "meters_per_second",
    evidenceContext: {
      kind: "swimming_speed",
      environment,
      timingBasis: environment === "pool" ? "pool_length_timing" : "open_water_continuous_timing",
      poolLengthMeters: environment === "pool" ? 25 : null,
    },
    provenance: {
      observationId,
      activityId: input.activityId,
      segmentId,
      derivedFrom: "activity_file_stream",
      sourceSeries: "swim_speed",
      exactWindowStartOffsetSeconds: 0,
      exactWindowEndOffsetSeconds: input.durationSeconds,
      durationSeconds: input.durationSeconds,
      contributingDurationSeconds: input.durationSeconds,
      windowCoverage: 1,
      sourceTimeCoverage: input.sourceTimeCoverage ?? 1,
      extractionStatus,
      extractionReason: extractionStatus === "partial" ? "source_incomplete" : null,
      calculationVersion: "best-effort-extraction-v1",
    },
  };
}

const runningEfforts = [
  [30, 8.5],
  [60, 7.5],
  [180, 4 + 400 / 180],
  [300, 4 + 400 / 300],
  [600, 4 + 400 / 600],
  [1_200, 4 + 400 / 1_200],
  [1_800, 4 + 400 / 1_800],
  [3_600, 4 + 400 / 3_600],
].map(([durationSeconds, speedMetersPerSecond], index) =>
  runningEffortFixture({
    evidenceId: `run-${durationSeconds}`,
    activityId: `run-activity-${index}`,
    durationSeconds: durationSeconds ?? 0,
    speedMetersPerSecond: speedMetersPerSecond ?? 0,
  }),
);

const runningInput: RunningDurationPerformanceInput = {
  contractVersion: "running-duration-performance-input-v1",
  assessmentAsOf: "2026-07-01T00:00:00.000Z",
  athleteId: "athlete-1",
  effortReadCoverage: { state: "complete", reason: null },
  efforts: runningEfforts,
};

export const RUNNING_DURATION_PERFORMANCE_FIXTURE_V1 = {
  version: "running-duration-performance-fixture-v1",
  input: runningInput,
  expected: {
    criticalSpeedMetersPerSecond: 4,
    distanceReserveMeters: 400,
    planningThresholdSpeedMetersPerSecond: (4 + 400 / 1_200) * 0.95,
    durationRetentionRatio: (4 + 400 / 3_600) / (4 + 400 / 1_200),
  },
};

const swimmingEfforts = [
  [30, 2.2],
  [60, 1.9],
  [120, 1.7],
  [300, 1.5],
  [600, 1.4],
  [1_200, 1.3],
  [1_800, 1.25],
].map(([durationSeconds, speedMetersPerSecond], index) =>
  swimmingEffortFixture({
    evidenceId: `swim-${durationSeconds}`,
    activityId: `swim-activity-${index}`,
    durationSeconds: durationSeconds ?? 0,
    speedMetersPerSecond: speedMetersPerSecond ?? 0,
  }),
);

export const SWIM_REPEAT_PROTOCOL_FIXTURE: CanonicalSwimRepeatedEffortProtocolEvidence = {
  observationId: "observation-swim-repeat",
  evidenceId: "swim-repeat",
  evidenceRevision: 1,
  athleteId: "athlete-1",
  activityId: "swim-repeat-activity",
  recordedAt: "2026-06-28T00:00:00.000Z",
  environment: "pool",
  poolLengthMeters: 25,
  protocol: "fixed_distance_maximal_repeats",
  intent: "maximal_repeatability",
  distanceMetersPerRepetition: 100,
  distanceUnit: "meters",
  calculationVersion: "qualified-swim-repeat-protocol-v1",
  repetitions: [
    {
      repetitionNumber: 1,
      segmentId: "repeat-1",
      activeDurationSeconds: 65,
      timingCoverage: "complete",
    },
    {
      repetitionNumber: 2,
      segmentId: "repeat-2",
      activeDurationSeconds: 68,
      timingCoverage: "complete",
    },
    {
      repetitionNumber: 3,
      segmentId: "repeat-3",
      activeDurationSeconds: 70,
      timingCoverage: "complete",
    },
  ],
  recoveries: [
    { afterRepetitionNumber: 1, durationSeconds: 30, timingCoverage: "complete" },
    { afterRepetitionNumber: 2, durationSeconds: 30, timingCoverage: "complete" },
  ],
};

const swimmingInput: SwimmingDurationPerformanceInput = {
  contractVersion: "swimming-duration-performance-input-v1",
  assessmentAsOf: "2026-07-01T00:00:00.000Z",
  athleteId: "athlete-1",
  evidenceReadCoverage: { state: "complete", reason: null },
  efforts: swimmingEfforts,
  repeatedEffortProtocols: [SWIM_REPEAT_PROTOCOL_FIXTURE],
};

export const SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1 = {
  version: "swimming-duration-performance-fixture-v1",
  input: swimmingInput,
  expected: {
    repeatedFinalRetentionRatio: 65 / 70,
    repeatedMaximumLossRatio: 1 - 65 / 70,
  },
};

interface SessionFixtureInput {
  evidenceId: string;
  activityId: string;
  category: "strength" | "other";
  rpe: number;
  activeDurationSeconds: number | null;
  repetitions: number | null;
  athleteId?: string;
  recordedAt?: string;
}

export function sessionEvidenceFixture(
  input: SessionFixtureInput,
): CanonicalSessionPerformanceEvidence {
  const observationId = `observation-${input.evidenceId}`;
  const segmentId = `segment-${input.evidenceId}`;
  return {
    observationId,
    evidenceId: input.evidenceId,
    evidenceRevision: 1,
    athleteId: input.athleteId ?? "athlete-1",
    activityId: input.activityId,
    segmentId,
    recordedAt: input.recordedAt ?? "2026-06-30T00:00:00.000Z",
    activityCategory: input.category,
    rpe: { value: input.rpe, unit: "rpe_0_10", scale: "borg_cr10", scaleVersion: "1" },
    duration:
      input.activeDurationSeconds === null
        ? {
            status: "unavailable",
            activeDurationSeconds: null,
            unit: "seconds",
            reason: "not_observed",
          }
        : {
            status: "available",
            activeDurationSeconds: input.activeDurationSeconds,
            unit: "seconds",
            reason: null,
          },
    repetitions:
      input.repetitions === null
        ? { status: "unavailable", count: null, unit: "repetitions", reason: "not_observed" }
        : { status: "available", count: input.repetitions, unit: "repetitions", reason: null },
    source: "completed_activity_evidence",
    calculationVersion: "qualified-session-performance-evidence-v1",
    provenance: {
      observationId,
      activityId: input.activityId,
      segmentId,
      derivedFrom: "completed_activity_facts",
      rpeSource: "completed_session_rpe",
      calculationVersion: "qualified-session-performance-evidence-v1",
    },
  };
}

export const STRENGTH_REPEAT_PROTOCOL_FIXTURE: CanonicalSessionRepeatProtocolEvidence = {
  observationId: "observation-strength-repeat",
  evidenceId: "strength-repeat",
  evidenceRevision: 1,
  athleteId: "athlete-1",
  activityId: "strength-repeat-activity",
  recordedAt: "2026-06-29T00:00:00.000Z",
  activityCategory: "strength",
  protocol: "fixed_resistance_repetition_sets",
  exerciseId: "back-squat",
  resistance: { kind: "fixed_external_load", loadKilograms: 80 },
  bouts: [
    { boutNumber: 1, segmentId: "set-1", completedRepetitions: 10, rpe: 7 },
    { boutNumber: 2, segmentId: "set-2", completedRepetitions: 9, rpe: 8 },
    { boutNumber: 3, segmentId: "set-3", completedRepetitions: 8, rpe: 9 },
  ],
  recoveries: [
    { afterBoutNumber: 1, durationSeconds: 120, timingCoverage: "complete" },
    { afterBoutNumber: 2, durationSeconds: 120, timingCoverage: "complete" },
  ],
  calculationVersion: "qualified-strength-repeat-protocol-v1",
};

const strengthInput: StrengthOtherPerformanceInput = {
  contractVersion: "strength-other-performance-input-v1",
  assessmentAsOf: "2026-07-01T00:00:00.000Z",
  athleteId: "athlete-1",
  activityCategory: "strength",
  evidenceReadCoverage: { state: "complete", reason: null },
  observations: [
    sessionEvidenceFixture({
      evidenceId: "strength-session-1",
      activityId: "strength-activity-1",
      category: "strength",
      rpe: 7,
      activeDurationSeconds: 1_800,
      repetitions: 50,
    }),
    sessionEvidenceFixture({
      evidenceId: "strength-session-2",
      activityId: "strength-activity-2",
      category: "strength",
      rpe: 8,
      activeDurationSeconds: 2_400,
      repetitions: 60,
    }),
  ],
  repeatedEffortProtocols: [STRENGTH_REPEAT_PROTOCOL_FIXTURE],
};

export const STRENGTH_PERFORMANCE_FIXTURE_V1 = {
  version: "strength-performance-fixture-v1",
  input: strengthInput,
  expected: {
    totalRepetitions: 110,
    repetitionsPerActiveMinute: 110 / 70,
    repetitionRpePoints: 50 * 7 + 60 * 8,
    finalRepetitionRetentionRatio: 0.8,
  },
};

export const OTHER_REPEAT_PROTOCOL_FIXTURE: CanonicalSessionRepeatProtocolEvidence = {
  observationId: "observation-other-repeat",
  evidenceId: "other-repeat",
  evidenceRevision: 1,
  athleteId: "athlete-1",
  activityId: "other-repeat-activity",
  recordedAt: "2026-06-29T00:00:00.000Z",
  activityCategory: "other",
  protocol: "fixed_duration_rpe_repeats",
  workIdentity: "rowing-erg-fixed-effort",
  workDurationSecondsPerBout: 300,
  bouts: [
    { boutNumber: 1, segmentId: "other-bout-1", completedDurationSeconds: 300, rpe: 6 },
    { boutNumber: 2, segmentId: "other-bout-2", completedDurationSeconds: 300, rpe: 7 },
    { boutNumber: 3, segmentId: "other-bout-3", completedDurationSeconds: 300, rpe: 8 },
  ],
  recoveries: [
    { afterBoutNumber: 1, durationSeconds: 90, timingCoverage: "complete" },
    { afterBoutNumber: 2, durationSeconds: 90, timingCoverage: "complete" },
  ],
  calculationVersion: "qualified-other-repeat-protocol-v1",
};

const otherInput: StrengthOtherPerformanceInput = {
  contractVersion: "strength-other-performance-input-v1",
  assessmentAsOf: "2026-07-01T00:00:00.000Z",
  athleteId: "athlete-1",
  activityCategory: "other",
  evidenceReadCoverage: { state: "complete", reason: null },
  observations: [
    sessionEvidenceFixture({
      evidenceId: "other-session-1",
      activityId: "other-activity-1",
      category: "other",
      rpe: 6,
      activeDurationSeconds: 3_600,
      repetitions: null,
    }),
  ],
  repeatedEffortProtocols: [OTHER_REPEAT_PROTOCOL_FIXTURE],
};

export const OTHER_PERFORMANCE_FIXTURE_V1 = {
  version: "other-performance-fixture-v1",
  input: otherInput,
  expected: { minuteRpePoints: 360, rpeDrift: 2 },
};
