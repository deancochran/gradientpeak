import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export const FEATURE_ROOTS = [
  "packages/core/src/features",
  "packages/api/src/features",
  "apps/web/src/features",
  "apps/mobile/features",
];

const RUNTIME_KINDS = new Set(["live-db", "playwright", "maestro"]);
const IGNORED_DIRECTORIES = new Set([".git", ".turbo", "coverage", "dist", "node_modules"]);
const ROOT_VERIFICATION_CAPSULES = {
  "biome.json": ["tooling/architecture", "tooling/testing"],
  "package.json": ["tooling/architecture", "tooling/testing", "tests/parity"],
  "pnpm-workspace.yaml": ["tooling/architecture", "tooling/testing", "tests/parity"],
  "turbo.json": ["tooling/architecture", "tooling/testing"],
  "vitest.parity.config.ts": ["tests/parity"],
};

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function pathKind(target) {
  try {
    const details = await lstat(target);
    if (details.isSymbolicLink()) return "symlink";
    return details.isDirectory() ? "directory" : "file";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

async function walkFiles(root, relativeDirectory, resolvedRoot) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if ((await pathKind(absoluteDirectory)) !== "directory") return [];
  const repositoryRoot = resolvedRoot ?? (await realpath(root));
  const resolvedDirectory = await realpath(absoluteDirectory);
  if (!isInsideRoot(repositoryRoot, resolvedDirectory)) {
    throw new Error(
      `Traversal escapes repository root: ${toPosix(relativeDirectory)} resolves outside the repository.`,
    );
  }

  const files = [];
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const relativePath = path.posix.join(toPosix(relativeDirectory), entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(root, relativePath, repositoryRoot)));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

async function isContainedFile(root, relativePath, resolvedRoot) {
  const absolutePath = path.join(root, relativePath);
  if ((await pathKind(absolutePath)) !== "file") return false;
  const repositoryRoot = resolvedRoot ?? (await realpath(root));
  const resolvedPath = await realpath(absolutePath);
  if (!isInsideRoot(repositoryRoot, resolvedPath)) {
    throw new Error(
      `File escapes repository root: ${toPosix(relativePath)} resolves outside the repository.`,
    );
  }
  return true;
}

function testExtensionPattern(suffix) {
  return new RegExp(`${suffix.replaceAll(".", "\\.")}\\.(?:[cm]?[jt]sx?)$`);
}

export function classifyTest(relativePath) {
  const normalized = toPosix(relativePath);
  if (/^tooling\/.*\/fixtures\//.test(normalized)) return null;
  if (
    /^apps\/mobile\/\.maestro\/features\/[^/]+\.yaml$/.test(normalized) ||
    /^apps\/mobile\/\.maestro\/flows\/(?:smoke|performance)\/.+\.yaml$/.test(normalized)
  ) {
    return "maestro";
  }
  if (/^apps\/web\/e2e\/.+\.spec\.[cm]?[jt]s$/.test(normalized)) {
    return "playwright";
  }
  if (testExtensionPattern(".live-db.test").test(normalized)) return "live-db";
  if (testExtensionPattern(".live-db.spec").test(normalized)) return "live-db";
  if (testExtensionPattern(".contract.test").test(normalized)) return "contract";
  if (testExtensionPattern(".contract.spec").test(normalized)) return "contract";
  if (testExtensionPattern(".native.test").test(normalized)) return "native";
  if (testExtensionPattern(".native.spec").test(normalized)) return "native";
  if (testExtensionPattern(".jest.test").test(normalized)) return "native";
  if (testExtensionPattern(".web.test").test(normalized)) return "web";
  if (testExtensionPattern(".web.spec").test(normalized)) return "web";
  if (testExtensionPattern(".test").test(normalized)) return "unit";
  if (testExtensionPattern(".spec").test(normalized)) return "unit";
  return null;
}

function featureIdFromPath(relativePath) {
  const normalized = toPosix(relativePath);
  for (const root of FEATURE_ROOTS) {
    if (!normalized.startsWith(`${root}/`)) continue;
    const id = normalized.slice(root.length + 1).split("/")[0];
    if (id) return id;
  }

  const web = normalized.match(/^apps\/web\/e2e\/features\/([^/]+)\.spec\.[cm]?[jt]s$/);
  if (web) return web[1];
  const mobile = normalized.match(/^apps\/mobile\/\.maestro\/features\/([^/]+)\.ya?ml$/);
  return mobile?.[1] ?? null;
}

function validateFeatureId(featureId) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(featureId)) {
    throw new Error(
      `Invalid feature id "${featureId}"; use lowercase letters, numbers, and hyphens.`,
    );
  }
}

