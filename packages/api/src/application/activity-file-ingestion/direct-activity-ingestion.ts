import { createHash } from "node:crypto";
import {
  ACTIVITY_FILE_INGESTION_CONTRACT_VERSION,
  type ActivityFileIngestionOperation,
  type ActivityFileIngestionSource,
  activityFileIngestionOperationSchema,
} from "@repo/core/activity-files";
import type { DrizzleQueryExecutor } from "../../db";
import { createDrizzleActivityIngestionRepository } from "../../infrastructure/repositories";

type FailureCode = NonNullable<ActivityFileIngestionOperation["failureCode"]>;
type StagingFormat = NonNullable<ActivityFileIngestionOperation["expectedFormat"]>;
type StagingMediaType = NonNullable<ActivityFileIngestionOperation["expectedMediaType"]>;

export class ActivityIngestionOperationConflictError extends Error {
  constructor(message = "Activity ingestion operation metadata conflicts") {
    super(message);
    // biome-ignore lint/security/noSecrets: This is an error class name, not a credential.
    this.name = "ActivityIngestionOperationConflictError";
  }
}

export class ActivityIngestionProcessingError extends Error {
  constructor(
    public readonly failureCode: FailureCode,
    public readonly retryable: boolean,
    message = "Activity ingestion processing failed",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ActivityIngestionProcessingError";
  }
}

export function activityIngestionOperationId(identity: string): string {
  return createHash("sha256").update(identity).digest("hex");
}

function deterministicUuid(identity: string): string {
  const hash = createHash("sha256").update(identity).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export interface BeginActivityIngestionInput {
  profileId: string;
  operationId: string;
  source: ActivityFileIngestionSource;
  provider?: ActivityFileIngestionOperation["provider"];
  externalId?: string | null;
  integrationId?: string | null;
  stagingBucket: string;
  stagingPath: string;
  expectedSha256: string;
  expectedByteSize: number;
  expectedFormat: StagingFormat;
  expectedMediaType: StagingMediaType;
  uploaded: boolean;
  now?: Date;
}

/** Creates or replays the single direct-ingestion operation. */
export async function beginActivityIngestionOperation(
  db: DrizzleQueryExecutor,
  input: BeginActivityIngestionInput,
): Promise<ActivityFileIngestionOperation> {
  const now = input.now ?? new Date();
  const instant = now.toISOString();
  const operation = activityFileIngestionOperationSchema.parse({
    id: deterministicUuid(`activity-ingestion:${input.profileId}:${input.operationId}`),
    profileId: input.profileId,
    contractVersion: ACTIVITY_FILE_INGESTION_CONTRACT_VERSION,
    operationId: input.operationId,
    source: input.source,
    provider: input.provider ?? null,
    externalId: input.externalId ?? null,
    integrationId: input.integrationId ?? null,
    activityId: null,
    artifactId: null,
    stagingBucket: input.stagingBucket,
    stagingPath: input.stagingPath,
    expectedSha256: input.expectedSha256,
    expectedByteSize: input.expectedByteSize,
    expectedFormat: input.expectedFormat,
    expectedMediaType: input.expectedMediaType,
    uploadedAt: input.uploaded ? instant : null,
    stagingCleanupPending: false,
    stagingCleanedAt: null,
    stagingCleanupError: null,
    status: "awaiting_upload",
    failureCode: null,
    requestedAt: instant,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    receivedAt: instant,
    createdAt: instant,
    updatedAt: instant,
  });
  const write = await createDrizzleActivityIngestionRepository(db).createOrLoad(operation);
  if (write.status === "identity_conflict") throw new ActivityIngestionOperationConflictError();
  const persisted = write.operation;
  const providerRetryChangedStaging =
    persisted.source === "provider_sync" &&
    persisted.status === "failed_retryable" &&
    (persisted.stagingBucket !== operation.stagingBucket ||
      persisted.stagingPath !== operation.stagingPath ||
      persisted.expectedSha256 !== operation.expectedSha256 ||
      persisted.expectedByteSize !== operation.expectedByteSize ||
      persisted.expectedFormat !== operation.expectedFormat ||
      persisted.expectedMediaType !== operation.expectedMediaType);
  if (!providerRetryChangedStaging) return persisted;
  if (!operation.provider || !operation.externalId || !operation.integrationId) {
    throw new ActivityIngestionOperationConflictError("Provider ingestion identity is incomplete");
  }
  const replaced = await createDrizzleActivityIngestionRepository(db).replaceProviderRetryStaging({
    profileId: operation.profileId,
    ingestionId: persisted.id,
    provider: operation.provider,
    externalId: operation.externalId,
    integrationId: operation.integrationId,
    stagingBucket: input.stagingBucket,
    stagingPath: input.stagingPath,
    expectedSha256: input.expectedSha256,
    expectedByteSize: input.expectedByteSize,
    expectedFormat: input.expectedFormat,
    expectedMediaType: input.expectedMediaType,
    uploadedAt: operation.uploadedAt ?? instant,
  });
  if (replaced.status !== "updated") throw new ActivityIngestionOperationConflictError();
  return replaced.operation;
}

export async function recordActivityIngestionUpload(
  db: DrizzleQueryExecutor,
  input: { profileId: string; ingestionId: string; uploadedAt?: Date },
): Promise<ActivityFileIngestionOperation> {
  const repository = createDrizzleActivityIngestionRepository(db);
  const operation = await repository.getOwned(input);
  if (!operation) throw new ActivityIngestionOperationConflictError("Activity ingestion not found");
  if (operation.status !== "awaiting_upload") return operation;
  if (
    !operation.stagingBucket ||
    !operation.stagingPath ||
    !operation.expectedSha256 ||
    !operation.expectedByteSize ||
    !operation.expectedFormat ||
    !operation.expectedMediaType
  ) {
    throw new ActivityIngestionOperationConflictError(
      "Activity ingestion staging metadata is incomplete",
    );
  }
  const result = await repository.recordStagingExpectations({
    profileId: operation.profileId,
    ingestionId: operation.id,
    stagingBucket: operation.stagingBucket,
    stagingPath: operation.stagingPath,
    expectedSha256: operation.expectedSha256,
    expectedByteSize: operation.expectedByteSize,
    expectedFormat: operation.expectedFormat,
    expectedMediaType: operation.expectedMediaType,
    uploadedAt: (input.uploadedAt ?? new Date()).toISOString(),
  });
  if (result.status !== "updated") throw new ActivityIngestionOperationConflictError();
  return result.operation;
}

export type ActivityIngestionProcessingClaim =
  | { status: "claimed"; operation: ActivityFileIngestionOperation }
  | { status: "existing"; operation: ActivityFileIngestionOperation };

function hasProcessingIdentity(
  operation: ActivityFileIngestionOperation,
  input: { operationId: string; source: ActivityFileIngestionSource },
) {
  return operation.operationId === input.operationId && operation.source === input.source;
}

/**
 * Atomically grants processing ownership once. A concurrent exact replay observes the
 * durable in-progress/completed operation without acquiring finalization ownership.
 */
export async function claimActivityIngestionProcessing(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    ingestionId: string;
    operationId: string;
    source: ActivityFileIngestionSource;
    now?: Date;
  },
): Promise<ActivityIngestionProcessingClaim> {
  const repository = createDrizzleActivityIngestionRepository(db);
  const existing = await repository.getOwned(input);
  if (
    !existing ||
    !hasProcessingIdentity(existing, input) ||
    existing.status === "failed_terminal"
  ) {
    throw new ActivityIngestionOperationConflictError("Activity ingestion is not processable");
  }
  if (existing.status === "processing" || existing.status === "succeeded") {
    return { status: "existing", operation: existing };
  }
  const result = await repository.transitionLifecycle({
    profileId: input.profileId,
    ingestionId: input.ingestionId,
    update: { status: "processing", startedAt: (input.now ?? new Date()).toISOString() },
  });
  if (result.status === "updated") return { status: "claimed", operation: result.operation };
  if (
    result.status === "state_conflict" &&
    hasProcessingIdentity(result.operation, input) &&
    (result.operation.status === "processing" || result.operation.status === "succeeded")
  ) {
    return { status: "existing", operation: result.operation };
  }
  throw new ActivityIngestionOperationConflictError();
}

