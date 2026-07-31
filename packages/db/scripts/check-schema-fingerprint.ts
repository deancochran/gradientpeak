#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getTableColumns, getTableName } from "drizzle-orm";
import { Pool } from "pg";
import { schema } from "../src/schema";
import { dbPackageRoot, prepareDbEnv } from "./_helpers";

const fingerprintPath = resolve(dbPackageRoot, "schema-fingerprint.json");
const policy = JSON.parse(
  readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
) as {
  ownedExtensions: Array<{ name: string; schema: string }>;
  ownedDefaultPrivilegeRoles: string[];
};
function managedTableNames() {
  return Object.values(schema)
    .flatMap((value) => {
      try {
        getTableColumns(value as never);
        return [getTableName(value as never)];
      } catch {
        return [];
      }
    })
    .sort();
}

function fingerprintDiff(expected: Record<string, unknown>, actual: Record<string, unknown>) {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap((section) => {
    if (JSON.stringify(expected[section]) === JSON.stringify(actual[section])) return [];
    const expectedSection = expected[section];
    const actualSection = actual[section];
    if (!Array.isArray(expectedSection) || !Array.isArray(actualSection)) {
      return [
        `${section}: expected=${JSON.stringify(expectedSection)} actual=${JSON.stringify(actualSection)}`,
      ];
    }
    const firstMismatch = expectedSection.findIndex(
      (value, index) => JSON.stringify(value) !== JSON.stringify(actualSection[index]),
    );
    const differenceIndex =
      firstMismatch === -1 ? Math.min(expectedSection.length, actualSection.length) : firstMismatch;
    return [
      `${section}[${differenceIndex}]: expected=${JSON.stringify(expectedSection[differenceIndex])} actual=${JSON.stringify(actualSection[differenceIndex])}`,
    ];
  });
}

