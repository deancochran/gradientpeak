import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

export const FEATURE_ROOTS = [
  "packages/core/src/features",
  "packages/api/src/features",
  "apps/web/src/features",
  "apps/mobile/features",
];

export const FEATURE_MARKER = ".feature-id";
const FEATURE_MARKER_ROOTS = ["apps", "packages"];
const FEATURE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RUNTIME_KINDS = new Set(["live-db", "playwright", "maestro"]);
const IGNORED_DIRECTORIES = new Set([".git", ".turbo", "coverage", "dist", "node_modules"]);
const ROOT_VERIFICATION_CAPSULES = {
  "biome.json": ["tooling/architecture", "tooling/testing"],
  "package.json": ["tooling/architecture", "tooling/testing", "tests/parity"],
  "pnpm-workspace.yaml": ["tooling/architecture", "tooling/testing", "tests/parity"],
  "turbo.json": ["tooling/architecture", "tooling/testing"],
  "vitest.parity.config.ts": ["tests/parity"],
};
const ROOT_CONFIG_FILES = new Set([...Object.keys(ROOT_VERIFICATION_CAPSULES), "pnpm-lock.yaml"]);
const OWNERS = {
  "apps/mobile": { directory: "apps/mobile", filter: "mobile" },
  "apps/web": { directory: "apps/web", filter: "web" },
  "packages/api": { directory: "packages/api", filter: "@repo/api" },
  "packages/auth": { directory: "packages/auth", filter: "@repo/auth" },
  "packages/core": { directory: "packages/core", filter: "@repo/core" },
  "packages/db": { directory: "packages/db", filter: "@repo/db" },
  "packages/ui": { directory: "packages/ui", filter: "@repo/ui" },
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

async function walkFeatureMarkerPaths(root, relativeDirectory, resolvedRoot) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const kind = await pathKind(absoluteDirectory);
  if (kind === "missing") return [];
  if (kind === "symlink") return [];
  if (kind !== "directory") return [];
  const repositoryRoot = resolvedRoot ?? (await realpath(root));
  const resolvedDirectory = await realpath(absoluteDirectory);
  if (!isInsideRoot(repositoryRoot, resolvedDirectory)) {
    throw new Error(
      `Feature marker traversal escapes repository root: ${toPosix(relativeDirectory)} resolves outside the repository.`,
    );
  }

  const markers = [];
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const relativePath = path.posix.join(toPosix(relativeDirectory), entry.name);
    if (entry.isSymbolicLink()) {
      if (entry.name === FEATURE_MARKER) {
        throw new Error(`Feature marker must be a regular file, not a symlink: ${relativePath}`);
      }
      const resolvedTarget = await realpath(path.join(root, relativePath));
      if (!isInsideRoot(repositoryRoot, resolvedTarget)) {
        throw new Error(
          `Feature marker traversal escapes repository root: ${relativePath} resolves outside the repository.`,
        );
      }
      continue;
    }
    if (entry.isDirectory()) {
      markers.push(...(await walkFeatureMarkerPaths(root, relativePath, repositoryRoot)));
    } else if (entry.isFile() && entry.name === FEATURE_MARKER) {
      markers.push(relativePath);
    }
  }
  return markers;
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

function canonicalFeatureIdFromPath(relativePath) {
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
  if (!FEATURE_ID_PATTERN.test(featureId)) {
    throw new Error(
      `Invalid feature id "${featureId}"; use lowercase letters and numbers separated by single hyphens.`,
    );
  }
}

async function readFeatureMarker(root, markerPath, resolvedRoot) {
  if (!(await isContainedFile(root, markerPath, resolvedRoot))) {
    throw new Error(`Feature marker must be a regular file: ${markerPath}`);
  }
  let contents;
  try {
    contents = new TextDecoder("utf-8", { fatal: true }).decode(
      await readFile(path.join(root, markerPath)),
    );
  } catch {
    throw new Error(`Feature marker must contain valid UTF-8 text: ${markerPath}`);
  }
  const featureId = contents.endsWith("\n") ? contents.slice(0, -1) : contents;
  if (!FEATURE_ID_PATTERN.test(featureId)) {
    throw new Error(
      `Malformed feature marker ${markerPath}; expected one lowercase kebab feature id and an optional trailing newline.`,
    );
  }
  return featureId;
}

