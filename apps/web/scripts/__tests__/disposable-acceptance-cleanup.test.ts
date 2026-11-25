import assert from "node:assert/strict";
import test from "node:test";
import {
  runAllCleanup,
  throwCleanupFailures,
  throwRunAndLeaseCleanupFailures,
} from "../disposable-acceptance-cleanup";

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
    () => throwCleanupFailures(cleanupFailures, undefined, false),
    (error: unknown) => error instanceof AggregateError && error.errors.length === 2,
  );
});

test("preserves falsy runner and lease-cleanup failures", () => {
  assert.throws(
    () =>
      throwRunAndLeaseCleanupFailures({
        cleanupFailed: false,
        cleanupFailure: undefined,
        runFailed: true,
        runFailure: undefined,
      }),
    (error: unknown) => error === undefined,
  );
  assert.throws(
    () =>
      throwRunAndLeaseCleanupFailures({
        cleanupFailed: true,
        cleanupFailure: null,
        runFailed: true,
        runFailure: false,
      }),
    (error: unknown) =>
      error instanceof AggregateError && error.errors[0] === false && error.errors[1] === null,
  );
});

test("preserves an undefined primary failure when native cleanup also fails", () => {
  assert.throws(
    () => throwCleanupFailures([new Error("cleanup failure")], undefined, true),
    (error: unknown) =>
      error instanceof AggregateError &&
      error.errors[0] === undefined &&
      error.errors[1] instanceof Error,
  );
});
