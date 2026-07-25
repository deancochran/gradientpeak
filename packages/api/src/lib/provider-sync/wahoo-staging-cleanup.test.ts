import { describe, expect, it, vi } from "vitest";
import {
  createWahooStagingCleanupReservation,
  isWahooStagingCleanupPayload,
  WAHOO_STAGING_CLEANUP_GRACE_MS,
  WAHOO_STAGING_CLEANUP_JOB,
} from "./wahoo-staging-cleanup";

describe("Wahoo staging cleanup reservation", () => {
  it("durably reserves a unique, generation-bound staging path before upload authority", async () => {
    const enqueueJob = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
    const reservation = createWahooStagingCleanupReservation({
      createAttemptId: vi
        .fn()
        .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
        .mockReturnValueOnce("22222222-2222-4222-8222-222222222222"),
      providerSyncRepository: { enqueueJob },
      now: () => new Date("2026-07-24T12:00:00.000Z"),
    });

    const first = await reservation.reserve({
      integrationGeneration: 3,
      integrationId: "integration-1",
      profileId: "profile-1",
      summaryId: 123,
    });
    const second = await reservation.reserve({
      integrationGeneration: 3,
      integrationId: "integration-1",
      profileId: "profile-1",
      summaryId: 123,
    });

    expect(first.path).not.toBe(second.path);
    expect(enqueueJob.mock.calls[0]?.[0].syncLaneKey).not.toBe(
      enqueueJob.mock.calls[1]?.[0].syncLaneKey,
    );
    expect(enqueueJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        integrationGeneration: 3,
        integrationId: "integration-1",
        jobType: WAHOO_STAGING_CLEANUP_JOB,
        payload: { path: first.path, uploadOutcome: "uncertain" },
        profileId: "profile-1",
        provider: "wahoo",
      }),
    );
    expect(enqueueJob.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        dedupeKey: expect.not.stringContaining("profile-1"),
        runAt: new Date(
          Date.parse("2026-07-24T12:00:00.000Z") + WAHOO_STAGING_CLEANUP_GRACE_MS,
        ).toISOString(),
        syncLaneKey: expect.not.stringContaining("integration-1"),
      }),
    );
    expect(enqueueJob.mock.calls[0]?.[0]).not.toHaveProperty("internalResourceId");
    await expect(first.recordOutcome("committed")).resolves.toBe(true);
    expect(enqueueJob.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        payload: { path: first.path, uploadOutcome: "committed" },
        runAt: enqueueJob.mock.calls[0]?.[0].runAt,
        syncLaneKey: enqueueJob.mock.calls[0]?.[0].syncLaneKey,
      }),
    );
  });

  it("accepts only a path owned by the claimed job", () => {
    const job = {
      integrationGeneration: 3,
      integrationId: "integration-1",
      profileId: "profile-1",
    };
    expect(
      isWahooStagingCleanupPayload(
        {
          path: "activities/profile-1/providers/wahoo/staging/integration-1/3/123/11111111-1111-4111-8111-111111111111.fit",
          uploadOutcome: "committed",
        },
        job,
      ),
    ).toBe(true);
    expect(
      isWahooStagingCleanupPayload(
        {
          path: "activities/other/providers/wahoo/staging/integration-1/3/123/11111111-1111-4111-8111-111111111111.fit",
          uploadOutcome: "committed",
        },
        job,
      ),
    ).toBe(false);
  });

  it("fails closed when a running cleanup job prevents recording a known upload outcome", async () => {
    const enqueueJob = vi
      .fn()
      .mockResolvedValueOnce({ id: "job-1", status: "queued" })
      .mockResolvedValueOnce({ id: "successor-job", status: "queued" });
    const reservation = createWahooStagingCleanupReservation({
      createAttemptId: () => "11111111-1111-4111-8111-111111111111",
      providerSyncRepository: { enqueueJob },
    });
    const reserved = await reservation.reserve({
      integrationGeneration: 3,
      integrationId: "integration-1",
      profileId: "profile-1",
      summaryId: 123,
    });

    await expect(reserved.recordOutcome("committed")).resolves.toBe(false);
  });
});
