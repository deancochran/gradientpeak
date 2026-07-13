import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { requireDisposableFlag, requireExplicitLocalTarget } from "./_target-safety";

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
  requireDisposableFlag(args);
  const baseUrl = requireExplicitLocalTarget(args);
  const adminUrl = withDatabase(baseUrl, "postgres");
  const database = `gradientpeak_${label}_${process.pid}_${Date.now()}`;
  if (!/^gradientpeak_[a-z_]+_\d+_\d+$/.test(database)) {
    throw new Error("unsafe disposable database name");
  }
  const connectionString = withDatabase(baseUrl, database);
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
    create extension if not exists pg_trgm with schema extensions;
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

export async function applySqlFile(pool: Pool, path: string) {
  await pool.query("begin");
  try {
    await pool.query(readFileSync(path, "utf8"));
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw new Error(`failed SQL fixture ${path}`, { cause: error });
  }
}
