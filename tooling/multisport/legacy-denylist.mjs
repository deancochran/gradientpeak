import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { scanProductionProcessActivityTypeCallers } from "./legacy-denylist-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const violations = [];

const forbiddenFiles = [
  "packages/api/src/application/activity-file-ingestion/persist-new-activity-file-import.ts",
  "packages/api/src/application/activity-file-ingestion/persist-existing-activity-file-enrichment.ts",
  "packages/core/activity-plan/v2.ts",
  "packages/core/activity-plan/legacy-parser.ts",
];
for (const path of forbiddenFiles) {
  if (existsSync(resolve(root, path))) violations.push(`${path}: deleted legacy file exists`);
}

const checks = [
  {
    path: "packages/api/src/application/activities/submit-activity.ts",
    patterns: [
      [/\bdurationSeconds\s*:/, "legacy activity duration transport field"],
      [/\bmovingSeconds\s*:/, "legacy activity moving transport field"],
      [/\bactivityType\s*:/, "legacy parent activity type transport field"],
      [/\bactivityFilePath\s*:/, "removed parent activity file path field"],
      [/\bactivityFileSize\s*:/, "removed parent activity file size field"],
      [/\bactivityFileType\s*:/, "removed parent activity file type field"],
      [/\bimportSource\s*:/, "removed parent import source field"],
      [/\bimportFileType\s*:/, "removed parent import file type field"],
      [/\bimportOriginalFileName\s*:/, "removed parent import original-name field"],
    ],
  },
  {
    path: "packages/api/src/routers/activity-files.ts",
    patterns: [[/activityType:\s*z\./, "legacy processActivityFile activityType input"]],
  },
  {
    path: "packages/db/src/schema/tables.ts",
    patterns: [
      [/\bactivity_file_path\b/, "deleted activity file path column"],
      [/\bactivity_file_size\b/, "deleted activity file size column"],
      [/\bmoving_seconds\b/, "deleted parent moving seconds column"],
      [/\bimport_original_file_name\b/, "deleted parent import metadata column"],
    ],
  },
];

for (const check of checks) {
  const content = readFileSync(resolve(root, check.path), "utf8");
  for (const [pattern, description] of check.patterns) {
    if (pattern.test(content)) violations.push(`${check.path}: ${description}`);
  }
}

const activityFilesSource = readFileSync(
  resolve(root, "packages/api/src/routers/activity-files.ts"),
  "utf8",
);
const parserBoundary = activityFilesSource.slice(
  activityFilesSource.indexOf("const blobLikeSchema"),
  activityFilesSource.indexOf("const getStreamsOutputSchema"),
);
if (parserBoundary.includes(".passthrough()")) {
  violations.push("packages/api/src/routers/activity-files.ts: permissive parser boundary");
}

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    if (
      name === "node_modules" ||
      name === ".output" ||
      name === "build" ||
      name === "dist" ||
      name === "migrations" ||
      name === "migrations-archive"
    )
      return [];
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx|js|mjs)$/.test(name)
        ? [path]
        : [];
  });
}

const broadPatterns = [
  [/\bparseLegacyActivityPlan\b/, "legacy plan parser"],
  [/\bactivityPlanV2\b/, "V2 activity plan symbol"],
  [/profiles\/\$\{[^}]+\}\/sha256/, "compatibility artifact storage key"],
];
for (const path of sourceFiles(resolve(root, "packages"))) {
  const content = readFileSync(path, "utf8");
  for (const [pattern, description] of broadPatterns) {
    if (pattern.test(content)) violations.push(`${path.slice(root.length + 1)}: ${description}`);
  }
}

for (const violation of scanProductionProcessActivityTypeCallers(root)) {
  violations.push(
    `${violation.path}:${violation.line}:${violation.column}: removed processActivityFile activityType transport field in caller`,
  );
}

if (violations.length) {
  console.error(
    `Multisport legacy denylist failed:\n${violations.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}
console.log("Multisport legacy denylist passed.");
