import { stringifyCanonicalJson } from "../athlete-intelligence/canonical-json";
import { sha256Hex } from "../utils/sha256";
import type { ActivityPlanAdaptation } from "./adaptation-schema";
import type { ActivityPlanStructure } from "./structure-schema";
import type { ActivityPlanTrainingIntent } from "./training-intent";

/** Canonical execution-content hash for one immutable activity-plan revision. */
export function activityPlanSemanticHash(value: {
  structure: ActivityPlanStructure;
  adaptation: ActivityPlanAdaptation | null;
  trainingIntent: ActivityPlanTrainingIntent;
}) {
  return `v1:sha256:${sha256Hex(
    stringifyCanonicalJson({
      structure: value.structure,
      adaptation: value.adaptation,
      training_intent: value.trainingIntent,
    }),
  )}`;
}
