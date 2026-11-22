import { describe, expect, it, vi } from "vitest";
import { stravaProviderRuntime } from "./strava-provider-runtime";

function transactionWithOnboardingStatus(onboardingStatus: string) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => [{ onboardingStatus }]),
  };
  return { select: vi.fn(() => builder) };
}

describe("Strava provider runtime", () => {
  it("leaves initial history ownership to onboarding after provider selection", async () => {
    const enqueueJob = vi.fn();
    await stravaProviderRuntime.execution.server.connectedProfile.enqueueConnectedProfileWork({
      db: {} as never,
      enqueueJob,
      integration: {
        generation: 1,
        id: "integration",
        lifecycleStatus: "active",
      },
      profileId: "profile",
      scope: "activity:read_all",
      transaction: transactionWithOnboardingStatus("provider_selection") as never,
    });
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("queues bounded history after a post-onboarding reconnect", async () => {
    const enqueueJob = vi.fn(async () => ({ id: "job", status: "queued" }));
    await stravaProviderRuntime.execution.server.connectedProfile.enqueueConnectedProfileWork({
      db: {} as never,
      enqueueJob,
      integration: {
        generation: 2,
        id: "integration",
        lifecycleStatus: "active",
      },
      profileId: "profile",
      scope: "activity:read_all",
      transaction: transactionWithOnboardingStatus("completed") as never,
    });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationGeneration: 2,
        jobType: "strava.activity_history_reconcile",
        payload: { trigger: "connect" },
      }),
    );
  });
});
