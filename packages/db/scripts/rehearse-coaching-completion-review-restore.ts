/** Coordinator-only isolated restore rehearsal for the completion-review preview upgrade. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import { withDisposableDatabase } from "./_disposable-target";
import { requireManagedSupabaseDatabaseTarget } from "./_target-safety";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import {
  applyCoachingCompletionReviewRestoreUpgrade,
  assertPreviewTarget,
  assertRestoreEquivalentFingerprint,
  expectedPrerequisiteFingerprint,
  expectedUpgradeSql,
  verifyRecoveryArchive,
} from "./coaching-completion-review-upgrade";

const backup = process.env.COACHING_COMPLETION_REVIEW_PREVIEW_BACKUP;
const sourceUrl = process.env.COACHING_COMPLETION_REVIEW_PREVIEW_DATABASE_URL;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function main() {
  assert.ok(backup && sourceUrl, "explicit private preview backup and source URL required");
  assertPreviewTarget(sourceUrl);
  verifyRecoveryArchive(backup);
  const sourceTarget = requireManagedSupabaseDatabaseTarget();
  const archive = readFileSync(backup);
  const receiptPath = `${dirname(backup)}/coaching-completion-review-rehearsal-receipt.json`;
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "completion_review_restore",
    async (pool, url) => {
      const target = new URL(url);
      const database = target.pathname.slice(1);
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
        { input: archive, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
      assert.equal(restored.status, 0, "isolated pg_restore failed");
      assertRestoreEquivalentFingerprint(
        expectedPrerequisiteFingerprint(),
        await createSchemaFingerprint(pool),
      );
      const source = new Pool({
        connectionString: sourceUrl,
        max: 1,
        options: "-c default_transaction_read_only=on",
      });
      // The source URL is an externally reachable Docker-published endpoint. Once
      // connected, PostgreSQL reports its in-container listener instead. Validate
      // both identities without conflating host-port routing with server identity.
      let sourceServerIdentity = "";
      try {
        const identity = await source.query(
          "select coalesce(host(inet_server_addr()), '') || ':' || inet_server_port()::text || '/' || current_database() as target",
        );
        sourceServerIdentity = String(identity.rows[0]?.target ?? "");
        assert.equal(
          sourceServerIdentity,
          `${sourceTarget.serverAddress}:5432/postgres`,
          "source server identity mismatch",
        );
        assert.deepEqual(
          await createSchemaFingerprint(source),
          expectedPrerequisiteFingerprint(),
          "source changed after archive creation",
        );
      } finally {
        await source.end();
      }
      await applyCoachingCompletionReviewRestoreUpgrade(pool, url);
      writeFileSync(
        receiptPath,
        JSON.stringify(
          {
            successful: true,
            archiveSha256: hash(archive),
            beforeFingerprintSha256: hash(JSON.stringify(expectedPrerequisiteFingerprint())),
            sqlSha256: hash(expectedUpgradeSql()),
            afterFingerprintSha256: hash(
              readFileSync(
                "supabase/approved-upgrades/coaching-completion-review/after-fingerprint.json",
                "utf8",
              ),
            ),
            sourceTarget: sourceTarget.sourceTarget,
            sourceContainerName: sourceTarget.containerName,
            sourceServerAddress: sourceTarget.serverAddress,
            sourceServerIdentity,
            completedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    },
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message.split("\n")[0] : "restore rehearsal failed");
  process.exitCode = 1;
});