export async function createSchemaFingerprint(pool: Pool) {
  await pool.query("set search_path = public, pg_catalog");
  const tables = managedTableNames();
  const result = await pool.query(
    `
      with managed as (select unnest($1::text[]) as table_name)
      select jsonb_build_object(
        'tables', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', c.relname,
            'rls', c.relrowsecurity,
            'forceRls', c.relforcerowsecurity,
            'acl', coalesce(c.relacl::text, '')
          ) order by c.relname)
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join managed m on m.table_name = c.relname
          where n.nspname = 'public' and c.relkind in ('r', 'p')
        ), '[]'::jsonb),
        'publicRelations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', c.relname,
            'kind', c.relkind,
            'managed', m.table_name is not null,
            'rls', c.relrowsecurity,
            'forceRls', c.relforcerowsecurity,
            'acl', coalesce(c.relacl::text, '')
          ) order by c.relkind, c.relname)
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          left join managed m on m.table_name = c.relname
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
        ), '[]'::jsonb),
        'publicSequences', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', c.relname,
            'acl', coalesce(c.relacl::text, ''),
            'definition', pg_get_serial_sequence(format('%I.%I', n.nspname, owned_table.relname), a.attname)
          ) order by c.relname)
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
           left join pg_depend dep on dep.objid = c.oid and dep.classid = 'pg_class'::regclass and dep.deptype in ('a', 'i')
          left join pg_class owned_table on owned_table.oid = dep.refobjid
          left join pg_attribute a on a.attrelid = dep.refobjid and a.attnum = dep.refobjsubid
          where n.nspname = 'public' and c.relkind = 'S'
        ), '[]'::jsonb),
        'columns', coalesce((
          select jsonb_agg(jsonb_build_object(
            'table', c.relname,
            'name', a.attname,
            'position', a.attnum,
            'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
            'notNull', a.attnotnull,
            'identity', a.attidentity,
            'generated', a.attgenerated,
            'default', coalesce(pg_get_expr(d.adbin, d.adrelid), '')
          ) order by c.relname, a.attnum)
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join managed m on m.table_name = c.relname
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
          where n.nspname = 'public'
        ), '[]'::jsonb),
        'indexes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'table', t.relname,
            'name', i.relname,
            'definition', pg_get_indexdef(i.oid)
          ) order by t.relname, i.relname)
          from pg_class t
          join pg_namespace n on n.oid = t.relnamespace
          join managed m on m.table_name = t.relname
          join pg_index x on x.indrelid = t.oid
          join pg_class i on i.oid = x.indexrelid
          where n.nspname = 'public'
        ), '[]'::jsonb),
        'constraints', coalesce((
          select jsonb_agg(jsonb_build_object(
            'table', c.relname,
            'name', con.conname,
            'kind', con.contype,
            'validated', con.convalidated,
            'definition', pg_get_constraintdef(con.oid, true)
          ) order by c.relname, con.conname)
          from pg_constraint con
          join pg_class c on c.oid = con.conrelid
          join pg_namespace n on n.oid = c.relnamespace
          join managed m on m.table_name = c.relname
          where n.nspname = 'public' and con.contype in ('p', 'u', 'f', 'c', 'x')
        ), '[]'::jsonb),
        'enums', coalesce((
          select jsonb_agg(jsonb_build_object('name', enum_name, 'values', values) order by enum_name)
          from (
            select t.typname as enum_name, jsonb_agg(e.enumlabel order by e.enumsortorder) as values
            from pg_type t
            join pg_enum e on e.enumtypid = t.oid
            join pg_namespace n on n.oid = t.typnamespace
            where n.nspname = 'public'
            group by t.typname
          ) enum_catalog
        ), '[]'::jsonb),
        'policies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'table', p.tablename,
            'name', p.policyname,
            'permissive', p.permissive,
            'roles', p.roles,
            'command', p.cmd,
            'using', coalesce(p.qual, ''),
            'check', coalesce(p.with_check, '')
          ) order by p.tablename, p.policyname)
          from pg_policies p
          join managed m on m.table_name = p.tablename
          where p.schemaname = 'public'
        ), '[]'::jsonb),
        'defaultPrivileges', coalesce((
          select jsonb_agg(jsonb_build_object(
            'owner', owner.rolname,
            'objectType', d.defaclobjtype,
            'acl', coalesce(d.defaclacl::text, '')
          ) order by owner.rolname, d.defaclobjtype)
          from pg_default_acl d
          join pg_roles owner on owner.oid = d.defaclrole
          join pg_namespace n on n.oid = d.defaclnamespace
          where n.nspname = 'public'
            and owner.rolname = any($3::text[])
        ), '[]'::jsonb),
        'ownedExtensions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', e.extname,
            'schema', n.nspname
          ) order by e.extname)
          from pg_extension e
          join pg_namespace n on n.oid = e.extnamespace
          where e.extname = any($2::text[])
        ), '[]'::jsonb),
        'extensions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', e.extname,
            'schema', n.nspname
          ) order by e.extname)
          from pg_extension e
          join pg_namespace n on n.oid = e.extnamespace
          where e.extname = any($2::text[])
        ), '[]'::jsonb),
        'storageBuckets', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', id,
            'name', name,
            'public', public,
            'fileSizeLimit', file_size_limit,
            'allowedMimeTypes', allowed_mime_types
          ) order by id)
          from storage.buckets
          where id in ('activity-files', 'gpx-routes', 'profile-avatars')
        ), '[]'::jsonb),
        'storagePolicies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', policyname,
            'permissive', permissive,
            'roles', roles,
            'command', cmd,
            'using', coalesce(qual, ''),
            'check', coalesce(with_check, '')
          ) order by policyname)
          from pg_policies
          where schemaname = 'storage'
            and tablename = 'objects'
            and policyname in (
              'Users can manage their own avatar',
              'Users can upload their own activity files',
              'Users can read their own activity files',
              'Service role can manage all activity files'
            )
        ), '[]'::jsonb),
        'functions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'identity', p.oid::regprocedure::text,
            'language', l.lanname,
            'securityDefiner', p.prosecdef,
            'volatility', p.provolatile,
            'config', coalesce(p.proconfig, array[]::text[]),
            'acl', coalesce(p.proacl::text, ''),
            'definition', pg_get_functiondef(p.oid)
          ) order by p.oid::regprocedure::text)
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          join pg_language l on l.oid = p.prolang
          where n.nspname = 'public'
            and not exists (
              select 1 from pg_depend d
              where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
            )
        ), '[]'::jsonb),
        'triggers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'schema', n.nspname,
            'table', c.relname,
            'name', t.tgname,
            'definition', pg_get_triggerdef(t.oid, true)
          ) order by n.nspname, c.relname, t.tgname)
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_proc trigger_function on trigger_function.oid = t.tgfoid
          join pg_namespace function_namespace on function_namespace.oid = trigger_function.pronamespace
          left join managed m on m.table_name = c.relname and n.nspname = 'public'
          where not t.tgisinternal
            and (m.table_name is not null or function_namespace.nspname = 'public')
        ), '[]'::jsonb)
      ) as fingerprint
    `,
    [
      tables,
      policy.ownedExtensions.map((extension) => extension.name),
      policy.ownedDefaultPrivilegeRoles,
    ],
  );
  const fingerprint = result.rows[0]?.fingerprint as Record<string, unknown>;
  const ownedExtensions = fingerprint.ownedExtensions;
  if (JSON.stringify(ownedExtensions) !== JSON.stringify(policy.ownedExtensions)) {
    throw new Error(
      `owned extension location drift: expected=${JSON.stringify(policy.ownedExtensions)} actual=${JSON.stringify(ownedExtensions)}`,
    );
  }
  return fingerprint;
}

