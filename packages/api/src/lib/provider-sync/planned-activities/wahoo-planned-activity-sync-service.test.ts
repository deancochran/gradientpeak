import { describe, expect, it, vi } from "vitest";
import { WahooPlannedActivitySyncService } from "./wahoo-planned-activity-sync-service";

describe("WahooPlannedActivitySyncService", () => {
  it("reports an ineligible provider delivery as a successful skip", async () => {
    const enqueuePublishEvent = vi.fn().mockResolvedValue({
      jobId: null,
      queued: false,
      skipped: true,
    });
    const service = new WahooPlannedActivitySyncService({
      enqueuePublishEvent,
      enqueueUnsyncEvent: vi.fn(),
      provider: "wahoo",
    });

    await expect(
      service.enqueue({
        connectedProviders: ["wahoo"],
        eventIds: ["event-1"],
        operation: "publish",
        profileId: "profile-1",
      }),
    ).resolves.toMatchObject({
      affectedCount: 1,
      queued: false,
      skippedCount: 1,
      success: true,
    });
  });
});
