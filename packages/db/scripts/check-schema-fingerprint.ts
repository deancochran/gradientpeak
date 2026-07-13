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
) as { ownedExtensions: string[] };
const transitionalExtras = JSON.parse(
  readFileSync(resolve(dbPackageRoot, "transitional-schema-extras.json"), "utf8"),
) as {
  columns: Array<{ table: string; name: string }>;
  constraints: Array<{ table: string; name: string }>;
  indexes: Array<{ table: string; name: string }>;
  sequences: string[];
};

function withoutDeclaredTransitionalExtras(fingerprint: Record<string, unknown>) {
  const excludedColumns = new Set(
    transitionalExtras.columns.map((entry) => `${entry.table}.${entry.name}`),
  );
  const excludedConstraints = new Set(
    transitionalExtras.constraints.map((entry) => `${entry.table}.${entry.name}`),
  );
  const excludedIndexes = new Set(
    transitionalExtras.indexes.map((entry) => `${entry.table}.${entry.name}`),
  );
  const excludedSequences = new Set(transitionalExtras.sequences);
  const filterEntries = (
    section: unknown,
    excluded: Set<string>,
    key: (entry: Record<string, unknown>) => string,
  ) =>
    Array.isArray(section)
      ? section.filter(
          (entry) =>
            !entry ||
            typeof entry !== "object" ||
            !excluded.has(key(entry as Record<string, unknown>)),
        )
      : section;
  const hasEntry = (
    section: unknown,
    expected: string,
    key: (entry: Record<string, unknown>) => string,
  ) =>
    Array.isArray(section) &&
    section.some(
      (entry) =>
        entry && typeof entry === "object" && key(entry as Record<string, unknown>) === expected,
    );

  for (const entry of transitionalExtras.columns) {
    const expected = `${entry.table}.${entry.name}`;
    if (!hasEntry(fingerprint.columns, expected, (value) => `${value.table}.${value.name}`)) {
      throw new Error(`declared transitional fingerprint column is missing: ${expected}`);
    }
  }
  for (const entry of transitionalExtras.constraints) {
    const expected = `${entry.table}.${entry.name}`;
    if (!hasEntry(fingerprint.constraints, expected, (value) => `${value.table}.${value.name}`)) {
      throw new Error(`declared transitional fingerprint constraint is missing: ${expected}`);
    }
  }
  for (const entry of transitionalExtras.indexes) {
    const expected = `${entry.table}.${entry.name}`;
    if (!hasEntry(fingerprint.indexes, expected, (value) => `${value.table}.${value.name}`)) {
      throw new Error(`declared transitional fingerprint index is missing: ${expected}`);
    }
  }
  for (const sequence of transitionalExtras.sequences) {
    if (!hasEntry(fingerprint.publicSequences, sequence, (value) => String(value.name))) {
      throw new Error(`declared transitional fingerprint sequence is missing: ${sequence}`);
    }
  }

  return {
    ...fingerprint,
    columns: filterEntries(
      fingerprint.columns,
      excludedColumns,
      (entry) => `${String(entry.table)}.${String(entry.name)}`,
    ),
    constraints: filterEntries(
      fingerprint.constraints,
      excludedConstraints,
      (entry) => `${String(entry.table)}.${String(entry.name)}`,
    ),
    indexes: filterEntries(
      fingerprint.indexes,
      excludedIndexes,
      (entry) => `${String(entry.table)}.${String(entry.name)}`,
    ),
    publicRelations: filterEntries(fingerprint.publicRelations, excludedSequences, (entry) =>
      String(entry.name),
    ),
    publicSequences: filterEntries(fingerprint.publicSequences, excludedSequences, (entry) =>
      String(entry.name),
    ),
  };
}

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

export async function createSchemaFingerprint(
  pool: Pool,
  options: { allowTransitionalExtras?: boolean } = {},
) {
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
              'Users can manage their own routes',
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
    [tables, policy.ownedExtensions],
  );
  const fingerprint = result.rows[0]?.fingerprint as Record<string, unknown>;
  return options.allowTransitionalExtras
    ? withoutDeclaredTransitionalExtras(fingerprint)
    : fingerprint;
}

async function main() {
  const pool = new Pool({ connectionString: prepareDbEnv() });
  try {
    const actual = await createSchemaFingerprint(pool, { allowTransitionalExtras: true });
    const serialized = `${JSON.stringify(actual, null, 2)}\n`;
    if (process.argv.includes("--write")) {
      writeFileSync(fingerprintPath, serialized);
      execFileSync("pnpm", ["exec", "biome", "format", "--write", fingerprintPath], {
        cwd: dbPackageRoot,
        stdio: "inherit",
      });
      console.log(`[db:schema:fingerprint] wrote ${fingerprintPath}`);
      return;
    }

    const expected = JSON.parse(readFileSync(fingerprintPath, "utf8")) as unknown;
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(
        "managed schema fingerprint drifted; inspect DB/schema changes before running db:schema:fingerprint:write",
      );
    }
    console.log(`[db:schema:fingerprint] ${managedTableNames().length} managed tables match`);
  } finally {
    await pool.end();
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