function isSameOrAncestor(directory, candidate) {
  const relative = path.posix.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.posix.isAbsolute(relative));
}

export async function discoverFeatureMarkers(root) {
  const resolvedRoot = await realpath(root);
  const markerPaths = [];
  for (const markerRoot of FEATURE_MARKER_ROOTS) {
    markerPaths.push(...(await walkFeatureMarkerPaths(root, markerRoot, resolvedRoot)));
  }

  const directories = new Map();
  const byId = new Map();
  for (const markerPath of markerPaths.sort()) {
    const directory = path.posix.dirname(markerPath);
    const featureId = await readFeatureMarker(root, markerPath, resolvedRoot);
    validateFeatureId(featureId);
    if (path.posix.basename(directory) !== featureId) {
      throw new Error(
        `Feature marker ${markerPath} declares "${featureId}" but its directory basename is "${path.posix.basename(directory)}"; they must match exactly.`,
      );
    }
    const canonicalId = canonicalFeatureIdFromPath(directory);
    if (canonicalId) {
      throw new Error(
        `Feature marker ${markerPath} is inside canonical feature instance "${canonicalId}"; canonical feature directories must not contain markers.`,
      );
    }
    const shadowedRoot = FEATURE_ROOTS.find((featureRoot) =>
      isSameOrAncestor(directory, featureRoot),
    );
    if (shadowedRoot) {
      throw new Error(
        `Feature marker ${markerPath} is at or above canonical feature root ${shadowedRoot}; broad markers are not allowed.`,
      );
    }

    let ancestor = path.posix.dirname(directory);
    while (ancestor !== ".") {
      const ancestorId = directories.get(ancestor);
      if (ancestorId) {
        const relationship = ancestorId === featureId ? "Duplicate" : "Conflicting";
        throw new Error(
          `${relationship} nested feature marker ${markerPath}; ancestor ${ancestor}/${FEATURE_MARKER} declares "${ancestorId}".`,
        );
      }
      ancestor = path.posix.dirname(ancestor);
    }
    directories.set(directory, featureId);
    const featureDirectories = byId.get(featureId) ?? [];
    featureDirectories.push(directory);
    byId.set(featureId, featureDirectories);
  }

  return { byDirectory: directories, byId };
}

function markerFeatureIdFromPath(relativePath, markers) {
  let candidate = toPosix(relativePath).replace(/\/$/, "");
  if (path.posix.basename(candidate) === FEATURE_MARKER) candidate = path.posix.dirname(candidate);
  while (candidate !== ".") {
    const featureId = markers.byDirectory.get(candidate);
    if (featureId) return featureId;
    candidate = path.posix.dirname(candidate);
  }
  return null;
}

function featureIdFromPath(relativePath, markers) {
  return markerFeatureIdFromPath(relativePath, markers) ?? canonicalFeatureIdFromPath(relativePath);
}

function emptyFeatureMarkers() {
  return { byDirectory: new Map(), byId: new Map() };
}

function isRootOnlyPath(root, requestedPath) {
  const relative = toPosix(path.relative(path.resolve(root), path.resolve(root, requestedPath)));
  return relative === "." || path.posix.dirname(relative) === ".";
}

export function selectionNeedsFeatureMarkers(root, selector, changedFiles = []) {
  if (selector.feature) return true;
  if (selector.all) return false;
  if (selector.path) return !isRootOnlyPath(root, selector.path);
  if (selector.changed)
    return changedFiles.some((file) => path.posix.dirname(toPosix(file)) !== ".");
  return false;
}

