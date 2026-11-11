import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { formatQaError, parseArguments } from "./cli.mjs";
import { createProfilePlan, profileForPaths, validateCiRuntimeDelegation } from "./profiles.mjs";

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
        "--filter",
        "web",
        "exec",
        "tsx",
        "scripts/run-disposable-acceptance.ts",
        "e2e/specs/smoke.spec.ts",
        "--project=Desktop Chrome",
        "--grep",
        "dashboard presents an explicit error and recovers its server content",
      ],
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

test("CI owns full validation while Git hooks stay lightweight", async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const [manifestSource, lefthook, workflow] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "lefthook.yml"), "utf8"),
    readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.match(manifest.scripts.test, /test:parity/);
  assert.doesNotMatch(lefthook, /^pre-push:/m);
  assert.match(lefthook, /\{staged_files\}/);
  assert.match(workflow, /run: pnpm test/);
  const staticJob = workflow.split("  static:")[1]?.split("  runtime-db:")[0];
  assert.ok(staticJob);
  assert.doesNotMatch(staticJob, /self-host:|test:live-db|db:verify/);
  const database = workflow.split("  runtime-db:")[1]?.split("  runtime-web:")[0];
  assert.ok(database);
  assert.match(database, /run: pnpm --filter @repo\/db db:verify/);
  assert.match(database, /run: pnpm --filter @repo\/api test:live-db\n/);
  const browser = workflow.split("  runtime-web:")[1]?.split("  ci:")[0];
  assert.ok(browser);
  assert.match(browser, /run: pnpm --filter @repo\/db self-host:up/);
  assert.match(browser, /if: always\(\)\s+run: pnpm --filter @repo\/db self-host:down/);
  assert.doesNotMatch(browser, /db:e2e:|prepare-runtime-web-e2e\.mjs/);
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
