import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listIntegrationsByProfileId: vi.fn() }));
vi.mock("../../../infrastructure/repositories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../infrastructure/repositories")>()),
  listIntegrationsByProfileId: mocks.listIntegrationsByProfileId,
}));

import { enqueuePlannedWorkoutSyncAfterCalendarMutation } from "./calendar-mutation-sync";

describe("enqueuePlannedWorkoutSyncAfterCalendarMutation", () => {
  it("keeps the calendar entrypoint active but does not enqueue disabled Wahoo planned sync", async () => {
    mocks.listIntegrationsByProfileId.mockResolvedValue([{ provider: "wahoo" }]);
    await expect(
      enqueuePlannedWorkoutSyncAfterCalendarMutation({
        db: {} as never,
        eventIds: ["event-1"],
        operation: "publish",
        profileId: "profile-1",
      }),
    ).resolves.toBeNull();
  });
});
