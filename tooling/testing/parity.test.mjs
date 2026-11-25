import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyParity, formatParityReport, validateParity } from "./parity.mjs";
import { buildParityRegistry } from "./parity-registry.mjs";

const evidence = (overrides = {}) => ({
  coveredSteps: ["open"],
  evidenceStrength: "source-only",
  implementation: "implemented",
  missingSteps: [],
  sources: [],
  status: "active",
  tests: [],
  ...overrides,
});
const record = (overrides = {}) => ({
  id: "fixture.open",
  intentionalDifferences: [],
  mobile: evidence(),
  outcome: "Open a fixture.",
  policy: "both",
  requiredSteps: [{ id: "open" }],
  title: "Fixture",
  web: evidence(),
  ...overrides,
});

test("parity rejects stale source, test, and identity references", () => {
  const stale = record({
    web: evidence({
      sources: ["missing.tsx"],
      tests: [{ path: "test.ts", identity: "missing proof" }],
    }),
  });
  const result = validateParity({
    records: [stale],
    referenceSources: new Map([
      ["missing.tsx", undefined],
      ["test.ts", "test('other proof')"],
    ]),
  });
  assert.match(result.referenceIssues.join("\n"), /stale web source/);
  assert.match(result.referenceIssues.join("\n"), /stale web test identity/);
});

test("report distinguishes runtime proof and intentional differences", () => {
  const item = record({
    intentionalDifferences: [
      {
        difference: "Mobile-only input.",
        rationale: "The current contract exposes this input only where the platform supports it.",
      },
    ],
  });
  const report = formatParityReport(classifyParity([item]));
  assert.match(report, /runtime proof missing/);
  assert.match(report, /Intentional platform differences/);
});

test("registry classifies only route feature files as saved routes", async () => {
  const records = await buildParityRegistry(process.cwd());
  const routes = records.find((record) => record.id === "routes.manage");

  assert.ok(routes);
  assert.deepEqual(routes.web.sources, [
    "apps/web/src/routes/_protected/routes/$routeId/index.tsx",
    "apps/web/src/routes/_protected/routes/index.tsx",
    "apps/web/src/routes/_protected/routes/upload.tsx",
  ]);
  assert.equal(
    routes.web.sources.some((source) => source.includes("activities")),
    false,
    "the routes directory segment must not classify unrelated web routes",
  );
});

test("registry has no implementation gaps while mobile proof remains component evidence", async () => {
  const classification = classifyParity(await buildParityRegistry(process.cwd()));

  assert.equal(classification.implementationGaps.length, 0);
  assert.equal(classification.runtimeProofGaps.length, 20);
  assert.ok(
    classification.runtimeProofGaps.some(({ record }) => record.id === "chatbot.assistant"),
    "chatbot mobile component tests must not count as native runtime proof",
  );
  for (const { platform, record } of classification.runtimeProofGaps) {
    assert.equal(platform, "mobile");
    assert.notEqual(record.mobile.evidenceStrength, "runtime");
    assert.ok(record.mobile.tests.every((test) => test.kind === "jest"));
  }
});
