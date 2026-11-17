/** One approved coaching-completion-review upgrade; not a general migration runner. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { dbPackageRoot } from "./_helpers";
import {
  requireGuardedDisposableLocalDatabaseUrl,
  requireManagedSupabaseDatabaseTarget,
} from "./_target-safety";
import { createSchemaFingerprint } from "./check-schema-fingerprint";

/** Exact reviewed source checkpoint; do not advance this compatibility prerequisite. */
export const prerequisite = "27be1741c23c27d46472f06a7f45c4cf000a9b02";
const table = "coaching_completion_reviews";
const directory = resolve(dbPackageRoot, "supabase/approved-upgrades/coaching-completion-review");
const baselinePath = "packages/db/supabase/migrations/20260730000000_mvp_baseline.sql";
const localBaselinePath = resolve(
  dbPackageRoot,
  "supabase/migrations/20260730000000_mvp_baseline.sql",
);
const beforePath = resolve(directory, "before-fingerprint.json");
const afterPath = resolve(directory, "after-fingerprint.json");
const currentFingerprintPath = resolve(dbPackageRoot, "schema-fingerprint.json");
const functions = [
  "validate_coaching_completion_review_insert",
  "prevent_coaching_completion_review_mutation",
] as const;

/** Extracts precisely the additive relation and its relational/RLS contract. */
export function expectedUpgradeSql() {
  const baseline = readFileSync(localBaselinePath, "utf8");
  const definition = baseline.match(
    new RegExp(`^CREATE TABLE "${table}" \\([\\s\\S]*?^\\);`, "m"),
  )?.[0];
  if (!definition) throw new Error(`missing table definition: ${table}`);
  const statements = [definition];
  for (const line of baseline.split("\n")) {
    if (
      line.startsWith(`ALTER TABLE "${table}" ADD CONSTRAINT`) ||
      line.startsWith(
        'ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_review_identity_unique"',
      ) ||
      (line.startsWith("CREATE ") && line.includes(` ON "${table}" USING `))
    )
      statements.push(line);
  }
  for (const name of functions) {
    const functionDefinition = baseline.match(
      new RegExp(`^CREATE OR REPLACE FUNCTION "public"\\."${name}"\\([\\s\\S]*?\\$\\$;`, "m"),
    )?.[0];
    if (!functionDefinition) throw new Error(`missing function definition: ${name}`);
    statements.push(functionDefinition);
  }
  for (const line of baseline.split("\n")) {
    if (
      line.startsWith("CREATE ") &&
      line.includes(" TRIGGER ") &&
      line.includes(` ON public.${table} `)
    )
      statements.push(line);
  }
  if (!baseline.includes(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`))
    throw new Error(`missing RLS contract: ${table}`);
  statements.push(
    `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
    `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role;`,
    `GRANT SELECT, INSERT ON TABLE public.${table} TO service_role;`,
  );
  for (const name of functions)
    statements.push(
      `REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC, anon, authenticated, service_role;`,
    );
  return `-- Approved coaching completion review only. Use the guarded runner, never the fresh baseline.\nBEGIN;\nSET LOCAL search_path = public, pg_catalog;\n${statements.join("\n\n")}\nCOMMIT;\n`;
}

export function assertUpgradeArtifact(sql: string) {
  if (sql !== expectedUpgradeSql())
    throw new Error(
      "upgrade artifact differs from bounded authoritative source; refusing execution",
    );
}

export function expectedPrerequisiteFingerprint() {
  return JSON.parse(
    execFileSync("git", ["show", `${prerequisite}:packages/db/schema-fingerprint.json`], {
      cwd: dbPackageRoot,
      encoding: "utf8",
    }),
  );
}

export function assertPrerequisiteArtifact(value: unknown) {
  if (JSON.stringify(value) !== JSON.stringify(expectedPrerequisiteFingerprint()))
    throw new Error("prerequisite fingerprint artifact differs from pinned source");
}

export function assertExactFingerprint(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  message: string,
) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(message);
}

