import assert from "node:assert/strict";
import { test } from "node:test";
import { loadBaseRegistry } from "./base-registry.mjs";

test("base registry cleanup runs when loading the base source fails", async () => {
  let removed;
  await assert.rejects(
    loadBaseRegistry("/repo", "missing", {
      run: async () => {
        throw new Error("base unavailable");
      },
      makeTemporaryDirectory: async () => "/tmp/capability-base-test",
      remove: async (...args) => {
        removed = args;
      },
    }),
    /base unavailable/,
  );
  assert.deepEqual(removed, ["/tmp/capability-base-test", { recursive: true, force: true }]);
});
