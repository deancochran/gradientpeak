/** One retained-E2E reconciliation; deliberately not a general migration runner. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool, type PoolClient } from "pg";
import { dbPackageRoot } from "./_helpers";
import { createSchemaFingerprint } from "./check-schema-fingerprint";

const directory = resolve(dbPackageRoot, "supabase/approved-upgrades/retained-e2e");
const baselinePath = resolve(dbPackageRoot, "supabase/migrations/20260730000000_mvp_baseline.sql");
const beforePath = resolve(directory, "before-fingerprint.json");
const sqlPath = resolve(directory, "upgrade.sql");
const inventoryPath = resolve(directory, "table-inventory.json");
const afterPath = resolve(directory, "after-fingerprint.json");
export const retainedTables = [
  "chatbot_operation_receipts",
  "organization_invitations",
  "organization_groups",
  "organization_group_athletes",
  "organization_group_coach_assignments",
  "chatbot_threads",
  "chatbot_turns",
  "chatbot_actions",
  "deferred_threshold_calibrations",
] as const;
const groupTables = retainedTables.filter((name) => name.startsWith("organization_"));
const groupFunctions = [
  "coaching_athlete_read_access_decision",
  "prevent_organization_group_mutation",
  "guard_organization_group_authority",
  "audit_organization_group_change",
  "prevent_organization_group_athlete_mutation",
  "prevent_organization_group_coach_assignment_mutation",
  "validate_current_organization_group_relationship",
  "validate_organization_invitation_actor",
];
const advisoryLockName = ["gradientpeak", "retained-e2e-upgrade"].join(":");
const advisoryLockQuery = ["select pg_try_advisory_xact_lock", "(hashtext($1)) as acquired"].join(
  "",
);
export const sha256Hex = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const retainedSchemas = ["public", "auth", "storage", "supabase_migrations"] as const;
export type RetainedTableDigest = { count: string; sha256: string };
export type RetainedDataMap = Record<string, RetainedTableDigest>;
export type RetainedE2ETargetIdentity = {
  containerId: string;
  database: string;
  serverAddress: string | null;
  serverPort: string | null;
  systemIdentifier: string | null;
};
export type RetainedUpgradeOptions = {
  expectedSourceData?: RetainedDataMap;
  requireReviewedInventory?: boolean;
};

function tableDefinition(source: string, table: string) {
  const match = source.match(
    new RegExp(`^CREATE TABLE (?:"${table}"|public\\.${table}) \\([\\s\\S]*?^\\);`, "mi"),
  );
  if (!match) throw new Error(`approved source missing table: ${table}`);
  return match[0];
}
function functionDefinition(source: string, name: string) {
  const match = source.match(
    new RegExp(`^CREATE OR REPLACE FUNCTION "public"\\."${name}"\\([\\s\\S]*?\\$\\$;`, "mi"),
  );
  if (!match) throw new Error(`approved source missing function: ${name}`);
  return match[0];
}
/** Bounded extraction from the authoritative fresh baseline. */
export function expectedUpgradeSql() {
  const source = readFileSync(baselinePath, "utf8");
  const statements = retainedTables.map((table) => tableDefinition(source, table));
  for (const line of source.split("\n")) {
    if (retainedTables.some((table) => line.startsWith(`ALTER TABLE "${table}" ADD CONSTRAINT`)))
      statements.push(line);
  }
  for (const match of source.matchAll(/^CREATE (?:UNIQUE )?INDEX [\s\S]*?;$/gim)) {
    const definition = match[0].toLowerCase();
    if (
      retainedTables.some(
        (table) =>
          definition.includes(` on "${table}" `) || definition.includes(` on public.${table}(`),
      )
    ) {
      statements.push(match[0]);
    }
  }
  for (const name of groupFunctions) statements.push(functionDefinition(source, name));
  for (const line of source.split("\n")) {
    if (
      groupTables.some((table) => line.includes(` ON public.${table} `)) &&
      /^(CREATE|CREATE CONSTRAINT) TRIGGER /.test(line)
    )
      statements.push(line);
  }
  // The baseline's schema-wide grant occurs after these four tables. Reproduce only
  // its net ACL for this bounded surface, never the broad grant itself.
  for (const table of groupTables)
    statements.push(
      `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role;`,
      `GRANT SELECT ON TABLE public.${table} TO service_role;`,
    );
  for (const table of retainedTables.filter((table) => !groupTables.includes(table as never))) {
    statements.push(
      `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      `REVOKE ALL ON TABLE public.${table} FROM anon, authenticated;`,
    );
  }
  return `-- Approved retained-E2E reconciliation only. Use the guarded runner.\nBEGIN;\nSET LOCAL search_path = public, pg_catalog;\n${statements.join("\n\n")}\nCOMMIT;\n`;
}
export function assertUpgradeArtifact(sql: string) {
  if (sql !== expectedUpgradeSql())
    throw new Error("upgrade artifact differs from bounded authoritative source");
}
export function expectedBeforeFingerprint() {
  return JSON.parse(readFileSync(beforePath, "utf8"));
}
export function expectedAfterFingerprint() {
  return JSON.parse(readFileSync(afterPath, "utf8"));
}
export function materializeUpgrade() {
  mkdirSync(directory, { recursive: true });
  writeFileSync(sqlPath, expectedUpgradeSql());
  console.log(
    "[retained-e2e:upgrade] materialized bounded SQL; before fingerprint is a separately reviewed canonical artifact",
  );
}
function publicTables(fingerprint: Record<string, unknown>) {
  const relations = fingerprint.publicRelations;
  if (!Array.isArray(relations))
    throw new Error("before fingerprint lacks public relation inventory");
  return relations
    .flatMap((row) =>
      row &&
      typeof row === "object" &&
      (row as { kind?: string }).kind?.match(/^[rp]$/) &&
      typeof (row as { name?: unknown }).name === "string"
        ? [(row as { name: string }).name]
        : [],
    )
    .sort();
}
export async function retainedDataTables(client: Pick<PoolClient, "query">) {
  const result = await client.query(
    "select schemaname, tablename from pg_catalog.pg_tables where schemaname = any($1::text[]) order by schemaname, tablename",
    [retainedSchemas],
  );
  return result.rows.map((row) => ({
    schema: String(row.schemaname),
    table: String(row.tablename),
  }));
}
function retainedTableKey(schema: string, table: string) {
  return `${quote(schema)}.${quote(table)}`;
}
export function expectedRetainedTableInventory() {
  const value: unknown = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string"))
    throw new Error("reviewed retained table inventory is invalid");
  return value;
}
export function assertRetainedTableInventory(data: RetainedDataMap) {
  if (!same(Object.keys(data).sort(), expectedRetainedTableInventory()))
    throw new Error("retained table inventory mismatch");
}
export function assertPostUpgradeTableInventory(before: RetainedDataMap, after: RetainedDataMap) {
  const expected = [
    ...Object.keys(before),
    ...retainedTables.map((table) => retainedTableKey("public", table)),
  ].sort();
  if (!same(Object.keys(after).sort(), expected))
    throw new Error("post-upgrade retained table inventory mismatch");
}
export async function lockRetainedDataTables(
  client: PoolClient,
  tables: Awaited<ReturnType<typeof retainedDataTables>>,
) {
  for (const { schema, table } of tables)
    await client.query(`lock table ${quote(schema)}.${quote(table)} in access exclusive mode`);
}
export async function createRetainedDataDigest(
  client: Pick<Pool, "query"> | Pick<PoolClient, "query">,
): Promise<RetainedDataMap> {
  const digests: RetainedDataMap = {};
  for (const { schema, table } of await retainedDataTables(client)) {
    const result = await client.query(
      `select count(*)::text as count, encode(extensions.digest(coalesce(string_agg(row_sha256, '' order by row_sha256), '')::text, 'sha256'::text), 'hex') as sha256 from (select encode(extensions.digest(pg_catalog.to_jsonb(t)::text, 'sha256'::text), 'hex') as row_sha256 from ${quote(schema)}.${quote(table)} t) rows`,
    );
    digests[retainedTableKey(schema, table)] = result.rows[0] as RetainedTableDigest;
  }
  return digests;
}
function same(value: unknown, expected: unknown) {
  return JSON.stringify(value) === JSON.stringify(expected);
}
/** Exported for the isolated restore rehearsal; never calls a real target by itself. */
export async function applyRetainedE2EUpgrade(pool: Pool, options: RetainedUpgradeOptions = {}) {
  const sql = readFileSync(sqlPath, "utf8");
  assertUpgradeArtifact(sql);
  const before = expectedBeforeFingerprint() as Record<string, unknown>;
  const expectedAfter = expectedAfterFingerprint();
  const tables = publicTables(before);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'; set local statement_timeout = '60s'");
    if (!(await client.query(advisoryLockQuery, [advisoryLockName])).rows[0]?.acquired)
      throw new Error("retained upgrade already running");
    for (const table of tables)
      await client.query(`lock table public.${quote(table)} in access exclusive mode`);
    const retainedDataTablesBefore = await retainedDataTables(client);
    await lockRetainedDataTables(client, retainedDataTablesBefore);
    await client.query("set local role postgres");
    if ((await client.query("select current_user as role")).rows[0]?.role !== "postgres")
      throw new Error("retained upgrade requires postgres DDL role after locks");
    const actualBefore = await createSchemaFingerprint(client);
    if (!same(actualBefore, before)) throw new Error("pre-upgrade fingerprint mismatch");
    const beforeData = await createRetainedDataDigest(client);
    if (options.requireReviewedInventory) assertRetainedTableInventory(beforeData);
    if (options.expectedSourceData && !same(beforeData, options.expectedSourceData))
      throw new Error("pre-upgrade retained data digest mismatch");
    await client.query(sql.replace("\nBEGIN;\n", "\n").replace(/COMMIT;\n$/, ""));
    const afterAllData = await createRetainedDataDigest(client);
    assertPostUpgradeTableInventory(beforeData, afterAllData);
    const afterData = Object.fromEntries(
      Object.keys(beforeData).map((table) => [table, afterAllData[table]]),
    );
    if (!same(beforeData, afterData)) throw new Error("pre-existing table data digest mismatch");
    const actualAfter = await createSchemaFingerprint(client);
    if (!same(actualAfter, expectedAfter)) {
      const sections = [...new Set([...Object.keys(actualAfter), ...Object.keys(expectedAfter)])]
        .filter((section) => !same(actualAfter[section], expectedAfter[section]))
        .join(",");
      throw new Error(`post-upgrade fingerprint mismatch: ${sections}`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
export type ArchiveManifest = {
  target: string;
  createdAt: string;
  archiveSha256: string;
  beforeFingerprintSha256: string;
};
export type RehearsalReceipt = ArchiveManifest & {
  sqlSha256: string;
  afterFingerprintSha256: string;
  successful: true;
  sourceTargetIdentity: RetainedE2ETargetIdentity;
  sourceData: RetainedDataMap;
};
function privateFile(path: string) {
  return (statSync(path).mode & 0o077) === 0;
}
export function verifyRecoveryArchive(archive: string) {
  const manifestPath = `${archive}.manifest.json`;
  if (
    !privateFile(archive) ||
    !privateFile(manifestPath) ||
    readFileSync(archive).subarray(0, 5).toString() !== "PGDMP"
  )
    throw new Error("private custom recovery archive and manifest required");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ArchiveManifest;
  const age = Date.now() - Date.parse(manifest.createdAt);
  if (
    manifest.target !== "127.0.0.1:55322/postgres" ||
    manifest.archiveSha256 !== sha256Hex(readFileSync(archive)) ||
    manifest.beforeFingerprintSha256 !== sha256Hex(JSON.stringify(expectedBeforeFingerprint())) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 60 * 60 * 1000
  )
    throw new Error("recovery archive manifest mismatch");
  return manifest;
}
export function verifyRehearsalReceipt(
  path: string,
  archive: string,
  activationIdentity?: RetainedE2ETargetIdentity,
) {
  if (!privateFile(path)) throw new Error("private successful restore rehearsal receipt required");
  const receipt = JSON.parse(readFileSync(path, "utf8")) as RehearsalReceipt;
  const manifest = verifyRecoveryArchive(archive);
  if (
    receipt.successful !== true ||
    receipt.target !== manifest.target ||
    receipt.archiveSha256 !== manifest.archiveSha256 ||
    receipt.beforeFingerprintSha256 !== manifest.beforeFingerprintSha256 ||
    receipt.sqlSha256 !== sha256Hex(readFileSync(sqlPath)) ||
    receipt.afterFingerprintSha256 !== sha256Hex(JSON.stringify(expectedAfterFingerprint())) ||
    !receipt.sourceTargetIdentity ||
    !receipt.sourceData
  )
    throw new Error("restore rehearsal receipt is not bound to this archive and artifacts");
  assertRetainedTableInventory(receipt.sourceData);
  if (activationIdentity && !same(receipt.sourceTargetIdentity, activationIdentity))
    throw new Error("restore rehearsal receipt source target identity mismatch");
  return receipt;
}
export function assertRetainedE2EConnectionString(connectionString: string) {
  const target = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "127.0.0.1" ||
    target.port !== "55322" ||
    target.pathname !== "/postgres" ||
    !["postgres", "supabase_admin"].includes(target.username) ||
    target.search ||
    target.hash
  )
    throw new Error("refusing non-retained-E2E target");
  return target;
}
export function inspectRetainedE2ETarget(connectionString: string) {
  assertRetainedE2EConnectionString(connectionString);
  let raw: string;
  try {
    raw = execFileSync("docker", ["inspect", "supabase_db_gradientpeak_e2e"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("retained-E2E Docker database identity unavailable");
  }
  const inspected = JSON.parse(raw)[0] as
    | {
        Id?: unknown;
        State?: { Running?: unknown };
        Config?: { Labels?: Record<string, string> };
        NetworkSettings?: { Ports?: Record<string, unknown> };
      }
    | undefined;
  const labels = inspected?.Config?.Labels;
  const ports = inspected?.NetworkSettings?.Ports?.["5432/tcp"];
  if (
    typeof inspected?.Id !== "string" ||
    inspected?.State?.Running !== true ||
    labels?.["com.supabase.cli.project"] !== "gradientpeak_e2e" ||
    labels?.["com.docker.compose.project"] !== "gradientpeak_e2e" ||
    !Array.isArray(ports) ||
    !ports.some(
      (port: { HostIp?: string; HostPort?: string }) =>
        ["127.0.0.1", "::1"].includes(port.HostIp ?? "") && port.HostPort === "55322",
    )
  )
    throw new Error("retained-E2E Docker namespace or loopback port mismatch");
  return { containerId: inspected.Id };
}
export async function deriveRetainedE2ETargetIdentity(
  pool: Pool,
  connectionString: string,
  inspected = inspectRetainedE2ETarget,
): Promise<RetainedE2ETargetIdentity> {
  const container = inspected(connectionString);
  const identity = await pool.query(
    "select current_database() as database, inet_server_addr()::text as server_address, inet_server_port()::text as server_port",
  );
  let systemIdentifier: string | null = null;
  try {
    const system = await pool.query("select system_identifier::text from pg_control_system()");
    systemIdentifier = system.rows[0]?.system_identifier ?? null;
  } catch {
    // Some non-superuser connections cannot read control metadata; do not elevate.
  }
  const row = identity.rows[0];
  if (!row || row.database !== "postgres")
    throw new Error("retained-E2E database identity mismatch");
  return {
    containerId: container.containerId,
    database: row.database,
    serverAddress: row.server_address ?? null,
    serverPort: row.server_port ?? null,
    systemIdentifier,
  };
}
export function assertRetainedE2ETarget(connectionString: string) {
  return inspectRetainedE2ETarget(connectionString);
}
async function main() {
  if (process.argv.includes("--materialize")) return materializeUpgrade();
  if (!process.argv.includes("--apply-retained-e2e-upgrade"))
    throw new Error("explicit retained-E2E upgrade flag required");
  const url = process.env.RETAINED_E2E_DATABASE_URL,
    archive = process.env.RETAINED_E2E_BACKUP,
    receipt = process.env.RETAINED_E2E_REHEARSAL_RECEIPT;
  if (!url || !archive || !receipt)
    throw new Error(
      "explicit retained target, fresh backup, and successful rehearsal receipt required",
    );
  assertRetainedE2ETarget(url);
  if (new URL(url).username !== "supabase_admin")
    throw new Error("retained activation requires supabase_admin for protected table locks");
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const identity = await deriveRetainedE2ETargetIdentity(pool, url);
    const rehearsal = verifyRehearsalReceipt(receipt, archive, identity);
    await applyRetainedE2EUpgrade(pool, {
      expectedSourceData: rehearsal.sourceData,
      requireReviewedInventory: true,
    });
    console.log("[retained-e2e:upgrade] committed; full schema and preserved-data digests match");
  } finally {
    await pool.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      "[retained-e2e:upgrade] failed; no success claimed. Inspect guarded diagnostics.",
    );
    process.exitCode = 1;
  });
