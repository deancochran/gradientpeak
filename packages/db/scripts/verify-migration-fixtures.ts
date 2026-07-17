#!/usr/bin/env tsx

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import { classifyLedger, type LedgerEntry } from "./check-migration-ledger";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import { installWriterFence, proveWriterFence } from "./multisport-command";

type LedgerEvidence = { entries: LedgerEntry[] };
type Policy = {
  authorityDirectory: string;
  baseline: { version: string; name: string };
  ledgerEvidence: { preReconciliationFile: string; postReconciliationFile: string };
};

type IdxStorageEvidence = {
  column_count: string;
  relation_bytes: string;
  relation_count: string;
  tables: string[];
};

async function readIdxStorageEvidence(target: Parameters<typeof createSchemaFingerprint>[0]) {
  const result = await target.query<IdxStorageEvidence>(`
    with idx_columns as (
      select table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'idx'
    ), idx_relations as (
      select distinct relation.oid, relation.relname
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and (
          relation.relname like '%\\_idx\\_seq' escape '\\'
          or (
            relation.relkind = 'i'
            and pg_get_indexdef(relation.oid) ~ '\\(idx\\)'
          )
        )
    )
    select
      (select count(*) from idx_columns)::text as column_count,
      coalesce((select sum(pg_total_relation_size(oid)) from idx_relations), 0)::text
        as relation_bytes,
      (select count(*) from idx_relations)::text as relation_count,
      coalesce(
        (select jsonb_agg(table_name order by table_name) from idx_columns),
        '[]'::jsonb
      ) as tables
  `);
  const evidence = result.rows[0];
  if (!evidence) throw new Error("idx storage evidence query returned no row");
  return evidence;
}

function assertFingerprintMatches(
  actualFingerprint: Record<string, unknown>,
  expectedFingerprint: Record<string, unknown>,
  phase: string,
) {
  if (JSON.stringify(actualFingerprint) === JSON.stringify(expectedFingerprint)) return;

  const differingSections = Object.keys(expectedFingerprint).filter(
    (key) => JSON.stringify(actualFingerprint[key]) !== JSON.stringify(expectedFingerprint[key]),
  );
  const diagnostics = differingSections.map((section) => {
    const expected = expectedFingerprint[section];
    const found = actualFingerprint[section];
    if (!Array.isArray(expected) || !Array.isArray(found)) return section;
    const index = Math.max(
      0,
      expected.findIndex(
        (value, position) => JSON.stringify(value) !== JSON.stringify(found[position]),
      ),
    );
    return `${section}[${index}] expected=${JSON.stringify(expected[index])} found=${JSON.stringify(found[index])}`;
  });
  throw new Error(`${phase} fingerprint mismatch: ${diagnostics.join("; ")}`);
}

