import {
  type ActivityFileIngestionOperation,
  activityFileIngestionOperationSchema,
} from "@repo/core/activity-files";
import { type ActivityFileIngestionRow, activityFileIngestions } from "@repo/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../../db";
import type {
  ActivityIngestionOperationMutationResult,
  ActivityIngestionRepositoryPort,
  ActivityIngestionSafeStatus,
} from "../../repositories/activity-ingestion-repository-port";

function toInstant(value: Date | string, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid database timestamp: ${field}`);
  return date.toISOString();
}

function nullableInstant(value: Date | string | null, field: string): string | null {
  return value === null ? null : toInstant(value, field);
}

export function mapActivityIngestionRow(
  row: ActivityFileIngestionRow,
): ActivityFileIngestionOperation {
  return activityFileIngestionOperationSchema.parse({
    id: row.id,
    profileId: row.profile_id,
    contractVersion: row.contract_version,
    operationId: row.operation_id,
    source: row.source,
    provider: row.provider,
    externalId: row.external_id,
    integrationId: row.integration_id,
    activityId: row.activity_id,
    artifactId: row.artifact_id,
    stagingBucket: row.staging_bucket,
    stagingPath: row.staging_path,
    expectedSha256: row.expected_sha256,
    expectedByteSize: row.expected_byte_size,
    expectedFormat: row.expected_format,
    expectedMediaType: row.expected_media_type,
    uploadedAt: nullableInstant(row.uploaded_at, "uploaded_at"),
    stagingCleanupPending: row.staging_cleanup_pending,
    stagingCleanedAt: nullableInstant(row.staging_cleaned_at, "staging_cleaned_at"),
    stagingCleanupError: row.staging_cleanup_error,
    status: row.status,
    failureCode: row.failure_code,
    requestedAt: toInstant(row.requested_at, "requested_at"),
    startedAt: nullableInstant(row.started_at, "started_at"),
    completedAt: nullableInstant(row.completed_at, "completed_at"),
    failedAt: nullableInstant(row.failed_at, "failed_at"),
    receivedAt: toInstant(row.received_at, "received_at"),
    createdAt: toInstant(row.created_at, "created_at"),
    updatedAt: toInstant(row.updated_at, "updated_at"),
  });
}

export function projectSafeActivityIngestionStatus(
  operationInput: ActivityFileIngestionOperation,
): ActivityIngestionSafeStatus {
  const operation = activityFileIngestionOperationSchema.parse(operationInput);
  return {
    id: operation.id,
    profileId: operation.profileId,
    operationId: operation.operationId,
    source: operation.source,
    activityId: operation.activityId,
    artifactId: operation.artifactId,
    status: operation.status,
    failureCode: operation.failureCode,
    requestedAt: operation.requestedAt,
    startedAt: operation.startedAt,
    completedAt: operation.completedAt,
    failedAt: operation.failedAt,
    updatedAt: operation.updatedAt,
  };
}

const immutableOperationKeys = [
  "source",
  "provider",
  "externalId",
  "integrationId",
  "stagingBucket",
  "stagingPath",
  "expectedSha256",
  "expectedByteSize",
  "expectedFormat",
  "expectedMediaType",
] as const satisfies readonly (keyof ActivityFileIngestionOperation)[];

function sameImmutableOperation(
  left: ActivityFileIngestionOperation,
  right: ActivityFileIngestionOperation,
): boolean {
  const keys =
    left.source === "provider_sync" && right.source === "provider_sync"
      ? (["source", "provider", "externalId", "integrationId"] as const)
      : immutableOperationKeys;
  return keys.every((key) => left[key] === right[key]);
}

function operationValues(operation: ActivityFileIngestionOperation) {
  return {
    id: operation.id,
    activity_id: operation.activityId,
    artifact_id: operation.artifactId,
    profile_id: operation.profileId,
    source: operation.source,
    provider: operation.provider,
    external_id: operation.externalId,
    integration_id: operation.integrationId,
    contract_version: operation.contractVersion,
    operation_id: operation.operationId,
    staging_bucket: operation.stagingBucket,
    staging_path: operation.stagingPath,
    expected_sha256: operation.expectedSha256,
    expected_byte_size: operation.expectedByteSize,
    expected_format: operation.expectedFormat,
    expected_media_type: operation.expectedMediaType,
    uploaded_at: operation.uploadedAt === null ? null : new Date(operation.uploadedAt),
    staging_cleanup_pending: operation.stagingCleanupPending,
    staging_cleaned_at:
      operation.stagingCleanedAt === null ? null : new Date(operation.stagingCleanedAt),
    staging_cleanup_error: operation.stagingCleanupError,
    received_at: new Date(operation.receivedAt),
    status: operation.status,
    failure_code: operation.failureCode,
    requested_at: new Date(operation.requestedAt),
    started_at: operation.startedAt === null ? null : new Date(operation.startedAt),
    completed_at: operation.completedAt === null ? null : new Date(operation.completedAt),
    failed_at: operation.failedAt === null ? null : new Date(operation.failedAt),
    created_at: new Date(operation.createdAt),
    updated_at: new Date(operation.updatedAt),
  };
}

async function loadOwned(
  db: DrizzleQueryExecutor,
  input: { profileId: string; ingestionId: string },
): Promise<ActivityFileIngestionOperation | null> {
  const [row] = await db
    .select()
    .from(activityFileIngestions)
    .where(
      and(
        eq(activityFileIngestions.profile_id, input.profileId),
        eq(activityFileIngestions.id, input.ingestionId),
      ),
    )
    .limit(1);
  return row ? mapActivityIngestionRow(row) : null;
}

async function mutationMiss(
  db: DrizzleQueryExecutor,
  input: { profileId: string; ingestionId: string },
): Promise<ActivityIngestionOperationMutationResult> {
  const existing = await loadOwned(db, input);
  return existing ? { status: "state_conflict", operation: existing } : { status: "not_found" };
}

export function createDrizzleActivityIngestionRepository(
  db: DrizzleQueryExecutor,
): ActivityIngestionRepositoryPort {
  return {
    async createOrLoad(operationInput) {
      const operation = activityFileIngestionOperationSchema.parse(operationInput);
      const [created] = await db
        .insert(activityFileIngestions)
        .values(operationValues(operation))
        .onConflictDoNothing({
          target: [activityFileIngestions.profile_id, activityFileIngestions.operation_id],
        })
        .returning();
      if (created) return { status: "created", operation: mapActivityIngestionRow(created) };

      const [existingRow] = await db
        .select()
        .from(activityFileIngestions)
        .where(
          and(
            eq(activityFileIngestions.profile_id, operation.profileId),
            eq(activityFileIngestions.operation_id, operation.operationId),
          ),
        )
        .limit(1);
      if (!existingRow) throw new Error("Conflicting ingestion operation could not be loaded");
      const existing = mapActivityIngestionRow(existingRow);
      return sameImmutableOperation(existing, operation)
        ? { status: "unchanged", operation: existing }
        : { status: "identity_conflict" };
    },

    getOwned(input) {
      return loadOwned(db, input);
    },

    async getOwnedByOperation(input) {
      const [row] = await db
        .select()
        .from(activityFileIngestions)
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.operation_id, input.operationId),
          ),
        )
        .limit(1);
      return row ? mapActivityIngestionRow(row) : null;
    },

    async recordStagingExpectations(input) {
      const uploadedAt = new Date(input.uploadedAt);
      const [row] = await db
        .update(activityFileIngestions)
        .set({
          staging_bucket: input.stagingBucket,
          staging_path: input.stagingPath,
          expected_sha256: input.expectedSha256,
          expected_byte_size: input.expectedByteSize,
          expected_format: input.expectedFormat,
          expected_media_type: input.expectedMediaType,
          uploaded_at: sql`coalesce(${activityFileIngestions.uploaded_at}, ${uploadedAt})`,
          updated_at: uploadedAt,
        })
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.id, input.ingestionId),
            eq(activityFileIngestions.status, "awaiting_upload"),
            sql`(
              (${activityFileIngestions.staging_bucket} is null and ${activityFileIngestions.staging_path} is null and ${activityFileIngestions.expected_sha256} is null and ${activityFileIngestions.expected_byte_size} is null and ${activityFileIngestions.expected_format} is null and ${activityFileIngestions.expected_media_type} is null)
              or
              (${activityFileIngestions.staging_bucket} = ${input.stagingBucket} and ${activityFileIngestions.staging_path} = ${input.stagingPath} and ${activityFileIngestions.expected_sha256} = ${input.expectedSha256} and ${activityFileIngestions.expected_byte_size} = ${input.expectedByteSize} and ${activityFileIngestions.expected_format} = ${input.expectedFormat} and ${activityFileIngestions.expected_media_type} = ${input.expectedMediaType})
            )`,
          ),
        )
        .returning();
      return row
        ? { status: "updated", operation: mapActivityIngestionRow(row) }
        : mutationMiss(db, input);
    },

    async replaceProviderRetryStaging(input) {
      const uploadedAt = new Date(input.uploadedAt);
      const [row] = await db
        .update(activityFileIngestions)
        .set({
          staging_bucket: input.stagingBucket,
          staging_path: input.stagingPath,
          expected_sha256: input.expectedSha256,
          expected_byte_size: input.expectedByteSize,
          expected_format: input.expectedFormat,
          expected_media_type: input.expectedMediaType,
          uploaded_at: uploadedAt,
          staging_cleanup_pending: false,
          staging_cleaned_at: null,
          staging_cleanup_error: null,
          updated_at: uploadedAt,
        })
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.id, input.ingestionId),
            eq(activityFileIngestions.source, "provider_sync"),
            eq(activityFileIngestions.provider, input.provider),
            eq(activityFileIngestions.external_id, input.externalId),
            eq(activityFileIngestions.integration_id, input.integrationId),
            eq(activityFileIngestions.status, "failed_retryable"),
          ),
        )
        .returning();
      return row
        ? { status: "updated", operation: mapActivityIngestionRow(row) }
        : mutationMiss(db, input);
    },

    async resetRetryableFailureForUpload(input) {
      const resetAt = new Date(input.resetAt);
      const [row] = await db
        .update(activityFileIngestions)
        .set({
          activity_id: null,
          artifact_id: null,
          uploaded_at: null,
          status: "awaiting_upload",
          failure_code: null,
          started_at: null,
          completed_at: null,
          failed_at: null,
          updated_at: resetAt,
        })
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.id, input.ingestionId),
            eq(activityFileIngestions.operation_id, input.operationId),
            eq(activityFileIngestions.source, input.source),
            eq(activityFileIngestions.status, "failed_retryable"),
          ),
        )
        .returning();
      return row
        ? { status: "updated", operation: mapActivityIngestionRow(row) }
        : mutationMiss(db, input);
    },

    async recordAcceptedResult(input) {
      const completedAt = new Date(input.completedAt);
      const [row] = await db
        .update(activityFileIngestions)
        .set({
          artifact_id: input.artifactId,
          activity_id: input.activityId,
          status: "succeeded",
          completed_at: sql`coalesce(${activityFileIngestions.completed_at}, ${completedAt})`,
          failure_code: null,
          failed_at: null,
          staging_cleanup_pending: sql`${activityFileIngestions.staging_path} is not null`,
          staging_cleanup_error: null,
          updated_at: completedAt,
        })
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.id, input.ingestionId),
            eq(activityFileIngestions.operation_id, input.operationId),
            eq(activityFileIngestions.source, input.source),
            sql`(
              ${activityFileIngestions.status} = 'processing'
              or (${activityFileIngestions.status} = 'succeeded' and ${activityFileIngestions.artifact_id} = ${input.artifactId}::uuid and ${activityFileIngestions.activity_id} = ${input.activityId}::uuid)
            )`,
          ),
        )
        .returning();
      return row
        ? { status: "updated", operation: mapActivityIngestionRow(row) }
        : mutationMiss(db, input);
    },

    async transitionLifecycle(input) {
      const update =
        input.update.status === "processing"
          ? {
              status: "processing" as const,
              started_at: sql`coalesce(${activityFileIngestions.started_at}, ${new Date(input.update.startedAt)})`,
              failure_code: null,
              completed_at: null,
              failed_at: null,
              updated_at: new Date(input.update.startedAt),
            }
          : {
              status: input.update.status,
              failure_code: input.update.failureCode,
              completed_at: null,
              failed_at: new Date(input.update.failedAt),
              updated_at: new Date(input.update.failedAt),
            };
      const expectedStatuses =
        input.update.status === "processing"
          ? (["awaiting_upload", "failed_retryable"] as const)
          : (["processing"] as const);
      const [row] = await db
        .update(activityFileIngestions)
        .set(update)
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.id, input.ingestionId),
            inArray(activityFileIngestions.status, expectedStatuses),
          ),
        )
        .returning();
      return row
        ? { status: "updated", operation: mapActivityIngestionRow(row) }
        : mutationMiss(db, input);
    },

    async updateCleanup(input) {
      const update =
        input.update.status === "cleaned"
          ? {
              staging_cleanup_pending: false,
              staging_cleaned_at: new Date(input.update.cleanedAt),
              staging_cleanup_error: null,
              updated_at: new Date(input.update.cleanedAt),
            }
          : {
              staging_cleanup_pending: true,
              staging_cleaned_at: null,
              staging_cleanup_error:
                input.update.status === "failed" ? input.update.error.slice(0, 512) : null,
              updated_at: new Date(),
            };
      const [row] = await db
        .update(activityFileIngestions)
        .set(update)
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.id, input.ingestionId),
            eq(activityFileIngestions.status, "succeeded"),
            sql`${activityFileIngestions.staging_path} is not null`,
            sql`${activityFileIngestions.artifact_id} is not null`,
          ),
        )
        .returning();
      return row
        ? { status: "updated", operation: mapActivityIngestionRow(row) }
        : mutationMiss(db, input);
    },

    async readSafeStatus(input) {
      const operation = await loadOwned(db, input);
      return operation ? projectSafeActivityIngestionStatus(operation) : null;
    },

    async listPendingCleanup(input) {
      const rows = await db
        .select()
        .from(activityFileIngestions)
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.status, "succeeded"),
            eq(activityFileIngestions.staging_cleanup_pending, true),
          ),
        )
        .orderBy(asc(activityFileIngestions.updated_at), asc(activityFileIngestions.id))
        .limit(input.limit);
      return rows.map(mapActivityIngestionRow);
    },
  };
}
