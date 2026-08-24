import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const maestroRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(maestroRoot, "../../../../");
const coveragePath = resolve(maestroRoot, "variation-coverage.json");
const fixtureExamplePath = resolve(maestroRoot, "fixtures.env.example");
const policyPath = resolve(maestroRoot, "fixture-contracts/policy.json");
const artifactsRoot = resolve(maestroRoot, "artifacts/fixture-contracts");

const runIdPattern = /^[a-z0-9][a-z0-9._-]{7,63}$/;
const leaseIdPattern = /^lease-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function validateRunId(value) {
  if (typeof value !== "string" || !runIdPattern.test(value)) {
    throw new Error(
      "Run ID must be 8-64 lowercase letters, numbers, dots, underscores, or hyphens, starting with a letter or number",
    );
  }
  return value;
}

export function validateLeaseId(value) {
  if (typeof value !== "string" || !leaseIdPattern.test(value)) {
    throw new Error("Lease ID must use the generated lease-UUID format");
  }
  return value;
}

export function createInvocation(explicitRunId) {
  const runId = explicitRunId
    ? validateRunId(explicitRunId)
    : `run-${randomUUID()}`;
  return Object.freeze({ runId, leaseId: `lease-${randomUUID()}` });
}

export function bindInvocation(scenario, invocation) {
  const runId = validateRunId(invocation?.runId);
  validateLeaseId(invocation?.leaseId);
  return {
    ...scenario,
    runId,
    leaseId: invocation.leaseId,
    fixtureInstance: `${scenario.fixtureInstanceBase}@${runId}@${invocation.leaseId}`,
    reset: {
      ...scenario.reset,
      ownershipSelector: {
        ...scenario.reset.ownershipSelector,
        runId,
        leaseId: invocation.leaseId,
        fixtureInstance: `${scenario.fixtureInstanceBase}@${runId}@${invocation.leaseId}`,
      },
    },
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export const policy = readJson(policyPath);
const provisionReceiptMaxAgeMs = policy.service.provisionReceiptMaxAgeMs ?? 15 * 60 * 1000;

export const suitePolicies = Object.freeze({
  "smoke-expected-pass": {
    includeTags: ["smoke-expected-pass"],
    excludeTags: ["intentional-red", "manual", "hardware"],
    config: "config.smoke-expected-pass.yaml",
  },
  "primary-expected-pass": {
    includeTags: ["variation"],
    excludeTags: ["intentional-red", "integrations", "document-picker", "manual", "hardware"],
    config: "config.primary-expected-pass.yaml",
  },
  "intentional-red": {
    includeTags: ["intentional-red"],
    excludeTags: [],
    config: "config.intentional-red.yaml",
  },
  "provider-system-picker": {
    includeTags: ["integrations", "document-picker"],
    excludeTags: ["intentional-red", "manual", "hardware"],
    config: "config.provider-system-picker.yaml",
  },
  "hardware-manual": {
    includeTags: [],
    excludeTags: ["intentional-red"],
    config: "config.hardware-manual.yaml",
  },
});

export function parseEnvText(text, source = "environment") {
  const values = new Map();
  const errors = [];
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) {
      errors.push(`${source}:${index + 1}: expected NAME=value`);
      continue;
    }
    const name = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      errors.push(`${source}:${index + 1}: invalid variable name ${name}`);
      continue;
    }
    if (values.has(name)) {
      errors.push(`${source}:${index + 1}: duplicate variable ${name}`);
      continue;
    }
    values.set(name, rawValue.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2"));
  }
  return { values, errors };
}

export function loadEnvFile(path) {
  if (!existsSync(path))
    return { values: new Map(), errors: [`Environment file not found: ${path}`] };
  return parseEnvText(readFileSync(path, "utf8"), path);
}

function extractVariables(text) {
  const names = new Set();
  for (const match of text.matchAll(/\$\{([A-Z][A-Z0-9_]*)\b/g)) names.add(match[1]);
  return [...names].sort();
}

function extractTemplateVariables(text) {
  const names = new Set();
  for (const match of text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\b/g)) names.add(match[1]);
  return [...names].sort();
}

