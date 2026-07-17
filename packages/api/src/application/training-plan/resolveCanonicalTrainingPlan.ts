import {
  buildSystemActivityTemplateCatalog,
  type DailyLoadDistributionPoint,
  type GoalAnchoredProjectionPlan,
  projectCanonicalTrainingPlan,
} from "@repo/core";
import type { PlanningTemplateRepository } from "../../repositories";

export class CanonicalTrainingPlanResolutionError extends Error {
  readonly code = "CANONICAL_TRAINING_PLAN_RESOLUTION_FAILED";

  constructor(
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CanonicalTrainingPlanResolutionError";
  }
}

export async function resolveCanonicalTrainingPlan(input: {
  planId: string;
  projection: GoalAnchoredProjectionPlan;
  dailyLoadPoints: DailyLoadDistributionPoint[];
  planningTemplateRepository: PlanningTemplateRepository;
  expectedFingerprint?: string;
}) {
  const availableIds = new Set(
    await input.planningTemplateRepository.listAvailablePublicSystemTemplateIds(),
  );
  const candidates = buildSystemActivityTemplateCatalog().filter((candidate) =>
    availableIds.has(candidate.template_id),
  );
  const result = projectCanonicalTrainingPlan({
    planId: input.planId,
    projection: input.projection,
    dailyLoadPoints: input.dailyLoadPoints,
    candidates,
  });
  if (result.status === "unresolved") {
    throw new CanonicalTrainingPlanResolutionError(
      "System activity-template coverage is missing for one or more planned sessions.",
      { unresolved: result.unresolved, policy_version: result.policy_version },
    );
  }
  if (input.expectedFingerprint && input.expectedFingerprint !== result.fingerprint) {
    throw new CanonicalTrainingPlanResolutionError(
      "The training-plan preview is stale because template resolution changed.",
      {
        reason: "stale_resolution_fingerprint",
        expected_fingerprint: input.expectedFingerprint,
        actual_fingerprint: result.fingerprint,
      },
    );
  }
  const assertion = await input.planningTemplateRepository.assertAvailablePublicSystemTemplateIds(
    result.resolution_manifest.map((entry) => entry.selected_activity_plan_id),
  );
  if (assertion.missingIds.length > 0) {
    throw new CanonicalTrainingPlanResolutionError(
      "Selected system activity templates became unavailable before persistence.",
      { reason: "selected_templates_unavailable", missing_template_ids: assertion.missingIds },
    );
  }
  return result;
}
