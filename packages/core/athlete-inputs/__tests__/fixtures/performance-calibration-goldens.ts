export type GoldenSport = "bike" | "run" | "swim";

export type GoldenCalibrationType =
  | "cycling_ftp"
  | "cycling_critical_power"
  | "running_critical_speed"
  | "running_threshold_pace"
  | "swimming_css"
  | "lthr"
  | "max_hr";

export type GoldenCalibrationUnit = "W" | "seconds_per_km" | "seconds_per_100m" | "bpm";

export type GoldenUseCase =
  | "historical_load"
  | "current_load"
  | "zones"
  | "planning"
  | "display_last_known";

export type GoldenEvidenceSource =
  | "validated_test"
  | "observed_curve"
  | "observed_effort"
  | "manual_override"
  | "provider_seed"
  | "modeled_seed"
  | "age_prior"
  | "clear";

export type GoldenMeasurement =
  | { kind: "scalar"; value: number; unit: GoldenCalibrationUnit }
  | { kind: "effort"; durationSeconds: number; value: number; unit: "W" | "m" | "bpm" }
  | {
      kind: "swim_trial";
      distanceMeters: 200 | 400;
      durationSeconds: number;
      poolLengthMeters: 25 | 50;
      stroke: "freestyle";
      timingMethod: "electronic" | "manual_stopwatch";
      continuous: true;
      aidsUsed: false;
      inTrialRestSeconds: 0;
      recoveryBeforeSeconds: number;
    }
  | {
      kind: "hr_window";
      protocolIntent: "threshold_test" | "threshold_aligned_activity";
      totalEffortDurationSeconds: number;
      durationSeconds: number;
      windowStartOffsetSeconds: number;
      meanBpm: number;
      coverageRatio: number;
      maxGapSeconds: number;
      continuous: true;
      directIntensityRatio?: number;
      directCalibrationSourceId?: string;
    }
  | {
      kind: "peak_hr";
      protocolIntent: "max_hr_test" | "ordinary_activity";
      rollingMedianSeconds: 5;
      valueBpm: number;
      coverageRatio: number;
      maxGapSeconds: number;
      progressiveProtocol: boolean;
    }
  | { kind: "clear"; targetSourceId: string };

export interface GoldenEvidence {
  sourceId: string;
  lineageGroupId: string;
  sport: GoldenSport;
  calibrationType: GoldenCalibrationType;
  source: GoldenEvidenceSource;
  method: string;
  observedAt: string;
  effectiveFrom: string;
  availableAt: string;
  measurement: GoldenMeasurement;
  lockedUntil?: string;
  activityId?: string;
  activityStartedAt?: string;
  activityCompletedAt?: string;
  operationId?: string;
  surfaceClass?: "flat_outdoor" | "track" | "treadmill";
}

export interface GoldenProfileContext {
  dateOfBirth: string;
  dateOfBirthSourceId: string;
  lineageGroupId: string;
  availableAt: string;
}

export interface GoldenActivityContext {
  activityId: string;
  lineageGroupId: string;
  sport: GoldenSport;
  startedAt: string;
  durationSeconds?: number;
  averageHrBpm?: number;
}

interface GoldenExpectedBase {
  calibrationType: GoldenCalibrationType;
  unit: GoldenCalibrationUnit;
  method: string | null;
  reasonCodes: readonly string[];
  contributingSourceIds: readonly string[];
  contributingLineageGroupIds: readonly string[];
  excluded: readonly { sourceId: string; reason: string }[];
}

export interface GoldenLastKnownCalibration {
  value: number;
  unit: GoldenCalibrationUnit;
  source: Exclude<GoldenEvidenceSource, "clear">;
  method: string;
  observedAt: string;
  effectiveFrom: string;
  availableAt: string;
  uncertainty: number;
  contributingSourceIds: readonly string[];
  contributingLineageGroupIds: readonly string[];
}

export type GoldenExpectedCalibration =
  | (GoldenExpectedBase & {
      availability: "eligible";
      freshness: "fresh" | "aging";
      resultState: "observed" | "estimated";
      value: number;
      source: Exclude<GoldenEvidenceSource, "clear">;
      uncertainty: number;
    })
  | (GoldenExpectedBase & {
      availability: "ineligible";
      freshness: "aging" | "stale";
      resultState: "unknown" | "insufficient_evidence" | "unsupported";
      value: null;
      source: "unknown";
      uncertainty: null;
      lastKnown: GoldenLastKnownCalibration;
    })
  | (GoldenExpectedBase & {
      availability: "ineligible";
      freshness: "unknown";
      resultState: "unknown" | "insufficient_evidence" | "unsupported";
      value: null;
      source: "unknown";
      uncertainty: null;
    });

export interface GoldenLoadExpectation {
  state: "complete" | "unavailable";
  method: "cycling_power_v1" | "sport_lthr_v1" | null;
  value: number | null;
}

export interface GoldenConsumerPresentation {
  availability: "eligible" | "ineligible";
  freshness: "fresh" | "aging" | "stale" | "unknown";
  value: number | null;
  unit: GoldenCalibrationUnit;
  source: string;
  method: string | null;
  policyVersion: "performance_calibration_v1";
}

export interface GoldenEvaluation {
  id: string;
  asOf: string;
  useCase: GoldenUseCase;
  activity?: GoldenActivityContext;
  expected: GoldenExpectedCalibration;
  expectedLoad?: GoldenLoadExpectation;
  consumerPresentation?: {
    api: GoldenConsumerPresentation;
    web: GoldenConsumerPresentation;
    mobile: GoldenConsumerPresentation;
  };
}

export interface GoldenScenario {
  id: string;
  purpose: string;
  profileContext?: GoldenProfileContext;
  evidence: readonly GoldenEvidence[];
  evaluations: readonly GoldenEvaluation[];
}

export const performanceCalibrationPhase0Checkpoint = {
  fixtureVersion: "performance_calibration_phase0_goldens_v1",
  policyVersion: "performance_calibration_v1",
  lifecycleVersion: "performance_evidence_lifecycle_v1",
  acceptedOn: "2026-07-30",
  approver: "Dean",
  cleanSourceParentSha: "709b62dcbe7f8772b1be184f7672ec33cf031b85",
  unrelatedWorkingTreeChangesExcluded: true,
  activeMvpBaselineAtFixtureFreeze: {
    status: "working_tree_only_excluded_from_checkpoint",
    artifact: "20260730000000_mvp_baseline.sql",
    sha256: "543ff6b79b4cfe6fbd991c0903dec4e30cf4d3c57b5138831cdaf20abed04c87",
    authorityAndMirrorByteIdentical: true,
  },
} as const;

