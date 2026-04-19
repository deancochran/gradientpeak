import { beforeEach, describe, expect, it, vi } from "vitest";

const maintenanceMocks = vi.hoisted(() => ({
  createEventReadRepository: vi.fn(() => ({ kind: "event-read-repository" })),
  drainQueuedActivityPlanRefreshesForProfile: vi.fn(async () => ({
    refreshedCount: 2,
    planIds: ["plan-1", "plan-2"],
    results: [],
  })),
}));

vi.mock("../infrastructure/repositories", () => ({
  createEventReadRepository: maintenanceMocks.createEventReadRepository,
}));

vi.mock("../utils/activity-plan-refresh-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/activity-plan-refresh-queue")>();

  return {
    ...actual,
    drainQueuedActivityPlanRefreshesForProfile:
      maintenanceMocks.drainQueuedActivityPlanRefreshesForProfile,
  };
});

import { drainQueuedActivityPlanDerivedMetricsMaintenance } from "../maintenance";

describe("maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a read repository and drains queued plan refresh work for the requested profile", async () => {
    const db = { kind: "db" } as any;

    const result = await drainQueuedActivityPlanDerivedMetricsMaintenance(db, {
      profileId: "11111111-1111-4111-8111-111111111111",
      limit: 25,
      now: new Date("2026-04-20T12:00:00.000Z"),
    });

    expect(maintenanceMocks.createEventReadRepository).toHaveBeenCalledWith(db);
    expect(maintenanceMocks.drainQueuedActivityPlanRefreshesForProfile).toHaveBeenCalledWith(
      db,
      { kind: "event-read-repository" },
      {
        profileId: "11111111-1111-4111-8111-111111111111",
        limit: 25,
        now: new Date("2026-04-20T12:00:00.000Z"),
      },
    );
    expect(result).toEqual({
      refreshedCount: 2,
      planIds: ["plan-1", "plan-2"],
    });
  });
});
