import { watch } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  requireDisposableProcessGroups,
  runLiveDbProcess,
} from "../../scripts/live-db-disposable-process";

const options = () => ({
  cwd: process.cwd(),
  env: { ...process.env },
  signal: new AbortController().signal,
});

describe("live-database runner child lifetime", () => {
  it("refuses unsupported process-tree cleanup instead of pretending to support it", () => {
    expect(() => requireDisposableProcessGroups("win32")).toThrow("POSIX process groups");
    expect(() => requireDisposableProcessGroups("linux")).not.toThrow();
  });
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

  it("delivers cancellation to a worker descendant and waits for its parent to reap it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "live-db-process-"));
    const readyPath = join(directory, "ready");
    const stoppedPath = join(directory, "stopped");
    const controller = new AbortController();
    const watcher = watch(directory);
    const ready = new Promise<void>((resolve, reject) => {
      watcher.on("error", reject);
      watcher.on("change", (_event, filename) => {
        if (filename === "ready") resolve();
      });
    });
    const worker = `
      process.on("SIGTERM", () => {
        require("node:fs").writeFileSync(${JSON.stringify(stoppedPath)}, "terminated");
        process.exit(0);
      });
      process.send("ready");
      setInterval(() => {}, 1000);
    `;
    const parent = `
      process.on("SIGTERM", () => {});
      const child = require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(worker)}], {
        stdio: ["ignore", "inherit", "inherit", "ipc"]
      });
      child.on("message", () => require("node:fs").writeFileSync(${JSON.stringify(readyPath)}, "ready"));
      child.on("exit", () => process.exit(0));
    `;
    const completion = runLiveDbProcess(process.execPath, ["-e", parent], {
      ...options(),
      signal: controller.signal,
    });
    const interrupted = expect(completion).rejects.toThrow("interrupted");
    try {
      await ready;
      controller.abort();
      await interrupted;
      expect(await readFile(stoppedPath, "utf8")).toBe("terminated");
    } finally {
      controller.abort();
      watcher.close();
      await interrupted;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
