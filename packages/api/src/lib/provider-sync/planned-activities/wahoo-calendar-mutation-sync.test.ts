import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listIntegrationsByProfileId: vi.fn() }));
vi.mock("../../../infrastructure/repositories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../infrastructure/repositories")>()),
  listIntegrationsByProfileId: mocks.listIntegrationsByProfileId,
}));

import { enqueueWahooPlannedSessionSyncAfterMutation } from "./wahoo-calendar-mutation-sync";

describe("enqueueWahooPlannedSessionSyncAfterMutation", () => {
  it("does not block local cancellation when the planned session has no Wahoo resource link", async () => {
    mocks.listIntegrationsByProfileId.mockResolvedValue([{ provider: "wahoo" }]);
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));

    await expect(
      enqueueWahooPlannedSessionSyncAfterMutation({
        db: { select: vi.fn(() => ({ from })) } as never,
        plannedSessionIds: ["planned-session-1"],
        operation: "unsync",
        profileId: "profile-1",
      }),
    ).resolves.toBeNull();
  });
});
