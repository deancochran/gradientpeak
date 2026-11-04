import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectedAuthIdentityCompatibilityTableInventory } from "./auth-identity-compatibility-upgrade";
import {
  assertCoachingWriteConsentE2ETarget,
  verifyCoachingWriteConsentRecoveryArchive,
  verifyCoachingWriteConsentRehearsalReceipt,
} from "./coaching-write-consent-operation";
import {
  expectedCoachingWriteConsentAfterFingerprint,
  expectedPrerequisiteFingerprint,
  expectedUpgradeSql,
} from "./coaching-write-consent-upgrade";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function main() {
  assertCoachingWriteConsentE2ETarget("postgresql://supabase_admin@127.0.0.1:55322/postgres");
  for (const unsafe of [
    "postgresql://supabase_admin@127.0.0.1:54322/postgres",
    "postgresql://postgres@127.0.0.1:55322/postgres",
    "postgresql://supabase_admin@localhost:55322/postgres",
    "postgresql://supabase_admin@127.0.0.1:55322/postgres?sslmode=require",
  ])
    assert.throws(() => assertCoachingWriteConsentE2ETarget(unsafe), /refusing/);

  const directory = mkdtempSync(join(tmpdir(), "coaching-write-operation-"));
  try {
    const archive = join(directory, "postgres.dump");
    const bytes = Buffer.from("PGDMP synthetic coaching write archive");
    const manifest = {
      target: "e2e:127.0.0.1:55322/postgres",
      createdAt: new Date().toISOString(),
      archiveSha256: hash(bytes),
      beforeFingerprintSha256: hash(JSON.stringify(expectedPrerequisiteFingerprint())),
    };
    writeFileSync(archive, bytes, { mode: 0o600 });
    writeFileSync(`${archive}.manifest.json`, JSON.stringify(manifest), { mode: 0o600 });
    verifyCoachingWriteConsentRecoveryArchive(archive);
    const identity = {
      target: "e2e" as const,
      containerId: "synthetic-e2e-container",
      database: "postgres",
      serverAddress: "127.0.0.1",
      serverPort: "55322",
      systemIdentifier: "synthetic-system",
    };
    const sourceData = Object.fromEntries(
      expectedAuthIdentityCompatibilityTableInventory().map((table) => [
        table,
        { count: "0", sha256: "0".repeat(64) },
      ]),
    );
    const receiptPath = join(directory, "rehearsal-receipt.json");
    writeFileSync(
      receiptPath,
      JSON.stringify({
        ...manifest,
        successful: true,
        sqlSha256: hash(expectedUpgradeSql()),
        afterFingerprintSha256: hash(
          JSON.stringify(expectedCoachingWriteConsentAfterFingerprint()),
        ),
        sourceTargetIdentity: identity,
        sourceData,
      }),
      { mode: 0o600 },
    );
    verifyCoachingWriteConsentRehearsalReceipt(receiptPath, archive, identity);
    assert.throws(
      () =>
        verifyCoachingWriteConsentRehearsalReceipt(receiptPath, archive, {
          ...identity,
          containerId: "other-container",
        }),
      /not bound/,
    );
    writeFileSync(`${archive}.manifest.json`, JSON.stringify({ ...manifest, target: "preview" }), {
      mode: 0o600,
    });
    assert.throws(() => verifyCoachingWriteConsentRecoveryArchive(archive), /manifest/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  console.log(
    "[coaching:write-operation:test] E2E-only target, archive, and identity-bound receipt guards passed",
  );
}

main();
