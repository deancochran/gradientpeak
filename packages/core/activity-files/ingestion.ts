import { z } from "zod";
import { persistentIntegrationSourceIdSchema } from "../integrations/provider-capabilities";

export const ACTIVITY_FILE_INGESTION_CONTRACT_VERSION = "activity-intake-v1" as const;

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const nullableInstantSchema = instantSchema.nullable();
const nullableUuidSchema = uuidSchema.nullable();
const nullableTextSchema = z.string().nullable();

/** Opaque, deterministic identity supplied by the operation's caller. */
export const activityFileIngestionOperationIdSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const activityFileIngestionStatusSchema = z.enum([
  "awaiting_upload",
  "processing",
  "failed_retryable",
  "succeeded",
  "failed_terminal",
]);

export type ActivityFileIngestionStatus = z.infer<typeof activityFileIngestionStatusSchema>;

export const activityFileIngestionSourceSchema = z.enum([
  "mobile_recording",
  "manual_import",
  "provider_sync",
]);

export type ActivityFileIngestionSource = z.infer<typeof activityFileIngestionSourceSchema>;

export const activityFileIngestionFailureCodeSchema = z.enum([
  "artifact_missing",
  "hash_mismatch",
  "unsupported_format",
  "invalid_activity",
  "promotion_failed",
  "dependency_unavailable",
  "internal",
]);

export const activityFileStagingFormatSchema = z.enum(["fit", "gpx", "tcx"]);
export const activityFileStagingMediaTypeSchema = z.enum([
  "application/vnd.ant.fit",
  "application/gpx+xml",
  "application/vnd.garmin.tcx+xml",
]);

const stagingFormatMediaTypes = {
  fit: "application/vnd.ant.fit",
  gpx: "application/gpx+xml",
  tcx: "application/vnd.garmin.tcx+xml",
} as const satisfies Record<
  z.infer<typeof activityFileStagingFormatSchema>,
  z.infer<typeof activityFileStagingMediaTypeSchema>
>;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const positiveByteSizeSchema = z.number().int().positive();
const nonBlankTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Expected a non-blank string",
});

/**
 * The durable business operation. Parsing remains outside this record.
 */
export const activityFileIngestionOperationSchema = z
  .object({
    id: uuidSchema,
    profileId: uuidSchema,
    contractVersion: z.literal(ACTIVITY_FILE_INGESTION_CONTRACT_VERSION),
    operationId: activityFileIngestionOperationIdSchema,
    source: activityFileIngestionSourceSchema,
    provider: persistentIntegrationSourceIdSchema.nullable(),
    externalId: nullableTextSchema,
    integrationId: nullableUuidSchema,
    activityId: nullableUuidSchema,
    artifactId: nullableUuidSchema,
    stagingBucket: nonBlankTextSchema.nullable(),
    stagingPath: nonBlankTextSchema.nullable(),
    expectedSha256: sha256Schema.nullable(),
    expectedByteSize: positiveByteSizeSchema.nullable(),
    expectedFormat: activityFileStagingFormatSchema.nullable(),
    expectedMediaType: activityFileStagingMediaTypeSchema.nullable(),
    uploadedAt: nullableInstantSchema,
    stagingCleanupPending: z.boolean(),
    stagingCleanedAt: nullableInstantSchema,
    stagingCleanupError: nullableTextSchema,
    status: activityFileIngestionStatusSchema,
    failureCode: activityFileIngestionFailureCodeSchema.nullable(),
    requestedAt: instantSchema,
    startedAt: nullableInstantSchema,
    completedAt: nullableInstantSchema,
    failedAt: nullableInstantSchema,
    receivedAt: instantSchema,
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .superRefine((operation, context) => {
    const hasProviderIdentity = [
      operation.provider,
      operation.externalId,
      operation.integrationId,
    ].every((value) => value !== null);
    const hasNoProviderIdentity = [
      operation.provider,
      operation.externalId,
      operation.integrationId,
    ].every((value) => value === null);
    if (
      (operation.source === "provider_sync" && !hasProviderIdentity) ||
      (operation.source !== "provider_sync" && !hasNoProviderIdentity) ||
      (operation.source === "provider_sync" && operation.externalId?.trim() === "")
    ) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "Provider identity is required only for provider-synced operations",
      });
    }

    const stagingValues = [
      operation.stagingBucket,
      operation.stagingPath,
      operation.expectedSha256,
      operation.expectedByteSize,
      operation.expectedFormat,
      operation.expectedMediaType,
    ];
    const hasStagingMetadata = stagingValues.every((value) => value !== null);
    const hasNoStagingMetadata = stagingValues.every((value) => value === null);
    if (!hasStagingMetadata && !hasNoStagingMetadata) {
      context.addIssue({
        code: "custom",
        path: ["stagingBucket"],
        message: "Staging metadata must be present as one complete set or omitted",
      });
    }
    if (
      operation.expectedFormat !== null &&
      operation.expectedMediaType !== null &&
      operation.expectedMediaType !== stagingFormatMediaTypes[operation.expectedFormat]
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedMediaType"],
        message: "The staging media type must match the declared file format",
      });
    }

    if (
      (operation.stagingCleanupPending &&
        (operation.status !== "succeeded" ||
          operation.stagingPath === null ||
          operation.artifactId === null)) ||
      (operation.stagingCleanedAt !== null &&
        (operation.stagingCleanupPending || operation.stagingPath === null)) ||
      (operation.stagingCleanupError !== null && !operation.stagingCleanupPending) ||
      (operation.stagingCleanedAt !== null && operation.stagingCleanupError !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["stagingCleanupPending"],
        message: "Staging cleanup metadata does not describe a valid cleanup state",
      });
    }

    const isFailure = ["failed_retryable", "failed_terminal"].includes(operation.status);
    if (
      (operation.status === "awaiting_upload" &&
        (operation.activityId !== null ||
          operation.artifactId !== null ||
          operation.startedAt !== null ||
          operation.failureCode !== null ||
          operation.completedAt !== null ||
          operation.failedAt !== null)) ||
      (operation.status === "processing" &&
        (operation.activityId !== null ||
          operation.startedAt === null ||
          operation.failureCode !== null ||
          operation.completedAt !== null ||
          operation.failedAt !== null)) ||
      (isFailure &&
        (operation.startedAt === null ||
          operation.failureCode === null ||
          operation.failedAt === null ||
          operation.completedAt !== null)) ||
      (operation.status === "succeeded" &&
        (operation.activityId === null ||
          operation.artifactId === null ||
          operation.startedAt === null ||
          operation.completedAt === null ||
          operation.failureCode !== null ||
          operation.failedAt !== null))
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "The operation outcome fields do not match its lifecycle status",
      });
    }
  });

export type ActivityFileIngestionOperation = z.infer<typeof activityFileIngestionOperationSchema>;

/** The allowed operation-state moves, including idempotent same-state writes. */
export const activityFileIngestionStatusTransitionMatrix: Record<
  ActivityFileIngestionStatus,
  readonly ActivityFileIngestionStatus[]
> = {
  awaiting_upload: ["awaiting_upload", "processing"],
  processing: ["processing", "failed_retryable", "succeeded", "failed_terminal"],
  failed_retryable: ["failed_retryable", "awaiting_upload", "processing"],
  succeeded: ["succeeded"],
  failed_terminal: ["failed_terminal"],
};

export function canTransitionActivityFileIngestionStatus(
  from: ActivityFileIngestionStatus,
  to: ActivityFileIngestionStatus,
): boolean {
  return activityFileIngestionStatusTransitionMatrix[from].includes(to);
}
