import { describe, expect, it, vi } from "vitest";
import { WahooPlannedActivitySyncService } from "./wahoo-planned-activity-sync-service";

describe("WahooPlannedActivitySyncService", () => {
  it("uses only the planned-session adapter contract", async () => {
    const enqueuePublishPlannedSession = vi
      .fn()
      .mockResolvedValue({ jobId: "job-1", queued: true });
    const service = new WahooPlannedActivitySyncService({
      provider: "wahoo",
      enqueuePublishPlannedSession,
      enqueueUnsyncPlannedSession: vi.fn(),
    });
    await expect(
      service.enqueue({
        connectedProviders: ["wahoo"],
        plannedSessionIds: ["session-1"],
        operation: "publish",
        profileId: "profile-1",
      }),
    ).resolves.toMatchObject({ affectedCount: 1, queued: true });
    expect(enqueuePublishPlannedSession).toHaveBeenCalledWith({
      plannedSessionId: "session-1",
      profileId: "profile-1",
    });
  });
});
