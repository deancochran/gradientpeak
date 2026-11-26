import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { withDisposableDatabase } from "./_disposable-target";
import { defaultLocalDatabaseUrl } from "./_local-database-config";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import {
  applyRetainedE2EUpgrade,
  assertRetainedE2ETarget,
  assertRetainedTableInventory,
  createRetainedDataDigest,
  deriveRetainedE2ETargetIdentity,
  expectedAfterFingerprint,
  expectedBeforeFingerprint,
  expectedUpgradeSql,
  verifyRecoveryArchive,
} from "./retained-e2e-upgrade";

const directory = process.env.RETAINED_E2E_RECOVERY_DIRECTORY;
async function main() {
  assert.ok(directory, "Explicit private recovery directory required");
  const archivePath = `${directory}/postgres.dump`;
  const manifest = verifyRecoveryArchive(archivePath);
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "retained_restore",
    async (pool, connectionString) => {
      const url = new URL(connectionString);
      assert.equal(url.hostname, "127.0.0.1");
      assert.equal(url.port, "54322");
      const database = url.pathname.slice(1);
      assert.match(database, /^gradientpeak_retained_restore_\d+_\d+$/);
      const archive = readFileSync(`${directory}/postgres.dump`);
      const sourceFingerprint = expectedBeforeFingerprint();
      const pre = spawnSync(
        "docker",
        ["exec", "-i", "supabase_db_gradientpeak", "pg_restore", "--section=pre-data", "--file=-"],
        { input: archive, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
      assert.equal(pre.status, 0, "Pre-data extraction failed");
      // Logical dumps omit dropped attribute slots. Reconstruct only those empty
      // slots in this disposable copy, then drop their inert placeholders so the
      // unchanged physical-position fingerprint can prove exact compatibility.
      const drops: string[] = [];
      const preSql = pre.stdout.replace(
        /CREATE TABLE public\.(\w+) \(\n([\s\S]*?)\n\);/g,
        (definition, table, body) => {
          const columns = sourceFingerprint.columns.filter(
            (c: { table: string }) => c.table === table,
          );
          if (!columns.length) return definition;
          let position = 0;
          const lines: string[] = [];
          for (const line of body.split("\n")) {
            const column = columns.find(
              (c: { name: string }) =>
                line.startsWith(`    ${c.name} `) || line.startsWith(`    "${c.name}" `),
            );
            if (column) {
              while (position + 1 < column.position) {
                position++;
                const placeholder = `restore_dropped_slot_${position}`;
                lines.push(`    ${placeholder} integer,`);
                drops.push(`ALTER TABLE public."${table}" DROP COLUMN "${placeholder}";`);
              }
              position++;
              assert.equal(position, column.position);
            }
            lines.push(line);
          }
          assert.equal(position, Math.max(...columns.map((c: { position: number }) => c.position)));
          return `CREATE TABLE public.${table} (\n${lines.join("\n")}\n);`;
        },
      );
      const schemaRestore = spawnSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_gradientpeak",
          "psql",
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "supabase_admin",
          "-d",
          database,
        ],
        { input: `${preSql}\n${drops.join("\n")}`, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
      writeFileSync(`${directory}/restore-diagnostics.txt`, `${schemaRestore.stderr}`, {
        mode: 0o600,
      });
      assert.equal(schemaRestore.status, 0, "Schema restoration failed; diagnostics kept private");
      const restored = spawnSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_gradientpeak",
          "pg_restore",
          "--section=data",
          "--section=post-data",
          "--exit-on-error",
          "-U",
          "supabase_admin",
          "-d",
          database,
        ],
        { input: archive, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      );
      writeFileSync(
        `${directory}/restore-diagnostics.txt`,
        `${restored.stdout}\n${restored.stderr}`,
        { mode: 0o600 },
      );
      assert.equal(restored.status, 0, "Archive restoration failed; diagnostics kept private");
      const fingerprint = await createSchemaFingerprint(pool);
      writeFileSync(
        `${directory}/restored-fingerprint.json`,
        JSON.stringify(fingerprint, null, 2),
        { mode: 0o600 },
      );
      assert.deepEqual(fingerprint, sourceFingerprint, "Restored schema differs");
      const sourceUrl = new URL(defaultLocalDatabaseUrl);
      sourceUrl.port = "55322";
      sourceUrl.username = "supabase_admin";
      assertRetainedE2ETarget(sourceUrl.toString());
      const source = new Pool({
        connectionString: sourceUrl.toString(),
        options: "-c default_transaction_read_only=on",
        max: 1,
      });
      try {
        const sourceTargetIdentity = await deriveRetainedE2ETargetIdentity(
          source,
          sourceUrl.toString(),
        );
        await source.query("begin isolation level repeatable read read only");
        const before = await createRetainedDataDigest(source);
        await source.query("commit");
        assertRetainedTableInventory(before);
        const restoredData = await createRetainedDataDigest(pool);
        assert.deepEqual(restoredData, before, "Restored data differs from retained source");
        writeFileSync(`${directory}/before-data-digests.json`, JSON.stringify(before, null, 2), {
          mode: 0o600,
        });
        const cloneAdminUrl = new URL(connectionString);
        cloneAdminUrl.username = "supabase_admin";
        const cloneAdmin = new Pool({ connectionString: cloneAdminUrl.toString(), max: 1 });
        try {
          await applyRetainedE2EUpgrade(cloneAdmin, {
            expectedSourceData: before,
            requireReviewedInventory: true,
          });
        } finally {
          await cloneAdmin.end();
        }
        const after = await createRetainedDataDigest(pool);
        assert.deepEqual(
          Object.fromEntries(Object.keys(before).map((table) => [table, after[table]])),
          before,
          "Upgrade changed pre-existing data",
        );
        assert.deepEqual(await createSchemaFingerprint(pool), expectedAfterFingerprint());
        const hash = (value: string) => createHash("sha256").update(value).digest("hex");
        const receipt = {
          ...manifest,
          successful: true,
          sqlSha256: hash(expectedUpgradeSql()),
          afterFingerprintSha256: hash(JSON.stringify(expectedAfterFingerprint())),
          completedAt: new Date().toISOString(),
          preservedTables: Object.keys(before).length,
          sourceTargetIdentity,
          sourceData: before,
        };
        writeFileSync(`${directory}/rehearsal-receipt.json`, JSON.stringify(receipt, null, 2), {
          mode: 0o600,
        });
        console.log(
          `Full archive restoration and upgrade verified: exact schema; ${Object.keys(before).length} public/auth/storage/ledger table counts and SHA-256 content digests preserved. Successful identity/data-bound receipt written; disposable copy cleaned by guarded lifecycle.`,
        );
      } finally {
        await source.end();
      }
    },
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.split("\n")[0]?.replace(/postgres(?:ql)?:\/\/\S+/g, "[REDACTED]")
      : "Restore rehearsal failed",
  );
  process.exitCode = 1;
});
