import { describe, expect, it, vi } from "vitest";
import { WahooPlannedWorkoutProvider } from "./wahoo-planned-workout-provider";

describe("WahooPlannedWorkoutProvider", () => {
  it("fails closed without enqueueing or reading integration state", async () => {
    const providerSyncRepository = { enqueueJob: vi.fn() };
    const wahooRepository = { findWahooIntegrationByProfileId: vi.fn() };
    const provider = new WahooPlannedWorkoutProvider({
      providerSyncRepository: providerSyncRepository as never,
      wahooRepository: wahooRepository as never,
    });

    await expect(
      provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).rejects.toThrow("Wahoo planned-workout creation is disabled");
    await expect(
      provider.enqueueUnsyncEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).rejects.toThrow("Wahoo planned-workout creation is disabled");
    expect(providerSyncRepository.enqueueJob).not.toHaveBeenCalled();
    expect(wahooRepository.findWahooIntegrationByProfileId).not.toHaveBeenCalled();
  });
});
