import { z } from "zod";
import type {
  ApplyPlannedSessionScenarioRequest,
  ApplyPlannedSessionScenarioResult,
} from "./contracts/planned-session-scenario-apply";
import { applyPlannedSessionScenarioRequestSchema } from "./contracts/planned-session-scenario-apply";
import type { previewPlannedSessionScenarioRequestSchema } from "./contracts/planned-sessions";

type PreviewPlannedSessionScenarioRequest = z.input<
  typeof previewPlannedSessionScenarioRequestSchema
>;

export type FrozenPlannedSessionScenarioOperation = {
  actorId: string;
  request: ApplyPlannedSessionScenarioRequest;
  sessionId: string;
};

const frozenPlannedSessionScenarioOperationSchema = z
  .object({
    actorId: z.string().uuid(),
    sessionId: z.string().uuid(),
    request: applyPlannedSessionScenarioRequestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.request.preview.sessionId !== value.sessionId)
      context.addIssue({
        code: "custom",
        message: "Frozen session mismatch",
        path: ["request", "preview", "sessionId"],
      });
  });

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

export function parseFrozenPlannedSessionScenarioOperation(value: unknown) {
  const parsed = frozenPlannedSessionScenarioOperationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function requiresFreshPlannedSessionScenarioPreview(
  result: ApplyPlannedSessionScenarioResult,
) {
  return result.status === "stale" || result.status === "unavailable";
}
