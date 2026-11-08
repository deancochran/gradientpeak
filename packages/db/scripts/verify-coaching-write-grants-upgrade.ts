import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import {
  applyCoachingWriteGrantsUpgrade,
  expectedAfterFingerprint,
  expectedUpgradeSql,
  extractWriteGrantsUpgrade,
  prerequisiteBaseline,
} from "./coaching-write-grants-upgrade";

async function main() {
  const unit = expectedUpgradeSql()
    .replace(/^.*\nBEGIN;\nSET LOCAL search_path = public, pg_catalog;\n/, "")
    .replace(/\nCOMMIT;\n$/, "");
  assert.throws(
    () => extractWriteGrantsUpgrade(`${unit}\ncreate table public.unrelated(id int);`),
    /sentinels/,
  );
  assert.throws(
    () =>
      extractWriteGrantsUpgrade(
        `-- COACHING_WRITE_GRANTS_UPGRADE_BEGIN\n${unit}\ncreate table public.unrelated(id int);\n-- COACHING_WRITE_GRANTS_UPGRADE_END`,
      ),
    /unexpected object scope/,
  );
  await withDisposableDatabase(
    process.argv.slice(2),
    "coaching_write_grants_upgrade",
    async (pool) => {
      await bootstrapSupabaseSchemas(pool);
      await pool.query("create extension if not exists pgcrypto with schema extensions");
      await pool.query(prerequisiteBaseline());
      const before = await createSchemaFingerprint(pool);
      await pool.query("create table public.unexpected_write_grants_upgrade_state(id integer)");
      await assert.rejects(
        () => applyCoachingWriteGrantsUpgrade(pool),
        /pre-upgrade fingerprint mismatch/,
      );
      await pool.query("drop table public.unexpected_write_grants_upgrade_state");
      await assert.rejects(
        () =>
          applyCoachingWriteGrantsUpgrade(pool, {
            testAfterDdl: async (client) => {
              await client.query("create table public.write_grants_upgrade_fault(id integer)");
            },
          }),
        /post-upgrade fingerprint mismatch/,
      );
      assert.deepEqual(
        await createSchemaFingerprint(pool),
        before,
        "post-DDL fault rolls back every schema change",
      );
      assert.equal(
        (
          await pool.query(
            "select to_regprocedure('public.grant_athlete_coaching_write_access(uuid,uuid,uuid,text,uuid,text,uuid)') as procedure",
          )
        ).rows[0]?.procedure,
        null,
        "rolled back grant RPC is absent",
      );
      assert.equal(
        (
          await pool.query(
            "select to_regprocedure('public.revoke_athlete_coaching_write_access(uuid,uuid,uuid,uuid)') as procedure",
          )
        ).rows[0]?.procedure,
        null,
        "rolled back revoke RPC is absent",
      );
      assert.equal(
        (await pool.query("select to_regclass('public.write_grants_upgrade_fault') as relation"))
          .rows[0]?.relation,
        null,
        "fault artifact is absent after rollback",
      );
      await applyCoachingWriteGrantsUpgrade(pool);
      assert.deepEqual(await createSchemaFingerprint(pool), expectedAfterFingerprint());
      await assert.rejects(
        () => applyCoachingWriteGrantsUpgrade(pool),
        /pre-upgrade fingerprint mismatch/,
      );
      assert.notDeepEqual(await createSchemaFingerprint(pool), before);
    },
  );
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        resolve(
          dbPackageRoot,
          "supabase/approved-upgrades/coaching-write-grants/after-fingerprint.json",
        ),
        "utf8",
      ),
    ),
    JSON.parse(readFileSync(resolve(dbPackageRoot, "schema-fingerprint.json"), "utf8")),
  );
  console.log(
    "[coaching:write-grants-upgrade:test] bounded fresh-clone upgrade, rollback guard, and repeat refusal passed",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
