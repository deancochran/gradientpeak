/**
 * E2E-only restore rehearsal / activation runner for the approved additive
 * coaching-write-consent upgrade. It has no backup, reset, seed, ledger, or
 * automatic restore path. Operational invocation remains coordinator-owned.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { withDisposableDatabase } from "./_disposable-target";
import {
  type AuthIdentityTargetIdentity,
  assertPrivateOwnedDirectory,
  assertPrivateOwnedRegularFile,
  assertSafePrivateOutput,
  deriveAuthIdentityTargetIdentity,
  restoreArchiveIntoDisposableDatabase,
  sha256Hex,
  verifyPrivateRecoveryArchive,
  writePrivateOutputAtomically,
} from "./auth-identity-compatibility-operation";
import { assertAuthIdentityCompatibilityDataInventory } from "./auth-identity-compatibility-upgrade";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import {
  applyCoachingWriteConsentUpgrade,
  expectedCoachingWriteConsentAfterFingerprint,
  expectedPrerequisiteFingerprint,
  expectedUpgradeSql,
  lockCoachingWriteConsentPreexistingTables,
} from "./coaching-write-consent-upgrade";
import { createRetainedDataDigest, type RetainedDataMap } from "./retained-e2e-upgrade";

const manifestTarget = "e2e:127.0.0.1:55322/postgres";

type CoachingWriteConsentRehearsalReceipt = {
  target: string;
  createdAt: string;
  archiveSha256: string;
  beforeFingerprintSha256: string;
  successful: true;
  sqlSha256: string;
  afterFingerprintSha256: string;
  sourceTargetIdentity: AuthIdentityTargetIdentity;
  sourceData: RetainedDataMap;
};

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Reject preview, non-loopback, non-admin, or embellished connection strings. */
export function assertCoachingWriteConsentE2ETarget(connectionString: string) {
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "55322" ||
    url.pathname !== "/postgres" ||
    url.username !== "supabase_admin" ||
    url.search ||
    url.hash
  )
    throw new Error("refusing non-E2E coaching write consent target");
  return url;
}

export function verifyCoachingWriteConsentRecoveryArchive(archive: string) {
  const manifest = verifyPrivateRecoveryArchive(archive, "e2e", expectedPrerequisiteFingerprint());
  if (
    manifest.target !== manifestTarget ||
    manifest.beforeFingerprintSha256 !==
      sha256Hex(JSON.stringify(expectedPrerequisiteFingerprint()))
  )
    throw new Error("coaching write consent recovery archive manifest mismatch");
  return manifest;
}

export function verifyCoachingWriteConsentRehearsalReceipt(
  receiptPath: string,
  archive: string,
  identity: AuthIdentityTargetIdentity,
) {
  assertPrivateOwnedDirectory(dirname(receiptPath));
  let receipt: CoachingWriteConsentRehearsalReceipt;
  try {
    assertPrivateOwnedRegularFile(receiptPath);
    receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as CoachingWriteConsentRehearsalReceipt;
  } catch {
    throw new Error("private successful coaching write consent rehearsal receipt required");
  }
  const manifest = verifyCoachingWriteConsentRecoveryArchive(archive);
  if (
    receipt.successful !== true ||
    receipt.target !== manifestTarget ||
    receipt.archiveSha256 !== manifest.archiveSha256 ||
    receipt.beforeFingerprintSha256 !== manifest.beforeFingerprintSha256 ||
    receipt.sqlSha256 !== sha256Hex(expectedUpgradeSql()) ||
    receipt.afterFingerprintSha256 !==
      sha256Hex(JSON.stringify(expectedCoachingWriteConsentAfterFingerprint())) ||
    receipt.sourceTargetIdentity?.target !== "e2e" ||
    !same(receipt.sourceTargetIdentity, identity) ||
    !receipt.sourceData
  )
    throw new Error(
      "coaching write consent rehearsal receipt is not bound to this archive and target",
    );
  assertAuthIdentityCompatibilityDataInventory(receipt.sourceData);
  return receipt;
}

async function lockOperationalTables(client: import("pg").PoolClient) {
  await lockCoachingWriteConsentPreexistingTables(client);
  await client.query("set local role postgres");
  if ((await client.query("select current_user as role")).rows[0]?.role !== "postgres")
    throw new Error("coaching write consent upgrade requires postgres DDL role after locks");
}

