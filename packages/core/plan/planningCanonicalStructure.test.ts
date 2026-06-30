import { describe, expect, it } from "vitest";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import {
  mapPlanningContextToCanonicalTrainingPlanStructure,
  mapPlanningContextToTrainingPlanCreateInput,
  mapPlanningContextToTrainingPlanUpdateInput,
} from "./planningCanonicalStructure";
import type { PlanningContext } from "./planningContext";

function createContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    anchorDate: "2026-01-01",
    athleteContext: createAthletePlanningContextFromSnapshot({
      profile: null,
      profileMetrics: [],
      activityEfforts: [],
    }),
    goals: [
      {
        localId: "goal-1",
        sourceProfileGoalId: "profile-goal-1",
        title: "Spring 10K",
        targetOffsetDays: 70,
        targetDate: "2026-03-12",
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
    sessions: [
      {
        localId: "session-1",
        offsetDays: 4,
        activityPlan: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Tempo",
          published: true,
          accessible: true,
          estimatedTss: 50,
          estimatedDurationSeconds: 3600,
        },
        eventOverrides: {
          title: "Tempo day",
          description: "",
          start_time: "08:00",
        },
      },
    ],
    scheduling: {
      startDate: "2026-01-01",
      preferredWeekdays: [1, 3, 5],
      sessionDateOverrides: {},
    },
    ...overrides,
  };
}

describe("planningCanonicalStructure", () => {
  it("maps planning context into canonical reusable training plan structure", () => {
    const structure = mapPlanningContextToCanonicalTrainingPlanStructure(createContext(), {
      backendPlanning: { projectionSource: "local", previewSnapshotToken: null },
    });

    expect(structure).toMatchObject({
      version: 1,
      goal_blueprints: [
        {
          title: "Spring 10K",
          priority: 8,
          activity_category: "run",
          target_offset_days: 70,
        },
      ],
      builder_planning_snapshot: {
        version: 1,
        plan_preferences: {
          duration_weeks: 10,
          weekly_session_count: 4,
          target_weekly_hours: null,
          rest_days_per_week: null,
        },
        scheduling: {
          start_date: "2026-01-01",
          preferred_weekdays: [1, 3, 5],
        },
        backend_planning: {
          projection_source: "local",
          preview_snapshot_token: null,
        },
      },
      sessions: [
        {
          offset_days: 4,
          activity_plan_id: "11111111-1111-4111-8111-111111111111",
          event_overrides: { title: "Tempo day", start_time: "08:00" },
        },
      ],
    });
  });

  it("omits unassigned sessions from canonical save structure", () => {
    const structure = mapPlanningContextToCanonicalTrainingPlanStructure(
      createContext({
        sessions: [
          ...createContext().sessions,
          { localId: "session-2", offsetDays: 5, activityPlan: null },
        ],
      }),
    );

    expect(structure.sessions).toHaveLength(1);
  });

  it("maps planning context and details into validated create/update payloads", () => {
    const context = createContext();
    const createPayload = mapPlanningContextToTrainingPlanCreateInput({
      context,
      name: "  Base Builder  ",
      description: "  Keep it steady  ",
    });
    const updatePayload = mapPlanningContextToTrainingPlanUpdateInput({
      context,
      planId: "22222222-2222-4222-8222-222222222222",
      name: "  Base Builder  ",
      description: "  ",
    });

    expect(createPayload).toMatchObject({
      name: "Base Builder",
      description: "Keep it steady",
      is_active: true,
      structure: { version: 1 },
    });
    expect(updatePayload).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Base Builder",
      description: null,
      structure: { version: 1 },
    });
  });
});
