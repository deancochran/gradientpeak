import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const platforms = ["web", "mobile"];
const runtimeKinds = new Set(["playwright", "maestro"]);

async function walk(directory, root) {
  const relativeDirectory = path.posix.relative(root, directory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path.join(root, relative), root)));
    else files.push(relative);
  }
  return files;
}

export async function discoverUserFacingSurfaces(root) {
  const surfaces = await discoverWebUserFacingSurfaces(root);
  for (const file of await walk(path.join(root, "apps/mobile/app"), root)) {
    if (
      !/\.(?:ts|tsx)$/.test(file) ||
      /(?:^|\/)__tests__\//.test(file) ||
      /\.(?:test|spec)\.(?:ts|tsx)$/.test(file) ||
      /\.d\.ts$/.test(file)
    ) {
      continue;
    }
    surfaces.push({ path: file, platform: "mobile" });
  }
  return surfaces.sort((left, right) => left.path.localeCompare(right.path));
}

async function discoverWebUserFacingSurfaces(root) {
  const routeRoot = "apps/web/src/routes";
  const routeFiles = await walk(path.join(root, routeRoot), root);
  const generatedRouteSource = await readFile(
    path.join(root, "apps/web/src/routeTree.gen.ts"),
    "utf8",
  );
  const generatedModules = new Set(
    [...generatedRouteSource.matchAll(/from\s+["']\.\/routes\/([^"']+)["']/g)].map(
      (match) => `${routeRoot}/${match[1]}`,
    ),
  );
  return routeFiles.flatMap((file) => {
    if (
      !/\.(?:ts|tsx)$/.test(file) ||
      /(?:^|\/)__tests__\//.test(file) ||
      /\.(?:test|spec)\.(?:ts|tsx)$/.test(file) ||
      file.startsWith(`${routeRoot}/api/`)
    ) {
      return [];
    }
    return generatedModules.has(file.replace(/\.(?:ts|tsx)$/, ""))
      ? [{ path: file, platform: "web" }]
      : [];
  });
}

function referenceIdentities(reference, source) {
  if (reference.kind === "maestro") {
    return new Set(
      [...source.matchAll(/^\s*(?:name|junitId):\s*["']?([^\n"']+)["']?\s*$/gm)].map((match) =>
        match[1].trim(),
      ),
    );
  }
  const identities = new Set(
    [
      ...source.matchAll(/\b(?:it|test|profileTest)\s*\(\s*"((?:\\.|[^"\\])*)"/g),
      ...source.matchAll(/\b(?:it|test|profileTest)\s*\(\s*'((?:\\.|[^'\\])*)'/g),
      ...source.matchAll(/\b(?:it|test|profileTest)\s*\(\s*`((?:\\.|[^`\\])*)`/g),
    ].map((match) => match[1]),
  );
  for (const match of source.matchAll(/\b(?:it|test|profileTest)\s*\(\s*`([^`]*)`/g)) {
    const values = [...source.matchAll(/\bname:\s*["']([^"']+)["']/g)].map((item) => item[1]);
    for (const value of values) identities.add(match[1].replaceAll("${viewport.name}", value));
  }
  return identities;
}

function validateReference(
  reference,
  referenceSources,
  capabilityId,
  platform,
  issues,
  referenceIssues,
) {
  const source = referenceSources.get(reference.path);
  if (source === undefined) {
    const issue = `${capabilityId}: ${platform} evidence reference does not exist: ${reference.path}`;
    issues.push(issue);
    referenceIssues.push(issue);
    return;
  }
  if (
    reference.kind === "playwright" &&
    !/^apps\/web\/e2e\/.+\.spec\.[cm]?[jt]s$/.test(reference.path)
  ) {
    const issue = `${capabilityId}: Playwright evidence is not a web E2E spec: ${reference.path}`;
    issues.push(issue);
    referenceIssues.push(issue);
  }
  if (
    reference.kind === "maestro" &&
    !/^apps\/mobile\/\.maestro\/.+\.ya?ml$/.test(reference.path)
  ) {
    const issue = `${capabilityId}: Maestro evidence is not a mobile flow: ${reference.path}`;
    issues.push(issue);
    referenceIssues.push(issue);
  }
  if (reference.identity && !referenceIdentities(reference, source).has(reference.identity)) {
    const issue = `${capabilityId}: stale ${platform} evidence identity "${reference.identity}" in ${reference.path}`;
    issues.push(issue);
    referenceIssues.push(issue);
  }
}

function intended(record, platform) {
  return record.policy === "both" || record.policy === `${platform}_only`;
}

function implementationComplete(record, platform) {
  return record[platform].implementation === "implemented";
}