async function main() {
  const args = process.argv.slice(2);
  const policy = JSON.parse(
    readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
  ) as Policy;
  const pre = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.preReconciliationFile), "utf8"),
  ) as LedgerEvidence;
  const post = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.postReconciliationFile), "utf8"),
  ) as LedgerEvidence;
  if (
    classifyLedger(pre.entries.slice(0, -1), pre.entries, post.entries) !==
    "unsupported-intermediate"
  ) {
    throw new Error("partial ledger fixture must be rejected as unsupported");
  }

  await withDisposableDatabase(args, "upgrade_verify", async (target) => {
    await bootstrapSupabaseSchemas(target);
    const migrationDirectory = resolve(dbPackageRoot, policy.authorityDirectory);
    const activeFiles = readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const baselineFile = `${policy.baseline.version}_${policy.baseline.name}.sql`;
    if (activeFiles[0] !== baselineFile)
      throw new Error("baseline is not the first active migration");

    // The baseline is the captured endpoint schema snapshot. Recreate that endpoint
    // with its exact old ledger, representative product data, and drifted storage.
    await applySqlFile(target, resolve(migrationDirectory, baselineFile));
    await target.query(`
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (
        version text primary key,
        name text not null
      )
    `);
    for (const entry of pre.entries) {
      await target.query(
        "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
        [entry.version, entry.name],
      );
    }
    await target.query(`
      insert into public.training_plans (
        id, idx, profile_id, name, structure, template_visibility, is_system_template
      ) values (
        '11111111-1111-4111-8111-111111111111', 9001, null,
        'upgrade sentinel', '{"sessions":[]}'::jsonb, 'public', true
      );
      insert into public.activity_plans (
        id, profile_id, name, activity_category, structure, version,
        template_visibility, is_system_template
      ) values (
        '77777777-7777-4777-8777-777777777777', null, 'upgrade activity sentinel',
        'run', '{"version":2,"intervals":[]}'::jsonb, '2.0', 'public', true
      );
      insert into public.users (id, name, email, email_verified)
      values (
        '22222222-2222-4222-8222-222222222222',
        'idx migration owner',
        'idx-migration@gradientpeak.test',
        true
      );
      insert into public.profiles (id, idx, email, is_public)
      values (
        '22222222-2222-4222-8222-222222222222',
        8001,
        'idx-migration@gradientpeak.test',
        false
      );
      insert into public.users (id, name, email, email_verified)
      values (
        '23232323-2323-4323-8323-232323232323',
        'tombstone-only owner',
        'tombstone-only@gradientpeak.test',
        true
      );
      insert into public.profiles (id, idx, email, is_public)
      values (
        '23232323-2323-4323-8323-232323232323',
        8002,
        'tombstone-only@gradientpeak.test',
        false
      );
      insert into public.integrations (id, idx, profile_id, provider, external_id)
      values (
        '33333333-3333-4333-8333-333333333333',
        8101,
        '22222222-2222-4222-8222-222222222222',
        'wahoo',
        'idx-migration-account'
      );
      insert into public.provider_sync_jobs (
        id, idx, profile_id, integration_id, provider, job_type, sync_lane_key
      ) values
        (
          '44444444-4444-4444-8444-444444444444', 8201,
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333', 'wahoo', 'fixture.first', 'fixture-lane'
        ),
        (
          '55555555-5555-4555-8555-555555555555', 8202,
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333', 'wahoo', 'fixture.second', 'fixture-lane'
        );
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('profile-avatars', 'legacy-avatar-name', false, 1, array['text/plain']::text[]);
    `);
    const before = await target.query(
      `select row_to_json(t) as row from (
        select id, profile_id, name, structure, template_visibility, is_system_template
        from public.training_plans where id = '11111111-1111-4111-8111-111111111111'
      ) t`,
    );
    const idxStorageBefore = await readIdxStorageEvidence(target);
    if (idxStorageBefore.column_count !== "13") {
      throw new Error(
        `baseline fixture expected 13 idx columns, found ${idxStorageBefore.column_count}`,
      );
    }
    const current = await target.query<LedgerEntry>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    if (classifyLedger(current.rows, pre.entries, post.entries) !== "pre-reconciliation") {
      throw new Error("fixture did not recreate the exact captured ledger endpoint");
    }

    // Metadata-only reconciliation: old SQL effects stay in place, while the
    // captured schema snapshot is marked applied. Followups then converge security,
    // storage configuration, and the advisor index.
    await target.query("truncate supabase_migrations.schema_migrations");
    await target.query(
      "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
      [policy.baseline.version, policy.baseline.name],
    );
    for (const file of activeFiles.slice(1)) {
      if (file.endsWith("_multisport_modern_hard_cut.sql")) {
        await target.query(`
          create table public._multisport_cutover_runs (
            run_id uuid primary key, manifest_checksum text not null,target_database text not null,
            database_oid oid not null,system_identifier text not null,snapshot_hash text not null,
            backup_hash text not null,storage_archive_hash text not null,storage_inventory_hash text not null,
            preflight_hash text,staging_hash text,status text not null,generated_at timestamptz not null,expires_at timestamptz not null
          );
          create table public._multisport_activity_plan_manifest (
            run_id uuid not null,id uuid not null, profile_id uuid, name text not null, description text, notes text,
            structure jsonb not null, structure_hash text not null, gps_recording_enabled boolean not null,
            template_visibility text not null, content_visibility text not null, import_provider text,
            import_external_id text, is_system_template boolean not null, created_at timestamptz not null,
            updated_at timestamptz not null,before_semantic_hash text,after_semantic_hash text not null,
            source_semantic_hash text,is_new_source boolean not null,primary key(run_id,id)
          );
          create table public._multisport_training_plan_manifest (
            run_id uuid not null,id uuid not null, structure jsonb not null, structure_hash text not null,primary key(run_id,id)
          );
          create table public._multisport_artifact_manifest (
            run_id uuid not null,artifact_id uuid not null,activity_id uuid not null,profile_id uuid not null,
            source_bucket text not null,source_path text not null,storage_object_id uuid not null,
            accepted_bucket text not null,accepted_path text not null,accepted_storage_object_id uuid not null,
            accepted_storage_version text not null,digest text not null,byte_size bigint not null,
            media_type text not null,format text not null,original_name text,ordinal integer not null,is_current boolean not null,
            primary key(run_id,activity_id,ordinal),unique(run_id,activity_id,artifact_id)
          );
          create table public._multisport_ingestion_manifest(run_id uuid not null,ingestion_id uuid not null,
            activity_id uuid not null,artifact_id uuid,operation_key text not null,primary key(run_id,ingestion_id));
          insert into public._multisport_cutover_runs
          select 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',repeat('0',64),current_database(),
            (select oid from pg_database where datname=current_database()),system_identifier::text,
            repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
            'migrating',now(),now()+interval '1 day' from pg_control_system();
          insert into public._multisport_activity_plan_manifest values (
            'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','77777777-7777-4777-8777-777777777777', null, 'upgrade activity sentinel', null, null,
            '{"version":3,"segments":[{"id":"88888888-8888-4888-a888-888888888888","role":"activity","category":"run","name":"Run","intervals":[{"id":"99999999-9999-4999-a999-999999999999","name":"Run","repetitions":1,"steps":[{"id":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","name":"Run","duration":{"type":"time","seconds":60},"targets":[{"type":"rpe","value":1}]}]}]}]}'::jsonb,
            'v1:sha256:0000000000000000000000000000000000000000000000000000000000000000', true,
            'public', 'public', null, null, true, now(), now(),repeat('7',64),repeat('7',64),null,false
          );
          insert into public._multisport_training_plan_manifest values (
            'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',
            '{"version":1,"sessions":[{"offset_days":0,"activity_plan_id":"77777777-7777-4777-8777-777777777777"}]}'::jsonb,
            'v1:sha256:0000000000000000000000000000000000000000000000000000000000000000'
          );
          insert into public.activity_efforts (
            id, created_at, profile_id, recorded_at, activity_category, effort_type,
            duration_seconds, unit, value, source, method, calculation_version, provenance
          ) values
            (
              '12111111-1111-4111-8111-111111111111', now(),
              '22222222-2222-4222-8222-222222222222', now() - interval '3 minutes',
              'bike', 'power', 1200, 'watts', 300, 'manual', 'profile_update_override',
              'profile-update-v1', '{"input":"profile_update","override_state":"active"}'::jsonb
            ),
            (
              '12222222-2222-4222-8222-222222222222', now(),
              '22222222-2222-4222-8222-222222222222', now() - interval '2 minutes',
              'bike', 'power', 1200, 'watts', 0, 'manual', 'profile_update_override',
              'profile-update-v1', '{"input":"profile_update","override_state":"cleared"}'::jsonb
            ),
            (
              '12333333-3333-4333-8333-333333333333', now(),
              '23232323-2323-4323-8323-232323232323', now() - interval '1 minute',
              'bike', 'power', 1200, 'watts', 0, 'manual', 'profile_update_override',
              'profile-update-v1', '{"input":"profile_update","override_state":"cleared"}'::jsonb
            );
        `);
      }
      await applySqlFile(target, resolve(migrationDirectory, file));
      await target.query(
        "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
        [file.slice(0, 14), file.slice(15, -4)],
      );
    }

    const reconciled = await target.query<LedgerEntry>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    if (classifyLedger(reconciled.rows, pre.entries, post.entries) !== "post-reconciliation") {
      throw new Error("upgrade fixture did not reach the exact post-reconciliation ledger");
    }
    const after = await target.query(
      `select row_to_json(t) as row from (
        select id, profile_id, name, structure, template_visibility, is_system_template
        from public.training_plans where id = '11111111-1111-4111-8111-111111111111'
      ) t`,
    );
    const beforeRow = before.rows[0]?.row as Record<string, unknown> | undefined;
    const afterRow = after.rows[0]?.row as Record<string, unknown> | undefined;
    if (!beforeRow || !afterRow) throw new Error("representative product data is missing");
    const { structure: _beforeStructure, ...beforeMetadata } = beforeRow;
    const { structure: afterStructure, ...afterMetadata } = afterRow;
    if (JSON.stringify(beforeMetadata) !== JSON.stringify(afterMetadata)) {
      throw new Error("representative product metadata changed during reconciliation");
    }
    if ((afterStructure as { version?: unknown })?.version !== 1) {
      throw new Error("representative training plan was not converted to canonical V1");
    }
    await target.query(
      readFileSync(resolve(dbPackageRoot, "scripts/verify-multisport-constraints.sql"), "utf8"),
    );
    const tombstones = await target.query<{ id: string; value: number }>(`
      select id, value
      from public.activity_efforts
      where id in (
        '12111111-1111-4111-8111-111111111111',
        '12222222-2222-4222-8222-222222222222',
        '12333333-3333-4333-8333-333333333333'
      )
      order by id
    `);
    if (
      tombstones.rows.length !== 3 ||
      tombstones.rows[0]?.value !== 300 ||
      tombstones.rows[1]?.value !== 0 ||
      tombstones.rows[2]?.value !== 0
    ) {
      throw new Error("pre-cut active and cleared effort history changed during replay");
    }
    const queueRows = await target.query<{ id: string; queue_sequence: string }>(`
      select id, queue_sequence::text
      from public.provider_sync_jobs
      order by queue_sequence
    `);
    if (
      JSON.stringify(queueRows.rows) !==
      JSON.stringify([
        { id: "44444444-4444-4444-8444-444444444444", queue_sequence: "8201" },
        { id: "55555555-5555-4555-8555-555555555555", queue_sequence: "8202" },
      ])
    ) {
      throw new Error("provider queue sequence did not preserve immutable idx order");
    }
    const insertedQueueRow = await target.query<{ idx: string; queue_sequence: string }>(`
      insert into public.provider_sync_jobs (
        id, profile_id, integration_id, provider, job_type, sync_lane_key
      ) values (
        '66666666-6666-4666-8666-666666666666',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        'wahoo', 'fixture.third', 'fixture-lane'
      ) returning idx::text, queue_sequence::text
    `);
    if (String(insertedQueueRow.rows[0]?.idx) !== insertedQueueRow.rows[0]?.queue_sequence) {
      throw new Error("provider queue idx and queue_sequence did not advance identically");
    }
    const idxStorageAfterExpand = await readIdxStorageEvidence(target);
    if (
      idxStorageAfterExpand.column_count !== "13" ||
      JSON.stringify(idxStorageAfterExpand.tables) !== JSON.stringify(idxStorageBefore.tables)
    ) {
      throw new Error(
        `expand migration changed compatibility idx inventory: ${JSON.stringify(idxStorageAfterExpand.tables)}`,
      );
    }
    const providerQueueObjects = await target.query<{
      identity: string;
      index_count: string;
      trigger_count: string;
    }>(`
      select
        coalesce((
          select identity_generation
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'provider_sync_jobs'
            and column_name = 'queue_sequence'
        ), '') as identity,
        (select count(*)::text from pg_indexes
          where schemaname = 'public'
            and tablename = 'provider_sync_jobs'
            and indexname = 'provider_sync_jobs_queue_sequence_key') as index_count,
        (select count(*)::text from pg_trigger
          where tgrelid = 'public.provider_sync_jobs'::regclass
            and tgname = 'synchronize_provider_sync_job_queue_sequence'
            and not tgisinternal) as trigger_count
    `);
    if (
      providerQueueObjects.rows[0]?.identity !== "BY DEFAULT" ||
      providerQueueObjects.rows[0]?.index_count !== "1" ||
      providerQueueObjects.rows[0]?.trigger_count !== "1"
    ) {
      throw new Error("provider queue_sequence identity/index contract is incomplete");
    }
    const expectedFingerprint = JSON.parse(
      readFileSync(resolve(dbPackageRoot, "schema-fingerprint.json"), "utf8"),
    ) as Record<string, unknown>;
    const expandFingerprint = await createSchemaFingerprint(target, {
      allowTransitionalExtras: true,
    });
    assertFingerprintMatches(expandFingerprint, expectedFingerprint, "expand migration normalized");
    await target.query("begin");
    try {
      await target.query(
        "truncate public.activities cascade;truncate public.provider_sync_jobs cascade;truncate public.integration_resource_links cascade;delete from storage.objects where bucket_id='activity-files'",
      );
      await installWriterFence(target, "aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee");
      const fenceProofs = await proveWriterFence(target);
      for (const expected of [
        "public.activities:trigger-enabled",
        "public.provider_sync_jobs:trigger-enabled",
        "public.integration_resource_links:trigger-enabled",
        "storage.objects:trigger-enabled",
        "synthetic-valid-insert:blocked",
      ]) {
        if (!fenceProofs.includes(expected))
          throw new Error(`empty-table writer fence proof missing ${expected}`);
      }
      console.log(
        `[db:migration:writer-fence] empty-table trigger attestation and synthetic insert rejection passed (${fenceProofs.length} proofs)`,
      );
    } finally {
      await target.query("rollback");
    }

    const contractPath = resolve(dbPackageRoot, "scripts/contract_redundant_idx_columns.sql");
    const contractSql = readFileSync(contractPath, "utf8");
    await target.query("begin");
    let unguardedContractRejected = false;
    try {
      await target.query(contractSql);
    } catch {
      unguardedContractRejected = true;
    } finally {
      await target.query("rollback");
    }
    if (!unguardedContractRejected) throw new Error("unguarded idx contract was not rejected");

    await target.query("begin");
    try {
      await target.query(
        "select set_config('gradientpeak.idx_contract_writes_quiesced', 'on', true)",
      );
      await target.query(
        "select set_config('gradientpeak.idx_contract_old_clients_soaked', 'on', true)",
      );
      await target.query(contractSql);
      const idxStorageAfterContract = await readIdxStorageEvidence(target);
      if (
        idxStorageAfterContract.column_count !== "1" ||
        JSON.stringify(idxStorageAfterContract.tables) !== JSON.stringify(["profile_metrics"])
      ) {
        throw new Error(
          `only profile_metrics.idx may remain after contract, found ${JSON.stringify(idxStorageAfterContract.tables)}`,
        );
      }
      const contractFingerprint = await createSchemaFingerprint(target);
      assertFingerprintMatches(contractFingerprint, expectedFingerprint, "final contract");
      console.log(
        `[db:migration:idx-storage] expand columns ${idxStorageAfterExpand.column_count}, relations ${idxStorageAfterExpand.relation_count}, bytes ${idxStorageAfterExpand.relation_bytes}; contract columns ${idxStorageAfterContract.column_count}, relations ${idxStorageAfterContract.relation_count}, bytes ${idxStorageAfterContract.relation_bytes}`,
      );
    } finally {
      await target.query("rollback");
    }
    console.log(
      `[db:migration:upgrade] ${pre.entries.length}-entry endpoint reconciled to ${post.entries.length} entries with expand compatibility, data convergence, and transactional contract verification`,
    );
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `[db:migration:upgrade] ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.cause) console.error(String(error.cause));
    process.exit(1);
  });
}
