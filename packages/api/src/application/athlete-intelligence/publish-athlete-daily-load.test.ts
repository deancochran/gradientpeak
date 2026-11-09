import { describe, expect, it } from "vitest";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";
import { publishAthleteDailyLoad } from "./publish-athlete-daily-load";

describe("publishAthleteDailyLoad", () => {
  it.each([
    "lease_lost",
    "stale_revision",
  ] as const)("preserves a %s fence rejection", async (status) => {
    const repository = {
      publishDailyTrainingLoad: async () =>
        status === "lease_lost" ? { status } : { status, currentPublishedRevision: 4 },
    } as unknown as AthleteDerivedStateRepositoryPort;
    await expect(
      publishAthleteDailyLoad({
        repository,
        profileId: "11111111-1111-4111-8111-111111111111",
        fromPlanningDate: "2026-08-01",
        expectedPublishedRevision: 4,
        targetPublishedRevision: 5,
        claimToken: "22222222-2222-4222-8222-222222222222",
        days: [],
        state: {
          computedAt: "2026-08-01T00:00:00.000Z",
          fitness: 0,
          fatigue: 0,
          evidenceConfidence: 0,
          coverageStartAt: null,
          coverageEndAt: null,
          lastActivityAt: null,
          calculationVersion: "athlete-state-projection-v1",
          capabilities: [],
        },
      }),
    ).resolves.toMatchObject({ status });
  });
});
