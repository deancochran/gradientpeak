import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  findLegacyDomainTerminology,
  findRemovedProcessActivityTypeCallers,
  scanCanonicalDomainTerminology,
  scanCurrentContracts,
  scanFreshOnlyDbWorkflow,
  scanPathScopedRetiredSymbols,
  scanProductionProcessActivityTypeCallers,
  shouldScanProductionCaller,
} from "./scanner.mjs";

test("detects a renamed processActivityFile mutation variable", () => {
  const source = `
    const completelyRenamed = api.activityFiles.processActivityFile.useMutation();
    completelyRenamed.mutateAsync({ activityFilePath: path, activityType: "bike" });
  `;
  assert.equal(findRemovedProcessActivityTypeCallers(source).length, 1);
});

test("detects direct processActivityFile mutation chains", () => {
  const source = `
    api.activityFiles.processActivityFile.useMutation().mutate({ activityType: "run" });
    client.activityFiles.processActivityFile.mutateAsync({ activityType: "bike" });
  `;
  assert.equal(findRemovedProcessActivityTypeCallers(source).length, 2);
});

test("detects bound payloads and destructured mutation aliases", () => {
  const source = `
    const mutation = api.activityFiles.processActivityFile.useMutation();
    const payload = { activityFilePath: path, activityType: "bike" };
    mutation.mutateAsync(payload);
    const { mutate: submit } = mutation;
    submit(payload);
  `;
  assert.equal(findRemovedProcessActivityTypeCallers(source).length, 2);
});

test("detects mutable bound payloads", () => {
  for (const declaration of ["let", "var"]) {
    const source = `
      const mutation = api.activityFiles.processActivityFile.useMutation();
      ${declaration} payload = { activityFilePath: path, activityType: "bike" };
      mutation.mutateAsync(payload);
    `;
    assert.equal(findRemovedProcessActivityTypeCallers(source).length, 1);
  }
});

test("detects conditional and spread payload expressions", () => {
  for (const source of [
    `
      const mutation = api.activityFiles.processActivityFile.useMutation();
      const payload = condition
        ? { activityFilePath: path, activity_category: "bike" }
        : { activityFilePath: path, activityType: "bike" };
      mutation.mutateAsync(payload);
    `,
    `
      const mutation = api.activityFiles.processActivityFile.useMutation();
      let payload = { activityFilePath: path, activity_category: "bike" };
      payload = condition
        ? { activityFilePath: path, activity_category: "bike" }
        : { activityFilePath: path, activityType: "bike" };
      mutation.mutateAsync(payload);
    `,
    `
      const mutation = api.activityFiles.processActivityFile.useMutation();
      const legacy = { activityFilePath: path, activityType: "bike" };
      const payload = { ...legacy };
      mutation.mutateAsync(payload);
    `,
    `
      const mutation = api.activityFiles.processActivityFile.useMutation();
      mutation.mutateAsync(
        condition
          ? { activityFilePath: path, activity_category: "bike" }
          : { activityFilePath: path, activityType: "bike" },
      );
    `,
  ]) {
    assert.equal(findRemovedProcessActivityTypeCallers(source).length, 1);
  }
});

test("detects computed activityType assignment on a bound payload", () => {
  for (const setup of [
    `payload["activityType"] = "bike";`,
    `payload["activity" + "Type"] = "bike";`,
    ["payload[", "`activityType`", '] = "bike";'].join(""),
    `const key = "activity" + "Type"; payload[key] = "bike";`,
  ]) {
    const source = `
      const mutation = api.activityFiles.processActivityFile.useMutation();
      const payload = { activityFilePath: path, activity_category: "bike" };
      ${setup}
      mutation.mutateAsync(payload);
    `;
    assert.equal(findRemovedProcessActivityTypeCallers(source).length, 1);
  }
});

test("allows a statically safe computed payload key", () => {
  const source = `
    const mutation = api.activityFiles.processActivityFile.useMutation();
    const payload = { activityFilePath: path, activity_category: "bike" };
    const key = "activity_category";
    payload[key] = "run";
    mutation.mutateAsync(payload);
  `;
  assert.deepEqual(findRemovedProcessActivityTypeCallers(source), []);
});

