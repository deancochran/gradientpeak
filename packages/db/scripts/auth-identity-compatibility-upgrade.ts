/** One approved auth identity compatibility upgrade; not a general migration runner. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { dbPackageRoot } from "./_helpers";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import {
  createRetainedDataDigest,
  lockRetainedDataTables,
  type RetainedDataMap,
  retainedDataTables,
} from "./retained-e2e-upgrade";

const directory = resolve(dbPackageRoot, "supabase/approved-upgrades/auth-identity-compatibility");
const beforePath = resolve(directory, "before-fingerprint.json");
const afterPath = resolve(directory, "after-fingerprint.json");
const sqlPath = resolve(directory, "upgrade.sql");
const inventoryPath = resolve(directory, "table-inventory.json");
const advisoryLockName = "gradientpeak:auth-identity-compatibility-upgrade";

export const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

export function expectedAuthIdentityCompatibilityUpgradeSql() {
  return [
    "-- Approved auth-identity compatibility upgrade only. Use the guarded runner.",
    "BEGIN;",
    "SET LOCAL search_path = public, pg_catalog;",
    'ALTER TABLE "accounts" ALTER COLUMN "issuer" DROP NOT NULL;',
    'DROP INDEX "accounts_issuer_accountId_uidx";',
    'CREATE UNIQUE INDEX "accounts_providerId_accountId_uidx" ON "accounts" USING btree ("provider_id","account_id");',
    "COMMIT;",
    "",
  ].join("\n");
}

export function assertAuthIdentityCompatibilityUpgradeArtifact(sql: string) {
  if (sql !== expectedAuthIdentityCompatibilityUpgradeSql())
    throw new Error("auth identity compatibility artifact differs from approved three-DDL upgrade");
}

export function expectedAuthIdentityCompatibilityBeforeFingerprint() {
  return JSON.parse(readFileSync(beforePath, "utf8"));
}

export function expectedAuthIdentityCompatibilityAfterFingerprint() {
  return JSON.parse(readFileSync(afterPath, "utf8"));
}

/** Immutable schema-name inventory: retained E2E's 102 tables plus this upgrade's nine tables. */
export function expectedAuthIdentityCompatibilityTableInventory() {
  const value: unknown = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string") ||
    new Set(value).size !== value.length ||
    value.length !== 111 ||
    !same(value, [...value].sort())
  )
    throw new Error("reviewed auth identity table inventory is invalid");
  return value;
}

export function assertAuthIdentityCompatibilityTableInventory(
  tables: ReadonlyArray<{ schema: string; table: string }>,
) {
  const actual = tables.map(({ schema, table }) => `"${schema}"."${table}"`).sort();
  if (!same(actual, expectedAuthIdentityCompatibilityTableInventory()))
    throw new Error("auth identity table inventory mismatch");
}

export function assertAuthIdentityCompatibilityDataInventory(data: RetainedDataMap) {
  assertAuthIdentityCompatibilityTableInventory(
    Object.keys(data).map((key) => {
      const match = key.match(/^"(.+)"\."(.+)"$/);
      if (!match) throw new Error("auth identity digest table key is invalid");
      const [, schema, table] = match;
      if (!schema || !table) throw new Error("auth identity digest table key is invalid");
      return { schema, table };
    }),
  );
}

async function accountRowsDigest(pool: Pick<Pool, "query">) {
  const result = await pool.query(
    "select count(*)::text as count, encode(extensions.digest(coalesce(string_agg(row_sha256, '' order by row_sha256), '')::text, 'sha256'::text), 'hex') as sha256 from (select encode(extensions.digest(pg_catalog.to_jsonb(a)::text, 'sha256'::text), 'hex') as row_sha256 from public.accounts a) rows",
  );
  return result.rows[0] as { count: string; sha256: string };
}

function same(value: unknown, expected: unknown) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

/**
 * Applies only to a caller-provided, already-authorized connection. The caller owns
 * target identity, backup, and isolated restore rehearsal; this function supplies
 * the in-transaction schema/data/collision guards and has no CLI activation path.
 */
export type AuthIdentityCompatibilityUpgradeOptions = {
  /**
   * A restore rehearsal's complete source digest. It is compared only after all
   * reviewed tables are locked in this transaction; callers must not use a
   * preflight digest as an activation safety check.
   */
  expectedSourceData?: RetainedDataMap;
  /** Require the pre/post reviewed table inventories to be byte-for-byte equal. */
  requireExactDataInventory?: boolean;
};

export async function applyAuthIdentityCompatibilityUpgrade(
  pool: Pool,
  options: AuthIdentityCompatibilityUpgradeOptions = {},
) {
  const sql = readFileSync(sqlPath, "utf8");
  assertAuthIdentityCompatibilityUpgradeArtifact(sql);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'; set local statement_timeout = '60s'");
    if (
      !(
        await client.query(
          ["select pg_try_advisory_xact_lock", "(hashtext($1)) as acquired"].join(""),
          [advisoryLockName],
        )
      ).rows[0]?.acquired
    )
      throw new Error("auth identity compatibility upgrade already running");
    const tablesBefore = await retainedDataTables(client);
    await lockRetainedDataTables(client, tablesBefore);
    // This must be after every platform/application table lock and before any
    // source digest: an unseen auth, storage, or ledger table is a refusal.
    if (options.requireExactDataInventory)
      assertAuthIdentityCompatibilityTableInventory(tablesBefore);
    await client.query("set local role postgres");
    if ((await client.query("select current_user as role")).rows[0]?.role !== "postgres")
      throw new Error("auth identity compatibility upgrade requires postgres DDL role after locks");
    const before = await createSchemaFingerprint(client);
    if (!same(before, expectedAuthIdentityCompatibilityBeforeFingerprint()))
      throw new Error("pre-upgrade fingerprint mismatch");
    const beforeData = await createRetainedDataDigest(client);
    if (options.expectedSourceData && !same(beforeData, options.expectedSourceData))
      throw new Error("pre-upgrade source data digest mismatch");
    const collisions = await client.query(
      "select provider_id, account_id from public.accounts group by provider_id, account_id having count(*) > 1 limit 1",
    );
    if (collisions.rowCount)
      throw new Error("provider/account identity collision; refusing upgrade");
    const beforeRows = await accountRowsDigest(client);
    await client.query(sql.replace("\nBEGIN;\n", "\n").replace(/COMMIT;\n$/, ""));
    const afterRows = await accountRowsDigest(client);
    if (!same(beforeRows, afterRows)) throw new Error("accounts row preservation mismatch");
    const afterData = await createRetainedDataDigest(client);
    if (options.requireExactDataInventory) assertAuthIdentityCompatibilityDataInventory(afterData);
    const preexistingAfterData = Object.fromEntries(
      Object.keys(beforeData).map((table) => [table, afterData[table]]),
    );
    if (!same(beforeData, preexistingAfterData))
      throw new Error("pre-existing table data digest mismatch");
    const after = await createSchemaFingerprint(client);
    if (!same(after, expectedAuthIdentityCompatibilityAfterFingerprint()))
      throw new Error("post-upgrade fingerprint mismatch");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
