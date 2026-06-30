import { describe, expect, it } from "vitest";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import {
  createPlanningContextFingerprint,
  mapPlanningContextToPreviewCreationConfigInput,
} from "./planningBackendPreview";
import type { PlanningContext } from "./planningContext";

function createContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    anchorDate: "2026-01-01",
    athleteContext: createAthletePlanningContextFromSnapshot({
      profile: null,
      profileMetrics: [],
      activityEfforts: [],
      currentFitness: { ctl: 42, atl: 48, tsb: -6, recorded_at: "2026-01-01T00:00:00.000Z" },
    }),
    goals: [
      {
        localId: "goal-1",
        title: "Spring 10K",
        targetOffsetDays: 70,
        priority: 8,
        activityCategory: "run",
        objective: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 10_000,
          target_time_s: 2700,
        },
      },
    ],
    preferences: {
      durationWeeks: 10,
      weeklySessionCount: 4,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
    },
    sessions: [],
    scheduling: {
      startDate: "2026-01-01",
      preferredWeekdays: [1, 3, 5],
      sessionDateOverrides: {},
    },
    ...overrides,
  };
}

describe("planningBackendPreview", () => {
  it("maps planning context to preview creation config input", () => {
    const result = mapPlanningContextToPreviewCreationConfigInput(createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.input).toMatchObject({
      minimal_plan: {
        plan_start_date: "2026-01-01",
        goals: [
          {
            name: "Spring 10K",
            target_date: "2026-03-12",
            priority: 8,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 10_000,
                target_time_s: 2700,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {
        user_values: {
          constraints: {
            hard_rest_days: ["sunday", "tuesday", "thursday", "saturday"],
            min_sessions_per_week: 3,
            max_sessions_per_week: 4,
          },
        },
      },
      starting_ctl_override: 42,
      starting_atl_override: 48,
      post_create_behavior: { autonomous_mutation_enabled: false },
    });
  });

  it("reports unmappable planning goal reasons", () => {
    const result = mapPlanningContextToPreviewCreationConfigInput(
      createContext({
        goals: [
          {
            localId: "goal-1",
            title: "Consistency",
            targetOffsetDays: null,
            priority: 5,
            activityCategory: null,
            objective: { type: "consistency", target_sessions_per_week: 3 },
          },
        ],
        preferences: {
          durationWeeks: null,
          weeklySessionCount: null,
          targetWeeklyHours: null,
          restDaysPerWeek: null,
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'Goal "Consistency" needs a target date or plan duration.',
    });
  });

  it("fingerprints planning context changes", () => {
    const first = createPlanningContextFingerprint(createContext());
    const second = createPlanningContextFingerprint(
      createContext({
        preferences: {
          durationWeeks: 10,
          weeklySessionCount: 5,
          targetWeeklyHours: null,
          restDaysPerWeek: null,
        },
      }),
    );

    expect(first).not.toEqual(second);
  });
});
