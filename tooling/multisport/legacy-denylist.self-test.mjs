import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  findLegacyDomainTerminology,
  findRemovedProcessActivityTypeCallers,
  scanCanonicalDomainTerminology,
  scanProductionProcessActivityTypeCallers,
  shouldScanExecutableCaller,
} from "./legacy-denylist-lib.mjs";

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

test("excludes explicit rejection fixtures from production caller scanning", () => {
  assert.equal(
    shouldScanExecutableCaller("packages/api/src/routers/__tests__/activity-files.test.ts"),
    false,
  );
  assert.equal(shouldScanExecutableCaller("apps/web/src/routes/activities/import.test.tsx"), false);
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

test("allows raw/provider protocol terms and multisport product language", () => {
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

test("current repository contains no first-party legacy domain terminology", () => {
  const root = resolve(import.meta.dirname, "../..");
  assert.deepEqual(scanCanonicalDomainTerminology(root), []);
});
