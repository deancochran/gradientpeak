import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import {
  applyRetainedE2EUpgrade,
  assertPostUpgradeTableInventory,
  assertRetainedE2EConnectionString,
  assertRetainedE2ETarget,
  assertUpgradeArtifact,
  createRetainedDataDigest,
  expectedAfterFingerprint,
  expectedBeforeFingerprint,
  expectedRetainedTableInventory,
  expectedUpgradeSql,
  retainedTables,
  verifyRehearsalReceipt,
} from "./retained-e2e-upgrade";

const baseline = resolve(dbPackageRoot, "supabase/migrations/20260730000000_mvp_baseline.sql");
const removedFunctions = [
  "prevent_organization_group_mutation",
  "guard_organization_group_authority",
  "audit_organization_group_change",
  "prevent_organization_group_athlete_mutation",
  "prevent_organization_group_coach_assignment_mutation",
  "validate_current_organization_group_relationship",
  "validate_organization_invitation_actor",
];

async function main() {
  const artifact = expectedUpgradeSql();
  assertUpgradeArtifact(artifact);
  const emptyDigest = { count: "0", sha256: "0".repeat(64) };
  const beforeInventory = { '"auth"."users"': emptyDigest };
  const afterInventory = {
    ...beforeInventory,
    ...Object.fromEntries(retainedTables.map((table) => [`"public"."${table}"`, emptyDigest])),
  };
  assertPostUpgradeTableInventory(beforeInventory, afterInventory);
  assert.throws(
    () =>
      assertPostUpgradeTableInventory(beforeInventory, {
        ...afterInventory,
        '"storage"."unexpected"': emptyDigest,
      }),
    /post-upgrade retained table inventory mismatch/,
  );
  assert.throws(() => assertUpgradeArtifact(`${artifact}-- tampered\n`), /differs/);
  assert.throws(
    () => assertRetainedE2ETarget("postgresql://postgres@localhost:54322/postgres"),
    /refusing/,
  );
  assert.throws(
    () =>
      assertRetainedE2EConnectionString(
        "postgresql://postgres@127.0.0.1:55322/postgres?host=other",
      ),
    /refusing/,
  );
  assert.throws(
    () =>
      assertRetainedE2EConnectionString("postgresql://postgres@127.0.0.1:55322/postgres?port=1"),
    /refusing/,
  );
  const temporary = mkdtempSync(join(tmpdir(), "retained-receipt-"));
  try {
    const archive = join(temporary, "postgres.dump");
    const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
    const bytes = Buffer.from("PGDMP synthetic receipt");
    const sourceTargetIdentity = {
      containerId: "synthetic-container",
      database: "postgres",
      serverAddress: "127.0.0.1",
      serverPort: "5432",
      systemIdentifier: null,
    };
    const sourceData = Object.fromEntries(
      expectedRetainedTableInventory().map((table) => [
        table,
        { count: "0", sha256: "0".repeat(64) },
      ]),
    );
    const manifest = {
      target: "127.0.0.1:55322/postgres",
      createdAt: new Date().toISOString(),
      archiveSha256: hash(bytes),
      beforeFingerprintSha256: hash(JSON.stringify(expectedBeforeFingerprint())),
    };
    writeFileSync(archive, bytes, { mode: 0o600 });
    writeFileSync(`${archive}.manifest.json`, JSON.stringify(manifest), { mode: 0o600 });
    const receipt = {
      ...manifest,
      successful: true,
      sqlSha256: hash(expectedUpgradeSql()),
      afterFingerprintSha256: hash(JSON.stringify(expectedAfterFingerprint())),
      sourceTargetIdentity,
      sourceData,
    };
    const receiptPath = join(temporary, "receipt.json");
    writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
    verifyRehearsalReceipt(receiptPath, archive, sourceTargetIdentity);
    assert.throws(
      () =>
        verifyRehearsalReceipt(receiptPath, archive, {
          ...sourceTargetIdentity,
          containerId: "wrong",
        }),
      /identity mismatch/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  await withDisposableDatabase(process.argv.slice(2), "retained_upgrade", async (pool) => {
    await bootstrapSupabaseSchemas(pool);
    await pool.query("create extension if not exists pgcrypto with schema extensions");
    await pool.query(readFileSync(baseline, "utf8"));
    const previousDecision = (
      expectedBeforeFingerprint().functions as Array<Record<string, unknown>>
    ).find(
      (entry) => entry.identity === "coaching_athlete_read_access_decision(uuid,uuid,uuid,text)",
    )?.definition;
    assert.equal(typeof previousDecision, "string", "pinned before decision function is required");
    await pool.query(previousDecision as string);
    for (const table of [...retainedTables].reverse())
      await pool.query(`drop table public."${table}" cascade`);
    for (const name of removedFunctions) await pool.query(`drop function public.${name}()`);
    assert.deepEqual(
      await createSchemaFingerprint(pool),
      expectedBeforeFingerprint(),
      "generated prerequisite must be exact",
    );
    await pool.query("create table public.retained_upgrade_unexpected(id integer)");
    await assert.rejects(() => applyRetainedE2EUpgrade(pool), /pre-upgrade fingerprint mismatch/);
    assert.equal(
      (await pool.query("select to_regclass('public.chatbot_threads') as relation")).rows[0]
        ?.relation,
      null,
      "unknown schema must be rejected before DDL",
    );
    await pool.query("drop table public.retained_upgrade_unexpected");
    const sourceData = await createRetainedDataDigest(pool);
    const wrongSourceData = structuredClone(sourceData);
    const firstKey = Object.keys(wrongSourceData)[0];
    if (!firstKey) throw new Error("generated prerequisite has no retained tables");
    const firstDigest = wrongSourceData[firstKey];
    if (!firstDigest) throw new Error("generated prerequisite digest is missing");
    firstDigest.count = "1";
    await assert.rejects(
      () => applyRetainedE2EUpgrade(pool, { expectedSourceData: wrongSourceData }),
      /retained data digest mismatch/,
    );
    assert.deepEqual(
      await createSchemaFingerprint(pool),
      expectedBeforeFingerprint(),
      "digest refusal must not alter schema",
    );
    await applyRetainedE2EUpgrade(pool, { expectedSourceData: sourceData });
    const after = await createSchemaFingerprint(pool);
    assert.equal(
      Array.isArray(after.publicRelations) &&
        after.publicRelations.some(
          (entry) => (entry as { name?: string }).name === "chatbot_threads",
        ),
      true,
    );
    await assert.rejects(() => applyRetainedE2EUpgrade(pool), /pre-upgrade fingerprint mismatch/);
  });
  console.log(
    "[retained-e2e:upgrade:test] generated prerequisite, unknown-schema/replay, artifact-tamper, unsafe-target and reconciliation refusal passed",
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "retained E2E upgrade proof failed");
  process.exitCode = 1;
});