function parityComplete(record, platform, runtimeReceipts = new Set()) {
  return (
    implementationComplete(record, platform) &&
    record[platform].evidenceStrength === "runtime" &&
    runtimeReceipts.has(`${record.id}:${platform}`)
  );
}

export function validateParity({
  apiCapabilityIds,
  directCiReferences,
  records,
  schema,
  exceptions = [],
  discoveredSurfaces = [],
  referenceSources = new Map(),
}) {
  const issues = [];
  const referenceIssues = [];
  const validRecords = [];
  const ids = new Set();
  const knownApiCapabilities = apiCapabilityIds ? new Set(apiCapabilityIds) : undefined;

  for (const input of records) {
    const result = schema.safeParse(input);
    const inputId =
      input && typeof input === "object" && typeof input.id === "string" ? input.id : "unknown";
    if (!result.success) {
      issues.push(
        ...result.error.issues.map(
          (issue) => `${inputId}: ${issue.path.join(".") || "record"}: ${issue.message}`,
        ),
      );
      continue;
    }
    const record = result.data;
    if (ids.has(record.id)) issues.push(`duplicate capability id: ${record.id}`);
    ids.add(record.id);
    validRecords.push(record);

    if (record.apiCapabilities?.length && knownApiCapabilities) {
      for (const capabilityId of record.apiCapabilities) {
        if (!knownApiCapabilities.has(capabilityId)) {
          issues.push(`${record.id}: stale API capability reference ${capabilityId}`);
        }
      }
      for (const capabilityId of new Set(
        record.apiCapabilities.filter((id, index) => record.apiCapabilities.indexOf(id) !== index),
      )) {
        issues.push(`${record.id}: duplicate API capability reference ${capabilityId}`);
      }
    }

    for (const platform of platforms) {
      const evidence = record[platform];
      for (const sourcePath of evidence.sources) {
        if (sourcePath.includes("*")) {
          issues.push(
            `${record.id}: ${platform} source must be literal, not a wildcard: ${sourcePath}`,
          );
        }
        if (referenceSources.has(sourcePath) && referenceSources.get(sourcePath) === undefined) {
          const issue = `${record.id}: ${platform} source does not exist: ${sourcePath}`;
          issues.push(issue);
          referenceIssues.push(issue);
        }
      }
      for (const reference of evidence.tests) {
        validateReference(
          reference,
          referenceSources,
          record.id,
          platform,
          issues,
          referenceIssues,
        );
      }
      if (
        evidence.evidenceStrength === "runtime" &&
        !evidence.tests.some((reference) => runtimeKinds.has(reference.kind))
      ) {
        issues.push(`${record.id}: ${platform} runtime strength has no runtime test reference`);
      }
    }
  }

  for (const platform of platforms) {
    const directReference = directCiReferences?.[platform];
    if (!directReference) continue;
    const owners = validRecords.filter((record) =>
      record[platform].tests.some(
        (reference) =>
          reference.kind === directReference.kind &&
          reference.path === directReference.path &&
          reference.identity === directReference.identity,
      ),
    );
    if (owners.length === 0) {
      issues.push(`${platform}: direct CI smoke has no atomic capability`);
    }
    for (const owner of owners) {
      if (owner[platform].evidenceStrength !== "runtime") {
        issues.push(
          `${owner.id}: direct ${platform} CI smoke is not classified as runtime evidence`,
        );
      }
    }
  }

  const exceptionPaths = new Set();
  for (const exception of exceptions) {
    if (
      !exception ||
      typeof exception.path !== "string" ||
      exception.path.includes("*") ||
      typeof exception.rationale !== "string" ||
      exception.rationale.trim().length < 20
    ) {
      issues.push("malformed discovered-surface exception");
      continue;
    }
    if (exceptionPaths.has(exception.path)) {
      issues.push(`duplicate discovered-surface exception: ${exception.path}`);
    }
    exceptionPaths.add(exception.path);
    if (!discoveredSurfaces.some((surface) => surface.path === exception.path)) {
      issues.push(`stale discovered-surface exception: ${exception.path}`);
    }
  }

  const unclassified = [];
  for (const surface of discoveredSurfaces) {
    const mappings = validRecords.filter((record) =>
      record[surface.platform].sources.includes(surface.path),
    );
    if (mappings.length === 0 && !exceptionPaths.has(surface.path)) {
      unclassified.push(surface.path);
      issues.push(`unclassified discovered surface: ${surface.path}`);
    }
    for (const record of mappings) {
      if (["missing", "intentional_absence"].includes(record[surface.platform].implementation)) {
        issues.push(
          `${record.id}: discovered ${surface.platform} surface conflicts with ${record[surface.platform].implementation}: ${surface.path}`,
        );
      }
    }
  }

  return {
    issues: [...new Set(issues)].sort(),
    records: validRecords,
    referenceIssues: [...new Set(referenceIssues)].sort(),
    unclassified: [...new Set(unclassified)].sort(),
  };
}

