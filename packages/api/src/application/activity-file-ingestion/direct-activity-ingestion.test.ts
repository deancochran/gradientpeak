import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createOrLoad: vi.fn(),
  getOwned: vi.fn(),
  recordAcceptedResult: vi.fn(),
  recordStagingExpectations: vi.fn(),
  replaceProviderRetryStaging: vi.fn(),
  transitionLifecycle: vi.fn(),
  updateCleanup: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createDrizzleActivityIngestionRepository: () => repository,
}));

import {
  ActivityIngestionOperationConflictError,
  acceptActivityIngestion,
  activityIngestionOperationId,
  beginActivityIngestionOperation,
  claimActivityIngestionProcessing,
  failActivityIngestion,
  startActivityIngestionProcessing,
} from "./direct-activity-ingestion";

const now = new Date("2026-08-16T10:00:00.000Z");
const profileId = "11111111-1111-4111-8111-111111111111";
const ingestionId = "22222222-2222-4222-8222-222222222222";
const operationId = activityIngestionOperationId("manual:owned-upload.fit");
const operation = {
  id: ingestionId,
  profileId,
  operationId,
  source: "manual_import" as const,
  status: "awaiting_upload" as const,
};

describe("direct activity ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.createOrLoad.mockImplementation(async (candidate) => ({
      status: "created",
      operation: candidate,
    }));
    repository.getOwned.mockResolvedValue(operation);
    repository.transitionLifecycle.mockResolvedValue({
      status: "updated",
      operation: { ...operation, status: "processing", startedAt: now.toISOString() },
    });
    repository.recordAcceptedResult.mockResolvedValue({
      status: "updated",
      operation: { ...operation, status: "succeeded" },
    });
  });

  it("creates the operation in awaiting_upload without worker or recovery state", async () => {
    const created = await beginActivityIngestionOperation({} as never, {
      profileId,
      operationId,
      source: "manual_import",
      stagingBucket: "activity-files",
      stagingPath: `${profileId}/upload.fit`,
      expectedSha256: "a".repeat(64),
      expectedByteSize: 3,
      expectedFormat: "fit",
      expectedMediaType: "application/vnd.ant.fit",
      uploaded: true,
      now,
    });
    expect(created).toMatchObject({
      profileId,
      operationId,
      source: "manual_import",
      status: "awaiting_upload",
      uploadedAt: now.toISOString(),
    });
    expect(created).not.toHaveProperty("recoveryContext");
    expect(created).not.toHaveProperty("jobId");
  });

  it("restarts failed_retryable work by direct request resubmission", async () => {
    repository.getOwned.mockResolvedValue({ ...operation, status: "failed_retryable" });
    await startActivityIngestionProcessing({} as never, {
      profileId,
      ingestionId,
      operationId,
      source: "manual_import",
      now,
    });
    expect(repository.transitionLifecycle).toHaveBeenCalledWith({
      profileId,
      ingestionId,
      update: { status: "processing", startedAt: now.toISOString() },
    });
  });

  it("gives one concurrent replay processing ownership and returns the in-progress operation to the other", async () => {
    const processing = {
      ...operation,
      status: "processing" as const,
      startedAt: now.toISOString(),
    };
    let claimed = false;
    repository.getOwned.mockImplementation(async () =>
      claimed ? processing : { ...operation, status: "awaiting_upload" },
    );
    repository.transitionLifecycle.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        return { status: "updated", operation: processing };
      }
      return { status: "state_conflict", operation: processing };
    });

    const results = await Promise.all([
      claimActivityIngestionProcessing({} as never, {
        profileId,
        ingestionId,
        operationId,
        source: "manual_import",
        now,
      }),
      claimActivityIngestionProcessing({} as never, {
        profileId,
        ingestionId,
        operationId,
        source: "manual_import",
        now,
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["claimed", "existing"]);
    expect(results.find((result) => result.status === "existing")?.operation).toMatchObject({
      status: "processing",
      operationId,
      source: "manual_import",
    });
  });

  it("keeps compatibility callers finite when a replay is already processing", async () => {
    repository.getOwned.mockResolvedValue({
      ...operation,
      source: "mobile_recording",
      status: "processing",
    });
    await expect(
      startActivityIngestionProcessing({} as never, {
        profileId,
        ingestionId,
        operationId,
        source: "mobile_recording",
        now,
      }),
    ).rejects.toBeInstanceOf(ActivityIngestionOperationConflictError);
    expect(repository.transitionLifecycle).not.toHaveBeenCalled();
  });

  it("keeps provider identity while replacing a retry attempt's fresh staging object", async () => {
    const providerOperation = {
      ...operation,
      source: "provider_sync" as const,
      provider: "wahoo" as const,
      externalId: "provider-1",
      integrationId: "55555555-5555-4555-8555-555555555555",
      status: "failed_retryable" as const,
      stagingBucket: "activity-files",
      stagingPath: "old.fit",
      expectedSha256: "a".repeat(64),
      expectedByteSize: 3,
      expectedFormat: "fit" as const,
      expectedMediaType: "application/vnd.ant.fit" as const,
    };
    repository.createOrLoad.mockResolvedValue({
      status: "unchanged",
      operation: providerOperation,
    });
    repository.replaceProviderRetryStaging.mockResolvedValue({
      status: "updated",
      operation: { ...providerOperation, stagingPath: "fresh.fit" },
    });

    const retried = await beginActivityIngestionOperation({} as never, {
      profileId,
      operationId,
      source: "provider_sync",
      provider: "wahoo",
      externalId: "provider-1",
      integrationId: providerOperation.integrationId,
      stagingBucket: "activity-files",
      stagingPath: "fresh.fit",
      expectedSha256: "a".repeat(64),
      expectedByteSize: 3,
      expectedFormat: "fit",
      expectedMediaType: "application/vnd.ant.fit",
      uploaded: true,
      now,
    });
    expect(retried.stagingPath).toBe("fresh.fit");
    expect(repository.replaceProviderRetryStaging).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "wahoo",
        externalId: "provider-1",
        integrationId: providerOperation.integrationId,
        stagingPath: "fresh.fit",
      }),
    );
  });

  it("rejects a source-identity mismatch before processing", async () => {
    await expect(
      startActivityIngestionProcessing({} as never, {
        profileId,
        ingestionId,
        operationId,
        source: "provider_sync",
        now,
      }),
    ).rejects.toBeInstanceOf(ActivityIngestionOperationConflictError);
    expect(repository.transitionLifecycle).not.toHaveBeenCalled();
  });

  it("accepts only the exact operation identity inside the canonical transaction", async () => {
    await acceptActivityIngestion({} as never, {
      profileId,
      ingestionId,
      operationId,
      source: "manual_import",
      activityId: "33333333-3333-4333-8333-333333333333",
      artifactId: "44444444-4444-4444-8444-444444444444",
      completedAt: now,
    });
    expect(repository.recordAcceptedResult).toHaveBeenCalledWith(
      expect.objectContaining({ profileId, ingestionId, operationId, source: "manual_import" }),
    );
  });

  it.each([
    [true, "failed_retryable"],
    [false, "failed_terminal"],
  ])("maps retryability %s to %s", async (retryable, status) => {
    await failActivityIngestion({} as never, {
      profileId,
      ingestionId,
      failureCode: "promotion_failed",
      retryable,
      now,
    });
    expect(repository.transitionLifecycle).toHaveBeenCalledWith({
      profileId,
      ingestionId,
      update: {
        status,
        failureCode: "promotion_failed",
        failedAt: now.toISOString(),
      },
    });
  });
});
