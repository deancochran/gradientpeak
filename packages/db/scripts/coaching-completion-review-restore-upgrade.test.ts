import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import {
  applyCoachingCompletionReviewRestoreUpgrade,
  applyCoachingCompletionReviewUpgrade,
  assertExactFingerprint,
  assertRestoreEquivalentFingerprint,
  expectedPrerequisiteFingerprint,
  prerequisiteBaseline,
} from "./coaching-completion-review-upgrade";

function databaseName(connectionString: string) {
  return new URL(connectionString).pathname.slice(1);
}

function restoreArchive(archive: Buffer, database: string) {
  const restored = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_gradientpeak",
      "pg_restore",
      "--exit-on-error",
      "-U",
      "supabase_admin",
      "-d",
      database,
    ],
    { input: archive, maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(restored.status, 0, `pg_restore failed: ${restored.stderr.toString()}`);
}

async function main() {
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "completion_review_restore_source",
    async (source, sourceUrl) => {
      await bootstrapSupabaseSchemas(source);
      await source.query(prerequisiteBaseline());
      assertExactFingerprint(
        expectedPrerequisiteFingerprint(),
        await createSchemaFingerprint(source),
        "source prerequisite did not retain physical positions",
      );
      const dumped = spawnSync(
        "docker",
        [
          "exec",
          "supabase_db_gradientpeak",
          "pg_dump",
          "--format=custom",
          "-U",
          "supabase_admin",
          "-d",
          databaseName(sourceUrl),
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      assert.equal(dumped.status, 0, `pg_dump failed: ${dumped.stderr.toString()}`);
      await withDisposableDatabase(
        ["--disposable", "--local"],
        "completion_review_restore_target",
        async (restored, restoredUrl) => {
          restoreArchive(dumped.stdout, databaseName(restoredUrl));
          const restoredBefore = await createSchemaFingerprint(restored);
          assert.notDeepEqual(
            restoredBefore,
            expectedPrerequisiteFingerprint(),
            "pg_dump/pg_restore fixture must compact a dropped-column attnum gap",
          );
          assertRestoreEquivalentFingerprint(expectedPrerequisiteFingerprint(), restoredBefore);
          await assert.rejects(
            () => applyCoachingCompletionReviewUpgrade(restored),
            /pre-upgrade fingerprint mismatch/,
            "production upgrade must reject restored physical-position drift",
          );
          await assert.rejects(
            () =>
              applyCoachingCompletionReviewRestoreUpgrade(
                restored,
                "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
              ),
            /non-disposable local database name/,
            "restore-only path must refuse a non-disposable target before querying it",
          );
          await applyCoachingCompletionReviewRestoreUpgrade(restored, restoredUrl);
        },
      );
    },
  );
  console.log(
    "[coaching:completion-review:restore-upgrade:test] compacted dump/restore upgraded only through the guarded restore path; production and unsafe targets refused",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "restore upgrade proof failed");
  process.exitCode = 1;
});