async function main() {
  const writesFingerprint = process.argv.includes("--write");
  if (writesFingerprint) assertFreshDisposableWriteGuard();
  const pool = new Pool({ connectionString: prepareDbEnv() });
  try {
    const actual = await createSchemaFingerprint(pool);
    const serialized = `${JSON.stringify(actual, null, 2)}\n`;
    if (writesFingerprint) {
      writeFileSync(fingerprintPath, serialized);
      execFileSync("pnpm", ["exec", "biome", "format", "--write", fingerprintPath], {
        cwd: dbPackageRoot,
        stdio: "inherit",
      });
      console.log(`[db:schema:fingerprint] wrote ${fingerprintPath}`);
      return;
    }

    const expected = JSON.parse(readFileSync(fingerprintPath, "utf8")) as Record<string, unknown>;
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      const diagnostics = fingerprintDiff(expected, actual);
      throw new Error(
        `managed schema fingerprint drifted; regenerate only through guarded db:fresh:verify -- --write-fingerprint\n${diagnostics.map((line) => `- ${line}`).join("\n")}`,
      );
    }
    console.log(`[db:schema:fingerprint] ${managedTableNames().length} managed tables match`);
  } finally {
    await pool.end();
  }
}

function assertFreshDisposableWriteGuard() {
  if (process.env.GRADIENTPEAK_FRESH_FINGERPRINT_WRITE !== "1") {
    throw new Error(
      "fingerprint writes are allowed only from guarded fresh disposable verification",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  const postgresUrl = process.env.POSTGRES_URL;
  if (!databaseUrl || !postgresUrl) {
    throw new Error("guarded fingerprint writes require DATABASE_URL and POSTGRES_URL");
  }
  const expectedDatabase = /^gradientpeak_fresh_verify_\d+_\d+$/;
  const parsed = [new URL(databaseUrl), new URL(postgresUrl)] as const;
  const [parsedDatabaseUrl, parsedPostgresUrl] = parsed;
  if (
    parsed.some(
      (url) =>
        !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
        !expectedDatabase.test(url.pathname.slice(1)),
    ) ||
    parsedDatabaseUrl.toString() !== parsedPostgresUrl.toString()
  ) {
    throw new Error(
      "fingerprint writes require one guarded localhost fresh disposable database URL",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `[db:schema:fingerprint] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