function nestedFlowPaths(flow, text) {
  const parent = dirname(resolve(maestroRoot, flow));
  const paths = new Set();
  for (const match of text.matchAll(/(?:\brunFlow:\s*|\bfile:\s*)["']?([^\s"'{}]+\.ya?ml)\b/g)) {
    const absolute = resolve(parent, match[1]);
    const rel = relative(maestroRoot, absolute);
    if (!rel.startsWith(`..${sep}`) && rel !== ".." && existsSync(absolute)) paths.add(rel);
  }
  return [...paths];
}

function externalVariablesForFlow(flow, text, seen = new Set()) {
  if (seen.has(flow)) return [];
  seen.add(flow);
  const variables = new Set(extractVariables(text));
  const suppliedParameters = new Set(
    [...text.matchAll(/\b([A-Z][A-Z0-9_]*):\s*/g)].map((match) => match[1]),
  );
  for (const nestedFlow of nestedFlowPaths(flow, text)) {
    const nestedText = readFileSync(resolve(maestroRoot, nestedFlow), "utf8");
    for (const name of externalVariablesForFlow(nestedFlow, nestedText, seen)) {
      if (!suppliedParameters.has(name)) variables.add(name);
    }
  }
  for (const name of suppliedParameters) {
    if (!text.includes(`\${${name}}`)) variables.delete(name);
  }
  return [...variables].sort();
}

function expandedFlowText(flow, text, seen = new Set()) {
  if (seen.has(flow)) return "";
  seen.add(flow);
  return [
    text,
    ...nestedFlowPaths(flow, text).map((nestedFlow) => {
      const nestedText = readFileSync(resolve(maestroRoot, nestedFlow), "utf8");
      return expandedFlowText(nestedFlow, nestedText, seen);
    }),
  ].join("\n");
}

function headerSourceIdentity(text) {
  const header = text.split(/^---\s*$/m, 1)[0];
  return header.match(/\bsourceIdentity:\s*["']?([^\s,"'}\]]+)/)?.[1] ?? null;
}

function argumentDeclarations(text) {
  return [...text.matchAll(/^# @arg ([A-Za-z_][A-Za-z0-9_]*) (\S+) required$/gm)].map(
    ([, name, type]) => ({ name, type }),
  );
}

function nestedFlowCallBlocks(flow, text) {
  const parent = dirname(resolve(maestroRoot, flow));
  const lines = text.split(/\r?\n/);
  const calls = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*-\s*runFlow:/.test(lines[index])) continue;
    const baseIndent = lines[index].match(/^\s*/)[0].length;
    const block = [lines[index]];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      const indent = next.match(/^\s*/)[0].length;
      if (next.trim() && indent <= baseIndent && /^\s*-/.test(next)) break;
      block.push(next);
      index += 1;
    }
    const blockText = block.join("\n");
    const file = blockText.match(/(?:runFlow:\s*|\bfile:\s*)["']?([^\s"'{},]+\.ya?ml)/)?.[1];
    if (!file) continue;
    const absolute = resolve(parent, file);
    const rel = relative(maestroRoot, absolute);
    if (rel.startsWith(`..${sep}`) || rel === ".." || !existsSync(absolute)) continue;
    const env = new Set();
    const inlineStart = blockText.search(/\benv:\s*\{/);
    const inlineEnv = inlineStart >= 0 ? blockText.slice(inlineStart).replace(/^.*?\{/, "") : "";
    for (const match of inlineEnv.matchAll(/(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
      env.add(match[1]);
    }
    const envLine = block.findIndex((line) => /^\s*env:\s*$/.test(line));
    if (envLine >= 0) {
      const envIndent = block[envLine].match(/^\s*/)[0].length;
      for (const line of block.slice(envLine + 1)) {
        if (line.trim() && line.match(/^\s*/)[0].length <= envIndent) break;
        const name = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/)?.[1];
        if (name) env.add(name);
      }
    }
    calls.push({ flow: rel.replaceAll("\\", "/"), env });
  }
  return calls;
}

function matchesAny(name, patterns) {
  return patterns.some((pattern) => new RegExp(pattern).test(name));
}

function sourceSlug(source) {
  return source
    .replace(/\.ya?ml$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function variationFromPath(path) {
  const match = path.match(/variation-([ab])\.ya?ml$/);
  if (!match) throw new Error(`Primary variation has no A/B suffix: ${path}`);
  return match[1];
}

function domainFromVariation(path) {
  const match = path.match(/flows\/variations\/by-source\/([^/]+)\//);
  if (!match) throw new Error(`Cannot determine fixture domain from ${path}`);
  return match[1];
}

function domainFromTags(text, flow) {
  const tags = text.match(/\btags:\s*\[([^\]]+)]/)?.[1] ?? "";
  const domain = tags
    .split(",")
    .map((tag) => tag.trim())
    .find((tag) => policy.domains[tag]);
  if (!domain) throw new Error(`Cannot determine fixture domain from tags in ${flow}`);
  return domain;
}

function statusFromFlow(text) {
  return /tags:\s*\[[^\]]*\bintentional-red\b/.test(text) ? "intentional-red" : "supported";
}

const lifecyclePolicies = new Set([
  "clean",
  "authenticated-clean",
  "preserve-session",
  "persistence-relaunch",
  "system-ui",
  "hardware-manual",
  "recording-safe",
]);

function lifecyclePolicyFromFlow({ domain, sourceIdentity, text, pickerPrerequisites }) {
  const declared = text.match(/\blifecyclePolicy:\s*([a-z-]+)/)?.[1];
  if (declared) return { policy: declared, source: "flow.properties.lifecyclePolicy" };
  if (domain === "recording" || /(?:^|\/)record(?:ing)?[_/-]/.test(sourceIdentity)) {
    return { policy: "recording-safe", source: "compiled-source-policy" };
  }
  if (/preserve_state_relaunch\.yaml|\brelaunch\b/.test(text)) {
    return { policy: "persistence-relaunch", source: "compiled-source-policy" };
  }
  if (pickerPrerequisites.length > 0 || /storybook|system-picker|document-picker/.test(text)) {
    return { policy: "system-ui", source: "compiled-source-policy" };
  }
  if (/ensure_signed_out\.yaml|bootstrap\.yaml|clean_app_launch_signed_out\.yaml/.test(text)) {
    return { policy: "clean", source: "compiled-source-policy" };
  }
  return { policy: "authenticated-clean", source: "compiled-source-policy" };
}

function executionClassFor({ domain, sourceIdentity, variation, status, pickerPrerequisites }) {
  if (status === "intentional-red") return "intentional-red";
  if (status === "manual" || status === "unsupported") return "hardware-manual";
  if (domain === "integrations" || pickerPrerequisites.length > 0) {
    return "provider-system-picker";
  }
  if (variation === "baseline" && sourceIdentity.startsWith("smoke/")) {
    return "smoke-expected-pass";
  }
  return "primary-expected-pass";
}

function junitIdFromFlow(text) {
  return text.match(/\bjunitId:\s*([^\s,}\]]+)/)?.[1] ?? null;
}

function actorDeclarations(requiredVariables) {
  const actors = [];
  for (const emailVariable of requiredVariables.filter((name) => /EMAIL/.test(name))) {
    const suffix = emailVariable.match(/(_[AB])$/)?.[1] ?? "";
    const stem = emailVariable.replace(/EMAIL(?:_VARIATION)?(?:_[AB])?$/, "");
    const passwordVariable = requiredVariables.find(
      (name) => name === `${stem}PASS${suffix}` || name === `${stem}PASSWORD${suffix}`,
    );
    actors.push({
      role: actors.length === 0 ? "primary" : `actor-${actors.length + 1}`,
      emailVariable,
      passwordVariable: passwordVariable ?? null,
    });
  }
  return actors;
}

function ownedRecordDeclarations(requiredVariables, contractId, mutates) {
  if (!mutates) return [];
  const records = requiredVariables
    .filter((name) => matchesAny(name, policy.uuidNamePatterns))
    .map((variable) => ({ kind: "declared", variable }));
  records.push({ kind: "generated", ownershipLabel: contractId });
  return records;
}

function pickerDeclarations(requiredVariables) {
  return requiredVariables
    .filter((name) => matchesAny(name, policy.pickerNamePatterns))
    .map((displayNameVariable) => ({
      kind: "device-document-picker",
      displayNameVariable,
      hostPathVariable: `${displayNameVariable}_HOST_PATH`,
      check:
        "Host file is validated when hostPathVariable is supplied; device presence remains a runtime prerequisite.",
    }));
}

function commandUsesSignal(text, signal) {
  const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^\\s*-\\s*tapOn:(?:[^\\n]*${escaped}[^\\n]*|(?:\\n\\s+[^\\n]*){0,4}\\n\\s+[^\\n]*${escaped})`,
    "m",
  ).test(text);
}

function ownershipRequirements({ actors, ownedRecords, mutates }) {
  const actorCategories = actors.map((actor) => ({ category: actor.role, count: 1 }));
  const recordCategories = ownedRecords.map((record) => ({
    category:
      record.kind === "declared"
        ? `declared:${record.variable}`
        : `generated:${record.ownershipLabel}`,
    count: 1,
  }));
  return {
    mutates,
    actors: actorCategories,
    records: recordCategories,
    actorCount: actorCategories.reduce((total, entry) => total + entry.count, 0),
    recordCount: recordCategories.reduce((total, entry) => total + entry.count, 0),
  };
}

function compileDeclaration({ domain, flow, sourceIdentity, variation, text, status }) {
  const headerId = junitIdFromFlow(text);
  const id =
    headerId ?? `${policy.contractIdPrefix}.${domain}.${sourceSlug(sourceIdentity)}.${variation}`;
  const allVariables = externalVariablesForFlow(flow, text);
  const requiredVariables = allVariables.filter((name) => !policy.runtimeVariables.includes(name));
  const contractText = expandedFlowText(flow, text);
  const mutates = policy.mutationSignals.some((signal) => commandUsesSignal(contractText, signal));
  const destructive = policy.destructiveSignals.some((signal) => contractText.includes(signal));
  const actors = actorDeclarations(requiredVariables);
  const ownedRecords = ownedRecordDeclarations(requiredVariables, id, mutates);
  const ownership = ownershipRequirements({ actors, ownedRecords, mutates });
  const pickerPrerequisites = pickerDeclarations(requiredVariables);
  const lifecycle = lifecyclePolicyFromFlow({
    domain,
    sourceIdentity,
    text,
    pickerPrerequisites,
  });
  const contractFingerprint = createHash("sha256").update(contractText).digest("hex");
  return {
    id,
    idSource: headerId ? "flow.properties.junitId" : "compiled-baseline-link",
    revision: policy.revision,
    domain,
    flow,
    sourceIdentity,
    variation,
    fixtureInstanceBase: `${id}@${policy.revision}`,
    fixtureInstance: `${id}@${policy.revision}@<run-id>@<lease-id>`,
    headerSourceIdentity: headerSourceIdentity(text),
    contractFingerprint,
    status,
    lifecycle: {
      ...lifecycle,
      destructiveAppResetAllowed: lifecycle.policy !== "preserve-session",
      recordingGuardRequired:
        lifecycle.policy === "recording-safe" || lifecycle.policy === "authenticated-clean",
      postcondition:
        lifecycle.policy === "clean"
          ? "sign-in-screen"
          : lifecycle.policy === "persistence-relaunch"
            ? "caller-declared-hydrated-boundary"
            : lifecycle.policy === "system-ui" || lifecycle.policy === "hardware-manual"
              ? "flow-declared-boundary"
              : "home-screen",
    },
    executionClass: executionClassFor({
      domain,
      sourceIdentity,
      variation,
      status,
      pickerPrerequisites,
    }),
    actors,
    requiredVariables,
    secretVariables: requiredVariables.filter((name) =>
      matchesAny(name, policy.secretNamePatterns),
    ),
    ownedRecords,
    ownershipRequirements: ownership,
    preconditions: [
      "Every required variable is present and non-blank.",
      "The fixture service confirms this exact contract revision and instance.",
      ...(pickerPrerequisites.length > 0
        ? ["Each named picker file is already available to the device document picker."]
        : []),
    ],
    mutationScope: mutates
      ? { kind: "scenario-instance", owner: id, destructive }
      : { kind: "none", owner: id, destructive: false },
    reset: mutates
      ? {
          required: true,
          operation: "restore-snapshot-and-delete-owned-records",
          ownershipSelector: { contractId: id },
          exactRecordVariables: ownedRecords
            .filter((record) => record.kind === "declared")
            .map((record) => record.variable),
          generatedOwnershipLabel: id,
        }
      : {
          required: false,
          operation: "verify-no-owned-mutation",
          ownershipSelector: { contractId: id },
          exactRecordVariables: [],
          generatedOwnershipLabel: null,
        },
    pickerPrerequisites,
    classification: {
      supported: status === "supported",
      manual: status === "manual",
      intentionalRed: status === "intentional-red",
      unsupported: status === "unsupported",
    },
  };
}

export function compileManifest() {
  const coverage = readJson(coveragePath);
  const domains = Object.fromEntries(
    Object.entries(policy.domains).map(([id, value]) => [id, { ...value, scenarios: [] }]),
  );
  const primary = [];
  const baseline = [];
  const extras = [];
  const unsupported = [];
  const sourceDomain = new Map();

  for (const entry of coverage.coverage) {
    if (
      !Array.isArray(entry.sources) ||
      entry.sources.length !== 1 ||
      entry.variations.length !== 2
    ) {
      throw new Error(
        "Each primary coverage row must declare one source and exactly two variations",
      );
    }
    const sourceIdentity = entry.sources[0];
    for (const flow of entry.variations) {
      const absoluteFlow = resolve(maestroRoot, flow);
      const text = readFileSync(absoluteFlow, "utf8");
      const domain = domainFromVariation(flow);
      if (!domains[domain]) throw new Error(`Unknown fixture domain ${domain} in ${flow}`);
      sourceDomain.set(sourceIdentity, domain);
      const scenario = compileDeclaration({
        domain,
        flow,
        sourceIdentity,
        variation: variationFromPath(flow),
        text,
        status: statusFromFlow(text),
      });
      primary.push(scenario);
      domains[domain].scenarios.push(scenario.id);
    }
  }

  for (const [sourceIdentity, domain] of [...sourceDomain].sort(([a], [b]) => a.localeCompare(b))) {
    const flow = `flows/${sourceIdentity}`;
    const absoluteFlow = resolve(maestroRoot, flow);
    if (!existsSync(absoluteFlow)) throw new Error(`Covered source flow does not exist: ${flow}`);
    const text = readFileSync(absoluteFlow, "utf8");
    const status = sourceIdentity.startsWith("smoke/") ? "supported" : "manual";
    const scenario = compileDeclaration({
      domain,
      flow,
      sourceIdentity,
      variation: "baseline",
      text,
      status,
    });
    baseline.push(scenario);
    domains[domain].scenarios.push(scenario.id);
  }

  for (const absoluteFlow of collectFiles(resolve(maestroRoot, "flows/journeys"))) {
    const flow = relative(maestroRoot, absoluteFlow).replaceAll("\\", "/");
    if (!/\/variations\//.test(flow)) continue;
    const text = readFileSync(absoluteFlow, "utf8");
    const domain = domainFromTags(text, flow);
    const pairTag = text.match(/baseline-source-(?:pair-)?([ab])\b/)?.[1];
    const scenario = compileDeclaration({
      domain,
      flow,
      sourceIdentity: flow.replace(/^flows\//, ""),
      variation: pairTag ?? "baseline",
      text,
      status: statusFromFlow(text) === "intentional-red" ? "intentional-red" : "manual",
    });
    extras.push(scenario);
    domains[domain].scenarios.push(scenario.id);
  }

  for (const entry of coverage.unsupportedIdentities ?? []) {
    const flow = `flows/${entry.source}`;
    const text = readFileSync(resolve(maestroRoot, flow), "utf8");
    const domain = entry.source.split("/")[1];
    if (!domains[domain]) throw new Error(`Unknown unsupported fixture domain ${domain}`);
    const scenario = {
      ...compileDeclaration({
        domain,
        flow,
        sourceIdentity: entry.source,
        variation: "baseline",
        text,
        status: "unsupported",
      }),
      unsupportedReason: entry.reason,
    };
    unsupported.push(scenario);
    domains[domain].scenarios.push(scenario.id);
  }

  primary.sort((a, b) => a.flow.localeCompare(b.flow));
  baseline.sort((a, b) => a.flow.localeCompare(b.flow));
  extras.sort((a, b) => a.flow.localeCompare(b.flow));
  unsupported.sort((a, b) => a.flow.localeCompare(b.flow));
  for (const domain of Object.values(domains)) domain.scenarios.sort();

  return {
    schemaVersion: 1,
    revision: policy.revision,
    generatedFrom: ["variation-coverage.json", "fixtures.env.example", "flows/**/*.yaml"],
    evidence: {
      kind: "static-fixture-specification",
      isRuntimeProof: false,
      note: "Declarations and expected-pass tags do not prove that fixtures were provisioned or a device flow ran.",
    },
    domains,
    scenarios: [...primary, ...baseline, ...extras, ...unsupported],
    primary,
    baseline,
    extras,
    unsupported,
  };
}

export function fixtureVariableRegistry(manifest = compileManifest()) {
  const example = parseEnvText(readFileSync(fixtureExamplePath, "utf8"), fixtureExamplePath);
  const owners = new Map([...example.values.keys()].map((name) => [name, new Set()]));
  for (const scenario of manifest.scenarios) {
    for (const name of scenario.requiredVariables) {
      if (owners.has(name)) owners.get(name).add(scenario.domain);
    }
  }
  const variables = [...example.values].map(([name, defaultValue]) => ({
    name,
    defaultValue: matchesAny(name, policy.secretNamePatterns) ? null : defaultValue,
    secret: matchesAny(name, policy.secretNamePatterns),
    owners: [...(owners.get(name) ?? [])].sort(),
    compatibilityOnly: (owners.get(name)?.size ?? 0) === 0,
  }));
  return { variables, parseErrors: example.errors };
}

function collectFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return collectFiles(child);
    return /\.ya?ml$/.test(entry.name) ? [child] : [];
  });
}

function collectEnvExamples(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return collectEnvExamples(child);
    return entry.name.endsWith(".env.example") ? [child] : [];
  });
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isUuidVariable(name) {
  return matchesAny(name, policy.uuidNamePatterns) && name !== "LOCAL_PROVIDER_ID";
}

export function validateStatic(manifest = compileManifest()) {
  const errors = [];
  const warnings = [];
  const registry = fixtureVariableRegistry(manifest);
  errors.push(...registry.parseErrors);
  const recognized = new Set(registry.variables.map((entry) => entry.name));
  const runtime = new Set(policy.runtimeVariables);
  const ids = new Set();

  if (manifest.primary.length !== 194)
    errors.push(`Expected 194 primary variations, found ${manifest.primary.length}`);
  const pairs = new Map();
  for (const scenario of manifest.primary) {
    if (ids.has(scenario.id)) errors.push(`Duplicate fixture contract ID ${scenario.id}`);
    ids.add(scenario.id);
    if (scenario.idSource !== "flow.properties.junitId") {
      errors.push(
        `${scenario.flow}: primary fixture contract ID must be integrated as properties.junitId`,
      );
    }
    if (!scenario.headerSourceIdentity) {
      errors.push(`${scenario.flow}: primary header is missing properties.sourceIdentity`);
    } else if (scenario.headerSourceIdentity !== scenario.sourceIdentity) {
      errors.push(
        `${scenario.flow}: header sourceIdentity ${scenario.headerSourceIdentity} does not match coverage mapping ${scenario.sourceIdentity}`,
      );
    }
    if (!policy.allowedStatuses.includes(scenario.status)) {
      errors.push(`${scenario.flow}: unsupported fixture status ${scenario.status}`);
    }
    if (!lifecyclePolicies.has(scenario.lifecycle.policy)) {
      errors.push(`${scenario.flow}: missing or invalid lifecycle policy`);
    }
    if (!scenario.contractFingerprint) {
      errors.push(`${scenario.flow}: missing lifecycle contract fingerprint`);
    }
    const pair = pairs.get(scenario.sourceIdentity) ?? new Set();
    pair.add(scenario.variation);
    pairs.set(scenario.sourceIdentity, pair);
    if (scenario.mutationScope.destructive && !scenario.reset.required) {
      errors.push(`${scenario.id}: destructive flow has no reset contract`);
    }
    if (
      scenario.mutationScope.kind !== "none" &&
      scenario.reset.ownershipSelector.contractId !== scenario.id
    ) {
      errors.push(`${scenario.id}: reset ownership selector does not match contract`);
    }
    if (scenario.ownershipRequirements.mutates) {
      if (scenario.ownershipRequirements.actorCount < 1) {
        errors.push(`${scenario.id}: mutating scenario has no owned actor requirement`);
      }
      if (scenario.ownershipRequirements.recordCount < 1) {
        errors.push(`${scenario.id}: mutating scenario has no owned record requirement`);
      }
    }
    for (const name of scenario.requiredVariables) {
      if (!recognized.has(name))
        errors.push(`${scenario.flow}: unrecognized fixture variable ${name}`);
    }
  }
  for (const scenario of manifest.scenarios.filter((entry) => !manifest.primary.includes(entry))) {
    if (ids.has(scenario.id)) errors.push(`Duplicate fixture contract ID ${scenario.id}`);
    ids.add(scenario.id);
    if (!policy.allowedStatuses.includes(scenario.status)) {
      errors.push(`${scenario.flow}: unsupported fixture status ${scenario.status}`);
    }
    if (!lifecyclePolicies.has(scenario.lifecycle.policy)) {
      errors.push(`${scenario.flow}: missing or invalid lifecycle policy`);
    }
    if (scenario.mutationScope.destructive && !scenario.reset.required) {
      errors.push(`${scenario.id}: destructive flow has no reset contract`);
    }
    for (const name of scenario.requiredVariables) {
      if (!recognized.has(name))
        errors.push(`${scenario.flow}: unrecognized fixture variable ${name}`);
    }
  }
  if (pairs.size !== 97) errors.push(`Expected 97 source identities, found ${pairs.size}`);
  for (const [source, variations] of pairs) {
    if (variations.size !== 2 || !variations.has("a") || !variations.has("b")) {
      errors.push(`${source}: fixture linkage must contain distinct A and B instances`);
    }
  }

  for (const flow of collectFiles(resolve(maestroRoot, "flows"))) {
    const text = readFileSync(flow, "utf8");
    const relativeFlow = relative(maestroRoot, flow).replaceAll("\\", "/");
    const localParameters = new Set(
      [...text.matchAll(/^# @arg ([A-Z][A-Z0-9_]*)\s+/gm)].map((match) => match[1]),
    );
    if (/optional:\s*true/.test(text) && relativeFlow !== "flows/reusable/handle_transient_system_ui.yaml") {
      errors.push(`${relativeFlow}: optional commands are reserved for transient system/Expo UI`);
    }
    if (
      /clearState:\s*false/.test(text) &&
      ![
        "flows/reusable/preserve_state_relaunch.yaml",
        "flows/reusable/refuse_destructive_reset_while_recording.yaml",
      ].includes(relativeFlow)
    ) {
      errors.push(`${relativeFlow}: preserve-state launch must use preserve_state_relaunch.yaml`);
    }
    for (const name of extractVariables(text)) {
      if (!recognized.has(name) && !runtime.has(name) && !localParameters.has(name)) {
        errors.push(`${relative(maestroRoot, flow)}: unrecognized variable ${name}`);
      }
    }
  }

  errors.push(...validateNestedFlowArguments().errors);

  for (const examplePath of collectEnvExamples(maestroRoot)) {
    const example = parseEnvText(readFileSync(examplePath, "utf8"), examplePath);
    errors.push(...example.errors);
    for (const [name, value] of example.values) {
      if (value && matchesAny(name, policy.secretNamePatterns)) {
        errors.push(
          `${relative(maestroRoot, examplePath)}: tracked secret variable ${name} must be blank`,
        );
      }
    }
  }

  for (const variable of registry.variables.filter((entry) => entry.compatibilityOnly)) {
    warnings.push(`${variable.name}: retained only for flat fixtures.env compatibility`);
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
    counts: {
      domains: Object.keys(manifest.domains).length,
      sourceIdentities: pairs.size,
      primaryVariations: manifest.primary.length,
      lifecyclePolicies: manifest.primary.filter((entry) => lifecyclePolicies.has(entry.lifecycle.policy)).length,
      baselineFlows: manifest.baseline.length,
      extraDomainFlows: manifest.extras.length,
      unsupportedFlows: manifest.unsupported.length,
      expectedPass: manifest.primary.filter((entry) => entry.status === "supported").length,
      intentionalRed: manifest.primary.filter((entry) => entry.status === "intentional-red").length,
      runtimeReceipts: 0,
    },
  };
}

export function validateNestedFlowArguments({ flowTexts } = {}) {
  const errors = [];
  const inherited = new Set(policy.inheritedFlowVariables ?? []);
  const entries = flowTexts
    ? [...flowTexts]
    : collectFiles(resolve(maestroRoot, "flows")).map((path) => [
        relative(maestroRoot, path).replaceAll("\\", "/"),
        readFileSync(path, "utf8"),
      ]);
  const texts = new Map(entries);
  for (const [caller, callerText] of texts) {
    for (const call of nestedFlowCallBlocks(caller, callerText)) {
      const targetText = texts.get(call.flow);
      if (targetText === undefined) continue;
      const used = new Set(extractTemplateVariables(targetText));
      const inferred = new Set([...used].filter((name) => !inherited.has(name)));
      const declared = argumentDeclarations(targetText);
      const declaredNames = new Set(declared.map((entry) => entry.name));
      for (const name of inferred) {
        if (!declaredNames.has(name)) {
          errors.push(`${call.flow}: nested argument ${name} must have an explicit # @arg contract`);
        }
      }
      for (const name of declaredNames) {
        if (!used.has(name)) {
          errors.push(`${call.flow}: declared nested argument ${name} is not used directly`);
        }
        if (!inherited.has(name) && !call.env.has(name)) {
          errors.push(`${caller} -> ${call.flow}: missing required runFlow.env argument ${name}`);
        }
      }
      for (const name of call.env) {
        if (!declaredNames.has(name) && !inherited.has(name)) {
          errors.push(`${caller} -> ${call.flow}: passes undeclared runFlow.env argument ${name}`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() };
}

export function findScenario(selector, manifest = compileManifest()) {
  const normalized = selector.replaceAll("\\", "/").replace(/^\.maestro\//, "");
  const matches = manifest.scenarios.filter(
    (scenario) =>
      scenario.id === selector || scenario.flow === normalized || scenario.flow === selector,
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No fixture contract for ${selector}`
        : `Ambiguous fixture contract selector ${selector}`,
    );
  }
  return matches[0];
}

export function validateSuiteEligibility(scenario, requestedSuite = scenario.executionClass) {
  const suite = suitePolicies[requestedSuite];
  const reasons = [];
  if (!suite) reasons.push(`Unknown lifecycle suite ${requestedSuite}`);
  if (scenario.executionClass !== requestedSuite) {
    reasons.push(
      `${scenario.id} is classified ${scenario.executionClass}, not ${requestedSuite}`,
    );
  }
  if (scenario.status === "unsupported") reasons.push(`${scenario.id} is unsupported`);
  return { ok: reasons.length === 0, suite, reasons };
}

export function lifecycleRunPlan(scenario, requestedSuite = scenario.executionClass) {
  const eligibility = validateSuiteEligibility(scenario, requestedSuite);
  return {
    scenario: scenario.id,
    suite: requestedSuite,
    eligible: eligibility.ok,
    reasons: eligibility.reasons,
    steps: [
      "provision-owned-fixture",
      "verify-fresh-ready-receipt",
      "start-maestro-for-one-flow",
      "reset-owned-fixture-in-finally",
    ],
    parallel: false,
    note: "One receipt owns one flow. Parallel lanes require separate fixture instances and devices.",
  };
}

export async function executeOwnedRun({ provision, verifyReceipt, runMaestro, reset }) {
  let ownership;
  let primaryError;
  try {
    ownership = await provision();
    await verifyReceipt(ownership);
    return await runMaestro(ownership);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (ownership) {
      try {
        await reset(ownership);
      } catch (resetError) {
        if (primaryError) {
          throw new AggregateError(
            [primaryError, resetError],
            "Flow failed and exact fixture reset also failed",
          );
        }
        throw resetError;
      }
    }
  }
}

export function mergeEnvironment(fileValues, environment = process.env) {
  const values = new Map(fileValues);
  for (const name of values.keys()) {
    if (environment[name] !== undefined) values.set(name, environment[name]);
  }
  for (const [name, value] of Object.entries(environment)) {
    if (name.endsWith("_HOST_PATH") && value !== undefined) values.set(name, value);
  }
  return values;
}

export function validateEnvironment(scenario, values, manifest = compileManifest()) {
  const errors = [];
  const registry = fixtureVariableRegistry(manifest);
  const recognized = new Set(registry.variables.map((entry) => entry.name));
  for (const picker of manifest.scenarios.flatMap((entry) => entry.pickerPrerequisites)) {
    recognized.add(picker.hostPathVariable);
  }
  for (const name of values.keys()) {
    if (!recognized.has(name)) errors.push(`Unrecognized fixture variable ${name}`);
  }
  for (const name of scenario.requiredVariables) {
    if (!values.get(name)?.trim())
      errors.push(`Required fixture variable ${name} is blank or missing`);
  }
  for (const [name, value] of values) {
    if (!value) continue;
    if (matchesAny(name, policy.dateNamePatterns) && !isValidDate(value)) {
      errors.push(`${name} must be a real YYYY-MM-DD date`);
    }
    if (isUuidVariable(name) && !isValidUuid(value))
      errors.push(`${name} must be an RFC 4122 UUID`);
    if (name.endsWith("_HOST_PATH")) {
      if (!isAbsolute(value)) errors.push(`${name} must be an absolute path`);
      else if (!existsSync(value) || !statSync(value).isFile())
        errors.push(`${name} must name an existing file`);
    }
  }
  const ab = new Map();
  for (const [name, value] of values) {
    const match = name.match(/^(.*)_([AB])$/);
    if (!match || !value || matchesAny(name, policy.secretNamePatterns)) continue;
    const pair = ab.get(match[1]) ?? {};
    pair[match[2].toLowerCase()] = value;
    ab.set(match[1], pair);
  }
  for (const [prefix, pair] of ab) {
    if (pair.a !== undefined && pair.b !== undefined && pair.a === pair.b) {
      errors.push(`${prefix}_A and ${prefix}_B collide; A/B fixture values must differ`);
    }
  }
  for (const picker of scenario.pickerPrerequisites) {
    const displayName = values.get(picker.displayNameVariable);
    const hostPath = values.get(picker.hostPathVariable);
    if (displayName && /[/\\]/.test(displayName)) {
      errors.push(`${picker.displayNameVariable} must be a picker display name, not a path`);
    }
    if (displayName && hostPath && basename(hostPath) !== displayName) {
      errors.push(`${picker.hostPathVariable} basename must equal ${picker.displayNameVariable}`);
    }
  }
  if (scenario.status === "unsupported")
    errors.push(`${scenario.id} is unsupported and cannot be provisioned`);
  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() };
}

export function validateTarget(rawUrl, enabled) {
  if (enabled !== "1") {
    throw new Error(`${policy.service.enableVariable}=1 is required for fixture mutation`);
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${policy.service.urlVariable} must be a valid loopback URL`);
  }
  if (url.protocol !== "http:") throw new Error("Fixture service must use local HTTP");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!policy.service.allowedHosts.includes(hostname)) {
    throw new Error(`Fixture service host ${url.hostname} is not loopback/local`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "Fixture service URL must not contain credentials, query parameters, or a fragment",
    );
  }
  if (url.pathname !== "/") throw new Error("Fixture service URL must be an origin without a path");
  return url;
}

function safeIdentifier(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:@/-]{1,200}$/.test(value)) {
    throw new Error(`Fixture service returned an invalid ${label}`);
  }
  return value;
}

async function requestJson(fetchImpl, url, path, options = {}) {
  const requestUrl = new URL(path, url);
  let response;
  try {
    response = await fetchImpl(requestUrl, {
      ...options,
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error("Local fixture service is unavailable");
  }
  let responseUrl;
  try {
    responseUrl = new URL(response.url);
  } catch {
    throw new Error("Local fixture service response did not expose a verifiable final URL");
  }
  if (response.redirected || responseUrl.origin !== url.origin || responseUrl.href !== requestUrl.href) {
    throw new Error("Local fixture service response escaped the validated loopback endpoint");
  }
  if (response.status === 409) {
    throw new Error("Local fixture service rejected a conflicting active run lease");
  }
  if (!response.ok) throw new Error(`Local fixture service returned HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error("Local fixture service returned invalid JSON");
  }
}

function expandedCategories(requirements) {
  return requirements.flatMap(({ category, count }) => Array.from({ length: count }, () => category));
}

function validateInventory(inventory, requirements, label = "provision") {
  if (!inventory || !Array.isArray(inventory.actors) || !Array.isArray(inventory.records)) {
    throw new Error(`Fixture service ${label} inventory is missing actors or records`);
  }
  const normalize = (entries, kind) =>
    entries.map((entry) => ({
      category: safeIdentifier(entry?.category, `${label} ${kind} category`),
      id: safeIdentifier(entry?.id, `${label} ${kind} ID`),
    }));
  const actors = normalize(inventory.actors, "actor");
  const records = normalize(inventory.records, "record");
  const expectedActors = expandedCategories(requirements.actors).sort();
  const expectedRecords = expandedCategories(requirements.records).sort();
  if (actors.map((entry) => entry.category).sort().join("\0") !== expectedActors.join("\0")) {
    throw new Error(`Fixture service ${label} actor inventory is incomplete or has extra categories`);
  }
  if (records.map((entry) => entry.category).sort().join("\0") !== expectedRecords.join("\0")) {
    throw new Error(`Fixture service ${label} record inventory is incomplete or has extra categories`);
  }
  const ids = [...actors, ...records].map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Fixture service ${label} inventory IDs must be unique`);
  }
  if (requirements.mutates && (actors.length === 0 || records.length === 0)) {
    throw new Error(`Fixture service ${label} inventory must own actors and records for mutation`);
  }
  return { actors, records };
}

function sameInventory(left, right) {
  const serialize = (inventory) =>
    [...inventory.actors.map((entry) => `actor\0${entry.category}\0${entry.id}`),
      ...inventory.records.map((entry) => `record\0${entry.category}\0${entry.id}`)]
      .sort()
      .join("\n");
  return serialize(left) === serialize(right);
}

export async function provisionWithService({ scenario, target, fetchImpl = fetch }) {
  const health = await requestJson(fetchImpl, target, policy.service.healthPath);
  if (health.protocol !== policy.service.protocol || health.environment !== "local") {
    throw new Error("Fixture service did not attest the required local protocol");
  }
  const result = await requestJson(fetchImpl, target, policy.service.provisionPath, {
    method: "POST",
    body: JSON.stringify({
      protocol: policy.service.protocol,
      contractId: scenario.id,
      revision: scenario.revision,
      runId: scenario.runId,
      leaseId: scenario.leaseId,
      fixtureInstance: scenario.fixtureInstance,
      mutationScope: scenario.mutationScope,
      ownershipRequirements: scenario.ownershipRequirements,
      reset: scenario.reset,
    }),
  });
  if (
    result.status !== "READY" ||
    result.contractId !== scenario.id ||
    result.revision !== scenario.revision ||
    result.runId !== scenario.runId ||
    result.leaseId !== scenario.leaseId ||
    result.fixtureInstance !== scenario.fixtureInstance
  ) {
    throw new Error("Fixture service did not confirm the exact run lease and contract revision as READY");
  }
  const inventory = validateInventory(result.inventory, scenario.ownershipRequirements);
  const ownershipToken = safeIdentifier(result.ownershipToken, "ownership token");
  return {
    inventory,
    actorIds: inventory.actors.map((entry) => entry.id),
    recordIds: inventory.records.map((entry) => entry.id),
    ownershipToken,
  };
}

export async function resetWithService({ state, target, fetchImpl = fetch }) {
  const exactInventory = validateInventory(
    state.inventory,
    state.ownershipRequirements,
    "owned state",
  );
  const result = await requestJson(fetchImpl, target, policy.service.resetPath, {
    method: "POST",
    body: JSON.stringify({
      protocol: policy.service.protocol,
      contractId: state.contractId,
      revision: state.revision,
      runId: state.runId,
      leaseId: state.leaseId,
      fixtureInstance: state.fixtureInstance,
      ownershipToken: state.ownershipToken,
      exactInventory,
    }),
  });
  if (
    result.status !== "CLEAN" ||
    result.contractId !== state.contractId ||
    result.revision !== state.revision ||
    result.runId !== state.runId ||
    result.leaseId !== state.leaseId ||
    result.fixtureInstance !== state.fixtureInstance ||
    result.ownershipToken !== state.ownershipToken
  ) {
    throw new Error("Fixture service did not confirm exact cleanup");
  }
  const affectedInventory = validateInventory(
    result.affectedInventory,
    state.ownershipRequirements,
    "cleanup",
  );
  if (!sameInventory(affectedInventory, exactInventory)) {
    throw new Error("Fixture cleanup inventory differs from the exact provisioned ownership set");
  }
  return {
    affectedInventory,
    affectedActorIds: affectedInventory.actors.map((entry) => entry.id),
    affectedRecordIds: affectedInventory.records.map((entry) => entry.id),
  };
}

function gitValue(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

export function gitIdentity(environment = process.env) {
  const dirtyResult = spawnSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    commit: gitValue(["rev-parse", "HEAD"]),
    base: environment.MAESTRO_FIXTURE_BASE_REF
      ? gitValue(["rev-parse", environment.MAESTRO_FIXTURE_BASE_REF])
      : gitValue(["merge-base", "HEAD", "origin/dev"]),
    branch: gitValue(["branch", "--show-current"]),
    dirty: dirtyResult.status === 0 ? dirtyResult.stdout.trim().length > 0 : null,
  };
}

function applicationIdentity(environment) {
  return {
    device: environment.MAESTRO_DEVICE_ID ?? environment.MAESTRO_DEVICE_UDID ?? null,
    platform: environment.MAESTRO_PLATFORM ?? null,
    appId: environment.MAESTRO_APP_ID ?? "com.deancochran.gradientpeak.dev",
    scheme: environment.MAESTRO_APP_SCHEME ?? "gradientpeak-dev",
  };
}

export function makeReceipt({
  scenario,
  kind,
  provisionStatus,
  provisionDetail,
  cleanupStatus = "NOT_ATTEMPTED",
  cleanupDetail = "Cleanup has not been attempted.",
  actorIds = [],
  recordIds = [],
  inventory = { actors: [], records: [] },
  runtimeStatus = "NOT_RUN",
  maestroEvidencePath = null,
  environment = process.env,
  now = new Date(),
  sourceIdentity = gitIdentity(environment),
}) {
  if (!scenario.runId || !scenario.leaseId || !scenario.fixtureInstance) {
    throw new Error("Receipt scenario must be bound to a run and lease");
  }
  if (provisionStatus === "READY") {
    const validatedInventory = validateInventory(
      inventory,
      scenario.ownershipRequirements,
      "receipt",
    );
    if (
      validatedInventory.actors.map((entry) => entry.id).join("\0") !== actorIds.join("\0") ||
      validatedInventory.records.map((entry) => entry.id).join("\0") !== recordIds.join("\0")
    ) {
      throw new Error("Receipt ID lists must exactly match its categorized ownership inventory");
    }
  }
  const timestamp = now.toISOString();
  return {
    schemaVersion: 2,
    receiptId: randomUUID(),
    createdAt: timestamp,
    invocation: { runId: scenario.runId, leaseId: scenario.leaseId },
    evidence: { kind, isRuntimeProof: runtimeStatus !== "NOT_RUN" },
    source: {
      flow: scenario.flow,
      sourceIdentity: scenario.sourceIdentity,
      variation: scenario.variation,
      ...sourceIdentity,
    },
    fixture: {
      contractId: scenario.id,
      revision: scenario.revision,
      instance: scenario.fixtureInstance,
      contractFingerprint: scenario.contractFingerprint,
      status: scenario.status,
      actorIds,
      recordIds,
      inventory,
    },
    application: applicationIdentity(environment),
    provision: {
      status: provisionStatus,
      at: provisionStatus === "NOT_ATTEMPTED" ? null : timestamp,
      detail: provisionDetail,
    },
    runtime: { status: runtimeStatus, maestroEvidencePath },
    cleanup: {
      status: cleanupStatus,
      at: cleanupStatus === "NOT_ATTEMPTED" ? null : timestamp,
      detail: cleanupDetail,
    },
  };
}

function safeArtifactName(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function statePath(scenario) {
  if (!scenario.runId || !scenario.leaseId) {
    throw new Error("State path requires a run-bound scenario");
  }
  return resolve(
    artifactsRoot,
    "state",
    safeArtifactName(scenario.runId),
    safeArtifactName(scenario.leaseId),
    `${safeArtifactName(scenario.id)}.json`,
  );
}

export function writeState(scenario, state) {
  const path = statePath(scenario);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function readState(scenario) {
  const path = statePath(scenario);
  if (!existsSync(path)) return null;
  return readJson(path);
}

export function provisionStateDisposition({
  scenario,
  state,
  now = new Date(),
  maxAgeMs = provisionReceiptMaxAgeMs,
} = {}) {
  const reasons = [];
  if (!state) return { status: "BLOCKED", reasons: [`No provision receipt exists for ${scenario.id}`] };
  if (state.status !== "READY") reasons.push(`Provision state is ${state.status}, not READY`);
  if (
    state.contractId !== scenario.id ||
    state.revision !== scenario.revision ||
    state.fixtureInstance !== scenario.fixtureInstance ||
    state.runId !== scenario.runId ||
    state.leaseId !== scenario.leaseId
  ) {
    reasons.push("Provision state does not match the exact run lease and fixture contract revision");
  }
  if (state.contractFingerprint !== scenario.contractFingerprint) {
    reasons.push("Provision receipt is stale for the current flow and nested lifecycle files");
  }
  try {
    const inventory = validateInventory(
      state.inventory,
      scenario.ownershipRequirements,
      "provision state",
    );
    if (
      inventory.actors.map((entry) => entry.id).join("\0") !== (state.actorIds ?? []).join("\0") ||
      inventory.records.map((entry) => entry.id).join("\0") !== (state.recordIds ?? []).join("\0")
    ) {
      reasons.push("Provision state ID lists do not match its categorized ownership inventory");
    }
  } catch (error) {
    reasons.push(`Provision ownership inventory is invalid: ${error.message}`);
  }
  const provisionedAt = Date.parse(state.provisionedAt ?? "");
  if (!Number.isFinite(provisionedAt)) reasons.push("Provision receipt has no valid provisionedAt time");
  else if (now.valueOf() - provisionedAt > maxAgeMs || provisionedAt - now.valueOf() > 60_000) {
    reasons.push(`Provision receipt is stale (maximum age ${maxAgeMs}ms)`);
  }
  if (!state.provisionReceiptId || !state.provisionReceiptPath) {
    reasons.push("Provision state does not reference a durable READY receipt");
  } else {
    let receipt;
    try {
      const path = assertOwnedPath(state.provisionReceiptPath);
      const expectedDirectory = resolve(
        artifactsRoot,
        "receipts",
        safeArtifactName(scenario.runId),
        safeArtifactName(scenario.leaseId),
      );
      const pathWithinLease = relative(expectedDirectory, path);
      if (
        pathWithinLease.startsWith(`..${sep}`) ||
        pathWithinLease === ".." ||
        isAbsolute(pathWithinLease)
      ) {
        reasons.push("Provision READY receipt path is outside the matching run lease");
      }
      if (!existsSync(path)) reasons.push("Provision READY receipt file is missing");
      else receipt = readJson(path);
    } catch (error) {
      reasons.push(`Provision READY receipt is invalid: ${error.message}`);
    }
    if (receipt) {
      if (receipt.receiptId !== state.provisionReceiptId) reasons.push("Provision receipt ID mismatch");
      if (receipt.provision?.status !== "READY") reasons.push("Provision receipt is not READY");
      if (
        receipt.fixture?.contractId !== scenario.id ||
        receipt.fixture?.contractFingerprint !== scenario.contractFingerprint ||
        receipt.invocation?.runId !== scenario.runId ||
        receipt.invocation?.leaseId !== scenario.leaseId ||
        receipt.fixture?.instance !== scenario.fixtureInstance
      ) {
        reasons.push("Provision receipt does not match the current run lease and lifecycle contract");
      }
      if (receipt.fixture?.inventory && state.inventory) {
        try {
          if (!sameInventory(receipt.fixture.inventory, state.inventory)) {
            reasons.push("Provision receipt inventory does not match the owned state");
          }
        } catch {
          reasons.push("Provision receipt inventory is invalid");
        }
      } else {
        reasons.push("Provision receipt is missing categorized ownership inventory");
      }
    }
  }
  return { status: reasons.length === 0 ? "READY" : "BLOCKED", reasons };
}

export function writeReceipt(receipt) {
  const runId = validateRunId(receipt?.invocation?.runId);
  if (!leaseIdPattern.test(receipt?.invocation?.leaseId ?? "")) {
    throw new Error("Receipt lease ID is invalid");
  }
  const directory = resolve(
    artifactsRoot,
    "receipts",
    safeArtifactName(runId),
    safeArtifactName(receipt.invocation.leaseId),
  );
  mkdirSync(directory, { recursive: true });
  const path = resolve(
    directory,
    `${receipt.createdAt.replace(/[:.]/g, "-")}-${receipt.receiptId}.json`,
  );
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function preflightDisposition({ scenario, values, state, manifest = compileManifest() }) {
  const validation = validateEnvironment(scenario, values, manifest);
  const reasons = [...validation.errors];
  if (scenario.status === "manual")
    reasons.push(`${scenario.id} is manual and requires explicit operator selection`);
  reasons.push(...provisionStateDisposition({ scenario, state }).reasons);
  return {
    status: reasons.length === 0 ? "READY" : "BLOCKED",
    classification: scenario.status === "intentional-red" ? "INTENTIONAL_RED" : "EXPECTED_PASS",
    reasons,
  };
}

function collectJsonFiles(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return collectJsonFiles(child);
    return entry.name.endsWith(".json") ? [child] : [];
  });
}

export function readReceiptsForRun(runId) {
  const validated = validateRunId(runId);
  const directory = resolve(artifactsRoot, "receipts", safeArtifactName(validated));
  return collectJsonFiles(directory).flatMap((path) => {
    try {
      return [{ path, receipt: readJson(path) }];
    } catch {
      return [{ path, receipt: null }];
    }
  });
}

export function runtimeReceiptDisposition({ scenario, runId, receiptEntries }) {
  validateRunId(runId);
  const relevant = receiptEntries.filter(
    ({ receipt }) =>
      receipt?.evidence?.kind === "maestro-runtime" && receipt?.fixture?.contractId === scenario.id,
  );
  if (relevant.length === 0) {
    return { status: "NOT_RUN", reason: "No runtime receipt exists for this run ID." };
  }
  const valid = relevant.filter(({ receipt }) => {
    if (
      receipt.schemaVersion !== 2 ||
      receipt.evidence?.kind !== "maestro-runtime" ||
      receipt.evidence?.isRuntimeProof !== true ||
      !["PASSED", "FAILED"].includes(receipt.runtime?.status) ||
      receipt.invocation?.runId !== runId ||
      !leaseIdPattern.test(receipt.invocation?.leaseId ?? "") ||
      receipt.fixture?.revision !== scenario.revision ||
      receipt.fixture?.contractFingerprint !== scenario.contractFingerprint
    ) {
      return false;
    }
    const bound = bindInvocation(scenario, receipt.invocation);
    if (receipt.fixture?.instance !== bound.fixtureInstance) return false;
    try {
      const inventory = validateInventory(
        receipt.fixture?.inventory,
        scenario.ownershipRequirements,
        "runtime receipt",
      );
      if (
        inventory.actors.map((entry) => entry.id).join("\0") !==
          (receipt.fixture?.actorIds ?? []).join("\0") ||
        inventory.records.map((entry) => entry.id).join("\0") !==
          (receipt.fixture?.recordIds ?? []).join("\0")
      ) {
        return false;
      }
    } catch {
      return false;
    }
    const evidencePath = receipt.runtime?.maestroEvidencePath;
    return (
      typeof evidencePath === "string" &&
      evidencePath.includes(`/${runId}/${receipt.invocation.leaseId}`)
    );
  });
  if (valid.length === 0) {
    return {
      status: "UNKNOWN",
      reason: "Receipts exist, but none match this run ID, fixture revision, lease, and fingerprint.",
    };
  }
  valid.sort(
    (left, right) => Date.parse(right.receipt.createdAt ?? "") - Date.parse(left.receipt.createdAt ?? ""),
  );
  return { status: valid[0].receipt.runtime.status, reason: "Validated scoped runtime receipt." };
}

export function readRunState(scenario, runId, leaseId) {
  const directory = resolve(artifactsRoot, "state", safeArtifactName(validateRunId(runId)));
  const states = collectJsonFiles(directory).flatMap((path) => {
    try {
      const state = readJson(path);
      return state.contractId === scenario.id &&
        state.status === "READY" &&
        (!leaseId || state.leaseId === leaseId)
        ? [state]
        : [];
    } catch {
      return [];
    }
  });
  if (states.length > 1) {
    throw new Error(`Multiple active leases exist for ${scenario.id} and run ${runId}; refusing ambiguous ownership`);
  }
  return states[0] ?? null;
}

export function summarize({
  manifest = compileManifest(),
  values = new Map(),
  includeState = true,
  runId = createInvocation().runId,
  receiptEntries = readReceiptsForRun(runId),
} = {}) {
  const rows = manifest.primary.map((scenario) => {
    const state = includeState ? readRunState(scenario, runId) : null;
    const boundScenario = state ? bindInvocation(scenario, state) : bindInvocation(scenario, createInvocation(runId));
    const disposition = preflightDisposition({ scenario: boundScenario, values, state, manifest });
    const runtime = runtimeReceiptDisposition({ scenario, runId, receiptEntries });
    return {
      id: scenario.id,
      flow: scenario.flow,
      status: disposition.status,
      classification: disposition.classification,
      runtimeStatus: runtime.status,
      runtimeReason: runtime.reason,
    };
  });
  const runtimePassed = rows.filter((row) => row.runtimeStatus === "PASSED").length;
  const runtimeFailed = rows.filter((row) => row.runtimeStatus === "FAILED").length;
  const runtimeNotRun = rows.filter((row) => row.runtimeStatus === "NOT_RUN").length;
  const runtimeUnknownReceipts = rows.filter((row) => row.runtimeStatus === "UNKNOWN").length;
  return {
    runId,
    total: rows.length,
    ready: rows.filter((row) => row.status === "READY").length,
    blocked: rows.filter((row) => row.status === "BLOCKED").length,
    expectedPass: rows.filter((row) => row.classification === "EXPECTED_PASS").length,
    intentionalRed: rows.filter((row) => row.classification === "INTENTIONAL_RED").length,
    runtimeStatus:
      runtimeNotRun > 0 || runtimeUnknownReceipts > 0 ? "UNKNOWN" : "KNOWN",
    runtimePassed,
    runtimeFailed,
    runtimeUnknown: runtimeNotRun + runtimeUnknownReceipts,
    runtimeNotRun,
    runtimeInvalidOrMismatched: runtimeUnknownReceipts,
    note:
      runtimePassed + runtimeFailed === 0
        ? "Runtime: UNKNOWN / NOT_RUN. No validated Maestro runtime receipts match this run ID and fixture revision."
        : "Runtime counts come only from validated Maestro receipts matching this run ID, lease, fixture revision, and fingerprint.",
    rows,
  };
}

export function assertOwnedPath(path) {
  const resolved = resolve(path);
  const rel = relative(maestroRoot, resolved);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error("Artifact path must remain inside apps/mobile/.maestro");
  }
  return resolved;
}