/** Direct processing compatibility wrapper; callers without replay results fail safely. */
export async function startActivityIngestionProcessing(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    ingestionId: string;
    operationId: string;
    source: ActivityFileIngestionSource;
    now?: Date;
  },
): Promise<ActivityFileIngestionOperation> {
  const claim = await claimActivityIngestionProcessing(db, input);
  if (claim.status !== "claimed") {
    throw new ActivityIngestionOperationConflictError(
      "Activity ingestion is already being processed",
    );
  }
  return claim.operation;
}

/** Called inside the canonical activity transaction. */
export async function acceptActivityIngestion(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    ingestionId: string;
    operationId: string;
    source: ActivityFileIngestionSource;
    artifactId: string;
    activityId: string;
    completedAt: Date;
  },
): Promise<ActivityFileIngestionOperation> {
  const result = await createDrizzleActivityIngestionRepository(db).recordAcceptedResult({
    ...input,
    completedAt: input.completedAt.toISOString(),
  });
  if (result.status !== "updated") throw new ActivityIngestionOperationConflictError();
  return result.operation;
}

export async function failActivityIngestion(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    ingestionId: string;
    failureCode: FailureCode;
    retryable: boolean;
    now?: Date;
  },
): Promise<boolean> {
  const failedAt = (input.now ?? new Date()).toISOString();
  const result = await createDrizzleActivityIngestionRepository(db).transitionLifecycle({
    profileId: input.profileId,
    ingestionId: input.ingestionId,
    update: input.retryable
      ? { status: "failed_retryable", failureCode: input.failureCode, failedAt }
      : { status: "failed_terminal", failureCode: input.failureCode, failedAt },
  });
  return result.status === "updated";
}

export async function completeActivityIngestionCleanup(
  db: DrizzleQueryExecutor,
  input: { profileId: string; ingestionId: string; cleanedAt?: Date },
): Promise<boolean> {
  const result = await createDrizzleActivityIngestionRepository(db).updateCleanup({
    profileId: input.profileId,
    ingestionId: input.ingestionId,
    update: { status: "cleaned", cleanedAt: (input.cleanedAt ?? new Date()).toISOString() },
  });
  return result.status === "updated";
}

export async function deferActivityIngestionCleanup(
  db: DrizzleQueryExecutor,
  input: { profileId: string; ingestionId: string },
): Promise<boolean> {
  const result = await createDrizzleActivityIngestionRepository(db).updateCleanup({
    ...input,
    update: { status: "failed", error: "staging_cleanup_failed" },
  });
  return result.status === "updated";
}
