import {
  activityPlanSemanticHash,
  activityPlanStructureSchema,
  activityPlanTrainingIntentSchema,
} from "@repo/core/activity-plan";
import type { ImmutableActivityPlanRevision } from "@repo/core/plan";
import { ZodError } from "zod";
import { parseActivityPlanAuthoringContent } from "./authoring-content";
import { activityPlanStructureHash } from "./structure-hash";

export class ActivityPlanIntegrityError extends Error {
  constructor() {
    super("Activity plan integrity check failed");
    this.name = "ActivityPlanIntegrityError";
  }
}

/** Verifies a newly selected catalog revision. Frozen prescription reads never use this boundary. */
export function toVerifiedResolverCandidate(input: {
  id: string;
  revision: number;
  structure: unknown;
  structureHash: string;
  semanticHash: string;
  trainingIntent: unknown;
}): ImmutableActivityPlanRevision {
  const structure = activityPlanStructureSchema.parse(input.structure);
  if (activityPlanStructureHash(structure) !== input.structureHash) {
    throw new ActivityPlanIntegrityError();
  }
  const trainingIntent = activityPlanTrainingIntentSchema.parse(input.trainingIntent);
  const semanticHash = activityPlanSemanticHash({
    structure,
    trainingIntent,
  });
  if (semanticHash !== input.semanticHash) throw new ActivityPlanIntegrityError();
  parseActivityPlanAuthoringContent({ structure, training_intent: trainingIntent });
  return {
    id: input.id,
    revision: input.revision,
    semantic_hash: semanticHash,
    activity_category: structure.activity_category,
    training_intent: trainingIntent,
    structure,
  };
}

/** Skip ineligible historical entries only for automatic selection; explicit choices fail closed. */
export function toVerifiedResolverCandidates(
  inputs: Parameters<typeof toVerifiedResolverCandidate>[0][],
  explicitIds: readonly string[],
): ImmutableActivityPlanRevision[] {
  const selected = new Set(explicitIds);
  return inputs.flatMap((input) => {
    try {
      return [toVerifiedResolverCandidate(input)];
    } catch (error) {
      if (error instanceof ZodError && !selected.has(input.id)) return [];
      throw error;
    }
  });
}
