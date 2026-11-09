import { ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION } from "@repo/core/athlete-derived-state";
import { describe, expect, it, vi } from "vitest";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";
import { recordActivityTrainingEffect } from "./record-activity-training-effect";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";

function effect(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
    profileId,
    activityId,
    activityAnalysisRevision: 1,
    effectiveAt: "2026-08-10T12:00:00.000Z",
    planningDate: "2026-08-10",
    sourceRevision: 2,
    calculationVersion: "effect-v1",
    inputFingerprint: "a".repeat(64),
    stimulus: {
      kind: "observed" as const,
      sourceId: activityId,
      occurredAt: "2026-08-10T12:00:00.000Z",
      activityCategory: "bike" as const,
      commonLoad: 50,
      evidenceConfidence: 0.9,
      capabilityObservation: null,
    },
    ...overrides,
  };
}

function state() {
  return {
    profileId,
    planningTimezone: "UTC",
    sourceRevision: 1,
    publishedRevision: 1,
    dirtyFromAt: null,
    fitness: 20,
    fatigue: 10,
    evidenceConfidence: 0.8,
    coverageStartAt: "2026-08-01T12:00:00.000Z",
    coverageEndAt: "2026-08-09T12:00:00.000Z",
    lastActivityAt: "2026-08-09T12:00:00.000Z",
    calculationVersion: "athlete-state-projection-v1",
    computedAt: "2026-08-09T12:00:00.000Z",
    leaseToken: null,
    leaseExpiresAt: null,
  };
}

describe("recordActivityTrainingEffect", () => {
  it("applies a latest effect once and makes duplicate delivery a no-op", async () => {
    let created = false;
    let current = state();
    let daily: unknown;
    const repository = {
      lockPublicationState: vi.fn(async () => current),
      upsertActivityTrainingEffect: vi.fn(async ({ effect: value }) => {
        if (created) return { status: "unchanged" as const, effect: value };
        created = true;
        return { status: "created" as const, effect: value };
      }),
      publishDailyTrainingLoad: vi.fn(async ({ days }) => {
        daily = days[0];
        current = { ...current, sourceRevision: 2, publishedRevision: 2 };
        return { status: "published" as const, publishedRevision: 2 };
      }),
      readDailyTrainingLoadRange: vi.fn(async () => (daily ? [daily] : [])),
    } as unknown as AthleteDerivedStateRepositoryPort;
    const request = {
      profileId,
      expectedPublishedRevision: 1,
      targetSourceRevision: 2,
      effect: effect(),
    };

    await expect(recordActivityTrainingEffect({ repository, request })).resolves.toMatchObject({
      status: "applied",
      publishedRevision: 2,
    });
    await expect(recordActivityTrainingEffect({ repository, request })).resolves.toMatchObject({
      status: "applied",
      publishedRevision: 2,
    });
    expect(repository.publishDailyTrainingLoad).toHaveBeenCalledOnce();
  });

  it("coalesces an older correction instead of applying it chronologically", async () => {
    const coalesce = vi.fn(async ({ request }) => request);
    const repository = {
      lockPublicationState: vi.fn(async () => ({
        ...state(),
        sourceRevision: 2,
        publishedRevision: 2,
        computedAt: "2026-08-20T12:00:00.000Z",
        coverageEndAt: "2026-08-20T12:00:00.000Z",
      })),
      upsertActivityTrainingEffect: vi.fn(async ({ effect: value }) => ({
        status: "created" as const,
        effect: value,
      })),
      coalesceRecalculationRequest: coalesce,
    } as unknown as AthleteDerivedStateRepositoryPort;

    await expect(
      recordActivityTrainingEffect({
        repository,
        request: {
          profileId,
          expectedPublishedRevision: 2,
          targetSourceRevision: 3,
          effect: effect({ activityAnalysisRevision: 2, sourceRevision: 3 }),
        },
      }),
    ).resolves.toMatchObject({
      status: "rebuild_requested",
      request: { earliestAffectedAt: "2026-08-10T12:00:00.000Z", sourceRevision: 3 },
    });
    expect(coalesce).toHaveBeenCalledOnce();
  });

  it("queues a future effect rather than publishing it before the materializer as-of time", async () => {
    const coalesce = vi.fn(async ({ request }) => request);
    const publish = vi.fn();
    const repository = {
      lockPublicationState: vi.fn(async () => state()),
      upsertActivityTrainingEffect: vi.fn(async ({ effect: value }) => ({
        status: "created" as const,
        effect: value,
      })),
      coalesceRecalculationRequest: coalesce,
      publishDailyTrainingLoad: publish,
    } as unknown as AthleteDerivedStateRepositoryPort;

    await expect(
      recordActivityTrainingEffect({
        repository,
        requestedAt: "2026-08-10T11:59:59.999Z",
        request: {
          profileId,
          expectedPublishedRevision: 1,
          targetSourceRevision: 2,
          effect: effect(),
        },
      }),
    ).resolves.toMatchObject({
      status: "rebuild_requested",
      request: { earliestAffectedAt: "2026-08-10T12:00:00.000Z" },
    });
    expect(coalesce).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });

  it("allows an effect at the materializer as-of time to publish incrementally", async () => {
    const publish = vi.fn(async () => ({ status: "published" as const, publishedRevision: 2 }));
    const repository = {
      lockPublicationState: vi.fn(async () => state()),
      upsertActivityTrainingEffect: vi.fn(async ({ effect: value }) => ({
        status: "created" as const,
        effect: value,
      })),
      publishDailyTrainingLoad: publish,
    } as unknown as AthleteDerivedStateRepositoryPort;

    await expect(
      recordActivityTrainingEffect({
        repository,
        requestedAt: "2026-08-10T12:00:00.000Z",
        request: {
          profileId,
          expectedPublishedRevision: 1,
          targetSourceRevision: 2,
          effect: effect(),
        },
      }),
    ).resolves.toMatchObject({ status: "applied", publishedRevision: 2 });
    expect(publish).toHaveBeenCalledOnce();
  });

  it("fails closed before writing when the materializer as-of time is invalid", async () => {
    const upsert = vi.fn();
    const publish = vi.fn();
    const repository = {
      lockPublicationState: vi.fn(),
      upsertActivityTrainingEffect: upsert,
      publishDailyTrainingLoad: publish,
    } as unknown as AthleteDerivedStateRepositoryPort;

    await expect(
      recordActivityTrainingEffect({
        repository,
        requestedAt: "not-a-timestamp",
        request: {
          profileId,
          expectedPublishedRevision: 1,
          targetSourceRevision: 2,
          effect: effect(),
        },
      }),
    ).rejects.toThrow("requestedAt is invalid");
    expect(upsert).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
