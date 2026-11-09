import { ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION } from "@repo/core/athlete-derived-state";
import { describe, expect, it } from "vitest";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";
import { readPublishedAthleteLoad } from "./read-published-athlete-load";

const profileId = "11111111-1111-4111-8111-111111111111";
const day = (sourceRevision: number) => ({
  contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  profileId,
  planningDate: "2026-08-01",
  sourceRevision,
  commonLoad: 10,
  fitness: 2,
  fatigue: 1,
  form: 1,
  readiness: null,
  coverage: {
    status: "complete" as const,
    contributingActivityCount: 1,
    omittedActivityCount: 0 as const,
  },
  calculationVersion: "daily-load-v1",
});

describe("readPublishedAthleteLoad", () => {
  it("returns only rows from the current published revision", async () => {
    const repository = {
      readPublishedDailyTrainingLoadRange: async () => ({ publishedRevision: 5, days: [day(5)] }),
    } as unknown as AthleteDerivedStateRepositoryPort;
    await expect(
      readPublishedAthleteLoad({
        repository,
        profileId,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
      }),
    ).resolves.toMatchObject({ publishedRevision: 5, days: [{ sourceRevision: 5 }] });
  });

  it("rejects a mixed-revision repository result", async () => {
    const repository = {
      readPublishedDailyTrainingLoadRange: async () => ({ publishedRevision: 5, days: [day(4)] }),
    } as unknown as AthleteDerivedStateRepositoryPort;
    await expect(
      readPublishedAthleteLoad({
        repository,
        profileId,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
      }),
    ).rejects.toThrow("Daily-load results must match the published revision");
  });
});
