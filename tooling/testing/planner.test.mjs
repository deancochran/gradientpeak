import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { changedDiffArguments } from "./changed.mjs";
import {
  classifyTest,
  commandsForTests,
  createPlan,
  formatPlan,
  verificationCommandsForTests,
} from "./planner.mjs";

const fixtures = [];

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((fixture) => rm(fixture, { force: true, recursive: true })),
  );
});

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "filesystem-testing-"));
  fixtures.push(root);
  for (const file of files) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "// fixture\n");
  }
  return root;
}

test("path selection classifies suffixes and stays within the requested directory", async () => {
  const root = await fixture([
    "packages/core/src/math/add.ts",
    "packages/core/src/math/add.test.ts",
    "packages/core/src/math/add.contract.test.ts",
    "packages/core/src/other/ignore.test.ts",
  ]);
  const plan = await createPlan({ root, selector: { path: "packages/core/src/math" } });

  assert.deepEqual(
    plan.tests.map(({ kind, path: testPath }) => [kind, testPath]),
    [
      ["contract", "packages/core/src/math/add.contract.test.ts"],
      ["unit", "packages/core/src/math/add.test.ts"],
    ],
  );
});

test("source-file selection covers the containing capsule recursively", async () => {
  const root = await fixture([
    "packages/core/src/capsule/shared.ts",
    "packages/core/src/capsule/alpha.test.ts",
    "packages/core/src/capsule/nested/beta.contract.test.ts",
    "packages/core/src/other/ignore.test.ts",
  ]);
  const plan = await createPlan({
    root,
    selector: { path: "packages/core/src/capsule/shared.ts" },
  });

  assert.deepEqual(
    plan.tests.map((entry) => entry.path),
    [
      "packages/core/src/capsule/alpha.test.ts",
      "packages/core/src/capsule/nested/beta.contract.test.ts",
    ],
  );
});

test("repository-root config files do not expand into the entire repository", async () => {
  const root = await fixture([
    "package.json",
    "apps/web/src/unrelated.test.ts",
    "tooling/architecture/check-architecture.test.mjs",
    "tooling/testing/planner.test.mjs",
    "tooling/architecture/fixtures/example/missing.test.ts",
    "tests/parity/web-mobile-parity.test.ts",
  ]);
  const plan = await createPlan({ root, selector: { path: "package.json" } });

  assert.deepEqual(
    plan.tests.map((entry) => entry.path),
    [
      "tests/parity/web-mobile-parity.test.ts",
      "tooling/architecture/check-architecture.test.mjs",
      "tooling/testing/planner.test.mjs",
    ],
  );
  assert.equal(
    plan.tests.some((entry) => entry.path.includes("fixtures")),
    false,
  );
  assert.equal(
    plan.tests.some((entry) => entry.path.includes("unrelated")),
    false,
  );
});

test("each recognized root config maps to a finite verification capsule", async () => {
  const root = await fixture([
    "biome.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    "vitest.parity.config.ts",
    "apps/web/src/unrelated.test.ts",
    "tooling/architecture/check-architecture.test.mjs",
    "tooling/testing/planner.test.mjs",
    "tests/parity/web-mobile-parity.test.ts",
  ]);
  const toolingTests = [
    "tooling/architecture/check-architecture.test.mjs",
    "tooling/testing/planner.test.mjs",
  ];
  const toolingAndParity = ["tests/parity/web-mobile-parity.test.ts", ...toolingTests];

  for (const config of ["biome.json", "turbo.json"]) {
    const plan = await createPlan({ root, selector: { path: config } });
    assert.deepEqual(
      plan.tests.map((entry) => entry.path),
      toolingTests,
    );
  }
  for (const config of ["pnpm-workspace.yaml"]) {
    const plan = await createPlan({ root, selector: { path: config } });
    assert.deepEqual(
      plan.tests.map((entry) => entry.path),
      toolingAndParity,
    );
  }
  const parityPlan = await createPlan({ root, selector: { path: "vitest.parity.config.ts" } });
  assert.deepEqual(
    parityPlan.tests.map((entry) => entry.path),
    ["tests/parity/web-mobile-parity.test.ts"],
  );
});

