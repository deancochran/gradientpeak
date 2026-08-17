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
