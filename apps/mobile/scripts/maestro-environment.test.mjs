import assert from "node:assert/strict";
import test from "node:test";

import { resolveMaestroE2EEnvironment } from "./maestro-environment.mjs";

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