export const performanceCalibrationPolicyV1Golden = {
  freshnessDays: {
    validatedOrObservedPerformance: { freshThrough: 42, agingThrough: 84 },
    manualSeed: { freshThrough: 42, agingThrough: 84 },
    providerSeed: { freshThrough: 30, agingThrough: 90 },
    modeledSeed: { freshThrough: 14, agingThrough: 42 },
    measuredMaxHr: { freshThrough: 365, agingThrough: 730 },
    peakHrLowerBound: { freshThrough: 90, agingThrough: 180 },
  },
  manualLockMaximumDays: 28,
  agingEligibleUseCases: ["historical_load", "current_load", "zones", "display_last_known"],
  uncertainty: {
    validatedTest: 0.15,
    observedCurve: 0.25,
    observedEffort: 0.35,
    manualSeedOrOverride: 0.5,
    providerSeed: 0.55,
    modeledSeed: 0.75,
    peakHrLowerBound: 0.9,
    agePrior: 1,
    agingPenalty: 0.2,
  },
  protocols: {
    cyclingFtp20Minute: "cycling_ftp_20min_95pct_v1",
    criticalPower: "critical_power_2p_v1",
    runningCriticalSpeed: "running_critical_speed_2p_v1",
    swimmingCss: "swimming_css_400_200_v1",
    lthrFieldTest: "lthr_30min_field_test_v1",
    lthrThresholdAligned: "lthr_threshold_aligned_v1",
    maxHrProgressiveTest: "max_hr_progressive_test_v1",
  },
  zones: {
    cyclingFtp: {
      version: "cycling_ftp_zones_v1",
      upperExclusivePercents: [55, 76, 91, 106, 121, 151],
    },
    sportLthr: { version: "sport_lthr_zones_v1", upperExclusivePercents: [81, 90, 94, 100] },
    hrReserve: { version: "hr_reserve_zones_v1", boundaries: [0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    runningPace: "unsupported_v1",
    swimmingPace: "unsupported_v1",
    classificationGoldens: {
      cyclingFtp: [
        { percent: 54.999, zone: 1 },
        { percent: 55, zone: 2 },
        { percent: 76, zone: 3 },
        { percent: 91, zone: 4 },
        { percent: 106, zone: 5 },
        { percent: 121, zone: 6 },
        { percent: 151, zone: 7 },
      ],
      sportLthr: [
        { percent: 80.999, zone: 1 },
        { percent: 81, zone: 2 },
        { percent: 90, zone: 3 },
        { percent: 94, zone: 4 },
        { percent: 100, zone: 5 },
      ],
    },
  },
} as const;

export const performanceCalibrationGoldenScenarios = [
  {
    id: "locked_override_precedence_and_expiry",
    purpose: "A fresh lock wins before but not at its exact expiry instant.",
    evidence: [
      {
        sourceId: "manual:ftp-lock-1",
        lineageGroupId: "metric:ftp-lock-1",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "manual_override",
        method: "manual_locked_override_v1",
        observedAt: "2026-07-01T12:00:00.000Z",
        effectiveFrom: "2026-07-01T12:00:00.000Z",
        availableAt: "2026-07-01T12:00:00.000Z",
        lockedUntil: "2026-07-29T12:00:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
      {
        sourceId: "metric:ftp-test-1",
        lineageGroupId: "manual-test:ftp-test-1",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:00:00.000Z",
        availableAt: "2026-07-20T12:00:00.000Z",
        measurement: { kind: "scalar", value: 260, unit: "W" },
      },
      {
        sourceId: "effort:ftp-observed-1",
        lineageGroupId: "activity:ftp-observed-1",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "observed_effort",
        method: "cycling_ftp_20min_95pct_v1",
        observedAt: "2026-07-25T11:40:00.000Z",
        effectiveFrom: "2026-07-25T12:00:00.000Z",
        availableAt: "2026-07-25T12:05:00.000Z",
        activityId: "ftp-observed-1",
        activityCompletedAt: "2026-07-25T12:00:00.000Z",
        measurement: { kind: "effort", durationSeconds: 1200, value: 280, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "one-minute-before-expiry",
        asOf: "2026-07-29T11:59:00.000Z",
        useCase: "planning",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 250,
          unit: "W",
          source: "manual_override",
          method: "manual_locked_override_v1",
          uncertainty: 0.5,
          reasonCodes: ["locked_manual_override"],
          contributingSourceIds: ["manual:ftp-lock-1"],
          contributingLineageGroupIds: ["metric:ftp-lock-1"],
          excluded: [],
        },
      },
      {
        id: "at-expiry",
        asOf: "2026-07-29T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 260,
          unit: "W",
          source: "validated_test",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["manual_lock_expired", "validated_test_selected"],
          contributingSourceIds: ["metric:ftp-test-1"],
          contributingLineageGroupIds: ["manual-test:ftp-test-1"],
          excluded: [{ sourceId: "manual:ftp-lock-1", reason: "lock_expired" }],
        },
      },
    ],
  },
  {
    id: "stale_override_with_fresh_observed_evidence",
    purpose: "A stale formerly locked value cannot block fresh activity evidence.",
    evidence: [
      {
        sourceId: "manual:stale-ftp",
        lineageGroupId: "metric:stale-ftp",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "manual_override",
        method: "manual_locked_override_v1",
        observedAt: "2026-04-01T12:00:00.000Z",
        effectiveFrom: "2026-04-01T12:00:00.000Z",
        availableAt: "2026-04-01T12:00:00.000Z",
        lockedUntil: "2026-04-29T12:00:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
      {
        sourceId: "effort:fresh-ftp",
        lineageGroupId: "activity:fresh-ftp",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "observed_effort",
        method: "cycling_ftp_20min_95pct_v1",
        observedAt: "2026-07-20T11:40:00.000Z",
        effectiveFrom: "2026-07-20T12:00:00.000Z",
        availableAt: "2026-07-20T12:02:00.000Z",
        activityId: "fresh-ftp",
        activityCompletedAt: "2026-07-20T12:00:00.000Z",
        measurement: { kind: "effort", durationSeconds: 1200, value: 300, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "fresh-observed-selected",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "estimated",
          calibrationType: "cycling_ftp",
          value: 285,
          unit: "W",
          source: "observed_effort",
          method: "cycling_ftp_20min_95pct_v1",
          uncertainty: 0.35,
          reasonCodes: ["observed_effort_selected"],
          contributingSourceIds: ["effort:fresh-ftp"],
          contributingLineageGroupIds: ["activity:fresh-ftp"],
          excluded: [{ sourceId: "manual:stale-ftp", reason: "stale" }],
        },
      },
    ],
  },
  {
    id: "validated_performance_improvement",
    purpose: "A newer validated higher result supersedes an older result.",
    evidence: [
      {
        sourceId: "metric:ftp-old-250",
        lineageGroupId: "manual-test:ftp-old-250",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-06-01T12:00:00.000Z",
        effectiveFrom: "2026-06-01T12:00:00.000Z",
        availableAt: "2026-06-01T12:00:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
      {
        sourceId: "metric:ftp-new-270",
        lineageGroupId: "manual-test:ftp-new-270",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:00:00.000Z",
        availableAt: "2026-07-20T12:00:00.000Z",
        measurement: { kind: "scalar", value: 270, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "newer-test-selected",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 270,
          unit: "W",
          source: "validated_test",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["newer_validated_test"],
          contributingSourceIds: ["metric:ftp-new-270"],
          contributingLineageGroupIds: ["manual-test:ftp-new-270"],
          excluded: [{ sourceId: "metric:ftp-old-250", reason: "older_same_tier" }],
        },
      },
    ],
  },
  {
    id: "validated_lthr_decline",
    purpose: "A newer valid lower LTHR replaces an older high value without a high-water rule.",
    evidence: [
      {
        sourceId: "metric:run-lthr-old",
        lineageGroupId: "manual-test:run-lthr-old",
        sport: "run",
        calibrationType: "lthr",
        source: "validated_test",
        method: "lthr_30min_field_test_v1",
        observedAt: "2026-06-01T12:00:00.000Z",
        effectiveFrom: "2026-06-01T12:30:00.000Z",
        availableAt: "2026-06-01T12:31:00.000Z",
        operationId: "run-lthr-old",
        measurement: {
          kind: "hr_window",
          protocolIntent: "threshold_test",
          totalEffortDurationSeconds: 1800,
          durationSeconds: 1200,
          windowStartOffsetSeconds: 600,
          meanBpm: 178,
          coverageRatio: 0.99,
          maxGapSeconds: 2,
          continuous: true,
        },
      },
      {
        sourceId: "metric:run-lthr-new",
        lineageGroupId: "manual-test:run-lthr-new",
        sport: "run",
        calibrationType: "lthr",
        source: "validated_test",
        method: "lthr_30min_field_test_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        operationId: "run-lthr-new",
        measurement: {
          kind: "hr_window",
          protocolIntent: "threshold_test",
          totalEffortDurationSeconds: 1800,
          durationSeconds: 1200,
          windowStartOffsetSeconds: 600,
          meanBpm: 168,
          coverageRatio: 0.98,
          maxGapSeconds: 4,
          continuous: true,
        },
      },
    ],
    evaluations: [
      {
        id: "lower-newer-lthr-selected",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "lthr",
          value: 168,
          unit: "bpm",
          source: "validated_test",
          method: "lthr_30min_field_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["newer_validated_test", "signed_change_preserved"],
          contributingSourceIds: ["metric:run-lthr-new"],
          contributingLineageGroupIds: ["manual-test:run-lthr-new"],
          excluded: [{ sourceId: "metric:run-lthr-old", reason: "older_same_tier" }],
        },
      },
    ],
  },
  {
    id: "accepted_threshold_aligned_lthr",
    purpose: "A continuous threshold-aligned activity can estimate sport-specific LTHR.",
    evidence: [
      {
        sourceId: "metric:bike-ftp-before-aligned",
        lineageGroupId: "manual-test:bike-ftp-before-aligned",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-07-01T12:00:00.000Z",
        effectiveFrom: "2026-07-01T12:00:00.000Z",
        availableAt: "2026-07-01T12:01:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
      {
        sourceId: "metric:bike-lthr-aligned",
        lineageGroupId: "activity:bike-lthr-aligned",
        sport: "bike",
        calibrationType: "lthr",
        source: "observed_effort",
        method: "lthr_threshold_aligned_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:20:00.000Z",
        availableAt: "2026-07-20T12:21:00.000Z",
        activityId: "bike-lthr-aligned",
        activityStartedAt: "2026-07-20T12:00:00.000Z",
        activityCompletedAt: "2026-07-20T12:20:00.000Z",
        measurement: {
          kind: "hr_window",
          protocolIntent: "threshold_aligned_activity",
          totalEffortDurationSeconds: 1200,
          durationSeconds: 900,
          windowStartOffsetSeconds: 300,
          meanBpm: 165,
          coverageRatio: 0.98,
          maxGapSeconds: 4,
          continuous: true,
          directIntensityRatio: 1,
          directCalibrationSourceId: "metric:bike-ftp-before-aligned",
        },
      },
    ],
    evaluations: [
      {
        id: "aligned-lthr-estimate-selected",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "estimated",
          calibrationType: "lthr",
          value: 165,
          unit: "bpm",
          source: "observed_effort",
          method: "lthr_threshold_aligned_v1",
          uncertainty: 0.35,
          reasonCodes: ["threshold_aligned_activity"],
          contributingSourceIds: ["metric:bike-ftp-before-aligned", "metric:bike-lthr-aligned"],
          contributingLineageGroupIds: [
            "manual-test:bike-ftp-before-aligned",
            "activity:bike-lthr-aligned",
          ],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "abstained_threshold_aligned_lthr",
    purpose: "A segment above the accepted 1.05 direct-intensity boundary cannot estimate LTHR.",
    evidence: [
      {
        sourceId: "metric:bike-ftp-before-too-hard",
        lineageGroupId: "manual-test:bike-ftp-before-too-hard",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-07-01T12:00:00.000Z",
        effectiveFrom: "2026-07-01T12:00:00.000Z",
        availableAt: "2026-07-01T12:01:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
      {
        sourceId: "metric:bike-lthr-too-hard",
        lineageGroupId: "activity:bike-lthr-too-hard",
        sport: "bike",
        calibrationType: "lthr",
        source: "observed_effort",
        method: "lthr_threshold_aligned_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:20:00.000Z",
        availableAt: "2026-07-20T12:21:00.000Z",
        activityId: "bike-lthr-too-hard",
        activityStartedAt: "2026-07-20T12:00:00.000Z",
        activityCompletedAt: "2026-07-20T12:20:00.000Z",
        measurement: {
          kind: "hr_window",
          protocolIntent: "threshold_aligned_activity",
          totalEffortDurationSeconds: 1200,
          durationSeconds: 900,
          windowStartOffsetSeconds: 300,
          meanBpm: 170,
          coverageRatio: 0.98,
          maxGapSeconds: 4,
          continuous: true,
          directIntensityRatio: 1.0501,
          directCalibrationSourceId: "metric:bike-ftp-before-too-hard",
        },
      },
    ],
    evaluations: [
      {
        id: "aligned-intensity-outside-policy-abstains",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "insufficient_evidence",
          calibrationType: "lthr",
          value: null,
          unit: "bpm",
          source: "unknown",
          method: "lthr_threshold_aligned_v1",
          uncertainty: null,
          reasonCodes: ["direct_intensity_outside_policy"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [{ sourceId: "metric:bike-lthr-too-hard", reason: "intensity_out_of_bounds" }],
        },
      },
    ],
  },
  {
    id: "duplicate_efforts_one_lineage",
    purpose: "Duplicate duration rows from one activity do not create independent fit evidence.",
    evidence: [
      {
        sourceId: "effort:duplicate-300-a",
        lineageGroupId: "activity:duplicate-activity",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        activityId: "duplicate-activity",
        activityCompletedAt: "2026-07-20T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 300, value: 310, unit: "W" },
      },
      {
        sourceId: "effort:duplicate-300-b",
        lineageGroupId: "activity:duplicate-activity",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        activityId: "duplicate-activity",
        activityCompletedAt: "2026-07-20T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 300, value: 309, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "one-lineage-remains-insufficient",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "insufficient_evidence",
          calibrationType: "cycling_critical_power",
          value: null,
          unit: "W",
          source: "unknown",
          method: "critical_power_2p_v1",
          uncertainty: null,
          reasonCodes: ["insufficient_points", "insufficient_independent_lineages"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [{ sourceId: "effort:duplicate-300-b", reason: "duplicate_lineage" }],
        },
      },
    ],
  },
  {
    id: "provider_seed_replaced_by_observed",
    purpose: "Fresh observed evidence outranks a fresh provider seed.",
    evidence: [
      {
        sourceId: "metric:provider-ftp",
        lineageGroupId: "metric:provider-ftp",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "provider_seed",
        method: "provider_ftp_v1",
        observedAt: "2026-07-25T12:00:00.000Z",
        effectiveFrom: "2026-07-25T12:00:00.000Z",
        availableAt: "2026-07-25T12:05:00.000Z",
        measurement: { kind: "scalar", value: 240, unit: "W" },
      },
      {
        sourceId: "effort:observed-after-provider",
        lineageGroupId: "activity:observed-after-provider",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "observed_effort",
        method: "cycling_ftp_20min_95pct_v1",
        observedAt: "2026-07-26T11:40:00.000Z",
        effectiveFrom: "2026-07-26T12:00:00.000Z",
        availableAt: "2026-07-26T12:01:00.000Z",
        activityId: "observed-after-provider",
        activityCompletedAt: "2026-07-26T12:00:00.000Z",
        measurement: { kind: "effort", durationSeconds: 1200, value: 300, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "observed-wins",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "estimated",
          calibrationType: "cycling_ftp",
          value: 285,
          unit: "W",
          source: "observed_effort",
          method: "cycling_ftp_20min_95pct_v1",
          uncertainty: 0.35,
          reasonCodes: ["observed_effort_selected"],
          contributingSourceIds: ["effort:observed-after-provider"],
          contributingLineageGroupIds: ["activity:observed-after-provider"],
          excluded: [{ sourceId: "metric:provider-ftp", reason: "lower_source_precedence" }],
        },
      },
    ],
  },
  {
    id: "validated_css_vs_generic_swim",
    purpose: "The complete 400 m/200 m protocol is CSS; an ordinary 20-minute swim is not.",
    evidence: [
      {
        sourceId: "effort:css-test-400",
        lineageGroupId: "manual-test:css-test-1",
        sport: "swim",
        calibrationType: "swimming_css",
        source: "validated_test",
        method: "swimming_css_400_200_v1",
        observedAt: "2026-07-20T12:06:00.000Z",
        effectiveFrom: "2026-07-20T12:20:00.000Z",
        availableAt: "2026-07-20T12:21:00.000Z",
        operationId: "css-test-1",
        measurement: {
          kind: "swim_trial",
          distanceMeters: 400,
          durationSeconds: 360,
          poolLengthMeters: 25,
          stroke: "freestyle",
          timingMethod: "manual_stopwatch",
          continuous: true,
          aidsUsed: false,
          inTrialRestSeconds: 0,
          recoveryBeforeSeconds: 0,
        },
      },
      {
        sourceId: "effort:css-test-200",
        lineageGroupId: "manual-test:css-test-1",
        sport: "swim",
        calibrationType: "swimming_css",
        source: "validated_test",
        method: "swimming_css_400_200_v1",
        observedAt: "2026-07-20T12:18:50.000Z",
        effectiveFrom: "2026-07-20T12:20:00.000Z",
        availableAt: "2026-07-20T12:21:00.000Z",
        operationId: "css-test-1",
        measurement: {
          kind: "swim_trial",
          distanceMeters: 200,
          durationSeconds: 170,
          poolLengthMeters: 25,
          stroke: "freestyle",
          timingMethod: "manual_stopwatch",
          continuous: true,
          aidsUsed: false,
          inTrialRestSeconds: 0,
          recoveryBeforeSeconds: 600,
        },
      },
      {
        sourceId: "metric:css-test-result",
        lineageGroupId: "manual-test:css-test-1",
        sport: "swim",
        calibrationType: "swimming_css",
        source: "validated_test",
        method: "swimming_css_400_200_v1",
        observedAt: "2026-07-20T12:18:50.000Z",
        effectiveFrom: "2026-07-20T12:20:00.000Z",
        availableAt: "2026-07-20T12:21:00.000Z",
        operationId: "css-test-1",
        measurement: {
          kind: "scalar",
          value: 95,
          unit: "seconds_per_100m",
        },
      },
      {
        sourceId: "effort:generic-swim-20m",
        lineageGroupId: "activity:generic-swim-20m",
        sport: "swim",
        calibrationType: "swimming_css",
        source: "observed_effort",
        method: "generic_20min_swim",
        observedAt: "2026-07-25T11:40:00.000Z",
        effectiveFrom: "2026-07-25T12:00:00.000Z",
        availableAt: "2026-07-25T12:01:00.000Z",
        activityId: "generic-swim-20m",
        activityCompletedAt: "2026-07-25T12:00:00.000Z",
        measurement: { kind: "effort", durationSeconds: 1200, value: 1560, unit: "m" },
      },
    ],
    evaluations: [
      {
        id: "qualified-css-selected",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "estimated",
          calibrationType: "swimming_css",
          value: 95,
          unit: "seconds_per_100m",
          source: "validated_test",
          method: "swimming_css_400_200_v1",
          uncertainty: 0.15,
          reasonCodes: ["validated_css_protocol"],
          contributingSourceIds: [
            "effort:css-test-400",
            "effort:css-test-200",
            "metric:css-test-result",
          ],
          contributingLineageGroupIds: ["manual-test:css-test-1"],
          excluded: [{ sourceId: "effort:generic-swim-20m", reason: "unsupported_protocol" }],
        },
      },
    ],
  },
  {
    id: "accepted_critical_power_fit",
    purpose: "A stable multi-lineage two-parameter power fit returns CP without redefining FTP.",
    evidence: [
      {
        sourceId: "effort:cp-180",
        lineageGroupId: "activity:cp-a",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-10T12:00:00.000Z",
        effectiveFrom: "2026-07-10T12:30:00.000Z",
        availableAt: "2026-07-10T12:31:00.000Z",
        activityId: "cp-a",
        activityCompletedAt: "2026-07-10T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 180, value: 350, unit: "W" },
      },
      {
        sourceId: "effort:cp-300",
        lineageGroupId: "activity:cp-b",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-12T12:00:00.000Z",
        effectiveFrom: "2026-07-12T12:30:00.000Z",
        availableAt: "2026-07-12T12:31:00.000Z",
        activityId: "cp-b",
        activityCompletedAt: "2026-07-12T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 300, value: 310, unit: "W" },
      },
      {
        sourceId: "effort:cp-900",
        lineageGroupId: "activity:cp-c",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-14T12:00:00.000Z",
        effectiveFrom: "2026-07-14T12:30:00.000Z",
        availableAt: "2026-07-14T12:31:00.000Z",
        activityId: "cp-c",
        activityCompletedAt: "2026-07-14T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 900, value: 270, unit: "W" },
      },
      {
        sourceId: "effort:cp-1800",
        lineageGroupId: "activity:cp-d",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-16T12:00:00.000Z",
        effectiveFrom: "2026-07-16T12:30:00.000Z",
        availableAt: "2026-07-16T12:31:00.000Z",
        activityId: "cp-d",
        activityCompletedAt: "2026-07-16T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 1800, value: 260, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "cp-250-selected",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "estimated",
          calibrationType: "cycling_critical_power",
          value: 250,
          unit: "W",
          source: "observed_curve",
          method: "critical_power_2p_v1",
          uncertainty: 0.25,
          reasonCodes: ["accepted_curve_fit", "ftp_unavailable"],
          contributingSourceIds: [
            "effort:cp-180",
            "effort:cp-300",
            "effort:cp-900",
            "effort:cp-1800",
          ],
          contributingLineageGroupIds: [
            "activity:cp-a",
            "activity:cp-b",
            "activity:cp-c",
            "activity:cp-d",
          ],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "abstained_critical_power_fit",
    purpose: "A mathematically shaped curve from one activity lineage remains insufficient.",
    evidence: [
      {
        sourceId: "effort:cp-one-180",
        lineageGroupId: "activity:cp-one",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        activityId: "cp-one",
        activityCompletedAt: "2026-07-20T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 180, value: 350, unit: "W" },
      },
      {
        sourceId: "effort:cp-one-900",
        lineageGroupId: "activity:cp-one",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        activityId: "cp-one",
        activityCompletedAt: "2026-07-20T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 900, value: 270, unit: "W" },
      },
      {
        sourceId: "effort:cp-one-1800",
        lineageGroupId: "activity:cp-one",
        sport: "bike",
        calibrationType: "cycling_critical_power",
        source: "observed_curve",
        method: "critical_power_2p_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        activityId: "cp-one",
        activityCompletedAt: "2026-07-20T12:30:00.000Z",
        measurement: { kind: "effort", durationSeconds: 1800, value: 260, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "one-lineage-abstains",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "insufficient_evidence",
          calibrationType: "cycling_critical_power",
          value: null,
          unit: "W",
          source: "unknown",
          method: "critical_power_2p_v1",
          uncertainty: null,
          reasonCodes: ["insufficient_independent_lineages"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "accepted_running_critical_speed_fit",
    purpose: "Compatible short and long efforts fit a bounded critical speed of 4 m/s.",
    evidence: [
      {
        sourceId: "effort:cs-180",
        lineageGroupId: "activity:cs-a",
        sport: "run",
        calibrationType: "running_critical_speed",
        source: "observed_curve",
        method: "running_critical_speed_2p_v1",
        observedAt: "2026-07-10T12:00:00.000Z",
        effectiveFrom: "2026-07-10T12:30:00.000Z",
        availableAt: "2026-07-10T12:31:00.000Z",
        activityId: "cs-a",
        activityCompletedAt: "2026-07-10T12:30:00.000Z",
        surfaceClass: "flat_outdoor",
        measurement: { kind: "effort", durationSeconds: 180, value: 920, unit: "m" },
      },
      {
        sourceId: "effort:cs-360",
        lineageGroupId: "activity:cs-b",
        sport: "run",
        calibrationType: "running_critical_speed",
        source: "observed_curve",
        method: "running_critical_speed_2p_v1",
        observedAt: "2026-07-12T12:00:00.000Z",
        effectiveFrom: "2026-07-12T12:30:00.000Z",
        availableAt: "2026-07-12T12:31:00.000Z",
        activityId: "cs-b",
        activityCompletedAt: "2026-07-12T12:30:00.000Z",
        surfaceClass: "flat_outdoor",
        measurement: { kind: "effort", durationSeconds: 360, value: 1640, unit: "m" },
      },
      {
        sourceId: "effort:cs-900",
        lineageGroupId: "activity:cs-c",
        sport: "run",
        calibrationType: "running_critical_speed",
        source: "observed_curve",
        method: "running_critical_speed_2p_v1",
        observedAt: "2026-07-14T12:00:00.000Z",
        effectiveFrom: "2026-07-14T12:30:00.000Z",
        availableAt: "2026-07-14T12:31:00.000Z",
        activityId: "cs-c",
        activityCompletedAt: "2026-07-14T12:30:00.000Z",
        surfaceClass: "flat_outdoor",
        measurement: { kind: "effort", durationSeconds: 900, value: 3800, unit: "m" },
      },
      {
        sourceId: "effort:cs-1200",
        lineageGroupId: "activity:cs-d",
        sport: "run",
        calibrationType: "running_critical_speed",
        source: "observed_curve",
        method: "running_critical_speed_2p_v1",
        observedAt: "2026-07-16T12:00:00.000Z",
        effectiveFrom: "2026-07-16T12:30:00.000Z",
        availableAt: "2026-07-16T12:31:00.000Z",
        activityId: "cs-d",
        activityCompletedAt: "2026-07-16T12:30:00.000Z",
        surfaceClass: "flat_outdoor",
        measurement: { kind: "effort", durationSeconds: 1200, value: 5000, unit: "m" },
      },
    ],
    evaluations: [
      {
        id: "critical-speed-4mps",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "estimated",
          calibrationType: "running_threshold_pace",
          value: 250,
          unit: "seconds_per_km",
          source: "observed_curve",
          method: "running_critical_speed_2p_v1",
          uncertainty: 0.25,
          reasonCodes: ["accepted_curve_fit"],
          contributingSourceIds: [
            "effort:cs-180",
            "effort:cs-360",
            "effort:cs-900",
            "effort:cs-1200",
          ],
          contributingLineageGroupIds: [
            "activity:cs-a",
            "activity:cs-b",
            "activity:cs-c",
            "activity:cs-d",
          ],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "abstained_running_critical_speed_fit",
    purpose: "A partial curve without long-duration coverage abstains.",
    evidence: [
      {
        sourceId: "effort:cs-partial-180",
        lineageGroupId: "activity:cs-partial-a",
        sport: "run",
        calibrationType: "running_critical_speed",
        source: "observed_curve",
        method: "running_critical_speed_2p_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        activityId: "cs-partial-a",
        activityCompletedAt: "2026-07-20T12:30:00.000Z",
        surfaceClass: "flat_outdoor",
        measurement: { kind: "effort", durationSeconds: 180, value: 920, unit: "m" },
      },
      {
        sourceId: "effort:cs-partial-360",
        lineageGroupId: "activity:cs-partial-b",
        sport: "run",
        calibrationType: "running_critical_speed",
        source: "observed_curve",
        method: "running_critical_speed_2p_v1",
        observedAt: "2026-07-22T12:00:00.000Z",
        effectiveFrom: "2026-07-22T12:30:00.000Z",
        availableAt: "2026-07-22T12:31:00.000Z",
        activityId: "cs-partial-b",
        activityCompletedAt: "2026-07-22T12:30:00.000Z",
        surfaceClass: "flat_outdoor",
        measurement: { kind: "effort", durationSeconds: 360, value: 1640, unit: "m" },
      },
    ],
    evaluations: [
      {
        id: "partial-curve-abstains",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "insufficient_evidence",
          calibrationType: "running_threshold_pace",
          value: null,
          unit: "seconds_per_km",
          source: "unknown",
          method: "running_critical_speed_2p_v1",
          uncertainty: null,
          reasonCodes: ["insufficient_points", "missing_long_coverage"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "measured_max_hr_over_age_prior",
    purpose: "A sport-specific measured max HR outranks an uncertain generic age prior.",
    profileContext: {
      dateOfBirth: "1986-07-01",
      dateOfBirthSourceId: "metric:dob-max-hr",
      lineageGroupId: "metric:dob-max-hr",
      availableAt: "2026-01-01T00:00:00.000Z",
    },
    evidence: [
      {
        sourceId: "metric:run-max-hr-test",
        lineageGroupId: "manual-test:run-max-hr-test",
        sport: "run",
        calibrationType: "max_hr",
        source: "validated_test",
        method: "max_hr_progressive_test_v1",
        observedAt: "2026-07-01T12:00:00.000Z",
        effectiveFrom: "2026-07-01T12:30:00.000Z",
        availableAt: "2026-07-01T12:31:00.000Z",
        operationId: "run-max-hr-test",
        measurement: {
          kind: "peak_hr",
          protocolIntent: "max_hr_test",
          rollingMedianSeconds: 5,
          valueBpm: 188,
          coverageRatio: 0.99,
          maxGapSeconds: 2,
          progressiveProtocol: true,
        },
      },
    ],
    evaluations: [
      {
        id: "measured-run-max-selected",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "max_hr",
          value: 188,
          unit: "bpm",
          source: "validated_test",
          method: "max_hr_progressive_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["measured_sport_specific_max_hr"],
          contributingSourceIds: ["metric:run-max-hr-test"],
          contributingLineageGroupIds: ["manual-test:run-max-hr-test"],
          excluded: [{ sourceId: "metric:dob-max-hr", reason: "lower_source_precedence" }],
        },
      },
    ],
  },
  {
    id: "age_prior_only",
    purpose: "The age equation is an estimated, maximum-uncertainty display-zone fallback.",
    profileContext: {
      dateOfBirth: "1986-07-01",
      dateOfBirthSourceId: "metric:dob-only",
      lineageGroupId: "metric:dob-only",
      availableAt: "2026-01-01T00:00:00.000Z",
    },
    evidence: [],
    evaluations: [
      {
        id: "age-prior-estimate",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "estimated",
          calibrationType: "max_hr",
          value: 180,
          unit: "bpm",
          source: "age_prior",
          method: "age_prior_208_minus_0_7_v1",
          uncertainty: 1,
          reasonCodes: ["population_age_prior", "display_zones_only"],
          contributingSourceIds: ["metric:dob-only"],
          contributingLineageGroupIds: ["metric:dob-only"],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "historical_effective_time_boundary",
    purpose:
      "Independent evidence is ineligible before, and eligible at and after, effective time.",
    evidence: [
      {
        sourceId: "metric:effective-boundary-ftp",
        lineageGroupId: "manual-test:effective-boundary-ftp",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-07-10T09:00:00.000Z",
        effectiveFrom: "2026-07-10T10:00:00.000Z",
        availableAt: "2026-07-10T10:00:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "activity-before-effective-time",
        asOf: "2026-07-11T12:00:00.000Z",
        useCase: "historical_load",
        activity: {
          activityId: "before-effective",
          lineageGroupId: "activity:before-effective",
          sport: "bike",
          startedAt: "2026-07-10T09:59:59.999Z",
        },
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "unknown",
          calibrationType: "cycling_ftp",
          value: null,
          unit: "W",
          source: "unknown",
          method: null,
          uncertainty: null,
          reasonCodes: ["no_effective_evidence"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [{ sourceId: "metric:effective-boundary-ftp", reason: "not_yet_effective" }],
        },
      },
      {
        id: "activity-at-effective-time",
        asOf: "2026-07-11T12:00:00.000Z",
        useCase: "historical_load",
        activity: {
          activityId: "at-effective",
          lineageGroupId: "activity:at-effective",
          sport: "bike",
          startedAt: "2026-07-10T10:00:00.000Z",
        },
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 250,
          unit: "W",
          source: "validated_test",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["effective_at_activity_start"],
          contributingSourceIds: ["metric:effective-boundary-ftp"],
          contributingLineageGroupIds: ["manual-test:effective-boundary-ftp"],
          excluded: [],
        },
      },
      {
        id: "activity-after-effective-time",
        asOf: "2026-07-11T12:00:00.000Z",
        useCase: "historical_load",
        activity: {
          activityId: "after-effective",
          lineageGroupId: "activity:after-effective",
          sport: "bike",
          startedAt: "2026-07-10T10:00:00.001Z",
        },
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 250,
          unit: "W",
          source: "validated_test",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["effective_before_activity_start"],
          contributingSourceIds: ["metric:effective-boundary-ftp"],
          contributingLineageGroupIds: ["manual-test:effective-boundary-ftp"],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "delayed_import_availability_boundary",
    purpose: "Backfilled evidence changes a historical projection only after GradientPeak has it.",
    evidence: [
      {
        sourceId: "metric:delayed-run-threshold",
        lineageGroupId: "manual-test:delayed-run-threshold",
        sport: "run",
        calibrationType: "running_threshold_pace",
        source: "validated_test",
        method: "running_direct_threshold_test_v1",
        observedAt: "2026-06-01T12:00:00.000Z",
        effectiveFrom: "2026-06-01T12:30:00.000Z",
        availableAt: "2026-07-20T12:00:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "seconds_per_km" },
      },
    ],
    evaluations: [
      {
        id: "calculated-before-import",
        asOf: "2026-07-19T12:00:00.000Z",
        useCase: "historical_load",
        activity: {
          activityId: "run-after-test-before-import",
          lineageGroupId: "activity:run-after-test-before-import",
          sport: "run",
          startedAt: "2026-06-15T12:00:00.000Z",
        },
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "unknown",
          calibrationType: "running_threshold_pace",
          value: null,
          unit: "seconds_per_km",
          source: "unknown",
          method: null,
          uncertainty: null,
          reasonCodes: ["evidence_not_yet_available"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [{ sourceId: "metric:delayed-run-threshold", reason: "not_yet_available" }],
        },
      },
      {
        id: "recalculated-after-import",
        asOf: "2026-07-21T12:00:00.000Z",
        useCase: "historical_load",
        activity: {
          activityId: "run-after-test-before-import",
          lineageGroupId: "activity:run-after-test-before-import",
          sport: "run",
          startedAt: "2026-06-15T12:00:00.000Z",
        },
        expected: {
          availability: "eligible",
          freshness: "aging",
          resultState: "observed",
          calibrationType: "running_threshold_pace",
          value: 250,
          unit: "seconds_per_km",
          source: "validated_test",
          method: "running_direct_threshold_test_v1",
          uncertainty: 0.35,
          reasonCodes: ["delayed_evidence_available", "aging_evidence"],
          contributingSourceIds: ["metric:delayed-run-threshold"],
          contributingLineageGroupIds: ["manual-test:delayed-run-threshold"],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "equal_timestamp_independent_evidence",
    purpose: "Independent evidence effective exactly at activity start is eligible.",
    evidence: [
      {
        sourceId: "metric:equal-time-independent",
        lineageGroupId: "manual-test:equal-time-independent",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-07-10T10:00:00.000Z",
        effectiveFrom: "2026-07-10T11:00:00.000Z",
        availableAt: "2026-07-10T11:00:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "equal-time-independent-selected",
        asOf: "2026-07-10T12:00:00.000Z",
        useCase: "historical_load",
        activity: {
          activityId: "equal-time-activity",
          lineageGroupId: "activity:equal-time-activity",
          sport: "bike",
          startedAt: "2026-07-10T11:00:00.000Z",
        },
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 250,
          unit: "W",
          source: "validated_test",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["effective_at_activity_start"],
          contributingSourceIds: ["metric:equal-time-independent"],
          contributingLineageGroupIds: ["manual-test:equal-time-independent"],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "same_activity_lineage_exclusion",
    purpose: "An activity-derived threshold never calibrates the activity that created it.",
    evidence: [
      {
        sourceId: "effort:self-calibrating-ftp",
        lineageGroupId: "activity:self-calibrating",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "observed_effort",
        method: "cycling_ftp_20min_95pct_v1",
        observedAt: "2026-07-10T10:40:00.000Z",
        effectiveFrom: "2026-07-10T11:00:00.000Z",
        availableAt: "2026-07-10T11:00:00.000Z",
        activityId: "self-calibrating",
        activityCompletedAt: "2026-07-10T11:00:00.000Z",
        measurement: { kind: "effort", durationSeconds: 1200, value: 300, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "same-lineage-excluded-even-at-equality",
        asOf: "2026-07-10T12:00:00.000Z",
        useCase: "historical_load",
        activity: {
          activityId: "self-calibrating",
          lineageGroupId: "activity:self-calibrating",
          sport: "bike",
          startedAt: "2026-07-10T11:00:00.000Z",
        },
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "unknown",
          calibrationType: "cycling_ftp",
          value: null,
          unit: "W",
          source: "unknown",
          method: null,
          uncertainty: null,
          reasonCodes: ["same_activity_lineage_excluded"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [{ sourceId: "effort:self-calibrating-ftp", reason: "same_activity_lineage" }],
        },
      },
    ],
  },
  {
    id: "stale_direct_calibration_hr_fallback",
    purpose:
      "Stale bike FTP cannot produce Load, but fresh bike LTHR may supply the approved fallback.",
    evidence: [
      {
        sourceId: "metric:stale-direct-ftp",
        lineageGroupId: "manual-test:stale-direct-ftp",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-04-01T12:00:00.000Z",
        effectiveFrom: "2026-04-01T12:00:00.000Z",
        availableAt: "2026-04-01T12:00:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
      {
        sourceId: "metric:fresh-bike-lthr",
        lineageGroupId: "manual-test:fresh-bike-lthr",
        sport: "bike",
        calibrationType: "lthr",
        source: "validated_test",
        method: "lthr_30min_field_test_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        operationId: "fresh-bike-lthr",
        measurement: {
          kind: "hr_window",
          protocolIntent: "threshold_test",
          totalEffortDurationSeconds: 1800,
          durationSeconds: 1200,
          windowStartOffsetSeconds: 600,
          meanBpm: 170,
          coverageRatio: 0.99,
          maxGapSeconds: 2,
          continuous: true,
        },
      },
    ],
    evaluations: [
      {
        id: "hr-fallback-load",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "current_load",
        activity: {
          activityId: "bike-hr-fallback",
          lineageGroupId: "activity:bike-hr-fallback",
          sport: "bike",
          startedAt: "2026-07-25T12:00:00.000Z",
          durationSeconds: 3600,
          averageHrBpm: 170,
        },
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "lthr",
          value: 170,
          unit: "bpm",
          source: "validated_test",
          method: "lthr_30min_field_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["direct_calibration_stale", "sport_lthr_fallback"],
          contributingSourceIds: ["metric:fresh-bike-lthr"],
          contributingLineageGroupIds: ["manual-test:fresh-bike-lthr"],
          excluded: [{ sourceId: "metric:stale-direct-ftp", reason: "stale" }],
        },
        expectedLoad: { state: "complete", method: "sport_lthr_v1", value: 100 },
      },
    ],
  },
  {
    id: "no_evidence",
    purpose: "Absence remains unknown rather than zero.",
    evidence: [],
    evaluations: [
      {
        id: "unknown-without-evidence",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "unknown",
          calibrationType: "cycling_ftp",
          value: null,
          unit: "W",
          source: "unknown",
          method: null,
          uncertainty: null,
          reasonCodes: ["no_evidence"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [],
        },
        expectedLoad: { state: "unavailable", method: null, value: null },
      },
    ],
  },
  {
    id: "partial_evidence",
    purpose: "A partial run curve is insufficient, not a numeric low-performance result.",
    evidence: [
      {
        sourceId: "effort:partial-run-180",
        lineageGroupId: "activity:partial-run-a",
        sport: "run",
        calibrationType: "running_critical_speed",
        source: "observed_curve",
        method: "running_critical_speed_2p_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        activityId: "partial-run-a",
        activityCompletedAt: "2026-07-20T12:30:00.000Z",
        surfaceClass: "flat_outdoor",
        measurement: { kind: "effort", durationSeconds: 180, value: 920, unit: "m" },
      },
    ],
    evaluations: [
      {
        id: "partial-remains-insufficient",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "insufficient_evidence",
          calibrationType: "running_threshold_pace",
          value: null,
          unit: "seconds_per_km",
          source: "unknown",
          method: "running_critical_speed_2p_v1",
          uncertainty: null,
          reasonCodes: ["insufficient_points", "missing_long_coverage"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [],
        },
      },
    ],
  },
  {
    id: "explicit_clear_reveals_fallback",
    purpose: "Clearing a manual value does not create zero and reveals the next eligible source.",
    evidence: [
      {
        sourceId: "manual:ftp-to-clear",
        lineageGroupId: "metric:ftp-to-clear",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "manual_override",
        method: "manual_seed_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:00:00.000Z",
        availableAt: "2026-07-20T12:00:00.000Z",
        measurement: { kind: "scalar", value: 260, unit: "W" },
      },
      {
        sourceId: "manual:clear-ftp",
        lineageGroupId: "metric:ftp-to-clear",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "clear",
        method: "manual_clear_v1",
        observedAt: "2026-07-25T12:00:00.000Z",
        effectiveFrom: "2026-07-25T12:00:00.000Z",
        availableAt: "2026-07-25T12:00:00.000Z",
        measurement: { kind: "clear", targetSourceId: "manual:ftp-to-clear" },
      },
      {
        sourceId: "metric:provider-after-clear",
        lineageGroupId: "metric:provider-after-clear",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "provider_seed",
        method: "provider_ftp_v1",
        observedAt: "2026-07-10T12:00:00.000Z",
        effectiveFrom: "2026-07-10T12:00:00.000Z",
        availableAt: "2026-07-10T12:05:00.000Z",
        measurement: { kind: "scalar", value: 240, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "provider-visible-after-clear",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 240,
          unit: "W",
          source: "provider_seed",
          method: "provider_ftp_v1",
          uncertainty: 0.55,
          reasonCodes: ["manual_evidence_cleared", "provider_seed_selected"],
          contributingSourceIds: ["metric:provider-after-clear"],
          contributingLineageGroupIds: ["metric:provider-after-clear"],
          excluded: [{ sourceId: "manual:ftp-to-clear", reason: "cleared" }],
        },
      },
    ],
  },
  {
    id: "exact_freshness_boundaries",
    purpose: "Exact 42-day and 84-day instants preserve fresh and aging boundary inclusivity.",
    evidence: [
      {
        sourceId: "metric:freshness-boundary-ftp",
        lineageGroupId: "manual-test:freshness-boundary-ftp",
        sport: "bike",
        calibrationType: "cycling_ftp",
        source: "validated_test",
        method: "cycling_ftp_direct_test_v1",
        observedAt: "2026-06-18T12:00:00.000Z",
        effectiveFrom: "2026-06-18T12:00:00.000Z",
        availableAt: "2026-06-18T12:00:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "W" },
      },
    ],
    evaluations: [
      {
        id: "exactly-42-days-is-fresh",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 250,
          unit: "W",
          source: "validated_test",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["fresh_boundary_inclusive"],
          contributingSourceIds: ["metric:freshness-boundary-ftp"],
          contributingLineageGroupIds: ["manual-test:freshness-boundary-ftp"],
          excluded: [],
        },
      },
      {
        id: "after-42-days-is-aging",
        asOf: "2026-07-30T12:00:00.001Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "aging",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 250,
          unit: "W",
          source: "validated_test",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: 0.35,
          reasonCodes: ["aging_evidence"],
          contributingSourceIds: ["metric:freshness-boundary-ftp"],
          contributingLineageGroupIds: ["manual-test:freshness-boundary-ftp"],
          excluded: [],
        },
      },
      {
        id: "exactly-84-days-is-aging",
        asOf: "2026-09-10T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "aging",
          resultState: "observed",
          calibrationType: "cycling_ftp",
          value: 250,
          unit: "W",
          source: "validated_test",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: 0.35,
          reasonCodes: ["aging_boundary_inclusive"],
          contributingSourceIds: ["metric:freshness-boundary-ftp"],
          contributingLineageGroupIds: ["manual-test:freshness-boundary-ftp"],
          excluded: [],
        },
      },
      {
        id: "after-84-days-is-stale",
        asOf: "2026-09-10T12:00:00.001Z",
        useCase: "zones",
        expected: {
          availability: "ineligible",
          freshness: "stale",
          resultState: "insufficient_evidence",
          calibrationType: "cycling_ftp",
          value: null,
          unit: "W",
          source: "unknown",
          method: "cycling_ftp_direct_test_v1",
          uncertainty: null,
          reasonCodes: ["stale_evidence"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [{ sourceId: "metric:freshness-boundary-ftp", reason: "stale" }],
          lastKnown: {
            value: 250,
            unit: "W",
            source: "validated_test",
            method: "cycling_ftp_direct_test_v1",
            observedAt: "2026-06-18T12:00:00.000Z",
            effectiveFrom: "2026-06-18T12:00:00.000Z",
            availableAt: "2026-06-18T12:00:00.000Z",
            uncertainty: 0.35,
            contributingSourceIds: ["metric:freshness-boundary-ftp"],
            contributingLineageGroupIds: ["manual-test:freshness-boundary-ftp"],
          },
        },
      },
    ],
  },
  {
    id: "cross_sport_lthr_rejection",
    purpose: "Fresh run LTHR remains incompatible with bike calibration.",
    evidence: [
      {
        sourceId: "metric:run-lthr-cross-sport",
        lineageGroupId: "manual-test:run-lthr-cross-sport",
        sport: "run",
        calibrationType: "lthr",
        source: "validated_test",
        method: "lthr_30min_field_test_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        operationId: "run-lthr-cross-sport",
        measurement: {
          kind: "hr_window",
          protocolIntent: "threshold_test",
          totalEffortDurationSeconds: 1800,
          durationSeconds: 1200,
          windowStartOffsetSeconds: 600,
          meanBpm: 170,
          coverageRatio: 0.99,
          maxGapSeconds: 2,
          continuous: true,
        },
      },
    ],
    evaluations: [
      {
        id: "run-lthr-cannot-calibrate-bike",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        activity: {
          activityId: "bike-cross-sport",
          lineageGroupId: "activity:bike-cross-sport",
          sport: "bike",
          startedAt: "2026-07-25T12:00:00.000Z",
        },
        expected: {
          availability: "ineligible",
          freshness: "unknown",
          resultState: "unknown",
          calibrationType: "lthr",
          value: null,
          unit: "bpm",
          source: "unknown",
          method: null,
          uncertainty: null,
          reasonCodes: ["no_sport_specific_evidence"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [{ sourceId: "metric:run-lthr-cross-sport", reason: "incompatible_sport" }],
        },
      },
    ],
  },
  {
    id: "ordinary_peak_hr_lower_bound",
    purpose:
      "An ordinary five-second HR peak remains a lower bound and does not become measured max HR.",
    profileContext: {
      dateOfBirth: "1986-07-01",
      dateOfBirthSourceId: "metric:dob-peak-lower-bound",
      lineageGroupId: "metric:dob-peak-lower-bound",
      availableAt: "2026-01-01T00:00:00.000Z",
    },
    evidence: [
      {
        sourceId: "effort:ordinary-bike-peak-hr",
        lineageGroupId: "activity:ordinary-bike-peak-hr",
        sport: "bike",
        calibrationType: "max_hr",
        source: "observed_effort",
        method: "ordinary_peak_hr_lower_bound_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        activityId: "ordinary-bike-peak-hr",
        activityCompletedAt: "2026-07-20T12:30:00.000Z",
        measurement: {
          kind: "peak_hr",
          protocolIntent: "ordinary_activity",
          rollingMedianSeconds: 5,
          valueBpm: 185,
          coverageRatio: 0.99,
          maxGapSeconds: 2,
          progressiveProtocol: false,
        },
      },
    ],
    evaluations: [
      {
        id: "ordinary-peak-selected-as-lower-bound",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "estimated",
          calibrationType: "max_hr",
          value: 185,
          unit: "bpm",
          source: "observed_effort",
          method: "ordinary_peak_hr_lower_bound_v1",
          uncertainty: 0.9,
          reasonCodes: ["lower_bound_not_measured", "display_zones_only"],
          contributingSourceIds: ["effort:ordinary-bike-peak-hr"],
          contributingLineageGroupIds: ["activity:ordinary-bike-peak-hr"],
          excluded: [
            { sourceId: "metric:dob-peak-lower-bound", reason: "lower_source_precedence" },
          ],
        },
      },
    ],
  },
  {
    id: "aging_evidence_use_case_gate",
    purpose: "Aging evidence can explain zones but cannot prescribe future training.",
    evidence: [
      {
        sourceId: "metric:aging-run-threshold",
        lineageGroupId: "manual-test:aging-run-threshold",
        sport: "run",
        calibrationType: "running_threshold_pace",
        source: "validated_test",
        method: "running_direct_threshold_test_v1",
        observedAt: "2026-06-01T12:00:00.000Z",
        effectiveFrom: "2026-06-01T12:30:00.000Z",
        availableAt: "2026-06-01T12:31:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "seconds_per_km" },
      },
    ],
    evaluations: [
      {
        id: "aging-zones-eligible",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "zones",
        expected: {
          availability: "eligible",
          freshness: "aging",
          resultState: "observed",
          calibrationType: "running_threshold_pace",
          value: 250,
          unit: "seconds_per_km",
          source: "validated_test",
          method: "running_direct_threshold_test_v1",
          uncertainty: 0.35,
          reasonCodes: ["aging_evidence"],
          contributingSourceIds: ["metric:aging-run-threshold"],
          contributingLineageGroupIds: ["manual-test:aging-run-threshold"],
          excluded: [],
        },
      },
      {
        id: "aging-planning-ineligible",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "planning",
        expected: {
          availability: "ineligible",
          freshness: "aging",
          resultState: "insufficient_evidence",
          calibrationType: "running_threshold_pace",
          value: null,
          unit: "seconds_per_km",
          source: "unknown",
          method: "running_direct_threshold_test_v1",
          uncertainty: null,
          reasonCodes: ["aging_not_eligible_for_planning"],
          contributingSourceIds: [],
          contributingLineageGroupIds: [],
          excluded: [{ sourceId: "metric:aging-run-threshold", reason: "aging_for_use_case" }],
          lastKnown: {
            value: 250,
            unit: "seconds_per_km",
            source: "validated_test",
            method: "running_direct_threshold_test_v1",
            observedAt: "2026-06-01T12:00:00.000Z",
            effectiveFrom: "2026-06-01T12:30:00.000Z",
            availableAt: "2026-06-01T12:31:00.000Z",
            uncertainty: 0.35,
            contributingSourceIds: ["metric:aging-run-threshold"],
            contributingLineageGroupIds: ["manual-test:aging-run-threshold"],
          },
        },
      },
    ],
  },
  {
    id: "api_web_mobile_parity",
    purpose: "API, web, and mobile present the same calibration identity and state.",
    evidence: [
      {
        sourceId: "metric:parity-run-threshold",
        lineageGroupId: "manual-test:parity-run-threshold",
        sport: "run",
        calibrationType: "running_threshold_pace",
        source: "validated_test",
        method: "running_direct_threshold_test_v1",
        observedAt: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-07-20T12:30:00.000Z",
        availableAt: "2026-07-20T12:31:00.000Z",
        measurement: { kind: "scalar", value: 250, unit: "seconds_per_km" },
      },
    ],
    evaluations: [
      {
        id: "cross-consumer-presentation",
        asOf: "2026-07-30T12:00:00.000Z",
        useCase: "display_last_known",
        expected: {
          availability: "eligible",
          freshness: "fresh",
          resultState: "observed",
          calibrationType: "running_threshold_pace",
          value: 250,
          unit: "seconds_per_km",
          source: "validated_test",
          method: "running_direct_threshold_test_v1",
          uncertainty: 0.15,
          reasonCodes: ["validated_test_selected"],
          contributingSourceIds: ["metric:parity-run-threshold"],
          contributingLineageGroupIds: ["manual-test:parity-run-threshold"],
          excluded: [],
        },
        consumerPresentation: {
          api: {
            availability: "eligible",
            freshness: "fresh",
            value: 250,
            unit: "seconds_per_km",
            source: "validated_test",
            method: "running_direct_threshold_test_v1",
            policyVersion: "performance_calibration_v1",
          },
          web: {
            availability: "eligible",
            freshness: "fresh",
            value: 250,
            unit: "seconds_per_km",
            source: "validated_test",
            method: "running_direct_threshold_test_v1",
            policyVersion: "performance_calibration_v1",
          },
          mobile: {
            availability: "eligible",
            freshness: "fresh",
            value: 250,
            unit: "seconds_per_km",
            source: "validated_test",
            method: "running_direct_threshold_test_v1",
            policyVersion: "performance_calibration_v1",
          },
        },
      },
    ],
  },
] as const satisfies readonly GoldenScenario[];

export const performanceCalibrationGoldenSha256 =
  "ea7a3fa1a79745f93ea9ad3177896b32ec2e264261d155c8d473f5df66ae8253";
