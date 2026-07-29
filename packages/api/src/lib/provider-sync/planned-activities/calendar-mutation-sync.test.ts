import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listIntegrationsByProfileId: vi.fn() }));
vi.mock("../../../infrastructure/repositories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../infrastructure/repositories")>()),
  listIntegrationsByProfileId: mocks.listIntegrationsByProfileId,
}));

import { enqueuePlannedActivitySyncAfterCalendarMutation } from "./calendar-mutation-sync";

describe("enqueuePlannedActivitySyncAfterCalendarMutation", () => {
  it("does not block local deletion when the planned event has no Wahoo resource link", async () => {
    mocks.listIntegrationsByProfileId.mockResolvedValue([{ provider: "wahoo" }]);
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));

    await expect(
      enqueuePlannedActivitySyncAfterCalendarMutation({
        db: { select: vi.fn(() => ({ from })) } as never,
        eventIds: ["event-1"],
        operation: "unsync",
        profileId: "profile-1",
      }),
    ).resolves.toBeNull();
  });
});
