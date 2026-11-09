import assert from "node:assert/strict";
import type { Pool } from "pg";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import {
  applyCheckInCompatibilityUpgrade,
  assertCheckInCompatibilityAllowedDelta,
  assertCheckInCompatibilityArtifact,
  assertCheckInCompatibilityFingerprints,
  canonicalPredecessorBaseline,
  expectedCheckInCompatibilityAfterFingerprint,
  expectedCheckInCompatibilityBeforeFingerprint,
  expectedCheckInCompatibilityUpgradeSql,
  sourceHashes,
} from "./check-in-compatibility-upgrade";
import { createSchemaFingerprint } from "./check-schema-fingerprint";

/** Test-only wrapper: injects drift only after the real bounded DDL has executed. */
function postDdlDriftPool(pool: Pool): Pick<Pool, "connect"> {
  return {
    async connect() {
      const client = await pool.connect();
      const query = client.query.bind(client);
      const release = client.release.bind(client);
      let injected = false;
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        client.query = query;
        client.release = release;
      };
      return Object.assign(client, {
        async query(text: string, values?: unknown[]) {
          const result = values ? await query(text, values) : await query(text);
          if (!injected && text.includes("CREATE TABLE public.check_in_templates")) {
            injected = true;
            await query("create table public.check_in_compatibility_post_ddl_drift(id integer)");
          }
          return result;
        },
        release(error?: Error | boolean) {
          restore();
          release(error);
        },
      });
    },
  };
}

async function main() {
  assertCheckInCompatibilityArtifact(expectedCheckInCompatibilityUpgradeSql());
  assertCheckInCompatibilityFingerprints(
    expectedCheckInCompatibilityBeforeFingerprint(),
    expectedCheckInCompatibilityAfterFingerprint(),
  );
  assert.throws(
    () =>
      assertCheckInCompatibilityArtifact(
        `${expectedCheckInCompatibilityUpgradeSql()}-- tampered\n`,
      ),
    /differs from pinned additive source/,
  );
  assert.throws(
    () =>
      assertCheckInCompatibilityFingerprints(
        { ...expectedCheckInCompatibilityBeforeFingerprint(), tables: [] },
        expectedCheckInCompatibilityAfterFingerprint(),
      ),
    /prerequisite fingerprint differs/,
  );
  assert.throws(
    () =>
      assertCheckInCompatibilityFingerprints(expectedCheckInCompatibilityBeforeFingerprint(), {
        ...expectedCheckInCompatibilityAfterFingerprint(),
        tables: [],
      }),
    /postcondition fingerprint differs/,
  );
  const beforeFingerprint = expectedCheckInCompatibilityBeforeFingerprint();
  const afterFingerprint = expectedCheckInCompatibilityAfterFingerprint();
  assertCheckInCompatibilityAllowedDelta(beforeFingerprint, afterFingerprint);
  assert.throws(
    () =>
      assertCheckInCompatibilityAllowedDelta(beforeFingerprint, {
        ...afterFingerprint,
        tables: [...afterFingerprint.tables, { name: "unrelated_table" }],
      }),
    /unrelated tables entry/,
  );
  assert.throws(
    () =>
      assertCheckInCompatibilityAllowedDelta(beforeFingerprint, {
        ...afterFingerprint,
        functions: [...afterFingerprint.functions, { identity: "unrelated_function()" }],
      }),
    /unrelated function entry/,
  );
  assert.throws(
    () =>
      assertCheckInCompatibilityAllowedDelta(beforeFingerprint, {
        ...afterFingerprint,
        tables: afterFingerprint.tables.map((entry: Record<string, unknown>, index: number) =>
          index === 0 ? { ...entry, acl: "modified" } : entry,
        ),
      }),
    /modified a pre-existing tables entry/,
  );
  assert.match(sourceHashes().upgradeSha256, /^[a-f0-9]{64}$/);

  await withDisposableDatabase(process.argv.slice(2), "checkin_compatibility", async (pool) => {
    await bootstrapSupabaseSchemas(pool);
    await pool.query(canonicalPredecessorBaseline());
    const sentinel = "00000000-0000-4000-8000-000000999998";
    await pool.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,'checkin-upgrade-sentinel@example.test','{}'::jsonb)",
      [sentinel],
    );
    const retainedBefore = await pool.query(
      "select to_jsonb(p) as row from public.profiles p where id=$1",
      [sentinel],
    );
    assert.equal(retainedBefore.rowCount, 1);
    assert.deepEqual(
      await createSchemaFingerprint(pool),
      expectedCheckInCompatibilityBeforeFingerprint(),
      "disposable predecessor must match the pinned complete fingerprint",
    );
    await pool.query("create table public.check_in_compatibility_unknown(id integer)");
    await assert.rejects(
      () => applyCheckInCompatibilityUpgrade(pool),
      /pre-upgrade fingerprint mismatch/,
    );
    await pool.query("drop table public.check_in_compatibility_unknown");
    await assert.rejects(
      () => applyCheckInCompatibilityUpgrade(postDdlDriftPool(pool)),
      /post-upgrade fingerprint mismatch; rolling back/,
    );
    assert.deepEqual(
      await createSchemaFingerprint(pool),
      expectedCheckInCompatibilityBeforeFingerprint(),
      "post-DDL fingerprint mismatch must roll back all compatibility DDL",
    );
    assert.deepEqual(
      (await pool.query("select to_jsonb(p) as row from public.profiles p where id=$1", [sentinel]))
        .rows,
      retainedBefore.rows,
      "post-DDL rollback changed an existing row",
    );
    await new Promise<void>((resolve, reject) => {
      pool.query("select 1 as reusable_callback_client", (error, result) => {
        if (error) return reject(error);
        assert.equal(result.rows[0]?.reusable_callback_client, 1);
        resolve();
      });
    });
    await applyCheckInCompatibilityUpgrade(pool);
    assert.deepEqual(
      await createSchemaFingerprint(pool),
      expectedCheckInCompatibilityAfterFingerprint(),
    );
    assert.deepEqual(
      (await pool.query("select to_jsonb(p) as row from public.profiles p where id=$1", [sentinel]))
        .rows,
      retainedBefore.rows,
      "existing rows changed during check-in compatibility upgrade",
    );
    await assert.rejects(
      () => applyCheckInCompatibilityUpgrade(pool),
      /pre-upgrade fingerprint mismatch/,
    );
  });
  console.log(
    "[check-in:compatibility:test] pinned predecessor, additive source, full fingerprints, unknown-state and replay refusal passed",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "check-in compatibility proof failed");
  process.exitCode = 1;
});
