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

const plannedOperations: BackendPlanningOperation[] = ["previewCreationConfig"];

export { createPlanningContextFingerprint, mapPlanningContextToPreviewCreationConfigInput };

export function getBackendPlanningClientStatus(): BackendPlanningClientStatus {
  return {
    available: true,
    enabledOperations: getPlannedBackendPlanningOperations(),
    reason: "Backend planning preview is enabled.",
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
      ? getBackendPlanningClientStatus()
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
