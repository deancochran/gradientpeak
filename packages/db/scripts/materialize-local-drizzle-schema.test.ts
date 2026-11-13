import assert from "node:assert/strict";
import { requireGuardedLocalMaterialization } from "./materialize-local-drizzle-schema";

assert.equal(
  requireGuardedLocalMaterialization("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
  "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_schema_materialization",
);
for (const unsafe of [
  "postgresql://postgres:postgres@localhost:54322/postgres",
  "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
  "postgresql://postgres:postgres@example.com:54322/postgres",
]) {
  assert.throws(() => requireGuardedLocalMaterialization(unsafe), /repository loopback database/);
}
