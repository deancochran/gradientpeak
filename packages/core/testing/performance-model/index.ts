import {
  CYCLING_DURATION_PERFORMANCE_INPUT_VERSION,
  calculateCyclingDurationPerformance,
} from "../../cycling-performance";
import {
  type CanonicalCyclingDurationEffortEvidence,
  calculateRunningDurationPerformance,
  calculateStrengthOtherPerformance,
  calculateSwimmingDurationPerformance,
  RUNNING_DURATION_PERFORMANCE_INPUT_VERSION,
  STRENGTH_OTHER_PERFORMANCE_INPUT_VERSION,
  SWIMMING_DURATION_PERFORMANCE_INPUT_VERSION,
} from "../../duration-performance";
import {
  ATHLETE_PERFORMANCE_MODEL_SNAPSHOT_VERSION,
  type AthletePerformanceModelSnapshot,
  type AthletePerformanceOverview,
  type AthletePerformanceTargetFacts,
  athletePerformanceModelSnapshotSchema,
  createUnavailableAthletePerformanceTargetFacts,
  materializeAthletePerformanceTargetFacts,
  projectAthletePerformanceOverview,
} from "../../performance-model";

type Category = "bike" | "run" | "swim";

/** Full canonical snapshot with hand-checkable cycling evidence. */
export function buildPerformanceModelSnapshotFixture(
  input: { asOf?: string; athleteId?: string; evidenceRecordedAt?: string } = {},
): AthletePerformanceModelSnapshot {
  const asOf = input.asOf ?? "2026-07-31T12:00:00.000Z";
  const athleteId = input.athleteId ?? "test-athlete";
  const recordedAt =
    input.evidenceRecordedAt ?? new Date(Date.parse(asOf) - 86_400_000).toISOString();
  const cyclingPowers = [
    [5, 1_200],
    [30, 700],
    [60, 500],
    [300, 320],
    [600, 280],
    [1_200, 260],
    [1_800, 253.33333333333334],
    [3_600, 246.66666666666666],
  ] as const;
  const cyclingEfforts: CanonicalCyclingDurationEffortEvidence[] = cyclingPowers.map(
    ([durationSeconds, powerWatts], index) => {
      const evidenceId = `cycling-evidence-${durationSeconds}`;
      const activityId = `cycling-activity-${index}`;
      const segmentId = `cycling-segment-${index}`;
      const observationId = `cycling-observation-${durationSeconds}`;
      return {
        observationId,
        evidenceId,
        evidenceRevision: 1,
        athleteId,
        activityId,
        segmentId,
        recordedAt,
        activityCategory: "bike",
        metric: "power",
        durationSeconds,
        value: powerWatts,
        unit: "watts",
        evidenceContext: { kind: "cycling_power" },
        source: "imported",
        method: "activity_file_best_effort",
        calculationVersion: "best-effort-extraction-v1",
        provenance: {
          observationId,
          activityId,
          segmentId,
          derivedFrom: "activity_file_stream",
          sourceSeries: "power",
          exactWindowStartOffsetSeconds: 0,
          exactWindowEndOffsetSeconds: durationSeconds,
          durationSeconds,
          contributingDurationSeconds: durationSeconds,
          windowCoverage: 1,
          sourceTimeCoverage: 1,
          extractionStatus: "available",
          extractionReason: null,
          calculationVersion: "best-effort-extraction-v1",
        },
      };
    },
  );
  const emptyCoverage = { state: "complete" as const, reason: null };
  const bike = calculateCyclingDurationPerformance({
    contractVersion: CYCLING_DURATION_PERFORMANCE_INPUT_VERSION,
    assessmentAsOf: asOf,
    athleteId,
    effortReadCoverage: emptyCoverage,
    efforts: cyclingEfforts,
  });
  const run = calculateRunningDurationPerformance({
    contractVersion: RUNNING_DURATION_PERFORMANCE_INPUT_VERSION,
    assessmentAsOf: asOf,
    athleteId,
    effortReadCoverage: emptyCoverage,
    efforts: [],
  });
  const swim = calculateSwimmingDurationPerformance({
    contractVersion: SWIMMING_DURATION_PERFORMANCE_INPUT_VERSION,
    assessmentAsOf: asOf,
    athleteId,
    evidenceReadCoverage: emptyCoverage,
    efforts: [],
    repeatedEffortProtocols: [],
  });
  const emptySessionModel = (activityCategory: "strength" | "other") =>
    calculateStrengthOtherPerformance({
      contractVersion: STRENGTH_OTHER_PERFORMANCE_INPUT_VERSION,
      assessmentAsOf: asOf,
      athleteId,
      activityCategory,
      evidenceReadCoverage: emptyCoverage,
      observations: [],
      repeatedEffortProtocols: [],
    });
  const unavailableTargets = createUnavailableAthletePerformanceTargetFacts(asOf, athleteId);
  return athletePerformanceModelSnapshotSchema.parse({
    contractVersion: ATHLETE_PERFORMANCE_MODEL_SNAPSHOT_VERSION,
    athleteId,
    asOf,
    categories: {
      bike,
      run,
      swim,
      strength: emptySessionModel("strength"),
      other: emptySessionModel("other"),
    },
    heartRate: unavailableTargets.heartRate,
  });
}