/**
 * Logical pg_dump/pg_restore compacts gaps left by dropped columns. This is
 * intentionally available only to the isolated archive rehearsal: activation
 * continues to require byte-for-byte fingerprint equality.
 */
export function assertRestoreEquivalentFingerprint(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
) {
  const { columns: expectedColumns, ...expectedOther } = expected;
  const { columns: actualColumns, ...actualOther } = actual;
  if (
    JSON.stringify(expectedOther) !== JSON.stringify(actualOther) ||
    !Array.isArray(expectedColumns) ||
    !Array.isArray(actualColumns)
  )
    throw new Error("restored archive differs from pinned prerequisite");

  const withoutPhysicalPosition = (columns: unknown[]) =>
    columns.map((column) => {
      if (!column || typeof column !== "object" || Array.isArray(column))
        throw new Error("restored archive column fingerprint is invalid");
      const { position: _position, ...logicalColumn } = column as Record<string, unknown>;
      return logicalColumn;
    });

  // Fingerprint columns are sorted by table then physical attnum. Removing only
  // attnum retains each table's complete logical column sequence and every
  // column property other than the dump/restore-specific physical gap.
  if (
    JSON.stringify(withoutPhysicalPosition(expectedColumns)) !==
    JSON.stringify(withoutPhysicalPosition(actualColumns))
  )
    throw new Error("restored archive differs from pinned prerequisite");
}

export function materializeUpgrade() {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "upgrade.sql"), expectedUpgradeSql());
  writeFileSync(
    beforePath,
    execFileSync("git", ["show", `${prerequisite}:packages/db/schema-fingerprint.json`], {
      cwd: dbPackageRoot,
      encoding: "utf8",
    }),
  );
  writeFileSync(afterPath, readFileSync(currentFingerprintPath, "utf8"));
  console.log(
    "[coaching:completion-review:upgrade] materialized bounded SQL and immutable prerequisite fingerprint",
  );
}

export function prerequisiteBaseline() {
  return execFileSync("git", ["show", `${prerequisite}:${baselinePath}`], {
    cwd: dbPackageRoot,
    encoding: "utf8",
  });
}

export async function applyCoachingCompletionReviewUpgrade(pool: Pool) {
  return applyUpgrade(pool, (expected, actual, message) =>
    assertExactFingerprint(expected, actual, message),
  );
}

/**
 * Applies the reviewed upgrade only to a guarded local disposable restored copy.
 * Logical dump/restore may compact dropped-column attnum gaps; this exception is
 * deliberately unavailable to the production apply function and CLI.
 */
export async function applyCoachingCompletionReviewRestoreUpgrade(
  pool: Pool,
  connectionString: string,
) {
  requireGuardedDisposableLocalDatabaseUrl(connectionString);
  return applyUpgrade(pool, (expected, actual) =>
    assertRestoreEquivalentFingerprint(expected, actual),
  );
}

