import { beforeEach, describe, expect, it, vi } from "vitest";

const readSafeStatus = vi.hoisted(() => vi.fn());

vi.mock("../../infrastructure/repositories", () => ({
  createDrizzleActivityIngestionRepository: () => ({ readSafeStatus }),
}));

import {
  ActivityIngestionNotFoundError,
  readActivityIngestionSafeStatus,
} from "./activity-ingestion-actions";

const profileId = "11111111-1111-4111-8111-111111111111";
const ingestionId = "22222222-2222-4222-8222-222222222222";
const failedAt = "2026-08-10T08:00:00.000Z";

describe("safe athlete ingestion status", () => {
  beforeEach(() => {
    readSafeStatus.mockReset();
    readSafeStatus.mockResolvedValue({
      id: ingestionId,
      profileId,
      operationId: "a".repeat(32),
      source: "manual_import",
      activityId: null,
      artifactId: null,
      status: "failed_retryable",
      failureCode: "dependency_unavailable",
      requestedAt: "2026-08-10T07:59:00.000Z",
      startedAt: "2026-08-10T07:59:30.000Z",
      completedAt: null,
      failedAt,
      updatedAt: failedAt,
    });
  });

  it("treats missing owner-scoped status as not found", async () => {
    readSafeStatus.mockResolvedValue(null);
    await expect(
      readActivityIngestionSafeStatus({ db: {} as never, profileId, ingestionId }),
    ).rejects.toBeInstanceOf(ActivityIngestionNotFoundError);
  });

  it("projects retryability without exposing private staging or worker data", async () => {
    const result = await readActivityIngestionSafeStatus({
      db: {} as never,
      profileId,
      ingestionId,
    });
    expect(result).toMatchObject({ status: "failed_retryable", actions: { retry: true } });
    expect(result).not.toHaveProperty("stagingPath");
    expect(result).not.toHaveProperty("claimToken");
    expect(result).not.toHaveProperty("cancel");
  });
});
