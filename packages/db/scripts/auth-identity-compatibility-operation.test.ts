import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import {
  type AuthIdentityRehearsalReceipt,
  type AuthIdentityTargetIdentity,
  assertAuthIdentityPortBindings,
  assertPrivateOwnedDirectory,
  assertSafePrivateOutput,
  authIdentityManifestTarget,
  authIdentityTargetFromConnectionString,
  sha256Hex,
  verifyAuthIdentityRecoveryArchive,
  verifyAuthIdentityRehearsalReceipt,
  writePrivateOutputAtomically,
} from "./auth-identity-compatibility-operation";
import {
  applyAuthIdentityCompatibilityUpgrade,
  assertAuthIdentityCompatibilityDataInventory,
  expectedAuthIdentityCompatibilityAfterFingerprint,
  expectedAuthIdentityCompatibilityBeforeFingerprint,
  expectedAuthIdentityCompatibilityTableInventory,
  expectedAuthIdentityCompatibilityUpgradeSql,
} from "./auth-identity-compatibility-upgrade";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import { applyCoachingUpgrade, prerequisiteBaseline } from "./coaching-foundation-upgrade";
import {
  createRetainedDataDigest,
  expectedRetainedTableInventory,
  retainedTables,
} from "./retained-e2e-upgrade";

const identity: AuthIdentityTargetIdentity = {
  target: "preview",
  containerId: "test-container",
  database: "postgres",
  serverAddress: "127.0.0.1",
  serverPort: "54322",
  systemIdentifier: "test-system",
};

function writePrivate(path: string, content: string | Buffer) {
  writeFileSync(path, content, { mode: 0o600 });
}

function archiveFixture() {
  const directory = mkdtempSync(join(tmpdir(), "auth-identity-operation-"));
  const archive = join(directory, "postgres.dump");
  const bytes = Buffer.from("PGDMP synthetic auth identity archive");
  writePrivate(archive, bytes);
  const manifest = {
    target: authIdentityManifestTarget("preview"),
    createdAt: new Date().toISOString(),
    archiveSha256: sha256Hex(bytes),
    beforeFingerprintSha256: sha256Hex(
      JSON.stringify(expectedAuthIdentityCompatibilityBeforeFingerprint()),
    ),
  };
  writePrivate(`${archive}.manifest.json`, JSON.stringify(manifest));
  return { directory, archive, manifest };
}

function reviewedSourceData() {
  return Object.fromEntries(
    expectedAuthIdentityCompatibilityTableInventory().map((table) => [
      table,
      { count: "0", sha256: "0".repeat(64) },
    ]),
  );
}

async function createLegacyAccount(
  pool: Parameters<typeof applyAuthIdentityCompatibilityUpgrade>[0],
) {
  const user = await pool.query(
    "insert into public.users(name, email) values ('legacy', 'legacy-operation@example.test') returning id",
  );
  await pool.query(
    "insert into public.accounts(issuer, account_id, provider_id, user_id) values ('https://legacy.example/issuer', 'legacy-account', 'credential', $1)",
    [user.rows[0]?.id],
  );
}

