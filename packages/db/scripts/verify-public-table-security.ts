#!/usr/bin/env tsx

import type { PoolClient } from "pg";
import { Pool } from "pg";
import { requireExplicitGuardedDisposableLocalTarget } from "./_target-safety";

type TableSecurityRow = {
  table_name: string;
  rls_enabled: boolean;
  anon_has_any: boolean;
  authenticated_has_any: boolean;
  service_role_select_explicit: boolean;
  service_role_insert_explicit: boolean;
  service_role_update_explicit: boolean;
  service_role_delete_explicit: boolean;
  service_role_truncate_explicit: boolean;
  service_role_references_explicit: boolean;
  service_role_trigger_explicit: boolean;
};

const coachingAuthorityReadOnlyTables = [
  "organizations",
  "organization_memberships",
  "organization_membership_role_grants",
  "coaching_engagements",
  "coaching_assignments",
  "athlete_consent_policy_versions",
  "athlete_data_sharing_consents",
  "organization_audit_events",
] as const;
const coachingAuthorityReadOnlyTableSet = new Set<string>(coachingAuthorityReadOnlyTables);
const immutableDerivedTables = [
  "activity_efforts",
  "activity_training_effects",
  "threshold_evaluations",
  "threshold_evaluation_efforts",
  "thresholds",
] as const;
const immutableDerivedTableSet = new Set<string>(immutableDerivedTables);

