import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { E2E_SERVER_PORTS, stopE2EServers } from "./stop-servers.mjs";

test("root E2E stop runs verified server shutdown before the private database stop", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts["dev:e2e:stop"],
    "node tooling/e2e/stop-servers.mjs && pnpm db:e2e:stop",
  );
});

test("E2E shutdown is idempotent when both dedicated ports are idle", async () => {
  const killed = [];

  await stopE2EServers({
    isListening: async () => false,
    killPorts: async (ports) => killed.push(ports),
  });

  assert.deepEqual(E2E_SERVER_PORTS, [3100, 8082]);
  assert.deepEqual(killed, []);
});

test("E2E shutdown targets only active dedicated ports and verifies they become idle", async () => {
  const checks = new Map();
  const killed = [];

  await stopE2EServers({
    isListening: async (port) => {
      const count = checks.get(port) ?? 0;
      checks.set(port, count + 1);
      return count === 0;
    },
    killPorts: async (ports) => killed.push(ports),
    wait: async () => {},
  });

  assert.deepEqual(killed, [[3100, 8082]]);
  assert.equal(checks.get(3100), 2);
  assert.equal(checks.get(8082), 2);
  assert.ok(!killed.flat().includes(3000));
  assert.ok(!killed.flat().includes(8081));
});

test("E2E shutdown trusts the read-back when the kill command reports failure", async () => {
  const checks = new Map();

  await stopE2EServers({
    isListening: async (port) => {
      const count = checks.get(port) ?? 0;
      checks.set(port, count + 1);
      return port === 3100 && count === 0;
    },
    killPorts: async () => {
      throw new Error("kill command failed");
    },
    wait: async () => {},
  });

  assert.equal(checks.get(3100), 2);
  assert.equal(checks.get(8082), 2);
});

test("E2E shutdown fails when a dedicated listener remains", async () => {
  const killed = [];

  await assert.rejects(
    stopE2EServers({
      attempts: 2,
      isListening: async (port) => port === 8082,
      killPorts: async (ports) => killed.push(ports),
      wait: async () => {},
    }),
    /listener remains on port 8082/,
  );

  assert.deepEqual(killed, [[8082]]);
});
