/** One approved, fingerprint-pinned upgrade. Not a general migration runner. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { dbPackageRoot } from "./_helpers";
import { createSchemaFingerprint } from "./check-schema-fingerprint";

export const prerequisite = "1d5ac63ab7ad7a89b25bdfd1dec9a63f5b770ce4";
const directory = resolve(dbPackageRoot, "supabase/approved-upgrades/coaching-foundation");
const baselinePath = "packages/db/supabase/migrations/20260730000000_mvp_baseline.sql";
const afterPath = resolve(directory, "after-fingerprint.json");
export const groupTables = [
  "organization_invitations",
  "organization_groups",
  "organization_group_athletes",
  "organization_group_coach_assignments",
];
const functions = [
  "coaching_athlete_read_access_decision",
  "prevent_organization_group_mutation",
  "guard_organization_group_authority",
  "audit_organization_group_change",
  "prevent_organization_group_athlete_mutation",
  "prevent_organization_group_coach_assignment_mutation",
  "validate_current_organization_group_relationship",
  "validate_organization_invitation_actor",
];

/** Materializes a bounded subset of the authoritative fresh baseline for review. */
export function expectedUpgradeSql() {
  const baseline = readFileSync(
    resolve(dbPackageRoot, "supabase/migrations/20260730000000_mvp_baseline.sql"),
    "utf8",
  );
  const statements: string[] = [];
  for (const table of groupTables) {
    const definition = baseline.match(
      new RegExp(`^CREATE TABLE "${table}" \\([\\s\\S]*?^\\);`, "m"),
    )?.[0];
    if (!definition) throw new Error(`missing table definition: ${table}`);
    statements.push(definition);
  }
  for (const line of baseline.split("\n")) {
    if (
      groupTables.some(
        (table) =>
          line.startsWith(`ALTER TABLE "${table}" ADD CONSTRAINT`) ||
          (line.startsWith("CREATE ") && line.includes(` ON "${table}" USING `)),
      )
    )
      statements.push(line);
  }
  for (const name of functions) {
    const definition = baseline.match(
      new RegExp(`^CREATE OR REPLACE FUNCTION "public"\\."${name}"\\([\\s\\S]*?\\$\\$;`, "m"),
    )?.[0];
    if (!definition) throw new Error(`missing function definition: ${name}`);
    statements.push(definition);
  }
  for (const line of baseline.split("\n")) {
    if (
      line.startsWith("CREATE ") &&
      line.includes(" TRIGGER ") &&
      groupTables.some((table) => line.includes(` ON public.${table} `))
    )
      statements.push(line);
  }
  for (const table of groupTables) {
    statements.push(
      `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role;`,
      `GRANT SELECT ON TABLE public.${table} TO service_role;`,
    );
  }
  // Replacing the existing definer preserves its ACL. New functions are invoker-only
  // trigger functions; they receive the same ACL as their fresh-baseline counterparts.
  const sql = `-- Approved coaching foundation only. Use the guarded runner, never the fresh baseline.\nBEGIN;\nSET LOCAL search_path = public, pg_catalog;\n${statements.join("\n\n")}\nCOMMIT;\n`;
  return sql;
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
  if (JSON.stringify(value) !== JSON.stringify(expectedPrerequisiteFingerprint())) {
    throw new Error("prerequisite fingerprint artifact differs from pinned source");
  }
}

export function materializeUpgrade() {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "upgrade.sql"), expectedUpgradeSql());
  const oldFingerprint = execFileSync(
    "git",
    ["show", `${prerequisite}:packages/db/schema-fingerprint.json`],
    { cwd: dbPackageRoot, encoding: "utf8" },
  );
  writeFileSync(resolve(directory, "before-fingerprint.json"), oldFingerprint);
  console.log("[coaching:upgrade] materialized bounded SQL and immutable prerequisite fingerprint");
}

export function prerequisiteBaseline() {
  return execFileSync("git", ["show", `${prerequisite}:${baselinePath}`], {
    cwd: dbPackageRoot,
    encoding: "utf8",
  });
}

export async function applyCoachingUpgrade(pool: Pool) {
  const sql = readFileSync(resolve(directory, "upgrade.sql"), "utf8");
  assertUpgradeArtifact(sql);
  const before = JSON.parse(readFileSync(resolve(directory, "before-fingerprint.json"), "utf8"));
  assertPrerequisiteArtifact(before);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'; set local statement_timeout = '60s'");
    await client.query("lock table public.organizations in access exclusive mode");
    const actual = await createSchemaFingerprint(client);
    if (JSON.stringify(before) !== JSON.stringify(actual))
      throw new Error(
        "pre-upgrade fingerprint mismatch; refusing unexpected, partial or already-installed schema",
      );
    if (!sql.includes("\nBEGIN;\n") || !sql.endsWith("COMMIT;\n"))
      throw new Error("upgrade transaction envelope missing");
    await client.query(sql.replace("\nBEGIN;\n", "\n").replace(/COMMIT;\n$/, ""));
    // This one-time upgrade must remain pinned to its own reviewed historical
    // result even as the fresh baseline evolves through later compatibility work.
    const expected = JSON.parse(readFileSync(afterPath, "utf8"));
    const after = await createSchemaFingerprint(client);
    if (JSON.stringify(expected) !== JSON.stringify(after)) {
      const keys = Object.keys(expected).filter(
        (key) => JSON.stringify(expected[key]) !== JSON.stringify(after[key]),
      );
      const detail = keys
        .map((key) => {
          const a = expected[key],
            b = after[key];
          if (!Array.isArray(a) || !Array.isArray(b)) return key;
          const i = a.findIndex(
            (entry, index) => JSON.stringify(entry) !== JSON.stringify(b[index]),
          );
          return `${key}: ${JSON.stringify(a[i])} versus ${JSON.stringify(b[i])}`;
        })
        .join("\n");
      throw new Error(
        `post-upgrade fingerprint mismatch (${keys.join(", ")}); rolling back\n${detail}`,
      );
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
  const fingerprint = expectedPrerequisiteFingerprint();
  const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const age = Date.now() - Date.parse(manifest.createdAt);
  if (
    manifest.target !== "127.0.0.1:54322/postgres" ||
    manifest.archiveSha256 !== hash(data) ||
    manifest.beforeFingerprintSha256 !== hash(JSON.stringify(fingerprint)) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 60 * 60 * 1000
  ) {
    throw new Error("recovery manifest target, archive, prerequisite or freshness mismatch");
  }
}

async function main() {
  if (process.argv.slice(2).join(" ") === "--materialize") return materializeUpgrade();
  if (process.argv.slice(2).join(" ") !== "--apply-preview-upgrade")
    throw new Error("explicit approved preview-upgrade flag required");
  const connectionString = process.env.COACHING_PREVIEW_DATABASE_URL;
  const backup = process.env.COACHING_PREVIEW_BACKUP;
  if (!connectionString || !backup)
    throw new Error("explicit preview target and recovery backup required");
  const target = new URL(connectionString);
  if (target.protocol !== "postgresql:" && target.protocol !== "postgres:")
    throw new Error("PostgreSQL target required");
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.port !== "54322" ||
    target.pathname !== "/postgres"
  )
    throw new Error("refusing non-preview target");
  verifyRecoveryArchive(backup);
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    await applyCoachingUpgrade(pool);
    console.log("[coaching:upgrade] committed; complete post-upgrade fingerprint matches");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(
      "[coaching:upgrade] failed; no success claimed. Inspect guarded test diagnostics; do not print connection strings.",
    );
    process.exitCode = 1;
  });
}
