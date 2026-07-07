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
    available: true,
    enabledOperations: [
      "previewCreationConfig",
      "createFromCreationConfig",
      "updateFromCreationConfig",
    ],
    reason: "Backend planning preview and commit routes are available when input mapping succeeds.",
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
          available: true,
          enabledOperations: [
            "previewCreationConfig",
            "createFromCreationConfig",
            "updateFromCreationConfig",
          ],
          reason: "Backend planning input is mapped and ready for authoritative preview.",
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