test("arbitrary repository-root files remain an explicit empty plan", async () => {
  const root = await fixture([
    "README.md",
    "apps/web/src/unrelated.test.ts",
    "tooling/testing/planner.test.mjs",
  ]);
  const plan = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["README.md"],
    requireTests: true,
  });

  assert.deepEqual(plan.tests, []);
  assert.deepEqual(plan.commands, []);
  assert.match(formatPlan(plan), /Tests: 0\nNo tests selected\./);
});

test("feature selection joins canonical roots and defers runtime tests", async () => {
  const root = await fixture([
    "packages/core/src/features/workouts/calculate.test.ts",
    "packages/core/src/features/workouts/feature.contract.ts",
    "packages/api/src/features/workouts/save.live-db.test.ts",
    "apps/web/src/features/workouts/card.web.test.tsx",
    "apps/mobile/features/workouts/card.native.test.tsx",
    "apps/web/e2e/features/workouts.spec.ts",
    "apps/mobile/.maestro/features/workouts.yaml",
  ]);
  const plan = await createPlan({ root, selector: { feature: "workouts" } });

  assert.deepEqual(plan.featureIds, ["workouts"]);
  assert.equal(plan.tests.length, 6);
  assert.deepEqual(plan.intentFiles, ["packages/core/src/features/workouts/feature.contract.ts"]);
  assert.deepEqual(plan.deferredRuntime, [
    "apps/mobile/.maestro/features/workouts.yaml",
    "apps/web/e2e/features/workouts.spec.ts",
    "packages/api/src/features/workouts/save.live-db.test.ts",
  ]);
});

test("changed-file input is pure and expands a canonical feature", async () => {
  const root = await fixture([
    "packages/core/src/features/profile/model.ts",
    "packages/core/src/features/profile/model.test.ts",
    "apps/web/src/features/profile/view.web.test.tsx",
  ]);
  const plan = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["packages/core/src/features/profile/model.ts"],
  });

  assert.deepEqual(
    plan.tests.map((entry) => entry.path),
    [
      "apps/web/src/features/profile/view.web.test.tsx",
      "packages/core/src/features/profile/model.test.ts",
    ],
  );
});

test("deleted canonical feature paths still expand remaining feature tests", async () => {
  const root = await fixture(["packages/api/src/features/profile/remaining.test.ts"]);
  const plan = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["packages/core/src/features/profile/deleted.ts"],
  });

  assert.deepEqual(
    plan.tests.map((entry) => entry.path),
    ["packages/api/src/features/profile/remaining.test.ts"],
  );
  assert.deepEqual(changedDiffArguments("origin/main"), [
    "diff",
    "--name-only",
    "--diff-filter=ACMRD",
    "origin/main...HEAD",
  ]);
});

test("human output is deterministic regardless of changed-file order", async () => {
  const root = await fixture([
    "packages/core/src/a/a.test.ts",
    "packages/api/src/b/b.contract.test.ts",
  ]);
  const first = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["packages/core/src/a/a.test.ts", "packages/api/src/b/b.contract.test.ts"],
  });
  const second = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["packages/api/src/b/b.contract.test.ts", "packages/core/src/a/a.test.ts"],
  });

  assert.equal(formatPlan(first), formatPlan(second));
});

test("command mapping uses package scripts and only enables runtime explicitly", () => {
  const tests = [
    { kind: "unit", path: "packages/core/src/features/x/a.test.ts" },
    { kind: "native", path: "apps/mobile/features/x/a.native.test.tsx" },
    { kind: "playwright", path: "apps/web/e2e/features/x.spec.ts" },
    { kind: "unit", path: "tooling/testing/planner.test.mjs" },
  ];

  assert.deepEqual(commandsForTests(tests), [
    {
      command: "pnpm",
      args: ["--filter", "@repo/core", "exec", "vitest", "run", "src/features/x/a.test.ts"],
      tests: ["packages/core/src/features/x/a.test.ts"],
    },
    {
      command: "pnpm",
      args: ["--filter", "mobile", "test:jest:file", "features/x/a.native.test.tsx"],
      tests: ["apps/mobile/features/x/a.native.test.tsx"],
    },
    {
      command: "node",
      args: ["--test", "tooling/testing/planner.test.mjs"],
      tests: ["tooling/testing/planner.test.mjs"],
    },
  ]);
  assert.equal(commandsForTests(tests, { runtime: true }).length, 4);
});

