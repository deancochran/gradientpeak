import {
  type AthleteIntelligenceModelInput,
  athleteIntelligenceModelInputSchema,
  type ParsedAthleteIntelligenceModelInput,
} from "../model-input-contracts";

type ModelSlice =
  | "physiology"
  | "metricEvidence"
  | "activityWindow"
  | "activities"
  | "efforts"
  | "goals"
  | "trainingContext"
  | "readCoverage"
  | "scheduleReadState"
  | "plannedSchedule";

/** Typed slice replacements for Core tests; callers must explicitly replace complete slices. */
export type AthleteIntelligenceModelFixtureOverrides = Partial<
  Pick<AthleteIntelligenceModelInput, ModelSlice>
> & {
  evidenceRegistry?: AthleteIntelligenceModelInput["evidenceRegistry"];
  assessmentAsOf?: AthleteIntelligenceModelInput["assessmentAsOf"];
  planningTimezone?: AthleteIntelligenceModelInput["planningTimezone"];
};

/**
 * Creates a canonical, fully linked model fixture. It is test-only and has no
 * extension registration or runtime discovery surface.
 */
export function buildAthleteIntelligenceModel(
  overrides: AthleteIntelligenceModelFixtureOverrides = {},
): ParsedAthleteIntelligenceModelInput {
  const nullEvidence = Object.fromEntries(
    [
      "years",
      "kilograms",
      "centimeters",
      "percent",
      "seconds",
      "meters",
      "kilojoules",
      "kilocalories",
      "watts",
      "meters_per_second",
      "beats_per_minute",
      "revolutions_per_minute",
      "score",
      "minutes",
      "count",
      "hours",
      "days",
      "ratio",
      "training_load",
    ].map((unit) => [
      `manual:null-${unit}`,
      {
        athleteId: "athlete-1",
        sourceId: `manual:null-${unit}`,
        lineageGroupId: "manual-test:context-history",
        observedAt: "2026-07-09T12:00:00.000Z",
        rawObservation: { value: null, unit },
        sport: null,
        modality: "manual",
        sourceType: "manual_observation",
        qualityState: "known",
        validityState: "valid",
        compatibilityState: "compatible",
      },
    ]),
  );
  const evidenceRegistry = {
    "metric:ftp": {
      athleteId: "athlete-1",
      sourceId: "metric:ftp",
      lineageGroupId: "metric:ftp-history",
      observedAt: "2026-07-09T12:00:00.000Z",
      rawObservation: { value: 250, unit: "watts" },
      sport: "bike",
      modality: "profile_metric",
      sourceType: "profile_metric",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "compatible",
    },
    "activity:ride-1": {
      athleteId: "athlete-1",
      sourceId: "activity:ride-1",
      lineageGroupId: "activity:ride-history",
      observedAt: "2026-07-09T12:00:00.000Z",
      rawObservation: { value: null, unit: null },
      sport: "bike",
      modality: "activity",
      sourceType: "activity",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "compatible",
    },
    "activity:elapsed": {
      athleteId: "athlete-1",
      sourceId: "activity:elapsed",
      lineageGroupId: "activity:ride-history",
      observedAt: "2026-07-09T12:00:00.000Z",
      rawObservation: { value: 3600, unit: "seconds" },
      sport: "bike",
      modality: "duration",
      sourceType: "activity",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "compatible",
    },
    "goal:run": {
      athleteId: "athlete-1",
      sourceId: "goal:run",
      lineageGroupId: "manual-test:run-history",
      observedAt: "2026-07-09T12:00:00.000Z",
      rawObservation: { value: null, unit: null },
      sport: "run",
      modality: "goal",
      sourceType: "goal",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "compatible",
    },
    "manual:training-context": {
      athleteId: "athlete-1",
      sourceId: "manual:training-context",
      lineageGroupId: "manual-test:context-history",
      observedAt: "2026-07-09T12:00:00.000Z",
      rawObservation: { value: null, unit: null },
      sport: null,
      modality: "manual",
      sourceType: "manual_observation",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "compatible",
    },
    ...nullEvidence,
  };
  const evidenced = <T>(value: T, unit: string) => ({
    value,
    unit,
    evidenceSourceIds: [`manual:null-${unit}`],
  });
  const activityMetric = (value: number | null, unit: string) => ({
    value,
    unit,
    evidenceSourceIds: [value === 3600 ? "activity:elapsed" : `manual:null-${unit}`],
  });

  return athleteIntelligenceModelInputSchema.parse({
    contractVersion: "2.0.0",
    assessmentAsOf: "2026-07-10T12:00:00.000Z",
    athleteId: "athlete-1",
    planningTimezone: "America/New_York",
    evidenceRegistry,
    physiology: {
      athleteId: "athlete-1",
      ageYears: evidenced(null, "years"),
      weightKg: evidenced(null, "kilograms"),
      heightCm: evidenced(null, "centimeters"),
      bodyFatPercent: evidenced(null, "percent"),
      preferredUnits: {
        value: {
          distance: "kilometers",
          elevation: "meters",
          mass: "kilograms",
          temperature: null,
        },
        evidenceSourceIds: ["manual:null-score"],
      },
    },
    metricEvidence: [
      {
        metricType: "ftp",
        role: "direct_threshold_evidence",
        value: { value: 250, unit: "watts", evidenceSourceIds: ["metric:ftp"] },
      },
    ],
    activityWindow: { from: "2026-06-10T12:00:00.000Z", through: "2026-07-10T12:00:00.000Z" },
    activities: [
      {
        sourceId: "activity:ride-1",
        athleteId: "athlete-1",
        lineageGroupId: "activity:ride-history",
        startedAt: "2026-07-09T12:00:00.000Z",
        endedAt: "2026-07-09T13:00:00.000Z",
        sport: "bike",
        metrics: {
          elapsedDurationSeconds: activityMetric(3600, "seconds"),
          movingDurationSeconds: activityMetric(null, "seconds"),
          distanceMeters: activityMetric(null, "meters"),
          ascentMeters: activityMetric(null, "meters"),
          descentMeters: activityMetric(null, "meters"),
          workKilojoules: activityMetric(null, "kilojoules"),
          caloriesKilocalories: activityMetric(null, "kilocalories"),
          averagePowerWatts: activityMetric(null, "watts"),
          maximumPowerWatts: activityMetric(null, "watts"),
          normalizedPowerWatts: activityMetric(null, "watts"),
          averageSpeedMetersPerSecond: activityMetric(null, "meters_per_second"),
          maximumSpeedMetersPerSecond: activityMetric(null, "meters_per_second"),
          averageHeartRateBpm: activityMetric(null, "beats_per_minute"),
          maximumHeartRateBpm: activityMetric(null, "beats_per_minute"),
          averageCadenceRpm: activityMetric(null, "revolutions_per_minute"),
          maximumCadenceRpm: activityMetric(null, "revolutions_per_minute"),
          trainingLoad: activityMetric(null, "score"),
          aerobicTrainingEffect: activityMetric(null, "score"),
          anaerobicTrainingEffect: activityMetric(null, "score"),
        },
        zonesAndCurves: [],
        laps: [],
      },
    ],
    efforts: [],
    goals: [
      {
        sourceId: "goal:run",
        athleteId: "athlete-1",
        lineageGroupId: "manual-test:run-history",
        targetDate: "2026-10-01",
        priority: 10,
        goalSport: "run",
        objective: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 10_000,
          target_speed_mps: 4,
        },
        evidenceSourceIds: ["goal:run"],
      },
    ],
    trainingContext: {
      sourceId: "manual:training-context",
      athleteId: "athlete-1",
      lineageGroupId: "manual-test:context-history",
      evidenceSourceIds: ["manual:training-context"],
      preferredSports: ["run", "bike"],
      weeklyTimeWindows: [],
      hardRestDays: [],
      maximumWeeklyMinutes: evidenced(null, "minutes"),
      maximumDailyMinutes: evidenced(null, "minutes"),
      maximumSessionsPerDay: evidenced(null, "count"),
      maximumSessionDurationMinutes: evidenced(null, "minutes"),
      sportDoseLimits: [],
      allowDoubleDays: null,
      minimumRecoveryHours: evidenced(null, "hours"),
      maximumConsecutiveTrainingDays: evidenced(null, "days"),
      recoveryPreference: null,
      fatigueTolerance: evidenced(null, "ratio"),
      strategy: null,
      taperPreference: null,
      progressionPreference: null,
      ctlOverride: evidenced(null, "training_load"),
      atlOverride: evidenced(null, "training_load"),
    },
    readCoverage: {
      metrics: { state: "complete", reason: null },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "complete", reason: null },
    },
    scheduleReadState: "complete",
    plannedSchedule: [],
    ...overrides,
  });
}
