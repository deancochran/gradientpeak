import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const scanRoots = ["apps/mobile", "apps/web"];
const sourceExtensions = new Set([".ts", ".tsx"]);

const knownExceptions = [
  {
    pathIncludes: "apps/mobile/app/(internal)/(standard)/route-upload.tsx",
    pattern: "<FormField",
    reason: "custom file picker composite",
  },
  {
    pathIncludes: "apps/web/src/components/login-form.tsx",
    pattern: "<FormField",
    reason: "password field has adjacent forgot-password link",
  },
  {
    pathIncludes: "apps/web/src/routes/_protected/settings.tsx",
    pattern: "<FormField",
    reason: "server-action/native FormData fields",
  },
  {
    pathIncludes: "apps/web/src/routes/_protected/messages.tsx",
    pattern: "<FormField",
    reason: "custom message composer",
  },
  {
    pathIncludes: "apps/mobile/components/plan/calendar/StepEditSheet.tsx",
    pattern: "<FormSelectField",
    reason: "large technical target-type option list",
  },
  {
    pathIncludes: "apps/mobile/components/ActivityPlan/StepEditorDialog.tsx",
    pattern: "<FormSelectField",
    reason: "large technical intensity-type option list",
  },
];

const checks = [
  {
    label: "Raw FormField",
    pattern: /<FormField\b/g,
    recommendation: "Use a shared Form* wrapper or document the composite exception.",
  },
  {
    label: "FormSelectField",
    pattern: /<FormSelectField\b/g,
    recommendation:
      "Use FormSegmentedSelectField for 2-5 fixed options; keep dropdowns for dynamic or large lists.",
  },
  {
    label: "Numeric FormTextField",
    pattern:
      /<FormTextField\b[^>]*(?:type="number"|keyboardType="numeric"|keyboardType="decimal-pad")/g,
    recommendation: "Prefer FormIntegerStepperField, FormBoundedNumberField, or FormNumberField.",
  },
  {
    label: "Raw numeric Input",
    pattern: /<Input\b[^>]*(?:type="number"|keyboardType="numeric"|keyboardType="decimal-pad")/g,
    recommendation: "Prefer a shared numeric form wrapper when this is inside a form.",
  },
  {
    label: "Raw date/time input",
    pattern: /<Input\b[^>]*type="(?:date|time|datetime-local)"/g,
    recommendation: "Prefer FormDateInputField, FormTimeInputField, or FormDateTimeField.",
  },
];

function walkFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = readdirSync(directory);
  const files = [];

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".turbo") {
      continue;
    }

    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }

    if (sourceExtensions.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

function isKnownException(relativePath, matchedText) {
  return knownExceptions.find(
    (exception) =>
      relativePath.includes(exception.pathIncludes) && matchedText.includes(exception.pattern),
  );
}

const findings = [];
const exceptions = [];

for (const scanRoot of scanRoots) {
  const absoluteRoot = path.join(repoRoot, scanRoot);

  for (const filePath of walkFiles(absoluteRoot)) {
    const relativePath = path.relative(repoRoot, filePath);
    const source = readFileSync(filePath, "utf8");

    for (const check of checks) {
      for (const match of source.matchAll(check.pattern)) {
        const matchedText = match[0];
        const line = lineNumberForIndex(source, match.index ?? 0);
        const exception = isKnownException(relativePath, matchedText);

        if (exception) {
          exceptions.push({ check, exception, line, relativePath });
          continue;
        }

        findings.push({ check, line, relativePath });
      }
    }
  }
}

console.log("Form field audit");
console.log("================");

if (findings.length === 0) {
  console.log("No review candidates found.");
} else {
  console.log(`Review candidates (${findings.length}):`);
  for (const finding of findings) {
    console.log(`- ${finding.relativePath}:${finding.line} [${finding.check.label}]`);
    console.log(`  ${finding.check.recommendation}`);
  }
}

if (exceptions.length > 0) {
  console.log("");
  console.log(`Known exceptions (${exceptions.length}):`);
  for (const exception of exceptions) {
    console.log(
      `- ${exception.relativePath}:${exception.line} [${exception.check.label}] ${exception.exception.reason}`,
    );
  }
}

console.log("");
console.log(
  "This audit is advisory and exits successfully. Use it during review, not as a hard gate.",
);