test("Auth uses Vitest, DB self-running tests use one safe tsx command each", () => {
  const tests = [
    { kind: "unit", path: "packages/auth/src/contracts/forms.test.ts" },
    { kind: "unit", path: "packages/db/scripts/canonical-json.test.ts" },
    { kind: "unit", path: "packages/db/scripts/storage-assets-contract.test.ts" },
  ];

  assert.deepEqual(commandsForTests(tests), [
    {
      command: "pnpm",
      args: ["--filter", "@repo/auth", "test", "src/contracts/forms.test.ts"],
      tests: ["packages/auth/src/contracts/forms.test.ts"],
    },
    {
      command: "pnpm",
      args: ["--filter", "@repo/db", "exec", "tsx", "scripts/canonical-json.test.ts"],
      tests: ["packages/db/scripts/canonical-json.test.ts"],
    },
    {
      command: "pnpm",
      args: ["--filter", "@repo/db", "exec", "tsx", "scripts/storage-assets-contract.test.ts"],
      tests: ["packages/db/scripts/storage-assets-contract.test.ts"],
    },
  ]);
  assert.throws(
    () => commandsForTests([{ kind: "unit", path: "packages/db/src/unsafe.test.ts" }]),
    /Unsupported focused DB test/,
  );
});

test("architecture and testing mjs tests use node:test while tooling fixtures are ignored", async () => {
  const root = await fixture([
    "tooling/architecture/check-architecture.test.mjs",
    "tooling/testing/planner.test.mjs",
    "tooling/architecture/fixtures/example/missing.test.ts",
  ]);
  const plan = await createPlan({ root, selector: { all: true } });

  assert.deepEqual(
    plan.tests.map((entry) => entry.path),
    ["tooling/architecture/check-architecture.test.mjs", "tooling/testing/planner.test.mjs"],
  );
  assert.deepEqual(plan.commands, [
    {
      command: "node",
      args: [
        "--test",
        "tooling/architecture/check-architecture.test.mjs",
        "tooling/testing/planner.test.mjs",
      ],
      tests: [
        "tooling/architecture/check-architecture.test.mjs",
        "tooling/testing/planner.test.mjs",
      ],
    },
  ]);
});

test("only supported top-level Maestro scenarios are runnable", () => {
  assert.equal(classifyTest("apps/mobile/.maestro/features/profile.yaml"), "maestro");
  assert.equal(classifyTest("apps/mobile/.maestro/flows/smoke/auth/login.yaml"), "maestro");
  assert.equal(
    classifyTest("apps/mobile/.maestro/flows/performance/tab_navigation_budgets.yaml"),
    "maestro",
  );
  assert.equal(classifyTest("apps/mobile/.maestro/flows/reusable/login.yaml"), null);
  assert.equal(classifyTest("apps/mobile/.maestro/flows/journeys/auth/login.yaml"), null);
  assert.equal(classifyTest("apps/mobile/.maestro/flows/main/auth_navigation.yaml"), null);
  assert.equal(classifyTest("apps/mobile/.maestro/features/profile.yml"), null);
});

test("direct symlinks are rejected and symlink directories are not traversed", async () => {
  const root = await fixture([
    "packages/core/src/capsule/shared.ts",
    "packages/core/src/capsule/local.test.ts",
    "outside/escaped.test.ts",
  ]);
  await symlink(
    path.join(root, "packages/core/src/capsule/local.test.ts"),
    path.join(root, "linked.test.ts"),
  );
  await symlink(
    path.join(root, "outside"),
    path.join(root, "packages/core/src/capsule/linked"),
    "dir",
  );

  await assert.rejects(
    createPlan({ root, selector: { path: "linked.test.ts" } }),
    /Symlink selections are not allowed/,
  );
  const plan = await createPlan({
    root,
    selector: { path: "packages/core/src/capsule/shared.ts" },
  });
  assert.deepEqual(
    plan.tests.map((entry) => entry.path),
    ["packages/core/src/capsule/local.test.ts"],
  );
});

