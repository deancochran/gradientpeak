import assert from "node:assert/strict";
import test from "node:test";

import { planE2EDatabaseCommand, redactCommandFailure } from "./e2e-db-command";

test("plans only the four bounded E2E lifecycle commands", () => {
  assert.deepEqual(planE2EDatabaseCommand("start", true), {
    action: "start",
    dryRun: true,
    projectId: "gradientpeak_e2e",
  });
  assert.deepEqual(planE2EDatabaseCommand("migrate", false), {
    action: "migrate",
    dryRun: false,
    projectId: "gradientpeak_e2e",
  });
  assert.throws(() => planE2EDatabaseCommand("reset", true), /start, migrate, status, stop/);
});

test("redacts credentials and tokens from subprocess failures", () => {
  const message = redactCommandFailure(
    "postgresql://postgres:secret@127.0.0.1:55322/postgres service_role_key=secret-token anon key: secret-anon",
  );
  assert.doesNotMatch(message, /secret|token/);
  assert.match(message, /redacted/);
});
