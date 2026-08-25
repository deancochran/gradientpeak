import assert from "node:assert/strict";
import test from "node:test";

import {
  requireAdbReverses,
  resolveMaestroE2EEnvironment,
  runWithRequiredMaestroPreparation,
} from "./maestro-environment.mjs";

test("defaults Maestro to the dedicated emulator and loopback E2E ports", () => {
  assert.deepEqual(resolveMaestroE2EEnvironment({}), {
    apiUrl: "http://127.0.0.1:3100",
    deviceId: "emulator-5554",
    expoPort: 8082,
    forwardedPorts: [3100, 8082, 55321],
    supabaseUrl: "http://127.0.0.1:55321",
    webPort: 3100,
  });
});

test("rejects manual ports, non-loopback URLs, and multiple devices", () => {
  assert.throws(() => resolveMaestroE2EEnvironment({ EXPO_PORT: "8081" }), /manual port 8081/);
  assert.throws(() => resolveMaestroE2EEnvironment({ PORT: "3000" }), /manual port 3000/);
  assert.throws(
    () => resolveMaestroE2EEnvironment({ EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    /manual port 54321/,
  );
  assert.throws(
    () => resolveMaestroE2EEnvironment({ EXPO_PUBLIC_API_URL: "http://100.119.109.24:3100" }),
    /loopback-only/,
  );
  assert.throws(
    () => resolveMaestroE2EEnvironment({ MAESTRO_DEVICE_ID: "emulator-5554,emulator-5556" }),
    /exactly one device/,
  );
});

test("fails closed when any required targeted ADB reverse cannot be established", () => {
  const attempted = [];
  assert.throws(
    () =>
      requireAdbReverses([3100, 8082, 55321], (port) => {
        attempted.push(port);
        return port !== 8082;
      }),
    /required ADB reverse for port 8082/,
  );
  assert.deepEqual(attempted, [3100, 8082]);
});

test("real Maestro execution rejects preparation bypasses", () => {
  for (const bypass of ["MAESTRO_SKIP_ADB_REVERSE", "MAESTRO_SKIP_PREPARE"]) {
    let executed = false;
    assert.throws(
      () =>
        runWithRequiredMaestroPreparation({
          environment: { [bypass]: "1" },
          execute: () => {
            executed = true;
          },
          ports: [3100, 8082, 55321],
          reverse: () => true,
        }),
      new RegExp(`${bypass} cannot bypass real Maestro E2E preparation`),
    );
    assert.equal(executed, false);
  }
});

test("real Maestro execution starts only after every required reverse succeeds", () => {
  const attempted = [];
  let executed = false;

  assert.throws(
    () =>
      runWithRequiredMaestroPreparation({
        environment: {},
        execute: () => {
          executed = true;
        },
        ports: [3100, 8082, 55321],
        reverse: (port) => {
          attempted.push(port);
          return port !== 55321;
        },
      }),
    /required ADB reverse for port 55321/,
  );
  assert.deepEqual(attempted, [3100, 8082, 55321]);
  assert.equal(executed, false);

  runWithRequiredMaestroPreparation({
    environment: {},
    execute: () => {
      executed = true;
    },
    ports: [3100, 8082, 55321],
    reverse: () => true,
  });
  assert.equal(executed, true);
});
