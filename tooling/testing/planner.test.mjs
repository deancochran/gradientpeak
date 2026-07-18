import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  changedDiffArguments,
  parseNulSeparatedPaths,
  untrackedFilesArguments,
} from "./changed.mjs";
import { parseArguments } from "./cli.mjs";
import {
  classifyTest,
  commandsForTests,
  createPlan,
  formatPlan,
  selectionNeedsFeatureMarkers,
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

test("feature ids require lowercase kebab segments", async () => {
  const root = await fixture([]);
  for (const feature of ["-profile", "profile-", "profile--settings"]) {
    await assert.rejects(
      createPlan({ root, selector: { feature } }),
      /use lowercase letters and numbers separated by single hyphens/,
    );
  }
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
    "-z",
    "--diff-filter=ACMRD",
    "origin/main...HEAD",
  ]);
});

test("changed Git arguments and parsing preserve paths containing newlines", () => {
  assert.deepEqual(changedDiffArguments(), [
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=ACMRD",
    "HEAD",
  ]);
  assert.deepEqual(untrackedFilesArguments(), ["ls-files", "--others", "--exclude-standard", "-z"]);
  assert.deepEqual(
    parseNulSeparatedPaths(Buffer.from("packages/core/normal.ts\0apps/web/src/line\nbreak.ts\0")),
    ["packages/core/normal.ts", "apps/web/src/line\nbreak.ts"],
  );
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

test("all selection walks root tests and maps parity files through the parity runner", async () => {
  const root = await fixture([
    "packages/core/src/a.test.ts",
    "tests/parity/web-mobile-parity.test.ts",
  ]);
  const plan = await createPlan({ root, selector: { all: true } });

  assert.equal(
    plan.tests.some((entry) => entry.path === "tests/parity/web-mobile-parity.test.ts"),
    true,
  );
  assert.deepEqual(
    plan.commands.find((command) =>
      command.tests.includes("tests/parity/web-mobile-parity.test.ts"),
    ),
    {
      command: "pnpm",
      args: ["test:parity", "tests/parity/web-mobile-parity.test.ts"],
      tests: ["tests/parity/web-mobile-parity.test.ts"],
    },
  );
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
    /escapes repository root: packages\/core\/src/,
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
    /escapes repository root: apps\/web\/e2e\/features/,
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

test("verification derives owners from feature source files as well as selected tests", async () => {
  const root = await fixture([
    "apps/web/src/features/profile/view.tsx",
    "packages/core/src/features/profile/model.test.ts",
  ]);
  const plan = await createPlan({
    root,
    selector: { feature: "profile" },
    verify: true,
  });

  assert.deepEqual(plan.verificationCommands, [
    {
      command: "pnpm",
      args: ["--filter", "@repo/core", "check-types"],
      verification: "check-types",
    },
    {
      command: "pnpm",
      args: ["--filter", "web", "check-types"],
      verification: "check-types",
    },
  ]);
});

test("feature markers group noncanonical directories and select deleted descendants", async () => {
  const root = await fixture([
    "packages/core/activity-plan/.feature-id",
    "packages/core/activity-plan/model.test.ts",
    "apps/mobile/components/activity-plan/.feature-id",
    "apps/mobile/components/activity-plan/view.native.test.tsx",
    "apps/web/src/features/activity-plan/view.tsx",
  ]);
  await writeFile(path.join(root, "packages/core/activity-plan/.feature-id"), "activity-plan\n");
  await writeFile(
    path.join(root, "apps/mobile/components/activity-plan/.feature-id"),
    "activity-plan\n",
  );

  const featurePlan = await createPlan({ root, selector: { feature: "activity-plan" } });
  assert.deepEqual(
    featurePlan.tests.map((entry) => entry.path),
    [
      "apps/mobile/components/activity-plan/view.native.test.tsx",
      "packages/core/activity-plan/model.test.ts",
    ],
  );
  assert.deepEqual(featurePlan.featureIds, ["activity-plan"]);
  assert.equal(featurePlan.files.includes("apps/web/src/features/activity-plan/view.tsx"), true);

  const changedPlan = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["apps/mobile/components/activity-plan/deleted/nested.tsx"],
  });
  assert.deepEqual(
    changedPlan.tests.map((entry) => entry.path),
    featurePlan.tests.map((entry) => entry.path),
  );
});

test("path selection uses the nearest feature marker ancestor", async () => {
  const root = await fixture([
    "packages/core/domain-profile/.feature-id",
    "packages/core/domain-profile/source.ts",
    "apps/web/src/features/domain-profile/view.web.test.tsx",
  ]);
  await writeFile(path.join(root, "packages/core/domain-profile/.feature-id"), "domain-profile\n");

  const plan = await createPlan({
    root,
    selector: { path: "packages/core/domain-profile/source.ts" },
  });
  assert.deepEqual(plan.featureIds, ["domain-profile"]);
  assert.deepEqual(
    plan.tests.map((entry) => entry.path),
    ["apps/web/src/features/domain-profile/view.web.test.tsx"],
  );
});

test("feature markers reject malformed text and nested duplicate or conflicting declarations", async () => {
  const malformedRoot = await fixture(["packages/core/domain/.feature-id"]);
  await writeFile(path.join(malformedRoot, "packages/core/domain/.feature-id"), "Not Kebab\n");
  await assert.rejects(
    createPlan({ root: malformedRoot, selector: { feature: "probe" } }),
    /Malformed feature marker/,
  );

  const repeatedHyphenRoot = await fixture(["packages/core/profile--settings/.feature-id"]);
  await writeFile(
    path.join(repeatedHyphenRoot, "packages/core/profile--settings/.feature-id"),
    "profile--settings\n",
  );
  await assert.rejects(
    createPlan({ root: repeatedHyphenRoot, selector: { feature: "probe" } }),
    /Malformed feature marker/,
  );

  for (const [nestedDirectory, nestedId, expected] of [
    ["profile", "profile", /Duplicate nested feature marker/],
    ["account", "account", /Conflicting nested feature marker/],
  ]) {
    const root = await fixture([
      "packages/core/profile/.feature-id",
      `packages/core/profile/${nestedDirectory}/.feature-id`,
    ]);
    await writeFile(path.join(root, "packages/core/profile/.feature-id"), "profile\n");
    await writeFile(
      path.join(root, `packages/core/profile/${nestedDirectory}/.feature-id`),
      `${nestedId}\n`,
    );
    await assert.rejects(createPlan({ root, selector: { feature: "probe" } }), expected);
  }
});

test("feature markers reject non-UTF-8 bytes", async () => {
  const invalidUtf8Root = await fixture(["packages/core/domain/.feature-id"]);
  await writeFile(
    path.join(invalidUtf8Root, "packages/core/domain/.feature-id"),
    Buffer.from([0xc3, 0x28]),
  );
  await assert.rejects(
    createPlan({ root: invalidUtf8Root, selector: { feature: "probe" } }),
    /valid UTF-8 text/,
  );
});

test("feature markers reject broad, canonical, and basename-mismatched placement", async () => {
  const cases = [
    ["apps/.feature-id", "apps", /at or above canonical feature root/],
    ["packages/core/src/.feature-id", "src", /at or above canonical feature root/],
    ["apps/web/src/features/.feature-id", "features", /at or above canonical feature root/],
    [
      "packages/core/src/features/profile/nested/.feature-id",
      "nested",
      /inside canonical feature instance "profile"/,
    ],
    [
      "packages/core/src/features/profile/.feature-id",
      "profile",
      /inside canonical feature instance "profile"/,
    ],
    ["packages/core/domain/.feature-id", "profile", /directory basename is "domain"/],
  ];

  for (const [markerPath, featureId, expected] of cases) {
    const root = await fixture([markerPath]);
    await writeFile(path.join(root, markerPath), `${featureId}\n`);
    await assert.rejects(createPlan({ root, selector: { feature: "probe" } }), expected);
  }
});

test("feature markers reject symlink marker files without following them", async () => {
  const root = await fixture(["outside-marker"]);
  await mkdir(path.join(root, "packages/core/domain"), { recursive: true });
  await symlink(
    path.join(root, "outside-marker"),
    path.join(root, "packages/core/domain/.feature-id"),
  );

  await assert.rejects(
    createPlan({ root, selector: { feature: "probe" } }),
    /Feature marker must be a regular file, not a symlink/,
  );
});

test("feature marker discovery rejects escaping symlink directories", async () => {
  const root = await fixture([]);
  const outside = await mkdtemp(path.join(os.tmpdir(), "feature-marker-outside-"));
  fixtures.push(outside);
  await mkdir(path.join(root, "packages/core/domain"), { recursive: true });
  await writeFile(path.join(outside, ".feature-id"), "profile\n");
  await symlink(outside, path.join(root, "packages/core/domain/escaped"), "dir");

  await assert.rejects(
    createPlan({ root, selector: { feature: "probe" } }),
    /Feature marker traversal escapes repository root: packages\/core\/domain\/escaped/,
  );
});

test("marker discovery is skipped for all and root-only selections", async () => {
  assert.equal(selectionNeedsFeatureMarkers("/repo", { all: true }), false);
  assert.equal(selectionNeedsFeatureMarkers("/repo", { path: "package.json" }), false);
  assert.equal(
    selectionNeedsFeatureMarkers("/repo", { changed: true }, ["package.json", "README.md"]),
    false,
  );
  assert.equal(selectionNeedsFeatureMarkers("/repo", { path: "packages/core/domain.ts" }), true);
  assert.equal(selectionNeedsFeatureMarkers("/repo", { feature: "profile" }), true);

  const root = await fixture([
    "apps/.feature-id",
    "package.json",
    "tooling/testing/planner.test.mjs",
  ]);
  await writeFile(path.join(root, "apps/.feature-id"), "apps\n");
  const allPlan = await createPlan({ root, selector: { all: true } });
  assert.equal(allPlan.tests.length, 1);
  const rootPlan = await createPlan({ root, selector: { path: "package.json" } });
  assert.equal(rootPlan.tests.length, 1);
});

test("strict changed execution fails uncovered owned changes but ignores docs-only changes", async () => {
  const root = await fixture(["apps/web/src/orphan.ts", "docs/notes.md", "pnpm-lock.yaml"]);

  const nonStrictPlan = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["apps/web/src/orphan.ts"],
    requireTests: true,
  });
  assert.deepEqual(nonStrictPlan.commands, []);

  await assert.rejects(
    createPlan({
      root,
      selector: { changed: true },
      changedFiles: ["apps/web/src/orphan.ts"],
      requireTests: true,
      strict: true,
    }),
    /Strict changed execution found production or configuration changes/,
  );
  await assert.rejects(
    createPlan({
      root,
      selector: { changed: true },
      changedFiles: ["pnpm-lock.yaml"],
      requireTests: true,
      strict: true,
    }),
    /Strict changed execution found production or configuration changes/,
  );
  const docsPlan = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["docs/notes.md"],
    requireTests: true,
    strict: true,
  });
  assert.deepEqual(docsPlan.commands, []);
});

test("strict changed verification accepts an owner typecheck when no tests exist", async () => {
  const root = await fixture(["apps/web/src/orphan.ts"]);
  const plan = await createPlan({
    root,
    selector: { changed: true },
    changedFiles: ["apps/web/src/orphan.ts"],
    requireTests: true,
    verify: true,
    strict: true,
  });

  assert.deepEqual(plan.verificationCommands, [
    {
      command: "pnpm",
      args: ["--filter", "web", "check-types"],
      verification: "check-types",
    },
  ]);
});

test("strict CLI mode is limited to changed execution", () => {
  assert.deepEqual(parseArguments(["--changed", "--run", "--strict"]), {
    json: false,
    run: true,
    runtime: false,
    changed: true,
    strict: true,
  });
  assert.throws(() => parseArguments(["--changed", "--strict"]), /requires --changed with --run/);
  assert.throws(
    () => parseArguments(["--feature", "profile", "--run", "--strict"]),
    /requires --changed with --run/,
  );
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
