import type { ActivityFileIngestionOperation } from "@repo/core/activity-files";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginActivityIngestionOperation: vi.fn(),
  resetRetryableFailureForUpload: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createDrizzleActivityIngestionRepository: () => ({
    resetRetryableFailureForUpload: mocks.resetRetryableFailureForUpload,
  }),
}));

vi.mock("./direct-activity-ingestion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./direct-activity-ingestion")>()),
  beginActivityIngestionOperation: mocks.beginActivityIngestionOperation,
}));

import { recordingSessionActivityId } from "../activities/submit-activity";
import {
  beginMobileRecordingUploadClaim,
  MobileRecordingUploadError,
  mobileRecordingOperationId,
} from "./mobile-recording-upload";

const profileId = "11111111-1111-4111-8111-111111111111";
const ingestionId = "22222222-2222-4222-8222-222222222222";
const recordingSessionId = "mobile-session-1";
const beforeFailure = "2026-08-16T09:00:00.000Z";
const failedAt = "2026-08-16T10:00:00.000Z";
const claimInput = {
  profileId,
  recordingSessionId,
  byteSize: 3,
  sha256: "a".repeat(64),
  format: "fit" as const,
};

function retryableOperation(
  status: "failed_retryable" | "failed_terminal" = "failed_retryable",
): ActivityFileIngestionOperation {
  return {
    id: ingestionId,
    profileId,
    contractVersion: "activity-intake-v1",
    operationId: mobileRecordingOperationId(recordingSessionId),
    source: "mobile_recording",
    provider: null,
    externalId: null,
    integrationId: null,
    activityId: null,
    artifactId: null,
    stagingBucket: "activity-files",
    stagingPath: `mobile-recordings/${profileId}/${recordingSessionActivityId(profileId, recordingSessionId)}.fit`,
    expectedSha256: claimInput.sha256,
    expectedByteSize: claimInput.byteSize,
    expectedFormat: claimInput.format,
    expectedMediaType: "application/vnd.ant.fit",
    uploadedAt: beforeFailure,
    stagingCleanupPending: false,
    stagingCleanedAt: null,
    stagingCleanupError: null,
    status,
    failureCode: "internal",
    requestedAt: beforeFailure,
    startedAt: beforeFailure,
    completedAt: null,
    failedAt,
    receivedAt: beforeFailure,
    createdAt: beforeFailure,
    updatedAt: failedAt,
  };
}

describe("mobile recording upload retry claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets a matching retryable server failure before issuing a fresh upload claim", async () => {
    const failed = retryableOperation();
    const reset = {
      ...failed,
      uploadedAt: null,
      status: "awaiting_upload" as const,
      failureCode: null,
      startedAt: null,
      failedAt: null,
      updatedAt: "2026-08-16T10:01:00.000Z",
    };
    mocks.beginActivityIngestionOperation.mockResolvedValue(failed);
    mocks.resetRetryableFailureForUpload.mockResolvedValue({ status: "updated", operation: reset });

    await expect(beginMobileRecordingUploadClaim({} as never, claimInput)).resolves.toMatchObject({
      status: "upload",
      ingestionId,
      byteSize: claimInput.byteSize,
      sha256: claimInput.sha256,
    });
    expect(mocks.resetRetryableFailureForUpload).toHaveBeenCalledWith({
      profileId,
      ingestionId,
      operationId: failed.operationId,
      source: "mobile_recording",
      resetAt: expect.any(String),
    });
  });

  it("converges when another exact retry already reset the operation", async () => {
    const failed = retryableOperation();
    const reset = {
      ...failed,
      uploadedAt: null,
      status: "awaiting_upload" as const,
      failureCode: null,
      startedAt: null,
      failedAt: null,
    };
    mocks.beginActivityIngestionOperation.mockResolvedValue(failed);
    mocks.resetRetryableFailureForUpload.mockResolvedValue({
      status: "state_conflict",
      operation: reset,
    });

    await expect(beginMobileRecordingUploadClaim({} as never, claimInput)).resolves.toMatchObject({
      status: "upload",
      ingestionId,
    });
  });

  it("keeps terminal failures immutable", async () => {
    mocks.beginActivityIngestionOperation.mockResolvedValue(retryableOperation("failed_terminal"));

    await expect(beginMobileRecordingUploadClaim({} as never, claimInput)).rejects.toBeInstanceOf(
      MobileRecordingUploadError,
    );
    expect(mocks.resetRetryableFailureForUpload).not.toHaveBeenCalled();
  });
});
