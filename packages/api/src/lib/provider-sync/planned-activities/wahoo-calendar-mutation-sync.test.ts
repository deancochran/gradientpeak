import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listIntegrationsByProfileId: vi.fn() }));
vi.mock(
  "../../../infrastructure/repositories/drizzle-integrations-repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../infrastructure/repositories/drizzle-integrations-repository")
    >()),
    listIntegrationsByProfileId: mocks.listIntegrationsByProfileId,
  }),
);

import { enqueueWahooPlannedActivitySyncAfterCalendarMutation } from "./wahoo-calendar-mutation-sync";

describe("enqueueWahooPlannedActivitySyncAfterCalendarMutation", () => {
  it("does not block local deletion when the planned event has no Wahoo resource link", async () => {
    mocks.listIntegrationsByProfileId.mockResolvedValue([{ provider: "wahoo" }]);
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));

    await expect(
      enqueueWahooPlannedActivitySyncAfterCalendarMutation({
        db: { select: vi.fn(() => ({ from })) } as never,
        eventIds: ["event-1"],
        operation: "unsync",
        profileId: "profile-1",
      }),
    ).resolves.toBeNull();
  });
});
