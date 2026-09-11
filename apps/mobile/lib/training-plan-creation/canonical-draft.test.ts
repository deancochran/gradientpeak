import { describe, expect, it } from "vitest";
import {
  buildCanonicalTrainingPlanStructure,
  createTrainingPlanBuilderStateFromExistingPlan,
  getTrainingPlanStructureActivityPlanIds,
} from "./canonical-draft";
import { createDefaultTrainingPlanBuilderState } from "./defaults";

const activityPlanId = "00000000-0000-4000-8000-000000000001";
const trainingPlanId = "00000000-0000-4000-8000-000000000002";
const activityPlanVariantId = "00000000-0000-4000-8000-000000000003";
const canonicalStructure = {
  version: 1,
  sessions: [
    {
      offset_days: 2,
      activity_plan_id: activityPlanId,
      activity_plan_variant_id: activityPlanVariantId,
    },
  ],
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
        activityPlanVariantId,
      },
    ]);
    expect(getTrainingPlanStructureActivityPlanIds(structure)).toEqual([activityPlanId]);
  });

  it.each([
    ["server default", undefined],
    ["explicit variant", activityPlanVariantId],
  ])("builds a training-plan entry with %s selection", (_label, selectedVariantId) => {
    const state = createDefaultTrainingPlanBuilderState();
    state.structure.sessions = [
      {
        localId: "session-1",
        offsetDays: 1,
        activityPlan: {
          id: activityPlanId,
          name: "Tempo",
          published: true,
          accessible: true,
          prescriptionQuantification: null,
        },
        ...(selectedVariantId ? { activityPlanVariantId: selectedVariantId } : {}),
      },
    ];

    const built = buildCanonicalTrainingPlanStructure(state);

    expect(built.sessions[0]).toEqual({
      offset_days: 1,
      activity_plan_id: activityPlanId,
      ...(selectedVariantId ? { activity_plan_variant_id: selectedVariantId } : {}),
    });
  });
});
