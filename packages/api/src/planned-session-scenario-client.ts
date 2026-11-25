import type { z } from "zod";
import type {
  ApplyPlannedSessionScenarioRequest,
  ApplyPlannedSessionScenarioResult,
} from "./contracts/planned-session-scenario-apply";
import type { previewPlannedSessionScenarioRequestSchema } from "./contracts/planned-sessions";

type PreviewPlannedSessionScenarioRequest = z.input<
  typeof previewPlannedSessionScenarioRequestSchema
>;

export type FrozenPlannedSessionScenarioOperation = {
  actorId: string;
  request: ApplyPlannedSessionScenarioRequest;
  sessionId: string;
};

/**
 * Keeps a retry bound to the exact preview that the athlete confirmed.  Clients
 * may persist this value, but must discard it when the authenticated actor or
 * selected session differs.
 */
export function freezePlannedSessionScenarioOperation(input: {
  actorId: string;
  expectedPreviewFingerprint: string;
  operationId: string;
  preview: PreviewPlannedSessionScenarioRequest;
}): FrozenPlannedSessionScenarioOperation {
  return {
    actorId: input.actorId,
    sessionId: input.preview.sessionId,
    request: {
      preview: input.preview,
      expectedPreviewFingerprint: input.expectedPreviewFingerprint,
      operationId: input.operationId,
    },
  };
}

export function isCurrentPlannedSessionScenarioOperation(
  operation: FrozenPlannedSessionScenarioOperation,
  input: { actorId: string; sessionId: string },
) {
  return operation.actorId === input.actorId && operation.sessionId === input.sessionId;
}

export function requiresFreshPlannedSessionScenarioPreview(
  result: ApplyPlannedSessionScenarioResult,
) {
  return result.status === "stale" || result.status === "unavailable";
}
