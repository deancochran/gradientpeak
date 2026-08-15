import { describe, expect, it } from "vitest";
import {
  createUnavailableAthletePerformanceTargetFacts,
  materializeAthletePerformanceTargetFacts,
} from "../performance-model";
import {
  createAthletePlanningContextFromSnapshot,
  createEffectiveAthleteSnapshot,
  selectAthletePlanningContextFields,
} from "./athletePlanningContext";
import { mapPlanningPreferencesToCreationConstraints } from "./planningPreferences";

describe("athletePlanningContext", () => {
  it("does not resolve performance targets from general profile observations", () => {
    const context = createAthletePlanningContextFromSnapshot({
      asOf: "2026-06-01T00:00:00.000Z",
      profileMetrics: [
        {
          metric_type: "weight_kg",
          value: 70,
          unit: "kg",
          recorded_at: "2026-05-01T00:00:00.000Z",
          source: "manual",
          provenance: { manual_override: true },
        },
      ],
      activityEfforts: [
        {
          activity_category: "run",
          effort_type: "speed",
          duration_seconds: 1200,
          value: 4,
          unit: "meters_per_second",
          recorded_at: "2026-05-30T00:00:00.000Z",
          activity_id: "00000000-0000-4000-8000-000000000101",
          source: "imported",
          method: "activity_file_best_effort",
          provenance: {
            activity_id: "00000000-0000-4000-8000-000000000101",
            derived_from: "activity_file_stream",
          },
        },
      ],
    });

    expect(context.physiology.planningThresholdPowerWatts).toMatchObject({
      value: null,
      source: "unknown",
    });
    expect(context.physiology.planningThresholdPaceSecondsPerKm).toMatchObject({
      value: null,
      source: "unknown",
    });
    expect(context.physiology.swimThresholdPaceSecondsPer100m).toMatchObject({
      value: null,
      source: "unknown",
    });
  });

  it("rejects a planning snapshot whose performance targets use a different asOf", () => {
    const performanceTargets = createUnavailableAthletePerformanceTargetFacts(
      "2026-06-02T00:00:00.000Z",
    );
    expect(() =>
      createEffectiveAthleteSnapshot({
        asOf: "2026-06-01T00:00:00.000Z",
        profileMetrics: [],
        activityEfforts: [],
        performanceTargets,
      }),
    ).toThrow("must match performance targets asOf");
  });

  it("accepts equivalent asOf spellings and preserves canonical performance targets", () => {
    const performanceTargets = materializeAthletePerformanceTargetFacts({
      athleteId: "planning-context-athlete",
      asOf: "2026-06-01T00:00:00Z",
      thresholds: [
        {
          id: "bike-threshold-1",
          status: "available",
          activityCategory: "bike",
          metric: "power",
          unit: "watts",
          method: "bike_power_30m",
          value: 250,
          effectiveAt: "2026-05-30T00:00:00.000Z",
          policyVersion: "threshold-policy-v1",
          state: "confirmed",
          confidence: 1,
          sourceEvaluationIds: ["power-evaluation-1"],
          sourceEffortIds: ["power-effort-1"],
          sourceActivityIds: ["power-activity-1"],
        },
      ],
    });

    const implicitSnapshot = createEffectiveAthleteSnapshot({
      profileMetrics: [],
      activityEfforts: [],
      performanceTargets,
    });
    const explicit = createAthletePlanningContextFromSnapshot({
      asOf: "2026-06-01T00:00:00.000Z",
      profileMetrics: [],
      activityEfforts: [],
      performanceTargets,
    });

    expect(implicitSnapshot.asOf).toBe("2026-06-01T00:00:00.000Z");
    expect(implicitSnapshot.performanceTargets?.asOf).toBe(implicitSnapshot.asOf);
    expect(explicit.performanceTargets.asOf).toBe("2026-06-01T00:00:00.000Z");
    expect(explicit.physiology.planningThresholdPowerWatts.value).toBe(250);
    expect(explicit.physiology.planningThresholdPowerWatts.recordedAt).toBe(
      "2026-05-30T00:00:00.000Z",
    );
    expect(
      selectAthletePlanningContextFields(explicit).find(
        (field) => field.key === "planningThresholdPowerWatts",
      ),
    ).toMatchObject({ canOverride: false, canRemove: false, inputKind: "derived" });
  });

  it("does not manufacture FTP from canonical-unit raw efforts", () => {
    const context = createAthletePlanningContextFromSnapshot({
      asOf: "2026-06-01T00:00:00.000Z",
      profileMetrics: [],
      activityEfforts: [
        {
          activity_category: "bike",
          effort_type: "power",
          duration_seconds: 1200,
          value: 250,
          unit: "watts",
          recorded_at: "2026-05-30T00:00:00.000Z",
          activity_id: "00000000-0000-4000-8000-000000000101",
          source: "imported",
          method: "activity_file_best_effort",
          provenance: {
            activity_id: "00000000-0000-4000-8000-000000000101",
            derived_from: "activity_file_stream",
          },
        },
      ],
    });

    expect(context.physiology.planningThresholdPowerWatts).toMatchObject({
      value: null,
      source: "unknown",
      unit: "watts",
    });
  });

  it("rejects zero-valued activity effort observations", () => {
    expect(() =>
      createEffectiveAthleteSnapshot({
        asOf: "2026-06-01T00:00:00.000Z",
        profileMetrics: [],
        activityEfforts: [
          {
            activity_category: "bike",
            effort_type: "power",
            duration_seconds: 1200,
            value: 0,
            unit: "watts",
            recorded_at: "2026-05-30T00:00:00.000Z",
            source: "manual",
          },
        ],
      }),
    ).toThrow();
  });

  it("builds an as-of-safe effective snapshot and reports excluded evidence", () => {
    const snapshot = createEffectiveAthleteSnapshot({
      asOf: "2026-06-01T00:00:00.000Z",
      coverage: {
        profileMetrics: "complete",
        activityEfforts: "possibly_truncated",
      },
      profileMetrics: [
        {
          metric_type: "weight_kg",
          value: 72,
          unit: "kg",
          recorded_at: "2026-05-01T00:00:00.000Z",
          source: "manual",
        },
        {
          metric_type: "weight_kg",
          value: 68,
          unit: "kg",
          recorded_at: "2026-06-02T00:00:00.000Z",
          source: "provider",
        },
      ],
      activityEfforts: [
        {
          activity_category: "bike",
          effort_type: "power",
          duration_seconds: 1200,
          value: 300,
          unit: "watts",
          recorded_at: "2026-06-02T00:00:00.000Z",
          source: "imported",
        },
      ],
    });

    expect(snapshot.profileMetrics).toEqual([
      expect.objectContaining({ metric_type: "weight_kg", value: 72 }),
    ]);
    expect(snapshot.activityEfforts).toEqual([]);
    expect(snapshot.coverage).toEqual({
      profileMetrics: "complete",
      activityEfforts: "possibly_truncated",
    });
    expect(snapshot.exclusions).toEqual({
      futureProfileMetrics: 1,
      futureActivityEfforts: 1,
      invalidProfileMetrics: 0,
      invalidActivityEfforts: 0,
    });

    const context = createAthletePlanningContextFromSnapshot({
      asOf: "2026-06-01T00:00:00.000Z",
      profileMetrics: [
        {
          metric_type: "weight_kg",
          value: 68,
          unit: "kg",
          recorded_at: "2026-06-02T00:00:00.000Z",
        },
      ],
    });
    expect(context.body.weightKg.value).toBeNull();
    expect(context.evidence).toMatchObject({
      asOf: "2026-06-01T00:00:00.000Z",
      excludedFutureMetricCount: 1,
    });
  });

  it("rejects invalid and future current-fitness observations from the effective snapshot", () => {
    const base = {
      asOf: "2026-06-01T00:00:00.000Z",
      profileMetrics: [],
      activityEfforts: [],
    };

    expect(
      createEffectiveAthleteSnapshot({
        ...base,
        currentFitness: {
          longTermLoad: 40,
          recentLoad: 45,
          loadBalance: -5,
          recorded_at: "not-a-date",
        },
      }).currentFitness,
    ).toBeNull();
    expect(
      createEffectiveAthleteSnapshot({
        ...base,
        currentFitness: {
          longTermLoad: 40,
          recentLoad: 45,
          loadBalance: -5,
          recorded_at: "2026-06-02T00:00:00.000Z",
        },
      }).currentFitness,
    ).toBeNull();
  });

  it("reports malformed metric and effort timestamps separately from future evidence", () => {
    const snapshot = createEffectiveAthleteSnapshot({
      asOf: "2026-06-01T00:00:00.000Z",
      profileMetrics: [
        { metric_type: "weight_kg", value: 70, unit: "kg", recorded_at: "not-a-date" },
      ],
      activityEfforts: [
        {
          activity_category: "bike",
          effort_type: "power",
          duration_seconds: 1200,
          value: 280,
          unit: "watts",
          recorded_at: "also-not-a-date",
        },
      ],
    });

    expect(snapshot.profileMetrics).toEqual([]);
    expect(snapshot.activityEfforts).toEqual([]);
    expect(snapshot.exclusions).toMatchObject({
      futureProfileMetrics: 0,
      futureActivityEfforts: 0,
      invalidProfileMetrics: 1,
      invalidActivityEfforts: 1,
    });
  });

  it.each([
    "complete",
    "possibly_truncated",
    "unknown",
  ] as const)("preserves %s evidence coverage explicitly", (coverage) => {
    expect(
      createEffectiveAthleteSnapshot({
        asOf: "2026-06-01T00:00:00.000Z",
        profileMetrics: [],
        activityEfforts: [],
        coverage: { profileMetrics: coverage, activityEfforts: coverage },
      }).coverage,
    ).toEqual({ profileMetrics: coverage, activityEfforts: coverage });
  });

  it("maps simple planning preferences through canonical creation constraints", () => {
    expect(
      mapPlanningPreferencesToCreationConstraints({
        preferences: {
          durationWeeks: null,
          weeklySessionCount: 4,
          targetWeeklyHours: null,
          restDaysPerWeek: null,
          maxSingleSessionDurationMinutes: null,
          progressionPace: null,
          recoveryPriority: null,
          weekPatternPreference: null,
          strengthIntegrationPriority: null,
          doubleDayTolerance: null,
          longSessionFatigueTolerance: null,
          taperStylePreference: null,
        },
        preferredWeekdays: [1, 3, 5],
      }),
    ).toMatchObject({
      hard_rest_days: ["sunday", "tuesday", "thursday", "saturday"],
      min_sessions_per_week: 3,
      max_sessions_per_week: 4,
      goal_difficulty_preference: "balanced",
    });
  });
});