export function classifyParity(
  records,
  unclassified = [],
  referenceIssues = [],
  runtimeReceipts = new Set(),
) {
  const classification = {
    all: [...records].sort((left, right) => left.id.localeCompare(right.id)),
    bothImplementedProofMissing: [],
    implementationGaps: [],
    intentionalDifferences: [],
    mobileCompleteWebIncomplete: [],
    proofGaps: [],
    decisionPending: [],
    referenceIssues: [...referenceIssues].sort(),
    unclassified: [...unclassified].sort(),
    webCompleteMobileIncomplete: [],
  };
  for (const record of records) {
    const mobileImplemented = implementationComplete(record, "mobile");
    const webImplemented = implementationComplete(record, "web");
    const mobileComplete = parityComplete(record, "mobile", runtimeReceipts);
    const webComplete = parityComplete(record, "web", runtimeReceipts);
    if (mobileImplemented && intended(record, "web") && !webImplemented) {
      classification.mobileCompleteWebIncomplete.push(record);
    }
    if (webImplemented && intended(record, "mobile") && !mobileImplemented) {
      classification.webCompleteMobileIncomplete.push(record);
    }
    if (
      intended(record, "mobile") &&
      intended(record, "web") &&
      implementationComplete(record, "mobile") &&
      implementationComplete(record, "web") &&
      (!mobileComplete || !webComplete)
    ) {
      classification.bothImplementedProofMissing.push(record);
    }
    for (const platform of platforms) {
      if (!intended(record, platform)) continue;
      if (record[platform].status === "decision_pending") {
        classification.decisionPending.push({ platform, record });
      } else if (!implementationComplete(record, platform)) {
        classification.implementationGaps.push({ platform, record });
      }
      if (
        record[platform].status !== "decision_pending" &&
        implementationComplete(record, platform) &&
        !parityComplete(record, platform, runtimeReceipts)
      ) {
        classification.proofGaps.push({ platform, record });
      }
    }
    if (
      record.intentionalDifferences.length > 0 ||
      platforms.some((platform) => record[platform].implementation === "intentional_absence")
    ) {
      classification.intentionalDifferences.push(record);
    }
  }
  const byId = (left, right) => left.id.localeCompare(right.id);
  classification.bothImplementedProofMissing.sort(byId);
  classification.intentionalDifferences.sort(byId);
  classification.mobileCompleteWebIncomplete.sort(byId);
  classification.webCompleteMobileIncomplete.sort(byId);
  classification.implementationGaps.sort((left, right) =>
    `${left.record.id}:${left.platform}`.localeCompare(`${right.record.id}:${right.platform}`),
  );
  classification.proofGaps.sort((left, right) =>
    `${left.record.id}:${left.platform}`.localeCompare(`${right.record.id}:${right.platform}`),
  );
  classification.decisionPending.sort((left, right) =>
    `${left.record.id}:${left.platform}`.localeCompare(`${right.record.id}:${right.platform}`),
  );
  return classification;
}

function recordLines(records, describe = () => "") {
  return records.length === 0
    ? ["- (none)"]
    : records.map((record) => {
        const detail = describe(record);
        return `- ${record.id}: ${record.title}${detail ? ` — ${detail}` : ""}`;
      });
}

function gapText(evidence) {
  return evidence.missingSteps.map((gap) => `${gap.stepId}: ${gap.detail}`).join(" ");
}

