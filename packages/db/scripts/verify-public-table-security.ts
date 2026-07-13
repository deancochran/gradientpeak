#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { Pool } from "pg";
import { prepareDbEnv } from "./_helpers";

type TableSecurityRow = {
  table_name: string;
  rls_enabled: boolean;
  anon_has_any: boolean;
  authenticated_has_any: boolean;
  service_role_has_dml: boolean;
};

type SequenceSecurityRow = {
  sequence_name: string;
  anon_has_any: boolean;
  authenticated_has_any: boolean;
  service_role_has_required: boolean;
};

const securityMigrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260713034515_restore_public_table_security.sql",
    import.meta.url,
  ),
);
const indexMigrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260713034520_add_activity_file_ingestion_fk_index.sql",
    import.meta.url,
  ),
);

async function expectRoleDenied(client: PoolClient, role: "anon" | "authenticated", sql: string) {
  const savepoint = `before_${role}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await client.query(`set local role ${role}`);
    await client.query(sql);
    throw new Error(`${role} unexpectedly executed: ${sql}`);
  } catch (error) {
    if ((error as { code?: string }).code !== "42501") {
      throw error;
    }
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
}

async function main() {
  const pool = new Pool({ connectionString: prepareDbEnv() });
  const client = await pool.connect();

  try {
    const [securityMigration, indexMigration] = await Promise.all([
      readFile(securityMigrationPath, "utf8"),
      readFile(indexMigrationPath, "utf8"),
    ]);
    await client.query("begin");

    // Created before the repair so RLS and current-object ACL behavior are both exercised.
    await client.query(`
      create table public.__security_verifier_current (
        id serial primary key,
        marker text not null
      )
    `);
    await client.query(securityMigration);
    await client.query(indexMigration);

    const tables = await client.query<TableSecurityRow>(`
      select
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_has_any,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_has_any,
        has_table_privilege('service_role', c.oid, 'SELECT')
          and has_table_privilege('service_role', c.oid, 'INSERT')
          and has_table_privilege('service_role', c.oid, 'UPDATE')
          and has_table_privilege('service_role', c.oid, 'DELETE') as service_role_has_dml
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
      order by c.relname
    `);

    if (tables.rows.length === 0) throw new Error("public table catalog is empty");
    const tableFailures = tables.rows.filter(
      (row) =>
        !row.rls_enabled ||
        row.anon_has_any ||
        row.authenticated_has_any ||
        !row.service_role_has_dml,
    );
    if (tableFailures.length > 0) {
      throw new Error(
        `public table security assertions failed: ${tableFailures.map((row) => row.table_name).join(", ")}`,
      );
    }

    const sequences = await client.query<SequenceSecurityRow>(`
      select
        c.relname as sequence_name,
        has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') as anon_has_any,
        has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE') as authenticated_has_any,
        has_sequence_privilege('service_role', c.oid, 'USAGE')
          and has_sequence_privilege('service_role', c.oid, 'SELECT') as service_role_has_required
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'S'
      order by c.relname
    `);
    const sequenceFailures = sequences.rows.filter(
      (row) => row.anon_has_any || row.authenticated_has_any || !row.service_role_has_required,
    );
    if (sequenceFailures.length > 0) {
      throw new Error(
        `public sequence security assertions failed: ${sequenceFailures.map((row) => row.sequence_name).join(", ")}`,
      );
    }

    await expectRoleDenied(
      client,
      "anon",
      "insert into public.__security_verifier_current (marker) values ('anon')",
    );
    await expectRoleDenied(
      client,
      "authenticated",
      "select * from public.__security_verifier_current",
    );

    await client.query("set local role service_role");
    await client.query(
      "insert into public.__security_verifier_current (marker) values ('service-role')",
    );
    await client.query("reset role");
    // The owner connection represents Better Auth/direct backend database access.
    await client.query("insert into public.__security_verifier_current (marker) values ('owner')");

    // Objects created after the migration prove postgres/migration-executor defaults.
    await client.query(`
      create table public.__security_verifier_default (
        id serial primary key,
        marker text not null
      )
    `);
    await expectRoleDenied(client, "anon", "truncate table public.__security_verifier_default");
    await expectRoleDenied(
      client,
      "authenticated",
      "insert into public.__security_verifier_default (marker) values ('authenticated')",
    );
    await client.query("set local role service_role");
    await client.query(
      "insert into public.__security_verifier_default (marker) values ('service-default')",
    );
    await client.query("reset role");

    const defaultSequence = await client.query<SequenceSecurityRow>(`
      select
        c.relname as sequence_name,
        has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') as anon_has_any,
        has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE') as authenticated_has_any,
        has_sequence_privilege('service_role', c.oid, 'USAGE')
          and has_sequence_privilege('service_role', c.oid, 'SELECT') as service_role_has_required
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'S'
        and c.relname = '__security_verifier_default_id_seq'
    `);
    if (
      defaultSequence.rows.length !== 1 ||
      defaultSequence.rows[0]?.anon_has_any ||
      defaultSequence.rows[0]?.authenticated_has_any ||
      !defaultSequence.rows[0]?.service_role_has_required
    ) {
      throw new Error("default sequence privilege assertions failed");
    }

    const advisorIndex = await client.query<{ exists: boolean }>(`
      select exists (
        select 1 from pg_catalog.pg_indexes
        where schemaname = 'public'
          and tablename = 'activity_file_ingestions'
          and indexname = 'idx_activity_file_ingestions_activity_profile'
      )
    `);
    if (!advisorIndex.rows[0]?.exists) {
      throw new Error("activity_file_ingestions composite foreign-key index is missing");
    }

    console.log(
      `[db:security:check] ${tables.rows.length - 1} application tables and ${sequences.rows.length - 1} application sequences passed current/default ACL, RLS, and switched-role behavior checks`,
    );
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[db:security:check] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