async function discoverFeature(root, featureId) {
  validateFeatureId(featureId);
  const resolvedRoot = await realpath(root);
  const candidates = [];
  for (const featureRoot of FEATURE_ROOTS) {
    candidates.push(...(await walkFiles(root, `${featureRoot}/${featureId}`, resolvedRoot)));
  }
  candidates.push(`apps/web/e2e/features/${featureId}.spec.ts`);
  candidates.push(`apps/mobile/.maestro/features/${featureId}.yaml`);

  const existing = [];
  for (const candidate of candidates) {
    if (await isContainedFile(root, candidate, resolvedRoot)) existing.push(candidate);
  }
  return existing;
}

async function discoverRootVerificationCapsule(root, relativePath) {
  const directories = ROOT_VERIFICATION_CAPSULES[relativePath] ?? [];
  const files = [];
  for (const directory of directories) files.push(...(await walkFiles(root, directory)));
  return files;
}

async function discoverPath(root, requestedPath) {
  const absolute = path.resolve(root, requestedPath);
  if (!isInsideRoot(root, absolute))
    throw new Error(`Path must be inside the repository: ${requestedPath}`);
  const relative = toPosix(path.relative(root, absolute));
  const kind = await pathKind(absolute);
  if (kind === "missing") throw new Error(`Path does not exist: ${requestedPath}`);
  if (kind === "symlink") throw new Error(`Symlink selections are not allowed: ${requestedPath}`);
  const resolvedRoot = await realpath(root);
  const resolvedTarget = await realpath(absolute);
  if (!isInsideRoot(resolvedRoot, resolvedTarget)) {
    throw new Error(`Resolved path must be inside the repository: ${requestedPath}`);
  }
  const featureId = featureIdFromPath(relative);
  if (featureId) return { files: await discoverFeature(root, featureId), featureIds: [featureId] };

  if (kind === "directory") return { files: await walkFiles(root, relative), featureIds: [] };
  if (classifyTest(relative) || relative.endsWith("/feature.contract.ts")) {
    return { files: [relative], featureIds: [] };
  }

  const directory = path.posix.dirname(relative);
  if (directory === ".") {
    return { files: await discoverRootVerificationCapsule(root, relative), featureIds: [] };
  }
  return {
    files: await walkFiles(root, directory),
    featureIds: [],
  };
}

function ownerFor(relativePath) {
  const [group, name] = relativePath.split("/");
  const key = `${group}/${name}`;
  const owners = {
    "apps/mobile": { directory: "apps/mobile", filter: "mobile" },
    "apps/web": { directory: "apps/web", filter: "web" },
    "packages/api": { directory: "packages/api", filter: "@repo/api" },
    "packages/auth": { directory: "packages/auth", filter: "@repo/auth" },
    "packages/core": { directory: "packages/core", filter: "@repo/core" },
    "packages/db": { directory: "packages/db", filter: "@repo/db" },
    "packages/ui": { directory: "packages/ui", filter: "@repo/ui" },
  };
  return owners[key] ?? { directory: ".", filter: null };
}

