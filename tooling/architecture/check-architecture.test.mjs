import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeProject,
  baselineFrom,
  canonicalPolicy,
  compareBaseline,
  compareMergeBaseProtection,
  currentTrackedFiles,
  validateReviewedEntries,
} from "./check-architecture.mjs";

const architectureRoot = dirname(fileURLToPath(import.meta.url));

function fixtureConfig(owners, extra = {}) {
  return {
    owners,
    allowedDependencies: Object.fromEntries(Object.keys(owners).map((owner) => [owner, []])),
    coverage: { lint: ["**/*"], typecheck: ["**/*"], test: ["**/*"] },
    generatedOwners: [],
    reviewedIgnores: [],
    scanExcludes: [],
    exceptions: [],
    ...extra,
  };
}

test("working-tree deletions leave verification input without excluding sibling paths", () => {
  assert.deepEqual(
    currentTrackedFiles(
      ["packages/auth/private.ts", "packages/auth/public.ts"],
      ["packages/auth/new.ts"],
      ["packages/auth/private.ts"],
    ),
    ["packages/auth/new.ts", "packages/auth/public.ts"],
  );
});

test("new cross-owner violations are reported and rejected by an empty baseline", () => {
  const root = resolve(architectureRoot, "fixtures/new-violation");
  const config = fixtureConfig({
    core: { roots: ["core"], packageJson: "core/package.json" },
    web: { roots: ["web"], packageJson: "web/package.json" },
  });
  const tracked = [
    "core/advanced.ts",
    "core/package.json",
    "core/value.ts",
    "web/advanced.ts",
    "web/missing.test.ts",
    "web/package.json",
    "web/value.ts",
  ];
  const { active } = analyzeProject(root, config, tracked);
  const categories = new Set(active.map((finding) => finding.category));

  assert(categories.has("cross-workspace-relative-import"));
  assert(categories.has("dependency-direction"));
  assert(categories.has("contract-name-collision"));
  assert(categories.has("app-local-trpc-contract"));
  assert(categories.has("undeclared-package-export"));
  assert(categories.has("workspace-source-import"));
  assert(categories.has("contract-structural-collision"));
  assert(
    active.some(
      (finding) =>
        finding.category === "verification-coverage" &&
        finding.path === "web/missing.test.ts" &&
        finding.details.missing === "package test script/runner pattern",
    ),
  );
  assert.equal(
    active.some(
      (finding) =>
        finding.category === "app-local-trpc-contract" && finding.details.name === "CreatePayload",
    ),
    false,
  );
  assert(compareBaseline(active, { version: 2, categories: {}, unsafe: {} }).length > 0);
});

test("reviewed persistence and platform enum distinctions pass", () => {
  const root = resolve(architectureRoot, "fixtures/enum-parity");
  const config = fixtureConfig(
    { root: { roots: ["db.ts", "core.ts"] } },
    {
      enumParity: [
        {
          id: "gender-persistence-form",
          db: { file: "db.ts", symbol: "genderEnum" },
          core: { file: "core.ts", symbol: "genderSchema" },
          allowedCoreOnly: ["prefer_not_to_say"],
          reason: "The platform privacy option normalizes to null for persistence.",
        },
      ],
    },
  );
  const { active } = analyzeProject(root, config, ["db.ts", "core.ts"]);

  assert.equal(
    active.some((finding) => finding.category === "db-core-enum-parity"),
    false,
  );
});

test("only imported schema composition is exempt from contract collision detection", () => {
  const root = resolve(architectureRoot, "fixtures/schema-composition");
  const config = fixtureConfig({
    core: { roots: ["core"], packageJson: "core/package.json" },
    web: { roots: ["web"], packageJson: "web/package.json" },
  });
  const { active } = analyzeProject(root, config, [
    "core/canonical.ts",
    "core/package.json",
    "web/contracts.ts",
    "web/package.json",
  ]);
  const structuralCollisions = active.filter(
    (finding) => finding.category === "contract-structural-collision",
  );

  assert(
    structuralCollisions.some((finding) =>
      finding.details.names.includes("duplicateCategorySchema"),
    ),
  );
  assert(
    structuralCollisions.some((finding) =>
      finding.details.names.includes("duplicatePayloadSchema"),
    ),
  );
  assert.equal(
    structuralCollisions.some(
      (finding) =>
        finding.details.names.includes("canonicalCategoryAliasSchema") ||
        finding.details.names.includes("composedCanonicalPayloadSchema"),
    ),
    false,
  );
});

