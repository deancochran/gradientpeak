import { stringifyCanonicalJson } from "../athlete-intelligence/canonical-json";
import { sha256Hex } from "../utils/sha256";
import type { ActivityPlanStructure } from "./structure-schema";
import type { ActivityPlanTrainingIntent } from "./training-intent";
/** Canonical execution-content hash for one immutable V5 activity-plan revision. */
export function activityPlanSemanticHash(value: {
  structure: ActivityPlanStructure;
  trainingIntent: ActivityPlanTrainingIntent;
}) {
  return `v2:sha256:${sha256Hex(stringifyCanonicalJson({ structure: value.structure, training_intent: value.trainingIntent }))}`;
}
