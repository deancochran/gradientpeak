import { describe, expect, it } from "vitest";
import { ProviderSyncDrainCoordinator } from "./provider-sync-drain-coordinator";

describe("ProviderSyncDrainCoordinator", () => {
  it("rejects overlapping requests and permits the next invocation after completion", async () => {
    const coordinator = new ProviderSyncDrainCoordinator<string>();
    let resolvePending: (value: string) => void = () => undefined;
    const pending = new Promise<string>((resolve) => {
      resolvePending = resolve;
    });
    const first = coordinator.run(() => pending);
    await expect(coordinator.run(async () => "overlap")).resolves.toEqual({
      alreadyRunning: true,
    });
    resolvePending("done");
    await expect(first).resolves.toEqual({ alreadyRunning: false, result: "done" });
    await expect(coordinator.run(async () => "next")).resolves.toEqual({
      alreadyRunning: false,
      result: "next",
    });
  });

  it("rotates scarce capacity across job families", () => {
    const coordinator = new ProviderSyncDrainCoordinator<never>();
    expect(coordinator.allocateCapacity(1)).toEqual([1, 0, 0]);
    expect(coordinator.allocateCapacity(1)).toEqual([0, 1, 0]);
    expect(coordinator.allocateCapacity(1)).toEqual([0, 0, 1]);
  });
});