test("unsafe production typing ratchets stable fingerprints per file and owner", () => {
  const finding = {
    category: "unsafe-as-any",
    path: "apps/web/example.ts",
    fingerprint: "new-fingerprint",
    details: { owner: "web" },
  };
  const accepted = baselineFrom([finding]);
  assert.equal(compareBaseline([finding], accepted).length, 0);
  assert.equal(
    compareBaseline([finding, { ...finding, fingerprint: "second" }], accepted).length > 0,
    true,
  );
});

test("unsafe scan includes double casts and ts-expect-error", () => {
  const root = resolve(architectureRoot, "fixtures/unsafe");
  const config = fixtureConfig({ web: { roots: ["apps/web"] } });
  const { active } = analyzeProject(root, config, ["apps/web/unsafe.ts"]);
  const categories = new Set(active.map((finding) => finding.category));
  assert(categories.has("unsafe-double-cast"));
  assert(categories.has("unsafe-ts-expect-error"));
  assert(categories.has("unsafe-non-null-assertion"));
});

test("merge-base protection supports bootstrap and rejects policy weakening", () => {
  const baseline = { version: 2, categories: {}, unsafe: {} };
  const config = {
    owners: { root: { roots: ["."] } },
    coverage: { lint: ["**/*"], typecheck: [], test: [], categories: { source: ["**/*"] } },
    generatedOwners: [],
    exceptions: [],
    reviewedIgnores: [],
  };
  assert.equal(compareMergeBaseProtection({ baseline, config }, undefined).bootstrap, true);
  assert.equal(compareMergeBaseProtection({ baseline, config }, { config }).findings.length, 0);

  const weakened = structuredClone(config);
  weakened.coverage.lint = [];
  weakened.exceptions.push({
    id: "new-exception",
    category: "dependency-direction",
    path: "packages/core/example.ts",
    maxCount: 1,
    owner: "core",
    reason: "fixture",
    expiresOn: "2099-01-01",
  });
  const result = compareMergeBaseProtection({ baseline, config: weakened }, { baseline, config });
  assert(result.findings.some((finding) => finding.category === "merge-base-coverage-weakening"));
  assert(result.findings.some((finding) => finding.category === "merge-base-exception-widening"));
  const increasedBaseline = {
    version: 2,
    categories: { "dependency-direction": { count: 1, fingerprints: ["new"] } },
    unsafe: {},
  };
  assert(
    compareMergeBaseProtection(
      { baseline: increasedBaseline, config },
      { baseline, config },
    ).findings.some((finding) => finding.category === "merge-base-debt-increase"),
  );
  assert.equal(
    compareMergeBaseProtection({ baseline, config: weakened }, { baseline, config }, true).findings
      .length,
    0,
  );

  const oldWithException = structuredClone(config);
  oldWithException.exceptions.push({
    id: "bounded",
    category: "dependency-direction",
    path: "packages/core/example.ts",
    maxCount: 2,
    owner: "core",
    reason: "fixture",
    expiresOn: "2099-01-01",
  });
  const narrowed = structuredClone(oldWithException);
  narrowed.exceptions[0].maxCount = 1;
  assert.equal(
    compareMergeBaseProtection(
      { baseline, config: narrowed },
      { baseline, config: oldWithException },
    ).findings.length,
    0,
  );
});

