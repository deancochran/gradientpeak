import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimNextAthleteState,
  failAthleteStateClaim,
  publishAthleteState,
  readAthleteStateEvidencePage,
  renewAthleteStateClaim,
} from "../../repositories/athlete-state-repository";
import { AthleteStateWorkerService } from "./athlete-state-worker";

vi.mock("../../repositories/athlete-state-repository", () => ({
  claimNextAthleteState: vi.fn(),
  failAthleteStateClaim: vi.fn(),
  publishAthleteState: vi.fn(),
  readAthleteStateEvidencePage: vi.fn(),
  readPerformanceEffortPage: vi.fn(),
  renewAthleteStateClaim: vi.fn(),
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
});