type SequenceSecurityRow = {
  sequence_name: string;
  anon_has_any: boolean;
  authenticated_has_any: boolean;
  service_role_has_required: boolean;
};

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
  const databaseUrl = requireExplicitGuardedDisposableLocalTarget(process.argv.slice(2));
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query("begin");

    // Current security is verified directly; it is not inferred from historical SQL paths.
    await client.query(`
      create table public.__security_verifier_current (
        id serial primary key,
        marker text not null
      )
    `);
    await client.query("alter table public.__security_verifier_current enable row level security");
    await client.query(
      "revoke all on table public.__security_verifier_current from public, anon, authenticated",
    );
    await client.query("grant all on table public.__security_verifier_current to service_role");

    const tables = await client.query<TableSecurityRow>(`
      select
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_has_any,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_has_any,
        coalesce(bool_or(acl.privilege_type = 'SELECT' and acl.grantee = service_role.oid), false) as service_role_select_explicit,
        coalesce(bool_or(acl.privilege_type = 'INSERT' and acl.grantee = service_role.oid), false) as service_role_insert_explicit,
        coalesce(bool_or(acl.privilege_type = 'UPDATE' and acl.grantee = service_role.oid), false) as service_role_update_explicit,
        coalesce(bool_or(acl.privilege_type = 'DELETE' and acl.grantee = service_role.oid), false) as service_role_delete_explicit,
        coalesce(bool_or(acl.privilege_type = 'TRUNCATE' and acl.grantee = service_role.oid), false) as service_role_truncate_explicit,
        coalesce(bool_or(acl.privilege_type = 'REFERENCES' and acl.grantee = service_role.oid), false) as service_role_references_explicit,
        coalesce(bool_or(acl.privilege_type = 'TRIGGER' and acl.grantee = service_role.oid), false) as service_role_trigger_explicit
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join pg_catalog.pg_roles service_role
      left join lateral pg_catalog.aclexplode(c.relacl) acl on true
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and service_role.rolname = 'service_role'
      group by c.oid, c.relname, c.relrowsecurity
      order by c.relname
    `);

    if (tables.rows.length === 0) throw new Error("public table catalog is empty");
    const tableNames = new Set(tables.rows.map((row) => row.table_name));
    const missingReadOnlyTables = coachingAuthorityReadOnlyTables.filter(
      (tableName) => !tableNames.has(tableName),
    );
    if (missingReadOnlyTables.length > 0) {
      throw new Error(
        `coaching read-only ACL allowlist has missing or stale table names: ${missingReadOnlyTables.join(", ")}`,
      );
    }
    if (coachingAuthorityReadOnlyTableSet.size !== coachingAuthorityReadOnlyTables.length) {
      throw new Error("coaching read-only ACL allowlist contains duplicate table names");
    }
    const missingImmutableTables = immutableDerivedTables.filter(
      (tableName) => !tableNames.has(tableName),
    );
    if (missingImmutableTables.length > 0) {
      throw new Error(
        `immutable derived ACL allowlist has missing or stale table names: ${missingImmutableTables.join(", ")}`,
      );
    }

    for (const row of tables.rows) {
      if (!row.rls_enabled) throw new Error(`table ${row.table_name}: expected RLS enabled`);
      if (row.anon_has_any)
        throw new Error(`table ${row.table_name}: anon has an effective table ACL`);
      if (row.authenticated_has_any)
        throw new Error(`table ${row.table_name}: authenticated has an effective table ACL`);

      if (coachingAuthorityReadOnlyTableSet.has(row.table_name)) {
        if (!row.service_role_select_explicit) {
          throw new Error(`table ${row.table_name}: expected explicit service_role SELECT ACL`);
        }
        if (
          row.service_role_insert_explicit ||
          row.service_role_update_explicit ||
          row.service_role_delete_explicit ||
          row.service_role_truncate_explicit ||
          row.service_role_references_explicit ||
          row.service_role_trigger_explicit
        ) {
          throw new Error(
            `table ${row.table_name}: service_role must not have explicit INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER ACLs`,
          );
        }
        continue;
      }

      if (immutableDerivedTableSet.has(row.table_name)) {
        if (!row.service_role_select_explicit || !row.service_role_insert_explicit) {
          throw new Error(
            `table ${row.table_name}: expected explicit service_role SELECT/INSERT ACLs`,
          );
        }
        if (
          row.service_role_update_explicit ||
          row.service_role_delete_explicit ||
          row.service_role_truncate_explicit ||
          row.service_role_references_explicit ||
          row.service_role_trigger_explicit
        ) {
          throw new Error(
            `table ${row.table_name}: immutable derived table must be service_role INSERT/SELECT-only`,
          );
        }
        continue;
      }

      if (
        !row.service_role_select_explicit ||
        !row.service_role_insert_explicit ||
        !row.service_role_update_explicit ||
        !row.service_role_delete_explicit
      ) {
        throw new Error(
          `table ${row.table_name}: expected explicit service_role SELECT/INSERT/UPDATE/DELETE ACLs`,
        );
      }
    }

    const definers = await client.query<{
      identity: string;
      anon_execute: boolean;
      authenticated_execute: boolean;
    }>(`
      select p.oid::regprocedure::text as identity,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by identity
    `);
    for (const definer of definers.rows) {
      if (definer.anon_execute || definer.authenticated_execute) {
        throw new Error(`SECURITY DEFINER function is directly callable: ${definer.identity}`);
      }
    }
    await expectRoleDenied(
      client,
      "anon",
      "select public.validate_activity_segment_set('00000000-0000-0000-0000-000000000000'::uuid)",
    );
    await expectRoleDenied(
      client,
      "authenticated",
      "select public.validate_activity_segment_set('00000000-0000-0000-0000-000000000000'::uuid)",
    );
    const segmentTrigger = await client.query(
      "select 1 from pg_trigger where tgrelid = 'public.activity_segments'::regclass and tgname = 'activity_segments_validate_set' and tgenabled = 'O'",
    );
    if (segmentTrigger.rowCount !== 1)
      throw new Error("activity segment validation trigger is not enabled");

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

    const advisorIndex = await client.query<{
      composite_exists: boolean;
      redundant_exists: boolean;
    }>(`
      select
        exists (
          select 1 from pg_catalog.pg_indexes
          where schemaname = 'public'
            and tablename = 'activity_file_ingestions'
            and indexname = 'idx_activity_file_ingestions_activity_profile'
        ) as composite_exists,
        exists (
          select 1 from pg_catalog.pg_indexes
          where schemaname = 'public'
            and tablename = 'activity_file_ingestions'
            and indexname = 'idx_activity_file_ingestions_activity_id'
        ) as redundant_exists
    `);
    if (!advisorIndex.rows[0]?.composite_exists || advisorIndex.rows[0]?.redundant_exists) {
      throw new Error(
        "activity_file_ingestions must retain the composite foreign-key index without its redundant left-prefix duplicate",
      );
    }

    console.log(
      `[db:security:check] ${tables.rows.length - 1} application tables (${coachingAuthorityReadOnlyTables.length} coaching read-only, ${immutableDerivedTables.length} immutable derived) and ${sequences.rows.length - 1} application sequences passed catalog ACL, RLS, and switched-role behavior checks`,
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
