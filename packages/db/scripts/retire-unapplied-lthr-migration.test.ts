import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireRetirableMigration } from "./retire-unapplied-lthr-migration";

const migration = Buffer.from("known generated migration");
const digest = createHash("sha256").update(migration).digest("hex");
const knownNoOpMigration = Buffer.from('drop extension if exists "pg_net";\n\n\n');
const knownNoOpDigest = "abfc8bfedb2d923d90bed66831e24ff3ae15be572495cdda5bc8796186aa215a";
const guardedArtifacts = [
  {
    file: "20260910001443_restore_current_schema_1.sql",
    version: "20260910001443",
    digest: "37ddb1043096afef1b614098012fc62743d0a8d080c744f69055fe462bc18f94",
  },
  {
    file: "20260910001444_restore_current_schema_2.sql",
    version: "20260910001444",
    digest: "06caa6e4e7730f60014b5f79e938acf74b31aedad594439efcc9157db7884102",
  },
] as const;

assert.doesNotThrow(() => requireRetirableMigration(migration, "20260730000000\n", digest));
assert.doesNotThrow(() =>
  requireRetirableMigration(
    knownNoOpMigration,
    "20260730000000\n",
    knownNoOpDigest,
    "20260909235612",
  ),
);
for (const artifact of guardedArtifacts) {
  const migration = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations", artifact.file),
  );
  assert.doesNotThrow(() =>
    requireRetirableMigration(migration, "20260730000000\n", artifact.digest, artifact.version),
  );
  assert.throws(
    () =>
      requireRetirableMigration(
        migration,
        `${artifact.version}\n`,
        artifact.digest,
        artifact.version,
      ),
    /recorded in local migration history/,
  );
}
assert.throws(
  () =>
    requireRetirableMigration(
      knownNoOpMigration,
      "20260909235612\n",
      knownNoOpDigest,
      "20260909235612",
    ),
  /recorded in local migration history/,
);
assert.throws(
  () => requireRetirableMigration(migration, "20260904190452\n", digest),
  /recorded in local migration history/,
);
assert.throws(
  () => requireRetirableMigration(Buffer.from("unknown"), "", digest),
  /unknown or modified/,
);
