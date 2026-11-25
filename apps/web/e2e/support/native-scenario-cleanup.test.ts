import { describe, expect, it, vi } from "vitest";
import {
  requireNativeReverseRestoration,
  runWithNativeScenarioCleanup,
} from "./native-scenario-cleanup";

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

  it("preserves an undefined journey rejection after cleanup succeeds", async () => {
    const restoreReverse = vi.fn();
    const stopTransport = vi.fn(async () => undefined);

    await expect(
      runWithNativeScenarioCleanup(async () => Promise.reject(undefined), {
        restoreReverse,
        stopTransport,
      }),
    ).rejects.toBeUndefined();
    expect(restoreReverse).toHaveBeenCalledTimes(1);
    expect(stopTransport).toHaveBeenCalledTimes(1);
  });

  it("aggregates a nonzero reverse restoration and transport stop failure", async () => {
    const stopTransport = vi.fn(async () => {
      throw new Error("transport stop failed");
    });

    let caught: unknown;
    try {
      await runWithNativeScenarioCleanup(async () => "completed", {
        restoreReverse: () => requireNativeReverseRestoration({ status: 1 }),
        stopTransport,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect(
      (caught as AggregateError).errors.map((error) =>
        error instanceof Error ? error.message : String(error),
      ),
    ).toEqual(
      expect.arrayContaining([
        "Runner-owned API reverse restoration exited with status 1.",
        "transport stop failed",
      ]),
    );
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
