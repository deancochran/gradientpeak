import {
  type ActivityFileIngestionOperation,
  MAX_ACTIVITY_FILE_SIZE_BYTES,
} from "@repo/core/activity-files";
import { activityArtifacts } from "@repo/db";
import { and, eq } from "drizzle-orm";
import {
  mobileRecordingArtifactFormatSchema,
  type RecordingAcceptedArtifact,
  recordingAcceptedArtifactSchema,
} from "../../contracts/recording-submission";
import type { getRequiredDb } from "../../db";
import { createDrizzleActivityIngestionRepository } from "../../infrastructure/repositories";
import { recordingSessionActivityId } from "../activities/submit-activity";
import {
  type ActivityArtifactStorage,
  activityArtifactSha256,
  cleanupActivityArtifactStaging,
} from "./artifact-storage";
import {
  ActivityIngestionOperationConflictError,
  activityIngestionOperationId,
  beginActivityIngestionOperation,
  completeActivityIngestionCleanup,
  deferActivityIngestionCleanup,
  failActivityIngestion,
  recordActivityIngestionUpload,
  startActivityIngestionProcessing,
} from "./direct-activity-ingestion";

type DbClient = ReturnType<typeof getRequiredDb>;

export type MobileRecordingUploadFailureCode =
  | "claim_conflict"
  | "claim_invalid"
  | "claim_lost"
  | "claim_not_found"
  | "expected_artifact_mismatch"
  | "storage_failure";

export class MobileRecordingUploadError extends Error {
  constructor(
    readonly code: MobileRecordingUploadFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MobileRecordingUploadError";
  }
}

export function mobileRecordingOperationId(recordingSessionId: string) {
  return activityIngestionOperationId(`mobile_recording:${recordingSessionId}`);
}

export function mobileRecordingMediaType(format: "fit" | "gpx" | "tcx") {
  switch (format) {
    case "fit":
      return "application/vnd.ant.fit" as const;
    case "gpx":
      return "application/gpx+xml" as const;
    case "tcx":
      return "application/vnd.garmin.tcx+xml" as const;
  }
}

export function mobileRecordingStagingPath(input: {
  profileId: string;
  activityId: string;
  format: "fit" | "gpx" | "tcx";
}) {
  return `mobile-recordings/${input.profileId}/${input.activityId}.${input.format}`;
}

function expectedClaimMetadata(input: {
  profileId: string;
  recordingSessionId: string;
  byteSize: number;
  sha256: string;
  format: "fit" | "gpx" | "tcx";
}) {
  const activityId = recordingSessionActivityId(input.profileId, input.recordingSessionId);
  return {
    activityId,
    operationId: mobileRecordingOperationId(input.recordingSessionId),
    stagingBucket: "activity-files",
    stagingPath: mobileRecordingStagingPath({
      profileId: input.profileId,
      activityId,
      format: input.format,
    }),
    expectedSha256: input.sha256,
    expectedByteSize: input.byteSize,
    expectedFormat: input.format,
    expectedMediaType: mobileRecordingMediaType(input.format),
  } as const;
}

function operationMatchesExpected(
  operation: ActivityFileIngestionOperation,
  expected: ReturnType<typeof expectedClaimMetadata>,
) {
  return (
    operation.source === "mobile_recording" &&
    operation.operationId === expected.operationId &&
    operation.stagingBucket === expected.stagingBucket &&
    operation.stagingPath === expected.stagingPath &&
    operation.expectedSha256 === expected.expectedSha256 &&
    operation.expectedByteSize === expected.expectedByteSize &&
    operation.expectedFormat === expected.expectedFormat &&
    operation.expectedMediaType === expected.expectedMediaType
  );
}

export async function loadAcceptedArtifactForClaim(
  db: DbClient,
  operation: ActivityFileIngestionOperation,
) {
  if (!operation.artifactId) return null;
  const artifact = await db.query.activityArtifacts.findFirst({
    where: and(
      eq(activityArtifacts.id, operation.artifactId),
      eq(activityArtifacts.profile_id, operation.profileId),
      eq(activityArtifacts.availability, "accepted"),
    ),
  });
  if (!artifact) return null;
  const parsed = recordingAcceptedArtifactSchema.safeParse({
    sha256: artifact.digest,
    byteSize: artifact.byte_size,
    bucket: artifact.bucket,
    path: artifact.path,
    mediaType: artifact.media_type,
    format: artifact.format,
    originalName: artifact.original_name,
  });
  return parsed.success ? parsed.data : null;
}

export type MobileRecordingUploadClaimResult =
  | {
      status: "upload";
      ingestionId: string;
      activityId: string;
      byteSize: number;
      sha256: string;
      format: "fit" | "gpx" | "tcx";
      mediaType: string;
      stagingPath: string;
    }
  | {
      status: "ready";
      ingestionId: string;
      activityId: string;
      byteSize: number;
      sha256: string;
      format: "fit" | "gpx" | "tcx";
      mediaType: string;
      acceptedArtifact: RecordingAcceptedArtifact;
    };

