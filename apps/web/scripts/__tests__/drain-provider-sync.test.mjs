import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getProviderDrainConfig, runProviderDrainLoop } from "../drain-provider-sync.mjs";

function logger() {
  const entries = [];
  return {
    entries,
    error: (message) => entries.push(message),
    log: (message) => entries.push(message),
  };
}

test("schedules Wahoo and Garmin drain routes through one polling loop", async () => {
  const urls = [];
  const config = getProviderDrainConfig({ INTERNAL_PROVIDER_SYNC_SECRET: "test-secret" });
  const exitCode = await runProviderDrainLoop({
    config,
    once: true,
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response("{}", { status: 200 });
    },
    log: logger(),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    urls,
    config.drains.map((drain) => drain.url),
  );
});

test("missing shared secret exits before scheduling requests", async () => {
  const logs = logger();
  let calls = 0;
  const exitCode = await runProviderDrainLoop({
    config: getProviderDrainConfig({}),
    once: true,
    fetchImpl: async () => {
      calls += 1;
      return new Response();
    },
    log: logs,
  });

  assert.equal(exitCode, 1);
  assert.equal(calls, 0);
  assert.deepEqual(logs.entries, [
    "INTERNAL_PROVIDER_SYNC_SECRET is required to drain provider sync jobs.",
  ]);
});

test("a missing Garmin credential response remains interval-bounded", async () => {
  const delays = [];
  const config = getProviderDrainConfig({ INTERNAL_PROVIDER_SYNC_SECRET: "test-secret" });
  const urls = [];
  await runProviderDrainLoop({
    config,
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response("Unavailable", { status: url.includes("garmin") ? 503 : 200 });
    },
    log: logger(),
    maxIterations: 2,
    sleep: async (delay) => delays.push(delay),
  });

  assert.equal(urls.filter((url) => url.includes("garmin")).length, 2);
  assert.deepEqual(delays, [5000]);
});

test("unauthorized routes remain interval-bounded without secret leaks", async () => {
  const secret = "do-not-log-this";
  const delays = [];
  const logs = logger();
  const config = getProviderDrainConfig({
    INTERNAL_PROVIDER_SYNC_SECRET: secret,
    WAHOO_PROVIDER_SYNC_DRAIN_INTERVAL_MS: "7000",
  });
  let calls = 0;
  await runProviderDrainLoop({
    config,
    fetchImpl: async () => {
      calls += 1;
      return new Response(`response body contains ${secret}`, { status: 401 });
    },
    log: logs,
    maxIterations: 2,
    sleep: async (delay) => delays.push(delay),
  });

  assert.equal(calls, 4);
  assert.deepEqual(delays, [7000]);
  assert.equal(
    logs.entries.some((entry) => entry.includes(secret)),
    false,
  );
  assert.equal(
    logs.entries.every((entry) => entry.includes("HTTP 401")),
    true,
  );
});

test("shutdown aborts an in-flight poll and prevents another scheduled pass", async () => {
  const controller = new AbortController();
  const config = getProviderDrainConfig({ INTERNAL_PROVIDER_SYNC_SECRET: "test-secret" });
  let calls = 0;
  const waits = [];
  await runProviderDrainLoop({
    config,
    fetchImpl: async (_url, options) => {
      calls += 1;
      controller.abort();
      assert.equal(options.signal.aborted, true);
      throw new Error("aborted");
    },
    log: logger(),
    signal: controller.signal,
    sleep: async (delay) => waits.push(delay),
  });

  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test("development and production worker commands use the shared scheduler", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );

  assert.match(packageJson.scripts["dev:local"], /dev:provider-drains/);
  assert.match(packageJson.scripts["dev:tunnel"], /dev:provider-drains:tunnel/);
  assert.match(packageJson.scripts["start:provider-drains"], /drain-provider-sync\.mjs/);
  assert.match(packageJson.scripts["dev:wahoo-drain"], /dev:provider-drains/);
});
