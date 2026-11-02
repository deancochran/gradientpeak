import { describe, expect, it } from "vitest";
import {
  mapTrainingPlanContentIdentity,
  mapTrainingPlanOwnerIdentity,
  mapTrainingPlanPlannedSchedulePreview,
  sanitizeTrainingPlanForViewer,
} from "../trainingPlanMapping";

describe("training plan response mapping", () => {
  it("preserves explicit content visibility and content identity", () => {
    expect(
      mapTrainingPlanContentIdentity({
        id: "plan-1",
        profile_id: "profile-1",
        content_visibility: "public",
      }),
    ).toMatchObject({
      content_type: "training_plan",
      content_id: "plan-1",
      owner_profile_id: "profile-1",
      visibility: "public",
    });
  });

  it("maps canonical system and ordinary plan visibility", () => {
    expect(
      mapTrainingPlanContentIdentity({
        id: "system-plan",
        profile_id: null,
        is_system_template: true,
        content_visibility: "public",
      }).visibility,
    ).toBe("public");

    expect(
      mapTrainingPlanContentIdentity({
        id: "private-plan",
        profile_id: "profile-1",
        content_visibility: "private",
      }).visibility,
    ).toBe("private");
  });

  it("maps only the resolved profile identity as the owner", () => {
    const owner = { id: "profile-1", username: "athlete", avatar_url: null };
    const profileIdentityMap = new Map([[owner.id, owner]]);

    expect(
      mapTrainingPlanOwnerIdentity({ id: "plan-1", profile_id: owner.id }, profileIdentityMap),
    ).toMatchObject({ owner });
    expect(
      mapTrainingPlanOwnerIdentity({ id: "plan-2", profile_id: "profile-2" }, profileIdentityMap),
    ).toMatchObject({ owner: null });
  });

  it("preserves the canonical share-safe training-plan structure for non-owner reads", () => {
    const plan = {
      id: "plan-1",
      profile_id: "owner-1",
      content_visibility: "public",
      structure: {
        version: 1,
        plan_preferences: {
          weekly_session_count: null,
          target_weekly_duration_minutes: null,
          maximum_session_duration_minutes: null,
          preferred_weekdays: [],
          rest_days: [],
          progression_style: null,
          recovery_priority: null,
        },
        sessions: [],
      },
    };

    expect(sanitizeTrainingPlanForViewer(plan, "viewer-2").structure).toEqual({
      version: 1,
      plan_preferences: {
        weekly_session_count: null,
        target_weekly_duration_minutes: null,
        maximum_session_duration_minutes: null,
        preferred_weekdays: [],
        rest_days: [],
        progression_style: null,
        recovery_priority: null,
      },
      sessions: [],
    });
  });

  it("preserves the canonical structure for the owner after publication", () => {
    const plan = {
      id: "plan-1",
      profile_id: "owner-1",
      content_visibility: "public",
      structure: { version: 1, plan_preferences: {}, sessions: [] },
    };

    expect(sanitizeTrainingPlanForViewer(plan, "owner-1")).toBe(plan);
  });

  it("adds only a schedule-level planned preview", () => {
    const result = mapTrainingPlanPlannedSchedulePreview({
      structure: {
        version: 1,
        plan_preferences: {
          weekly_session_count: null,
          target_weekly_duration_minutes: null,
          maximum_session_duration_minutes: null,
          preferred_weekdays: [],
          rest_days: [],
          progression_style: null,
          recovery_priority: null,
        },
        sessions: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            offset_days: 0,
            activity_plan_id: "11111111-1111-4111-8111-111111111111",
            demand: {
              activity_category: "bike",
              training_intent: "general_maintenance",
              target_duration_minutes: 30,
              target_common_load: null,
              importance: "normal",
            },
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            offset_days: 8,
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
            demand: {
              activity_category: "bike",
              training_intent: "general_maintenance",
              target_duration_minutes: 30,
              target_common_load: null,
              importance: "normal",
            },
          },
        ],
      },
    });

    expect(result.plannedSchedulePreview).toEqual({
      scope: "weekly_session_count",
      weeks: [
        { weekIndex: 0, plannedSessionCount: 1 },
        { weekIndex: 1, plannedSessionCount: 1 },
      ],
    });
    expect(JSON.stringify(result.plannedSchedulePreview)).not.toMatch(
      /load|target|threshold|intensity|provenance|raw|stream/i,
    );
  });
});
