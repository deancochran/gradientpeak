/** One fingerprint-pinned additive upgrade for the delegated-write consent contract. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { dbPackageRoot } from "./_helpers";
import {
  assertAuthIdentityCompatibilityDataInventory,
  assertAuthIdentityCompatibilityTableInventory,
} from "./auth-identity-compatibility-upgrade";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import {
  createRetainedDataDigest,
  lockRetainedDataTables,
  type RetainedDataMap,
  retainedDataTables,
} from "./retained-e2e-upgrade";

export const prerequisite = "7cf88482037dba81f2d7a00311661f4627fc63fc";
const directory = resolve(dbPackageRoot, "supabase/approved-upgrades/coaching-write-consent");
const baselinePath = "packages/db/supabase/migrations/20260730000000_mvp_baseline.sql";
const beginMarker = "-- COACHING_WRITE_CONSENT_UPGRADE_BEGIN";
const endMarker = "-- COACHING_WRITE_CONSENT_UPGRADE_END";
const advisoryLockName = "gradientpeak:coaching-write-consent-upgrade";

export function prerequisiteBaseline() {
  return execFileSync("git", ["show", `${prerequisite}:${baselinePath}`], {
    cwd: dbPackageRoot,
    encoding: "utf8",
  });
}

export function expectedPrerequisiteFingerprint() {
  return JSON.parse(
    execFileSync("git", ["show", `${prerequisite}:packages/db/schema-fingerprint.json`], {
      cwd: dbPackageRoot,
      encoding: "utf8",
    }),
  );
}

export function expectedCoachingWriteConsentAfterFingerprint() {
  return JSON.parse(readFileSync(resolve(directory, "after-fingerprint.json"), "utf8"));
}

/** The artifact is a byte-for-byte bounded extraction from the reviewed fresh baseline. */
export function expectedUpgradeSql() {
  const baseline = readFileSync(
    resolve(dbPackageRoot, "supabase/migrations/20260730000000_mvp_baseline.sql"),
    "utf8",
  );
  return extractWriteConsentUpgrade(baseline);
}

export function extractWriteConsentUpgrade(baseline: string) {
  const count = (marker: string) => baseline.split(marker).length - 1;
  if (count(beginMarker) !== 1 || count(endMarker) !== 1)
    throw new Error("delegated-write upgrade sentinels must occur exactly once");
  const start = baseline.indexOf(beginMarker) + beginMarker.length;
  const end = baseline.indexOf(endMarker, start);
  if (end < start) throw new Error("delegated-write upgrade sentinel order is invalid");
  const unit = baseline.slice(start, end).trim();
  // Mask bodies/literals before splitting top-level statements. This is an inventory
  // guard for this reviewed SQL unit, not a general SQL parser or body safety proof.
  const statements = unit
    .replace(/\$\$[\s\S]*?\$\$|'(?:''|[^'])*'|--[^\n]*/g, (token) =>
      token.startsWith("--") ? "" : token.startsWith("$$") ? "BODY" : "LITERAL",
    )
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  const tables = "public\\.athlete_coaching_write_(?:policy_versions|grants)";
  const functions =
    "public\\.(?:prevent_athlete_coaching_write_policy_mutation|validate_athlete_coaching_write_policy_supersession|guard_athlete_coaching_write_grant_history|coaching_athlete_write_access_decision)";
  const allowed = [
    new RegExp(`^CREATE TABLE ${tables} \\([\\s\\S]*\\)$`),
    new RegExp(
      `^CREATE (?:UNIQUE )?INDEX athlete_coaching_write_(?:policy_versions_supersedes_scope_fkey_idx|grants_current_unique|grants_policy_scope_idx|grants_engagement_fkey_idx) ON ${tables}\\([^;]+$`,
    ),
    new RegExp(`^CREATE FUNCTION ${functions}\\([^;]+ AS BODY$`),
    new RegExp(
      `^CREATE (?:CONSTRAINT )?TRIGGER athlete_coaching_write_(?:policy_versions_immutable|policy_versions_supersession_guard|grants_history_guard) (?:BEFORE|AFTER) [^;]+ ON ${tables} [^;]+ EXECUTE FUNCTION ${functions}\\(\\)$`,
    ),
    new RegExp(`^ALTER TABLE ${tables} ENABLE ROW LEVEL SECURITY$`),
    /^REVOKE ALL ON TABLE public\.athlete_coaching_write_policy_versions, public\.athlete_coaching_write_grants FROM PUBLIC, anon, authenticated, service_role$/,
    /^GRANT SELECT ON TABLE public\.athlete_coaching_write_policy_versions, public\.athlete_coaching_write_grants TO service_role$/,
    /^REVOKE ALL ON FUNCTION public\.coaching_athlete_write_access_decision\(uuid,uuid,uuid,text\) FROM PUBLIC, anon, authenticated$/,
    /^GRANT EXECUTE ON FUNCTION public\.coaching_athlete_write_access_decision\(uuid,uuid,uuid,text\) TO service_role$/,
  ];
  if (
    statements.length !== 19 ||
    statements.some((statement) => !allowed.some((pattern) => pattern.test(statement)))
  )
    throw new Error("delegated-write extraction contains an unexpected object scope");
  return `-- Approved delegated-write consent upgrade only. Use the guarded runner.\nBEGIN;\nSET LOCAL search_path = public, pg_catalog;\n${unit}\nCOMMIT;\n`;
}