export async function beginMobileRecordingUploadClaim(
  db: DbClient,
  input: {
    profileId: string;
    recordingSessionId: string;
    byteSize: number;
    sha256: string;
    format: "fit" | "gpx" | "tcx";
  },
): Promise<MobileRecordingUploadClaimResult> {
  const expected = expectedClaimMetadata(input);
  let operation: ActivityFileIngestionOperation;
  try {
    operation = await beginActivityIngestionOperation(db, {
      profileId: input.profileId,
      operationId: expected.operationId,
      source: "mobile_recording",
      stagingBucket: expected.stagingBucket,
      stagingPath: expected.stagingPath,
      expectedSha256: expected.expectedSha256,
      expectedByteSize: expected.expectedByteSize,
      expectedFormat: expected.expectedFormat,
      expectedMediaType: expected.expectedMediaType,
      uploaded: false,
    });
  } catch (error) {
    if (error instanceof ActivityIngestionOperationConflictError) {
      throw new MobileRecordingUploadError(
        "claim_conflict",
        "Recording upload metadata conflicts with the existing session claim",
        { cause: error },
      );
    }
    throw error;
  }

  if (!operationMatchesExpected(operation, expected)) {
    throw new MobileRecordingUploadError(
      "claim_conflict",
      "Recording upload metadata conflicts with the existing session claim",
    );
  }
  if (operation.status === "failed_retryable") {
    const reset = await createDrizzleActivityIngestionRepository(db).resetRetryableFailureForUpload(
      {
        profileId: input.profileId,
        ingestionId: operation.id,
        operationId: expected.operationId,
        source: "mobile_recording",
        resetAt: new Date().toISOString(),
      },
    );
    if (reset.status === "updated") {
      operation = reset.operation;
    } else if (
      reset.status === "state_conflict" &&
      operationMatchesExpected(reset.operation, expected) &&
      (reset.operation.status === "awaiting_upload" || reset.operation.status === "succeeded")
    ) {
      operation = reset.operation;
    } else {
      throw new MobileRecordingUploadError(
        "claim_conflict",
        "Recording upload retry could not acquire a fresh claim",
      );
    }
  }
  if (operation.status === "succeeded") {
    if (operation.activityId !== expected.activityId) {
      throw new MobileRecordingUploadError(
        "claim_conflict",
        "Recording session is already bound to a different activity",
      );
    }
    const acceptedArtifact = await loadAcceptedArtifactForClaim(db, operation);
    if (!acceptedArtifact) {
      throw new MobileRecordingUploadError(
        "claim_invalid",
        "Succeeded recording upload is missing its accepted artifact",
      );
    }
    return {
      status: "ready",
      ingestionId: operation.id,
      activityId: expected.activityId,
      byteSize: acceptedArtifact.byteSize,
      sha256: acceptedArtifact.sha256,
      format: acceptedArtifact.format,
      mediaType: acceptedArtifact.mediaType,
      acceptedArtifact,
    };
  }
  if (operation.status !== "awaiting_upload") {
    throw new MobileRecordingUploadError(
      "claim_conflict",
      "Recording upload is already being accepted",
    );
  }
  return {
    status: "upload",
    ingestionId: operation.id,
    activityId: expected.activityId,
    byteSize: expected.expectedByteSize,
    sha256: expected.expectedSha256,
    format: expected.expectedFormat,
    mediaType: expected.expectedMediaType,
    stagingPath: expected.stagingPath,
  };
}

export type PreparedMobileRecordingArtifact =
  | {
      status: "ready";
      ingestion: ActivityFileIngestionOperation;
      artifact: RecordingAcceptedArtifact;
    }
  | {
      status: "processing";
      ingestion: ActivityFileIngestionOperation;
      staging: {
        bucket: string;
        path: string;
        bytes: Uint8Array;
        format: "fit" | "gpx" | "tcx";
        mediaType: string;
      };
    };

function safeUploadFailure(error: unknown) {
  if (error instanceof MobileRecordingUploadError) return error;
  return new MobileRecordingUploadError(
    "storage_failure",
    "Recording artifact could not be accepted from storage",
    { cause: error },
  );
}

async function readPreparedMobileRecordingArtifact(
  storage: ActivityArtifactStorage,
  operation: ActivityFileIngestionOperation,
  signal?: AbortSignal,
): Promise<Extract<PreparedMobileRecordingArtifact, { status: "processing" }>> {
  signal?.throwIfAborted();
  const format = mobileRecordingArtifactFormatSchema.safeParse(operation.expectedFormat);
  if (
    operation.source !== "mobile_recording" ||
    !format.success ||
    !operation.stagingBucket ||
    !operation.stagingPath ||
    !operation.expectedSha256 ||
    !operation.expectedByteSize ||
    !operation.expectedMediaType ||
    operation.expectedByteSize > MAX_ACTIVITY_FILE_SIZE_BYTES
  ) {
    throw new MobileRecordingUploadError(
      "claim_invalid",
      "Recording upload claim metadata is incomplete",
    );
  }
  const stored = await storage.readObjectBounded({
    bucket: operation.stagingBucket,
    path: operation.stagingPath,
    maxBytes: operation.expectedByteSize,
  });
  signal?.throwIfAborted();
  if (
    stored.data.byteLength !== operation.expectedByteSize ||
    activityArtifactSha256(stored.data) !== operation.expectedSha256
  ) {
    throw new MobileRecordingUploadError(
      "expected_artifact_mismatch",
      "Recording upload bytes do not match the durable claim",
    );
  }
  return {
    status: "processing",
    ingestion: operation,
    staging: {
      bucket: operation.stagingBucket,
      path: operation.stagingPath,
      bytes: stored.data,
      format: format.data,
      mediaType: operation.expectedMediaType,
    },
  };
}

