import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markProcessing: vi.fn(),
  markUploaded: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("./ingestion-state", async () => {
  const actual = await vi.importActual<typeof import("./ingestion-state")>("./ingestion-state");
  return {
    ...actual,
    markProcessing: mocks.markProcessing,
    markUploaded: mocks.markUploaded,
    markFailed: mocks.markFailed,
  };
});

import { advanceUploadedIngestion } from "./process-uploaded-activity-file";

const input = {
  userId: "11111111-1111-4111-8111-111111111111",
  ingestionId: "22222222-2222-4222-8222-222222222222",
  activityId: "33333333-3333-4333-8333-333333333333",
  activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/ride.fit",
  fileType: "fit" as const,
};

describe("advanceUploadedIngestion", () => {
  it("rejects active processing rather than reusing its token", async () => {
    mocks.markProcessing.mockRejectedValueOnce(new Error("lease is active"));
    await expect(
      advanceUploadedIngestion({} as never, input, {
        id: input.ingestionId,
        status: "processing",
        claim_token: "foreign-token",
      } as never),
    ).rejects.toThrow("lease is active");
    expect(mocks.markProcessing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: input.ingestionId, profileId: input.userId }),
    );
  });

  it("uses only the new token returned by an expired-lease reclaim", async () => {
    const reclaimed = {
      id: input.ingestionId,
      status: "processing",
      claim_token: "new-token",
    };
    mocks.markProcessing.mockResolvedValueOnce(reclaimed);
    await expect(
      advanceUploadedIngestion({} as never, input, {
        id: input.ingestionId,
        status: "processing",
        claim_token: "foreign-token",
      } as never),
    ).resolves.toBe(reclaimed);
  });
});
