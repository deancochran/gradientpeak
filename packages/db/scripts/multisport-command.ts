#!/usr/bin/env tsx

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  activityPlanStructureSchemaV3,
  canonicalTrainingPlanStructureSchema,
  SYSTEM_TEMPLATES,
} from "@repo/core";
import { activityArtifactContentPath } from "@repo/core/activity-artifacts";
import { completedActivitySegmentSchemaV1 } from "@repo/core/activity-segments";
import pg from "pg";

import { dbPackageRoot, repoRoot } from "./_helpers";
import { canonicalJson, structureHash } from "./canonical-json";

const { Client } = pg;
export const CUTOVER_TOOL_VERSION = "multisport-cutover-v2";
export const CUTOVER_MIGRATION_VERSION = "20260717173000";
const manifestVersion = 2;
const manifestLifetimeMs = 24 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;
type Snapshot = {
  counts: Record<string, string>;
  ids: Record<string, string[]>;
  idHashes: Record<string, string>;
  rowHashes: Record<string, string>;
  applicationTables: Record<
    string,
    { count: string; ids: string[]; idHash: string; rowHash: string }
  >;
  applicationStateHash: string;
  hash: string;
};
type DbIdentity = {
  database: string;
  databaseOid: string;
  server: string;
  systemIdentifier: string;
  ledger: Array<{ version: string; name: string }>;
  ledgerHash: string;
  schemaHash: string;
};
type StorageEntry = { path: string; size: number; sha256: string };
type PhaseReceipt = { at: string; hash: string };
type CutoverManifest = {
  version: number;
  toolVersion: string;
  migrationVersion: string;
  runId: string;
  target: "rehearsal" | "local";
  generatedAt: string;
  expiresAt: string;
  gitCommit: string;
  database: DbIdentity;
  snapshot: Snapshot;
  backup: { path: string; sha256: string; restoreListHash: string };
  storageArchive: { path: string; sha256: string };
  storageRoot: string;
  sourceStorageInventory: StorageEntry[];
  sourceStorageInventoryHash: string;
  preflight?: JsonRecord;
  staging?: {
    counts: Record<string, number>;
    hashes: Record<string, string>;
    hash: string;
    promotedInventory: StorageEntry[];
    promotedInventoryHash: string;
    artifacts: JsonRecord[];
    ingestions: JsonRecord[];
    segments: JsonRecord[];
    activityPlans: Array<{
      id: string;
      structureHash: string;
      beforeSemanticHash: string | null;
      afterSemanticHash: string;
      isNewSource: boolean;
    }>;
  };
  phases: {
    guard: PhaseReceipt;
    preflight?: PhaseReceipt;
    stage?: PhaseReceipt;
    migrate?: PhaseReceipt;
    audit?: PhaseReceipt;
  };
  checksum: string;
};

