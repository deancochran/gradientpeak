#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { dbPackageRoot, defaultLocalDatabaseUrl } from "./_local-database-config";

const materializedDatabase = "gradientpeak_schema_materialization";

export function requireGuardedLocalMaterialization(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "54322" ||
    url.pathname !== "/postgres"
  ) {
    throw new Error("Schema materialization requires the repository loopback database on 54322.");
  }
  url.pathname = `/${materializedDatabase}`;
  return url.toString();
}

async function materialize() {
  const materializedUrl = requireGuardedLocalMaterialization(defaultLocalDatabaseUrl);
  const adminPool = new Pool({ connectionString: defaultLocalDatabaseUrl, max: 1 });
  let functionDefinitions: string[] = [];
  let triggerDefinitions: string[] = [];
  try {
    const [functions, triggers] = await Promise.all([
      adminPool.query<{ definition: string }>(`
        select pg_get_functiondef(procedure_record.oid) as definition
        from pg_proc procedure_record
        join pg_namespace namespace on namespace.oid = procedure_record.pronamespace
        where namespace.nspname = 'public'
        order by procedure_record.oid
      `),
      adminPool.query<{ definition: string }>(`
        select pg_get_triggerdef(trigger_record.oid, true) as definition
        from pg_trigger trigger_record
        join pg_class relation on relation.oid = trigger_record.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public' and not trigger_record.tgisinternal
        order by trigger_record.oid
      `),
    ]);
    functionDefinitions = functions.rows.map(({ definition }) => definition);
    triggerDefinitions = triggers.rows.map(({ definition }) => definition);
    await adminPool.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [materializedDatabase],
    );
    await adminPool.query(`drop database if exists "${materializedDatabase}"`);
    await adminPool.query(`create database "${materializedDatabase}"`);
  } finally {
    await adminPool.end();
  }

  const exported = spawnSync(
    resolve(dbPackageRoot, "../../node_modules/.bin/drizzle-kit"),
    ["export", "--config", "drizzle.config.ts"],
    {
      cwd: dbPackageRoot,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: materializedUrl, POSTGRES_URL: materializedUrl },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  if (exported.status !== 0 || !exported.stdout?.includes("CREATE TABLE")) {
    throw new Error("Drizzle schema export failed or returned no tables.");
  }

  const targetPool = new Pool({ connectionString: materializedUrl, max: 1 });
  try {
    await targetPool.query(`
      create schema if not exists extensions;
      create extension if not exists btree_gist with schema extensions;
      create function public.activity_artifact_content_path(target_profile_id uuid, target_digest text)
        returns text language sql immutable strict set search_path = pg_catalog
        as $$ select 'artifacts/sha256/' || target_profile_id::text || '/' || target_digest $$;
      create function public.activity_plan_structure_is_canonical(input jsonb)
        returns boolean language sql immutable set search_path = pg_catalog as $$ select true $$;
      create function public.activity_plan_jsonb_has_exact_keys(input jsonb, required_keys text[], optional_keys text[] default '{}'::text[])
        returns boolean language sql immutable set search_path = pg_catalog as $$ select true $$;
      create function public.activity_plan_jsonb_is_uuid(input jsonb) returns boolean language sql immutable set search_path = pg_catalog as $$ select true $$;
      create function public.activity_plan_jsonb_is_string(input jsonb, minimum integer, maximum integer) returns boolean language sql immutable set search_path = pg_catalog as $$ select true $$;
      create function public.activity_plan_jsonb_is_integer_between(input jsonb, minimum numeric, maximum numeric) returns boolean language sql immutable set search_path = pg_catalog as $$ select true $$;
      create function public.activity_plan_target_is_canonical(input jsonb, activity_category text) returns boolean language sql immutable set search_path = pg_catalog as $$ select true $$;
      create function public.activity_plan_duration_is_canonical(input jsonb, rest_only boolean default false) returns boolean language sql immutable set search_path = pg_catalog as $$ select true $$;
      create function public.activity_plan_segment_is_canonical(input jsonb) returns boolean language sql immutable set search_path = pg_catalog as $$ select true $$;
    `);
    await targetPool.query(exported.stdout);
    for (const definition of functionDefinitions) await targetPool.query(definition);
    for (const definition of triggerDefinitions) await targetPool.query(definition);
    await targetPool.query(`
      do $block$
      declare relation record;
      begin
        for relation in
          select quote_ident(schemaname) as schema_name, quote_ident(tablename) as table_name
          from pg_tables where schemaname = 'public'
        loop
          execute format('alter table %s.%s enable row level security', relation.schema_name, relation.table_name);
        end loop;
      end
      $block$;
    `);
  } finally {
    await targetPool.end();
  }
  console.info(`[db:schema:materialize:local] ready database=${materializedDatabase}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await materialize();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Schema materialization failed.");
    process.exitCode = 1;
  }
}
