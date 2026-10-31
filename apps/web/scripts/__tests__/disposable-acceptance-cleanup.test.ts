import assert from "node:assert/strict";
import test from "node:test";
import { runAllCleanup, throwCleanupFailures } from "../disposable-acceptance-cleanup";

test("continues all cleanup after a native force-stop failure and reports every failure", async () => {
  let metroCleaned = false;
  let reverseCleanupCalls = 0;

  const cleanupFailures = await runAllCleanup([
    async () => {
      throw new Error("force-stop failed");
    },
    () => {
      metroCleaned = true;
    },
    async () => {
      reverseCleanupCalls += 1;
      throw new Error("reverse cleanup failed");
    },
  ]);

  assert.equal(metroCleaned, true);
  assert.equal(reverseCleanupCalls, 1);
  assert.throws(
    () => throwCleanupFailures(cleanupFailures, undefined),
    (error: unknown) => error instanceof AggregateError && error.errors.length === 2,
  );
});