export function assertUpgradeArtifact(sql: string) {
  if (sql !== expectedUpgradeSql())
    throw new Error(
      "upgrade artifact differs from bounded authoritative source; refusing execution",
    );
}

export function assertPrerequisiteArtifact(value: unknown) {
  if (JSON.stringify(value) !== JSON.stringify(expectedPrerequisiteFingerprint()))
    throw new Error("prerequisite fingerprint artifact differs from pinned source");
}

export function materializeUpgrade() {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "upgrade.sql"), expectedUpgradeSql());
  writeFileSync(
    resolve(directory, "before-fingerprint.json"),
    `${JSON.stringify(expectedPrerequisiteFingerprint(), null, 2)}\n`,
  );
}

export type CoachingWriteConsentUpgradeOptions = {
  afterDdl?: (client: import("pg").PoolClient) => Promise<void>;
  /**
   * Operational callers can acquire their reviewed platform-table locks and set
   * the DDL role here. This runs inside this runner's transaction, after its
   * organization lock and before any fingerprint or data observation.
   */
  beforeFingerprint?: (client: import("pg").PoolClient) => Promise<void>;
  /** A recovery rehearsal's pre-lock digest, compared only while locks are held. */
  expectedSourceData?: RetainedDataMap;
  /** Require the retained/auth/storage/ledger table inventory reviewed for this prerequisite. */
  requireExactDataInventory?: boolean;
};

/** Lock every reviewed pre-existing platform/application table for an operational run. */
export async function lockCoachingWriteConsentPreexistingTables(client: import("pg").PoolClient) {
  const tables = await retainedDataTables(client);
  await lockRetainedDataTables(client, tables);
  assertAuthIdentityCompatibilityTableInventory(tables);
}

export async function applyCoachingWriteConsentUpgrade(
  pool: Pool,
  options: CoachingWriteConsentUpgradeOptions = {},
) {
  const sql = readFileSync(resolve(directory, "upgrade.sql"), "utf8");
  const before = JSON.parse(readFileSync(resolve(directory, "before-fingerprint.json"), "utf8"));
  const after = expectedCoachingWriteConsentAfterFingerprint();
  assertUpgradeArtifact(sql);
  assertPrerequisiteArtifact(before);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'; set local statement_timeout = '60s'");
    if (
      !(
        await client.query("select pg_try_advisory_xact_lock(hashtext($1)) as acquired", [
          advisoryLockName,
        ])
      ).rows[0]?.acquired
    )
      throw new Error("coaching write consent upgrade already running");
    // Organization-first serializes future FOR UPDATE grant/revoke commands with lifecycle commands.
    await client.query("lock table public.organizations in access exclusive mode");
    await options.beforeFingerprint?.(client);
    if (JSON.stringify(await createSchemaFingerprint(client)) !== JSON.stringify(before))
      throw new Error(
        "pre-upgrade fingerprint mismatch; refusing unexpected, partial or already-installed schema",
      );
    const beforeData =
      options.expectedSourceData || options.requireExactDataInventory
        ? await createRetainedDataDigest(client)
        : undefined;
    if (options.requireExactDataInventory && beforeData)
      assertAuthIdentityCompatibilityDataInventory(beforeData);
    if (
      options.expectedSourceData &&
      JSON.stringify(beforeData) !== JSON.stringify(options.expectedSourceData)
    )
      throw new Error("pre-upgrade source data digest mismatch");
    await client.query(sql.replace("\nBEGIN;\n", "\n").replace(/COMMIT;\n$/, ""));
    await options.afterDdl?.(client);
    if (beforeData) {
      const afterData = await createRetainedDataDigest(client);
      const preexistingAfterData = Object.fromEntries(
        Object.keys(beforeData).map((table) => [table, afterData[table]]),
      );
      if (JSON.stringify(preexistingAfterData) !== JSON.stringify(beforeData))
        throw new Error("pre-existing table data digest mismatch");
      const grants = await client.query(
        "select count(*)::text as count from public.athlete_coaching_write_grants",
      );
      if (grants.rows[0]?.count !== "0")
        throw new Error("upgrade manufactured coaching write grants");
    }
    if (JSON.stringify(await createSchemaFingerprint(client)) !== JSON.stringify(after))
      throw new Error("post-upgrade fingerprint mismatch; rolling back");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "--materialize")
    throw new Error("only local materialization is supported");
  materializeUpgrade();
}