async function rehearse(directory: string, sourceUrl: string) {
  assertPrivateOwnedDirectory(directory);
  assertSafePrivateOutput(resolve(directory, "restore-diagnostics.txt"));
  assertSafePrivateOutput(resolve(directory, "rehearsal-receipt.json"));
  assertCoachingWriteConsentE2ETarget(sourceUrl);
  const archivePath = resolve(directory, "postgres.dump");
  const manifest = verifyCoachingWriteConsentRecoveryArchive(archivePath);
  const source = new Pool({
    connectionString: sourceUrl,
    options: "-c default_transaction_read_only=on",
    max: 1,
  });
  try {
    const sourceTargetIdentity = await deriveAuthIdentityTargetIdentity(source, sourceUrl);
    if (sourceTargetIdentity.target !== "e2e") throw new Error("source is not the E2E target");
    await source.query("begin isolation level repeatable read read only");
    const sourceFingerprint = await createSchemaFingerprint(source);
    assert.deepEqual(
      sourceFingerprint,
      expectedPrerequisiteFingerprint(),
      "source fingerprint differs",
    );
    const sourceData = await createRetainedDataDigest(source);
    assertAuthIdentityCompatibilityDataInventory(sourceData);
    await source.query("commit");
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "coaching_write_consent_restore",
      async (clone, cloneUrl) => {
        const database = new URL(cloneUrl).pathname.slice(1);
        restoreArchiveIntoDisposableDatabase(
          readFileSync(archivePath),
          database,
          sourceFingerprint,
          resolve(directory, "restore-diagnostics.txt"),
        );
        assert.deepEqual(
          await createSchemaFingerprint(clone),
          sourceFingerprint,
          "restored schema differs",
        );
        assert.deepEqual(
          await createRetainedDataDigest(clone),
          sourceData,
          "restored data differs",
        );
        const cloneAdminUrl = new URL(cloneUrl);
        cloneAdminUrl.username = "supabase_admin";
        const cloneAdmin = new Pool({ connectionString: cloneAdminUrl.toString(), max: 1 });
        try {
          await applyCoachingWriteConsentUpgrade(cloneAdmin, {
            beforeFingerprint: lockOperationalTables,
            expectedSourceData: sourceData,
            requireExactDataInventory: true,
          });
        } finally {
          await cloneAdmin.end();
        }
        const afterData = await createRetainedDataDigest(clone);
        assert.deepEqual(
          Object.fromEntries(Object.keys(sourceData).map((table) => [table, afterData[table]])),
          sourceData,
          "upgrade changed pre-existing data",
        );
      },
    );
    writePrivateOutputAtomically(
      directory,
      "rehearsal-receipt.json",
      JSON.stringify(
        {
          ...manifest,
          successful: true,
          sqlSha256: sha256Hex(expectedUpgradeSql()),
          afterFingerprintSha256: sha256Hex(
            JSON.stringify(expectedCoachingWriteConsentAfterFingerprint()),
          ),
          sourceTargetIdentity,
          sourceData,
        } satisfies CoachingWriteConsentRehearsalReceipt,
        null,
        2,
      ),
    );
    console.log(
      "[coaching:write-operation] full archive restore rehearsal succeeded; private receipt written",
    );
  } finally {
    await source.end();
  }
}

async function activate(url: string, archive: string, receiptPath: string) {
  assertCoachingWriteConsentE2ETarget(url);
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const identity = await deriveAuthIdentityTargetIdentity(pool, url);
    if (identity.target !== "e2e") throw new Error("activation is not the E2E target");
    const receipt = verifyCoachingWriteConsentRehearsalReceipt(receiptPath, archive, identity);
    await applyCoachingWriteConsentUpgrade(pool, {
      beforeFingerprint: lockOperationalTables,
      expectedSourceData: receipt.sourceData,
      requireExactDataInventory: true,
    });
    console.log(
      "[coaching:write-operation] committed; full schema and preserved-data digests match",
    );
  } finally {
    await pool.end();
  }
}

async function main() {
  const rehearseMode = process.argv.includes("--rehearse");
  const applyMode = process.argv.includes("--apply-coaching-write-consent-upgrade");
  if (rehearseMode === applyMode)
    throw new Error("choose exactly one explicit coaching write operation mode");
  if (rehearseMode) {
    const directory = process.env.COACHING_WRITE_CONSENT_RECOVERY_DIRECTORY;
    const source = process.env.COACHING_WRITE_CONSENT_SOURCE_DATABASE_URL;
    if (!directory || !source)
      throw new Error("explicit private recovery directory and E2E source target required");
    return rehearse(directory, source);
  }
  const url = process.env.COACHING_WRITE_CONSENT_DATABASE_URL;
  const archive = process.env.COACHING_WRITE_CONSENT_BACKUP;
  const receipt = process.env.COACHING_WRITE_CONSENT_REHEARSAL_RECEIPT;
  if (!url || !archive || !receipt)
    throw new Error("explicit E2E target, fresh backup, and successful rehearsal receipt required");
  return activate(url, archive, receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      "[coaching:write-operation] failed; no success claimed. Inspect guarded private diagnostics.",
    );
    process.exitCode = 1;
  });
