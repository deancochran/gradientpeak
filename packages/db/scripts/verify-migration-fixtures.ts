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
    if (JSON.stringify(before.rows) !== JSON.stringify(after.rows)) {
      throw new Error("representative product data changed during reconciliation");
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
