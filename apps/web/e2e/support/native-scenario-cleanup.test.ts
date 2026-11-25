import { describe, expect, it, vi } from "vitest";
import { runWithNativeScenarioCleanup } from "./native-scenario-cleanup";

describe("runWithNativeScenarioCleanup", () => {
  it("attempts both restoration steps when the scenario journey fails", async () => {
    const journeyError = new Error("journey failed");
    const restoreReverse = vi.fn(() => {
      throw new Error("reverse restore failed");
    });
    const stopTransport = vi.fn(async () => {
      throw new Error("transport stop failed");
    });

    await expect(
      runWithNativeScenarioCleanup(
        async () => {
          throw journeyError;
        },
        { restoreReverse, stopTransport },
      ),
    ).rejects.toMatchObject({
      errors: expect.arrayContaining([
        journeyError,
        expect.objectContaining({ message: "reverse restore failed" }),
        expect.objectContaining({ message: "transport stop failed" }),
      ]),
    });
    expect(restoreReverse).toHaveBeenCalledTimes(1);
    expect(stopTransport).toHaveBeenCalledTimes(1);
  });

  it("does not skip transport shutdown when reverse restoration throws", async () => {
    const restoreReverse = vi.fn(() => {
      throw new Error("reverse restore failed");
    });
    const stopTransport = vi.fn(async () => undefined);

    await expect(
      runWithNativeScenarioCleanup(async () => "completed", { restoreReverse, stopTransport }),
    ).rejects.toThrow("reverse restore failed");
    expect(stopTransport).toHaveBeenCalledTimes(1);
  });

  it("returns the journey result after both cleanup actions complete", async () => {
    const restoreReverse = vi.fn();
    const stopTransport = vi.fn(async () => undefined);

    await expect(
      runWithNativeScenarioCleanup(async () => "completed", { restoreReverse, stopTransport }),
    ).resolves.toBe("completed");
    expect(restoreReverse).toHaveBeenCalledTimes(1);
    expect(stopTransport).toHaveBeenCalledTimes(1);
  });
});
