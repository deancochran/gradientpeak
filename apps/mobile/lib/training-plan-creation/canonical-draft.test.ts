import { describe, expect, it } from "vitest";
import {
  buildCanonicalTrainingPlanDraft,
  buildCanonicalTrainingPlanStructure,
  createTrainingPlanBuilderStateFromExistingPlan,
  getTrainingPlanStructureActivityPlanIds,
} from "./canonical-draft";
import { createDefaultTrainingPlanBuilderState } from "./defaults";

const activityPlanId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const trainingPlanId = "00000000-0000-4000-8000-000000000003";
const preferences = {
  weekly_session_count: 3,
  target_weekly_duration_minutes: null,
  maximum_session_duration_minutes: null,
  preferred_weekdays: [1, 3, 5],
  rest_days: [0],
  progression_style: "balanced" as const,
  recovery_priority: null,
};

describe("canonical training-plan draft hydration", () => {
  it.each([
    "private",
    "followers",
    "public",
  ] as const)("hydrates and saves %s visibility", (visibility) => {
    const state = createDefaultTrainingPlanBuilderState();
    state.details.contentVisibility = visibility;
    state.details.name = "Visibility plan";
    state.structure.sessions = [
      {
        id: sessionId,
        localId: sessionId,
        offsetDays: 0,
        activityPlan: null,
        demand: {
          activity_category: "other",
          training_intent: "general_maintenance",
          target_duration_minutes: null,
          target_common_load: null,
          importance: "normal",
        },
      },
    ];
    const draft = buildCanonicalTrainingPlanDraft(state);
    const hydrated = createTrainingPlanBuilderStateFromExistingPlan({
      activityPlans: [],
      fallbackDate: "2026-09-17",
      plan: {
        id: trainingPlanId,
        name: draft.name,
        description: draft.description,
        structure: draft.structure,
        content_visibility: draft.contentVisibility,
      },
    });
    expect(hydrated.details.contentVisibility).toBe(visibility);
    expect(buildCanonicalTrainingPlanDraft(hydrated).contentVisibility).toBe(visibility);
  });
  it("round-trips canonical preferences, demand, nullable activity plans, and stable session IDs", () => {
    const state = createDefaultTrainingPlanBuilderState();
    state.planPreferences = preferences;
    state.structure.sessions = [
      {
        id: sessionId,
        localId: sessionId,
        offsetDays: 2,
        demand: {
          activity_category: "other",
          training_intent: "general_maintenance",
          target_duration_minutes: null,
          target_common_load: null,
          importance: "normal",
        },
        activityPlan: null,
      },
    ];

    const structure = buildCanonicalTrainingPlanStructure(state);
    expect(structure).toMatchObject({
      plan_preferences: preferences,
      sessions: [
        { id: sessionId, activity_plan_id: null, demand: state.structure.sessions[0]?.demand },
      ],
    });
    expect(structure).not.toHaveProperty("builder_planning_snapshot");
    expect(getTrainingPlanStructureActivityPlanIds(structure)).toEqual([]);

    const hydrated = createTrainingPlanBuilderStateFromExistingPlan({
      activityPlans: [],
      fallbackDate: "2026-08-10",
      plan: {
        id: trainingPlanId,
        name: "Current plan",
        description: null,
        structure,
        content_visibility: "private",
      },
    });
    expect(hydrated.planPreferences).toEqual(preferences);
    expect(hydrated.structure.sessions[0]).toMatchObject({
      id: sessionId,
      localId: sessionId,
      activityPlan: null,
      demand: state.structure.sessions[0]?.demand,
    });
  });

  it("returns only non-null activity plan IDs", () => {
    const state = createDefaultTrainingPlanBuilderState();
    state.structure.sessions = [
      {
        id: sessionId,
        localId: sessionId,
        offsetDays: 0,
        demand: {
          activity_category: "bike",
          training_intent: "aerobic_base",
          target_duration_minutes: 60,
          target_common_load: null,
          importance: "normal",
        },
        activityPlan: {
          id: activityPlanId,
          name: "Ride",
          published: true,
          accessible: true,
          prescriptionQuantification: null,
        },
      },
    ];
    expect(
      getTrainingPlanStructureActivityPlanIds(buildCanonicalTrainingPlanStructure(state)),
    ).toEqual([activityPlanId]);
  });
});