async function discoverFeature(root, featureId, markers) {
  validateFeatureId(featureId);
  const resolvedRoot = await realpath(root);
  const candidates = [];
  for (const featureRoot of FEATURE_ROOTS) {
    candidates.push(...(await walkFiles(root, `${featureRoot}/${featureId}`, resolvedRoot)));
  }
  for (const directory of markers.byId.get(featureId) ?? []) {
    candidates.push(...(await walkFiles(root, directory, resolvedRoot)));
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

async function discoverPath(root, requestedPath, markers) {
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
  const featureId = featureIdFromPath(relative, markers);
  if (featureId)
    return { files: await discoverFeature(root, featureId, markers), featureIds: [featureId] };

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
  return OWNERS[key] ?? { directory: ".", filter: null };
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

export function verificationCommandsForFiles(files) {
  const owners = new Map();
  for (const file of files) {
    const owner = ownerFor(typeof file === "string" ? file : file.path);
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

export const verificationCommandsForTests = verificationCommandsForFiles;

function isStrictlyRelevantChangedFile(relativePath) {
  const normalized = toPosix(relativePath);
  if (classifyTest(normalized) || /(?:^|\/)__tests__\//.test(normalized)) return false;
  if (/\.(?:md|mdx)$/.test(normalized) || /\.(?:stories|story)\.[cm]?[jt]sx?$/.test(normalized)) {
    return false;
  }
  if (/^tooling\/.*\/fixtures\//.test(normalized)) return false;
  if (ROOT_CONFIG_FILES.has(normalized)) return true;
  const owner = ownerFor(normalized);
  if (owner.filter) return true;
  return normalized.startsWith("tooling/");
}

export async function createPlan({
  root,
  selector,
  changedFiles = [],
  runtime = false,
  verify = false,
  requireTests = false,
  strict = false,
}) {
  const resolvedRoot = path.resolve(root);
  let discovered = [];
  const featureIds = new Set();
  const markers = selectionNeedsFeatureMarkers(resolvedRoot, selector, changedFiles)
    ? await discoverFeatureMarkers(resolvedRoot)
    : emptyFeatureMarkers();

  if (selector.feature) {
    featureIds.add(selector.feature);
    discovered = await discoverFeature(resolvedRoot, selector.feature, markers);
  } else if (selector.path) {
    const result = await discoverPath(resolvedRoot, selector.path, markers);
    discovered = result.files;
    for (const id of result.featureIds) featureIds.add(id);
  } else if (selector.changed) {
    for (const changedFile of [...new Set(changedFiles)].sort()) {
      const featureId = featureIdFromPath(changedFile, markers);
      if (featureId) {
        featureIds.add(featureId);
        discovered.push(...(await discoverFeature(resolvedRoot, featureId, markers)));
        continue;
      }
      if (classifyTest(changedFile)) {
        if ((await pathKind(path.join(resolvedRoot, changedFile))) === "file")
          discovered.push(changedFile);
        continue;
      }
      if ((await pathKind(path.join(resolvedRoot, changedFile))) === "file") {
        discovered.push(...(await discoverPath(resolvedRoot, changedFile, markers)).files);
      }
    }
  } else if (selector.all) {
    discovered = [
      ...(await walkFiles(resolvedRoot, "packages")),
      ...(await walkFiles(resolvedRoot, "apps")),
      ...(await walkFiles(resolvedRoot, "tooling")),
      ...(await walkFiles(resolvedRoot, "tests")),
    ];
  } else {
    throw new Error("Choose one selector: --path, --feature, --changed, or --all.");
  }

  const files = [...new Set(discovered)].sort();
  const intentFiles = files.filter((file) => file.endsWith("/feature.contract.ts"));
  const tests = files
    .map((file) => ({
      kind: classifyTest(file),
      path: file,
      featureId: featureIdFromPath(file, markers),
    }))
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
  const verificationCommands = verify ? verificationCommandsForFiles(files) : [];
  if (
    strict &&
    selector.changed &&
    changedFiles.some(isStrictlyRelevantChangedFile) &&
    tests.length === 0 &&
    verificationCommands.length === 0
  ) {
    throw new Error(
      "Strict changed execution found production or configuration changes but no tests or verification commands.",
    );
  }

  return {
    selector,
    featureIds: [...featureIds].sort(),
    intentFiles,
    files,
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
