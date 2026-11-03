/**
 * One operational restore rehearsal / activation runner for the approved auth
 * identity compatibility upgrade. It deliberately has no backup creation,
 * reset, seed, or generic migration path.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { withDisposableDatabase } from "./_disposable-target";
import {
  applyAuthIdentityCompatibilityUpgrade,
  expectedAuthIdentityCompatibilityAfterFingerprint,
  expectedAuthIdentityCompatibilityBeforeFingerprint,
  expectedAuthIdentityCompatibilityUpgradeSql,
} from "./auth-identity-compatibility-upgrade";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import { createRetainedDataDigest, type RetainedDataMap } from "./retained-e2e-upgrade";

const maxArchiveAgeMs = 60 * 60 * 1000;
const localRestoreContainer = "supabase_db_gradientpeak";

export type AuthIdentityTargetName = "preview" | "e2e";
export type AuthIdentityTargetIdentity = {
  target: AuthIdentityTargetName;
  containerId: string;
  database: string;
  serverAddress: string | null;
  serverPort: string | null;
  systemIdentifier: string | null;
};
export type AuthIdentityArchiveManifest = {
  target: string;
  createdAt: string;
  archiveSha256: string;
  beforeFingerprintSha256: string;
};
export type AuthIdentityRehearsalReceipt = AuthIdentityArchiveManifest & {
  successful: true;
  sqlSha256: string;
  afterFingerprintSha256: string;
  sourceTargetIdentity: AuthIdentityTargetIdentity;
  sourceData: RetainedDataMap;
};

export const sha256Hex = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const privateFile = (path: string) => (statSync(path).mode & 0o077) === 0;

export function authIdentityTargetFromConnectionString(
  connectionString: string,
): AuthIdentityTargetName {
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/postgres" ||
    url.search ||
    url.hash ||
    url.username !== "supabase_admin"
  )
    throw new Error("refusing non-operational auth identity target");
  if (url.port === "54322") return "preview";
  if (url.port === "55322") return "e2e";
  throw new Error("refusing non-operational auth identity target");
}

export function authIdentityManifestTarget(target: AuthIdentityTargetName) {
  return `${target}:127.0.0.1:${target === "preview" ? "54322" : "55322"}/postgres`;
}

export function assertAuthIdentityPortBindings(target: AuthIdentityTargetName, ports: unknown) {
  // Pin the already-activated preview's existing Docker bindings; never create
  // or widen bindings here. All actual connections still use literal loopback.
  const expected =
    target === "preview"
      ? [
          { HostIp: "0.0.0.0", HostPort: "54322" },
          { HostIp: "::", HostPort: "54322" },
        ]
      : [{ HostIp: "127.0.0.1", HostPort: "55322" }];
  const normalize = (value: unknown) =>
    Array.isArray(value) ? value.map((port) => `${port?.HostIp}:${port?.HostPort}`).sort() : [];
  if (!same(normalize(ports), normalize(expected)))
    throw new Error("operational auth identity published bindings differ from activated target");
}

export function inspectAuthIdentityTarget(connectionString: string): {
  target: AuthIdentityTargetName;
  containerId: string;
} {
  const target = authIdentityTargetFromConnectionString(connectionString);
  const container =
    target === "preview" ? "supabase_db_gradientpeak" : "supabase_db_gradientpeak_e2e";
  let inspected: unknown;
  try {
    inspected = JSON.parse(
      execFileSync("docker", ["inspect", container], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    )[0];
  } catch {
    throw new Error("operational auth identity Docker target unavailable");
  }
  const value = inspected as {
    Id?: unknown;
    State?: { Running?: unknown };
    Config?: { Labels?: Record<string, string> };
    NetworkSettings?: { Ports?: Record<string, unknown> };
  };
  const expectedProject = target === "preview" ? "gradientpeak" : "gradientpeak_e2e";
  const ports = value.NetworkSettings?.Ports?.["5432/tcp"];
  assertAuthIdentityPortBindings(target, ports);
  if (
    typeof value.Id !== "string" ||
    value.State?.Running !== true ||
    value.Config?.Labels?.["com.supabase.cli.project"] !== expectedProject ||
    value.Config?.Labels?.["com.docker.compose.project"] !== expectedProject
  )
    throw new Error("operational auth identity Docker namespace or loopback port mismatch");
  return { target, containerId: value.Id };
}

export async function deriveAuthIdentityTargetIdentity(
  pool: Pool,
  connectionString: string,
  inspect = inspectAuthIdentityTarget,
): Promise<AuthIdentityTargetIdentity> {
  const container = inspect(connectionString);
  const identity = await pool.query(
    "select current_database() as database, inet_server_addr()::text as server_address, inet_server_port()::text as server_port",
  );
  const row = identity.rows[0];
  if (!row || row.database !== "postgres")
    throw new Error("operational auth identity database identity mismatch");
  let systemIdentifier: string | null = null;
  try {
    systemIdentifier =
      (await pool.query("select system_identifier::text from pg_control_system()")).rows[0]
        ?.system_identifier ?? null;
  } catch {
    // Do not elevate a source connection merely to read optional control metadata.
  }
  return {
    target: container.target,
    containerId: container.containerId,
    database: row.database,
    serverAddress: row.server_address ?? null,
    serverPort: row.server_port ?? null,
    systemIdentifier,
  };
}

export function verifyAuthIdentityRecoveryArchive(archive: string, target: AuthIdentityTargetName) {
  const manifestPath = `${archive}.manifest.json`;
  if (
    !privateFile(archive) ||
    !privateFile(manifestPath) ||
    readFileSync(archive).subarray(0, 5).toString() !== "PGDMP"
  )
    throw new Error("private custom recovery archive and manifest required");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AuthIdentityArchiveManifest;
  const age = Date.now() - Date.parse(manifest.createdAt);
  if (
    manifest.target !== authIdentityManifestTarget(target) ||
    manifest.archiveSha256 !== sha256Hex(readFileSync(archive)) ||
    manifest.beforeFingerprintSha256 !==
      sha256Hex(JSON.stringify(expectedAuthIdentityCompatibilityBeforeFingerprint())) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > maxArchiveAgeMs
  )
    throw new Error("auth identity recovery archive manifest mismatch");
  return manifest;
}

export function verifyAuthIdentityRehearsalReceipt(
  receiptPath: string,
  archive: string,
  identity: AuthIdentityTargetIdentity,
) {
  if (!privateFile(receiptPath))
    throw new Error("private successful auth identity rehearsal receipt required");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as AuthIdentityRehearsalReceipt;
  const manifest = verifyAuthIdentityRecoveryArchive(archive, identity.target);
  if (
    receipt.successful !== true ||
    receipt.target !== manifest.target ||
    receipt.archiveSha256 !== manifest.archiveSha256 ||
    receipt.beforeFingerprintSha256 !== manifest.beforeFingerprintSha256 ||
    receipt.sqlSha256 !== sha256Hex(expectedAuthIdentityCompatibilityUpgradeSql()) ||
    receipt.afterFingerprintSha256 !==
      sha256Hex(JSON.stringify(expectedAuthIdentityCompatibilityAfterFingerprint())) ||
    !receipt.sourceTargetIdentity ||
    !receipt.sourceData ||
    !same(receipt.sourceTargetIdentity, identity)
  )
    throw new Error("auth identity rehearsal receipt is not bound to this archive and target");
  return receipt;
}

function restoreArchiveIntoDisposableDatabase(
  archive: Buffer,
  database: string,
  sourceFingerprint: unknown,
  diagnostics: string,
) {
  const pre = spawnSync(
    "docker",
    ["exec", "-i", localRestoreContainer, "pg_restore", "--section=pre-data", "--file=-"],
    {
      input: archive,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  assert.equal(pre.status, 0, "pre-data extraction failed");
  const columns = (
    sourceFingerprint as { columns?: Array<{ table: string; name: string; position: number }> }
  ).columns;
  assert.ok(columns, "legacy fingerprint lacks columns");
  const drops: string[] = [];
  const preSql = pre.stdout.replace(
    /CREATE TABLE public\.(\w+) \(\n([\s\S]*?)\n\);/g,
    (definition, table, body) => {
      const tableColumns = columns.filter((column) => column.table === table);
      if (!tableColumns.length) return definition;
      let position = 0;
      const lines: string[] = [];
      for (const line of body.split("\n")) {
        const column = tableColumns.find(
          (candidate) =>
            line.startsWith(`    ${candidate.name} `) ||
            line.startsWith(`    "${candidate.name}" `),
        );
        if (column) {
          while (position + 1 < column.position) {
            position++;
            const placeholder = `restore_dropped_slot_${position}`;
            lines.push(`    ${placeholder} integer,`);
            drops.push(`ALTER TABLE public."${table}" DROP COLUMN "${placeholder}";`);
          }
          position++;
          assert.equal(position, column.position);
        }
        lines.push(line);
      }
      assert.equal(position, Math.max(...tableColumns.map((column) => column.position)));
      return `CREATE TABLE public.${table} (\n${lines.join("\n")}\n);`;
    },
  );
  const schema = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      localRestoreContainer,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      database,
    ],
    {
      input: `${preSql}\n${drops.join("\n")}`,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  writeFileSync(diagnostics, String(schema.stderr ?? ""), { mode: 0o600 });
  assert.equal(schema.status, 0, "schema restoration failed; diagnostics kept private");
  const restored = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      localRestoreContainer,
      "pg_restore",
      "--section=data",
      "--section=post-data",
      "--exit-on-error",
      "-U",
      "supabase_admin",
      "-d",
      database,
    ],
    {
      input: archive,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  writeFileSync(diagnostics, `${restored.stdout}\n${restored.stderr}`, { mode: 0o600 });
  assert.equal(restored.status, 0, "archive restoration failed; diagnostics kept private");
}

async function rehearse(directory: string, sourceUrl: string) {
  const target = authIdentityTargetFromConnectionString(sourceUrl);
  const archivePath = resolve(directory, "postgres.dump");
  const manifest = verifyAuthIdentityRecoveryArchive(archivePath, target);
  const source = new Pool({
    connectionString: sourceUrl,
    options: "-c default_transaction_read_only=on",
    max: 1,
  });
  try {
    const sourceIdentity = await deriveAuthIdentityTargetIdentity(source, sourceUrl);
    await source.query("begin isolation level repeatable read read only");
    const sourceFingerprint = await createSchemaFingerprint(source);
    assert.deepEqual(
      sourceFingerprint,
      expectedAuthIdentityCompatibilityBeforeFingerprint(),
      "source fingerprint differs",
    );
    const sourceData = await createRetainedDataDigest(source);
    await source.query("commit");
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "auth_identity_restore",
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
          "restored data differs from source",
        );
        const cloneAdminUrl = new URL(cloneUrl);
        cloneAdminUrl.username = "supabase_admin";
        const cloneAdmin = new Pool({ connectionString: cloneAdminUrl.toString(), max: 1 });
        try {
          await applyAuthIdentityCompatibilityUpgrade(cloneAdmin, {
            expectedSourceData: sourceData,
            requireExactDataInventory: true,
          });
        } finally {
          await cloneAdmin.end();
        }
        assert.deepEqual(
          await createSchemaFingerprint(clone),
          expectedAuthIdentityCompatibilityAfterFingerprint(),
        );
        assert.deepEqual(
          await createRetainedDataDigest(clone),
          sourceData,
          "upgrade changed restored data",
        );
      },
    );
    const receipt: AuthIdentityRehearsalReceipt = {
      ...manifest,
      successful: true,
      sqlSha256: sha256Hex(expectedAuthIdentityCompatibilityUpgradeSql()),
      afterFingerprintSha256: sha256Hex(
        JSON.stringify(expectedAuthIdentityCompatibilityAfterFingerprint()),
      ),
      sourceTargetIdentity: sourceIdentity,
      sourceData,
    };
    writeFileSync(resolve(directory, "rehearsal-receipt.json"), JSON.stringify(receipt, null, 2), {
      mode: 0o600,
    });
    console.log(
      "[auth-identity:operation] full archive restore rehearsal succeeded; private receipt written",
    );
  } finally {
    await source.end();
  }
}

async function activate(url: string, archive: string, receiptPath: string) {
  authIdentityTargetFromConnectionString(url);
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const identity = await deriveAuthIdentityTargetIdentity(pool, url);
    const receipt = verifyAuthIdentityRehearsalReceipt(receiptPath, archive, identity);
    // apply rechecks this digest only after it owns every relevant table lock.
    await applyAuthIdentityCompatibilityUpgrade(pool, {
      expectedSourceData: receipt.sourceData,
      requireExactDataInventory: true,
    });
    console.log("[auth-identity:operation] committed; full schema and data digest checks match");
  } finally {
    await pool.end();
  }
}

async function main() {
  const rehearseMode = process.argv.includes("--rehearse");
  const applyMode = process.argv.includes("--apply-auth-identity-compatibility-upgrade");
  if (rehearseMode === applyMode)
    throw new Error("choose exactly one explicit auth identity operation mode");
  if (rehearseMode) {
    const directory = process.env.AUTH_IDENTITY_RECOVERY_DIRECTORY;
    const source = process.env.AUTH_IDENTITY_SOURCE_DATABASE_URL;
    if (!directory || !source)
      throw new Error("explicit private recovery directory and source target required");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    return rehearse(directory, source);
  }
  const url = process.env.AUTH_IDENTITY_DATABASE_URL;
  const archive = process.env.AUTH_IDENTITY_BACKUP;
  const receipt = process.env.AUTH_IDENTITY_REHEARSAL_RECEIPT;
  if (!url || !archive || !receipt)
    throw new Error("explicit target, fresh backup, and successful rehearsal receipt required");
  return activate(url, archive, receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      "[auth-identity:operation] failed; no success claimed. Inspect guarded private diagnostics.",
    );
    process.exitCode = 1;
  });
