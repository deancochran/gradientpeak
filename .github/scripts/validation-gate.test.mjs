import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { validationFailures, validationJobs } from "./validation-gate.mjs";

const passing = () => ({
  changes: { result: "success", outputs: { docs_only: "false" } },
  ...Object.fromEntries(validationJobs.map((job) => [job, { result: "success" }])),
});

test("all required jobs must succeed, including mobile Jest", () => {
  assert.deepEqual(validationFailures(passing()), []);
  for (const job of validationJobs) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      assert.deepEqual(validationFailures({ ...passing(), [job]: { result } }), [job]);
    }
  }
});

test("docs-only requires successful classification and its explicit skip job", () => {
  const needs = { changes: { result: "success", outputs: { docs_only: "true" } } };
  assert.deepEqual(validationFailures(needs), ["docs-only"]);
  assert.deepEqual(validationFailures({ ...needs, "docs-only": { result: "success" } }), []);
  assert.deepEqual(validationFailures({}), ["changes"]);
  assert.deepEqual(validationFailures({ changes: { result: "success" } }), [
    "changes.outputs.docs_only",
  ]);
});

test("workflow wires every required job into the always-running Basic checks gate", () => {
  const source = readFileSync(new URL("../workflows/validate.yml", import.meta.url), "utf8");
  const gate = source.split("  full-validation-suite:\n")[1];
  assert.ok(gate);
  assert.match(gate, /name: Basic checks/);
  assert.match(gate, /if: always\(\)/);
  for (const job of ["changes", "docs-only", ...validationJobs]) {
    assert.ok(gate.includes(`      - ${job}\n`), `Missing dependency: ${job}`);
  }
  assert.match(gate, /VALIDATION_NEEDS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.ok(!source.includes("- '.github/workflows/validate.yml'"));
  assert.ok(!source.includes("- '!.github/workflows/validate.yml'"));
  const changes = source.split("  changes:\n")[1].split("    outputs:")[0];
  assert.match(changes, /pull-requests: read/);
  const mobile = source
    .split("  mobile-component-and-jest:\n")[1]
    .split("  full-validation-suite:\n")[0];
  assert.match(mobile, /pnpm --filter mobile test:jest/);
  assert.match(mobile, /expo export --platform ios/);
  assert.match(mobile, /EXPO_NO_DOTENV: "1"/);
});

test("one quality job owns monorepo validation without duplicate installation", () => {
  assert.equal(existsSync(new URL("../workflows/ci.yml", import.meta.url)), false);
  const source = readFileSync(new URL("../workflows/validate.yml", import.meta.url), "utf8");
  const quality = source.split("  quality-and-build:\n")[1].split("  api-live-db:\n")[0];
  assert.equal(quality.match(/pnpm install --frozen-lockfile/g)?.length, 1);
  for (const command of [
    "pnpm check:ci",
    "pnpm check-types",
    "pnpm build",
    "pnpm test",
    "pnpm knip",
  ]) {
    assert.ok(quality.includes(`run: ${command}\n`), `Missing quality command: ${command}`);
  }
});

test("security checks cannot be advisory on pull requests", () => {
  const source = readFileSync(new URL("../workflows/security.yml", import.meta.url), "utf8");
  for (const name of ["Dependency review", "PNPM audit", "Web image vulnerability scan"]) {
    assert.ok(source.includes(`name: ${name}`));
  }
  assert.ok(!source.includes("continue-on-error"));
  assert.match(source, /pnpm audit --audit-level high/);
  assert.match(source, /exit-code: "1"/);
  assert.match(source, /severity: CRITICAL,HIGH/);
  assert.match(source, /limit-severities-for-sarif: true/);
});

test("acceptance uses an owned fresh service and actually runs browser journeys", () => {
  const source = readFileSync(new URL("../workflows/validate.yml", import.meta.url), "utf8");
  const acceptance = source.split("  api-live-db:\n")[1].split("  mobile-component-and-jest:\n")[0];
  assert.match(acceptance, /image: postgres:17-alpine/);
  assert.match(acceptance, /--label com.gradientpeak.disposable=true/);
  assert.match(acceptance, /--publish 127\.0\.0\.1:54329:5432/);
  assert.match(acceptance, /db:acceptance:prepare/);
  assert.match(acceptance, /playwright test --config playwright.acceptance.config.ts/);
  assert.ok(!acceptance.includes("db:reset"));
  assert.ok(!acceptance.includes("db:push"));
});
