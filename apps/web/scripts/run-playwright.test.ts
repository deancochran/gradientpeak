import assert from "node:assert/strict";
import test from "node:test";

import {
  getDeviceIsolationMode,
  getPlaywrightCommand,
  hasNvidiaDevices,
  shouldIsolateGpu,
} from "./run-playwright.mjs";

test("uses automatic device isolation only for supported Linux hosts with NVIDIA devices", () => {
  assert.equal(
    shouldIsolateGpu({
      mode: "auto",
      platform: "linux",
      bwrapAvailable: true,
      nvidiaDevicesPresent: true,
    }),
    true,
  );
  assert.equal(
    shouldIsolateGpu({
      mode: "auto",
      platform: "darwin",
      bwrapAvailable: true,
      nvidiaDevicesPresent: true,
    }),
    false,
  );
  assert.equal(
    shouldIsolateGpu({
      mode: "auto",
      platform: "linux",
      bwrapAvailable: true,
      nvidiaDevicesPresent: false,
    }),
    false,
  );
});

test("honors explicit isolation modes while preserving the Linux and bwrap guards", () => {
  assert.equal(
    shouldIsolateGpu({
      mode: "on",
      platform: "linux",
      bwrapAvailable: true,
      nvidiaDevicesPresent: false,
    }),
    true,
  );
  assert.equal(
    shouldIsolateGpu({
      mode: "on",
      platform: "darwin",
      bwrapAvailable: true,
      nvidiaDevicesPresent: true,
    }),
    false,
  );
  assert.equal(
    shouldIsolateGpu({
      mode: "on",
      platform: "linux",
      bwrapAvailable: false,
      nvidiaDevicesPresent: true,
    }),
    false,
  );
  assert.equal(
    shouldIsolateGpu({
      mode: "off",
      platform: "linux",
      bwrapAvailable: true,
      nvidiaDevicesPresent: true,
    }),
    false,
  );
  assert.equal(
    shouldIsolateGpu({
      mode: "auto",
      platform: "linux",
      bwrapAvailable: false,
      nvidiaDevicesPresent: true,
    }),
    false,
  );
});

test("preserves Playwright arguments for isolated and ordinary commands", () => {
  const playwrightArgs = ["e2e/specs/smoke.spec.ts", "--project=Desktop Chrome", "-g", "smoke"];
  assert.deepEqual(getPlaywrightCommand(playwrightArgs, false), {
    command: "pnpm",
    args: ["exec", "playwright", "test", ...playwrightArgs],
  });
  assert.deepEqual(getPlaywrightCommand(playwrightArgs, true), {
    command: "bwrap",
    args: [
      "--bind",
      "/",
      "/",
      "--dev",
      "/dev",
      "--tmpfs",
      "/dev/shm",
      "pnpm",
      "exec",
      "playwright",
      "test",
      ...playwrightArgs,
    ],
  });
});

test("recognizes NVIDIA device nodes and validates the isolation switch", () => {
  assert.equal(
    hasNvidiaDevices(() => ["null", "nvidia0", "nvidiactl"]),
    true,
  );
  assert.equal(
    hasNvidiaDevices(() => ["null", "dri"]),
    false,
  );
  assert.equal(
    hasNvidiaDevices(() => {
      throw new Error("No /dev");
    }),
    false,
  );
  assert.equal(getDeviceIsolationMode("on"), "on");
  assert.throws(() => getDeviceIsolationMode("always"), /auto, on, off/);
});