test("detects computed activityType keys in inline payloads", () => {
  const source = `
    const mutation = api.activityFiles.processActivityFile.useMutation();
    mutation.mutateAsync({ ["activity" + "Type"]: "bike" });
  `;
  assert.equal(findRemovedProcessActivityTypeCallers(source).length, 1);
});

test("reclassifies mutable payloads without conflating shadowed bindings", () => {
  const source = `
    const mutation = api.activityFiles.processActivityFile.useMutation();
    let payload = { activityFilePath: path, activityType: "bike" };
    {
      let payload = { activityFilePath: path, activity_category: "bike" };
      mutation.mutateAsync(payload);
    }
    mutation.mutateAsync(payload);
    payload = { activityFilePath: path, activity_category: "bike" };
    mutation.mutateAsync(payload);
    payload = { activityFilePath: path, activityType: "run" };
    mutation.mutateAsync(payload);
  `;
  assert.equal(findRemovedProcessActivityTypeCallers(source).length, 2);
});

test("does not let nested-function writes mutate enclosing flow state", () => {
  const source = `
    const mutation = api.activityFiles.processActivityFile.useMutation();
    let payload = { activityFilePath: path, activityType: "bike" };
    function reset() {
      payload = { activityFilePath: path, activity_category: "bike" };
    }
    mutation.mutateAsync(payload);
  `;
  assert.equal(findRemovedProcessActivityTypeCallers(source).length, 1);
});

test("tracks captured payload reclassification inside a nested function", () => {
  const source = `
    const mutation = api.activityFiles.processActivityFile.useMutation();
    let payload = { activityFilePath: path, activity_category: "bike" };
    function submitLegacy() {
      payload = { activityFilePath: path, activityType: "bike" };
      mutation.mutateAsync(payload);
    }
  `;
  assert.equal(findRemovedProcessActivityTypeCallers(source).length, 1);
});

test("propagates reassignment from a direct synchronous IIFE", () => {
  const source = `
    const mutation = api.activityFiles.processActivityFile.useMutation();
    let payload = { activityFilePath: path, activityType: "bike" };
    (() => {
      payload = { activityFilePath: path, activity_category: "bike" };
    })();
    mutation.mutateAsync(payload);
  `;
  assert.deepEqual(findRemovedProcessActivityTypeCallers(source), []);
});

test("does not propagate conditional or post-return IIFE writes", () => {
  for (const body of [
    `if (condition) payload = { activityFilePath: path, activity_category: "bike" };`,
    `if (condition) return; payload = { activityFilePath: path, activity_category: "bike" };`,
  ]) {
    const source = `
      const mutation = api.activityFiles.processActivityFile.useMutation();
      let payload = { activityFilePath: path, activityType: "bike" };
      (() => { ${body} })();
      mutation.mutateAsync(payload);
    `;
    assert.equal(findRemovedProcessActivityTypeCallers(source).length, 1);
  }
});

test("does not conflate shadowed caller bindings across lexical scopes", () => {
  const source = `
    function legacySetup() {
      const mutation = api.activityFiles.processActivityFile.useMutation();
      return mutation;
    }
    function unrelated() {
      const mutation = { mutateAsync: (_value) => undefined };
      const payload = { activityType: "bike" };
      mutation.mutateAsync(payload);
    }
  `;
  assert.deepEqual(findRemovedProcessActivityTypeCallers(source), []);
});

test("ignores unrelated activityType display data", () => {
  const source = `
    const activityType = deriveActivityCategoryDisplay(activity.segments);
    const mutation = api.activityFiles.processActivityFile.useMutation();
    mutation.mutateAsync({ activityFilePath: path, name: activityType.label });
  `;
  assert.deepEqual(findRemovedProcessActivityTypeCallers(source), []);
});

test("excludes negative tests from production caller scanning", () => {
  assert.equal(
    shouldScanProductionCaller("packages/api/src/routers/__tests__/activity-files.test.ts"),
    false,
  );
  assert.equal(shouldScanProductionCaller("apps/web/src/routes/activities/import.test.tsx"), false);
});

