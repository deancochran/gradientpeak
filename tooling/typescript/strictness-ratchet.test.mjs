import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  analyzeStrictness,
  assertBaselineUpdateAllowed,
  baselineFrom,
  compareBaseline,
  comparePolicy,
  discoverTsconfigs,
  stableJson,
  validateBaseline,
  validateBaselineVersion,
} from "./strictness-ratchet.mjs";

function fixture(source = "export const value: number = 1;\n") {
  const root = mkdtempSync(resolve(tmpdir(), "strictness-ratchet-"));
  mkdirSync(resolve(root, "packages/example"), { recursive: true });
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({ private: true, workspaces: ["packages/*"] }),
  );
  writeFileSync(
    resolve(root, "packages/example/package.json"),
    JSON.stringify({ name: "example", scripts: { "check-types": "tsc --noEmit" } }),
  );
  writeFileSync(
    resolve(root, "packages/example/tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        module: "ESNext",
        moduleResolution: "Bundler",
      },
      include: ["*.ts"],
    }),
  );
  writeFileSync(resolve(root, "packages/example/src.ts"), source);
  return root;
}

function inspect(root) {
  const projects = discoverTsconfigs(root, { additionalTsconfigs: [] });
  const analysis = analyzeStrictness(root, { projects });
  return { projects, analysis };
}

const ONE_RETURN_DEBT = "export function maybe(value: boolean) {\n  if (value) return 1;\n}\n";

