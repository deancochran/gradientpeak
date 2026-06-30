import {
  createPlanningContextFingerprint,
  mapPlanningContextToPreviewCreationConfigInput,
} from "@repo/core";
import type { TrainingPlanPlanningContext } from "../planning-context";
import type {
  BackendPlanningClientStatus,
  BackendPlanningOperation,
  BackendPlanningRequestSnapshot,
  BackendPlanningState,
} from "./types";

const plannedOperations: BackendPlanningOperation[] = [
  "getCreationSuggestions",
  "previewCreationConfig",
  "createFromCreationConfig",
  "updateFromCreationConfig",
];

export { createPlanningContextFingerprint, mapPlanningContextToPreviewCreationConfigInput };

export function getBackendPlanningClientStatus(): BackendPlanningClientStatus {
  return {
    available: false,
    enabledOperations: [],
    reason:
      "Backend planning adapter scaffolded; local projection remains authoritative for this pass.",
  };
}

export function getPlannedBackendPlanningOperations(): BackendPlanningOperation[] {
  return [...plannedOperations];
}

export function createBackendPlanningRequestSnapshot(
  context: TrainingPlanPlanningContext,
  operation: BackendPlanningOperation,
): BackendPlanningRequestSnapshot {
  return { context, operation };
}

export function deriveBackendPlanningState(
  context: TrainingPlanPlanningContext,
): BackendPlanningState {
  const previewMapping = mapPlanningContextToPreviewCreationConfigInput(context);
  return {
    status: previewMapping.ok
      ? {
          available: false,
          enabledOperations: [],
          reason:
            "Backend planning input is mapped; network preview remains disabled for this pass.",
        }
      : {
          available: false,
          enabledOperations: [],
          reason: previewMapping.reason,
        },
    plannedOperations: getPlannedBackendPlanningOperations(),
    contextFingerprint: createPlanningContextFingerprint(context),
    previewInput: previewMapping.ok ? previewMapping.input : null,
    previewRequest: createBackendPlanningRequestSnapshot(context, "previewCreationConfig"),
  };
}
