import { ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION } from "@repo/core/athlete-derived-state";
import { describe, expect, it, vi } from "vitest";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";
import { AthleteDerivedStateWorkerService } from "./athlete-state-worker";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const request = {
  contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  profileId,
  idempotencyKey: `athlete-recalculation:${profileId}`,
  earliestAffectedAt: "2026-08-01T12:00:00.000Z",
  earliestAffectedPlanningDate: "2026-08-01",
  sourceRevision: 2,
  reasons: ["activity_deleted" as const],
  requestedAt: "2026-08-02T00:00:00.000Z",
};
const publication = {
  profileId,
  planningTimezone: "UTC",
  sourceRevision: 2,
  publishedRevision: 1,
  dirtyFromAt: "2026-08-01T12:00:00.000Z",
  fitness: 10,
  fatigue: 8,
  evidenceConfidence: 0.8,
  coverageStartAt: "2026-08-01T12:00:00.000Z",
  coverageEndAt: "2026-08-01T12:00:00.000Z",
  lastActivityAt: "2026-08-01T12:00:00.000Z",
  calculationVersion: "athlete-state-projection-v1",
  computedAt: "2026-08-01T12:00:00.000Z",
  leaseToken: "33333333-3333-4333-8333-333333333333",
  leaseExpiresAt: "2026-08-02T00:05:00.000Z",
};

function claimedItem() {
  return {
    request,
    attemptCount: 0,
    lifecycle: {
      state: "processing" as const,
      claimToken: "33333333-3333-4333-8333-333333333333",
      claimedAt: "2026-08-02T00:00:00.000Z",
      leaseExpiresAt: "2026-08-02T00:05:00.000Z",
    },
  };
}

