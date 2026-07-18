#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export const STRICTNESS_FLAGS = [
  "exactOptionalPropertyTypes",
  "noImplicitReturns",
  "noUncheckedIndexedAccess",
  // biome-ignore lint/security/noSecrets: This is a TypeScript compiler option name, not a credential.
  "verbatimModuleSyntax",
];

export const ADDITIONAL_TSCONFIGS = ["packages/db/supabase/tsconfig.json"];

const BASELINE_VERSION = 2;

function normalizePath(path) {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

function parseJson(path, description) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Malformed ${description} at ${path}: ${error.message}`);
  }
}

function workspaceDirectories(root, patterns) {
  const directories = [];
  for (const pattern of patterns) {
    if (
      typeof pattern !== "string" ||
      !pattern.endsWith("/*") ||
      pattern.slice(0, -2).includes("*")
    ) {
      throw new Error(
        `Unsupported workspace pattern ${JSON.stringify(pattern)}; expected a single trailing /*`,
      );
    }
    const parent = resolve(root, pattern.slice(0, -2));
    if (!existsSync(parent))
      throw new Error(`Stale workspace pattern ${pattern}: directory does not exist`);
    for (const entry of readdirSync(parent).sort()) {
      const candidate = resolve(parent, entry);
      if (statSync(candidate).isDirectory() && existsSync(resolve(candidate, "package.json"))) {
        directories.push(candidate);
      }
    }
  }
  return [...new Set(directories)].sort();
}

export function discoverTsconfigs(root, { additionalTsconfigs = ADDITIONAL_TSCONFIGS } = {}) {
  const manifest = parseJson(resolve(root, "package.json"), "root package.json");
  if (!Array.isArray(manifest.workspaces)) {
    throw new Error("Root package.json must declare a workspaces array");
  }

  const projects = [];
  for (const workspace of workspaceDirectories(root, manifest.workspaces)) {
    const workspaceManifest = parseJson(
      resolve(workspace, "package.json"),
      "workspace package.json",
    );
    const configPath = resolve(workspace, "tsconfig.json");
    const hasConfig = existsSync(configPath);
    const checkTypesScript = workspaceManifest.scripts?.["check-types"];
    const hasCheckTypes =
      typeof checkTypesScript === "string" && checkTypesScript.trim().length > 0;
    const workspacePath = normalizePath(relative(root, workspace));
    if (hasConfig && !hasCheckTypes) {
      throw new Error(
        `Stale workspace configuration: ${workspacePath} has tsconfig.json but no executable check-types script`,
      );
    }
    if (hasCheckTypes && !hasConfig) {
      throw new Error(
        `Stale workspace configuration: ${workspacePath} has check-types but no tsconfig.json`,
      );
    }
    if (!hasConfig) continue;
    projects.push(configPath);
  }

  for (const path of additionalTsconfigs) {
    const configPath = resolve(root, path);
    if (!existsSync(configPath))
      throw new Error(`Stale configured tsconfig: ${path} does not exist`);
    projects.push(configPath);
  }

  return [...new Set(projects)].map((path) => normalizePath(relative(root, path))).sort();
}

function formatConfigDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function parseTsconfig(root, configPath) {
  const absolute = resolve(root, configPath);
  const unrecoverable = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    absolute,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => unrecoverable.push(diagnostic),
    },
  );
  const allowEmpty = ADDITIONAL_TSCONFIGS.includes(configPath);
  const errors = [...unrecoverable, ...(parsed?.errors ?? [])].filter(
    (diagnostic) => !(allowEmpty && diagnostic.code === 18003),
  );
  if (!parsed || errors.length > 0) {
    throw new Error(
      `Malformed TypeScript config ${configPath}:\n${errors.map(formatConfigDiagnostic).join("\n") || "unable to parse"}`,
    );
  }
  if (parsed.fileNames.length === 0 && !allowEmpty) {
    throw new Error(`Stale TypeScript config ${configPath}: it includes no source files`);
  }
  return parsed;
}

function allDiagnostics(parsed, override = {}) {
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, ...override, noEmit: true },
    projectReferences: parsed.projectReferences,
  });
  return ts.getPreEmitDiagnostics(program);
}

function diagnosticIdentity(diagnostic) {
  return [
    diagnostic.category,
    diagnostic.code,
    diagnostic.file?.fileName ?? "<global>",
    diagnostic.start ?? -1,
    diagnostic.length ?? -1,
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  ].join("|");
}

function diagnosticCounts(diagnostics) {
  const counts = new Map();
  for (const diagnostic of diagnostics) {
    const key = diagnosticIdentity(diagnostic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function attributableDiagnostics(parsed, flag) {
  const remaining = diagnosticCounts(allDiagnostics(parsed));
  return allDiagnostics(parsed, { [flag]: true }).filter((diagnostic) => {
    const key = diagnosticIdentity(diagnostic);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

function checkKey(check) {
  return `${check.flag}|${check.project}`;
}

function bucketKey(bucket) {
  return `${bucket.flag}|${bucket.project}|${bucket.path}|${bucket.code}`;
}

function sortChecks(checks) {
  return checks.sort((a, b) => checkKey(a).localeCompare(checkKey(b)));
}

function sortBuckets(buckets) {
  return buckets.sort((a, b) => bucketKey(a).localeCompare(bucketKey(b)));
}

export function configuredChecks(root, projects = discoverTsconfigs(root)) {
  const checks = [];
  for (const project of [...projects].sort()) {
    const parsed = parseTsconfig(root, project);
    for (const flag of STRICTNESS_FLAGS) {
      if (parsed.options[flag] !== true) checks.push({ flag, project });
    }
  }
  return sortChecks(checks);
}

export function analyzeStrictness(
  root,
  { projects = discoverTsconfigs(root), flags = STRICTNESS_FLAGS } = {},
) {
  const checks = [];
  const buckets = new Map();
  for (const project of [...projects].sort()) {
    const parsed = parseTsconfig(root, project);
    for (const flag of flags) {
      if (!STRICTNESS_FLAGS.includes(flag)) throw new Error(`Unsupported strictness flag ${flag}`);
      if (parsed.options[flag] === true) continue;
      checks.push({ flag, project });
      for (const diagnostic of attributableDiagnostics(parsed, flag)) {
        const bucket = {
          flag,
          project,
          path: diagnostic.file
            ? normalizePath(relative(root, diagnostic.file.fileName))
            : "<global>",
          code: diagnostic.code,
          count: 1,
        };
        const key = bucketKey(bucket);
        const existing = buckets.get(key);
        if (existing) existing.count += 1;
        else buckets.set(key, bucket);
      }
    }
  }
  return { checks: sortChecks(checks), buckets: sortBuckets([...buckets.values()]) };
}

export function analyzeStrictnessIsolated(root, projects = discoverTsconfigs(root)) {
  const checks = [];
  const buckets = [];
  const worker = resolve(dirname(fileURLToPath(import.meta.url)), "strictness-worker.mjs");
  for (const check of configuredChecks(root, projects)) {
    const output = execFileSync(process.execPath, [worker, root, check.project, check.flag], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    });
    const result = JSON.parse(output);
    checks.push(...result.checks);
    buckets.push(...result.buckets);
  }
  return { checks: sortChecks(checks), buckets: sortBuckets(buckets) };
}

export function baselineFrom(projects, analysis, typescriptVersion = ts.version) {
  const checks = sortChecks(structuredClone(analysis.checks));
  const buckets = sortBuckets(structuredClone(analysis.buckets));
  return {
    version: BASELINE_VERSION,
    typescriptVersion,
    projects: [...projects].sort(),
    checks,
    total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    buckets,
  };
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function validateBaseline(baseline) {
  const errors = [];
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline))
    return ["baseline must be an object"];
  if (baseline.version !== BASELINE_VERSION)
    errors.push(`baseline version must be ${BASELINE_VERSION}`);
  if (typeof baseline.typescriptVersion !== "string" || baseline.typescriptVersion.length === 0)
    errors.push("baseline TypeScript version must be a non-empty string");
  if (
    !Array.isArray(baseline.projects) ||
    !Array.isArray(baseline.checks) ||
    !Array.isArray(baseline.buckets)
  ) {
    errors.push("baseline projects, checks, and buckets must be arrays");
    return errors;
  }
  const sortedProjects = [...baseline.projects].sort();
  if (
    baseline.projects.some((project) => typeof project !== "string") ||
    new Set(baseline.projects).size !== baseline.projects.length ||
    JSON.stringify(baseline.projects) !== JSON.stringify(sortedProjects)
  ) {
    errors.push("baseline project list must be sorted, unique strings");
  }
  const projectSet = new Set(baseline.projects);
  const seenChecks = new Set();
  for (const check of baseline.checks) {
    const valid =
      check &&
      STRICTNESS_FLAGS.includes(check.flag) &&
      typeof check.project === "string" &&
      projectSet.has(check.project);
    if (!valid) {
      errors.push("baseline contains a malformed check");
      continue;
    }
    const key = checkKey(check);
    if (seenChecks.has(key)) errors.push(`baseline contains duplicate check ${key}`);
    seenChecks.add(key);
  }
  if (
    JSON.stringify(baseline.checks) !== JSON.stringify(sortChecks(structuredClone(baseline.checks)))
  ) {
    errors.push("baseline checks must be sorted");
  }
  const seenBuckets = new Set();
  let total = 0;
  for (const bucket of baseline.buckets) {
    const valid =
      bucket &&
      STRICTNESS_FLAGS.includes(bucket.flag) &&
      typeof bucket.project === "string" &&
      typeof bucket.path === "string" &&
      Number.isInteger(bucket.code) &&
      Number.isInteger(bucket.count) &&
      bucket.count > 0;
    if (!valid) {
      errors.push("baseline contains a malformed diagnostic bucket");
      continue;
    }
    const key = bucketKey(bucket);
    if (!seenChecks.has(checkKey(bucket)))
      errors.push(`baseline bucket has no configured check ${key}`);
    if (seenBuckets.has(key)) errors.push(`baseline contains duplicate bucket ${key}`);
    seenBuckets.add(key);
    total += bucket.count;
  }
  if (
    JSON.stringify(baseline.buckets) !==
    JSON.stringify(sortBuckets(structuredClone(baseline.buckets)))
  ) {
    errors.push("baseline buckets must be sorted");
  }
  if (baseline.total !== total) errors.push("baseline grand total is malformed");
  return errors;
}

export function validateBaselineVersion(baseline, typescriptVersion = ts.version) {
  return baseline.typescriptVersion === typescriptVersion
    ? []
    : [
        `baseline TypeScript version ${JSON.stringify(baseline.typescriptVersion)} does not match ${typescriptVersion}`,
      ];
}

export function comparePolicy(projects, checks, baseline) {
  const currentProjects = new Set(projects);
  const currentChecks = new Set(checks.map(checkKey));
  const baselineChecks = new Set(baseline.checks.map(checkKey));
  const removedProjects = baseline.projects.filter((project) => !currentProjects.has(project));
  const addedChecks = checks.filter((check) => !baselineChecks.has(checkKey(check)));
  const removedChecks = baseline.checks.filter((check) => !currentChecks.has(checkKey(check)));
  const errors = [];
  for (const project of removedProjects) errors.push(`project coverage was removed: ${project}`);
  for (const check of addedChecks) {
    errors.push(`strictness check was newly disabled or added: ${check.flag} in ${check.project}`);
  }
  return { errors, addedChecks, removedChecks };
}

export function compareBaseline(projects, analysis, baseline, typescriptVersion = ts.version) {
  const baselineErrors = validateBaseline(baseline);
  if (baselineErrors.length > 0) {
    return {
      baselineErrors,
      versionErrors: [],
      policyErrors: [],
      growth: [],
      reductions: [],
      removedChecks: [],
    };
  }
  const versionErrors = validateBaselineVersion(baseline, typescriptVersion);
  const policy = comparePolicy(projects, analysis.checks, baseline);
  const accepted = new Map(baseline.buckets.map((bucket) => [bucketKey(bucket), bucket]));
  const current = new Map(analysis.buckets.map((bucket) => [bucketKey(bucket), bucket]));
  const activeChecks = new Set(analysis.checks.map(checkKey));
  const growth = analysis.buckets
    .filter((bucket) => bucket.count > (accepted.get(bucketKey(bucket))?.count ?? 0))
    .map((bucket) => ({ ...bucket, accepted: accepted.get(bucketKey(bucket))?.count ?? 0 }));
  const reductions = baseline.buckets
    .filter((bucket) => activeChecks.has(checkKey(bucket)))
    .filter((bucket) => (current.get(bucketKey(bucket))?.count ?? 0) < bucket.count)
    .map((bucket) => ({ ...bucket, current: current.get(bucketKey(bucket))?.count ?? 0 }));
  return {
    baselineErrors: [],
    versionErrors,
    policyErrors: policy.errors,
    growth,
    reductions,
    removedChecks: policy.removedChecks,
  };
}

function report(projects, analysis, comparison) {
  console.log(
    `TypeScript strictness ratchet (${projects.length} projects, TypeScript ${ts.version})`,
  );
  for (const flag of STRICTNESS_FLAGS) {
    const checks = analysis.checks.filter((check) => check.flag === flag).length;
    if (checks === 0) continue;
    const current = analysis.buckets
      .filter((bucket) => bucket.flag === flag)
      .reduce((sum, bucket) => sum + bucket.count, 0);
    const growth = comparison.growth
      .filter((bucket) => bucket.flag === flag)
      .reduce((sum, bucket) => sum + bucket.count - bucket.accepted, 0);
    const reduced = comparison.reductions
      .filter((bucket) => bucket.flag === flag)
      .reduce((sum, bucket) => sum + bucket.count - bucket.current, 0);
    console.log(
      `  ${flag}: ${current} current, ${growth} added, ${reduced} reduced (${checks} projects)`,
    );
  }
  if (comparison.removedChecks.length > 0) {
    console.log(`  policy strengthening: ${comparison.removedChecks.length} checks now enabled`);
  }
  for (const bucket of comparison.growth) {
    console.error(
      `GROWTH ${bucket.flag} TS${bucket.code} ${bucket.project} ${bucket.path}: ${bucket.accepted} -> ${bucket.count}`,
    );
  }
  for (const error of comparison.policyErrors) console.error(`POLICY ${error}`);
  for (const error of comparison.versionErrors) console.error(`VERSION ${error}`);
  for (const error of comparison.baselineErrors) console.error(`BASELINE ${error}`);
}

export function assertBaselineUpdateAllowed(
  comparison,
  {
    allowTypescriptVersionChange = false,
    allowPolicyWeakening = false,
    allowDebtIncrease = false,
  } = {},
) {
  if (comparison.baselineErrors.length > 0) {
    throw new Error(
      `Refusing to replace a malformed baseline:\n${comparison.baselineErrors.join("\n")}`,
    );
  }
  if (comparison.versionErrors.length > 0 && !allowTypescriptVersionChange) {
    throw new Error(
      `Refusing TypeScript version change:\n${comparison.versionErrors.join("\n")}\n` +
        "review and add --allow-typescript-version-change only for an intentional compiler upgrade",
    );
  }
  if (comparison.policyErrors.length > 0 && !allowPolicyWeakening) {
    throw new Error(
      `Refusing strictness policy weakening:\n${comparison.policyErrors.join("\n")}\n` +
        "review and add --allow-policy-weakening only for an intentional policy change",
    );
  }
  if (comparison.growth.length > 0 && !allowDebtIncrease) {
    throw new Error(
      `Refusing growth in ${comparison.growth.length} strictness bucket(s); ` +
        "review and add --allow-debt-increase only for intentional debt growth",
    );
  }
}

function parseArguments(argv) {
  const allowed = new Set([
    "--write-baseline",
    "--reviewed",
    "--allow-debt-increase",
    "--allow-policy-weakening",
    "--allow-typescript-version-change",
  ]);
  const unknown = argv.filter((argument) => !allowed.has(argument));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  const write = argv.includes("--write-baseline");
  const reviewed = argv.includes("--reviewed");
  const allowDebtIncrease = argv.includes("--allow-debt-increase");
  const allowPolicyWeakening = argv.includes("--allow-policy-weakening");
  const allowTypescriptVersionChange = argv.includes("--allow-typescript-version-change");
  if (
    !write &&
    (reviewed || allowDebtIncrease || allowPolicyWeakening || allowTypescriptVersionChange)
  ) {
    throw new Error("review and override arguments are valid only with --write-baseline");
  }
  if (write && !reviewed) {
    throw new Error("Refusing to write baseline without the explicit --reviewed acknowledgement");
  }
  return { write, allowDebtIncrease, allowPolicyWeakening, allowTypescriptVersionChange };
}

export function run(
  root,
  argv = [],
  baselinePath = resolve(root, "tooling/typescript/strictness-baseline.json"),
) {
  const args = parseArguments(argv);
  const projects = discoverTsconfigs(root);
  const analysis = analyzeStrictnessIsolated(root, projects);
  const nextBaseline = baselineFrom(projects, analysis);

  if (args.write) {
    if (existsSync(baselinePath)) {
      const previous = parseJson(baselinePath, "strictness baseline");
      const comparison = compareBaseline(projects, analysis, previous);
      assertBaselineUpdateAllowed(comparison, args);
    }
    writeFileSync(baselinePath, stableJson(nextBaseline));
    console.log(
      `Wrote reviewed strictness baseline (${nextBaseline.total} diagnostics in ${nextBaseline.buckets.length} buckets) ` +
        `to ${normalizePath(relative(root, baselinePath))}`,
    );
    return 0;
  }

  if (!existsSync(baselinePath)) {
    throw new Error(
      "Strictness baseline is missing; bootstrap it with --write-baseline --reviewed",
    );
  }
  const baseline = parseJson(baselinePath, "strictness baseline");
  const comparison = compareBaseline(projects, analysis, baseline);
  report(projects, analysis, comparison);
  return comparison.baselineErrors.length > 0 ||
    comparison.versionErrors.length > 0 ||
    comparison.policyErrors.length > 0 ||
    comparison.growth.length > 0
    ? 1
    : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = run(
      resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
      process.argv.slice(2),
    );
  } catch (error) {
    console.error(`TypeScript strictness ratchet failed: ${error.message}`);
    process.exitCode = 1;
  }
}
