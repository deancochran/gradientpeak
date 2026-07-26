import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import type { ActivityFileIngestionRow } from "@repo/db";
import {
  mobileRecordingArtifactFormatSchema,
  type RecordingAcceptedArtifact,
  recordingAcceptedArtifactSchema,
} from "../../contracts/recording-submission";
import type { getRequiredDb } from "../../db";
import {
  claimMobileRecordingUpload,
  createOrLoadMobileRecordingUploadClaim,
  listPendingMobileRecordingStagingCleanup,
  loadAcceptedActivityArtifact,
  loadMobileRecordingUploadClaim,
  markMobileRecordingStagingCleaned,
  markMobileRecordingUploadFailed,
  recordMobileRecordingStagingCleanupFailure,
} from "../../repositories/mobile-recording-upload-repository";
import { recordingSessionActivityId } from "../activities/submit-activity";
import {
  type ActivityArtifactStorage,
  activityArtifactSha256,
  cleanupActivityArtifactStaging,
  promoteActivityArtifact,
} from "./artifact-storage";

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

export function mobileRecordingOperationKey(recordingSessionId: string) {
  return `mobile-recording:${recordingSessionId}`;
}

export function mobileRecordingMediaType(format: "fit" | "gpx" | "tcx") {
  switch (format) {
    case "fit":
      return "application/vnd.ant.fit";
    case "gpx":
      return "application/gpx+xml";
    case "tcx":
      return "application/vnd.garmin.tcx+xml";
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
    operationKey: mobileRecordingOperationKey(input.recordingSessionId),
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

function claimMatchesExpected(
  claim: ActivityFileIngestionRow,
  expected: ReturnType<typeof expectedClaimMetadata>,
) {
  return (
    claim.source === "mobile_recording" &&
    claim.operation_key === expected.operationKey &&
    claim.staging_bucket === expected.stagingBucket &&
    claim.staging_path === expected.stagingPath &&
    claim.expected_sha256 === expected.expectedSha256 &&
    claim.expected_byte_size === expected.expectedByteSize &&
    claim.expected_format === expected.expectedFormat &&
    claim.expected_media_type === expected.expectedMediaType
  );
}

function acceptedArtifactFromClaim(
  claim: ActivityFileIngestionRow,
): RecordingAcceptedArtifact | null {
  const parsed = recordingAcceptedArtifactSchema.safeParse({
    sha256: claim.accepted_sha256,
    byteSize: claim.accepted_byte_size,
    bucket: claim.accepted_bucket,
    path: claim.accepted_path,
    mediaType: claim.accepted_media_type,
    format: claim.accepted_format,
    originalName: null,
  });
  return parsed.success ? parsed.data : null;
}

export async function loadAcceptedArtifactForClaim(db: DbClient, claim: ActivityFileIngestionRow) {
  const fromClaim = acceptedArtifactFromClaim(claim);
  if (fromClaim) return fromClaim;
  if (!claim.artifact_id) return null;

  const artifact = await loadAcceptedActivityArtifact(db, {
    artifactId: claim.artifact_id,
    profileId: claim.profile_id,
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
  const claim = await createOrLoadMobileRecordingUploadClaim(db, {
    profileId: input.profileId,
    operationKey: expected.operationKey,
    stagingBucket: expected.stagingBucket,
    stagingPath: expected.stagingPath,
    expectedSha256: expected.expectedSha256,
    expectedByteSize: expected.expectedByteSize,
    expectedFormat: expected.expectedFormat,
    expectedMediaType: expected.expectedMediaType,
  });

  if (claim.status === "ready") {
    if (claim.activity_id !== expected.activityId) {
      throw new MobileRecordingUploadError(
        "claim_conflict",
        "Recording session is already bound to a different activity",
      );
    }
    const acceptedArtifact = await loadAcceptedArtifactForClaim(db, claim);
    if (!acceptedArtifact) {
      throw new MobileRecordingUploadError(
        "claim_invalid",
        "Ready recording upload claim is missing its accepted artifact",
      );
    }
    if (
      acceptedArtifact.sha256 !== input.sha256 ||
      acceptedArtifact.byteSize !== input.byteSize ||
      acceptedArtifact.format !== input.format
    ) {
      throw new MobileRecordingUploadError(
        "claim_conflict",
        "Recording session was already accepted with different artifact metadata",
      );
    }
    return {
      status: "ready",
      ingestionId: claim.id,
      activityId: expected.activityId,
      byteSize: acceptedArtifact.byteSize,
      sha256: acceptedArtifact.sha256,
      format: acceptedArtifact.format,
      mediaType: acceptedArtifact.mediaType,
      acceptedArtifact,
    };
  }

  if (!claimMatchesExpected(claim, expected)) {
    throw new MobileRecordingUploadError(
      "claim_conflict",
      "Recording upload metadata conflicts with the existing session claim",
    );
  }
  if (claim.status === "processing") {
    throw new MobileRecordingUploadError(
      "claim_conflict",
      "Recording upload is already being accepted",
    );
  }

  return {
    status: "upload",
    ingestionId: claim.id,
    activityId: expected.activityId,
    byteSize: expected.expectedByteSize,
    sha256: expected.expectedSha256,
    format: expected.expectedFormat,
    mediaType: expected.expectedMediaType,
    stagingPath: expected.stagingPath,
  };
}

export type PreparedMobileRecordingArtifact =
  | { status: "ready"; ingestion: ActivityFileIngestionRow; artifact: RecordingAcceptedArtifact }
  | {
      status: "claimed";
      ingestion: ActivityFileIngestionRow;
      claimToken: string;
      artifact: RecordingAcceptedArtifact;
    };

function safeUploadFailure(error: unknown) {
  if (error instanceof MobileRecordingUploadError) return error;
  return new MobileRecordingUploadError(
    "storage_failure",
    "Recording artifact could not be accepted from storage",
    { cause: error },
  );
}

export async function prepareMobileRecordingArtifact(
  db: DbClient,
  storage: ActivityArtifactStorage,
  input: { profileId: string; recordingSessionId: string; ingestionId: string },
): Promise<PreparedMobileRecordingArtifact> {
  const operationKey = mobileRecordingOperationKey(input.recordingSessionId);
  let claim = await loadMobileRecordingUploadClaim(db, {
    ingestionId: input.ingestionId,
    profileId: input.profileId,
    operationKey,
  });
  if (!claim) {
    throw new MobileRecordingUploadError("claim_not_found", "Recording upload claim was not found");
  }
  if (claim.status === "ready") {
    const artifact = await loadAcceptedArtifactForClaim(db, claim);
    if (!artifact) {
      throw new MobileRecordingUploadError(
        "claim_invalid",
        "Ready recording upload claim is missing its accepted artifact",
      );
    }
    return { status: "ready", ingestion: claim, artifact };
  }

  claim =
    (await claimMobileRecordingUpload(db, {
      ingestionId: input.ingestionId,
      profileId: input.profileId,
      operationKey,
    })) ?? undefined;
  if (!claim?.claim_token) {
    const raced = await loadMobileRecordingUploadClaim(db, {
      ingestionId: input.ingestionId,
      profileId: input.profileId,
      operationKey,
    });
    if (raced?.status === "ready") {
      const artifact = await loadAcceptedArtifactForClaim(db, raced);
      if (artifact) return { status: "ready", ingestion: raced, artifact };
    }
    throw new MobileRecordingUploadError(
      "claim_lost",
      "Recording upload claim is already being processed",
    );
  }

  const claimToken = claim.claim_token;
  try {
    const format = mobileRecordingArtifactFormatSchema.safeParse(claim.expected_format);
    if (
      !format.success ||
      !claim.staging_bucket ||
      !claim.staging_path ||
      !claim.expected_sha256 ||
      !claim.expected_byte_size ||
      !claim.expected_media_type ||
      claim.expected_byte_size > MAX_ACTIVITY_FILE_SIZE_BYTES
    ) {
      throw new MobileRecordingUploadError(
        "claim_invalid",
        "Recording upload claim metadata is incomplete",
      );
    }

    const expectedActivityId = recordingSessionActivityId(
      input.profileId,
      input.recordingSessionId,
    );
    const expectedPath = mobileRecordingStagingPath({
      profileId: input.profileId,
      activityId: expectedActivityId,
      format: format.data,
    });
    if (claim.staging_bucket !== "activity-files" || claim.staging_path !== expectedPath) {
      throw new MobileRecordingUploadError(
        "claim_invalid",
        "Recording upload claim storage identity is invalid",
      );
    }

    const stored = await storage.readObjectBounded({
      bucket: claim.staging_bucket,
      path: claim.staging_path,
      maxBytes: claim.expected_byte_size,
    });
    const actualSha256 = activityArtifactSha256(stored.data);
    if (
      stored.data.byteLength !== claim.expected_byte_size ||
      actualSha256 !== claim.expected_sha256
    ) {
      throw new MobileRecordingUploadError(
        "expected_artifact_mismatch",
        "Recording upload bytes do not match the durable claim",
      );
    }

    const promoted = await promoteActivityArtifact(storage, {
      profileId: input.profileId,
      bucket: claim.staging_bucket,
      stagingPath: claim.staging_path,
      bytes: stored.data,
      format: format.data,
      mediaType: claim.expected_media_type,
    });
    const artifact = recordingAcceptedArtifactSchema.parse({
      sha256: promoted.sha256,
      byteSize: promoted.byteSize,
      bucket: promoted.bucket,
      path: promoted.path,
      mediaType: promoted.mediaType,
      format: promoted.format,
      originalName: null,
    });
    if (
      artifact.sha256 !== claim.expected_sha256 ||
      artifact.byteSize !== claim.expected_byte_size
    ) {
      throw new MobileRecordingUploadError(
        "expected_artifact_mismatch",
        "Promoted recording artifact does not match the durable claim",
      );
    }
    return { status: "claimed", ingestion: claim, claimToken, artifact };
  } catch (error) {
    const safeError = safeUploadFailure(error);
    await markMobileRecordingUploadFailed(db, {
      ingestionId: input.ingestionId,
      profileId: input.profileId,
      operationKey,
      claimToken,
      errorCode: safeError.code,
      errorMessage: safeError.message,
    });
    throw safeError;
  }
}

export async function markPreparedMobileRecordingArtifactFailed(
  db: DbClient,
  input: {
    profileId: string;
    recordingSessionId: string;
    ingestionId: string;
    claimToken: string;
    error: unknown;
  },
) {
  const safeError = safeUploadFailure(input.error);
  await markMobileRecordingUploadFailed(db, {
    ingestionId: input.ingestionId,
    profileId: input.profileId,
    operationKey: mobileRecordingOperationKey(input.recordingSessionId),
    claimToken: input.claimToken,
    errorCode: safeError.code,
    errorMessage: safeError.message,
  });
}

/** Cleanup is best-effort after relational acceptance and remains retryable. */
export async function retryMobileRecordingStagingCleanup(
  db: DbClient,
  storage: ActivityArtifactStorage,
  input: { profileId: string; ingestion: ActivityFileIngestionRow },
) {
  const { ingestion } = input;
  if (!ingestion.staging_cleanup_pending) return true;
  if (!ingestion.staging_bucket || !ingestion.staging_path || !ingestion.accepted_path) {
    await recordMobileRecordingStagingCleanupFailure(db, {
      ingestionId: ingestion.id,
      profileId: input.profileId,
      errorCode: "cleanup_metadata_invalid",
    });
    return false;
  }

  try {
    await cleanupActivityArtifactStaging(storage, {
      bucket: ingestion.staging_bucket,
      stagingPath: ingestion.staging_path,
      path: ingestion.accepted_path,
    });
    await markMobileRecordingStagingCleaned(db, {
      ingestionId: ingestion.id,
      profileId: input.profileId,
    });
    return true;
  } catch {
    await recordMobileRecordingStagingCleanupFailure(db, {
      ingestionId: ingestion.id,
      profileId: input.profileId,
      errorCode: "staging_cleanup_failed",
    });
    return false;
  }
}

export async function drainPendingMobileRecordingStagingCleanup(
  db: DbClient,
  storage: ActivityArtifactStorage,
  input: { profileId: string; limit: number },
) {
  const pending = await listPendingMobileRecordingStagingCleanup(db, input);
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
