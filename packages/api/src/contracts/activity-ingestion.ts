import {
  activityFileIngestionFailureCodeSchema,
  activityFileIngestionOperationIdSchema,
  activityFileIngestionSourceSchema,
} from "@repo/core/activity-files";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const nullableUuidSchema = uuidSchema.nullable();
const safeStatusBase = z.object({
  ingestionId: uuidSchema,
  profileId: uuidSchema,
  operationId: activityFileIngestionOperationIdSchema,
  source: activityFileIngestionSourceSchema,
  activityId: nullableUuidSchema,
  artifactId: nullableUuidSchema,
  requestedAt: instantSchema,
  updatedAt: instantSchema,
});

const safeActiveStatus = (status: "awaiting_upload" | "processing") =>
  safeStatusBase
    .extend({
      status: z.literal(status),
      startedAt: instantSchema.nullable(),
      actions: z.object({ retry: z.literal(false) }).strict(),
    })
    .strict();

export const activityIngestionSafeStatusDtoSchema = z.discriminatedUnion("status", [
  safeActiveStatus("awaiting_upload"),
  safeActiveStatus("processing"),
  safeStatusBase
    .extend({
      status: z.literal("failed_retryable"),
      failureCode: activityFileIngestionFailureCodeSchema,
      failedAt: instantSchema,
      actions: z.object({ retry: z.literal(true) }).strict(),
    })
    .strict(),
  safeStatusBase
    .extend({
      status: z.literal("succeeded"),
      activityId: uuidSchema,
      artifactId: uuidSchema,
      completedAt: instantSchema,
      actions: z.object({ retry: z.literal(false) }).strict(),
    })
    .strict(),
  safeStatusBase
    .extend({
      status: z.literal("failed_terminal"),
      failureCode: activityFileIngestionFailureCodeSchema,
      failedAt: instantSchema,
      actions: z.object({ retry: z.literal(false) }).strict(),
    })
    .strict(),
]);

export const activityIngestionStatusRequestSchema = z
  .object({ profileId: uuidSchema, ingestionId: uuidSchema })
  .strict();

export type ActivityIngestionSafeStatusDto = z.infer<typeof activityIngestionSafeStatusDtoSchema>;
