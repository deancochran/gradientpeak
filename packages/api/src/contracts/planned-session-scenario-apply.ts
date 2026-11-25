import { z } from "zod";
import { plannedSessionCacheTagsSchema } from "./cache-receipts";
import {
  plannedSessionDtoSchema,
  plannedSessionScenarioUnavailableReasonSchema,
  previewPlannedSessionScenarioRequestSchema,
} from "./planned-sessions";

const uuidSchema = z.string().uuid();
export const plannedSessionScenarioPreviewFingerprintSchema = z
  .string()
  .regex(/^v1:sha256:[0-9a-f]{64}$/);
const operationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);

export const applyPlannedSessionScenarioRequestSchema = z
  .object({
    preview: previewPlannedSessionScenarioRequestSchema,
    expectedPreviewFingerprint: plannedSessionScenarioPreviewFingerprintSchema,
    operationId: operationIdSchema,
  })
  .strict();

export const applyPlannedSessionScenarioResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("applied"),
      action: z.enum(["unchanged", "repointed", "cancelled", "skipped"]),
      session: plannedSessionDtoSchema,
      createdActivityPlanId: uuidSchema.nullable(),
      cache_tags: plannedSessionCacheTagsSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: plannedSessionScenarioUnavailableReasonSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("stale"),
      reason: z.enum([
        "session_revision",
        "plan_revision",
        "state_revision",
        "preview_fingerprint",
      ]),
      currentSessionRevision: z.number().int().positive().nullable(),
      currentPlanRevision: z.number().int().positive().nullable(),
      currentStateRevision: z.number().int().nonnegative().nullable(),
    })
    .strict(),
]);

export type ApplyPlannedSessionScenarioRequest = z.input<
  typeof applyPlannedSessionScenarioRequestSchema
>;
export type ApplyPlannedSessionScenarioResult = z.output<
  typeof applyPlannedSessionScenarioResultSchema
>;
