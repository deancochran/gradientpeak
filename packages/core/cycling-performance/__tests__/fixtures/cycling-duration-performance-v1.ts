import type { CanonicalCyclingDurationEffortEvidence } from "../../../duration-performance/contracts";
import type { CyclingDurationPerformanceInput } from "../../contracts";

interface EffortFixtureInput {
  evidenceId: string;
  athleteId?: string;
  activityId: string;
  durationSeconds: number;
  powerWatts: number;
  recordedAt?: string;
  extractionStatus?: "available" | "partial";
  sourceTimeCoverage?: number;
}

export function cyclingEffortFixture(
  input: EffortFixtureInput,
): CanonicalCyclingDurationEffortEvidence {
  const extractionStatus = input.extractionStatus ?? "available";
  const segmentId = `segment-${input.activityId}`;
  const observationId = `observation-${input.evidenceId}`;
  return {
    observationId,
    evidenceId: input.evidenceId,
    evidenceRevision: 1,
    athleteId: input.athleteId ?? "athlete-1",
    activityId: input.activityId,
    segmentId,
    recordedAt: input.recordedAt ?? "2026-06-30T00:00:00.000Z",
    activityCategory: "bike",
    metric: "power",
    durationSeconds: input.durationSeconds,
    value: input.powerWatts,
    unit: "watts",
    evidenceContext: { kind: "cycling_power" },
    source: "imported",
    method: "activity_file_best_effort",
    calculationVersion: "best-effort-extraction-v1",
    provenance: {
      observationId,
      activityId: input.activityId,
      segmentId,
      derivedFrom: "activity_file_stream",
      sourceSeries: "power",
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

const input: CyclingDurationPerformanceInput = {
  contractVersion: "cycling-duration-performance-input-v1",
  assessmentAsOf: "2026-07-01T00:00:00.000Z",
  athleteId: "athlete-1",
  effortReadCoverage: { state: "complete", reason: null },
  efforts: [
    cyclingEffortFixture({
      evidenceId: "effort-5",
      activityId: "ride-sprint-a",
      durationSeconds: 5,
      powerWatts: 1_200,
    }),
    cyclingEffortFixture({
      evidenceId: "effort-10",
      activityId: "ride-sprint-b",
      durationSeconds: 10,
      powerWatts: 950,
    }),
    cyclingEffortFixture({
      evidenceId: "effort-30",
      activityId: "ride-short-a",
      durationSeconds: 30,
      powerWatts: 700,
    }),
    cyclingEffortFixture({
      evidenceId: "effort-60",
      activityId: "ride-short-b",
      durationSeconds: 60,
      powerWatts: 500,
    }),
    cyclingEffortFixture({
      evidenceId: "effort-300",
      activityId: "ride-cp-a",
      durationSeconds: 300,
      powerWatts: 320,
    }),
    cyclingEffortFixture({
      evidenceId: "effort-600",
      activityId: "ride-cp-b",
      durationSeconds: 600,
      powerWatts: 280,
    }),
    cyclingEffortFixture({
      evidenceId: "effort-1200",
      activityId: "ride-cp-c",
      durationSeconds: 1_200,
      powerWatts: 260,
    }),
    cyclingEffortFixture({
      evidenceId: "effort-1800",
      activityId: "ride-cp-d",
      durationSeconds: 1_800,
      powerWatts: 253.33333333333334,
    }),
    cyclingEffortFixture({
      evidenceId: "effort-3600",
      activityId: "ride-long-a",
      durationSeconds: 3_600,
      powerWatts: 246.66666666666666,
    }),
  ],
};

/** Literal, hand-checkable synthetic evidence. Expected values are not produced by production code. */
export const CYCLING_DURATION_PERFORMANCE_FIXTURE_V1 = {
  version: "cycling-duration-performance-fixture-v1",
  rationale: [
    "The four CP fit powers are literal values of 240 W + 24000 J / duration seconds.",
    "The five, thirty, and sixty second values are literal monotonic short-duration evidence.",
    "The one-hour value is the literal 240 W + 24000 J / 3600 s reference for retention.",
    "Distinct activity IDs make the accepted fit and duration-retention comparison multi-activity.",
  ],
  tolerances: {
    watts: 1e-9,
    joules: 1e-6,
    seconds: 1e-6,
    ratio: 1e-12,
  },
  input,
  expected: {
    curvePowersByDuration: [
      [5, 1_200],
      [10, 950],
      [30, 700],
      [60, 500],
      [300, 320],
      [600, 280],
      [1_200, 260],
      [1_800, 253.33333333333334],
      [3_600, 246.66666666666666],
    ],
    fiveSecondPowerWatts: 1_200,
    criticalPowerWatts: 240,
    gradientPeakReserveJoules: 24_000,
    planningThresholdPowerWatts: 247,
    modeledTimeToExhaustionSeconds: 3_428.5714285714284,
    durationRetentionRatio: 0.9487179487179487,
    shortDurationCapacity: {
      fiveSecondPowerWatts: 1_200,
      thirtySecondPowerWatts: 700,
      sixtySecondPowerWatts: 500,
    },
    longDurationPowerWatts: 246.66666666666666,
    expiresAt: "2026-09-28T00:00:00.000Z",
  },
};
