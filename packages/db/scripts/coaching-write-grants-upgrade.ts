/** Fingerprint-pinned, additive RPC upgrade from the coaching write-consent foundation. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { dbPackageRoot } from "./_helpers";
import { createSchemaFingerprint } from "./check-schema-fingerprint";

export const prerequisite = "b77dc2fd108ad914fcf9f41b8b4f594aa2bba046";
const directory = resolve(dbPackageRoot, "supabase/approved-upgrades/coaching-write-grants");
const baselinePath = "packages/db/supabase/migrations/20260730000000_mvp_baseline.sql";
const beginMarker = "-- COACHING_WRITE_GRANTS_UPGRADE_BEGIN";
const endMarker = "-- COACHING_WRITE_GRANTS_UPGRADE_END";

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

export function expectedAfterFingerprint() {
  return JSON.parse(readFileSync(resolve(directory, "after-fingerprint.json"), "utf8"));
}

export function expectedUpgradeSql() {
  return extractWriteGrantsUpgrade(
    readFileSync(
      resolve(dbPackageRoot, "supabase/migrations/20260730000000_mvp_baseline.sql"),
      "utf8",
    ),
  );
}

/** A byte-for-byte bounded extraction prevents the local operation from broadening. */
export function extractWriteGrantsUpgrade(baseline: string) {
  const count = (marker: string) => baseline.split(marker).length - 1;
  if (count(beginMarker) !== 1 || count(endMarker) !== 1)
    throw new Error("write-grant upgrade sentinels must occur exactly once");
  const start = baseline.indexOf(beginMarker) + beginMarker.length;
  const end = baseline.indexOf(endMarker, start);
  if (end < start) throw new Error("write-grant upgrade sentinel order is invalid");
  const unit = baseline.slice(start, end).trim();
  const statements = unit
    .replace(/\$\$[\s\S]*?\$\$|'(?:''|[^'])*'|--[^\n]*/g, (token) =>
      token.startsWith("--") ? "" : token.startsWith("$$") ? "BODY" : "LITERAL",
    )
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  const functions =
    "public\\.(?:grant_athlete_coaching_write_access|revoke_athlete_coaching_write_access)";
  const allowed = [
    new RegExp(`^CREATE FUNCTION ${functions}\\([^;]+ AS BODY$`),
    /^CREATE OR REPLACE FUNCTION public\.prevent_athlete_coaching_write_policy_mutation\(\) RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS BODY$/,
    /^CREATE FUNCTION public\.lock_athlete_coaching_write_policy_scope\(\) RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS BODY$/,
    /^CREATE TRIGGER athlete_coaching_write_policy_versions_scope_lock BEFORE INSERT ON public\.athlete_coaching_write_policy_versions FOR EACH ROW EXECUTE FUNCTION public\.lock_athlete_coaching_write_policy_scope\(\)$/,
    /^REVOKE ALL ON FUNCTION public\.grant_athlete_coaching_write_access\([^;]+\), public\.revoke_athlete_coaching_write_access\([^;]+\) FROM PUBLIC, anon, authenticated$/,
    /^GRANT EXECUTE ON FUNCTION public\.grant_athlete_coaching_write_access\([^;]+\), public\.revoke_athlete_coaching_write_access\([^;]+\) TO service_role$/,
  ];
  if (
    statements.length !== 7 ||
    statements.some((statement) => !allowed.some((rule) => rule.test(statement)))
  )
    throw new Error("write-grant extraction contains an unexpected object scope");
  return `-- Approved coaching write-grant RPC upgrade only. Use the guarded runner.\nBEGIN;\nSET LOCAL search_path = public, pg_catalog;\n${unit}\nCOMMIT;\n`;
}

export function assertUpgradeArtifact(sql: string) {
  if (sql !== expectedUpgradeSql())
    throw new Error(
      "upgrade artifact differs from bounded authoritative source; refusing execution",
    );
}

export function materializeUpgrade() {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "upgrade.sql"), expectedUpgradeSql());
  writeFileSync(
    resolve(directory, "before-fingerprint.json"),
    `${JSON.stringify(expectedPrerequisiteFingerprint(), null, 2)}\n`,
  );
  writeFileSync(
    resolve(directory, "after-fingerprint.json"),
    `${readFileSync(resolve(dbPackageRoot, "schema-fingerprint.json"), "utf8").trim()}\n`,
  );
}

/** Disposable-only proof runner; operational application is deliberately unsupported. */
export async function applyCoachingWriteGrantsUpgrade(
  pool: Pool,
  options: {
    /** Disposable test fault only; no operational apply command exists. */
    testAfterDdl?: (client: import("pg").PoolClient) => Promise<void>;
  } = {},
) {
  const sql = readFileSync(resolve(directory, "upgrade.sql"), "utf8");
  const before = JSON.parse(readFileSync(resolve(directory, "before-fingerprint.json"), "utf8"));
  const after = expectedAfterFingerprint();
  assertUpgradeArtifact(sql);
  if (JSON.stringify(before) !== JSON.stringify(expectedPrerequisiteFingerprint()))
    throw new Error("prerequisite fingerprint artifact differs from pinned source");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'; set local statement_timeout = '60s'");
    await client.query("lock table public.organizations in access exclusive mode");
    if (JSON.stringify(await createSchemaFingerprint(client)) !== JSON.stringify(before))
      throw new Error(
        "pre-upgrade fingerprint mismatch; refusing unexpected, partial or already-installed schema",
      );
    await client.query(sql.replace("\nBEGIN;\n", "\n").replace(/COMMIT;\n$/, ""));
    await options.testAfterDdl?.(client);
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
