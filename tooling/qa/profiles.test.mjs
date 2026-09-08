import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
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

test("changed paths select static, web, backend, or full verification", () => {
  assert.equal(profileForPaths([]), "static");
  assert.equal(profileForPaths(["docs/notes.md"]), "static");
  assert.equal(profileForPaths(["apps/web/src/routes/index.tsx"]), "web");
  assert.equal(profileForPaths(["apps/mobile/app/index.tsx"]), "static");
  assert.equal(profileForPaths(["packages/api/src/routers/activities.ts"]), "db");
  assert.equal(profileForPaths(["packages/db/schema.ts"]), "db");
  assert.equal(profileForPaths(["tooling/qa/profiles.mjs"]), "full");
  assert.equal(profileForPaths([".github/workflows/ci.yml"]), "full");
  assert.equal(
    profileForPaths(["apps/web/src/routes/index.tsx", "apps/mobile/app/index.tsx"]),
    "web",
  );
});

test("runtime profiles point directly to the maintained browser smoke test", () => {
  const web = createProfilePlan({ profile: "web", includeStatic: false });
  assert.deepEqual(web.commands, [
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
  const fullCommands = createProfilePlan({ profile: "full", includeStatic: false }).commands;
  assert.equal(
    fullCommands.some((entry) => entry.args.includes("e2e/specs/smoke.spec.ts")),
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

test("normal quality, pre-push, and CI use focused owner checks", async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const [manifestSource, lefthook, workflow] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "lefthook.yml"), "utf8"),
    readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.doesNotMatch(manifest.scripts.test, /parity|capability/);
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