test("current production callers contain no removed activityType payload", () => {
  const root = resolve(import.meta.dirname, "../..");
  assert.deepEqual(scanProductionProcessActivityTypeCallers(root), []);
});

test("detects first-party sport, workout, and activityType terminology", () => {
  const violations = findLegacyDomainTerminology(
    `
      const goalSport = "run";
      const activityType = goalSport;
      const title = "Structured workout";
      const weeklyWorkouts = [];
      const label = "Activity type";
      const testId = "activity-type-field";
    `,
    "apps/web/src/example.ts",
  );
  assert.equal(violations.length, 7);
});

test("masks only Wahoo protocol tokens inside a provider file", () => {
  const violations = findLegacyDomainTerminology(
    `const workout = await wahoo.createWorkout({ activityType }); const goalSport = "run";`,
    "packages/api/src/lib/integrations/wahoo/client.ts",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].description, /sport identifier/);
});

test("does not exempt Wahoo-named product UI", () => {
  const violations = findLegacyDomainTerminology(
    `export function WahooWorkoutCard() { return <Text>Structured workout</Text>; }`,
    "apps/web/src/components/WahooWorkoutCard.tsx",
  );
  assert.equal(violations.length, 2);
});

test("allows Wahoo provider workout protocol terms but not first-party UI copy", () => {
  assert.deepEqual(
    findLegacyDomainTerminology(
      `it("immediately queues an eligible workout", () => undefined);`,
      "packages/api/src/lib/provider-sync/planned-activities/wahoo-planned-workout-provider.test.ts",
    ),
    [],
  );
  assert.equal(
    findLegacyDomainTerminology(
      `const label = "Structured workout";`,
      "apps/web/src/components/ActivityCard.tsx",
    ).length,
    1,
  );
});

test("does not exempt branded copy outside a provider adapter", () => {
  const violations = findLegacyDomainTerminology(
    `const label = "Wahoo workout";`,
    "apps/web/src/components/integrations.tsx",
  );
  assert.equal(violations.length, 1);
});

test("does not exempt first-party copy inside a provider adapter", () => {
  for (const source of [
    `const title = "Structured workout";`,
    `const title = "Wahoo workout";`,
    `it("shows a structured workout", () => undefined);`,
  ]) {
    const violations = findLegacyDomainTerminology(
      source,
      "packages/api/src/lib/integrations/wahoo/client.test.ts",
    );
    assert.equal(violations.length, 1);
  }
});

test("does not treat provider comments as code identifiers", () => {
  const violations = findLegacyDomainTerminology(
    `/** Structured workout */\nconst workout = await wahoo.createWorkout();`,
    "packages/api/src/lib/integrations/wahoo/client.ts",
  );
  assert.equal(violations.length, 1);
});

test("requires an explicit module allowance for provider identifiers", () => {
  const violations = findLegacyDomainTerminology(
    `const workout = await wahoo.createWorkout();`,
    "packages/api/src/lib/integrations/wahoo/unreviewed-adapter.ts",
  );
  assert.equal(violations.length, 2);
});

test("does not allow unrelated copy merely because a line mentions the Wahoo API", () => {
  const violations = findLegacyDomainTerminology(
    `const title = "Structured workout"; // Wahoo API`,
    "packages/api/src/lib/integrations/wahoo/client.ts",
  );
  assert.equal(violations.length, 1);
});

test("masks only raw protocol spans on a mixed line", () => {
  const violations = findLegacyDomainTerminology(
    `const rawSport = source.sport; const goalSport = "run"; const title = "workout";`,
    "packages/api/src/example.ts",
  );
  assert.equal(violations.length, 2);
});

test("does not extend a raw-field mapping allowance across a mixed line", () => {
  const violations = findLegacyDomainTerminology(
    `const record = { rawSport: raw.sport, sport: "bike", label: "sport" };`,
    "packages/api/src/example.ts",
  );
  assert.equal(violations.length, 2);
});

