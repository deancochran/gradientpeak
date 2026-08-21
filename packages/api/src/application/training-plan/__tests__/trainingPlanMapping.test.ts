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

  it("removes private builder and creation metadata for non-owner reads", () => {
    const plan = {
      id: "plan-1",
      profile_id: "owner-1",
      content_visibility: "public",
      structure: {
        version: 1,
        builder_planning_snapshot: { version: 1, private: true },
        metadata: {
          creation_config_snapshot: { private: true },
          creation_form_snapshot: { private: true },
          creation_calibration: { private: true },
          safe_summary: "retained",
        },
        sessions: [],
      },
    };

    expect(sanitizeTrainingPlanForViewer(plan, "viewer-2").structure).toEqual({
      version: 1,
      metadata: { safe_summary: "retained" },
      sessions: [],
    });
  });

  it("preserves private planning context for the owner after publication", () => {
    const plan = {
      id: "plan-1",
      profile_id: "owner-1",
      content_visibility: "public",
      structure: { builder_planning_snapshot: { version: 1 } },
    };

    expect(sanitizeTrainingPlanForViewer(plan, "owner-1")).toBe(plan);
  });

  it("adds only a schedule-level planned preview", () => {
    const result = mapTrainingPlanPlannedSchedulePreview({
      structure: {
        version: 1,
        durationWeeks: { recommended: 2 },
        sessions: [
          {
            offset_days: 0,
            activity_plan_id: "11111111-1111-4111-8111-111111111111",
          },
          {
            offset_days: 8,
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
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