test("canonical feature traversal rejects an escaping intermediate symlink", async () => {
  const root = await fixture([]);
  const outside = await mkdtemp(path.join(os.tmpdir(), "testing-outside-"));
  fixtures.push(outside);
  await mkdir(path.join(root, "packages/core"), { recursive: true });
  await mkdir(path.join(outside, "src/features/profile"), { recursive: true });
  await writeFile(path.join(outside, "src/features/profile/escaped.test.ts"), "// outside\n");
  await symlink(path.join(outside, "src"), path.join(root, "packages/core/src"), "dir");

  await assert.rejects(
    createPlan({ root, selector: { feature: "profile" } }),
    /Traversal escapes repository root: packages\/core\/src\/features\/profile resolves outside/,
  );
});

test("feature E2E candidates reject escaping intermediate symlinks", async () => {
  const root = await fixture([]);
  const outside = await mkdtemp(path.join(os.tmpdir(), "testing-e2e-outside-"));
  fixtures.push(outside);
  await mkdir(path.join(root, "apps/web/e2e"), { recursive: true });
  await mkdir(path.join(outside, "features"), { recursive: true });
  await writeFile(path.join(outside, "features/profile.spec.ts"), "// outside\n");
  await symlink(path.join(outside, "features"), path.join(root, "apps/web/e2e/features"), "dir");

  await assert.rejects(
    createPlan({ root, selector: { feature: "profile" } }),
    /File escapes repository root: apps\/web\/e2e\/features\/profile\.spec\.ts resolves outside/,
  );
});

test("verification adds package checks after tests and UI artifact validation", async () => {
  const tests = [
    { kind: "unit", path: "packages/core/src/a.test.ts" },
    { kind: "web", path: "packages/ui/src/components/button/index.web.test.tsx" },
  ];
  assert.deepEqual(verificationCommandsForTests(tests), [
    {
      command: "pnpm",
      args: ["--filter", "@repo/core", "check-types"],
      verification: "check-types",
    },
    {
      command: "pnpm",
      args: ["--filter", "@repo/ui", "check-types"],
      verification: "check-types",
    },
    {
      command: "pnpm",
      args: ["--filter", "@repo/ui", "check:testing-artifacts"],
      verification: "check:testing-artifacts",
    },
  ]);

  const root = await fixture(["packages/core/src/a.test.ts"]);
  const plan = await createPlan({ root, selector: { path: "packages/core/src" }, verify: true });
  assert.equal(plan.commands.at(-1).verification, "check-types");
});

test("execution requests reject empty feature and path selections", async () => {
  const root = await fixture(["packages/core/src/empty/index.ts"]);

  await assert.rejects(
    createPlan({
      root,
      selector: { feature: "missing" },
      requireTests: true,
    }),
    /Cannot execute feature "missing": no conventionally named tests were found/,
  );
  await assert.rejects(
    createPlan({
      root,
      selector: { path: "packages/core/src/empty/index.ts" },
      requireTests: true,
    }),
    /Cannot execute path "packages\/core\/src\/empty\/index.ts"/,
  );
  const plan = await createPlan({ root, selector: { feature: "missing" } });
  assert.equal(plan.tests.length, 0);
});

test("execution rejects selections containing only deferred runtime tests", async () => {
  const root = await fixture(["apps/mobile/.maestro/features/runtime-only.yaml"]);

  await assert.rejects(
    createPlan({
      root,
      selector: { feature: "runtime-only" },
      requireTests: true,
    }),
    /every selected test is a deferred runtime test; pass --runtime explicitly/,
  );
  const runtimePlan = await createPlan({
    root,
    selector: { feature: "runtime-only" },
    requireTests: true,
    runtime: true,
  });
  assert.equal(runtimePlan.commands.length, 1);
});
