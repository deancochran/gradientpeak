#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoForbiddenReferences,
  collectForbiddenReferences,
  hostedRetirementProcedurePath,
  retirementReferenceAllowlist,
} from "./verify-edge-function-safety";

const fixtureRoot = mkdtempSync(resolve(tmpdir(), "edge-function-safety-"));
const fixtureSourceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/edge-function-safety",
);
const functionName = ["analyze", "activity", "file"].join("-");

function writeFixture(relativePath: string, content: string) {
  const filePath = resolve(fixtureRoot, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

function expectRejected(relativePath: string, content: string, expectedRule: string) {
  const filePath = writeFixture(relativePath, content);
  const references = collectForbiddenReferences([filePath], fixtureRoot, new Set());

  assert.deepEqual(
    references.map((reference) => reference.rule),
    [expectedRule],
  );
  assert.throws(
    () => assertNoForbiddenReferences([filePath], fixtureRoot, new Set()),
    /Retired Edge Function still has/,
  );
}

function expectFixtureRejected(relativePath: string, expectedRule: string) {
  const content = readFileSync(resolve(fixtureSourceRoot, relativePath), "utf8").replaceAll(
    "{{FUNCTION_SLUG}}",
    functionName,
  );
  expectRejected(relativePath, content, expectedRule);
}

try {
  expectFixtureRejected("pg-net.sql", "hosted function path");
  expectFixtureRejected("supabase-functions-invoke.fixture", "Supabase client invocation");
  expectFixtureRejected("deploy-functions", "Supabase function deploy");
  expectRejected(
    "unsafe-retirement",
    `supabase functions delete ${functionName} --project-ref "$PROJECT_REF"`,
    "Supabase function delete",
  );

  const guardedProcedure = writeFixture(
    hostedRetirementProcedurePath,
    `supabase functions delete ${functionName} --project-ref "$PROJECT_REF"`,
  );
  assert.doesNotThrow(() =>
    assertNoForbiddenReferences([guardedProcedure], fixtureRoot, retirementReferenceAllowlist),
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("Edge Function safety regression fixtures passed.");