/** Athlete-safe overview fixture projected through the production boundary. */
export function buildPerformanceOverviewFixture(
  input: { asOf?: string; athleteId?: string } = {},
): AthletePerformanceOverview {
  return projectAthletePerformanceOverview(
    buildPerformanceTargetFactsFixture({
      ...input,
      bikeThresholdWatts: 250,
      runThresholdMetersPerSecond: 4,
      swimThresholdMetersPerSecond: 1.25,
    }),
  );
}

/** Strict canonical target-fact fixture shared by package and application tests. */
export function buildPerformanceTargetFactsFixture(
  input: {
    asOf?: string;
    athleteId?: string;
    expiresAt?: string;
    heartRateObservedAt?: string;
    calculationVersion?: string;
    thresholdEffectiveAt?: string;
    bikeThresholdWatts?: number;
    runThresholdMetersPerSecond?: number;
    swimThresholdMetersPerSecond?: number;
    lthrBpm?: Partial<Record<Category, number>>;
    maxHrBpm?: Partial<Record<Category, number>>;
  } = {},
): AthletePerformanceTargetFacts {
  const asOf = input.asOf ?? "2026-02-28T12:00:00.000Z";
  const expiresAt = input.expiresAt ?? "2026-10-29T12:00:00.000Z";
  const calculationVersion = input.calculationVersion ?? "threshold-policy-v1";
  const thresholdEffectiveAt =
    input.thresholdEffectiveAt ?? new Date(Date.parse(asOf) - 86_400_000).toISOString();
  const unavailable = createUnavailableAthletePerformanceTargetFacts(
    asOf,
    input.athleteId ?? "test-athlete",
  );
  const heartRate = (
    category: Category,
    metric: "lthr" | "max_hr",
    valueBpm: number | undefined,
  ) => {
    const fact =
      metric === "lthr"
        ? unavailable.heartRate[category].lthr
        : unavailable.heartRate[category].maxHr;
    return valueBpm === undefined
      ? fact
      : {
          ...fact,
          status: "available" as const,
          calibrationState: "confirmed" as const,
          valueBpm,
          observedAt: input.heartRateObservedAt ?? asOf,
          expiresAt,
          sourceEvidenceId: `${category}-${metric}-evidence`,
          sourceActivityId: `${category}-${metric}-activity`,
          source: "activity_file" as const,
          method:
            metric === "lthr"
              ? ("activity_file_lthr_detection" as const)
              : ("max_hr_progressive_test_v1" as const),
          calculationVersion:
            metric === "lthr"
              ? ("activity-file-lthr-v1" as const)
              : ("max_hr_progressive_test_v1" as const),
          reason: null,
        };
  };
  const categoryHeartRate = (category: Category) => ({
    lthr: heartRate(category, "lthr", input.lthrBpm?.[category]),
    maxHr: heartRate(category, "max_hr", input.maxHrBpm?.[category]),
  });
  const thresholdSources = [
    ...(input.bikeThresholdWatts === undefined
      ? []
      : [
          {
            activityCategory: "bike" as const,
            metric: "power" as const,
            unit: "watts" as const,
            method: "bike_power_30m" as const,
            value: input.bikeThresholdWatts,
          },
        ]),
    ...(input.runThresholdMetersPerSecond === undefined
      ? []
      : [
          {
            activityCategory: "run" as const,
            metric: "speed" as const,
            unit: "meters_per_second" as const,
            method: "run_speed_30m" as const,
            value: input.runThresholdMetersPerSecond,
          },
        ]),
    ...(input.swimThresholdMetersPerSecond === undefined
      ? []
      : [
          {
            activityCategory: "swim" as const,
            metric: "speed" as const,
            unit: "meters_per_second" as const,
            method: "swim_speed_15m" as const,
            value: input.swimThresholdMetersPerSecond,
          },
        ]),
  ].map((threshold) => ({
    ...threshold,
    id: `${threshold.activityCategory}-threshold-test-fixture`,
    status: "available" as const,
    effectiveAt: thresholdEffectiveAt,
    policyVersion: calculationVersion,
    state: "confirmed" as const,
    confidence: 0.9,
    sourceEvaluationIds: [`${threshold.activityCategory}-evaluation-test-fixture`],
    sourceEffortIds: [`${threshold.activityCategory}-effort-test-fixture`],
    sourceActivityIds: [`${threshold.activityCategory}-activity-test-fixture`],
  }));
  return materializeAthletePerformanceTargetFacts({
    athleteId: input.athleteId ?? "test-athlete",
    asOf,
    thresholds: thresholdSources,
    heartRate: {
      bike: categoryHeartRate("bike"),
      run: categoryHeartRate("run"),
      swim: categoryHeartRate("swim"),
    },
  });
}
