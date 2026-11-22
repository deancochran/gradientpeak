import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const STRUCTURE_BASELINE = "tooling/testing/structure-baseline.json";
const COMPONENTS_ROOT = "packages/ui/src/components";

function finding(component, rule, message, hard = false) {
  return { id: `ui-component:${component}:${rule}`, message, hard };
}

async function fileNames(directory) {
  try {
    return new Set(await readdir(directory));
  } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
}

function hasAny(files, names) {
  return names.some((name) => files.has(name));
}

async function markerIsEmptyFile(directory, marker) {
  try {
    const details = await lstat(path.join(directory, marker));
    return details.isFile() && details.size === 0;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function findStructureIssues(root) {
  const absoluteComponentsRoot = path.join(root, COMPONENTS_ROOT);
  let entries;
  try {
    entries = await readdir(absoluteComponentsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const findings = [];
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const directory of directories) {
    const component = directory.name;
    const relativeDirectory = `${COMPONENTS_ROOT}/${component}`;
    const absoluteDirectory = path.join(absoluteComponentsRoot, component);
    const files = await fileNames(absoluteDirectory);
    const webImplementation = hasAny(files, ["index.web.tsx", "index.web.ts"]);
    const nativeImplementation = hasAny(files, ["index.native.tsx", "index.native.ts"]);
    const webTest = hasAny(files, ["index.web.test.tsx", "index.web.test.ts"]);
    const nativeTest = hasAny(files, ["index.native.test.tsx", "index.native.test.ts"]);
    const webOnly = files.has(".web-only");
    const nativeOnly = files.has(".native-only");
    if (webOnly && !(await markerIsEmptyFile(absoluteDirectory, ".web-only"))) {
      findings.push(
        finding(
          component,
          "nonempty-web-only-marker",
          `${relativeDirectory}/.web-only must be an empty regular file.`,
          true,
        ),
      );
    }
    if (nativeOnly && !(await markerIsEmptyFile(absoluteDirectory, ".native-only"))) {
      findings.push(
        finding(
          component,
          "nonempty-native-only-marker",
          `${relativeDirectory}/.native-only must be an empty regular file.`,
          true,
        ),
      );
    }

    if (webImplementation && nativeImplementation) {
      if (webOnly) {
        findings.push(
          finding(
            component,
            "paired-with-web-only-marker",
            `${relativeDirectory} has paired web/native implementations, so ${relativeDirectory}/.web-only is contradictory and must be removed.`,
            true,
          ),
        );
      }
      if (nativeOnly) {
        findings.push(
          finding(
            component,
            "paired-with-native-only-marker",
            `${relativeDirectory} has paired web/native implementations, so ${relativeDirectory}/.native-only is contradictory and must be removed.`,
            true,
          ),
        );
      }
      if (!webTest) {
        findings.push(
          finding(
            component,
            "missing-web-test",
            `${relativeDirectory} has paired implementations but is missing ${relativeDirectory}/index.web.test.tsx.`,
          ),
        );
      }
      if (!nativeTest) {
        findings.push(
          finding(
            component,
            "missing-native-test",
            `${relativeDirectory} has paired implementations but is missing ${relativeDirectory}/index.native.test.tsx.`,
          ),
        );
      }
    } else if (webImplementation) {
      if (nativeOnly) {
        findings.push(
          finding(
            component,
            "web-with-native-only-marker",
            `${relativeDirectory} has only index.web.tsx, so ${relativeDirectory}/.native-only is contradictory; use ${relativeDirectory}/.web-only.`,
            true,
          ),
        );
      }
      if (!webOnly) {
        findings.push(
          finding(
            component,
            "missing-web-only-marker",
            `${relativeDirectory} has only index.web.tsx and is missing ${relativeDirectory}/.web-only.`,
          ),
        );
      }
    } else if (nativeImplementation) {
      if (webOnly) {
        findings.push(
          finding(
            component,
            "native-with-web-only-marker",
            `${relativeDirectory} has only index.native.tsx, so ${relativeDirectory}/.web-only is contradictory; use ${relativeDirectory}/.native-only.`,
            true,
          ),
        );
      }
      if (!nativeOnly) {
        findings.push(
          finding(
            component,
            "missing-native-only-marker",
            `${relativeDirectory} has only index.native.tsx and is missing ${relativeDirectory}/.native-only.`,
          ),
        );
      }
    } else {
      if (webOnly) {
        findings.push(
          finding(
            component,
            "web-only-marker-without-implementation",
            `${relativeDirectory}/.web-only is contradictory because ${relativeDirectory}/index.web.tsx does not exist.`,
            true,
          ),
        );
      }
      if (nativeOnly) {
        findings.push(
          finding(
            component,
            "native-only-marker-without-implementation",
            `${relativeDirectory}/.native-only is contradictory because ${relativeDirectory}/index.native.tsx does not exist.`,
            true,
          ),
        );
      }
    }
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

export async function readStructureBaseline(root) {
  const baselinePath = path.join(root, STRUCTURE_BASELINE);
  let baseline;
  try {
    baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Required structure baseline is missing: ${STRUCTURE_BASELINE}`);
    }
    throw new Error(`Invalid structure baseline JSON in ${STRUCTURE_BASELINE}: ${error.message}`);
  }
  const validShape =
    baseline !== null &&
    typeof baseline === "object" &&
    !Array.isArray(baseline) &&
    baseline.version === 1 &&
    Array.isArray(baseline.findings) &&
    baseline.findings.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(baseline.findings).size === baseline.findings.length &&
    baseline.findings.every((id, index) => index === 0 || baseline.findings[index - 1] < id);
  if (!validShape) {
    throw new Error(
      `Invalid structure baseline shape in ${STRUCTURE_BASELINE}; expected version 1 with unique, sorted, nonempty string finding IDs.`,
    );
  }
  return baseline;
}

export function evaluateStructure(findings, baseline) {
  const baselineIds = new Set(baseline.findings ?? []);
  const currentIds = new Set(findings.map((entry) => entry.id));
  const hardFindings = findings.filter((entry) => entry.hard);
  const newFindings = findings.filter((entry) => !entry.hard && !baselineIds.has(entry.id));
  const resolvedFindings = [...baselineIds].filter((id) => !currentIds.has(id)).sort();
  return {
    ok: hardFindings.length === 0 && newFindings.length === 0 && resolvedFindings.length === 0,
    findings,
    hardFindings,
    newFindings,
    resolvedFindings,
  };
}

export async function checkStructure(root) {
  const findings = await findStructureIssues(root);
  const baseline = await readStructureBaseline(root);
  return evaluateStructure(findings, baseline);
}

export async function writeStructureBaseline(root) {
  const existingBaseline = await readStructureBaseline(root);
  const findings = await findStructureIssues(root);
  const hardFindings = findings.filter((entry) => entry.hard);
  if (hardFindings.length) {
    throw new Error("Refusing to baseline contradictory UI structure markers.");
  }
  const result = evaluateStructure(findings, existingBaseline);
  if (result.newFindings.length) {
    const ids = result.newFindings.map((entry) => entry.id).join(", ");
    throw new Error(`Refusing to baseline new UI structure debt: ${ids}`);
  }
  const baseline = {
    version: 1,
    findings: findings.map((entry) => entry.id),
  };
  const baselinePath = path.join(root, STRUCTURE_BASELINE);
  await mkdir(path.dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}

export function formatStructureResult(result) {
  const lines = [
    "UI test structure",
    `Current findings: ${result.findings.length}`,
    `New findings: ${result.newFindings.length}`,
    `Contradictions: ${result.hardFindings.length}`,
    `Resolved baseline findings: ${result.resolvedFindings.length}`,
  ];
  for (const entry of [...result.hardFindings, ...result.newFindings]) {
    lines.push(`  [${entry.id}] ${entry.message}`);
  }
  if (result.resolvedFindings.length) {
    lines.push("Resolved debt (refresh the baseline to preserve the ratchet):");
    for (const id of result.resolvedFindings) lines.push(`  ${id}`);
  }
  return `${lines.join("\n")}\n`;
}
