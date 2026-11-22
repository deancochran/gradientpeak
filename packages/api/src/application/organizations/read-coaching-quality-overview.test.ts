import { describe, expect, it, vi } from "vitest";

const { readOverview } = vi.hoisted(() => ({ readOverview: vi.fn() }));
vi.mock("../../repositories/organization-coaching-quality-repository", () => ({
  createOrganizationCoachingQualityRepository: () => ({ readOverview }),
}));

import {
  CoachingQualityOverviewAccessError,
  readCoachingQualityOverview,
} from "./read-coaching-quality-overview";

describe("readCoachingQualityOverview", () => {
  it("does not convert a missing authorized snapshot into an empty organization aggregate", async () => {
    readOverview.mockResolvedValueOnce(null);
    await expect(
      readCoachingQualityOverview({
        db: {} as never,
        organizationId: "00000000-0000-4000-8000-000000000001",
        actorProfileId: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toBeInstanceOf(CoachingQualityOverviewAccessError);
  });
});
