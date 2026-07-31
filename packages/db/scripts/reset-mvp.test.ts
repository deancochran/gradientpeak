#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { defaultLocalDatabaseUrl } from "./_helpers";
import { assertMvpResetSafe, resetMvp } from "./reset-mvp";

assert.doesNotThrow(() => assertMvpResetSafe(defaultLocalDatabaseUrl));
for (const unsafeUrl of [
  "postgresql://postgres:postgres@localhost:54322/postgres",
  "postgresql://postgres:postgres@127.0.0.1:54322/not_postgres",
  "postgresql://postgres:postgres@example.test:54322/postgres",
]) {
  assert.throws(() => assertMvpResetSafe(unsafeUrl), /refusing MVP reset/);
}

const invocations: string[][] = [];
resetMvp(defaultLocalDatabaseUrl, (args) => invocations.push(args));
assert.deepEqual(invocations, [["db", "reset", "--local"]]);
console.log(
  "[db:reset:mvp:test] unsafe targets rejected and fixed local-only CLI invocation verified",
);
