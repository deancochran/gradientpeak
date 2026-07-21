import { describe, expect, it } from "vitest";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import { planningContextSchema } from "./planningContext";
import { mapPlanningPreferencesToCreationConstraints } from "./planningPreferences";

describe("planningContext", () => {
  it("validates the canonical planning context shape", () => {
    const context = planningContextSchema.parse({
      anchorDate: "2026-01-01",
      athleteContext: createAthletePlanningContextFromSnapshot({
        profile: null,
        profileMetrics: [],
        activityEfforts: [],
      }),
      goals: [],
      preferences: {
        durationWeeks: 6,
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
      sessions: [],
      scheduling: {
        startDate: "2026-01-01",
        preferredWeekdays: [1, 3, 5],
        sessionDateOverrides: {},
      },
    });

    expect(context.preferences.weeklySessionCount).toBe(4);
    expect(context.scheduling.preferredWeekdays).toEqual([1, 3, 5]);
  });

  it("resolves thresholds only from eligible activity efforts", () => {
    const context = createAthletePlanningContextFromSnapshot({
      asOf: "2026-06-01T00:00:00.000Z",
      profileMetrics: [
        {
          metric_type: "ftp",
          value: 240,
          unit: "W",
          recorded_at: "2026-05-01T00:00:00.000Z",
          source: "manual",
          provenance: { manual_override: true },
        },
        {
          metric_type: "threshold_pace_seconds_per_km",
          value: 270,
          unit: "seconds_per_km",
          recorded_at: "2026-05-01T00:00:00.000Z",
          source: "provider",
        },
        {
          metric_type: "css_seconds_per_100m",
          value: 100,
          unit: "seconds_per_100m",
          recorded_at: "2026-05-01T00:00:00.000Z",
          source: "provider",
        },
      ],
      activityEfforts: [
        {
          activity_category: "run",
          effort_type: "speed",
          duration_seconds: 1200,
          value: 4,
          unit: "m/s",
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

    expect(context.physiology.ftpWatts).toMatchObject({ value: null, source: "unknown" });
    expect(context.physiology.thresholdPaceSecondsPerKm).toMatchObject({
      value: 250,
      source: "activity_effort",
      unit: "s/1000m",
    });
    expect(context.physiology.cssSecondsPer100m).toMatchObject({ value: null, source: "unknown" });
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
