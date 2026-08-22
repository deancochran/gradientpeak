import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  createRunner,
  formatQaError,
  listenerPidsFromSs,
  parseArguments,
  stabilizeService,
  verifyListenerOwnership,
  waitForPort,
} from "./cli.mjs";
import { createProfilePlan, profileForPaths, validateCiRuntimeDelegation } from "./profiles.mjs";

function child({ exitCode = null, pid = 42 } = {}) {
  const listeners = new Map();
  const listen = (event, callback) => {
    listeners.set(event, [...(listeners.get(event) ?? []), callback]);
    if (event === "exit" && exitCode !== null) queueMicrotask(() => callback(exitCode));
  };
  return {
    pid,
    exitCode,
    killed: false,
    once: listen,
    on: listen,
    emit(event, value) {
      if (event === "exit") this.exitCode = value;
      for (const callback of listeners.get(event) ?? []) callback(value);
    },
  };
}

test("changed paths select static, web, mobile, backend, or full verification", () => {
  assert.equal(profileForPaths([]), "static");
  assert.equal(profileForPaths(["docs/notes.md"]), "static");
  assert.equal(profileForPaths(["apps/web/src/routes/index.tsx"]), "web");
  assert.equal(profileForPaths(["apps/mobile/app/index.tsx"]), "mobile");
  assert.equal(profileForPaths(["packages/api/src/routers/activities.ts"]), "db");
  assert.equal(profileForPaths(["packages/db/schema.ts"]), "db");
  assert.equal(profileForPaths(["packages/core/parity/index.ts"]), "full");
  assert.equal(profileForPaths(["tests/parity/web-mobile-parity.test.ts"]), "full");
  assert.equal(profileForPaths(["tooling/qa/profiles.mjs"]), "full");
  for (const path of [
    "tooling/testing/capability-runner.mjs",
    "tooling/testing/capability-runner.test.mjs",
    "tooling/testing/capability-cli.mjs",
    "tooling/testing/completion-cli.mjs",
    "tooling/testing/base-registry.mjs",
    "tooling/testing/base-registry.test.mjs",
    "tooling/testing/parity.test.mjs",
  ]) {
    assert.equal(profileForPaths([path]), "full");
  }
  assert.equal(profileForPaths([".github/workflows/ci.yml"]), "full");
  assert.equal(
    profileForPaths(["apps/web/src/routes/index.tsx", "apps/mobile/app/index.tsx"]),
    "full",
  );
});

test("runtime profiles point directly to maintained browser and Maestro smoke tests", () => {
  const web = createProfilePlan({ profile: "web", includeStatic: false });
  assert.deepEqual(web.commands, [
    { command: "pnpm", args: ["dev:e2e:web"], phase: "start", port: 3000 },
    {
      command: "pnpm",
      args: [
        "test:e2e:web",
        "e2e/specs/smoke.spec.ts",
        "--project=Desktop Chrome",
        "--grep",
        "dashboard presents an explicit error and recovers its server content",
      ],
      phase: "run",
    },
  ]);
  const mobile = createProfilePlan({ profile: "mobile", includeStatic: false });
  assert.deepEqual(mobile.commands.at(-1), {
    command: "pnpm",
    args: ["--filter", "mobile", "test:e2e:flow", ".maestro/flows/smoke/auth_navigation.yaml"],
    phase: "run",
  });
  const fullCommands = createProfilePlan({ profile: "full", includeStatic: false }).commands;
  assert.equal(
    fullCommands.some((entry) => entry.args.includes("e2e/specs/smoke.spec.ts")),
    true,
  );
  assert.equal(
    fullCommands.some((entry) =>
      entry.args.some((argument) => argument.endsWith("auth_navigation.yaml")),
    ),
    true,
  );
});

