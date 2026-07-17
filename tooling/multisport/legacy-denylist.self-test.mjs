import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  findRemovedProcessActivityTypeCallers,
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
