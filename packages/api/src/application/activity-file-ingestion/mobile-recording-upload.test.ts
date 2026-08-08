import type { ActivityFileIngestionRow } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  claimMobileRecordingUpload: vi.fn(),
  createOrLoadMobileRecordingUploadClaim: vi.fn(),
  listPendingMobileRecordingStagingCleanup: vi.fn(),
  loadAcceptedActivityArtifact: vi.fn(),
  loadMobileRecordingUploadClaim: vi.fn(),
  markMobileRecordingStagingCleaned: vi.fn(),
  markMobileRecordingUploadFailed: vi.fn(),
  recordMobileRecordingStagingCleanupFailure: vi.fn(),
}));

vi.mock("../../repositories/mobile-recording-upload-repository", () => repository);

import { recordingSessionActivityId } from "../activities/submit-activity";
import { type ActivityArtifactStorage, activityArtifactSha256 } from "./artifact-storage";
import {
  beginMobileRecordingUploadClaim,
  drainPendingMobileRecordingStagingCleanup,
  mobileRecordingOperationKey,
  mobileRecordingStagingPath,
  prepareMobileRecordingArtifact,
  retryMobileRecordingStagingCleanup,
} from "./mobile-recording-upload";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INGESTION_ID = "22222222-2222-4222-8222-222222222222";
const CLAIM_TOKEN = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "recording-session-1";
const BYTES = new Uint8Array([1, 2, 3]);
const SHA256 = activityArtifactSha256(BYTES);

