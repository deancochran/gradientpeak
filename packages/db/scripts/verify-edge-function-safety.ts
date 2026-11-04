#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dbPackageRoot, repoRoot, supabaseCliRoot } from "./_helpers";

const retiredFunctionName = ["analyze", "activity", "file"].join("-");
const retiredFunctionAliases = [
  retiredFunctionName,
  ["analyze", "activity", "file"].join("_"),
  ["analyze", "Activity", "File"].join(""),
];
const retiredFunctionDirectory = resolve(supabaseCliRoot, "functions", retiredFunctionName);

export const hostedRetirementProcedurePath = "packages/db/scripts/retire-edge-function.ts";
export const retirementReferenceAllowlist = new Set([hostedRetirementProcedurePath]);

type ReferenceRule = {
  name: string;
  pattern: RegExp;
};

export type ForbiddenReference = {
  path: string;
  line: number;
  rule: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const escapedFunctionName = escapeRegExp(retiredFunctionName);
const referenceRules: ReferenceRule[] = [
  {
    name: "hosted function path",
    pattern: new RegExp(`functions/(?:v1/)?${escapedFunctionName}`, "i"),
  },
  {
    name: "Supabase client invocation",
    pattern: new RegExp(`functions\\s*\\.\\s*invoke\\s*\\([^)]*${escapedFunctionName}`, "i"),
  },
  {
    name: "Supabase function deploy",
    pattern: new RegExp(`functions\\s+deploy(?:[^\\n]*\\s)?${escapedFunctionName}`, "i"),
  },
  {
    name: "Supabase function delete",
    pattern: new RegExp(`functions\\s+delete(?:[^\\n]*\\s)?${escapedFunctionName}`, "i"),
  },
  {
    name: "retired function identifier",
    pattern: new RegExp(retiredFunctionAliases.map(escapeRegExp).join("|"), "i"),
  },
];

function isText(buffer: Buffer) {
  return !buffer.subarray(0, 8_000).includes(0);
}

export function getGitVisibleFiles(root: string): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root },
  );

  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((filePath) => resolve(root, filePath));
}

export function collectForbiddenReferences(
  filePaths: string[],
  root: string,
  allowlist = retirementReferenceAllowlist,
): ForbiddenReference[] {
  const references: ForbiddenReference[] = [];

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      continue;
    }

    const relativePath = relative(root, filePath).replaceAll("\\", "/");

    if (allowlist.has(relativePath)) {
      continue;
    }

    const buffer = readFileSync(filePath);

    if (!isText(buffer)) {
      continue;
    }

    for (const [lineIndex, line] of buffer.toString("utf8").split(/\r?\n/).entries()) {
      const matchedRule = referenceRules.find((rule) => rule.pattern.test(line));

      if (matchedRule) {
        references.push({
          path: relativePath,
          line: lineIndex + 1,
          rule: matchedRule.name,
        });
      }
    }
  }

  return references;
}

export function assertNoForbiddenReferences(
  filePaths: string[],
  root: string,
  allowlist = retirementReferenceAllowlist,
) {
  const references = collectForbiddenReferences(filePaths, root, allowlist);

  if (references.length > 0) {
    const details = references
      .map((reference) => `${reference.path}:${reference.line} (${reference.rule})`)
      .join("\n");
    throw new Error(
      `Retired Edge Function still has runtime, invocation, or deployment references:\n${details}`,
    );
  }
}

export function verifyEdgeFunctionSafety() {
  if (existsSync(retiredFunctionDirectory)) {
    throw new Error(
      `Retired Edge Function directory still exists: ${relative(dbPackageRoot, retiredFunctionDirectory)}`,
    );
  }

  assertNoForbiddenReferences(getGitVisibleFiles(repoRoot), repoRoot);
  console.log("Edge Function safety check passed: retired activity analysis has no references.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  verifyEdgeFunctionSafety();
}