async function main() {
  assertAuthIdentityPortBindings("preview", [
    { HostIp: "0.0.0.0", HostPort: "54322" },
    { HostIp: "::", HostPort: "54322" },
  ]);
  assertAuthIdentityPortBindings("e2e", [{ HostIp: "127.0.0.1", HostPort: "55322" }]);
  assert.throws(
    () => assertAuthIdentityPortBindings("e2e", [{ HostIp: "0.0.0.0", HostPort: "55322" }]),
    /bindings/,
  );
  assert.throws(
    () => assertAuthIdentityPortBindings("preview", [{ HostIp: "0.0.0.0", HostPort: "55322" }]),
    /bindings/,
  );
  assert.equal(
    authIdentityTargetFromConnectionString("postgresql://supabase_admin@127.0.0.1:54322/postgres"),
    "preview",
  );
  assert.equal(
    authIdentityTargetFromConnectionString("postgresql://supabase_admin@127.0.0.1:55322/postgres"),
    "e2e",
  );
  for (const invalid of [
    "postgresql://postgres@127.0.0.1:54322/postgres",
    "postgresql://supabase_admin@localhost:54322/postgres",
    "postgresql://supabase_admin@127.0.0.1:54322/postgres?sslmode=require",
    "postgresql://supabase_admin@127.0.0.1:6432/postgres",
  ])
    assert.throws(() => authIdentityTargetFromConnectionString(invalid), /refusing/);

  const reviewedData = reviewedSourceData();
  const reviewedAuthUsers = reviewedData['"auth"."users"'];
  if (!reviewedAuthUsers) throw new Error("reviewed inventory must include auth.users");
  assert.equal(Object.keys(reviewedData).length, 111);
  assert.deepEqual(
    expectedAuthIdentityCompatibilityTableInventory(),
    [
      ...expectedRetainedTableInventory(),
      ...retainedTables.map((table) => `"public"."${table}"`),
    ].sort(),
  );
  assertAuthIdentityCompatibilityDataInventory(reviewedData);
  for (const unexpected of [
    '"auth"."unexpected"',
    '"storage"."unexpected"',
    '"supabase_migrations"."unexpected"',
  ])
    assert.throws(
      () =>
        assertAuthIdentityCompatibilityDataInventory({
          ...reviewedData,
          [unexpected]: reviewedAuthUsers,
        }),
      /table inventory mismatch/,
    );

  const fixture = archiveFixture();
  try {
    verifyAuthIdentityRecoveryArchive(fixture.archive, "preview");
    assert.throws(() => verifyAuthIdentityRecoveryArchive(fixture.archive, "e2e"), /manifest/);
    writePrivate(fixture.archive, Buffer.from("PGDMP tampered archive"));
    assert.throws(() => verifyAuthIdentityRecoveryArchive(fixture.archive, "preview"), /manifest/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }

  const stale = archiveFixture();
  try {
    writePrivate(
      `${stale.archive}.manifest.json`,
      JSON.stringify({
        ...stale.manifest,
        createdAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
      }),
    );
    assert.throws(() => verifyAuthIdentityRecoveryArchive(stale.archive, "preview"), /manifest/);
  } finally {
    rmSync(stale.directory, { recursive: true, force: true });
  }

  const unsafeArchive = archiveFixture();
  try {
    chmodSync(unsafeArchive.archive, 0o644);
    assert.throws(
      () => verifyAuthIdentityRecoveryArchive(unsafeArchive.archive, "preview"),
      /private custom recovery archive/,
    );
    chmodSync(unsafeArchive.archive, 0o600);
    const archiveTarget = join(unsafeArchive.directory, "archive-target.dump");
    writePrivate(archiveTarget, readFileSync(unsafeArchive.archive));
    unlinkSync(unsafeArchive.archive);
    symlinkSync(archiveTarget, unsafeArchive.archive);
    assert.throws(
      () => verifyAuthIdentityRecoveryArchive(unsafeArchive.archive, "preview"),
      /private custom recovery archive/,
    );
  } finally {
    rmSync(unsafeArchive.directory, { recursive: true, force: true });
  }

  const filesystem = mkdtempSync(join(tmpdir(), "auth-identity-filesystem-"));
  try {
    const output = join(filesystem, "rehearsal-receipt.json");
    writePrivateOutputAtomically(filesystem, "rehearsal-receipt.json", "valid");
    assert.equal(readFileSync(output, "utf8"), "valid");
    assert.equal(lstatSync(output).mode & 0o777, 0o600);
    chmodSync(output, 0o644);
    assert.throws(
      () => assertSafePrivateOutput(output),
      /private owner-controlled regular artifact/,
    );
    writeFileSync(output, "valid", { mode: 0o600 });
    chmodSync(output, 0o600);
    const symlink = join(filesystem, "restore-diagnostics.txt");
    symlinkSync(output, symlink);
    assert.throws(
      () => assertSafePrivateOutput(symlink),
      /private owner-controlled regular artifact/,
    );
    chmodSync(filesystem, 0o644);
    assert.throws(
      () => assertPrivateOwnedDirectory(filesystem),
      /private owner-controlled non-symlink/,
    );
  } finally {
    chmodSync(filesystem, 0o700);
    rmSync(filesystem, { recursive: true, force: true });
  }

  const receiptFixture = archiveFixture();
  try {
    const receipt: AuthIdentityRehearsalReceipt = {
      ...receiptFixture.manifest,
      successful: true,
      sqlSha256: sha256Hex(expectedAuthIdentityCompatibilityUpgradeSql()),
      afterFingerprintSha256: sha256Hex(
        JSON.stringify(expectedAuthIdentityCompatibilityAfterFingerprint()),
      ),
      sourceTargetIdentity: identity,
      sourceData: reviewedData,
    };
    const receiptPath = join(receiptFixture.directory, "rehearsal-receipt.json");
    writePrivate(receiptPath, JSON.stringify(receipt));
    verifyAuthIdentityRehearsalReceipt(receiptPath, receiptFixture.archive, identity);
    assert.throws(
      () =>
        verifyAuthIdentityRehearsalReceipt(receiptPath, receiptFixture.archive, {
          ...identity,
          containerId: "different",
        }),
      /not bound/,
    );
  } finally {
    rmSync(receiptFixture.directory, { recursive: true, force: true });
  }

  await withDisposableDatabase(
    process.argv.slice(2),
    "auth_identity_operation",
    async (pool, url) => {
      await bootstrapSupabaseSchemas(pool);
      await pool.query("create extension if not exists pgcrypto with schema extensions");
      // Rebuild the immutable auth-upgrade source instead of adapting the
      // evolving fresh-install baseline.
      await pool.query(prerequisiteBaseline());
      await applyCoachingUpgrade(pool);
      await createLegacyAccount(pool);
      assert.deepEqual(
        await createSchemaFingerprint(pool),
        expectedAuthIdentityCompatibilityBeforeFingerprint(),
      );
      const sourceData = await createRetainedDataDigest(pool);
      const adminUrl = new URL(url);
      adminUrl.username = "supabase_admin";
      const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
      try {
        const duplicateUser = await pool.query(
          "insert into public.users(name, email) values ('duplicate', 'duplicate-operation@example.test') returning id",
        );
        await pool.query(
          "insert into public.accounts(issuer, account_id, provider_id, user_id) values ('https://duplicate.example/issuer', 'legacy-account', 'credential', $1)",
          [duplicateUser.rows[0]?.id],
        );
        const duplicateData = await createRetainedDataDigest(pool);
        await assert.rejects(
          () => applyAuthIdentityCompatibilityUpgrade(admin, { expectedSourceData: duplicateData }),
          /identity collision/,
        );
        await pool.query(
          "delete from public.accounts where issuer = 'https://duplicate.example/issuer'",
        );
        await pool.query(
          "delete from public.users where email = 'duplicate-operation@example.test'",
        );
        await assert.rejects(
          () => applyAuthIdentityCompatibilityUpgrade(admin, { expectedSourceData: {} }),
          /source data digest mismatch/,
        );
        // This deliberately uses the minimal disposable platform bootstrap. The
        // explicit reviewed-inventory assertions above cover the operational
        // 111-table contract; generic upgrade coverage remains reusable.
        await applyAuthIdentityCompatibilityUpgrade(admin, { expectedSourceData: sourceData });
      } finally {
        await admin.end();
      }
      assert.deepEqual(
        await createSchemaFingerprint(pool),
        expectedAuthIdentityCompatibilityAfterFingerprint(),
      );
      assert.deepEqual(await createRetainedDataDigest(pool), sourceData);
    },
  );
  console.log(
    "[auth-identity:operation:test] target, archive, receipt, stale/tamper, source binding, and disposable upgrade guards verified",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? `auth identity operation proof failed: ${error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[REDACTED]")}`
      : "auth identity operation proof failed",
  );
  process.exitCode = 1;
});