export async function prepareMobileRecordingArtifact(
  db: DbClient,
  storage: ActivityArtifactStorage,
  input: {
    profileId: string;
    recordingSessionId: string;
    ingestionId: string;
  },
): Promise<PreparedMobileRecordingArtifact> {
  const operationId = mobileRecordingOperationId(input.recordingSessionId);
  let operation = await createDrizzleActivityIngestionRepository(db).getOwned({
    profileId: input.profileId,
    ingestionId: input.ingestionId,
  });
  if (
    !operation ||
    operation.operationId !== operationId ||
    operation.source !== "mobile_recording"
  ) {
    throw new MobileRecordingUploadError("claim_not_found", "Recording upload claim was not found");
  }
  if (operation.status === "succeeded") {
    const artifact = await loadAcceptedArtifactForClaim(db, operation);
    if (!artifact) {
      throw new MobileRecordingUploadError(
        "claim_invalid",
        "Succeeded recording upload is missing its accepted artifact",
      );
    }
    return { status: "ready", ingestion: operation, artifact };
  }

  operation = await recordActivityIngestionUpload(db, {
    profileId: input.profileId,
    ingestionId: input.ingestionId,
  });
  try {
    operation = await startActivityIngestionProcessing(db, {
      ingestionId: input.ingestionId,
      profileId: input.profileId,
      operationId,
      source: "mobile_recording",
    });
  } catch (error) {
    if (error instanceof ActivityIngestionOperationConflictError) {
      throw new MobileRecordingUploadError(
        "claim_lost",
        "Recording upload claim is already being processed",
        { cause: error },
      );
    }
    throw error;
  }

  try {
    return await readPreparedMobileRecordingArtifact(storage, operation);
  } catch (error) {
    const safeError = safeUploadFailure(error);
    await failActivityIngestion(db, {
      profileId: input.profileId,
      ingestionId: input.ingestionId,
      failureCode:
        safeError.code === "expected_artifact_mismatch" ? "hash_mismatch" : "artifact_missing",
      retryable: safeError.code === "storage_failure",
    });
    throw safeError;
  }
}

export async function markPreparedMobileRecordingArtifactFailed(
  db: DbClient,
  input: { ingestion: ActivityFileIngestionOperation; error: unknown },
) {
  await failActivityIngestion(db, {
    profileId: input.ingestion.profileId,
    ingestionId: input.ingestion.id,
    failureCode: "internal",
    retryable: true,
  });
}

/** Cleanup is safely retryable without rerunning canonical acceptance. */
export async function retryMobileRecordingStagingCleanup(
  db: DbClient,
  storage: ActivityArtifactStorage,
  input: { profileId: string; ingestion: ActivityFileIngestionOperation },
) {
  if (!input.ingestion.stagingCleanupPending) return true;
  const artifact = await loadAcceptedArtifactForClaim(db, input.ingestion);
  if (!input.ingestion.stagingBucket || !input.ingestion.stagingPath || !artifact) {
    await deferActivityIngestionCleanup(db, {
      profileId: input.profileId,
      ingestionId: input.ingestion.id,
    });
    return false;
  }
  try {
    await cleanupActivityArtifactStaging(storage, {
      bucket: input.ingestion.stagingBucket,
      stagingPath: input.ingestion.stagingPath,
      path: artifact.path,
    });
    return completeActivityIngestionCleanup(db, {
      profileId: input.profileId,
      ingestionId: input.ingestion.id,
    });
  } catch {
    await deferActivityIngestionCleanup(db, {
      profileId: input.profileId,
      ingestionId: input.ingestion.id,
    });
    return false;
  }
}

export async function drainPendingMobileRecordingStagingCleanup(
  db: DbClient,
  storage: ActivityArtifactStorage,
  input: { profileId: string; limit: number },
) {
  const pending = (
    await createDrizzleActivityIngestionRepository(db).listPendingCleanup(input)
  ).filter((operation) => operation.source === "mobile_recording");
  let cleaned = 0;
  for (const ingestion of pending) {
    if (
      await retryMobileRecordingStagingCleanup(db, storage, {
        profileId: input.profileId,
        ingestion,
      })
    ) {
      cleaned += 1;
    }
  }
  return { attempted: pending.length, cleaned, pending: pending.length - cleaned };
}
