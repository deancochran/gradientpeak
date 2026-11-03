import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  getDeviceIsolationMode,
  getPlaywrightCommand,
  hasNvidiaDevices,
  normalizePlaywrightArgs,
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

test("removes pnpm's script argument separator before invoking Playwright", () => {
  assert.deepEqual(
    normalizePlaywrightArgs(["--", "e2e/specs/capability-p0-auth-recovery.spec.ts", "--workers=1"]),
    ["e2e/specs/capability-p0-auth-recovery.spec.ts", "--workers=1"],
  );
  assert.deepEqual(normalizePlaywrightArgs(["e2e/specs/smoke.spec.ts"]), [
    "e2e/specs/smoke.spec.ts",
  ]);
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

test("loads env files before clearing telemetry in the actual child and its instrumentation preload", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "e2e-web-environment-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, ".env.local"),
    [
      "SENTRY_DSN=sentinel-file-server",
      "VITE_SENTRY_DSN=sentinel-file-browser",
      "ENABLE_LOCAL_ERROR_LOG=1",
      "APP_URL=http://127.0.0.1:3000",
      "PORT=3000",
      "AUTH_SMTP_PORT=9999",
      "WAHOO_OAUTH_TEST_ADAPTER=0",
      "DATABASE_URL=postgresql://fixture:sentinel@127.0.0.1:54322/postgres",
      "E2E_FILE_VALUE=file-sentinel",
      "E2E_PRECEDENCE=file-sentinel",
    ].join("\n"),
  );
  writeFileSync(
    join(directory, "instrument.server.mjs"),
    `
    import assert from 'node:assert/strict';
    assert.equal(process.env.SENTRY_DSN, '');
    assert.equal(process.env.VITE_SENTRY_DSN, '');
    assert.equal(process.env.ENABLE_LOCAL_ERROR_LOG, '0');
    process.env.E2E_PRELOAD_VERIFIED = '1';
  `,
  );
  const probe = `
    import assert from 'node:assert/strict';
    assert.equal(process.env.E2E_PRELOAD_VERIFIED, '1');
    assert.equal(process.env.SENTRY_DSN, '');
    assert.equal(process.env.VITE_SENTRY_DSN, '');
    assert.equal(process.env.ENABLE_LOCAL_ERROR_LOG, '0');
    assert.equal(process.env.APP_URL, 'http://127.0.0.1:3001');
    assert.equal(process.env.PORT, '3001');
    assert.equal(process.env.AUTH_SMTP_PORT, '55325');
    assert.equal(process.env.WAHOO_OAUTH_TEST_ADAPTER, '1');
    assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:sentinel@127.0.0.1:55322/postgres');
    assert.equal(process.env.POSTGRES_URL, process.env.DATABASE_URL);
    assert.equal(process.env.E2E_FILE_VALUE, 'file-sentinel');
    assert.equal(process.env.E2E_PRECEDENCE, 'inherited-sentinel');
    assert.equal(process.env.E2E_WORKERS, '2');
    assert.equal(process.env.E2E_RUN_ID, 'sentinel-run');
  `;
  const launcher = new URL("./start-e2e-web.mjs", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { spawnSync } from 'node:child_process';
    import { loadE2EWebEnvironment } from ${JSON.stringify(launcher)};
    const environment = loadE2EWebEnvironment();
    assert.equal(process.env.SENTRY_DSN, 'sentinel-inherited-server');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(probe)}], {
      env: environment, stdio: 'inherit', timeout: 10000,
    });
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
  `,
    ],
    {
      cwd: directory,
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        SENTRY_DSN: "sentinel-inherited-server",
        VITE_SENTRY_DSN: "sentinel-inherited-browser",
        ENABLE_LOCAL_ERROR_LOG: "1",
        E2E_PRECEDENCE: "inherited-sentinel",
        E2E_RUN_ID: "sentinel-run",
        E2E_WORKERS: "2",
      },
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