async function applyUpgrade(
  pool: Pool,
  assertFingerprint: (
    expected: Record<string, unknown>,
    actual: Record<string, unknown>,
    message: string,
  ) => void,
) {
  const sql = readFileSync(resolve(directory, "upgrade.sql"), "utf8");
  assertUpgradeArtifact(sql);
  const before = JSON.parse(readFileSync(beforePath, "utf8"));
  assertPrerequisiteArtifact(before);
  const expected = JSON.parse(readFileSync(afterPath, "utf8"));
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'; set local statement_timeout = '60s'");
    await client.query("lock table public.organizations in access exclusive mode");
    const actual = await createSchemaFingerprint(client);
    assertFingerprint(
      before,
      actual,
      "pre-upgrade fingerprint mismatch; refusing unexpected, partial or already-installed schema",
    );
    if (!sql.includes("\nBEGIN;\n") || !sql.endsWith("COMMIT;\n"))
      throw new Error("upgrade transaction envelope missing");
    await client.query(sql.replace("\nBEGIN;\n", "\n").replace(/COMMIT;\n$/, ""));
    const after = await createSchemaFingerprint(client);
    try {
      assertFingerprint(expected, after, "post-upgrade fingerprint mismatch");
    } catch {
      const sections = Object.keys(expected).filter(
        (key) => JSON.stringify(expected[key]) !== JSON.stringify(after[key]),
      );
      throw new Error(`post-upgrade fingerprint mismatch (${sections.join(", ")}); rolling back`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function verifyRecoveryArchive(backup: string) {
  const manifestPath = `${backup}.manifest.json`;
  const data = readFileSync(backup);
  if (
    (statSync(backup).mode & 0o077) !== 0 ||
    (statSync(manifestPath).mode & 0o077) !== 0 ||
    data.subarray(0, 5).toString() !== "PGDMP"
  )
    throw new Error("private archive and manifest required");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const age = Date.now() - Date.parse(manifest.createdAt);
  if (
    manifest.target !== "127.0.0.1:54322/postgres" ||
    manifest.archiveSha256 !== hash(data) ||
    manifest.beforeFingerprintSha256 !== hash(JSON.stringify(expectedPrerequisiteFingerprint())) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 60 * 60 * 1000
  )
    throw new Error("recovery manifest target, archive, prerequisite or freshness mismatch");
}

/** Activation is deliberately restricted to the literal shared-preview database identity. */
export function assertPreviewTarget(connectionString: string) {
  const target = new URL(connectionString);
  if (
    target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.port !== "54322" ||
    target.pathname !== "/postgres" ||
    target.search ||
    target.hash
  )
    throw new Error("refusing non-literal preview target");
}

export function verifyRehearsalReceipt(receiptPath: string, backup: string) {
  if ((statSync(receiptPath).mode & 0o077) !== 0)
    throw new Error("private rehearsal receipt required");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const archive = readFileSync(backup);
  const expectedAfter = readFileSync(afterPath, "utf8");
  const source = requireManagedSupabaseDatabaseTarget();
  if (
    receipt.successful !== true ||
    receipt.archiveSha256 !== hash(archive) ||
    receipt.beforeFingerprintSha256 !== hash(JSON.stringify(expectedPrerequisiteFingerprint())) ||
    receipt.sqlSha256 !== hash(expectedUpgradeSql()) ||
    receipt.afterFingerprintSha256 !== hash(expectedAfter) ||
    receipt.sourceTarget !== source.sourceTarget ||
    receipt.sourceContainerName !== source.containerName ||
    receipt.sourceServerAddress !== source.serverAddress ||
    receipt.sourceServerIdentity !== `${source.serverAddress}:5432/postgres`
  )
    throw new Error("rehearsal receipt archive, target, or compatibility binding mismatch");
}

async function main() {
  if (process.argv.slice(2).join(" ") === "--materialize") return materializeUpgrade();
  if (process.argv.slice(2).join(" ") !== "--apply-preview-upgrade")
    throw new Error("explicit approved preview-upgrade flag required");
  const connectionString = process.env.COACHING_COMPLETION_REVIEW_PREVIEW_DATABASE_URL;
  const backup = process.env.COACHING_COMPLETION_REVIEW_PREVIEW_BACKUP;
  const receipt = process.env.COACHING_COMPLETION_REVIEW_PREVIEW_REHEARSAL_RECEIPT;
  if (!connectionString || !backup || !receipt)
    throw new Error("explicit preview target, recovery backup, and rehearsal receipt required");
  assertPreviewTarget(connectionString);
  verifyRecoveryArchive(backup);
  verifyRehearsalReceipt(receipt, backup);
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    await applyCoachingCompletionReviewUpgrade(pool);
    console.log(
      "[coaching:completion-review:upgrade] committed; complete post-upgrade fingerprint matches",
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("[coaching:completion-review:upgrade] failed; no success claimed.");
    process.exitCode = 1;
  });
}