test("CLI accepts only named profile and changed-path options", () => {
  assert.deepEqual(parseArguments(["--profile", "web", "--plan"]), {
    changedPaths: [],
    plan: true,
    profile: "web",
  });
  assert.deepEqual(parseArguments(["--changed-paths", "apps/web/a.ts", "apps/web/b.ts"]), {
    changedPaths: ["apps/web/a.ts", "apps/web/b.ts"],
    plan: false,
  });
  assert.throws(() => parseArguments(["web"]), /Unknown argument/);
  assert.throws(() => parseArguments(["--changed-paths"]), /at least one path/);
});

test("normal quality, pre-push, and CI include parity validation", async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const [manifestSource, lefthook, workflow] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "lefthook.yml"), "utf8"),
    readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.match(manifest.scripts.test, /test:parity/);
  assert.match(manifest.scripts["test:parity"], /parity:report/);
  assert.equal(manifest.scripts["parity:strict"], "node tooling/testing/parity-cli.mjs --strict");
  assert.equal(
    manifest.scripts["parity:proof-strict"],
    "node tooling/testing/parity-cli.mjs --proof-strict",
  );
  assert.match(lefthook, /pre-push:[\s\S]*pnpm quality:push \{push_files\}/);
  assert.match(workflow, /run: pnpm test/);
  assert.deepEqual(validateCiRuntimeDelegation(workflow), []);

  const mismatchedCommand = workflow.replace(
    "pnpm qa:run --profile web --integration-only",
    "pnpm qa:run --profile mobile --integration-only",
  );
  assert.deepEqual(validateCiRuntimeDelegation(mismatchedCommand), [
    "runtime-web must execute exactly once: pnpm qa:run --profile web --integration-only",
  ]);

  const duplicatedReference = `${workflow}\n# e2e/specs/smoke.spec.ts\n`;
  assert.deepEqual(validateCiRuntimeDelegation(duplicatedReference), [
    "CI workflow duplicates the QA-owned smoke reference: apps/web/e2e/specs/smoke.spec.ts",
  ]);
});

test("QA failures expose the exact failed command", () => {
  const message = formatQaError(
    new AggregateError([new Error("Required QA command failed: pnpm test:e2e:web exited with 1.")]),
  );
  assert.match(message, /pnpm test:e2e:web exited with 1/);
});

test("health, stabilization, and listener ownership fail closed", async () => {
  const exiting = child();
  const waiting = waitForPort(3000, {
    child: exiting,
    connect: async () => {
      throw new Error("closed");
    },
  });
  exiting.emit("exit", 1);
  await assert.rejects(waiting, /exited before health/);

  const failing = child();
  const stable = stabilizeService(failing, { timeout: 1_000 });
  failing.emit("error", new Error("bind failed"));
  await assert.rejects(stable, /failed during stabilization/);

  await verifyListenerOwnership(
    3000,
    { pid: 42 },
    {
      listeners: async () => [100],
      processGroup: async () => 42,
    },
  );
  await assert.rejects(
    verifyListenerOwnership(
      3000,
      { pid: 42 },
      {
        listeners: async () => [100],
        processGroup: async () => 7,
      },
    ),
    /not exclusively owned/,
  );
  assert.throws(() => listenerPidsFromSs("LISTEN 0 511 127.0.0.1:3000"), /identify/);
});

test("service startup failures clean up owned hosts without touching unknown processes", async () => {
  const events = [];
  const web = child({ pid: 101 });
  const runner = createRunner({
    portAvailable: async (port) => port !== 8081,
    spawnProcess(_, args) {
      events.push(args);
      return args.includes("dev:e2e:web") ? web : child({ exitCode: 0, pid: 102 });
    },
    waitForHealth: async () => {},
    verifyOwnership: async () => {},
    stabilize: async () => {},
    killProcess(_, signal) {
      events.push([signal]);
      web.emit("exit", 0);
    },
    shutdownTimeout: 1,
  });
  await assert.rejects(
    runner.execute(createProfilePlan({ profile: "mobile" }), "/tmp"),
    AggregateError,
  );
  assert.equal(events.at(-1).at(-1), "test:e2e:clean");
  assert.equal(
    events.some((entry) => entry[0] === "SIGTERM"),
    true,
  );
});