function ingestion(overrides: Partial<ActivityFileIngestionRow> = {}): ActivityFileIngestionRow {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const activityId = recordingSessionActivityId(PROFILE_ID, SESSION_ID);
  return {
    id: INGESTION_ID,
    activity_id: null,
    artifact_id: null,
    profile_id: PROFILE_ID,
    source: "mobile_recording",
    provider: null,
    external_id: null,
    integration_id: null,
    operation_key: mobileRecordingOperationKey(SESSION_ID),
    claim_token: null,
    lease_expires_at: null,
    staging_bucket: "activity-files",
    staging_path: mobileRecordingStagingPath({
      profileId: PROFILE_ID,
      activityId,
      format: "fit",
    }),
    expected_sha256: SHA256,
    expected_byte_size: BYTES.byteLength,
    expected_format: "fit",
    expected_media_type: "application/vnd.ant.fit",
    uploaded_at: null,
    staging_cleanup_pending: false,
    staging_cleaned_at: null,
    staging_cleanup_error: null,
    received_at: now,
    status: "pending_upload",
    attempt_count: 0,
    last_error_code: null,
    last_error_message: null,
    requested_at: now,
    started_at: null,
    completed_at: null,
    failed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function storage(): {
  service: ActivityArtifactStorage;
  readObjectBounded: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
} {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const readObjectBounded = vi.fn().mockResolvedValue({
    data: BYTES,
    contentType: "application/vnd.ant.fit",
  });
  return {
    upload,
    remove,
    readObjectBounded,
    service: {
      storage: { from: vi.fn(() => ({ upload, remove })) },
      readObjectBounded,
    },
  };
}

describe("mobile recording upload application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.markMobileRecordingUploadFailed.mockResolvedValue(true);
    repository.markMobileRecordingStagingCleaned.mockResolvedValue(true);
    repository.recordMobileRecordingStagingCleanupFailure.mockResolvedValue(true);
    repository.listPendingMobileRecordingStagingCleanup.mockResolvedValue([]);
    repository.loadAcceptedActivityArtifact.mockResolvedValue({
      digest: SHA256,
      byte_size: BYTES.byteLength,
      bucket: "activity-files",
      path: `artifacts/sha256/${PROFILE_ID}/${SHA256}`,
      media_type: "application/vnd.ant.fit",
      format: "fit",
      original_name: null,
    });
  });

  it("creates a durable claim from deterministic server-owned storage metadata", async () => {
    repository.createOrLoadMobileRecordingUploadClaim.mockResolvedValue(ingestion());
    const result = await beginMobileRecordingUploadClaim({} as never, {
      profileId: PROFILE_ID,
      recordingSessionId: SESSION_ID,
      byteSize: BYTES.byteLength,
      sha256: SHA256,
      format: "fit",
    });

    expect(result).toMatchObject({
      status: "upload",
      ingestionId: INGESTION_ID,
      sha256: SHA256,
      byteSize: BYTES.byteLength,
      format: "fit",
    });
    expect(repository.createOrLoadMobileRecordingUploadClaim).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: PROFILE_ID,
        operationKey: mobileRecordingOperationKey(SESSION_ID),
        expectedSha256: SHA256,
        expectedByteSize: BYTES.byteLength,
        expectedFormat: "fit",
        expectedMediaType: "application/vnd.ant.fit",
      }),
    );
  });

  it("rejects a replay whose immutable request metadata differs", async () => {
    repository.createOrLoadMobileRecordingUploadClaim.mockResolvedValue(
      ingestion({ expected_byte_size: BYTES.byteLength + 1 }),
    );
    await expect(
      beginMobileRecordingUploadClaim({} as never, {
        profileId: PROFILE_ID,
        recordingSessionId: SESSION_ID,
        byteSize: BYTES.byteLength,
        sha256: SHA256,
        format: "fit",
      }),
    ).rejects.toMatchObject({ code: "claim_conflict" });
  });

  it("claims and verifies staging bytes without trusting client metadata", async () => {
    const pending = ingestion();
    const claimed = ingestion({
      status: "processing",
      claim_token: CLAIM_TOKEN,
      lease_expires_at: new Date("2026-07-24T12:05:00.000Z"),
    });
    repository.loadMobileRecordingUploadClaim.mockResolvedValue(pending);
    repository.claimMobileRecordingUpload.mockResolvedValue(claimed);
    const fake = storage();

    const result = await prepareMobileRecordingArtifact({} as never, fake.service, {
      profileId: PROFILE_ID,
      recordingSessionId: SESSION_ID,
      ingestionId: INGESTION_ID,
    });

    expect(result).toMatchObject({
      status: "claimed",
      claimToken: CLAIM_TOKEN,
      staging: {
        bucket: "activity-files",
        path: pending.staging_path,
        bytes: BYTES,
        mediaType: "application/vnd.ant.fit",
        format: "fit",
      },
    });
    expect(fake.readObjectBounded).toHaveBeenNthCalledWith(1, {
      bucket: "activity-files",
      path: pending.staging_path,
      maxBytes: BYTES.byteLength,
    });
    expect(fake.upload).not.toHaveBeenCalled();
    expect(repository.markMobileRecordingUploadFailed).not.toHaveBeenCalled();
  });

  it("fails the exact lease when staged bytes do not match the claim", async () => {
    const pending = ingestion({ expected_sha256: "f".repeat(64) });
    const claimed = ingestion({
      ...pending,
      status: "processing",
      claim_token: CLAIM_TOKEN,
      lease_expires_at: new Date("2026-07-24T12:05:00.000Z"),
    });
    repository.loadMobileRecordingUploadClaim.mockResolvedValue(pending);
    repository.claimMobileRecordingUpload.mockResolvedValue(claimed);

    await expect(
      prepareMobileRecordingArtifact({} as never, storage().service, {
        profileId: PROFILE_ID,
        recordingSessionId: SESSION_ID,
        ingestionId: INGESTION_ID,
      }),
    ).rejects.toMatchObject({ code: "expected_artifact_mismatch" });
    expect(repository.markMobileRecordingUploadFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ingestionId: INGESTION_ID,
        claimToken: CLAIM_TOKEN,
        errorCode: "expected_artifact_mismatch",
      }),
    );
  });

  it("keeps failed staging cleanup durable and retries it idempotently", async () => {
    const ready = ingestion({
      activity_id: recordingSessionActivityId(PROFILE_ID, SESSION_ID),
      artifact_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "ready",
      uploaded_at: new Date("2026-07-24T12:00:00.000Z"),
      staging_cleanup_pending: true,
    });
    const failing = storage();
    failing.remove.mockResolvedValue({ error: { message: "private storage detail" } });
    await expect(
      retryMobileRecordingStagingCleanup({} as never, failing.service, {
        profileId: PROFILE_ID,
        ingestion: ready,
      }),
    ).resolves.toBe(false);
    expect(repository.recordMobileRecordingStagingCleanupFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ errorCode: "staging_cleanup_failed" }),
    );

    const succeeding = storage();
    await expect(
      retryMobileRecordingStagingCleanup({} as never, succeeding.service, {
        profileId: PROFILE_ID,
        ingestion: ready,
      }),
    ).resolves.toBe(true);
    expect(repository.markMobileRecordingStagingCleaned).toHaveBeenCalledWith(expect.anything(), {
      ingestionId: INGESTION_ID,
      profileId: PROFILE_ID,
    });
  });

  it("drains bounded cleanup rows independently of submission replay", async () => {
    const ready = ingestion({
      artifact_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "ready",
      staging_cleanup_pending: true,
    });
    repository.listPendingMobileRecordingStagingCleanup.mockResolvedValue([ready]);

    await expect(
      drainPendingMobileRecordingStagingCleanup({} as never, storage().service, {
        profileId: PROFILE_ID,
        limit: 10,
      }),
    ).resolves.toEqual({ attempted: 1, cleaned: 1, pending: 0 });
    expect(repository.listPendingMobileRecordingStagingCleanup).toHaveBeenCalledWith(
      expect.anything(),
      { profileId: PROFILE_ID, limit: 10 },
    );
  });
});
