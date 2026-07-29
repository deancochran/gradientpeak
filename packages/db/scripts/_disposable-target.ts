import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import {
  invalidIndexCleanup,
  type MigrationOperation,
  validateAutocommitOperation,
} from "./_migration-operations";
import {
  requireGuardedDisposableLocalDatabaseUrl,
  requireRepositoryManagedDisposableLocalTarget,
} from "./_target-safety";

function withDatabase(baseUrl: string, database: string) {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

export async function withDisposableDatabase<T>(
  args: string[],
  label: string,
  run: (pool: Pool, connectionString: string) => Promise<T>,
) {
  const baseUrl = requireRepositoryManagedDisposableLocalTarget(args);
  const adminUrl = withDatabase(baseUrl, "postgres");
  const database = `gradientpeak_${label}_${process.pid}_${Date.now()}`;
  if (!/^gradientpeak_[a-z_]+_\d+_\d+$/.test(database)) {
    throw new Error("unsafe disposable database name");
  }
  const connectionString = withDatabase(baseUrl, database);
  requireGuardedDisposableLocalDatabaseUrl(connectionString);
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  let target: Pool | undefined;
  try {
    await admin.query(`create database "${database}"`);
    target = new Pool({ connectionString, max: 1 });
    return await run(target, connectionString);
  } finally {
    await target?.end().catch(() => undefined);
    await admin.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [database],
    );
    await admin.query(`drop database if exists "${database}"`);
    await admin.end();
  }
}

export async function bootstrapSupabaseSchemas(pool: Pool) {
  await pool.query(`
    create schema if not exists extensions;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create schema storage;
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id),
      name text not null
    );
    alter table storage.objects enable row level security;
  `);
}

export type MigrationExecutionMode = "transactional" | "autocommit";
export type AutocommitSession = { lockTimeout: string; statementTimeout: string };

export async function applySqlFile(
  pool: Pool,
  path: string,
  executionMode: MigrationExecutionMode = "transactional",
  autocommit?: AutocommitSession & { operation: MigrationOperation },
) {
  const client = await pool.connect();
  const sql = readFileSync(path, "utf8");
  try {
    if (executionMode === "transactional") {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      return;
    }
    await applyAutocommitMigration(client, sql, path, autocommit);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw new Error(
      `failed ${executionMode} SQL fixture ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    client.release();
  }
}

async function applyAutocommitMigration(
  client: PoolClient,
  sql: string,
  path: string,
  autocommit: (AutocommitSession & { operation: MigrationOperation }) | undefined,
) {
  if (!autocommit) throw new Error(`autocommit migration is missing session metadata: ${path}`);
  validateAutocommitOperation(sql, autocommit.operation);
  await client.query(`set lock_timeout = '${autocommit.lockTimeout}'`);
  await client.query(`set statement_timeout = '${autocommit.statementTimeout}'`);
  try {
    await client.query(sql);
  } catch (error) {
    const invalid = await client.query<{ name: string }>(
      `
      select c.relname as name
      from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid = i.indexrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1
        and c.relname = $2
        and not i.indisvalid
    `,
      [autocommit.operation.schema, autocommit.operation.indexName],
    );
    const cleanup = invalidIndexCleanup(autocommit.operation);
    const recovery = invalid.rowCount
      ? `INVALID index detected: ${invalid.rows.map((row) => row.name).join(", ")}. Run ${cleanup} before retrying.`
      : `A failed concurrent build may leave an INVALID index; inspect it and run ${cleanup} before retrying.`;
    throw new Error(`autocommit migration failed: ${path}. ${recovery}`, { cause: error });
  } finally {
    await client.query("reset lock_timeout");
    await client.query("reset statement_timeout");
  }
}
