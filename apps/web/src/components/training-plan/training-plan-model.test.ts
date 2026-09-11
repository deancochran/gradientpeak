import { describe, expect, it } from "vitest";

import {
  buildTrainingPlanStructure,
  summarizeTrainingPlan,
  toTrainingPlanSessionDrafts,
} from "./training-plan-model";

const activityPlanId = "11111111-1111-4111-8111-111111111111";
const variantId = "33333333-3333-4333-8333-333333333333";

describe("training plan web model", () => {
  it("builds and summarizes the shared canonical structure", () => {
    const structure = buildTrainingPlanStructure([
      { activityPlanId, offsetDays: 7, title: "Tempo" },
      { activityPlanId, offsetDays: 0, title: "Endurance" },
    ]);

    expect(structure.sessions.map((session) => session.offset_days)).toEqual([0, 7]);
    expect(structure.sessions.every((session) => !("activity_plan_variant_id" in session))).toBe(
      true,
    );
    expect(summarizeTrainingPlan(structure)).toEqual({
      durationDays: 8,
      sessionCount: 2,
      weekCount: 2,
    });
  });

  it("hydrates persisted structures with their repository-owned ID", () => {
    const structure = {
      id: "22222222-2222-4222-8222-222222222222",
      version: 1,
      sessions: [
        {
          activity_plan_id: activityPlanId,
          activity_plan_variant_id: variantId,
          offset_days: 0,
        },
      ],
    };

    expect(toTrainingPlanSessionDrafts(structure)).toEqual([
      {
        activityPlanId,
        variantId,
        draftId: `0-${activityPlanId}-${variantId}-`,
        offsetDays: 0,
        title: "",
      },
    ]);
    expect(summarizeTrainingPlan(structure)).toEqual({
      durationDays: 1,
      sessionCount: 1,
      weekCount: 1,
    });
  });

  it("sends an explicitly selected variant while leaving default selection for the server to pin", () => {
    const structure = buildTrainingPlanStructure([
      { activityPlanId, offsetDays: 0, title: "Default" },
      { activityPlanId, variantId, offsetDays: 1, title: "Build" },
    ]);

    expect(structure.sessions).toEqual([
      expect.not.objectContaining({ activity_plan_variant_id: expect.anything() }),
      expect.objectContaining({ activity_plan_variant_id: variantId }),
    ]);
  });

  it("rejects invalid activity plan identifiers before persistence", () => {
    expect(() =>
      buildTrainingPlanStructure([{ activityPlanId: "not-a-uuid", offsetDays: 0, title: "Run" }]),
    ).toThrow();
  });
});
