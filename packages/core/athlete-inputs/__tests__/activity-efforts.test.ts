import { describe, expect, it } from "vitest";
import {
  ACTIVITY_EFFORT_HARD_BOUNDS,
  classifyActivityEffortPlausibility,
  getActivityEffortObservationStatus,
  getActivityEffortThresholdEvidence,
  MANUAL_ACTIVITY_EFFORT_PROVENANCE,
} from "../activity-effort-policy";
import {
  createActivityEffortInputSchema,
  formatActivityEffortValue,
  formatEffortDuration,
  getActivityEffortDefinition,
  getActivityEffortDefinitionsForCategory,
  normalizeActivityEffortUpdate,
  paceSecondsFromSpeedMetersPerSecond,
  speedMetersPerSecondFromDistanceAndElapsedSeconds,
  speedMetersPerSecondFromPace,
  updateActivityEffortInputSchema,
} from "../activity-efforts";

describe("activity effort definitions", () => {
  it("filters supported efforts by activity category", () => {
    expect(getActivityEffortDefinitionsForCategory("bike")).toHaveLength(1);
    expect(
      getActivityEffortDefinition({ activityCategory: "run", effortType: "speed" }),
    ).toMatchObject({
      unit: "m/s",
    });
  });

  it("uses elapsed-second presets for swim efforts", () => {
    expect(
      getActivityEffortDefinition({ activityCategory: "swim", effortType: "speed" }),
    ).toMatchObject({
      defaultDurationSeconds: 300,
      durationPresets: [30, 60, 120, 300, 1_200, 1_800],
    });
  });

  it("rejects unsupported category and effort combinations", () => {
    expect(() =>
      createActivityEffortInputSchema.parse({
        activity_category: "run",
        effort_type: "power",
        duration_seconds: 60,
        value: 300,
        recorded_at: "2026-07-09T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("normalizes unit and value on create", () => {
    const parsed = createActivityEffortInputSchema.parse({
      activity_category: "bike",
      effort_type: "power",
      duration_seconds: 1200,
      value: 301.4,
      recorded_at: "2026-07-09T12:00:00.000Z",
    });

    expect(parsed).toMatchObject({ unit: "watts", value: 301 });
  });

  it("enforces canonical hard bounds on create and update", () => {
    const baseCreate = {
      activity_category: "bike" as const,
      effort_type: "power" as const,
      duration_seconds: 14_400,
      value: 3_000,
      recorded_at: "2026-07-09T12:00:00.000Z",
    };
    expect(createActivityEffortInputSchema.safeParse(baseCreate).success).toBe(true);
    expect(
      createActivityEffortInputSchema.safeParse({ ...baseCreate, duration_seconds: 14_401 })
        .success,
    ).toBe(false);
    expect(createActivityEffortInputSchema.safeParse({ ...baseCreate, value: 3_001 }).success).toBe(
      false,
    );

    const id = "00000000-0000-4000-8000-000000000001";
    expect(
      updateActivityEffortInputSchema.safeParse({ id, duration_seconds: 14_401 }).success,
    ).toBe(false);
    expect(updateActivityEffortInputSchema.safeParse({ id, value: 3_001 }).success).toBe(false);
    expect(
      updateActivityEffortInputSchema.safeParse({
        id,
        activity_category: "run",
        effort_type: "speed",
        value: 13,
      }).success,
    ).toBe(true);
  });

  it("allows explicit activity linkage and start offsets to be cleared", () => {
    const normalized = normalizeActivityEffortUpdate(
      {
        activity_id: "00000000-0000-4000-8000-000000000010",
        activity_category: "run",
        duration_seconds: 600,
        effort_type: "speed",
        recorded_at: "2026-07-09T12:00:00.000Z",
        start_offset: 30,
        value: 4,
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        activity_id: null,
        start_offset: null,
      },
    );

    expect(normalized).toMatchObject({ activity_id: null, start_offset: null });
  });

  it("formats effort values and durations", () => {
    expect(
      formatActivityEffortValue({ activity_category: "bike", effort_type: "power", value: 300 }),
    ).toBe("300 W");
    expect(formatEffortDuration(125)).toBe("2m 05s");
  });
});

describe("activity effort plausibility policy", () => {
  it("distinguishes hard-invalid input from a valid observation requiring quarantine", () => {
    expect(
      classifyActivityEffortPlausibility({
        activityCategory: "bike",
        effortType: "power",
        durationSeconds: 5,
        value: 3_001,
      }).classification,
    ).toBe("hard-invalid");

    const observation = {
      activityCategory: "bike" as const,
      effortType: "power" as const,
      durationSeconds: 3_600,
      value: 700,
    };
    const result = classifyActivityEffortPlausibility(observation);
    expect(result).toMatchObject({
      classification: "quarantinable-implausible",
      heuristicCeiling: 650,
    });
    expect(observation.value).toBe(700);
  });

  it("uses duration-aware run and swim ceilings", () => {
    expect(
      classifyActivityEffortPlausibility({
        activityCategory: "run",
        effortType: "speed",
        durationSeconds: 600,
        value: 7.1,
      }).classification,
    ).toBe("quarantinable-implausible");
    expect(
      classifyActivityEffortPlausibility({
        activityCategory: "swim",
        effortType: "speed",
        durationSeconds: 1_800,
        value: 1.8,
      }).classification,
    ).toBe("plausible");
  });

  it("tightens bike review ceilings when FTP or weight context exists", () => {
    const result = classifyActivityEffortPlausibility({
      activityCategory: "bike",
      effortType: "power",
      durationSeconds: 1_200,
      value: 610,
      context: { ftpWatts: 400, weightKilograms: 80 },
    });
    expect(result).toMatchObject({
      classification: "quarantinable-implausible",
      heuristicCeiling: 600,
    });
  });

  it("publishes the canonical broad hard bounds", () => {
    expect(ACTIVITY_EFFORT_HARD_BOUNDS).toEqual({
      durationSeconds: { min: 1, max: 14_400 },
      bikePowerWatts: { min: 1, max: 3_000 },
      runSpeedMetersPerSecond: { min: 0.3, max: 13 },
      swimSpeedMetersPerSecond: { min: 0.1, max: 3 },
    });
  });

  it("uses one provenance policy for manual, modeled, and imported observations", () => {
    const base = {
      activityCategory: "bike" as const,
      effortType: "power" as const,
      durationSeconds: 300,
      value: 300,
      unit: "watts",
    };
    expect(
      getActivityEffortObservationStatus({
        ...base,
        source: "manual",
        provenance: MANUAL_ACTIVITY_EFFORT_PROVENANCE,
      }),
    ).toBe("observed");
    expect(
      getActivityEffortObservationStatus({
        ...base,
        source: "derived",
        method: "onboarding_modeled_curve",
      }),
    ).toBe("modeled");
    expect(
      getActivityEffortObservationStatus({
        ...base,
        activityId: "00000000-0000-4000-8000-000000000001",
        source: "imported",
        method: "activity_file_best_effort",
        provenance: {
          derived_from: "activity_file_stream",
          activity_id: "00000000-0000-4000-8000-000000000001",
        },
      }),
    ).toBe("observed");
    expect(
      getActivityEffortObservationStatus({
        ...base,
        source: "imported",
        method: "activity_file_best_effort",
        provenance: { derived_from: "activity_file_stream" },
      }),
    ).toBe("review");
    expect(
      getActivityEffortObservationStatus({
        ...base,
        durationSeconds: 1_200,
        value: 900,
        source: "imported",
        method: "activity_file_best_effort",
        provenance: { derived_from: "activity_file_stream" },
      }),
    ).toBe("review");
  });

  it("requires trusted provenance and exactly 20 minutes for threshold evidence", () => {
    const imported = {
      activityCategory: "bike" as const,
      effortType: "power" as const,
      durationSeconds: 1200,
      value: 250,
      unit: "watts",
      activityId: "activity-1",
      source: "imported",
      method: "activity_file_best_effort",
      provenance: { derived_from: "activity_file_stream", activity_id: "activity-1" },
    };

    expect(getActivityEffortThresholdEvidence(imported)).toBe("imported_activity_stream");
    expect(getActivityEffortThresholdEvidence({ ...imported, durationSeconds: 1199 })).toBeNull();
    expect(
      getActivityEffortThresholdEvidence({
        ...imported,
        provenance: { derived_from: "activity_file_stream", activity_id: "other" },
      }),
    ).toBeNull();
  });
});

describe("activity effort speed conversions", () => {
  it("derives canonical m/s from distance and elapsed time", () => {
    expect(
      speedMetersPerSecondFromDistanceAndElapsedSeconds({
        distanceMeters: 1_000,
        elapsedSeconds: 300,
      }),
    ).toBeCloseTo(10 / 3);
    expect(
      speedMetersPerSecondFromDistanceAndElapsedSeconds({
        distanceMeters: 400,
        elapsedSeconds: 80,
      }),
    ).toBe(5);
  });

  it("converts pace in seconds per distance unit to canonical m/s", () => {
    expect(
      speedMetersPerSecondFromPace({
        paceSeconds: 300,
        distanceUnitMeters: 1_000,
      }),
    ).toBeCloseTo(10 / 3);
    expect(
      speedMetersPerSecondFromPace({
        paceSeconds: 90,
        distanceUnitMeters: 100,
      }),
    ).toBeCloseTo(10 / 9);
  });

  it("converts canonical m/s back to pace seconds for display", () => {
    expect(
      paceSecondsFromSpeedMetersPerSecond({
        speedMetersPerSecond: 4,
        distanceUnitMeters: 1_000,
      }),
    ).toBe(250);
  });

  it.each([
    { distanceMeters: 0, elapsedSeconds: 60 },
    { distanceMeters: -100, elapsedSeconds: 60 },
    { distanceMeters: 100, elapsedSeconds: 0 },
    { distanceMeters: 100, elapsedSeconds: -60 },
    { distanceMeters: Number.NaN, elapsedSeconds: 60 },
    { distanceMeters: 100, elapsedSeconds: Number.POSITIVE_INFINITY },
  ])("returns null for invalid distance and elapsed time: %o", (input) => {
    expect(speedMetersPerSecondFromDistanceAndElapsedSeconds(input)).toBeNull();
  });

  it.each([
    { paceSeconds: 0, distanceUnitMeters: 1_000 },
    { paceSeconds: -300, distanceUnitMeters: 1_000 },
    { paceSeconds: 300, distanceUnitMeters: 0 },
    { paceSeconds: 300, distanceUnitMeters: Number.NaN },
    { paceSeconds: Number.POSITIVE_INFINITY, distanceUnitMeters: 1_000 },
  ])("returns null for invalid pace input: %o", (input) => {
    expect(speedMetersPerSecondFromPace(input)).toBeNull();
  });

  it.each([
    { speedMetersPerSecond: 0, distanceUnitMeters: 1_000 },
    { speedMetersPerSecond: -4, distanceUnitMeters: 1_000 },
    { speedMetersPerSecond: 4, distanceUnitMeters: 0 },
    { speedMetersPerSecond: Number.NaN, distanceUnitMeters: 1_000 },
    { speedMetersPerSecond: 4, distanceUnitMeters: Number.POSITIVE_INFINITY },
  ])("returns null for invalid inverse pace input: %o", (input) => {
    expect(paceSecondsFromSpeedMetersPerSecond(input)).toBeNull();
  });
});