type CommandContext = {
  command: string;
  args: string[];
  target: "rehearsal" | "local";
  databaseUrl: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function argument(args: string[], name: string) {
  return args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function requireFile(path: string | undefined, label: string) {
  if (!path) fail(`missing --${label}=<path>`);
  const resolved = resolve(path);
  if (!existsSync(resolved) || !lstatSync(resolved).isFile())
    fail(`${label} file does not exist: ${resolved}`);
  return resolved;
}

function requireDirectory(path: string | undefined, label: string) {
  if (!path) fail(`missing --${label}=<path>`);
  const resolved = realpathSync(resolve(path));
  if (!lstatSync(resolved).isDirectory()) fail(`${label} is not a directory: ${resolved}`);
  return resolved;
}

function sha256(content: Buffer | string) {
  return createHash("sha256").update(content).digest("hex");
}

function hashFile(path: string) {
  return sha256(readFileSync(path));
}

function deterministicUuid(seed: string) {
  const hex = sha256(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function checksumManifest(manifest: Omit<CutoverManifest, "checksum"> | CutoverManifest) {
  const { checksum: _checksum, ...unsigned } = manifest as CutoverManifest;
  return sha256(canonicalJson(unsigned));
}

export function verifyManifestChecksum(manifest: CutoverManifest) {
  if (manifest.version !== manifestVersion || manifest.toolVersion !== CUTOVER_TOOL_VERSION) {
    fail("unsupported cutover manifest version");
  }
  if (manifest.migrationVersion !== CUTOVER_MIGRATION_VERSION)
    fail("manifest migration version mismatch");
  if (checksumManifest(manifest) !== manifest.checksum) fail("cutover manifest checksum mismatch");
  if (Date.parse(manifest.expiresAt) <= Date.now()) fail("cutover manifest is stale");
}

function writeManifest(
  path: string,
  manifest: Omit<CutoverManifest, "checksum"> | CutoverManifest,
) {
  const next = { ...manifest, checksum: checksumManifest(manifest) } as CutoverManifest;
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function readManifest(path: string) {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CutoverManifest;
  verifyManifestChecksum(parsed);
  return parsed;
}

function walkFiles(root: string, directory = root): StorageEntry[] {
  const entries: StorageEntry[] = [];
  for (const name of readdirSync(directory).sort()) {
    const absolute = resolve(directory, name);
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) entries.push(...walkFiles(root, absolute));
    else if (stat.isFile())
      entries.push({
        path: relative(root, absolute).replaceAll("\\", "/"),
        size: stat.size,
        sha256: hashFile(absolute),
      });
  }
  return entries;
}

function inventoryHash(entries: StorageEntry[]) {
  return sha256(
    canonicalJson([...entries].sort((left, right) => left.path.localeCompare(right.path))),
  );
}

export function verifyStorageEntries(root: string, expected: StorageEntry[]) {
  for (const entry of expected) {
    const path = resolve(root, entry.path);
    if (
      !existsSync(path) ||
      !lstatSync(path).isFile() ||
      statSync(path).size !== entry.size ||
      hashFile(path) !== entry.sha256
    ) {
      fail(`storage manifest mismatch: ${entry.path}`);
    }
  }
}

function prepareFreshStorageTarget(path: string | undefined) {
  if (!path) fail("missing --storage=<fresh-target>");
  const target = resolve(path);
  if (existsSync(target)) {
    if (!lstatSync(target).isDirectory() || readdirSync(target).length)
      fail(`storage restore target must be an empty directory: ${target}`);
  } else {
    const parent = dirname(target);
    if (!existsSync(parent) || !lstatSync(parent).isDirectory())
      fail(`storage restore target parent does not exist: ${parent}`);
    mkdirSync(target);
  }
  return realpathSync(target);
}

export function promoteContentAddressed(input: {
  sourcePath: string;
  storageRoot: string;
  bucket: string;
  profileId: string;
  digest: string;
  byteSize: number;
  mediaType?: string;
}) {
  const logicalPath = activityArtifactContentPath(input.profileId, input.digest);
  const storageObjectId = deterministicUuid(`${input.bucket}:${logicalPath}:storage-object`);
  const storageVersion = deterministicUuid(`${input.bucket}:${logicalPath}:storage-version`);
  const destination = resolve(
    input.storageRoot,
    "stub",
    "stub",
    input.bucket,
    logicalPath,
    storageVersion,
  );
  mkdirSync(dirname(destination), { recursive: true });
  if (!existsSync(destination)) {
    try {
      copyFileSync(input.sourcePath, destination, constants.COPYFILE_EXCL);
    } catch (error) {
      if (!existsSync(destination)) throw error;
    }
  }
  const actualSize = statSync(destination).size;
  const actualDigest = hashFile(destination);
  if (actualSize !== input.byteSize || actualDigest !== input.digest) {
    fail(`content-address destination mismatch: ${logicalPath}`);
  }
  execFileSync("setfattr", [
    "-n",
    "user.supabase.content-type",
    "-v",
    input.mediaType ?? "application/octet-stream",
    destination,
  ]);
  execFileSync("setfattr", [
    "-n",
    "user.supabase.cache-control",
    "-v",
    "max-age=31536000, immutable",
    destination,
  ]);
  return {
    logicalPath,
    storageObjectId,
    storageVersion,
    destination,
    entry: {
      path: relative(input.storageRoot, destination).replaceAll("\\", "/"),
      size: actualSize,
      sha256: actualDigest,
    },
  };
}

function createContext(command: string, args: string[]): CommandContext {
  const rawTarget = argument(args, "target");
  if (rawTarget !== "rehearsal" && rawTarget !== "local")
    fail("--target must be rehearsal or local");
  const databaseUrl =
    argument(args, "database-url") ?? process.env.MULTISPORT_REHEARSAL_DATABASE_URL;
  if (!databaseUrl) fail("missing --database-url or MULTISPORT_REHEARSAL_DATABASE_URL");
  const parsed = new URL(databaseUrl);
  if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(parsed.hostname))
    fail(`refusing non-local database host ${parsed.hostname}`);
  if (rawTarget === "rehearsal" && parsed.pathname.replace(/^\//, "") === "postgres")
    fail("rehearsal target must not use the real local postgres database");
  if (
    rawTarget === "local" &&
    process.env.MULTISPORT_DESTRUCTIVE_CONFIRMATION !== "DESTROY_LOCAL_MULTISPORT_V3"
  )
    fail("local target lacks destructive confirmation");
  return { command, args, target: rawTarget, databaseUrl };
}

async function withClient<T>(context: CommandContext, run: (client: pg.Client) => Promise<T>) {
  const client = new Client({ connectionString: context.databaseUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function databaseIdentity(client: pg.Client): Promise<DbIdentity> {
  const result = await client.query<{
    database: string;
    database_oid: string;
    server: string;
    system_identifier: string;
  }>(`
    select current_database() database, (select oid::text from pg_database where datname=current_database()) database_oid,
      coalesce(inet_server_addr()::text,'local') server, system_identifier::text system_identifier
    from pg_control_system()
  `);
  const row = result.rows[0] ?? fail("database identity query returned no row");
  const ledgerResult = await client.query<{ version: string; name: string }>(
    "select version,name from supabase_migrations.schema_migrations order by version",
  );
  const schemaResult =
    await client.query(`select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
    from information_schema.columns where table_schema='public' and table_name not like '\\_multisport\\_%' escape '\\' order by table_name,ordinal_position`);
  const constraintResult =
    await client.query(`select c.relname table_name,con.conname,con.contype,pg_get_constraintdef(con.oid,true) definition
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname not like '\\_multisport\\_%' escape '\\' order by c.relname,con.conname`);
  return {
    database: row.database,
    databaseOid: row.database_oid,
    server: row.server,
    systemIdentifier: row.system_identifier,
    ledger: ledgerResult.rows,
    ledgerHash: sha256(canonicalJson(ledgerResult.rows)),
    schemaHash: sha256(
      canonicalJson({ columns: schemaResult.rows, constraints: constraintResult.rows }),
    ),
  };
}

const snapshotTables = [
  "activities",
  "activity_plans",
  "training_plans",
  "events",
  "activity_efforts",
  "activity_file_ingestions",
] as const;

async function databaseSnapshot(client: pg.Client): Promise<Snapshot> {
  const counts: Record<string, string> = {};
  const ids: Record<string, string[]> = {};
  const idHashes: Record<string, string> = {};
  const rowHashes: Record<string, string> = {};
  for (const table of snapshotTables) {
    const result = await client.query<{ count: string; ids: string[]; rows: unknown[] }>(
      `select count(*)::text count, coalesce(array_agg(id::text order by id),'{}'::text[]) ids,
        coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) rows from public.${table} t`,
    );
    const row = result.rows[0] ?? fail(`snapshot query returned no row for ${table}`);
    counts[table] = row.count;
    ids[table] = row.ids;
    idHashes[table] = sha256(canonicalJson(row.ids));
    rowHashes[table] = sha256(canonicalJson(row.rows));
  }
  const tables = await client.query<{
    table_name: string;
  }>(`select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' and table_name not like '\\_multisport\\_%' escape '\\'
    order by table_name`);
  const applicationTables: Snapshot["applicationTables"] = {};
  for (const { table_name } of tables.rows) {
    const quoted = `"${table_name.replaceAll('"', '""')}"`;
    const hasId = await client.query<{ present: boolean }>(
      `select exists(select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name='id') present`,
      [table_name],
    );
    const result = await client.query<{
      count: string;
      ids: string[];
      rows: unknown[];
    }>(`select count(*)::text count,
      ${hasId.rows[0]?.present ? "coalesce(array_agg(id::text order by id),'{}'::text[])" : "'{}'::text[]"} ids,
      coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) rows from public.${quoted} t`);
    const row = result.rows[0] ?? fail(`application-state query returned no row for ${table_name}`);
    applicationTables[table_name] = {
      count: row.count,
      ids: row.ids,
      idHash: sha256(canonicalJson(row.ids)),
      rowHash: sha256(canonicalJson(row.rows)),
    };
  }
  const applicationStateHash = sha256(canonicalJson(applicationTables));
  return {
    counts,
    ids,
    idHashes,
    rowHashes,
    applicationTables,
    applicationStateHash,
    hash: sha256(canonicalJson({ counts, idHashes, rowHashes, applicationStateHash })),
  };
}

function assertIdentity(expected: DbIdentity, actual: DbIdentity) {
  if (canonicalJson(expected) !== canonicalJson(actual))
    fail("target database identity or migration ledger changed");
}

function assertSnapshot(expected: Snapshot, actual: Snapshot) {
  if (expected.hash !== actual.hash) fail("target database snapshot changed after guard");
}

async function ensureRunTable(client: pg.Client) {
  await client.query(`create table if not exists public._multisport_cutover_runs (
    run_id uuid primary key, manifest_checksum text not null, target_database text not null,
    database_oid oid not null, system_identifier text not null, snapshot_hash text not null,
    backup_hash text not null, storage_archive_hash text not null, storage_inventory_hash text not null,
    preflight_hash text, staging_hash text, status text not null, generated_at timestamptz not null,
    expires_at timestamptz not null
  )`);
}

async function storeRun(client: pg.Client, manifest: CutoverManifest, status: string) {
  await ensureRunTable(client);
  await client.query(
    `insert into public._multisport_cutover_runs(
      run_id,manifest_checksum,target_database,database_oid,system_identifier,snapshot_hash,
      backup_hash,storage_archive_hash,storage_inventory_hash,preflight_hash,staging_hash,status,generated_at,expires_at
    ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    on conflict(run_id) do update set manifest_checksum=excluded.manifest_checksum,
      snapshot_hash=excluded.snapshot_hash,preflight_hash=excluded.preflight_hash,
      staging_hash=excluded.staging_hash,status=excluded.status`,
    [
      manifest.runId,
      manifest.checksum,
      manifest.database.database,
      manifest.database.databaseOid,
      manifest.database.systemIdentifier,
      manifest.snapshot.hash,
      manifest.backup.sha256,
      manifest.storageArchive.sha256,
      manifest.sourceStorageInventoryHash,
      manifest.preflight ? sha256(canonicalJson(manifest.preflight)) : null,
      manifest.staging?.hash ?? null,
      status,
      manifest.generatedAt,
      manifest.expiresAt,
    ],
  );
}

async function verifyRun(client: pg.Client, manifest: CutoverManifest, expectedStatus: string) {
  const result = await client.query<{
    manifest_checksum: string;
    status: string;
    staging_hash: string | null;
  }>(
    "select manifest_checksum,status,staging_hash from public._multisport_cutover_runs where run_id=$1",
    [manifest.runId],
  );
  const row = result.rows[0] ?? fail("cutover run staging identity is missing");
  if (
    row.manifest_checksum !== manifest.checksum ||
    row.status !== expectedStatus ||
    (manifest.staging && row.staging_hash !== manifest.staging.hash)
  ) {
    fail("cutover run staging identity/status mismatch");
  }
}

function validateBackup(backup: string, container: string) {
  const listing = execFileSync("docker", ["exec", "-i", container, "pg_restore", "--list"], {
    input: readFileSync(backup),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (
    !listing.includes("TABLE DATA public activities") ||
    !listing.includes("TABLE DATA storage objects")
  )
    fail("database dump lacks required public/storage data");
  return sha256(listing);
}

function extractAndValidateStorageArchive(archive: string, storageRoot: string) {
  execFileSync("tar", ["-xzf", archive, "-C", storageRoot], { maxBuffer: 20 * 1024 * 1024 });
  const listing = execFileSync("tar", ["-tzf", archive], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const inventory = walkFiles(storageRoot);
  const names = new Set(
    listing
      .split("\n")
      .filter(Boolean)
      .map((name) => name.replace(/^\.\//, "").replace(/\/$/, "")),
  );
  for (const entry of inventory)
    if (!names.has(entry.path)) fail(`storage archive is missing extracted object ${entry.path}`);
  verifyStorageEntries(storageRoot, inventory);
  return inventory;
}

async function guard(context: CommandContext) {
  if (realpathSync(repoRoot) !== "/home/deancochran/GradientPeak/.worktrees/dev")
    fail("must run in the dev worktree");
  const manifestPath = resolve(
    argument(context.args, "manifest") ?? fail("manifest argument is required"),
  );
  const backup = requireFile(argument(context.args, "backup"), "backup");
  const archive = requireFile(argument(context.args, "storage-archive"), "storage-archive");
  const storageRoot = prepareFreshStorageTarget(argument(context.args, "storage"));
  const container = argument(context.args, "db-container") ?? "supabase_db_gradientpeak";
  const sourceStorageInventory = extractAndValidateStorageArchive(archive, storageRoot);
  const restoreListHash = validateBackup(backup, container);
  await withClient(context, async (client) => {
    const generatedAt = new Date();
    const unsigned = {
      version: manifestVersion,
      toolVersion: CUTOVER_TOOL_VERSION,
      migrationVersion: CUTOVER_MIGRATION_VERSION,
      runId: argument(context.args, "run-id") ?? randomUUID(),
      target: context.target,
      generatedAt: generatedAt.toISOString(),
      expiresAt: new Date(generatedAt.getTime() + manifestLifetimeMs).toISOString(),
      gitCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim(),
      database: await databaseIdentity(client),
      snapshot: await databaseSnapshot(client),
      backup: { path: backup, sha256: hashFile(backup), restoreListHash },
      storageArchive: { path: archive, sha256: hashFile(archive) },
      storageRoot,
      sourceStorageInventory,
      sourceStorageInventoryHash: inventoryHash(sourceStorageInventory),
      phases: { guard: { at: generatedAt.toISOString(), hash: "pending" } },
    } satisfies Omit<CutoverManifest, "checksum">;
    unsigned.phases.guard.hash = sha256(
      canonicalJson({
        database: unsigned.database,
        snapshot: unsigned.snapshot,
        backup: unsigned.backup,
        storage: unsigned.sourceStorageInventoryHash,
      }),
    );
    const manifest = writeManifest(manifestPath, unsigned);
    await storeRun(client, manifest, "guarded");
    console.log(
      JSON.stringify({
        runId: manifest.runId,
        database: manifest.database.database,
        snapshotHash: manifest.snapshot.hash,
        storageObjects: manifest.sourceStorageInventory.length,
      }),
    );
  });
}

async function comprehensiveInventory(client: pg.Client) {
  const result = await client.query(`
    select jsonb_build_object(
      'ingestionsPerActivity', (select coalesce(jsonb_object_agg(n,c),'{}') from (select n,count(*) c from (select count(i.id)::text n from public.activities a left join public.activity_file_ingestions i on i.activity_id=a.id group by a.id) per_activity group by n) x),
      'activitiesWithoutFile', (select count(*) from public.activities where activity_file_path is null),
      'manualActivitiesWithoutFile', (select count(*) from public.activities where activity_file_path is null and provider is null),
      'providerJobStatuses', (select coalesce(jsonb_object_agg(status,c),'{}') from (select status::text,count(*) c from public.provider_sync_jobs group by status) x),
      'providerJobLeases', (select jsonb_build_object('locked',count(*) filter(where locked_at is not null),'expired',count(*) filter(where lock_expires_at<now())) from public.provider_sync_jobs),
      'providerResourceKinds', (select coalesce(jsonb_object_agg(resource_kind,c),'{}') from (select resource_kind::text,count(*) c from public.integration_resource_links group by resource_kind) x),
      'trainingShapes', (select coalesce(jsonb_object_agg(coalesce(v,'missing'),c),'{}') from (select structure->>'version' v,count(*) c from public.training_plans group by v) x),
      'eventScheduleBatches', (select count(*) from public.events where schedule_batch_id is not null),
      'groupEvents', (select count(*) from public.group_events),
      'activityStorageObjects', (select count(*) from storage.objects where bucket_id='activity-files'),
      'unreferencedActivityStorageObjects', (select count(*) from storage.objects o where bucket_id='activity-files' and not exists(select 1 from public.activities a where a.activity_file_path=o.name) and not exists(select 1 from public.activity_file_ingestions i where i.file_path=o.name))
    ) inventory
  `);
  return (result.rows[0]?.inventory ??
    fail("comprehensive inventory query returned no row")) as JsonRecord;
}

async function providerInventory(client: pg.Client) {
  const jobs = await client.query(
    "select to_jsonb(j) row from public.provider_sync_jobs j order by id",
  );
  const links = await client.query(
    "select to_jsonb(l) row from public.integration_resource_links l order by id",
  );
  return {
    jobCount: jobs.rowCount ?? 0,
    jobRows: jobs.rows.map((item) => item.row),
    jobHash: sha256(canonicalJson(jobs.rows)),
    resourceLinkCount: links.rowCount ?? 0,
    resourceLinkRows: links.rows.map((item) => item.row),
    resourceLinkHash: sha256(canonicalJson(links.rows)),
  };
}

const fencedTables = [
  "activities",
  "activity_plans",
  "training_plans",
  "events",
  "group_events",
  "group_event_activity_plans",
  "activity_efforts",
  "activity_file_ingestions",
  "provider_sync_jobs",
  "integration_resource_links",
] as const;

export async function installWriterFence(client: Pick<pg.Client, "query">, runId: string) {
  await client.query(`create table if not exists public._multisport_writer_fence(
    singleton boolean primary key default true check(singleton),run_id uuid not null,enabled boolean not null,
    installed_at timestamptz not null default now())`);
  await client.query("truncate public._multisport_writer_fence");
  await client.query(
    "insert into public._multisport_writer_fence(singleton,run_id,enabled) values(true,$1,true)",
    [runId],
  );
  await client.query(`create or replace function public.enforce_multisport_writer_fence() returns trigger
    language plpgsql security definer set search_path='' as $$
    declare fenced boolean; expected_run uuid;
    begin
      select enabled,run_id into fenced,expected_run from public._multisport_writer_fence where singleton;
      if not coalesce(fenced,false) then if tg_op='DELETE' then return old; else return new; end if; end if;
      if current_setting('gradientpeak.cutover_writer_bypass',true)='on'
        and current_setting('gradientpeak.cutover_run_id',true)=expected_run::text then if tg_op='DELETE' then return old; else return new; end if; end if;
      raise exception 'multisport cutover writer fence is active for %',tg_table_schema||'.'||tg_table_name using errcode='55006';
    end $$`);
  await client.query(`create or replace function public.enforce_multisport_storage_writer_fence() returns trigger
    language plpgsql security definer set search_path='' as $$
    declare fenced boolean;expected_run uuid;
    begin
      if coalesce(new.bucket_id,old.bucket_id) is distinct from 'activity-files' then if tg_op='DELETE' then return old; else return new; end if; end if;
      select enabled,run_id into fenced,expected_run from public._multisport_writer_fence where singleton;
      if not coalesce(fenced,false) then if tg_op='DELETE' then return old; else return new; end if; end if;
      if current_setting('gradientpeak.cutover_writer_bypass',true)='on' and current_setting('gradientpeak.cutover_run_id',true)=expected_run::text then if tg_op='DELETE' then return old; else return new; end if; end if;
      raise exception 'multisport cutover writer fence is active for storage.objects' using errcode='55006';
    end $$`);
  for (const table of fencedTables) {
    const exists = await client.query<{ present: boolean }>(
      "select to_regclass($1) is not null present",
      [`public.${table}`],
    );
    if (exists.rows[0]?.present)
      await client.query(
        `drop trigger if exists multisport_writer_fence on public.${table};create trigger multisport_writer_fence before insert or update or delete on public.${table} for each row execute function public.enforce_multisport_writer_fence()`,
      );
  }
  await client.query(
    "drop trigger if exists multisport_writer_fence on storage.objects;create trigger multisport_writer_fence before insert or update or delete on storage.objects for each row execute function public.enforce_multisport_storage_writer_fence()",
  );
  await client.query(
    "revoke all on public._multisport_writer_fence from public,anon,authenticated,service_role",
  );
}

export async function proveWriterFence(client: Pick<pg.Client, "query">) {
  const expected: string[] = [];
  for (const table of fencedTables) {
    const result = await client.query<{ installed: boolean }>(
      `select to_regclass($1) is null or exists(
      select 1 from pg_trigger where tgrelid=to_regclass($1) and tgname='multisport_writer_fence'
        and tgenabled='O' and not tgisinternal) installed`,
      [`public.${table}`],
    );
    if (!result.rows[0]?.installed)
      fail(`writer fence trigger is absent or disabled on public.${table}`);
    if (
      (await client.query("select to_regclass($1) is not null present", [`public.${table}`]))
        .rows[0]?.present
    )
      expected.push(`public.${table}`);
  }
  const storage = await client.query<{ installed: boolean }>(`select exists(select 1 from pg_trigger
    where tgrelid='storage.objects'::regclass and tgname='multisport_writer_fence' and tgenabled='O' and not tgisinternal) installed`);
  if (!storage.rows[0]?.installed)
    fail("writer fence trigger is absent or disabled on storage.objects");
  expected.push("storage.objects");
  await client.query(
    "drop table if exists public._multisport_writer_fence_probe;create table public._multisport_writer_fence_probe(id integer)",
  );
  await client.query(
    "create trigger multisport_writer_fence before insert or update or delete on public._multisport_writer_fence_probe for each row execute function public.enforce_multisport_writer_fence()",
  );
  await client.query(`do $$ begin
    begin
      insert into public._multisport_writer_fence_probe(id) values(1);
      raise exception 'writer fence synthetic insert was not blocked';
    exception when sqlstate '55006' then null;
    end;
  end $$`);
  await client.query("drop table public._multisport_writer_fence_probe");
  return [...expected.map((table) => `${table}:trigger-enabled`), "synthetic-valid-insert:blocked"];
}

async function preflight(context: CommandContext) {
  const manifestPath = requireFile(argument(context.args, "manifest"), "manifest");
  const reportPath = resolve(argument(context.args, "report") ?? fail("missing --report=<path>"));
  let manifest = readManifest(manifestPath);
  await withClient(context, async (client) => {
    assertIdentity(manifest.database, await databaseIdentity(client));
    assertSnapshot(manifest.snapshot, await databaseSnapshot(client));
    await verifyRun(client, manifest, "guarded");
    const firstQuiescentSnapshot = await databaseSnapshot(client);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    const secondQuiescentSnapshot = await databaseSnapshot(client);
    if (firstQuiescentSnapshot.hash !== secondQuiescentSnapshot.hash)
      fail("writer quiescence check detected source-row changes");
    const blockers = await client.query<{ problem: string; row_id: string }>(`
      select 'activity_plan_not_v2',id::text from public.activity_plans where structure->>'version'<>'2'
      union all select 'training_plan_not_v1',id::text from public.training_plans where structure->>'version'<>'1'
      union all select 'unsupported_activity_type',id::text from public.activities where type not in ('run','bike','swim','strength','other')
      union all select 'partial_activity_file_metadata',id::text from public.activities where num_nonnulls(activity_file_path,activity_file_size,import_file_type) not in (0,3)
      union all select 'activity_storage_object_missing',a.id::text from public.activities a left join storage.objects o on o.bucket_id='activity-files' and o.name=a.activity_file_path where a.activity_file_path is not null and o.id is null
      union all select 'ready_ingestion_file_missing',i.id::text from public.activity_file_ingestions i where i.status='ready' and i.file_path is null
      union all select 'ingestion_storage_object_missing',i.id::text from public.activity_file_ingestions i left join storage.objects o on o.bucket_id='activity-files' and o.name=i.file_path where i.file_path is not null and o.id is null
      union all select 'effort_unmapped',e.id::text from public.activity_efforts e join public.activities a on a.id=e.activity_id where e.start_offset is null or e.activity_category::text<>a.type or e.start_offset<0 or (e.start_offset+e.duration_seconds)*1000>greatest(round(extract(epoch from(a.finished_at-a.started_at))*1000),a.duration_seconds*1000)
      union all select 'training_session_reference_missing',p.id::text from public.training_plans p cross join lateral jsonb_array_elements(p.structure->'sessions') s left join public.activity_plans ap on ap.id=(s->>'activity_plan_id')::uuid where ap.id is null
      union all select 'provider_writer_not_quiescent',id::text from public.provider_sync_jobs
        where status::text in ('queued','pending','running','processing') or locked_at is not null or lock_expires_at is not null
    `);
    const acquisitionDuplicates = await client.query(
      `select profile_id,source,provider,external_id,count(*)::int count from public.activity_file_ingestions group by profile_id,source,provider,external_id having count(*)>1 order by profile_id`,
    );
    if (blockers.rowCount) {
      const failedData = {
        inventory: await comprehensiveInventory(client),
        providerInventory: await providerInventory(client),
        writerQuiescence: {
          firstSnapshotHash: firstQuiescentSnapshot.hash,
          secondSnapshotHash: secondQuiescentSnapshot.hash,
          observedForMs: 250,
        },
        acquisitionDuplicates: acquisitionDuplicates.rows,
        blockers: blockers.rows,
      };
      const failedHash = sha256(canonicalJson(failedData));
      manifest = writeManifest(manifestPath, {
        ...manifest,
        preflight: failedData,
        phases: {
          ...manifest.phases,
          preflight: { at: new Date().toISOString(), hash: failedHash },
        },
      });
      await storeRun(client, manifest, "preflight_failed");
      writeFileSync(
        reportPath,
        `${JSON.stringify({ runId: manifest.runId, snapshot: manifest.snapshot, hash: failedHash, ...failedData }, null, 2)}\n`,
      );
      fail(`preflight found ${blockers.rowCount} blocker(s)`);
    }
    await client.query("begin");
    let fenceProofs: string[];
    try {
      await installWriterFence(client, manifest.runId);
      fenceProofs = await proveWriterFence(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    const fencedSnapshot = await databaseSnapshot(client);
    if (fencedSnapshot.hash !== secondQuiescentSnapshot.hash)
      fail("source rows changed before durable writer fence completed");
    const preflightData = {
      inventory: await comprehensiveInventory(client),
      providerInventory: await providerInventory(client),
      writerQuiescence: {
        firstSnapshotHash: firstQuiescentSnapshot.hash,
        secondSnapshotHash: secondQuiescentSnapshot.hash,
        fencedSnapshotHash: fencedSnapshot.hash,
        observedForMs: 250,
        fenceProofs,
      },
      acquisitionDuplicates: acquisitionDuplicates.rows,
      blockers: blockers.rows,
    };
    const preflightHash = sha256(canonicalJson(preflightData));
    manifest = writeManifest(manifestPath, {
      ...manifest,
      snapshot: fencedSnapshot,
      preflight: preflightData,
      phases: {
        ...manifest.phases,
        preflight: { at: new Date().toISOString(), hash: preflightHash },
      },
    });
    await storeRun(client, manifest, "preflight_complete");
    writeFileSync(
      reportPath,
      `${JSON.stringify({ runId: manifest.runId, snapshot: manifest.snapshot, hash: preflightHash, ...preflightData }, null, 2)}\n`,
    );
    console.log(`preflight passed for run ${manifest.runId}`);
  });
}

type LegacyPlanRow = {
  id: string;
  profile_id: string | null;
  name: string;
  description: string | null;
  notes: string | null;
  activity_category: string;
  structure: unknown;
  template_visibility: string;
  content_visibility?: string;
  import_provider: string | null;
  import_external_id: string | null;
  is_system_template: boolean;
  created_at: Date;
  updated_at: Date;
};

function convertV2Plan(
  row: Pick<LegacyPlanRow, "id" | "name" | "activity_category" | "structure">,
) {
  const source = row.structure as { version?: unknown; intervals?: unknown };
  if (source.version !== 2 || !Array.isArray(source.intervals))
    fail(`activity plan ${row.id} is not accepted V2`);
  return activityPlanStructureSchemaV3.parse({
    version: 3,
    segments: [
      {
        id: deterministicUuid(`${row.id}:activity-plan-v3-segment`),
        role: "activity",
        category: row.activity_category,
        name: row.name.slice(0, 100),
        intervals: source.intervals,
      },
    ],
  });
}

function planPrescriptionFingerprint(structure: unknown) {
  const parsed = activityPlanStructureSchemaV3.parse(structure);
  const stripIds = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripIds);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([key]) => key !== "id")
        .map(([key, nested]) => [key, stripIds(nested)]),
    );
  };
  return structureHash({
    segments: parsed.segments.map((segment) =>
      segment.role === "activity"
        ? { role: segment.role, category: segment.category, intervals: stripIds(segment.intervals) }
        : { role: segment.role, duration: segment.duration },
    ),
  });
}

type HistoricalSummaryInput = {
  type: string;
  duration_ms: number;
  moving_ms: number;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  elevation_loss_meters: number | null;
  calories: number | null;
  avg_heart_rate: number | null;
  avg_power: number | null;
  avg_cadence: number | null;
  avg_speed_mps: number | null;
  pool_length: number | null;
  laps: unknown;
  total_strokes: number | null;
  avg_swolf: number | null;
};

export function buildHistoricalSegmentSummary(row: HistoricalSummaryInput) {
  const defined = (entries: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(entries).filter(([, value]) => value !== null && value !== undefined),
    );
  const numeric = (value: unknown) =>
    value === null || value === undefined ? undefined : Number(value);
  const lapCount = Array.isArray(row.laps) ? row.laps.length : undefined;
  const swim =
    row.type === "swim"
      ? defined({
          poolLengthMeters: numeric(row.pool_length),
          lengthCount: lapCount,
          strokeCount: numeric(row.total_strokes),
          averageSwolf: numeric(row.avg_swolf),
        })
      : undefined;
  const summary = defined({
    version: 1,
    timing: { timingCoverage: "partial", activeMs: row.duration_ms, movingMs: row.moving_ms },
    distanceMeters: numeric(row.distance_meters),
    ascentMeters: numeric(row.elevation_gain_meters),
    descentMeters: numeric(row.elevation_loss_meters),
    caloriesKcal: numeric(row.calories),
    averageHeartRateBpm: numeric(row.avg_heart_rate),
    averagePowerWatts: numeric(row.avg_power),
    averageCadenceRpm: numeric(row.avg_cadence),
    averageSpeedMetersPerSecond: numeric(row.avg_speed_mps),
    swim: swim && Object.keys(swim).length ? swim : undefined,
  });
  return summary;
}

async function stage(context: CommandContext) {
  const manifestPath = requireFile(argument(context.args, "manifest"), "manifest");
  let manifest = readManifest(manifestPath);
  const storageRoot = requireDirectory(argument(context.args, "storage"), "storage");
  if (storageRoot !== manifest.storageRoot)
    fail("stage storage root differs from guarded storage snapshot");
  await withClient(context, async (client) => {
    assertIdentity(manifest.database, await databaseIdentity(client));
    assertSnapshot(manifest.snapshot, await databaseSnapshot(client));
    await verifyRun(client, manifest, "preflight_complete");
    if (!manifest.phases.preflight || !manifest.preflight) fail("preflight receipt is missing");
    const fencedProviderInventory = await providerInventory(client);
    if (
      canonicalJson(fencedProviderInventory) !==
      canonicalJson((manifest.preflight as { providerInventory?: unknown }).providerInventory)
    )
      fail("provider/job/resource fingerprint changed after writer fence");

    const plans = await client.query<LegacyPlanRow>(
      "select * from public.activity_plans order by id",
    );
    const sourcePlans = new Map(SYSTEM_TEMPLATES.map((template) => [template.id, template]));
    const convertedPlans = plans.rows.map((row) => {
      const structure = convertV2Plan(row);
      const beforeFingerprint = planPrescriptionFingerprint(structure);
      const source = sourcePlans.get(row.id);
      const sourceFingerprint = source ? planPrescriptionFingerprint(source.structure) : null;
      if (sourceFingerprint && sourceFingerprint !== beforeFingerprint)
        fail(`system template ${row.id} has material source prescription drift`);
      return {
        ...row,
        structure,
        structure_hash: structureHash(structure),
        gps_recording_enabled:
          source?.gps_recording_enabled ?? row.activity_category !== "strength",
        content_visibility:
          row.content_visibility ?? (row.is_system_template ? "public" : row.template_visibility),
        before_semantic_hash: beforeFingerprint as string | null,
        after_semantic_hash: planPrescriptionFingerprint(structure),
        source_semantic_hash: sourceFingerprint,
        is_new_source: false,
      };
    });
    const knownIds = new Set(convertedPlans.map((plan) => plan.id));
    for (const source of SYSTEM_TEMPLATES) {
      if (!source.id || knownIds.has(source.id)) continue;
      const structure = activityPlanStructureSchemaV3.parse(source.structure);
      const semanticHash = planPrescriptionFingerprint(structure);
      convertedPlans.push({
        id: source.id,
        profile_id: null,
        name: source.name,
        description: source.description ?? null,
        notes: source.notes ?? null,
        activity_category: source.activity_category,
        structure,
        structure_hash: structureHash(structure),
        gps_recording_enabled: source.gps_recording_enabled ?? true,
        template_visibility: "public",
        content_visibility: "public",
        import_provider: source.import_provider ?? null,
        import_external_id: source.import_external_id ?? null,
        is_system_template: true,
        created_at: new Date("2026-07-17T12:00:00.000Z"),
        updated_at: new Date("2026-07-17T12:00:00.000Z"),
        before_semantic_hash: null,
        after_semantic_hash: semanticHash,
        source_semantic_hash: semanticHash,
        is_new_source: true,
      });
    }

    const trainingRows = await client.query<{ id: string; structure: unknown }>(
      "select id,structure from public.training_plans order by id",
    );
    const convertedTraining = trainingRows.rows.map((row) => {
      const structure = canonicalTrainingPlanStructureSchema.parse(row.structure);
      return { id: row.id, structure, structure_hash: structureHash(structure) };
    });
    for (const plan of convertedTraining)
      for (const session of plan.structure.sessions) {
        if (!convertedPlans.some((candidate) => candidate.id === session.activity_plan_id))
          fail(`training plan ${plan.id} references missing plan ${session.activity_plan_id}`);
      }

    const acquisitionRows = await client.query<{
      activity_id: string;
      ingestion_id: string | null;
      profile_id: string;
      bucket: string;
      path: string;
      storage_object_id: string;
      storage_version: string;
      expected_size: string;
      media_type: string;
      format: string;
      original_name: string | null;
      requested_at: Date;
      is_current: boolean;
    }>(`
      with acquisitions as (
        select a.id activity_id,null::uuid ingestion_id,a.profile_id,'activity-files'::text bucket,a.activity_file_path path,
          a.activity_file_size expected_size,a.import_file_type format,a.import_original_file_name original_name,
          a.updated_at requested_at,true is_current from public.activities a where a.activity_file_path is not null
        union all
        select i.activity_id,i.id,i.profile_id,'activity-files',i.file_path,i.file_size,i.file_type,null,i.requested_at,
          i.file_path=a.activity_file_path from public.activity_file_ingestions i join public.activities a on a.id=i.activity_id where i.file_path is not null
      )
      select x.activity_id,x.ingestion_id,x.profile_id,x.bucket,x.path,o.id storage_object_id,o.version storage_version,
        x.expected_size::text,coalesce(o.metadata->>'mimetype','application/octet-stream') media_type,x.format,x.original_name,x.requested_at,x.is_current
      from acquisitions x join storage.objects o on o.bucket_id=x.bucket and o.name=x.path order by x.activity_id,x.requested_at,x.ingestion_id nulls first
    `);
    const byActivityPath = new Map<
      string,
      (typeof acquisitionRows.rows)[number] & { ingestion_ids: string[] }
    >();
    for (const row of acquisitionRows.rows) {
      const key = `${row.activity_id}:${row.path}`;
      const existing = byActivityPath.get(key);
      if (existing) {
        if (row.ingestion_id) existing.ingestion_ids.push(row.ingestion_id);
        existing.is_current ||= row.is_current;
      } else
        byActivityPath.set(key, {
          ...row,
          ingestion_ids: row.ingestion_id ? [row.ingestion_id] : [],
        });
    }
    const grouped = new Map<
      string,
      Array<ReturnType<typeof promoteContentAddressed> & JsonRecord>
    >();
    for (const row of byActivityPath.values()) {
      const sourcePath = resolve(
        storageRoot,
        "stub",
        "stub",
        row.bucket,
        row.path,
        row.storage_version,
      );
      if (!existsSync(sourcePath)) fail(`copied storage object missing: ${sourcePath}`);
      const byteSize = statSync(sourcePath).size;
      if (byteSize !== Number(row.expected_size)) fail(`storage size mismatch for ${row.path}`);
      const digest = hashFile(sourcePath);
      const promoted = promoteContentAddressed({
        sourcePath,
        storageRoot,
        bucket: row.bucket,
        profileId: row.profile_id,
        digest,
        byteSize,
        mediaType: row.media_type,
      });
      const list = grouped.get(row.activity_id) ?? [];
      const artifactId = deterministicUuid(`${row.profile_id}:sha256:${digest}:${byteSize}`);
      const duplicate = list.find((candidate) => candidate.artifact_id === artifactId);
      if (duplicate) {
        (duplicate.ingestion_ids as string[]).push(...row.ingestion_ids);
        duplicate.is_current ||= row.is_current;
      } else
        list.push({ ...promoted, ...row, digest, byte_size: byteSize, artifact_id: artifactId });
      grouped.set(row.activity_id, list);
    }
    const artifacts: JsonRecord[] = [];
    const ingestionMap: JsonRecord[] = [];
    for (const [activityId, rows] of grouped) {
      rows.sort(
        (left, right) =>
          Number(left.is_current) - Number(right.is_current) ||
          String(left.path).localeCompare(String(right.path)),
      );
      rows.forEach((row, ordinal) => {
        const artifact = {
          run_id: manifest.runId,
          artifact_id: row.artifact_id,
          activity_id: activityId,
          profile_id: row.profile_id,
          source_bucket: row.bucket,
          source_path: row.path,
          storage_object_id: row.storage_object_id,
          accepted_bucket: row.bucket,
          accepted_path: row.logicalPath,
          accepted_storage_object_id: row.storageObjectId,
          accepted_storage_version: row.storageVersion,
          digest: row.digest,
          byte_size: row.byte_size,
          media_type: row.media_type,
          format: row.format,
          original_name: row.original_name,
          ordinal,
          is_current: row.is_current,
        };
        artifacts.push(artifact);
        for (const ingestionId of row.ingestion_ids as string[])
          ingestionMap.push({
            run_id: manifest.runId,
            ingestion_id: ingestionId,
            activity_id: activityId,
            artifact_id: row.artifact_id,
            operation_key: `legacy:${ingestionId}`,
          });
      });
    }
    const allIngestions = await client.query<{ id: string; activity_id: string }>(
      "select id::text,activity_id::text from public.activity_file_ingestions order by id",
    );
    for (const ingestion of allIngestions.rows) {
      if (!ingestionMap.some((row) => row.ingestion_id === ingestion.id))
        ingestionMap.push({
          run_id: manifest.runId,
          ingestion_id: ingestion.id,
          activity_id: ingestion.activity_id,
          artifact_id: null,
          operation_key: `legacy:${ingestion.id}`,
        });
    }
    ingestionMap.sort((left, right) =>
      String(left.ingestion_id).localeCompare(String(right.ingestion_id)),
    );
    const historicalRows = await client.query<
      HistoricalSummaryInput & { id: string; profile_id: string; elapsed_ms: string }
    >(`
      select id::text,profile_id::text,type,greatest(round(extract(epoch from(finished_at-started_at))*1000),duration_seconds::bigint*1000,moving_seconds::bigint*1000)::text elapsed_ms,
        duration_seconds*1000 duration_ms,moving_seconds*1000 moving_ms,distance_meters,elevation_gain_meters,elevation_loss_meters,
        calories,avg_heart_rate,avg_power,avg_cadence,avg_speed_mps,pool_length,laps,total_strokes,avg_swolf
      from public.activities order by id`);
    const segments: JsonRecord[] = [];
    for (const row of historicalRows.rows) {
      const summary = buildHistoricalSegmentSummary(row);
      const segmentId = deterministicUuid(`${row.id}:historical-segment-v1`);
      const current = [...(grouped.get(row.id) ?? [])].find((item) => item.is_current);
      const source = current
        ? {
            kind: "artifact" as const,
            artifactId: String(current.artifact_id),
            source: new Set(["fit", "tcx", "gpx"]).has(String(current.format))
              ? { standard: String(current.format), format: String(current.format) }
              : { standard: "provider", format: String(current.format) },
          }
        : undefined;
      const completed = {
        id: segmentId,
        ordinal: 0,
        startOffsetMs: 0,
        endOffsetMs: Number(row.elapsed_ms),
        role: "activity" as const,
        category: row.type,
        summary,
        ...(source ? { source } : {}),
      };
      const parsed = completedActivitySegmentSchemaV1.safeParse(completed);
      if (!parsed.success)
        fail(
          `historical activity ${row.id} cannot stage a completed segment: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`).join("; ")}`,
        );
      segments.push({
        run_id: manifest.runId,
        activity_id: row.id,
        segment_id: segmentId,
        summary,
        summary_hash: structureHash(summary),
      });
    }
    const promotedInventory = [
      ...new Map([...grouped.values()].flat().map((row) => [row.entry.path, row.entry])).values(),
    ].sort((a, b) => a.path.localeCompare(b.path));

    await client.query("begin");
    try {
      await client.query(`create table if not exists public._multisport_activity_plan_manifest(
        run_id uuid not null,id uuid not null,profile_id uuid,name text not null,description text,notes text,structure jsonb not null,structure_hash text not null,
        gps_recording_enabled boolean not null,template_visibility text not null,content_visibility text not null,import_provider text,import_external_id text,
        is_system_template boolean not null,created_at timestamptz not null,updated_at timestamptz not null,before_semantic_hash text,after_semantic_hash text not null,
        source_semantic_hash text,is_new_source boolean not null,primary key(run_id,id))`);
      await client.query(
        `create table if not exists public._multisport_training_plan_manifest(run_id uuid not null,id uuid not null,structure jsonb not null,structure_hash text not null,primary key(run_id,id))`,
      );
      await client.query(`create table if not exists public._multisport_artifact_manifest(run_id uuid not null,artifact_id uuid not null,activity_id uuid not null,profile_id uuid not null,
        source_bucket text not null,source_path text not null,storage_object_id uuid not null,accepted_bucket text not null,accepted_path text not null,
        accepted_storage_object_id uuid not null,accepted_storage_version text not null,digest text not null,
        byte_size bigint not null,media_type text not null,format text not null,original_name text,ordinal integer not null,is_current boolean not null,
        primary key(run_id,activity_id,ordinal),unique(run_id,activity_id,artifact_id))`);
      await client.query(
        `create table if not exists public._multisport_ingestion_manifest(run_id uuid not null,ingestion_id uuid not null,activity_id uuid not null,artifact_id uuid,operation_key text not null,primary key(run_id,ingestion_id))`,
      );
      await client.query(
        `create table if not exists public._multisport_segment_manifest(run_id uuid not null,activity_id uuid not null,segment_id uuid not null,summary jsonb not null,summary_hash text not null,primary key(run_id,activity_id))`,
      );
      for (const table of ["activity_plan", "training_plan", "artifact", "ingestion", "segment"]) {
        const stale = await client.query(
          `select distinct run_id::text from public._multisport_${table}_manifest where run_id<>$1`,
          [manifest.runId],
        );
        if (stale.rowCount) fail(`stale ${table} staging rows exist`);
        await client.query(`delete from public._multisport_${table}_manifest where run_id=$1`, [
          manifest.runId,
        ]);
      }
      for (const plan of convertedPlans)
        await client.query(
          `insert into public._multisport_activity_plan_manifest values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            manifest.runId,
            plan.id,
            plan.profile_id,
            plan.name,
            plan.description,
            plan.notes,
            plan.structure,
            plan.structure_hash,
            plan.gps_recording_enabled,
            plan.template_visibility,
            plan.content_visibility,
            plan.import_provider,
            plan.import_external_id,
            plan.is_system_template,
            plan.created_at,
            plan.updated_at,
            plan.before_semantic_hash,
            plan.after_semantic_hash,
            plan.source_semantic_hash,
            plan.is_new_source,
          ],
        );
      for (const plan of convertedTraining)
        await client.query(
          "insert into public._multisport_training_plan_manifest values($1,$2,$3,$4)",
          [manifest.runId, plan.id, plan.structure, plan.structure_hash],
        );
      for (const artifact of artifacts)
        await client.query(
          `insert into public._multisport_artifact_manifest values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          Object.values(artifact),
        );
      for (const ingestion of ingestionMap)
        await client.query(
          "insert into public._multisport_ingestion_manifest values($1,$2,$3,$4,$5)",
          Object.values(ingestion),
        );
      for (const segment of segments)
        await client.query(
          "insert into public._multisport_segment_manifest values($1,$2,$3,$4,$5)",
          Object.values(segment),
        );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    if (canonicalJson(await providerInventory(client)) !== canonicalJson(fencedProviderInventory))
      fail("provider/job/resource fingerprint changed during staging");
    const staged = await readStaging(client, manifest.runId);
    manifest = writeManifest(manifestPath, {
      ...manifest,
      staging: {
        ...staged,
        promotedInventory,
        promotedInventoryHash: inventoryHash(promotedInventory),
        artifacts,
        ingestions: ingestionMap,
        segments,
        activityPlans: convertedPlans.map((plan) => ({
          id: plan.id,
          structureHash: plan.structure_hash,
          beforeSemanticHash: plan.before_semantic_hash,
          afterSemanticHash: plan.after_semantic_hash,
          isNewSource: plan.is_new_source,
        })),
      },
      phases: { ...manifest.phases, stage: { at: new Date().toISOString(), hash: staged.hash } },
    });
    await storeRun(client, manifest, "staged");
    console.log(
      `staged run ${manifest.runId}: ${artifacts.length} activity artifact links, ${promotedInventory.length} promoted objects`,
    );
  });
}

async function readStaging(client: pg.Client, runId: string) {
  const plans = await client.query(
    "select id::text,structure_hash,before_semantic_hash,after_semantic_hash,is_new_source from public._multisport_activity_plan_manifest where run_id=$1 order by id",
    [runId],
  );
  const training = await client.query(
    "select id::text,structure_hash from public._multisport_training_plan_manifest where run_id=$1 order by id",
    [runId],
  );
  const artifacts = await client.query(
    "select run_id::text,artifact_id::text,activity_id::text,profile_id::text,source_bucket,source_path,storage_object_id::text,accepted_bucket,accepted_path,accepted_storage_object_id::text,accepted_storage_version,digest,byte_size::int,media_type,format,original_name,ordinal,is_current from public._multisport_artifact_manifest where run_id=$1 order by activity_id,ordinal",
    [runId],
  );
  const ingestions = await client.query(
    "select run_id::text,ingestion_id::text,activity_id::text,artifact_id::text,operation_key from public._multisport_ingestion_manifest where run_id=$1 order by ingestion_id",
    [runId],
  );
  const segments = await client.query(
    "select run_id::text,activity_id::text,segment_id::text,summary,summary_hash from public._multisport_segment_manifest where run_id=$1 order by activity_id",
    [runId],
  );
  const counts = {
    activityPlans: plans.rowCount ?? 0,
    trainingPlans: training.rowCount ?? 0,
    artifacts: artifacts.rowCount ?? 0,
    ingestions: ingestions.rowCount ?? 0,
    segments: segments.rowCount ?? 0,
  };
  const hashes = {
    activityPlans: sha256(canonicalJson(plans.rows)),
    trainingPlans: sha256(canonicalJson(training.rows)),
    artifacts: sha256(canonicalJson(artifacts.rows)),
    ingestions: sha256(canonicalJson(ingestions.rows)),
    segments: sha256(canonicalJson(segments.rows)),
  };
  return { counts, hashes, hash: sha256(canonicalJson({ counts, hashes })) };
}

async function migrate(context: CommandContext) {
  const manifestPath = requireFile(argument(context.args, "manifest"), "manifest");
  const manifest = readManifest(manifestPath);
  if (!manifest.staging || !manifest.phases.stage || !manifest.phases.preflight)
    fail("manifest lacks completed preflight/stage phases");
  const expectedStaging = manifest.staging;
  await withClient(context, async (client) => {
    assertIdentity(manifest.database, await databaseIdentity(client));
    assertSnapshot(manifest.snapshot, await databaseSnapshot(client));
    await verifyRun(client, manifest, "staged");
    if (
      canonicalJson(await providerInventory(client)) !==
      canonicalJson((manifest.preflight as { providerInventory?: unknown }).providerInventory)
    )
      fail("provider/job/resource fingerprint changed while writer fence was active");
    const staging = await readStaging(client, manifest.runId);
    if (
      canonicalJson(staging) !==
      canonicalJson({
        counts: expectedStaging.counts,
        hashes: expectedStaging.hashes,
        hash: expectedStaging.hash,
      })
    )
      fail("staging table checksum/count mismatch");
    await client.query(
      "update public._multisport_cutover_runs set status='migrating' where run_id=$1",
      [manifest.runId],
    );
    const sqlPath = resolve(
      dbPackageRoot,
      `supabase/migrations/${CUTOVER_MIGRATION_VERSION}_multisport_modern_hard_cut.sql`,
    );
    await client.query(readFileSync(sqlPath, "utf8"));
    await client.query(
      `insert into supabase_migrations.schema_migrations(version,name,statements) values($1,'multisport_modern_hard_cut',array[]::text[]) on conflict(version) do nothing`,
      [CUTOVER_MIGRATION_VERSION],
    );
    const migrated = writeManifest(manifestPath, {
      ...manifest,
      phases: {
        ...manifest.phases,
        migrate: { at: new Date().toISOString(), hash: expectedStaging.hash },
      },
    });
    await client.query(
      "update public.multisport_cutover_audits set final_manifest_checksum=$2 where run_id=$1",
      [manifest.runId, migrated.checksum],
    );
    console.log(`multisport hard cut applied for run ${manifest.runId}`);
  });
}

async function postInventory(client: pg.Client) {
  const counts: Record<string, string> = {};
  const ids: Record<string, string[]> = {};
  for (const table of snapshotTables) {
    const result = await client.query<{ count: string; ids: string[] }>(
      `select count(*)::text count,coalesce(array_agg(id::text order by id),'{}'::text[]) ids from public.${table}`,
    );
    counts[table] = result.rows[0]?.count ?? "0";
    ids[table] = result.rows[0]?.ids ?? [];
  }
  return { counts, ids };
}

async function validateCompletedSegments(client: pg.Client) {
  const result = await client.query<{
    id: string;
    ordinal: number;
    start_offset_ms: string;
    end_offset_ms: string;
    role: "activity" | "transition" | "rest" | "unknown";
    category: string | null;
    summary: unknown;
    source_artifact_id: string | null;
    format: string | null;
  }>(`select s.id::text,s.ordinal,s.start_offset_ms::text,s.end_offset_ms::text,s.role,s.category,s.summary,
    s.source_artifact_id::text,a.format from public.activity_segments s
    left join public.activity_artifacts a on a.id=s.source_artifact_id order by s.activity_id,s.ordinal`);
  for (const row of result.rows) {
    const source = row.source_artifact_id
      ? {
          kind: "artifact" as const,
          artifactId: row.source_artifact_id,
          source: new Set(["fit", "tcx", "gpx"]).has(row.format ?? "")
            ? { standard: row.format, format: row.format }
            : { standard: "provider", format: row.format ?? "unknown" },
        }
      : undefined;
    const parsed = completedActivitySegmentSchemaV1.safeParse({
      id: row.id,
      ordinal: row.ordinal,
      startOffsetMs: Number(row.start_offset_ms),
      endOffsetMs: Number(row.end_offset_ms),
      role: row.role,
      ...(row.role === "activity" ? { category: row.category } : {}),
      summary: row.summary,
      ...(source ? { source } : {}),
    });
    if (!parsed.success)
      fail(
        `historical segment ${row.id} violates Core schema: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`).join("; ")}`,
      );
  }
  return result.rowCount ?? 0;
}

async function audit(context: CommandContext) {
  const manifestPath = requireFile(argument(context.args, "manifest"), "manifest");
  let manifest = readManifest(manifestPath);
  if (!manifest.phases.migrate || !manifest.staging) fail("manifest lacks migration receipt");
  const auditStaging = manifest.staging;
  const afterPath = resolve(argument(context.args, "after") ?? fail("missing --after=<path>"));
  await withClient(context, async (client) => {
    const auditRow = await client.query<{
      staging_hash: string;
      final_manifest_checksum: string;
      status: string;
    }>(
      "select staging_hash,final_manifest_checksum,status from public.multisport_cutover_audits where run_id=$1",
      [manifest.runId],
    );
    const receipt = auditRow.rows[0] ?? fail("durable cutover audit identity missing");
    if (
      receipt.staging_hash !== auditStaging.hash ||
      receipt.final_manifest_checksum !== manifest.checksum ||
      receipt.status !== "migrated"
    )
      fail("durable cutover audit identity mismatch");
    const result = await client.query<{ assertion: string; failures: string }>(`
      select 'ready_ingestion_links' assertion,count(*)::text failures from public.activity_file_ingestions where status='ready' and (activity_id is null or artifact_id is null)
      union all select 'effort_segment',count(*)::text from public.activity_efforts where activity_id is not null and segment_id is null
      union all select 'v3_plans',count(*)::text from public.activity_plans where structure->>'version'<>'3'
      union all select 'v1_training',count(*)::text from public.training_plans where structure->>'version'<>'1'
      union all select 'current_source_duplicates',count(*)::text from (select activity_id from public.activity_artifact_links where role='source' and is_current group by activity_id having count(*)<>1) x
      union all select 'mutable_artifact_paths',count(*)::text from public.activity_artifacts where path<>'artifacts/sha256/'||profile_id::text||'/'||digest
      union all select 'semantic_conversion_mismatch',count(*)::text from public.multisport_cutover_template_audits where before_semantic_hash is not null and before_semantic_hash<>after_semantic_hash
      union all select 'legacy_columns',count(*)::text from information_schema.columns where table_schema='public' and ((table_name='activities' and column_name in('type','duration_seconds','moving_seconds','activity_file_path','activity_file_size','import_source','import_file_type','import_original_file_name')) or (table_name='activity_plans' and column_name in('activity_category','version')) or(table_name='activity_file_ingestions' and column_name in('file_path','file_size','file_type')))
      union all select 'legacy_type',count(*)::text from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname='activity_category'
      union all select 'temporary_staging',count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like '\\_multisport\\_%' escape '\\'
    `);
    const failures = result.rows.filter((row) => Number(row.failures) !== 0);
    let parsedSegmentCount = 0;
    try {
      parsedSegmentCount = await validateCompletedSegments(client);
    } catch (error) {
      failures.push({
        assertion: error instanceof Error ? error.message : "completed_segment_core_schema",
        failures: "1",
      });
    }
    const artifactRows =
      await client.query(`select a.id::text artifact_id,l.activity_id::text,a.profile_id::text,a.bucket accepted_bucket,a.path accepted_path,
      o.id::text accepted_storage_object_id,o.version accepted_storage_version,a.digest,a.byte_size::int,a.media_type,a.format,a.original_name,l.ordinal,l.is_current
      from public.activity_artifacts a join public.activity_artifact_links l on l.artifact_id=a.id and l.role='source'
      join storage.objects o on o.bucket_id=a.bucket and o.name=a.path
      order by l.activity_id,l.ordinal`);
    const expectedArtifacts = auditStaging.artifacts.map((row) => ({
      artifact_id: row.artifact_id,
      activity_id: row.activity_id,
      profile_id: row.profile_id,
      accepted_bucket: row.accepted_bucket,
      accepted_path: row.accepted_path,
      accepted_storage_object_id: row.accepted_storage_object_id,
      accepted_storage_version: row.accepted_storage_version,
      digest: row.digest,
      byte_size: row.byte_size,
      media_type: row.media_type,
      format: row.format,
      original_name: row.original_name,
      ordinal: row.ordinal,
      is_current: row.is_current,
    }));
    if (canonicalJson(artifactRows.rows) !== canonicalJson(expectedArtifacts))
      failures.push({ assertion: "artifact_stage_manifest", failures: "1" });
    for (const row of artifactRows.rows as Array<{
      accepted_bucket: string;
      accepted_path: string;
      accepted_storage_version: string;
      digest: string;
      byte_size: number;
    }>) {
      const backendPath = resolve(
        manifest.storageRoot,
        "stub",
        "stub",
        row.accepted_bucket,
        row.accepted_path,
        row.accepted_storage_version,
      );
      if (
        !existsSync(backendPath) ||
        statSync(backendPath).size !== row.byte_size ||
        hashFile(backendPath) !== row.digest
      ) {
        failures.push({ assertion: "artifact_storage_download_resolution", failures: "1" });
        break;
      }
    }
    const ingestionRows = await client.query(
      "select id::text ingestion_id,activity_id::text,artifact_id::text,operation_key from public.activity_file_ingestions order by id",
    );
    const expectedIngestions = auditStaging.ingestions.map((row) => ({
      ingestion_id: row.ingestion_id,
      activity_id: row.activity_id,
      artifact_id: row.artifact_id,
      operation_key: row.operation_key,
    }));
    if (canonicalJson(ingestionRows.rows) !== canonicalJson(expectedIngestions))
      failures.push({ assertion: "ingestion_stage_manifest", failures: "1" });
    const post = await postInventory(client);
    const expectedActivityPlanIds = [
      ...(manifest.snapshot.ids.activity_plans ?? []),
      ...auditStaging.activityPlans.filter((plan) => plan.isNewSource).map((plan) => plan.id),
    ].sort();
    if (canonicalJson(post.ids.activity_plans) !== canonicalJson(expectedActivityPlanIds))
      failures.push({ assertion: "activity_plan_expected_ids", failures: "1" });
    const currentProviderInventory = await providerInventory(client);
    const preflightProvider = (manifest.preflight as { providerInventory?: unknown } | undefined)
      ?.providerInventory;
    if (canonicalJson(currentProviderInventory) !== canonicalJson(preflightProvider))
      failures.push({ assertion: "provider_inventory_changed", failures: "1" });
    for (const table of [
      "activities",
      "training_plans",
      "events",
      "activity_efforts",
      "activity_file_ingestions",
    ]) {
      if (sha256(canonicalJson(post.ids[table])) !== manifest.snapshot.idHashes[table])
        failures.push({ assertion: `${table}_ids`, failures: "1" });
    }
    if (post.counts.activity_plans !== String(expectedActivityPlanIds.length))
      failures.push({
        assertion: "activity_plan_count",
        failures: post.counts.activity_plans ?? "missing",
      });
    if (failures.length) fail(`audit failed: ${failures.map((item) => item.assertion).join(", ")}`);
    manifest = writeManifest(manifestPath, {
      ...manifest,
      phases: {
        ...manifest.phases,
        audit: {
          at: new Date().toISOString(),
          hash: sha256(canonicalJson({ post, assertions: result.rows, parsedSegmentCount })),
        },
      },
    });
    await client.query(
      "update public.multisport_cutover_audits set status='audited',audited_at=now(),final_manifest_checksum=$2 where run_id=$1",
      [manifest.runId, manifest.checksum],
    );
    writeFileSync(
      afterPath,
      `${JSON.stringify({ runId: manifest.runId, ...post, parsedSegmentCount, assertions: result.rows, failures: [] }, null, 2)}\n`,
    );
    console.log(`audit passed for run ${manifest.runId}`);
  });
}

export function verifyPgRestoreDiagnostics(status: number | null, stderr: string) {
  const errors = stderr.match(/^pg_restore: error:/gm) ?? [];
  if (status === 0) {
    if (errors.length) fail("pg_restore reported an error despite successful status");
    return [] as string[];
  }
  const allowed = [
    {
      name: "realtime_log_min_messages",
      error: 'permission denied to set parameter "log_min_messages"',
      command: "CREATE FUNCTION realtime.list_changes",
    },
    {
      name: "vault_secrets_copy",
      error: "permission denied for table secrets",
      command: "COPY vault.secrets",
    },
  ];
  if (
    status !== 1 ||
    errors.length !== allowed.length ||
    !stderr.includes("pg_restore: warning: errors ignored on restore: 2")
  )
    fail("pg_restore emitted an unapproved diagnostic or status");
  for (const item of allowed)
    if (!stderr.includes(item.error) || !stderr.includes(item.command))
      fail(`pg_restore harmless diagnostic was not the enumerated ${item.name} case`);
  return allowed.map((item) => item.name);
}

async function verifyDisposableDatabaseRestore(context: CommandContext, manifest: CutoverManifest) {
  const database =
    argument(context.args, "restore-database") ??
    fail("missing --restore-database=<disposable-name>");
  if (!/^gradientpeak_multisport_restore_[a-z0-9_]+$/.test(database))
    fail("restore database name must use the gradientpeak_multisport_restore_ prefix");
  const container = argument(context.args, "db-container") ?? "supabase_db_gradientpeak";
  execFileSync("docker", [
    "exec",
    container,
    "dropdb",
    "-U",
    "postgres",
    "--if-exists",
    "--force",
    database,
  ]);
  execFileSync("docker", ["exec", container, "createdb", "-U", "postgres", database]);
  try {
    const restored = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        database,
        "--no-owner",
        "--no-privileges",
      ],
      { input: readFileSync(manifest.backup.path), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    const harmlessDiagnostics = verifyPgRestoreDiagnostics(restored.status, restored.stderr ?? "");
    const restoredUrl = new URL(context.databaseUrl);
    restoredUrl.pathname = `/${database}`;
    const restoredContext = { ...context, databaseUrl: restoredUrl.toString() };
    return await withClient(restoredContext, async (client) => {
      const identity = await databaseIdentity(client);
      if (
        identity.systemIdentifier !== manifest.database.systemIdentifier ||
        identity.server !== manifest.database.server ||
        identity.ledgerHash !== manifest.database.ledgerHash ||
        identity.schemaHash !== manifest.database.schemaHash
      )
        fail("restored pre-cut database identity/ledger/schema mismatch");
      if (identity.ledger.some((entry) => entry.version === CUTOVER_MIGRATION_VERSION))
        fail("restored database is not pre-cut");
      const schema = await client.query<{ legacy_columns: string; modern_tables: string }>(`select
        (select count(*)::text from information_schema.columns where table_schema='public' and table_name='activities' and column_name in('type','duration_seconds','activity_file_path')) legacy_columns,
        (select count(*)::text from information_schema.tables where table_schema='public' and table_name in('activity_artifacts','activity_segments','multisport_cutover_audits')) modern_tables`);
      if (
        Number(schema.rows[0]?.legacy_columns) !== 3 ||
        Number(schema.rows[0]?.modern_tables) !== 0
      )
        fail("restored database does not have the expected pre-cut schema");
      const snapshot = await databaseSnapshot(client);
      if (canonicalJson(snapshot) !== canonicalJson(manifest.snapshot))
        fail("restored database table IDs/counts/content fingerprints differ from manifest");
      return {
        database,
        ledgerEntries: identity.ledger.length,
        schemaHash: identity.schemaHash,
        snapshotHash: snapshot.hash,
        applicationTables: Object.keys(snapshot.applicationTables).length,
        applicationStateHash: snapshot.applicationStateHash,
        harmlessDiagnostics,
        legacyColumns: 3,
        modernTables: 0,
      };
    });
  } finally {
    execFileSync("docker", [
      "exec",
      container,
      "dropdb",
      "-U",
      "postgres",
      "--if-exists",
      "--force",
      database,
    ]);
  }
}

async function restoreVerify(context: CommandContext) {
  const manifest = readManifest(requireFile(argument(context.args, "manifest"), "manifest"));
  const restoredStorage = requireDirectory(argument(context.args, "storage"), "storage");
  if (
    hashFile(manifest.backup.path) !== manifest.backup.sha256 ||
    hashFile(manifest.storageArchive.path) !== manifest.storageArchive.sha256
  )
    fail("backup archive checksum mismatch");
  const databaseRestore = await verifyDisposableDatabaseRestore(context, manifest);
  verifyStorageEntries(restoredStorage, manifest.sourceStorageInventory);
  if (manifest.staging) verifyStorageEntries(restoredStorage, manifest.staging.promotedInventory);
  await withClient(context, async (client) => {
    const post = await postInventory(client);
    for (const table of [
      "activities",
      "training_plans",
      "events",
      "activity_efforts",
      "activity_file_ingestions",
    ]) {
      if (sha256(canonicalJson(post.ids[table])) !== manifest.snapshot.idHashes[table])
        fail(`restored DB ID manifest mismatch: ${table}`);
    }
    const resolved = await client.query<{
      bucket: string;
      path: string;
      version: string;
      digest: string;
      byte_size: string;
    }>(
      `select a.bucket,a.path,o.version,a.digest,a.byte_size::text from public.activity_artifacts a join storage.objects o on o.bucket_id=a.bucket and o.name=a.path order by a.id`,
    );
    for (const row of resolved.rows) {
      const path = resolve(restoredStorage, "stub", "stub", row.bucket, row.path, row.version);
      if (
        !existsSync(path) ||
        statSync(path).size !== Number(row.byte_size) ||
        hashFile(path) !== row.digest
      )
        fail(`restored artifact is not storage-resolvable: ${row.path}`);
    }
    console.log(
      JSON.stringify({
        runId: manifest.runId,
        databaseRestore,
        sourceObjects: manifest.sourceStorageInventory.length,
        promotedObjects: manifest.staging?.promotedInventory.length ?? 0,
        resolvedArtifacts: resolved.rowCount ?? 0,
        counts: post.counts,
      }),
    );
  });
}

export async function runMultisportCommand(command: string, args: string[]) {
  const context = createContext(command, args);
  if (command === "guard") return guard(context);
  if (command === "preflight") return preflight(context);
  if (command === "stage-artifacts") return stage(context);
  if (command === "migrate") return migrate(context);
  if (command === "audit") return audit(context);
  if (command === "restore-verify") return restoreVerify(context);
  fail("unknown multisport command");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  runMultisportCommand(command ?? "", args).catch((error) => {
    console.error(
      `[multisport:${command ?? "unknown"}] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
