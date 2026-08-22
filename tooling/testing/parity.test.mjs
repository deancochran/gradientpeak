import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCompletion } from "./parity.mjs";

const entry = (id) => ({
  id,
  title: id,
  policy: "web_only",
  intentionalDifferences: [],
  web: {
    coveredSteps: [],
    evidenceStrength: "runtime",
    implementation: "implemented",
    missingSteps: [],
    sources: [],
    tests: [],
    status: "active",
  },
  mobile: {
    coveredSteps: [],
    evidenceStrength: "none",
    implementation: "intentional_absence",
    missingSteps: [],
    sources: [],
    tests: [],
    status: "intentional_absence",
  },
});

test("completion evaluates unchanged entries too", () => {
  const records = [entry("unchanged-missing-proof"), entry("changed")];
  const outcome = evaluateCompletion({
    validation: { issues: [], records },
    records,
    journeyResults: [],
  });
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.proofIssues, [
    "changed (web): runtime proof gap",
    "unchanged-missing-proof (web): runtime proof gap",
  ]);
});