function commandIdentity(test) {
  const owner = ownerFor(test.path);
  if (/^tooling\/(?:architecture|testing)\/[^/]+\.test\.mjs$/.test(test.path)) {
    return { owner, script: "node:test", runner: "node:test" };
  }
  if (test.path.startsWith("tests/parity/")) {
    return { owner, script: "test:parity", runner: "parity" };
  }
  if (owner.filter === "@repo/db") {
    if (!/^packages\/db\/scripts\/[^/]+\.test\.ts$/.test(test.path)) {
      throw new Error(
        `Unsupported focused DB test "${test.path}"; only self-running packages/db/scripts/*.test.ts files are safe.`,
      );
    }
    return { owner, script: "exec", runner: "db-tsx" };
  }
  if (owner.filter === "@repo/core") {
    return { owner, script: "exec", runner: "core-vitest-run" };
  }
  if (test.kind === "playwright") return { owner, script: "test:e2e", runner: "playwright" };
  if (test.kind === "maestro") return { owner, script: "test:e2e:flow", runner: "maestro" };
  if (test.kind === "live-db") return { owner, script: "test:live-db", runner: "vitest-live-db" };
  if (owner.filter === "mobile" && test.kind === "native") {
    return { owner, script: "test:jest:file", runner: "jest" };
  }
  if (owner.filter === "mobile") return { owner, script: "test:vitest", runner: "vitest" };
  if (owner.filter === "@repo/ui" && test.kind === "native") {
    return { owner, script: "test:native", runner: "jest" };
  }
  if (owner.filter === "@repo/ui" && test.kind === "web") {
    return { owner, script: "test:web", runner: "vitest" };
  }
  return { owner, script: "test", runner: "vitest" };
}

