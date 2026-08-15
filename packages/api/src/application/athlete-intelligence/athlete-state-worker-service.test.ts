import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimNextAthleteState,
  failAthleteStateClaim,
  publishAthleteState,
  readAthleteStateEvidencePage,
  renewAthleteStateClaim,
} from "../../repositories/athlete-state-repository";
import { AthleteStateWorkerService } from "./athlete-state-worker";

const dependencies = vi.hoisted(() => ({
  createPerformanceTargetsReader: vi.fn(),
  enqueueWahooRelativeTargetRefreshes: vi.fn(),
  getAthletePerformanceModelAsOf: vi.fn(),
  readCachedPublishedAthletePerformanceTargets: vi.fn(),
  readPerformanceTargets: vi.fn(),
  reconcileOnboardingStatus: vi.fn(),
}));

vi.mock("../../repositories/athlete-state-repository", () => ({
  claimNextAthleteState: vi.fn(),
  failAthleteStateClaim: vi.fn(),
  publishAthleteState: vi.fn(),
  readAthleteStateEvidencePage: vi.fn(),
  readPerformanceEffortPage: vi.fn(),
  renewAthleteStateClaim: vi.fn(),
}));

vi.mock("../../repositories/athlete-performance-model-repository", () => ({
  createAthletePerformanceModelRepository: vi.fn(() => ({})),
}));

vi.mock("../performance-model/get-athlete-performance-model-as-of", () => ({
  createAthletePerformanceTargetFactsReader: dependencies.createPerformanceTargetsReader,
  getAthletePerformanceModelAsOf: dependencies.getAthletePerformanceModelAsOf,
}));

vi.mock("./published-athlete-state", () => ({
  readCachedPublishedAthletePerformanceTargets:
    dependencies.readCachedPublishedAthletePerformanceTargets,
}));

vi.mock(
  "../../lib/provider-sync/planned-activities/refresh-wahoo-relative-target-activities",
  () => ({
    enqueueWahooRelativeTargetRefreshes: dependencies.enqueueWahooRelativeTargetRefreshes,
  }),
);

vi.mock("../onboarding/readiness", () => ({
  reconcileOnboardingStatus: dependencies.reconcileOnboardingStatus,
}));

const claim = {
  profileId: "11111111-1111-4111-8111-111111111111",
  sourceRevision: 3,
  leaseToken: "22222222-2222-4222-8222-222222222222",
  planningTimezone: "UTC",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimNextAthleteState).mockResolvedValue(claim);
  dependencies.createPerformanceTargetsReader.mockReturnValue(dependencies.readPerformanceTargets);
  dependencies.reconcileOnboardingStatus.mockResolvedValue(undefined);
});

describe("athlete-state worker lease fencing", () => {
  it("aborts a paged replay without publishing or mutating failure state after lease loss", async () => {
    vi.mocked(readAthleteStateEvidencePage).mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        finishedAt: new Date(`2026-08-06T10:${String(index % 60).padStart(2, "0")}:00.000Z`),
        activityCategory: "run" as const,
        commonLoad: 1,
        evidenceConfidence: 0.9,
        capabilityDistanceMeters: null,
        capabilityDurationMinutes: null,
      })),
    );
    vi.mocked(renewAthleteStateClaim).mockResolvedValue(false);

    await expect(
      new AthleteStateWorkerService({ db: {} as never }).processDueJobs({
        limit: 1,
        now: new Date("2026-08-06T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ completed: 0, failed: 1, processed: 1 });

    expect(renewAthleteStateClaim).toHaveBeenCalledOnce();
    expect(publishAthleteState).not.toHaveBeenCalled();
    expect(failAthleteStateClaim).not.toHaveBeenCalled();
  });

  it("publishes canonical threshold and historical HR facts from the fenced transaction without running duration models", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const heartRateObservedAt = "2026-08-09T09:30:00.000Z";
    const targets = buildPerformanceTargetFactsFixture({
      athleteId: claim.profileId,
      asOf: now.toISOString(),
      thresholdEffectiveAt: "2026-08-08T08:00:00.000Z",
      bikeThresholdWatts: 280,
      maxHrBpm: { run: 191 },
      heartRateObservedAt,
    });
    const beforeTargets = buildPerformanceTargetFactsFixture({
      athleteId: claim.profileId,
      asOf: now.toISOString(),
    });
    const transaction = { snapshot: "fenced-athlete-state-publication" };
    let publishedEstimates: Array<Record<string, unknown>> = [];
    vi.mocked(readAthleteStateEvidencePage).mockResolvedValue([]);
    vi.mocked(renewAthleteStateClaim).mockResolvedValue(true);
    dependencies.readPerformanceTargets.mockResolvedValue(targets);
    dependencies.readCachedPublishedAthletePerformanceTargets.mockResolvedValue(beforeTargets);
    vi.mocked(publishAthleteState).mockImplementation(async (_db, input) => {
      publishedEstimates =
        typeof input.estimates === "function"
          ? await input.estimates(transaction as never)
          : input.estimates;
      await input.afterPublishInTransaction?.(transaction as never);
      return true;
    });

    await expect(
      new AthleteStateWorkerService({ db: {} as never }).processDueJobs({ limit: 1, now }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });

    expect(dependencies.createPerformanceTargetsReader).toHaveBeenCalledWith(
      expect.any(Object),
      transaction,
    );
    expect(dependencies.readPerformanceTargets).toHaveBeenCalledWith({
      actorProfileId: claim.profileId,
      asOf: now,
    });
    expect(dependencies.getAthletePerformanceModelAsOf).not.toHaveBeenCalled();
    expect(publishedEstimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability_kind: "threshold_power",
          activity_category: "bike",
          value: 280,
        }),
        expect.objectContaining({
          capability_kind: "run_max_hr",
          activity_category: "run",
          value: 191,
          effective_at: new Date(heartRateObservedAt),
          evidence_window_start_at: new Date(heartRateObservedAt),
          evidence_window_end_at: new Date(heartRateObservedAt),
        }),
      ]),
    );
    expect(dependencies.readCachedPublishedAthletePerformanceTargets).toHaveBeenCalledWith({
      db: transaction,
      profileId: claim.profileId,
      now,
    });
    expect(dependencies.enqueueWahooRelativeTargetRefreshes).toHaveBeenCalledWith({
      afterTargetFacts: targets,
      beforeTargetFacts: beforeTargets,
      db: {},
      now,
      profileId: claim.profileId,
      transaction,
    });
  });
});
