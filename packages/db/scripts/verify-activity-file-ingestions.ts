import assert from "node:assert/strict";
import type { Pool } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const profileId = "10000000-0000-4000-8000-000000000001";
const ingestionId = "30000000-0000-4000-8000-000000000001";
const activityId = "40000000-0000-4000-8000-000000000001";
const artifactId = "50000000-0000-4000-8000-000000000001";
const operationId = "d".repeat(32);

async function expectDatabaseError(
  db: Pool,
  statement: string,
  values: unknown[],
  expected: { code: "23505" | "23514"; constraint: string },
) {
  await assert.rejects(db.query(statement, values), (error: unknown) => {
    const databaseError = error as { code?: string; constraint?: string };
    return databaseError.code === expected.code && databaseError.constraint === expected.constraint;
  });
}

await withDisposableDatabase(process.argv.slice(2), "activity_file_ingestions", async (db) => {
  await bootstrapSupabaseSchemas(db);
  await applySqlFile(db, requireFreshBaseline().sourcePath);
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'direct-ingestion@example.test', '{}'::jsonb)",
    [profileId],
  );

  const deferredObjects = await db.query<{ object_name: string }>(`
    select table_name as object_name
    from information_schema.tables
    where table_schema = 'public' and table_name = 'activity_ingestion_jobs'
    union all
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_file_ingestions'
      and column_name = 'recovery_context'
    union all
    select typname
    from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and typname in ('activity_ingestion_job_state', 'activity_ingestion_cancellation_reason')
  `);
  assert.deepEqual(deferredObjects.rows, []);

  const statuses = await db.query<{ enumlabel: string }>(`
    select value.enumlabel
    from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    join pg_enum value on value.enumtypid = type.oid
    where namespace.nspname = 'public' and type.typname = 'activity_file_ingestion_status'
    order by value.enumsortorder
  `);
  assert.deepEqual(
    statuses.rows.map(({ enumlabel }) => enumlabel),
    ["awaiting_upload", "processing", "failed_retryable", "succeeded", "failed_terminal"],
  );

  await db.query(
    `insert into public.activity_file_ingestions
       (id, profile_id, source, operation_id, staging_bucket, staging_path, expected_sha256,
        expected_byte_size, expected_format, expected_media_type)
     values ($1, $2, 'mobile_recording', $3, 'activity-files', $4, repeat('a', 64), 1,
       'fit', 'application/vnd.ant.fit')`,
    [ingestionId, profileId, operationId, `${profileId}/staging/direct.fit`],
  );

  await expectDatabaseError(
    db,
    `insert into public.activity_file_ingestions (profile_id, source, operation_id)
     values ($1, 'manual_import', $2)`,
    [profileId, operationId],
    { code: "23505", constraint: "activity_file_ingestions_profile_operation_unique" },
  );
  await expectDatabaseError(
    db,
    `insert into public.activity_file_ingestions
       (profile_id, source, operation_id, status)
     values ($1, 'manual_import', $2, 'processing')`,
    [profileId, "p".repeat(32)],
    { code: "23514", constraint: "activity_file_ingestions_lifecycle_check" },
  );
  await db.query(
    `insert into public.activity_file_ingestions
       (profile_id, source, operation_id, status, started_at)
     values ($1, 'manual_import', $2, 'processing', now())`,
    [profileId, "t".repeat(32)],
  );
  await db.query(
    `update public.activity_file_ingestions
     set status = 'failed_terminal', failure_code = 'invalid_activity', failed_at = now()
     where profile_id = $1 and operation_id = $2 and status = 'processing'`,
    [profileId, "t".repeat(32)],
  );
  const terminalFailure = await db.query<{ failure_code: string; status: string }>(
    `select status, failure_code from public.activity_file_ingestions
     where profile_id = $1 and operation_id = $2`,
    [profileId, "t".repeat(32)],
  );
  assert.deepEqual(terminalFailure.rows[0], {
    status: "failed_terminal",
    failure_code: "invalid_activity",
  });

  await db.query(
    `update public.activity_file_ingestions
     set status = 'processing', started_at = now(), uploaded_at = now()
     where id = $1`,
    [ingestionId],
  );
  await db.query(
    `update public.activity_file_ingestions
     set status = 'failed_retryable', failure_code = 'dependency_unavailable', failed_at = now()
     where id = $1`,
    [ingestionId],
  );
  await db.query(
    `update public.activity_file_ingestions
     set status = 'processing', failure_code = null, failed_at = null
     where id = $1 and status = 'failed_retryable'`,
    [ingestionId],
  );

  await db.query("begin");
  await db.query("set constraints all deferred");
  await db.query(
    `insert into public.activities (
       id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
       timing_coverage, parser_version, decoded_contract_version, materializer_version
     ) values ($1, $2, 'Direct activity', now(), now() + interval '1 second', 1000, 1000,
       1000, 'complete', 'fixture', 'fixture', 'fixture')`,
    [activityId, profileId],
  );
  await db.query(
    `insert into public.activity_artifacts
       (id, profile_id, digest, byte_size, bucket, path, media_type, format)
     values ($1, $2, repeat('a', 64), 1, 'activity-files',
       public.activity_artifact_content_path($2::uuid, repeat('a', 64)),
       'application/vnd.ant.fit', 'fit')`,
    [artifactId, profileId],
  );
  await db.query(
    `insert into public.activity_segments (
       id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms, end_offset_ms,
       summary, timing_coverage, active_ms, moving_ms, parser_version, materializer_version
     ) values (
       '60000000-0000-4000-8000-000000000001', $1, $2, 0, 'activity', 'bike', 0, 1000,
       '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1000,"movingMs":1000}}'::jsonb,
       'complete', 1000, 1000, 'fixture', 'fixture'
     )`,
    [activityId, profileId],
  );
  await db.query(
    `update public.activity_file_ingestions
     set status = 'succeeded', activity_id = $2, artifact_id = $3, completed_at = now(),
       staging_cleanup_pending = true
     where id = $1 and status = 'processing'`,
    [ingestionId, activityId, artifactId],
  );
  await db.query("commit");
  await db.query(
    `update public.activity_file_ingestions
     set staging_cleanup_pending = false, staging_cleaned_at = now(), staging_cleanup_error = null
     where id = $1 and staging_cleanup_pending`,
    [ingestionId],
  );

  const result = await db.query<{
    activity_id: string;
    artifact_id: string;
    staging_cleaned_at: Date;
    staging_cleanup_pending: boolean;
    status: string;
  }>(
    `select activity_id, artifact_id, staging_cleaned_at, staging_cleanup_pending, status
     from public.activity_file_ingestions where id = $1`,
    [ingestionId],
  );
  assert.equal(result.rows[0]?.status, "succeeded");
  assert.equal(result.rows[0]?.activity_id, activityId);
  assert.equal(result.rows[0]?.artifact_id, artifactId);
  assert.equal(result.rows[0]?.staging_cleanup_pending, false);
  assert.ok(result.rows[0]?.staging_cleaned_at instanceof Date);

  const privacy = await db.query<{
    anon_can_select: boolean;
    authenticated_can_select: boolean;
    policy_count: number;
    rls_enabled: boolean;
  }>(`
    select class.relrowsecurity rls_enabled,
      (select count(*)::integer from pg_policies
       where schemaname = 'public' and tablename = 'activity_file_ingestions') policy_count,
      has_table_privilege('anon', 'public.activity_file_ingestions', 'select') anon_can_select,
      has_table_privilege('authenticated', 'public.activity_file_ingestions', 'select') authenticated_can_select
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relname = 'activity_file_ingestions'
  `);
  assert.deepEqual(privacy.rows[0], {
    rls_enabled: true,
    policy_count: 0,
    anon_can_select: false,
    authenticated_can_select: false,
  });
});

console.log("Direct activity-file ingestion verification passed.");