export function formatParityReport(classification) {
  const declaredRuntimeCount = classification.all.reduce(
    (count, record) =>
      count +
      platforms.filter(
        (platform) => intended(record, platform) && record[platform].evidenceStrength === "runtime",
      )
        .length,
    0,
  );
  const requiredCount = classification.all.reduce(
    (count, record) => count + platforms.filter((platform) => intended(record, platform)).length,
    0,
  );
  const implementedCount = classification.all.reduce(
    (count, record) =>
      count +
      platforms.filter(
        (platform) => intended(record, platform) && implementationComplete(record, platform),
      ).length,
    0,
  );
  const lines = [
    "Atomic capability implementation",
    `- ${classification.all.length} registered capabilities; ${implementedCount}/${requiredCount} required platform entries are implemented.`,
    `- ${declaredRuntimeCount}/${requiredCount} required platform entries declare runtime evidence; successful execution receipts are not present in this report.`,
    "- Implementation summaries use implementation state only. Runtime proof gaps are reported separately.",
    "",
    "Mobile implemented, web implementation incomplete/missing",
    ...recordLines(classification.mobileCompleteWebIncomplete, (record) => gapText(record.web)),
    "",
    "Web implemented, mobile implementation incomplete/missing",
    ...recordLines(classification.webCompleteMobileIncomplete, (record) => gapText(record.mobile)),
    "",
    "Decision-pending required behavior",
    ...(classification.decisionPending.length === 0
      ? ["- (none)"]
      : classification.decisionPending.map(
          ({ platform, record }) => `- ${record.id} (${platform}): ${gapText(record[platform])}`,
        )),
    "",
    "Both implemented, but runtime proof missing/partial",
    ...recordLines(classification.bothImplementedProofMissing, (record) =>
      platforms
        .filter((platform) => record[platform].evidenceStrength !== "runtime")
        .map((platform) => `${platform}=${record[platform].evidenceStrength}`)
        .join(", "),
    ),
    "",
    "Runtime proof gaps",
    ...(classification.proofGaps.length === 0
      ? ["- (none)"]
      : classification.proofGaps.map(
          ({ platform, record }) =>
            `- ${record.id} (${platform}): ${record[platform].evidenceStrength} — ${gapText(record[platform])}`,
        )),
    "",
    "Intentional platform differences",
    ...recordLines(classification.intentionalDifferences, (record) =>
      [
        ...record.intentionalDifferences.map((item) => item.difference),
        ...platforms.flatMap((platform) =>
          record[platform].implementation === "intentional_absence"
            ? [`${platform}: ${gapText(record[platform])}`]
            : [],
        ),
      ].join(" "),
    ),
    "",
    "Unclassified/discovered surfaces",
    ...(classification.unclassified.length === 0
      ? ["- (none)"]
      : classification.unclassified.map((surface) => `- ${surface}`)),
    "",
    "Stale/missing evidence references",
    ...(classification.referenceIssues.length === 0
      ? ["- (none)"]
      : classification.referenceIssues.map((issue) => `- ${issue}`)),
    "",
    "Full capability matrix",
    ...classification.all.map((record) => {
      const entries = platforms.map((platform) => {
        const evidence = record[platform];
        const proof = intended(record, platform)
          ? evidence.status === "decision_pending"
            ? "decision-pending"
            : !implementationComplete(record, platform)
            ? "implementation-gap"
            : parityComplete(record, platform)
              ? "runtime-proven"
              : evidence.evidenceStrength === "runtime"
                ? "declared-runtime"
              : "proof-gap"
          : "not-required";
        return `${platform}=${evidence.implementation}/${evidence.evidenceStrength}/${proof}`;
      });
      const gaps = platforms.flatMap((platform) =>
        record[platform].missingSteps.length > 0
          ? [`${platform} gaps: ${gapText(record[platform])}`]
          : [],
      );
      return `- ${record.id}: ${entries.join("; ")}${gaps.length > 0 ? ` — ${gaps.join(" | ")}` : ""}`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}

export function parityExitCode({ classification, issues, proofStrict = false, strict = false }) {
  if (issues.length > 0) return 1;
  if (strict && (classification.implementationGaps.length > 0 || classification.decisionPending.length > 0)) return 1;
  if (proofStrict && classification.proofGaps.length > 0) return 1;
  return 0;
}

export function evaluateCompletion({ validation, records, journeyResults = [] }) {
  const structuralIssues = validation.issues;
  const implementation = classifyParity(validation.records);
  const implementationIssues = [
    ...implementation.implementationGaps.map(({ platform, record }) => `${record.id} (${platform}): implementation gap`),
    ...implementation.decisionPending.map(({ platform, record }) => `${record.id} (${platform}): decision pending`),
  ];
  const runtimeReceipts = new Set(
    journeyResults
      .filter((result) => result.status === "passed")
      .map((result) => `${result.capabilityId}:${result.platform}`),
  );
  const journeyIssues = journeyResults
    .filter((result) => result.status !== "passed")
    .map((result) => `${result.capabilityId} (${result.platform}): journey ${result.status}`);
  const proof = classifyParity(records, [], [], runtimeReceipts);
  const proofIssues = proof.proofGaps.map(({ platform, record }) => `${record.id} (${platform}): runtime proof gap`);
  return {
    ok: structuralIssues.length === 0 && implementationIssues.length === 0 && journeyIssues.length === 0 && proofIssues.length === 0,
    structuralIssues,
    implementationIssues,
    journeyIssues,
    proofIssues,
    runtimeReceipts,
  };
}

export async function loadReferenceSources(root, records) {
  const paths = new Set(
    records.flatMap((record) =>
      platforms.flatMap((platform) => [
        ...(record[platform]?.sources ?? []),
        ...(record[platform]?.tests ?? []).map((reference) => reference.path),
      ]),
    ),
  );
  return new Map(
    await Promise.all(
      [...paths]
        .sort()
        .map(async (referencePath) => [
          referencePath,
          await readFile(path.join(root, referencePath), "utf8").catch(() => undefined),
        ]),
    ),
  );
}
