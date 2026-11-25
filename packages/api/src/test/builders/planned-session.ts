import { type ActivityPlanStructure, activityPlanSemanticHash } from "@repo/core/activity-plan";
import { resolvePrescription, type SessionDemand } from "@repo/core/plan";

export function createResolutionManifestFixture(input: {
  activityPlanId: string;
  structure: ActivityPlanStructure;
  demand: SessionDemand;
  activityPlanRevision?: number;
}) {
  const resolution = resolvePrescription({
    demand: input.demand,
    preferences: {
      weekly_session_count: null,
      target_weekly_duration_minutes: null,
      maximum_session_duration_minutes: null,
      preferred_weekdays: [],
      rest_days: [],
      progression_style: null,
      recovery_priority: null,
    },
    baseline: { status: "no_context", as_of: "2026-08-01T00:00:00.000Z" },
    activity_plan_id: input.activityPlanId,
    candidates: [
      {
        id: input.activityPlanId,
        revision: input.activityPlanRevision ?? 1,
        semantic_hash: activityPlanSemanticHash({
          structure: input.structure,
          trainingIntent: input.demand.training_intent,
        }),
        activity_category: input.structure.activity_category,
        training_intent: input.demand.training_intent,
        structure: input.structure,
      },
    ],
  });
  if (resolution.status !== "resolved")
    throw new Error(`Expected resolved prescription fixture, received ${resolution.status}`);
  return resolution.manifest;
}