export function commandsForTests(tests, { runtime = false } = {}) {
  const groups = new Map();
  for (const test of tests) {
    if (!runtime && RUNTIME_KINDS.has(test.kind)) continue;
    const identity = commandIdentity(test);
    const key = `${identity.owner.filter ?? "root"}:${identity.script}:${identity.runner}${
      identity.runner === "db-tsx" ? `:${test.path}` : ""
    }`;
    const group = groups.get(key) ?? { ...identity, paths: [] };
    group.paths.push(test.path);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((left, right) => {
      const leftKey = `${left.owner.filter ?? "root"}:${left.script}`;
      const rightKey = `${right.owner.filter ?? "root"}:${right.script}`;
      return leftKey.localeCompare(rightKey);
    })
    .map((group) => {
      const testPaths = group.paths
        .sort()
        .map((file) => path.posix.relative(group.owner.directory, file));
      if (group.runner === "db-tsx") {
        return {
          command: "pnpm",
          args: ["--filter", "@repo/db", "exec", "tsx", testPaths[0]],
          tests: group.paths,
        };
      }
      if (group.runner === "core-vitest-run") {
        return {
          command: "pnpm",
          args: ["--filter", "@repo/core", "exec", "vitest", "run", ...testPaths],
          tests: group.paths,
        };
      }
      if (!group.owner.filter) {
        if (group.runner === "node:test") {
          return { command: "node", args: ["--test", ...testPaths], tests: group.paths };
        }
        if (group.runner === "parity") {
          return { command: "pnpm", args: ["test:parity", ...testPaths], tests: group.paths };
        }
        return {
          command: "pnpm",
          args: ["exec", "vitest", "run", ...testPaths],
          tests: group.paths,
        };
      }
      return {
        command: "pnpm",
        args: ["--filter", group.owner.filter, group.script, ...testPaths],
        tests: group.paths,
      };
    });
}

export function verificationCommandsForTests(tests) {
  const owners = new Map();
  for (const test of tests) {
    const owner = ownerFor(test.path);
    if (owner.filter) owners.set(owner.filter, owner);
  }

  const commands = [];
  for (const [filter] of [...owners].sort(([left], [right]) => left.localeCompare(right))) {
    commands.push({
      command: "pnpm",
      args: ["--filter", filter, "check-types"],
      verification: "check-types",
    });
    if (filter === "@repo/ui") {
      commands.push({
        command: "pnpm",
        args: ["--filter", filter, "check:testing-artifacts"],
        verification: "check:testing-artifacts",
      });
    }
  }
  return commands;
}

export async function createPlan({
  root,
  selector,
  changedFiles = [],
  runtime = false,
  verify = false,
  requireTests = false,
}) {
  const resolvedRoot = path.resolve(root);
  let discovered = [];
  const featureIds = new Set();

  if (selector.feature) {
    featureIds.add(selector.feature);
    discovered = await discoverFeature(resolvedRoot, selector.feature);
  } else if (selector.path) {
    const result = await discoverPath(resolvedRoot, selector.path);
    discovered = result.files;
    for (const id of result.featureIds) featureIds.add(id);
  } else if (selector.changed) {
    for (const changedFile of [...new Set(changedFiles)].sort()) {
      const featureId = featureIdFromPath(changedFile);
      if (featureId) {
        featureIds.add(featureId);
        discovered.push(...(await discoverFeature(resolvedRoot, featureId)));
        continue;
      }
      if (classifyTest(changedFile)) {
        if ((await pathKind(path.join(resolvedRoot, changedFile))) === "file")
          discovered.push(changedFile);
        continue;
      }
      if ((await pathKind(path.join(resolvedRoot, changedFile))) === "file") {
        discovered.push(...(await discoverPath(resolvedRoot, changedFile)).files);
      }
    }
  } else if (selector.all) {
    discovered = [
      ...(await walkFiles(resolvedRoot, "packages")),
      ...(await walkFiles(resolvedRoot, "apps")),
      ...(await walkFiles(resolvedRoot, "tooling")),
    ];
  } else {
    throw new Error("Choose one selector: --path, --feature, --changed, or --all.");
  }

  const files = [...new Set(discovered)].sort();
  const intentFiles = files.filter((file) => file.endsWith("/feature.contract.ts"));
  const tests = files
    .map((file) => ({ kind: classifyTest(file), path: file, featureId: featureIdFromPath(file) }))
    .filter((test) => test.kind)
    .sort((left, right) => left.path.localeCompare(right.path));
  const deferred = tests.filter((test) => !runtime && RUNTIME_KINDS.has(test.kind));
  if (requireTests && tests.length === 0 && (selector.feature || selector.path)) {
    const selection = selector.feature
      ? `feature "${selector.feature}"`
      : `path "${selector.path}"`;
    throw new Error(`Cannot execute ${selection}: no conventionally named tests were found.`);
  }
  if (requireTests && !runtime && tests.length > 0 && deferred.length === tests.length) {
    throw new Error(
      "Cannot execute selection: every selected test is a deferred runtime test; pass --runtime explicitly.",
    );
  }
  const testCommands = commandsForTests(tests, { runtime });
  const verificationCommands = verify ? verificationCommandsForTests(tests) : [];

  return {
    selector,
    featureIds: [...featureIds].sort(),
    intentFiles,
    tests,
    commands: [...testCommands, ...verificationCommands],
    verificationCommands,
    deferredRuntime: deferred.map((test) => test.path),
  };
}

export function formatPlan(plan) {
  const lines = [
    "Filesystem test plan",
    `Features: ${plan.featureIds.length ? plan.featureIds.join(", ") : "(none)"}`,
    `Tests: ${plan.tests.length}`,
  ];
  if (plan.tests.length === 0) lines.push("No tests selected.");
  const byKind = new Map();
  for (const test of plan.tests) byKind.set(test.kind, (byKind.get(test.kind) ?? 0) + 1);
  for (const [kind, count] of [...byKind].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`  ${kind}: ${count}`);
  }
  lines.push(`Intent metadata: ${plan.intentFiles.length}`);
  for (const file of plan.intentFiles) lines.push(`  ${file}`);
  lines.push(`Commands: ${plan.commands.length}`);
  for (const command of plan.commands)
    lines.push(`  ${[command.command, ...command.args].join(" ")}`);
  if (plan.deferredRuntime.length) {
    lines.push(`Deferred runtime tests (pass --runtime): ${plan.deferredRuntime.length}`);
    for (const file of plan.deferredRuntime) lines.push(`  ${file}`);
  }
  return `${lines.join("\n")}\n`;
}