test("canonical policy blocks widening while allowing debt reduction", () => {
  const baseline = { version: 2, categories: {}, unsafe: {} };
  const previous = {
    owners: {
      web: {
        roots: ["apps/web"],
        packageJson: "apps/web/package.json",
        aliases: { "@": "apps/web/src" },
      },
    },
    allowedDependencies: { web: ["core", "ui"] },
    coverage: {
      lint: ["apps/**/*"],
      typecheck: ["apps/**/*.ts"],
      test: ["apps/**/*.test.ts"],
      categories: { source: ["apps/**/*"] },
      categoryCommands: { source: "pnpm check" },
    },
    enumParity: [],
    exceptions: [],
    generatedOwners: [],
    reviewedIgnores: [],
    scanExcludes: ["apps/web/legacy/**/*"],
  };
  const reordered = structuredClone(previous);
  reordered.allowedDependencies.web.reverse();
  assert.deepEqual(canonicalPolicy(reordered), canonicalPolicy(previous));

  const reduced = structuredClone(previous);
  reduced.allowedDependencies.web = ["core"];
  reduced.scanExcludes = [];
  assert.equal(
    compareMergeBaseProtection({ baseline, config: reduced }, { baseline, config: previous })
      .findings.length,
    0,
  );

  const widened = structuredClone(previous);
  widened.allowedDependencies.web.push("db");
  widened.scanExcludes.push("apps/web/new-ignore/**/*");
  widened.owners.web.aliases["~"] = "apps/web/src";
  const findings = compareMergeBaseProtection(
    { baseline, config: widened },
    { baseline, config: previous },
  ).findings;
  assert(
    findings.filter((finding) => finding.category === "merge-base-policy-widening").length >= 3,
  );
});

test("merge-base canonical policy covers every enforcement surface", () => {
  const baseline = { version: 2, categories: {}, unsafe: {} };
  const config = {
    owners: {
      core: {
        roots: ["packages/core"],
        packageJson: "packages/core/package.json",
        aliases: {},
        verification: { lint: { script: "lint", patterns: ["packages/core/**/*"] } },
      },
    },
    allowedDependencies: { core: [] },
    coverage: {
      lint: ["packages/**/*"],
      typecheck: ["packages/**/*.ts"],
      test: ["packages/**/*.test.ts"],
      lintExcludes: [],
      categories: { source: ["packages/**/*"] },
      categoryCommands: { source: "pnpm check" },
    },
    enumParity: [
      {
        id: "sport",
        db: { file: "db.ts", symbol: "sport" },
        core: { file: "core.ts", symbol: "sport" },
      },
    ],
    generatedOwners: [
      {
        path: "generated.json",
        owner: "core",
        packageJson: "package.json",
        script: "check",
        freshnessCommand: "pnpm check",
      },
    ],
    exceptions: [],
    reviewedIgnores: [],
    scanExcludes: [],
  };
  const mutations = [
    (next) => next.owners.core.roots.push("packages/shared-core"),
    (next) => (next.owners.core.packageJson = "packages/core/other.json"),
    (next) => (next.owners.core.verification.lint.script = "check"),
    (next) => next.coverage.lint.splice(0, 1),
    (next) => next.enumParity.splice(0, 1),
    (next) => (next.generatedOwners[0].script = "generate"),
    (next) =>
      next.reviewedIgnores.push({
        id: "ignore",
        path: "packages/core/legacy.ts",
        owner: "core",
        reason: "fixture",
        expiresOn: "2099-01-01",
      }),
  ];
  for (const mutate of mutations) {
    const next = structuredClone(config);
    mutate(next);
    assert(
      compareMergeBaseProtection({ baseline, config: next }, { baseline, config }).findings.length >
        0,
    );
  }
});

test("reviewed exceptions require bounded ownership and expiry metadata", () => {
  const errors = validateReviewedEntries(
    {
      exceptions: [{ id: "invalid", category: "dependency-direction", path: "packages/core/**" }],
    },
    "2026-01-01",
  );
  assert(errors.some((error) => error.includes("missing owner")));
  assert(errors.some((error) => error.includes("missing reason")));
  assert(errors.some((error) => error.includes("missing expiry")));
  assert(errors.some((error) => error.includes("requires fingerprint or maxCount")));
});