test("allows exact raw sport and sub-sport phrases", () => {
  const violations = findLegacyDomainTerminology(
    `throw new Error("A raw-only source requires a raw type, sport, or sub-sport value.");`,
    "packages/core/activity-segments/completed-segment-schema.ts",
  );
  assert.equal(violations.length, 0);
});

test("masks only intentional rejection assertion values", () => {
  const violations = findLegacyDomainTerminology(
    `expect(value).not.toHaveProperty("sport"); const goalSport = "run"; const title = "workout";`,
    "apps/web/src/example.test.ts",
  );
  assert.equal(violations.length, 2);
});

test("masks only the rejected Activity type label", () => {
  const violations = findLegacyDomainTerminology(
    `screen.queryByLabelText("Activity type"); const activityType = "run";`,
    "apps/web/src/example.test.tsx",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].description, /activity type/);
});

test("allows current external-protocol terms and multisport product language", () => {
  assert.deepEqual(
    findLegacyDomainTerminology(
      `const rawSport = source.rawSport; const mode = "multisport";`,
      "packages/api/src/example.ts",
    ),
    [],
  );
  assert.deepEqual(
    findLegacyDomainTerminology(
      `const workout = await wahoo.createWorkout();`,
      "packages/api/src/lib/integrations/wahoo/client.ts",
    ),
    [],
  );
  assert.deepEqual(
    findLegacyDomainTerminology(
      `activityType: Location.ActivityType.Fitness,`,
      "apps/mobile/lib/services/ActivityRecorder/location.ts",
    ),
    [],
  );
  assert.deepEqual(
    findLegacyDomainTerminology(
      `throw new Error("forward migration did not constrain raw sub-sport variants");`,
      "packages/db/scripts/verify-forward-upgrade.ts",
    ),
    [],
  );
});

test("keeps accepted calibration-checkpoint terminology allowances exact-path only", () => {
  const checkpointSource = `export interface GoldenSport { sport: "bike"; }`;
  assert.deepEqual(
    findLegacyDomainTerminology(
      checkpointSource,
      "packages/core/athlete-inputs/__tests__/fixtures/performance-calibration-goldens.ts",
    ),
    [],
  );
  assert.equal(
    findLegacyDomainTerminology(
      checkpointSource,
      "packages/core/athlete-inputs/__tests__/fixtures/neighboring-calibration-fixture.ts",
    ).length,
    1,
  );
});

test("current repository contains no first-party legacy domain terminology", () => {
  const root = resolve(import.meta.dirname, "../..");
  assert.deepEqual(scanCanonicalDomainTerminology(root), []);
});

