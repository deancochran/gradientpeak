import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const runtimeKinds = new Set(["playwright", "maestro"]);
export const configuredPlaywrightProjects = [
  "Desktop Chrome",
  "Desktop Firefox",
  "Narrow Firefox",
  "Mobile Chrome",
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

export function changedCapabilityIds(baseRecords, currentRecords) {
  const base = new Map(baseRecords.map((record) => [record.id, JSON.stringify(stable(record))]));
  const current = new Map(
    currentRecords.map((record) => [record.id, JSON.stringify(stable(record))]),
  );
  return [...new Set([...base.keys(), ...current.keys()])]
    .filter((id) => base.get(id) !== current.get(id))
    .sort();
}

export function validateRegistryStructure(records, schema) {
  const issues = [];
  const ids = new Set();
  for (const input of records) {
    const id = input && typeof input.id === "string" ? input.id : "unknown";
    const result = schema.safeParse(input);
    if (!result.success) {
      issues.push(
        ...result.error.issues.map(
          (issue) => `${id}: ${issue.path.join(".") || "record"}: ${issue.message}`,
        ),
      );
    }
    if (ids.has(id)) issues.push(`duplicate capability id: ${id}`);
    ids.add(id);
  }
  return [...new Set(issues)].sort();
}

export function validateChangedCapabilityProof(baseRecords, currentRecords) {
  const base = new Map(baseRecords.map((record) => [record.id, record]));
  const current = new Map(currentRecords.map((record) => [record.id, record]));
  const issues = [];
  for (const id of changedCapabilityIds(baseRecords, currentRecords)) {
    const before = base.get(id);
    const after = current.get(id);
    if (!after) {
      issues.push(`${id}: capability was deleted`);
      continue;
    }
    if (!before) continue;
    if (before.ownerArea !== after.ownerArea) issues.push(`${id}: owner metadata regressed`);
    if (before.priority !== after.priority) issues.push(`${id}: priority metadata regressed`);
    for (const kind of before.requiredTestKinds ?? []) {
      if (!(after.requiredTestKinds ?? []).includes(kind)) {
        issues.push(`${id}: required lower-layer test kind regressed: ${kind}`);
      }
    }
    for (const platform of ["web", "mobile"]) {
      const wasIntended = before.policy === "both" || before.policy === `${platform}_only`;
      const isIntended = after.policy === "both" || after.policy === `${platform}_only`;
      if (wasIntended && !isIntended) {
        issues.push(`${id}: ${platform} intended platform was removed`);
      }
      const beforeEvidence = before[platform];
      const afterEvidence = after[platform];
      if (!beforeEvidence || !afterEvidence) {
        issues.push(`${id}: ${platform} lower-layer evidence regressed`);
        continue;
      }
      for (const test of (beforeEvidence.tests ?? []).filter((candidate) =>
        ["jest", "vitest", "live-db", "contract", "component"].includes(candidate.kind),
      )) {
        const retained = (afterEvidence.tests ?? []).some(
          (candidate) =>
            candidate.kind === test.kind &&
            candidate.path === test.path &&
            candidate.identity === test.identity,
        );
        if (!retained) {
          issues.push(
            `${id}: ${platform} lower-layer evidence regressed: ${test.kind}:${test.path}`,
          );
        }
      }
    }
    if (before.policy === "both" && after.policy !== "both") {
      const narrowedPlatform = after.policy === "web_only" ? "mobile" : "web";
      const evidence = after[narrowedPlatform];
      const hasProductDecision = (evidence?.missingSteps ?? []).some(
        (gap) => gap.kind === "product-decision",
      );
      const intentional =
        evidence?.status === "intentional_absence" &&
        evidence?.implementation === "intentional_absence";
      if (!intentional && !(evidence?.status === "decision_pending" && hasProductDecision)) {
        issues.push(
          `${id}: platform policy narrowed without intentional absence or product decision treatment`,
        );
      }
    }
  }
  return issues;
}

export function selectChangedCapabilities(records, changedPaths = [], changedIds = []) {
  const ids = new Set(changedIds);
  for (const record of records) {
    if (
      changedPaths.some((changedPath) =>
        [record.web, record.mobile].some((evidence) =>
          [...evidence.sources, ...evidence.tests.map((test) => test.path)].includes(changedPath),
        ),
      )
    )
      ids.add(record.id);
  }
  return records.filter((record) => ids.has(record.id)).sort((a, b) => a.id.localeCompare(b.id));
}

export function selectRegisteredJourneys(records) {
  const journeys = [];
  const missing = [];
  const seen = new Set();
  for (const record of records) {
    for (const platform of ["web", "mobile"]) {
      if (!(record.policy === "both" || record.policy === `${platform}_only`)) continue;
      const refs = record[platform].tests.filter((test) => runtimeKinds.has(test.kind));
      if (refs.length === 0) {
        missing.push({
          capabilityId: record.id,
          platform,
          reason: "no registered runtime journey",
        });
        continue;
      }
      for (const reference of refs) {
        const key = `${platform}:${reference.kind}:${reference.path}:${reference.identity ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          journeys.push({ capabilityId: record.id, platform, reference });
        }
      }
    }
  }
  return { journeys, missing };
}

export function escapeExactRegex(value) {
  return `(?:^|\\s)${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

export function journeyCommand(journey) {
  const { reference } = journey;
  if (journey.platform === "web") {
    return {
      command: "pnpm",
      args: [
        "test:e2e:web",
        reference.path.replace(/^apps\/web\//, ""),
        "--grep",
        escapeExactRegex(reference.identity),
        "--reporter=json",
      ],
    };
  }
  return {
    command: "pnpm",
    args: ["--filter", "mobile", "test:e2e:flow", reference.path.replace(/^apps\/mobile\//, "")],
  };
}

function playwrightTests(report, configuredProjects) {
  const tests = [];
  function visit(suite, parents = [], projectName) {
    const titles = [...parents, ...(suite.title ? [suite.title] : [])];
    const suiteProject =
      projectName ?? (configuredProjects.includes(suite.title) ? suite.title : undefined);
    for (const test of suite.tests ?? [])
      tests.push({
        ...test,
        projectName: test.projectName ?? suiteProject,
        fullTitle: [...titles, test.title].filter(Boolean).join(" "),
      });
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        tests.push({
          ...test,
          projectName: test.projectName ?? suiteProject,
          title: spec.title,
          fullTitle: [...titles, spec.title].filter(Boolean).join(" "),
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, titles, suiteProject);
  }
  for (const suite of report.suites ?? []) visit(suite);
  return tests;
}

export function parsePlaywrightResult(
  stdout,
  identity,
  configuredProjects = configuredPlaywrightProjects,
) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return { status: "gap", reason: "Playwright did not produce a JSON result" };
  }
  const tests = playwrightTests(report, configuredProjects).filter(
    (test) => test.fullTitle === identity || test.title === identity,
  );
  const matchesByProject = new Map();
  for (const test of tests) {
    const project =
      test.projectName ??
      test.results?.find((result) => result.projectName)?.projectName ??
      (configuredProjects.length === 1 ? configuredProjects[0] : undefined);
    if (!project || !configuredProjects.includes(project))
      return {
        status: "gap",
        reason: `Playwright identity matched an extraneous or unknown project: ${project ?? "unknown"}`,
      };
    const matches = matchesByProject.get(project) ?? [];
    matches.push(test);
    matchesByProject.set(project, matches);
  }
  for (const project of configuredProjects) {
    const matches = matchesByProject.get(project) ?? [];
    if (matches.length === 0)
      return { status: "gap", reason: `Playwright project has no matching result: ${project}` };
    if (matches.length !== 1)
      return {
        status: "gap",
        reason: `Playwright project has duplicate matching results: ${project}`,
      };
    const test = matches[0];
    const statuses = (test.results ?? []).map((result) => result.status);
    if (statuses.length === 0)
      return { status: "gap", reason: `Playwright test has no results in ${project}` };
    if (test.status === "skipped" || statuses.includes("skipped"))
      return { status: "gap", reason: `Playwright test was skipped in ${project}` };
    if (
      test.status === "failed" ||
      !statuses.includes("passed") ||
      statuses.some((status) => status !== "passed")
    )
      return { status: "failed", reason: `Playwright test did not pass in ${project}` };
  }
  return { status: "passed" };
}

export function parseMaestroResult(stdout, identity) {
  const cases = [
    ...stdout.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>|<testcase\b([^>]*)\/>/gi),
  ].map((match) => `${match[1] ?? match[3]}${match[2] ?? ""}`);
  const matching = cases.filter((item) =>
    new RegExp(`(?:name|id)=["']${identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(item),
  );
  if (matching.length !== 1)
    return {
      status: "gap",
      reason: `expected exactly one Maestro result, found ${matching.length}`,
    };
  if (/<(failure|error|skipped)\b/i.test(matching[0]))
    return { status: "failed", reason: "Maestro journey was skipped or failed" };
  return { status: "passed" };
}

export async function runRegisteredJourneys(journeys, { cwd, run = execFileAsync } = {}) {
  const results = [];
  for (const journey of journeys) {
    const { command, args } = journeyCommand(journey);
    let receiptDirectory;
    try {
      const mobileReceipt = journey.platform === "mobile";
      if (mobileReceipt) {
        receiptDirectory = await mkdtemp(path.join(os.tmpdir(), "gradientpeak-maestro-"));
      }
      const output = await run(command, args, {
        cwd,
        env: {
          ...process.env,
          ...(journey.platform === "web" ? { CI: "1" } : {}),
          ...(mobileReceipt
            ? { MAESTRO_JUNIT_OUTPUT: path.join(receiptDirectory, "junit.xml") }
            : {}),
        },
      });
      const checked =
        journey.platform === "web"
          ? parsePlaywrightResult(
              output?.stdout ?? "",
              journey.reference.identity,
              journey.configuredProjects ?? configuredPlaywrightProjects,
            )
          : parseMaestroResult(
              await readFile(path.join(receiptDirectory, "junit.xml"), "utf8").catch(() => ""),
              journey.reference.identity,
            );
      results.push({ ...journey, ...checked });
    } catch (error) {
      results.push({
        ...journey,
        status: error?.code === "ENOENT" ? "unavailable" : "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (receiptDirectory) await rm(receiptDirectory, { recursive: true, force: true });
    }
  }
  return results;
}
