import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import {
  applyCoachingUpgrade,
  assertPrerequisiteArtifact,
  assertUpgradeArtifact,
  expectedPrerequisiteFingerprint,
  expectedUpgradeSql,
  prerequisiteBaseline,
  verifyRecoveryArchive,
} from "./coaching-foundation-upgrade";
import { proveCoachingAuthorization } from "./verify-athlete-read-authorization";

async function main() {
  assertPrerequisiteArtifact(expectedPrerequisiteFingerprint());
  assert.throws(
    () => assertPrerequisiteArtifact({ ...expectedPrerequisiteFingerprint(), tables: [] }),
    /differs from pinned source/,
  );
  assertUpgradeArtifact(expectedUpgradeSql());
  assert.throws(
    () =>
      assertUpgradeArtifact(
        expectedUpgradeSql().replace("COMMIT;", "DELETE FROM public.profiles;\nCOMMIT;"),
      ),
    /differs from bounded authoritative source/,
  );
  // Synthetic archive tests validate attestation, not PostgreSQL restore viability.
  const temporary = mkdtempSync(join(tmpdir(), "coaching-upgrade-safety-"));
  try {
    const archive = join(temporary, "database.dump");
    const bytes = Buffer.from("PGDMP synthetic test");
    const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
    const fingerprint = JSON.parse(
      readFileSync(
        resolve(
          dbPackageRoot,
          "supabase/approved-upgrades/coaching-foundation/before-fingerprint.json",
        ),
        "utf8",
      ),
    );
    const manifest = {
      target: "127.0.0.1:54322/postgres",
      createdAt: new Date().toISOString(),
      archiveSha256: hash(bytes),
      beforeFingerprintSha256: hash(JSON.stringify(fingerprint)),
    };
    writeFileSync(archive, bytes, { mode: 0o600 });
    writeFileSync(`${archive}.manifest.json`, JSON.stringify(manifest), { mode: 0o600 });
    verifyRecoveryArchive(archive);
    writeFileSync(`${archive}.manifest.json`, JSON.stringify({ ...manifest, target: "other" }));
    assert.throws(() => verifyRecoveryArchive(archive), /manifest/);
    writeFileSync(`${archive}.manifest.json`, JSON.stringify(manifest));
    writeFileSync(archive, "PGDMP changed");
    assert.throws(() => verifyRecoveryArchive(archive), /manifest/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  await withDisposableDatabase(process.argv.slice(2), "coaching_upgrade", async (pool, url) => {
    await bootstrapSupabaseSchemas(pool);
    await pool.query(prerequisiteBaseline());
    const sentinel = "00000000-0000-4000-8000-000000999999";
    await pool.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,'upgrade-sentinel@example.test','{}'::jsonb)",
      [sentinel],
    );
    const before = await pool.query(
      "select to_jsonb(p) as row from public.profiles p where id=$1",
      [sentinel],
    );
    assert.equal(before.rowCount, 1);
    // A partial/unexpected install must be rejected before any upgrade mutation.
    await pool.query("create table public.coaching_upgrade_unexpected(id integer)");
    await assert.rejects(() => applyCoachingUpgrade(pool), /pre-upgrade fingerprint mismatch/);
    assert.equal(
      (await pool.query("select to_regclass('public.organization_groups') as relation")).rows[0]
        .relation,
      null,
    );
    await pool.query("drop table public.coaching_upgrade_unexpected");
    await applyCoachingUpgrade(pool);
    const after = await pool.query("select to_jsonb(p) as row from public.profiles p where id=$1", [
      sentinel,
    ]);
    assert.deepEqual(after.rows, before.rows, "existing profile changed during upgrade");
    await assert.rejects(() => applyCoachingUpgrade(pool), /pre-upgrade fingerprint mismatch/);
    await proveCoachingAuthorization(pool, url);
    console.log(
      "[coaching:upgrade:test] prerequisite upgrade, retained row, exact fingerprint, unexpected-state/replay refusal and full authorization/concurrency suite passed",
    );
  });
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "upgrade proof failed");
  process.exitCode = 1;
});