describe("AthleteDerivedStateWorkerService", () => {
  it("removes a superseded queue request without publishing its stale revision", async () => {
    const transition = vi.fn(async () => ({ status: "completed" as const }));
    const listEffects = vi.fn();
    const publish = vi.fn();
    const repository = {
      claimNextRecalculation: vi.fn(async () => claimedItem()),
      lockPublicationState: vi.fn(async () => ({
        ...publication,
        sourceRevision: request.sourceRevision + 1,
      })),
      listActivityTrainingEffects: listEffects,
      publishDailyTrainingLoad: publish,
      transitionRecalculation: transition,
    } as unknown as AthleteDerivedStateRepositoryPort;

    await expect(
      new AthleteDerivedStateWorkerService({ db: {} as never, repository }).processDueJobs({
        limit: 1,
        now: new Date("2026-08-02T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    expect(transition).toHaveBeenCalledWith({
      profileId,
      transition: {
        action: "complete",
        claimToken: expect.any(String),
        completedAt: "2026-08-02T00:00:00.000Z",
        resultingPublishedRevision: publication.publishedRevision,
      },
    });
    expect(listEffects).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("forwards the injected worker time as the recalculation due-time boundary", async () => {
    const now = new Date("2026-08-02T00:00:00.000Z");
    const leaseNow = new Date("2026-08-03T00:00:00.000Z");
    const repository = {
      claimNextRecalculation: vi.fn(async () => null),
    } as unknown as AthleteDerivedStateRepositoryPort;

    await expect(
      new AthleteDerivedStateWorkerService({
        db: {} as never,
        repository,
        leaseNow: () => leaseNow,
      }).processDueJobs({
        limit: 1,
        now,
      }),
    ).resolves.toEqual({ completed: 0, failed: 0, processed: 0 });

    expect(repository.claimNextRecalculation).toHaveBeenCalledWith({
      claimToken: expect.any(String),
      now: now.toISOString(),
      claimedAt: leaseNow.toISOString(),
      leaseExpiresAt: "2026-08-03T00:05:00.000Z",
    });
  });

  it("does not complete stale or lease-lost publication", async () => {
    const transition = vi.fn();
    const repository = {
      claimNextRecalculation: vi.fn(async () => claimedItem()),
      lockPublicationState: vi.fn(async () => publication),
      listActivityTrainingEffects: vi.fn(async () => ({
        items: [
          {
            contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
            profileId,
            activityId,
            activityAnalysisRevision: 1,
            effectiveAt: "2026-08-01T12:00:00.000Z",
            planningDate: "2026-08-01",
            sourceRevision: 2,
            calculationVersion: "effect-v1",
            inputFingerprint: "a".repeat(64),
            stimulus: {
              kind: "observed",
              sourceId: activityId,
              occurredAt: "2026-08-01T12:00:00.000Z",
              activityCategory: "bike",
              commonLoad: 30,
              evidenceConfidence: 0.9,
              capabilityObservation: null,
            },
          },
        ],
        hasMore: false,
      })),
      publishDailyTrainingLoad: vi.fn(async () => ({ status: "lease_lost" as const })),
      transitionRecalculation: transition,
    } as unknown as AthleteDerivedStateRepositoryPort;

    await expect(
      new AthleteDerivedStateWorkerService({ db: {} as never, repository }).processDueJobs({
        limit: 1,
        now: new Date("2026-08-02T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });
    expect(transition).not.toHaveBeenCalled();
  });

  it("uses a separately advancing lease clock while replay pages retain a historical as-of time", async () => {
    const historicalNow = new Date("2020-08-02T00:00:00.000Z");
    const leaseClaimedAt = new Date("2026-08-02T00:00:00.000Z");
    const leaseRenewedAt = new Date("2026-08-02T00:01:00.000Z");
    const transition = vi
      .fn()
      .mockResolvedValueOnce({ status: "updated" as const })
      .mockResolvedValueOnce({ status: "lease_lost" as const });
    const effect = {
      contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
      profileId,
      activityId,
      activityAnalysisRevision: 1,
      effectiveAt: "2020-08-01T12:00:00.000Z",
      planningDate: "2020-08-01",
      sourceRevision: 2,
      calculationVersion: "effect-v1",
      inputFingerprint: "a".repeat(64),
      stimulus: {
        kind: "observed" as const,
        sourceId: activityId,
        occurredAt: "2020-08-01T12:00:00.000Z",
        activityCategory: "bike" as const,
        commonLoad: 30,
        evidenceConfidence: 0.9,
        capabilityObservation: null,
      },
    };
    const repository = {
      claimNextRecalculation: vi.fn(async () => claimedItem()),
      lockPublicationState: vi.fn(async () => publication),
      listActivityTrainingEffects: vi
        .fn()
        .mockResolvedValueOnce({ items: [effect], hasMore: true })
        .mockResolvedValueOnce({ items: [], hasMore: false }),
      publishDailyTrainingLoad: vi.fn(async () => ({ status: "lease_lost" as const })),
      transitionRecalculation: transition,
    } as unknown as AthleteDerivedStateRepositoryPort;
    const leaseNow = vi
      .fn()
      .mockReturnValueOnce(leaseClaimedAt)
      .mockReturnValueOnce(leaseRenewedAt);

    await expect(
      new AthleteDerivedStateWorkerService({
        db: {} as never,
        repository,
        leaseNow,
      }).processDueJobs({
        limit: 1,
        now: historicalNow,
      }),
    ).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });

    expect(repository.claimNextRecalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        now: historicalNow.toISOString(),
        claimedAt: leaseClaimedAt.toISOString(),
      }),
    );
    expect(transition).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        transition: expect.objectContaining({
          action: "renew",
          renewedAt: leaseRenewedAt.toISOString(),
          leaseExpiresAt: "2026-08-02T00:06:00.000Z",
        }),
      }),
    );
  });

  it("uses the operational lease clock for retry backoff after a historical replay fails", async () => {
    const historicalNow = new Date("2020-08-02T00:00:00.000Z");
    const claimLeaseNow = new Date("2026-08-02T00:00:00.000Z");
    const failureLeaseNow = new Date("2026-08-02T00:01:00.000Z");
    const transition = vi.fn(async () => ({ status: "updated" as const }));
    const repository = {
      claimNextRecalculation: vi.fn(async () => claimedItem()),
      lockPublicationState: vi.fn(async () => {
        throw new Error("ordinary failure");
      }),
      transitionRecalculation: transition,
    } as unknown as AthleteDerivedStateRepositoryPort;
    const leaseNow = vi
      .fn()
      .mockReturnValueOnce(claimLeaseNow)
      .mockReturnValueOnce(failureLeaseNow);

    await expect(
      new AthleteDerivedStateWorkerService({
        db: {} as never,
        repository,
        leaseNow,
      }).processDueJobs({ limit: 1, now: historicalNow }),
    ).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });

    expect(transition).toHaveBeenCalledWith({
      profileId,
      transition: {
        action: "retry",
        claimToken: expect.any(String),
        failureCode: "internal",
        failedAt: failureLeaseNow.toISOString(),
        nextAttemptAt: "2026-08-02T00:02:00.000Z",
      },
    });
  });

  it("publishes an empty rebuilt range and completes deletion invalidation", async () => {
    const publish = vi.fn(async () => ({ status: "published" as const, publishedRevision: 2 }));
    const transition = vi.fn(async () => ({ status: "completed" as const }));
    const repository = {
      claimNextRecalculation: vi.fn(async () => claimedItem()),
      lockPublicationState: vi.fn(async () => publication),
      listActivityTrainingEffects: vi.fn(async () => ({ items: [], hasMore: false })),
      publishDailyTrainingLoad: publish,
      transitionRecalculation: transition,
    } as unknown as AthleteDerivedStateRepositoryPort;

    await expect(
      new AthleteDerivedStateWorkerService({ db: {} as never, repository }).processDueJobs({
        limit: 1,
        now: new Date("2026-08-02T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId,
        fromPlanningDate: "2026-08-01",
        days: [],
      }),
    );
    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId,
        transition: expect.objectContaining({
          action: "complete",
          resultingPublishedRevision: 2,
        }),
      }),
    );
  });
});
