import { describe, expect, it, vi } from "vitest";
import {
  CoachingQualityOverviewAccessError,
  readCoachingQualityOverview,
} from "./read-coaching-quality-overview";

describe("readCoachingQualityOverview", () => {
  it("does not convert a missing authorized snapshot into an empty organization aggregate", async () => {
    await expect(
      readCoachingQualityOverview({
        db: { execute: vi.fn().mockResolvedValue({ rows: [] }) } as never,
        organizationId: "00000000-0000-4000-8000-000000000001",
        actorProfileId: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toBeInstanceOf(CoachingQualityOverviewAccessError);
  });
});
