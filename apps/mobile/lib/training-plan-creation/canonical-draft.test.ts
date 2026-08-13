import { describe, expect, it } from "vitest";
import {
  createTrainingPlanBuilderStateFromExistingPlan,
  getTrainingPlanStructureActivityPlanIds,
} from "./canonical-draft";

const activityPlanId = "00000000-0000-4000-8000-000000000001";
const trainingPlanId = "00000000-0000-4000-8000-000000000002";
const canonicalStructure = {
  version: 1,
  sessions: [{ offset_days: 2, activity_plan_id: activityPlanId }],
} as const;

describe("canonical training-plan draft hydration", () => {
  it.each([
    ["canonical", canonicalStructure],
    ["persisted", { ...canonicalStructure, id: trainingPlanId }],
  ])("hydrates %s structures without a compatibility mapper", (_kind, structure) => {
    const state = createTrainingPlanBuilderStateFromExistingPlan({
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

    expect(state.structure.sessions).toEqual([
      {
        localId: "existing-session-0",
        offsetDays: 2,
        activityPlan: {
          id: activityPlanId,
          name: "Unavailable activity plan",
          published: false,
          accessible: false,
          prescriptionQuantification: null,
        },
      },
    ]);
    expect(getTrainingPlanStructureActivityPlanIds(structure)).toEqual([activityPlanId]);
  });
});