test("clean pass, same-bucket growth, stable source edits, and moved debt are enforced", () => {
  const root = fixture(ONE_RETURN_DEBT);
  try {
    const initial = inspect(root);
    const baseline = baselineFrom(initial.projects, initial.analysis);
    assert.deepEqual(compareBaseline(initial.projects, initial.analysis, baseline).growth, []);

    writeFileSync(
      resolve(root, "packages/example/src.ts"),
      `// unrelated edit\n${ONE_RETURN_DEBT}`,
    );
    const edited = inspect(root);
    assert.deepEqual(compareBaseline(edited.projects, edited.analysis, baseline).growth, []);

    writeFileSync(
      resolve(root, "packages/example/src.ts"),
      `${ONE_RETURN_DEBT}\nexport function another(value: boolean) {\n  if (value) return 2;\n}\n`,
    );
    const grown = inspect(root);
    const growth = compareBaseline(grown.projects, grown.analysis, baseline).growth;
    assert(
      growth.some(
        (bucket) =>
          bucket.flag === "noImplicitReturns" &&
          bucket.code === 7030 &&
          bucket.accepted === 1 &&
          bucket.count === 2,
      ),
    );

    writeFileSync(resolve(root, "packages/example/src.ts"), ONE_RETURN_DEBT);
    renameSync(
      resolve(root, "packages/example/src.ts"),
      resolve(root, "packages/example/moved.ts"),
    );
    const moved = inspect(root);
    assert(
      compareBaseline(moved.projects, moved.analysis, baseline).growth.some(
        (bucket) => bucket.path === "packages/example/moved.ts" && bucket.accepted === 0,
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removing accepted debt passes and is reported as a reduction", () => {
  const root = fixture(ONE_RETURN_DEBT);
  try {
    const indebted = inspect(root);
    const baseline = baselineFrom(indebted.projects, indebted.analysis);
    assert(baseline.total > 0);
    writeFileSync(
      resolve(root, "packages/example/src.ts"),
      "export function maybe() { return 1; }\n",
    );
    const reduced = inspect(root);
    const comparison = compareBaseline(reduced.projects, reduced.analysis, baseline);
    assert.deepEqual(comparison.growth, []);
    assert(comparison.reductions.some((bucket) => bucket.current === 0));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("baseline JSON is compact and deterministic regardless of input order", () => {
  const projects = ["packages/b/tsconfig.json", "packages/a/tsconfig.json"];
  const checks = [
    { project: projects[1], flag: "noImplicitReturns" },
    { project: projects[0], flag: "noImplicitReturns" },
  ];
  const buckets = [
    { flag: "noImplicitReturns", project: projects[0], path: "b.ts", code: 7030, count: 2 },
    { flag: "noImplicitReturns", project: projects[1], path: "a.ts", code: 7030, count: 1 },
  ];
  const first = baselineFrom(projects, { checks, buckets });
  const second = baselineFrom([...projects].reverse(), {
    checks: [...checks].reverse(),
    buckets: [...buckets].reverse(),
  });
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(first.total, 3);
  assert.equal("fingerprints" in first, false);
});

test("malformed, empty, and missing TypeScript configuration fails closed", () => {
  const malformed = fixture();
  try {
    writeFileSync(resolve(malformed, "packages/example/tsconfig.json"), "{ not-json");
    assert.throws(() => inspect(malformed), /Malformed TypeScript config/);
  } finally {
    rmSync(malformed, { recursive: true, force: true });
  }

  const stale = fixture();
  try {
    rmSync(resolve(stale, "packages/example/tsconfig.json"));
    assert.throws(
      () => discoverTsconfigs(stale, { additionalTsconfigs: [] }),
      /has check-types but no tsconfig/,
    );
  } finally {
    rmSync(stale, { recursive: true, force: true });
  }

  const empty = fixture();
  try {
    rmSync(resolve(empty, "packages/example/src.ts"));
    assert.throws(() => inspect(empty), /No inputs|includes no source files/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("workspace discovery rejects either TypeScript coverage bypass and allows non-TypeScript workspaces", () => {
  const root = fixture();
  const manifestPath = resolve(root, "packages/example/package.json");
  const configPath = resolve(root, "packages/example/tsconfig.json");
  try {
    writeFileSync(manifestPath, JSON.stringify({ name: "example" }));
    assert.throws(
      () => discoverTsconfigs(root, { additionalTsconfigs: [] }),
      /has tsconfig\.json but no executable check-types script/,
    );

    rmSync(configPath);
    assert.deepEqual(discoverTsconfigs(root, { additionalTsconfigs: [] }), []);

    writeFileSync(
      manifestPath,
      JSON.stringify({ name: "example", scripts: { "check-types": "tsc --noEmit" } }),
    );
    assert.throws(
      () => discoverTsconfigs(root, { additionalTsconfigs: [] }),
      /has check-types but no tsconfig\.json/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("additional configured tsconfigs are covered deterministically and missing paths are stale", () => {
  const root = fixture();
  try {
    mkdirSync(resolve(root, "packages/example/nested"));
    writeFileSync(
      resolve(root, "packages/example/nested/tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true }, include: ["nested.ts"] }),
    );
    writeFileSync(
      resolve(root, "packages/example/nested/nested.ts"),
      "export const nested = true;\n",
    );
    assert.deepEqual(
      discoverTsconfigs(root, {
        additionalTsconfigs: ["packages/example/nested/tsconfig.json"],
      }),
      ["packages/example/nested/tsconfig.json", "packages/example/tsconfig.json"],
    );
    assert.throws(
      () =>
        discoverTsconfigs(root, {
          additionalTsconfigs: ["packages/example/missing/tsconfig.json"],
        }),
      /Stale configured tsconfig/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("policy strengthening is accepted and policy weakening is rejected", () => {
  const projects = ["packages/example/tsconfig.json"];
  const checks = [
    { flag: "exactOptionalPropertyTypes", project: projects[0] },
    { flag: "noImplicitReturns", project: projects[0] },
  ];
  const baseline = baselineFrom(projects, { checks, buckets: [] });

  const strengthened = comparePolicy(projects, [checks[0]], baseline);
  assert.deepEqual(strengthened.errors, []);
  assert.deepEqual(strengthened.removedChecks, [checks[1]]);

  const weakerBaseline = baselineFrom(projects, { checks: [checks[0]], buckets: [] });
  const weakened = comparePolicy(projects, checks, weakerBaseline);
  assert(weakened.errors.some((error) => error.includes("newly disabled or added")));
  assert(
    comparePolicy([], [], weakerBaseline).errors.some((error) =>
      error.includes("project coverage was removed"),
    ),
  );
});

test("malformed baselines fail closed", () => {
  const projects = ["packages/example/tsconfig.json"];
  const analysis = {
    checks: [{ flag: "noImplicitReturns", project: projects[0] }],
    buckets: [
      {
        flag: "noImplicitReturns",
        project: projects[0],
        path: "packages/example/src.ts",
        code: 7030,
        count: 1,
      },
    ],
  };
  const baseline = baselineFrom(projects, analysis);
  baseline.total += 1;
  assert(validateBaseline(baseline).some((error) => error.includes("grand total")));
  baseline.total -= 1;
  baseline.buckets[0].count = 0;
  assert(validateBaseline(baseline).some((error) => error.includes("malformed diagnostic bucket")));
});

test("TypeScript version changes fail normal checks and require only their reviewed write acknowledgement", () => {
  const projects = ["packages/example/tsconfig.json"];
  const analysis = {
    checks: [{ flag: "exactOptionalPropertyTypes", project: projects[0] }],
    buckets: [],
  };
  const previous = baselineFrom(projects, analysis, "5.9.2");
  const comparison = compareBaseline(projects, analysis, previous, "5.9.3");

  assert.deepEqual(comparison.baselineErrors, []);
  assert(
    comparison.versionErrors.some((error) => error.includes("5.9.2") && error.includes("5.9.3")),
  );
  assert.throws(() => assertBaselineUpdateAllowed(comparison), /--allow-typescript-version-change/);
  assert.doesNotThrow(() =>
    assertBaselineUpdateAllowed(comparison, { allowTypescriptVersionChange: true }),
  );

  const migrated = baselineFrom(projects, analysis, "5.9.3");
  assert.deepEqual(validateBaseline(migrated), []);
  assert.deepEqual(validateBaselineVersion(migrated, "5.9.3"), []);

  assert.throws(
    () =>
      assertBaselineUpdateAllowed(
        { ...comparison, growth: [{ count: 2, accepted: 1 }] },
        { allowTypescriptVersionChange: true },
      ),
    /--allow-debt-increase/,
  );
});
