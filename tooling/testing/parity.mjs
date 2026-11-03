import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const platforms = ["web", "mobile"];

async function walk(directory, root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute, root)));
    else files.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return files;
}

export async function discoverUserFacingSurfaces(root) {
  const mobile = await walk(path.join(root, "apps/mobile/app"), root);
  const web = await walk(path.join(root, "apps/web/src/routes"), root);
  const webTree = await readFile(path.join(root, "apps/web/src/routeTree.gen.ts"), "utf8");
  const generated = new Set(
    [...webTree.matchAll(/from\s+["']\.\/routes\/([^"']+)["']/g)].map(
      (match) => `apps/web/src/routes/${match[1]}`,
    ),
  );
  return [
    ...mobile
      .filter(
        (file) =>
          /\.(?:ts|tsx)$/.test(file) &&
          !/(?:^|\/)__tests__\//.test(file) &&
          !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file),
      )
      .map((path) => ({ path, platform: "mobile" })),
    ...web
      .filter(
        (file) =>
          /\.(?:ts|tsx)$/.test(file) &&
          !/(?:^|\/)__tests__\//.test(file) &&
          !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file) &&
          !file.includes("/routes/api/") &&
          generated.has(file.replace(/\.(?:ts|tsx)$/, "")),
      )
      .map((path) => ({ path, platform: "web" })),
  ].sort((a, b) => a.path.localeCompare(b.path));
}

function validateRecord(record) {
  const issues = [];
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(record.id ?? "")) issues.push("invalid id");
  if (!Array.isArray(record.requiredSteps) || record.requiredSteps.length === 0)
    issues.push("missing required steps");
  if (!platforms.includes(record.policy?.replace(/_only$/, "")) && record.policy !== "both")
    issues.push("invalid policy");
  for (const platform of platforms) {
    const evidence = record[platform];
    if (!evidence) issues.push(`missing ${platform} evidence`);
    else if (!Array.isArray(evidence.sources) || !Array.isArray(evidence.tests))
      issues.push(`invalid ${platform} evidence`);
  }
  return issues;
}

function intended(record, platform) {
  return record.policy === "both" || record.policy === `${platform}_only`;
}

export async function loadReferenceSources(root, records) {
  const paths = new Set(
    records.flatMap((record) =>
      platforms.flatMap((platform) => [
        ...record[platform].sources,
        ...record[platform].tests.map((test) => test.path),
      ]),
    ),
  );
  return new Map(
    await Promise.all(
      [...paths].map(async (reference) => [
        reference,
        await readFile(path.join(root, reference), "utf8").catch(() => undefined),
      ]),
    ),
  );
}

export function validateParity({
  records,
  discoveredSurfaces = [],
  exceptions = [],
  referenceSources,
}) {
  const issues = [];
  const references = [];
  const ids = new Set();
  for (const record of records) {
    for (const issue of validateRecord(record)) issues.push(`${record.id}: ${issue}`);
    if (ids.has(record.id)) issues.push(`duplicate capability id: ${record.id}`);
    ids.add(record.id);
    for (const platform of platforms) {
      for (const source of record[platform].sources) {
        if (source.includes("*")) issues.push(`${record.id}: source must be literal: ${source}`);
        if (referenceSources.get(source) === undefined)
          references.push(`${record.id}: stale ${platform} source: ${source}`);
      }
      for (const test of record[platform].tests) {
        const content = referenceSources.get(test.path);
        if (content === undefined)
          references.push(`${record.id}: stale ${platform} test: ${test.path}`);
        else if (test.identity && !content.includes(test.identity))
          references.push(`${record.id}: stale ${platform} test identity: ${test.identity}`);
      }
    }
  }
  const excepted = new Set(exceptions.map((item) => item.path));
  const mapped = new Set(records.flatMap((record) => platforms.flatMap((p) => record[p].sources)));
  const unclassified = discoveredSurfaces
    .filter((surface) => !mapped.has(surface.path) && !excepted.has(surface.path))
    .map((surface) => surface.path);
  return {
    issues: [
      ...new Set([
        ...issues,
        ...references,
        ...unclassified.map((path) => `unclassified surface: ${path}`),
      ]),
    ].sort(),
    referenceIssues: [...new Set(references)].sort(),
    unclassified: [...new Set(unclassified)].sort(),
  };
}

export function classifyParity(records, referenceIssues = []) {
  const required = records.flatMap((record) =>
    platforms
      .filter((platform) => intended(record, platform))
      .map((platform) => ({ platform, record })),
  );
  const runtimeProofGaps = required.filter(
    ({ platform, record }) => record[platform].evidenceStrength !== "runtime",
  );
  return {
    implementationGaps: required.filter(
      ({ platform, record }) => record[platform].implementation !== "implemented",
    ),
    intentionalDifferences: records.filter((record) => record.intentionalDifferences.length > 0),
    records,
    referenceIssues,
    runtimeProofGaps,
  };
}

export function formatParityReport(classification) {
  const required = classification.records.reduce(
    (count, record) => count + platforms.filter((platform) => intended(record, platform)).length,
    0,
  );
  const runtime = required - classification.runtimeProofGaps.length;
  return [
    "Atomic web/mobile capability inventory",
    `- ${classification.records.length} atomic entries; ${runtime}/${required} have runtime proof receipts declared.`,
    "Runtime proof status",
    ...(classification.runtimeProofGaps.length
      ? classification.runtimeProofGaps.map(
          ({ record, platform }) => `- ${record.id} (${platform}): runtime proof missing`,
        )
      : ["- all required entries declare runtime proof"]),
    "Required implementation gaps",
    ...(classification.implementationGaps.length
      ? classification.implementationGaps.map(
          ({ record, platform }) => `- ${record.id} (${platform}): implementation missing`,
        )
      : ["- none"]),
    "Intentional platform differences",
    ...(classification.intentionalDifferences.length
      ? classification.intentionalDifferences.map(
          (record) =>
            `- ${record.id}: ${record.intentionalDifferences.map((item) => item.difference).join(" ")}`,
        )
      : ["- none"]),
    "Stale source/test references",
    ...(classification.referenceIssues.length
      ? classification.referenceIssues.map((issue) => `- ${issue}`)
      : ["- none"]),
    "",
  ].join("\n");
}