test("excludes immutable archives from current-contract source scanning", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "current-contract-archive-"));
  try {
    const archive = join(root, "packages/example/migrations-archive/old.ts");
    await mkdir(join(root, "packages/example/migrations-archive"), { recursive: true });
    await writeFile(archive, 'const activityType = "bike";\n');
    assert.deepEqual(scanCanonicalDomainTerminology(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects retired symbols only in active scoped source", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "current-contract-symbols-"));
  try {
    const production = "packages/core/calculations/current.ts";
    const negativeTest = "packages/core/calculations/current.test.ts";
    const archive = "packages/core/archive/retired.ts";
    const currentProjection = "packages/core/plan/projection/engine.ts";
    for (const file of [production, negativeTest, archive, currentProjection]) {
      await mkdir(join(root, file, ".."), { recursive: true });
    }
    await writeFile(join(root, production), "export const estimateWPrime = () => 1;\n");
    await writeFile(join(root, negativeTest), "expect(estimateWPrime).toBeUndefined();\n");
    await writeFile(join(root, archive), "export const estimateWPrime = () => 1;\n");
    await writeFile(
      join(root, currentProjection),
      "export const buildDeterministicProjectionPayload = () => ({});\n",
    );

    const violations = scanPathScopedRetiredSymbols(root);
    assert.deepEqual(violations, [
      "packages/core/calculations/current.ts: removed demographic W′ estimate API",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("covers representative active current-contract regressions", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "current-contract-regressions-"));
  try {
    const dailyRecommendationFacade = ["buildDaily", "RecommendedLoad"].join("");
    const planningCategoryAlias = ["planningActivity", "CategorySchema"].join("");
    const requestAuthFacade = ["getAuth", "Transport"].join("");
    const projectionFacade = ["buildDeterministic", "ProjectionPayload"].join("");
    const providerReadinessFacade = ["getActivityPlan", "ProviderReadiness"].join("");
    const plannedExportFacade = ["getPlannedActivity", "ExportCompatibility"].join("");
    const replayReconcileFacade = ["reconcileParsed", "ActivityFileEvidence"].join("");
    const legacyTssProjection = ["allowLegacyTss", "Projection"].join("");
    const cases = [
      [
        "packages/core/activity-segments/completed-segment-schema.ts",
        "export const segmentSummarySchema = {};",
        "removed segment summary compatibility name",
      ],
      [
        "packages/core/activity-segments/completed-segment-schema.ts",
        "const summary = { normalizedPowerWatts: 250 };",
        "removed completed-segment scalar compatibility field",
      ],
      [
        "packages/core/recording-metrics/contracts.ts",
        "const snapshot = { efficiencyFactor: 1.5 };",
        "removed provisional-metrics scalar compatibility field",
      ],
      [
        "packages/core/activity-analysis/stress.ts",
        "type Input = { normalized_power?: number };",
        "removed activity-analysis scalar compatibility field",
      ],
      [
        "packages/core/athlete-intelligence/model-input-contracts.ts",
        "const metrics = { normalizedPowerWatts: evidencedMetric };",
        "removed athlete-model Normalized Power scalar field",
      ],
      [
        "packages/api/src/application/activity-file-ingestion/stream-derived-calculations.ts",
        "type Metrics = { normalizedGradedSpeed?: number };",
        "removed ingestion scalar compatibility field",
      ],
      [
        "packages/api/src/application/activities/submit-activity.ts",
        "type Submission = { aerobicDecoupling: number | null };",
        "removed activity-submission scalar compatibility field",
      ],
      [
        "packages/core/calculations/current.ts",
        "estimateWPrime();",
        "removed demographic W′ estimate API",
      ],
      [
        "packages/core/plan/projectionCalculations.ts",
        `${projectionFacade}();`,
        "removed projection-calculation export facade",
      ],
      [
        "packages/core/plan/current.ts",
        `${dailyRecommendationFacade}();`,
        "removed daily recommendation facade",
      ],
      [
        "packages/core/plan/current.ts",
        `${providerReadinessFacade}();`,
        "removed provider-readiness facade",
      ],
      [
        "packages/core/plan/current.ts",
        `${plannedExportFacade}();`,
        "removed planned export compatibility facade",
      ],
      [
        "packages/core/schemas/current.ts",
        `${planningCategoryAlias}.parse("mixed");`,
        "removed planning activity-category alias",
      ],
      [
        "packages/core/athlete-intelligence/current.ts",
        "const input = { sessionRpeEvidence: null };",
        "removed session-RPE placeholder",
      ],
      [
        "packages/core/schemas/goals/profile_goals.ts",
        'const method = "heart_rate_reserve";',
        "removed first-party heart-rate-reserve identity",
      ],
      [
        "packages/api/src/lib/provider-sync/current.ts",
        'const version = "activity-segments-v1";',
        "retired provider materializer version",
      ],
      [
        "packages/api/src/lib/provider-sync/current.ts",
        `${replayReconcileFacade}();`,
        "removed provider replay/reconcile materializer path",
      ],
      [
        "packages/core/notifications/current.ts",
        "return notification.is_read;",
        "removed notification is_read consumer shape",
      ],
      [
        "packages/core/schemas/onboarding.ts",
        "baseline_field_sources: onboardingBaselineFieldSourcesSchema.optional(),",
        "removed optional onboarding provenance marker",
      ],
      [
        "apps/mobile/components/current.tsx",
        "export const Chart = FitnessProjectionChart;",
        "removed mobile FitnessProjection chart",
      ],
      [
        "apps/mobile/components/current.tsx",
        "type Selected = ResourcePickerSelectionItem;",
        "removed resource-picker compatibility item",
      ],
      [
        "apps/mobile/components/current.tsx",
        'const status = "legacy_read_only";',
        "removed legacy composer state",
      ],
      [
        "apps/mobile/components/plan/training-path/trainingPathUtils.ts",
        `${legacyTssProjection}: true,`,
        "removed legacy-TSS replay path",
      ],
      [
        "apps/mobile/lib/services/ActivityRecorder/current.ts",
        "new CoreRecorderReducerObserver();",
        "removed recorder observer",
      ],
      [
        "apps/mobile/lib/auth/current.ts",
        "getAuthClient();",
        "removed duplicate mobile auth client",
      ],
      [
        "apps/mobile/lib/auth/current.ts",
        `${requestAuthFacade}();`,
        "removed duplicate request-auth path",
      ],
    ];
    const sourceByFile = new Map();
    for (const [file, source] of cases) {
      sourceByFile.set(file, `${sourceByFile.get(file) ?? ""}${source}\n`);
    }
    for (const [file, source] of sourceByFile) {
      await mkdir(join(root, file, ".."), { recursive: true });
      await writeFile(join(root, file), source);
    }
    const violations = scanPathScopedRetiredSymbols(root);
    assert.deepEqual(
      new Set(violations.map((violation) => violation.slice(violation.indexOf(": ") + 2))),
      new Set(cases.map(([, , description]) => description)),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects obsolete active DB workflow paths and commands without scanning archives", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "current-contract-fresh-db-"));
  try {
    await mkdir(join(root, "packages/db/scripts"), { recursive: true });
    await mkdir(join(root, "packages/db/drizzle"), { recursive: true });
    await mkdir(join(root, "packages/db/archive"), { recursive: true });
    await writeFile(join(root, "packages/db/scripts/verify-forward-upgrade.ts"), "export {};\n");
    await writeFile(
      join(root, "packages/db/scripts/contract_event_extension_tables.sql"),
      "select 1;\n",
    );
    await writeFile(
      join(root, "packages/db/archive/contract_event_extension_tables.sql"),
      "select 1;\n",
    );
    await writeFile(
      join(root, "packages/db/package.json"),
      JSON.stringify({ scripts: { "db:migration:check": "tsx scripts/migration-workflow.ts" } }),
    );
    await writeFile(
      join(root, "packages/db/README.md"),
      "generation-2 baseline followed by an ordered hashed forward chain\n",
    );
    await writeFile(join(root, "packages/db/drizzle/AGENTS.md"), "Forward database migrations\n");
    const violations = scanFreshOnlyDbWorkflow(root);
    assert(violations.some((violation) => violation.includes("verify-forward-upgrade.ts")));
    assert(
      violations.some((violation) => violation.includes("contract_event_extension_tables.sql")),
    );
    assert(violations.some((violation) => violation.includes("db:migration command")));
    assert(violations.some((violation) => violation.includes("forward-chain guidance")));
    assert(violations.some((violation) => violation.includes("forward-migration guidance")));
    assert.equal(
      violations.some((violation) => violation.includes("packages/db/archive")),
      false,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("checks deleted files and required current routes", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "current-contract-routes-"));
  try {
    const files = [
      "packages/api/src/application/activities/submit-activity.ts",
      "packages/db/src/schema/tables.ts",
    ];
    for (const file of files) {
      await mkdir(join(root, file, ".."), { recursive: true });
      await writeFile(join(root, file), "export {};\n");
    }
    const deleted = "packages/core/activity-plan/v2.ts";
    await mkdir(join(root, deleted, ".."), { recursive: true });
    await writeFile(join(root, deleted), "export {};\n");
    const violations = scanCurrentContracts(root);
    assert(violations.includes(`${deleted}: deleted legacy file exists`));
    assert(
      violations.includes(
        "packages/api/src/routers/activity-files.ts: current-contract route is missing",
      ),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
