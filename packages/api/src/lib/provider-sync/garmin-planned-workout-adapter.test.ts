import { describe, expect, it, vi } from "vitest";
import { GarminPlannedWorkoutAdapter } from "./garmin-planned-workout-adapter";

describe("GarminPlannedWorkoutAdapter", () => {
  it("never advertises publish eligibility while delivery remains evidence-gated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
    const adapter = new GarminPlannedWorkoutAdapter();

    await expect(
      adapter.getPublishEligibility({
        integrationId: "integration-1",
        profileId: "profile-1",
        resourceKind: "event",
        startsAt: "2026-07-02T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      eligible: false,
      reason:
        "Garmin planned-workout delivery is evidence-gated; partner publish support is not available.",
    });
    vi.useRealTimers();
  });
});
