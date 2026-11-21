import { describe, expect, it } from "vitest";
import { runLiveDbProcess } from "../../scripts/run-live-db-tests";

const options = () => ({
  cwd: process.cwd(),
  env: { ...process.env },
  signal: new AbortController().signal,
});

describe("live-database runner child lifetime", () => {
  it("waits for success and preserves nonzero test failures", async () => {
    await expect(
      runLiveDbProcess(process.execPath, ["-e", "process.exit(0)"], options()),
    ).resolves.toBeUndefined();
    await expect(
      runLiveDbProcess(process.execPath, ["-e", "process.exit(7)"], options()),
    ).rejects.toThrow("exited with 7");
  });

  it("reports a missing test executable instead of passing", async () => {
    await expect(
      runLiveDbProcess("/nonexistent/gradientpeak-test-runner", [], options()),
    ).rejects.toThrow();
  });

  it("does not start an already-cancelled run", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runLiveDbProcess(process.execPath, ["-e", "process.exit(0)"], {
        ...options(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("terminates an interrupted child before rejecting", async () => {
    const controller = new AbortController();
    const completion = runLiveDbProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      ...options(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(completion).rejects.toThrow("interrupted");
  });
});
