#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { Pool, type PoolClient } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot, runSupabaseCli } from "./_helpers";
import { requireFreshBaseline } from "./baseline-workflow";
import { structureHash } from "./canonical-json";

const activityCategoryValues = ["run", "bike", "swim", "strength", "other"] as const;

/** Accept only Supabase CLI's complete known empty migra envelope. */
export function isEmptyPublicSchemaDiff(output: string): boolean {
  const trimmed = output.trim();
  if (!trimmed) return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const envelope = parsed as Record<string, unknown>;
  const expected = ["diff", "dropStatements", "engine", "file", "files", "message", "schemas"];
  const keys = Object.keys(envelope).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]) &&
    envelope.engine === "migra" &&
    envelope.file === null &&
    envelope.message === "Diff complete." &&
    typeof envelope.diff === "string" &&
    envelope.diff.trim() === "" &&
    Array.isArray(envelope.files) &&
    envelope.files.length === 0 &&
    Array.isArray(envelope.schemas) &&
    envelope.schemas.length === 1 &&
    envelope.schemas[0] === "public" &&
    Array.isArray(envelope.dropStatements) &&
    envelope.dropStatements.length === 0
  );
}

async function assertCanonicalActivityCategories(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const categories = await target.query<{ enumlabel: string }>(
    `select enum_value.enumlabel
     from pg_catalog.pg_type enum_type
     join pg_catalog.pg_namespace namespace on namespace.oid = enum_type.typnamespace
     join pg_catalog.pg_enum enum_value on enum_value.enumtypid = enum_type.oid
     where namespace.nspname = 'public' and enum_type.typname = 'activity_category'
     order by enum_value.enumsortorder`,
  );
  if (
    JSON.stringify(categories.rows.map(({ enumlabel }) => enumlabel)) !==
    JSON.stringify(activityCategoryValues)
  ) {
    throw new Error("fresh baseline is missing the exact activity_category enum values");
  }
  await target.query(`
    insert into auth.users (id, email, raw_user_meta_data)
    values ('11111111-1111-4111-8111-111111111111', 'canonical-category@example.test', '{}'::jsonb);
    insert into public.profiles (id) values ('11111111-1111-4111-8111-111111111111') on conflict do nothing;
    insert into public.activities (
      id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
      timing_coverage, parser_version, decoded_contract_version, materializer_version
    ) values (
      '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
      'canonical category fixture', now(), now() + interval '1 second', 1000, 1000, 1000,
      'complete', 'fixture', 'fixture', 'fixture'
    );
    insert into public.activity_segments (
      id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms, end_offset_ms,
      summary, timing_coverage, active_ms, moving_ms, parser_version, materializer_version
    ) values (
      '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111', 0, 'activity', 'run', 0, 1000,
      '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1000,"movingMs":1000}}'::jsonb,
      'complete', 1000, 1000, 'fixture', 'fixture'
    );
  `);
  for (const contentVisibility of ["private", "followers", "public"] as const) {
    await target.query(
      `update public.activities set content_visibility = $1 where id = '22222222-2222-4222-8222-222222222222'`,
      [contentVisibility],
    );
    const roundTrip = await target.query<{ content_visibility: string }>(
      `select content_visibility from public.activities where id = '22222222-2222-4222-8222-222222222222'`,
    );
    if (roundTrip.rows[0]?.content_visibility !== contentVisibility) {
      throw new Error(`content visibility did not round trip: ${contentVisibility}`);
    }
  }
}

async function expectActivityAnalysisRejection(
  target: {
    query: <Row extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Row[] }>;
  },
  statement: string,
  message: string,
) {
  try {
    await target.query(statement);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const actualMessage =
      error && typeof error === "object" && "message" in error ? error.message : null;
    if (code === "P0001" && typeof actualMessage === "string" && actualMessage.includes(message)) {
      return;
    }
    throw error;
  }
  throw new Error(`expected activity analysis rejection: ${message}`);
}

async function assertActivityAnalysisRevisionContract(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  await target.query(`
    insert into public.activities (
      id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
      timing_coverage, parser_version, decoded_contract_version, materializer_version,
      performance_target_snapshot
    ) values (
      '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111',
      'analysis revision fixture', now(), now() + interval '1 second', 1000, 1000, 1000,
      'complete', 'fixture', 'fixture', 'fixture', '{"original":true}'::jsonb
    );
    insert into public.activity_segments (
      id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms, end_offset_ms,
      summary, timing_coverage, active_ms, moving_ms, parser_version, materializer_version
    ) values (
      '66666666-6666-4666-8666-666666666667', '66666666-6666-4666-8666-666666666666',
      '11111111-1111-4111-8111-111111111111', 0, 'activity', 'run', 0, 1000,
      '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1000,"movingMs":1000}}'::jsonb,
      'complete', 1000, 1000, 'fixture', 'fixture'
    );
    insert into public.activity_analysis_revisions (
      id, activity_id, profile_id, revision, source_segments_revision, analysis_version, reason,
      performance_target_snapshot, target_fingerprint, segment_load_projection,
      output_fingerprint, computed_at
    ) values
      (
        '66666666-6666-4666-8666-666666666668', '66666666-6666-4666-8666-666666666666',
        '11111111-1111-4111-8111-111111111111', 1, 1, 'manual-profile-activity-analysis-v1',
        'manual_profile_reprocess', '{"reprocessed":true}'::jsonb,
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '{"version":1,"segments":[]}'::jsonb,
        'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', now()
      ),
      (
        '66666666-6666-4666-8666-666666666669', '66666666-6666-4666-8666-666666666666',
        '11111111-1111-4111-8111-111111111111', 2, 1, 'manual-profile-activity-analysis-v1',
        'manual_profile_reprocess', '{"reprocessed":"B"}'::jsonb,
        'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        '{"version":1,"segments":[{"state":"B"}]}'::jsonb,
        'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', now()
      ),
      (
        '66666666-6666-4666-8666-666666666670', '66666666-6666-4666-8666-666666666666',
        '11111111-1111-4111-8111-111111111111', 3, 1, 'manual-profile-activity-analysis-v1',
        'manual_profile_reprocess', '{"reprocessed":true}'::jsonb,
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '{"version":1,"segments":[]}'::jsonb,
        'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', now()
      );
  `);
  const history = await target.query<{
    output_fingerprint: string;
    revision: number;
    target_fingerprint: string;
  }>(`
    select revision, target_fingerprint, output_fingerprint
    from public.activity_analysis_revisions
    where activity_id = '66666666-6666-4666-8666-666666666666'
    order by revision
  `);
  if (
    history.rows.length !== 3 ||
    history.rows[0]?.target_fingerprint !== history.rows[2]?.target_fingerprint ||
    history.rows[0]?.output_fingerprint !== history.rows[2]?.output_fingerprint ||
    history.rows[1]?.output_fingerprint === history.rows[2]?.output_fingerprint
  ) {
    throw new Error("activity analysis revisions did not preserve the A-B-A append history");
  }
  await expectActivityAnalysisRejection(
    target,
    `update public.activities
     set performance_target_snapshot = '{"changed":true}'::jsonb
     where id = '66666666-6666-4666-8666-666666666666'`,
    "activity performance target snapshots are immutable after capture",
  );
  await expectActivityAnalysisRejection(
    target,
    `update public.activity_analysis_revisions
     set computed_at = now()
     where id = '66666666-6666-4666-8666-666666666668'`,
    "activity analysis revisions are append-only",
  );
  await expectActivityAnalysisRejection(
    target,
    `insert into public.activity_analysis_revisions (
       activity_id, profile_id, revision, source_segments_revision, analysis_version, reason,
       performance_target_snapshot, target_fingerprint, segment_load_projection,
       output_fingerprint, computed_at
     ) values (
       '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111',
       4, 2, 'manual-profile-activity-analysis-v1', 'manual_profile_reprocess', '{}'::jsonb,
       'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
       '{"version":1,"segments":[]}'::jsonb,
       'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', now()
     )`,
    "activity analysis revision must match the owned current segment revision",
  );
  await target.query(
    "delete from public.activities where id = '66666666-6666-4666-8666-666666666666'",
  );
  const remaining = await target.query<{ count: string }>(
    "select count(*)::text as count from public.activity_analysis_revisions where activity_id = '66666666-6666-4666-8666-666666666666'",
  );
  if (remaining.rows[0]?.count !== "0") {
    throw new Error("activity analysis revisions did not cascade with their owned activity");
  }
  console.log(
    "[db:activity-analysis-revisions] immutable originals, A-B-A append history, segment linkage, and owned cascade passed",
  );
}

async function expectConstraintViolation(
  target: {
    query: <Row extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Row[] }>;
  },
  statement: string,
  expected: { code: "23503" | "23505" | "23514"; constraint: string },
  values?: unknown[],
) {
  try {
    await target.query(statement, values);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const constraint =
      error && typeof error === "object" && "constraint" in error ? error.constraint : null;
    if (code === expected.code && constraint === expected.constraint) return;
    throw error;
  }
  throw new Error(`expected ${expected.constraint} to reject the activity identity fixture`);
}

async function waitForPostgresLock(observer: PoolClient, pid: number, label: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ waiting: boolean | null }>(
      "select wait_event_type = 'Lock' as waiting from pg_catalog.pg_stat_activity where pid = $1",
      [pid],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${label} did not wait on a PostgreSQL lock`);
}

async function assertImportRunDeleteRace(
  target: {
    query: <Row extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Row[] }>;
  },
  connectionString: string,
) {
  const insertRaceRunId = "77777777-7777-4777-8777-777777777784";
  const retargetRaceRunId = "77777777-7777-4777-8777-777777777785";
  const retargetReferenceId = "77777777-7777-4777-8777-777777777786";
  const childInsertRaceRunId = "77777777-7777-4777-8777-777777777787";
  const childRetargetRaceRunId = "77777777-7777-4777-8777-777777777788";
  const childInsertReferenceId = "77777777-7777-4777-8777-777777777789";
  const childRetargetReferenceId = "77777777-7777-4777-8777-777777777790";
  const profileId = "11111111-1111-4111-8111-111111111111";
  const integrationId = "77777777-7777-4777-8777-777777777771";
  await target.query(
    `insert into public.activity_import_runs (id, profile_id, integration_id, integration_generation, kind)
     values
       ($1, $2, $3, 4, 'manual_sync'),
       ($4, $2, $3, 5, 'manual_sync'),
       ($5, $2, $3, 6, 'manual_sync'),
       ($6, $2, $3, 7, 'manual_sync')`,
    [
      insertRaceRunId,
      profileId,
      integrationId,
      retargetRaceRunId,
      childInsertRaceRunId,
      childRetargetRaceRunId,
    ],
  );
  await target.query(
    `insert into public.activity_source_references (
      id, profile_id, integration_id, provider, provider_external_id, resolution_status
    ) values
      ($1, $2, $3, 'wahoo', 'delete-race-retarget', 'review'),
      ($4, $2, $3, 'wahoo', 'delete-race-child-retarget', 'review')`,
    [retargetReferenceId, profileId, integrationId, childRetargetReferenceId],
  );

  const sessions = new Pool({ connectionString, max: 3 });
  const deleter = await sessions.connect();
  const contender = await sessions.connect();
  const observer = await sessions.connect();
  try {
    const races: Array<{ label: string; runId: string; statement: string; values: string[] }> = [
      {
        label: "source insert",
        runId: insertRaceRunId,
        statement: `insert into public.activity_source_references (
          profile_id, integration_id, provider, provider_external_id, resolution_status, last_import_run_id
        ) values ($1, $2, 'wahoo', 'delete-race-insert', 'review', $3)`,
        values: [profileId, integrationId, insertRaceRunId],
      },
      {
        label: "source retarget",
        runId: retargetRaceRunId,
        statement: `update public.activity_source_references
          set last_import_run_id = $1,
              last_material_import_run_id = $1,
              last_material_effective_at = '2026-11-05T00:00:00Z'
          where id = $2`,
        values: [retargetRaceRunId, retargetReferenceId],
      },
    ];
    for (const race of races) {
      await deleter.query(
        "begin; set local lock_timeout = '5s'; set local statement_timeout = '10s'",
      );
      await contender.query(
        "begin; set local lock_timeout = '5s'; set local statement_timeout = '10s'",
      );
      await deleter.query("delete from public.activity_import_runs where id = $1", [race.runId]);
      const pid = (await contender.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
        ?.pid;
      if (!pid) throw new Error(`${race.label} contender has no backend pid`);
      const pending = contender
        .query(race.statement, race.values)
        .then(() => ({ code: null, constraint: null }))
        .catch((error: unknown) => ({
          code: error && typeof error === "object" && "code" in error ? error.code : null,
          constraint:
            error && typeof error === "object" && "constraint" in error ? error.constraint : null,
        }));
      await waitForPostgresLock(observer, pid, `import-run delete ${race.label}`);
      await deleter.query("commit");
      const result = await pending;
      if (result.code !== "23503") {
        throw new Error(`import-run delete ${race.label} did not reject its racing reference`);
      }
      await contender.query("rollback");
    }

    const childFirstRaces: Array<{
      label: string;
      referenceId: string;
      runId: string;
      statement: string;
      values: string[];
    }> = [
      {
        label: "source insert",
        referenceId: childInsertReferenceId,
        runId: childInsertRaceRunId,
        statement: `insert into public.activity_source_references (
          id, profile_id, integration_id, provider, provider_external_id, resolution_status,
          last_import_run_id, last_material_import_run_id, last_material_effective_at
        ) values ($1, $2, $3, 'wahoo', 'delete-race-child-insert', 'review', $4, $4, '2026-11-06T00:00:00Z')`,
        values: [childInsertReferenceId, profileId, integrationId, childInsertRaceRunId],
      },
      {
        label: "source retarget",
        referenceId: childRetargetReferenceId,
        runId: childRetargetRaceRunId,
        statement: `update public.activity_source_references
          set last_import_run_id = $1,
              last_material_import_run_id = $1,
              last_material_effective_at = '2026-11-07T00:00:00Z'
          where id = $2`,
        values: [childRetargetRaceRunId, childRetargetReferenceId],
      },
    ];
    for (const race of childFirstRaces) {
      await contender.query(
        "begin; set local lock_timeout = '5s'; set local statement_timeout = '10s'",
      );
      await contender.query(race.statement, race.values);
      await deleter.query(
        "begin; set local lock_timeout = '5s'; set local statement_timeout = '10s'",
      );
      const pid = (await deleter.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
        ?.pid;
      if (!pid) throw new Error(`${race.label} deleter has no backend pid`);
      const pendingDelete = deleter.query("delete from public.activity_import_runs where id = $1", [
        race.runId,
      ]);
      await waitForPostgresLock(observer, pid, `child-first import-run delete ${race.label}`);
      await contender.query("commit");
      await pendingDelete;
      await deleter.query("commit");
    }
  } finally {
    await Promise.allSettled([deleter.query("rollback"), contender.query("rollback")]);
    deleter.release();
    contender.release();
    observer.release();
    await sessions.end();
  }

  const retargeted = await target.query<{
    last_import_run_id: string | null;
    last_material_import_run_id: string | null;
    last_material_effective_at: Date | null;
    profile_id: string;
  }>(
    `select profile_id, last_import_run_id, last_material_import_run_id, last_material_effective_at
     from public.activity_source_references where id = $1`,
    [retargetReferenceId],
  );
  assert.deepEqual(retargeted.rows, [
    {
      profile_id: profileId,
      last_import_run_id: null,
      last_material_import_run_id: null,
      last_material_effective_at: null,
    },
  ]);
  const childFirstReferences = await target.query<{
    id: string;
    last_import_run_id: string | null;
    last_material_import_run_id: string | null;
    last_material_effective_at: Date | null;
    profile_id: string;
  }>(
    `select id, profile_id, last_import_run_id, last_material_import_run_id, last_material_effective_at
     from public.activity_source_references where id in ($1, $2) order by id`,
    [childInsertReferenceId, childRetargetReferenceId],
  );
  assert.deepEqual(childFirstReferences.rows, [
    {
      id: childInsertReferenceId,
      profile_id: profileId,
      last_import_run_id: null,
      last_material_import_run_id: null,
      last_material_effective_at: null,
    },
    {
      id: childRetargetReferenceId,
      profile_id: profileId,
      last_import_run_id: null,
      last_material_import_run_id: null,
      last_material_effective_at: null,
    },
  ]);
  console.log(
    "[db:import-run-delete-race] delete-first rejections and child-first cleanup leave no dangling run",
  );
}

async function assertActivitySourceIdentityContract(
  target: {
    query: <Row extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Row[] }>;
  },
  connectionString: string,
) {
  const legacyColumns = await target.query<{ column_name: string }>(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name in ('provider', 'external_id')
  `);
  if (legacyColumns.rows.length !== 0) {
    throw new Error("canonical activities retain legacy provider identity columns");
  }
  const resourceKinds = await target.query<{ enumlabel: string }>(`
    select enum_value.enumlabel
    from pg_catalog.pg_type enum_type
    join pg_catalog.pg_namespace namespace on namespace.oid = enum_type.typnamespace
    join pg_catalog.pg_enum enum_value on enum_value.enumtypid = enum_type.oid
    where namespace.nspname = 'public'
      and enum_type.typname = 'integration_resource_kind'
    order by enum_value.enumsortorder
  `);
  if (!resourceKinds.rows.some(({ enumlabel }) => enumlabel === "activity")) {
    throw new Error("integration_resource_kind must retain the neutral activity enum value");
  }

  await target.query(`
    insert into auth.users (id, email, raw_user_meta_data)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'source-owner-2@example.test', '{}'::jsonb);
    insert into public.profiles (id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') on conflict do nothing;
    insert into public.integrations (id, profile_id, provider, external_id)
    values
      ('77777777-7777-4777-8777-777777777771', '11111111-1111-4111-8111-111111111111', 'wahoo', 'source-owner-1'),
      ('77777777-7777-4777-8777-777777777772', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wahoo', 'source-owner-2');
    insert into public.activities (
      id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
      timing_coverage, parser_version, decoded_contract_version, materializer_version
    ) values (
      '77777777-7777-4777-8777-777777777773', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'source owner fixture', now() - interval '2 days 31 minutes', now() - interval '2 days 31 minutes' + interval '1 second', 1000, 1000, 1000,
      'complete', 'fixture', 'fixture', 'fixture'
    );
    insert into public.activity_artifacts (
      id, profile_id, digest, byte_size, bucket, path, media_type, format
    ) values (
      '77777777-7777-4777-8777-777777777769', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat('a', 64), 1, 'activity-files',
      public.activity_artifact_content_path('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('a', 64)),
      'application/vnd.ant.fit', 'fit'
    );
    insert into public.activity_artifact_links (
      id, activity_id, artifact_id, profile_id, role, ordinal, is_current
    ) values (
      '77777777-7777-4777-8777-777777777768', '77777777-7777-4777-8777-777777777773',
      '77777777-7777-4777-8777-777777777769', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'source', 0, true
    );
    insert into public.activity_segments (
      id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms, end_offset_ms,
      source_artifact_id, summary, timing_coverage, active_ms, moving_ms,
      parser_version, materializer_version
    ) values (
      '77777777-7777-4777-8777-777777777770', '77777777-7777-4777-8777-777777777773',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 'activity', 'bike', 0, 1000,
      '77777777-7777-4777-8777-777777777769',
      '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1000,"movingMs":1000}}'::jsonb,
      'complete', 1000, 1000, 'fixture', 'fixture'
    );
    insert into public.activity_source_references (
      id, profile_id, activity_id, integration_id, provider, provider_external_id
    ) values
      (
        '77777777-7777-4777-8777-777777777774',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '77777777-7777-4777-8777-777777777771', 'wahoo', 'shared-provider-id'
      ),
      (
        '77777777-7777-4777-8777-777777777775',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '77777777-7777-4777-8777-777777777773',
        '77777777-7777-4777-8777-777777777772', 'wahoo', 'shared-provider-id'
      );
  `);
  await expectConstraintViolation(
    target,
    `insert into public.activity_source_references (
      id, profile_id, activity_id, integration_id, provider, provider_external_id
    ) values (
      '77777777-7777-4777-8777-777777777776',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '77777777-7777-4777-8777-777777777771', 'wahoo', 'shared-provider-id'
    )`,
    { code: "23505", constraint: "activity_source_references_provider_unique" },
  );
  await expectConstraintViolation(
    target,
    `insert into public.activity_source_references (
      id, profile_id, activity_id, integration_id, provider, provider_external_id
    ) values (
      '77777777-7777-4777-8777-777777777777',
      '11111111-1111-4111-8111-111111111111',
      '77777777-7777-4777-8777-777777777773',
      '77777777-7777-4777-8777-777777777771', 'wahoo', 'cross-profile-activity'
    )`,
    { code: "23503", constraint: "activity_source_references_activity_profile_fkey" },
  );
  await expectConstraintViolation(
    target,
    `insert into public.activity_source_references (
      id, profile_id, activity_id, integration_id, provider, provider_external_id
    ) values (
      '77777777-7777-4777-8777-777777777778',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '77777777-7777-4777-8777-777777777772', 'wahoo', 'cross-profile-integration'
    )`,
    { code: "23503", constraint: "activity_source_references_integration_profile_fkey" },
  );
  const deletedSameRunId = "77777777-7777-4777-8777-777777777780";
  const deletedMaterialRunId = "77777777-7777-4777-8777-777777777781";
  const sameRunReferenceId = "77777777-7777-4777-8777-777777777782";
  const differentRunReferenceId = "77777777-7777-4777-8777-777777777783";
  await target.query(
    `insert into public.activity_import_runs (id, profile_id, integration_id, integration_generation, kind)
     values
       ($1, '11111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777771', 1, 'manual_sync'),
       ($2, '11111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777771', 2, 'manual_sync')`,
    [deletedSameRunId, deletedMaterialRunId],
  );
  await target.query(
    `insert into public.activity_source_references (
       id, profile_id, integration_id, provider, provider_external_id, resolution_status,
       last_import_run_id, last_material_import_run_id, last_material_effective_at
     ) values
       ($3, '11111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777771',
        'wahoo', 'deleted-run-same', 'review', $1, $1, '2026-11-01T00:00:00Z'),
       ($4, '11111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777771',
        'wahoo', 'deleted-run-different', 'review', $1, $2, '2026-11-02T00:00:00Z')`,
    [deletedSameRunId, deletedMaterialRunId, sameRunReferenceId, differentRunReferenceId],
  );
  await expectConstraintViolation(
    target,
    `insert into public.activity_source_references (
      profile_id, integration_id, provider, provider_external_id, resolution_status, last_import_run_id
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777772',
      'garmin', 'cross-profile-import-run', 'review', $1
    )`,
    { code: "23503", constraint: "activity_source_refs_last_import_run_profile_fk" },
    [deletedSameRunId],
  );
  await expectConstraintViolation(
    target,
    `insert into public.activity_source_references (
      profile_id, integration_id, provider, provider_external_id, resolution_status,
      last_material_import_run_id, last_material_effective_at
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777772',
      'garmin', 'cross-profile-material-import-run', 'review', $1, '2026-11-03T00:00:00Z'
    )`,
    { code: "23503", constraint: "activity_source_refs_material_import_run_profile_fk" },
    [deletedSameRunId],
  );
  await target.query("delete from public.activity_import_runs where id = $1", [deletedSameRunId]);
  const afterFirstDelete = await target.query<{
    id: string;
    last_import_run_id: string | null;
    last_material_import_run_id: string | null;
    last_material_effective_at: Date | null;
    profile_id: string;
  }>(
    `select id, profile_id, last_import_run_id, last_material_import_run_id, last_material_effective_at
     from public.activity_source_references where id in ($1, $2) order by id`,
    [sameRunReferenceId, differentRunReferenceId],
  );
  assert.deepEqual(afterFirstDelete.rows, [
    {
      id: sameRunReferenceId,
      profile_id: "11111111-1111-4111-8111-111111111111",
      last_import_run_id: null,
      last_material_import_run_id: null,
      last_material_effective_at: null,
    },
    {
      id: differentRunReferenceId,
      profile_id: "11111111-1111-4111-8111-111111111111",
      last_import_run_id: null,
      last_material_import_run_id: deletedMaterialRunId,
      last_material_effective_at: new Date("2026-11-02T00:00:00.000Z"),
    },
  ]);
  await target.query("delete from public.activity_import_runs where id = $1", [
    deletedMaterialRunId,
  ]);
  const afterSecondDelete = await target.query<{
    last_material_import_run_id: string | null;
    last_material_effective_at: Date | null;
    profile_id: string;
  }>(
    `select profile_id, last_material_import_run_id, last_material_effective_at
     from public.activity_source_references where id = $1`,
    [differentRunReferenceId],
  );
  assert.deepEqual(afterSecondDelete.rows, [
    {
      profile_id: "11111111-1111-4111-8111-111111111111",
      last_material_import_run_id: null,
      last_material_effective_at: null,
    },
  ]);
  await assertImportRunDeleteRace(target, connectionString);
  await expectConstraintViolation(
    target,
    `insert into public.integration_resource_links (
      id, profile_id, integration_id, provider, resource_kind, internal_resource_id, external_id
    ) values (
      '77777777-7777-4777-8777-777777777779',
      '11111111-1111-4111-8111-111111111111',
      '77777777-7777-4777-8777-777777777771', 'wahoo', 'activity',
      '22222222-2222-4222-8222-222222222222', 'forbidden-activity-link'
    )`,
    { code: "23514", constraint: "integration_resource_links_no_activity_check" },
  );
  console.log(
    "[db:activity-source-identity] sole identity, profile ownership, import-run delete cleanup, scoped uniqueness, and link fence passed",
  );
}

async function assertStrictlyPositiveActivityEfforts(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  try {
    await target.query(`
      insert into public.activity_efforts (
        id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
        effort_type, source_series, duration_seconds, source_artifact_id, source_revision, start_offset_ms,
        end_offset_ms, window_coverage, max_gap_seconds, unit, value, source, method,
        calculation_version, provenance
      ) values (
        '44444444-4444-4444-8444-444444444440', now(),
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '77777777-7777-4777-8777-777777777773',
        '77777777-7777-4777-8777-777777777770', now(), 'bike',
        'power', 'power', 0, '77777777-7777-4777-8777-777777777769', 1, 0, 0,
        1, 1, 'watts', 1, 'test', 'fresh_target_constraint',
        'test-v1', '{"observation_id":"44444444-4444-4444-8444-444444444440"}'::jsonb
      )
    `);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const constraint =
      error && typeof error === "object" && "constraint" in error ? error.constraint : null;
    if (code === "23514" && constraint === "activity_efforts_duration_seconds_positive_check") {
      console.log("[db:activity-efforts] non-positive durations are rejected");
      return;
    }
    throw error;
  }
  throw new Error("activity_efforts accepted a non-positive duration");
}

type VerificationTarget = {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
};

async function expectDatabaseError(
  target: VerificationTarget,
  statement: string,
  expected: { code: string; constraint?: string },
) {
  try {
    await target.query(statement);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const constraint =
      error && typeof error === "object" && "constraint" in error ? error.constraint : null;
    if (code === expected.code && (!expected.constraint || constraint === expected.constraint))
      return;
    throw error;
  }
  throw new Error(`expected database error ${expected.code}:${expected.constraint ?? "any"}`);
}

async function expectServiceRoleDenied(target: VerificationTarget, statement: string) {
  await target.query("set role service_role");
  try {
    await expectDatabaseError(target, statement, { code: "42501" });
  } finally {
    await target.query("reset role");
  }
}

async function assertThresholdRootConcurrency(
  target: VerificationTarget,
  connectionString: string,
) {
  await target.query(`
    begin;
    insert into public.activity_artifacts (
      id, profile_id, digest, byte_size, bucket, path, media_type, format
    ) values (
      '22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111',
      repeat('f', 64), 1, 'activity-files',
      public.activity_artifact_content_path('11111111-1111-4111-8111-111111111111', repeat('f', 64)),
      'application/vnd.ant.fit', 'fit'
    );
    insert into public.activity_artifact_links (
      id, activity_id, artifact_id, profile_id, role, ordinal, is_current
    ) values (
      '22222222-2222-4222-8222-222222222223', '22222222-2222-4222-8222-222222222222',
      '22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111',
      'source', 0, true
    );
    update public.activities
    set started_at = now() - interval '40 minutes', finished_at = now() - interval '10 minutes',
        elapsed_ms = 1800000, active_ms = 1800000, moving_ms = 1800000
    where id = '22222222-2222-4222-8222-222222222222';
    update public.activity_segments
    set source_artifact_id = '22222222-2222-4222-8222-222222222221',
        end_offset_ms = 1800000, active_ms = 1800000, moving_ms = 1800000,
        summary = '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1800000,"movingMs":1800000}}'::jsonb
    where id = '33333333-3333-4333-8333-333333333333';
    insert into public.activity_efforts (
      id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
      effort_type, source_series, duration_seconds, source_artifact_id, source_revision, start_offset_ms,
      end_offset_ms, window_coverage, max_gap_seconds, unit, value, source, method,
      calculation_version, provenance
    ) select
      effort_id, now(), profile_id, id,
      '33333333-3333-4333-8333-333333333333', finished_at, 'run', 'speed', source_series, 1800,
      '22222222-2222-4222-8222-222222222221', 1, 0, 1800000, 1, 1,
      'meters_per_second', value, 'derived', 'best_effort', 'test-v1', '{}'::jsonb
    from public.activities
    cross join (values
      ('44444444-4444-4444-8444-444444444443'::uuid, 'raw_speed'::public.activity_effort_source_series, 4::real),
      ('44444444-4444-4444-8444-444444444444'::uuid, 'grade_adjusted_speed'::public.activity_effort_source_series, 4.1::real)
    ) series(effort_id, source_series, value)
    where id = '22222222-2222-4222-8222-222222222222';

    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, value, unit, confidence,
      observed_at, policy_version, diagnostics, source_activity_id, source_revision
    )
    select evaluation_id, profile_id, 'bike', 'power', 'bike_power_30m', 'qualified',
      237.5, 'watts', 0.9, finished_at, policy_version, '{}'::jsonb, id, segments_revision
    from public.activities
    cross join (values
      ('55555555-5555-4555-8555-555555555557'::uuid, 'threshold-race-a'),
      ('55555555-5555-4555-8555-555555555558'::uuid, 'threshold-race-b')
    ) candidate(evaluation_id, policy_version)
    where id = '77777777-7777-4777-8777-777777777773';
    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, value, unit, confidence,
      observed_at, policy_version, diagnostics, source_activity_id, source_revision
    ) select
      '55555555-5555-4555-8555-555555555559', profile_id, 'run', 'speed',
      'run_speed_30m', 'qualified', 3.8, 'meters_per_second', 0.9, finished_at,
      'threshold-race-run', '{}'::jsonb, id, segments_revision
    from public.activities where id = '22222222-2222-4222-8222-222222222222';
    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, value, unit, confidence,
      observed_at, policy_version, diagnostics, source_activity_id, source_revision
    ) select
      '55555555-5555-4555-8555-555555555556', profile_id, 'run', 'speed',
      'run_speed_30m', 'qualified', 3.9, 'meters_per_second', 0.88, finished_at,
      'threshold-race-run-grade', '{}'::jsonb, id, segments_revision
    from public.activities where id = '22222222-2222-4222-8222-222222222222';
    insert into public.threshold_evaluation_efforts
    select evaluation.id, '44444444-4444-4444-8444-444444444441', evaluation.profile_id,
      evaluation.activity_category, evaluation.source_activity_id, evaluation.source_revision,
      evaluation.metric, 'power', 'power', 'primary', 0
    from public.threshold_evaluations evaluation
    where evaluation.id in (
      '55555555-5555-4555-8555-555555555557',
      '55555555-5555-4555-8555-555555555558'
    );
    insert into public.threshold_evaluation_efforts values (
      '55555555-5555-4555-8555-555555555559', '44444444-4444-4444-8444-444444444443',
      '11111111-1111-4111-8111-111111111111', 'run',
      '22222222-2222-4222-8222-222222222222', 1, 'speed', 'speed', 'raw_speed', 'primary', 0
    );
    insert into public.threshold_evaluation_efforts values (
      '55555555-5555-4555-8555-555555555556', '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111', 'run',
      '22222222-2222-4222-8222-222222222222', 1, 'speed', 'speed',
      'grade_adjusted_speed', 'primary', 0
    );
    commit;
  `);

  await expectDatabaseError(
    target,
    `insert into public.activity_efforts (
      id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
      effort_type, source_series, duration_seconds, source_artifact_id, source_revision,
      start_offset_ms, end_offset_ms, window_coverage, max_gap_seconds, unit, value, source,
      method, calculation_version, provenance
    ) select
      '44444444-4444-4444-8444-444444444446', now(), profile_id, id,
      '33333333-3333-4333-8333-333333333333', finished_at, 'run', 'speed', 'raw_speed',
      1800, '22222222-2222-4222-8222-222222222221', 1, 0, 1800000, 1, 1,
      'meters_per_second', 4, 'derived', 'best_effort', 'test-v1', '{}'::jsonb
    from public.activities where id = '22222222-2222-4222-8222-222222222222'`,
    { code: "23505", constraint: "activity_efforts_deterministic_source_window_unique" },
  );
  const runSeries = await target.query<{ effort_count: string; link_count: string }>(`
    select
      (select count(*) from public.activity_efforts
       where activity_id = '22222222-2222-4222-8222-222222222222'
         and duration_seconds = 1800
         and source_series in ('raw_speed', 'grade_adjusted_speed'))::text as effort_count,
      (select count(*) from public.threshold_evaluation_efforts
       where activity_id = '22222222-2222-4222-8222-222222222222'
         and source_series in ('raw_speed', 'grade_adjusted_speed'))::text as link_count
  `);
  if (runSeries.rows[0]?.effort_count !== "2" || runSeries.rows[0]?.link_count !== "2") {
    throw new Error("run source series did not coexist idempotently with owned evaluation links");
  }
  await target.query(
    "delete from public.activity_efforts where id = '44444444-4444-4444-8444-444444444444'",
  );
  const seriesCascade = await target.query<{ grade_count: string; raw_count: string }>(`
    select
      (select count(*) from public.threshold_evaluations
       where id = '55555555-5555-4555-8555-555555555556')::text as grade_count,
      (select count(*) from public.threshold_evaluations
       where id = '55555555-5555-4555-8555-555555555559')::text as raw_count
  `);
  if (seriesCascade.rows[0]?.grade_count !== "0" || seriesCascade.rows[0]?.raw_count !== "1") {
    throw new Error(
      "source-series effort deletion did not preserve unrelated evaluation ownership",
    );
  }
  console.log(
    "[db:activity-effort-series] raw and grade-adjusted 1800s windows coexist idempotently, link independently, and cascade independently",
  );

  const insertThreshold = (thresholdId: string, evaluationId: string) => `
    insert into public.thresholds (
      id, profile_id, activity_category, metric, evaluation_id, value, unit, confidence,
      method, effective_at, policy_version
    ) select
      '${thresholdId}', profile_id, activity_category, metric, id, value, unit, confidence,
      method, observed_at, policy_version
    from public.threshold_evaluations where id = '${evaluationId}'
  `;
  const sessions = new Pool({ connectionString, max: 2 });
  const first = await sessions.connect();
  const second = await sessions.connect();
  try {
    await first.query("begin");
    await second.query("begin");
    await first.query(
      insertThreshold(
        "66666666-6666-4666-8666-666666666667",
        "55555555-5555-4555-8555-555555555557",
      ),
    );
    const competingInsert = second
      .query(
        insertThreshold(
          "66666666-6666-4666-8666-666666666668",
          "55555555-5555-4555-8555-555555555558",
        ),
      )
      .then(() => ({ code: null, constraint: null }))
      .catch((error: unknown) => ({
        code: error && typeof error === "object" && "code" in error ? error.code : null,
        constraint:
          error && typeof error === "object" && "constraint" in error ? error.constraint : null,
      }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    await first.query("commit");
    const competingResult = await competingInsert;
    if (
      competingResult.code !== "23505" ||
      competingResult.constraint !== "thresholds_identity_root_unique"
    ) {
      throw new Error(
        "concurrent first threshold roots were not serialized by database uniqueness",
      );
    }
    await second.query("rollback");

    const racedRoots = await target.query<{ count: string }>(`
      select count(*)::text as count from public.thresholds
      where profile_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        and activity_category = 'bike' and metric = 'power' and supersedes_id is null
    `);
    if (racedRoots.rows[0]?.count !== "1") {
      throw new Error("same-identity threshold race did not leave exactly one root");
    }
    await target.query(
      "delete from public.thresholds where id = '66666666-6666-4666-8666-666666666667'",
    );

    await first.query("begin");
    await second.query("begin");
    await Promise.all([
      first.query(
        insertThreshold(
          "66666666-6666-4666-8666-666666666669",
          "55555555-5555-4555-8555-555555555557",
        ),
      ),
      second.query(
        insertThreshold(
          "66666666-6666-4666-8666-666666666670",
          "55555555-5555-4555-8555-555555555559",
        ),
      ),
    ]);
    await Promise.all([first.query("commit"), second.query("commit")]);
    const separateRoots = await target.query<{ count: string }>(`
      select count(*)::text as count from public.thresholds
      where id in (
        '66666666-6666-4666-8666-666666666669',
        '66666666-6666-4666-8666-666666666670'
      ) and supersedes_id is null
    `);
    if (separateRoots.rows[0]?.count !== "2") {
      throw new Error("separate threshold identities did not commit independently");
    }
  } finally {
    await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
    first.release();
    second.release();
    await sessions.end();
  }
  await target.query(`
    delete from public.threshold_evaluations where id in (
      '55555555-5555-4555-8555-555555555557',
      '55555555-5555-4555-8555-555555555558',
      '55555555-5555-4555-8555-555555555559'
    )
  `);
  console.log("[db:threshold-roots] same-identity race rejected and separate identities committed");
}

async function assertThresholdChain(
  target: VerificationTarget,
  expected: Array<{ id: string; supersedesId: string | null }>,
) {
  const chain = await target.query<{ id: string; supersedes_id: string | null }>(`
    select id::text, supersedes_id::text
    from public.thresholds
    where profile_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and activity_category = 'bike' and metric = 'power'
    order by effective_at, id
  `);
  const actual = chain.rows.map(({ id, supersedes_id }) => ({ id, supersedesId: supersedes_id }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`threshold chain mismatch: ${JSON.stringify(actual)}`);
  }
  if (
    actual.length > 0 &&
    actual.filter(({ supersedesId }) => supersedesId === null).length !== 1
  ) {
    throw new Error("threshold chain must retain exactly one root");
  }
}

async function assertThresholdTruthContract(target: VerificationTarget, connectionString: string) {
  await target.query(`
    update public.activities
    set finished_at = started_at + interval '30 minutes',
        elapsed_ms = 1800000, active_ms = 1800000, moving_ms = 1800000
    where id = '77777777-7777-4777-8777-777777777773';
    update public.activity_segments
    set end_offset_ms = 1800000, active_ms = 1800000, moving_ms = 1800000,
        summary = '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1800000,"movingMs":1800000}}'::jsonb
    where id = '77777777-7777-4777-8777-777777777770';
    insert into public.activity_efforts (
      id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
      effort_type, source_series, duration_seconds, source_artifact_id, source_revision, start_offset_ms,
      end_offset_ms, window_coverage, max_gap_seconds, unit, value, source, method,
      calculation_version, provenance
    ) select
      '44444444-4444-4444-8444-444444444441', now(), profile_id, id,
      '77777777-7777-4777-8777-777777777770', finished_at, 'bike', 'power', 'power', 1800,
      '77777777-7777-4777-8777-777777777769', 1, 0, 1800000, 1, 2,
      'watts', 250, 'derived', 'best_effort', 'test-v1', '{}'::jsonb
    from public.activities where id = '77777777-7777-4777-8777-777777777773';
  `);
  await assertThresholdRootConcurrency(target, connectionString);

  await target.query(`
    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, unit, observed_at,
      rejection_reason, policy_version, diagnostics, source_activity_id, source_revision
    ) select
      '55555555-5555-4555-8555-555555555554', profile_id, 'bike', 'power',
      'bike_power_30m', 'rejected', 'watts', finished_at, 'exact_window_missing',
      'threshold-rejected-zero-v1', '{"window":"missing"}'::jsonb, id, segments_revision
    from public.activities where id = '77777777-7777-4777-8777-777777777773';

    insert into public.activity_efforts (
      id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
      effort_type, source_series, duration_seconds, source_artifact_id, source_revision,
      start_offset_ms, end_offset_ms, window_coverage, max_gap_seconds, unit, value, source,
      method, calculation_version, provenance
    ) select
      '44444444-4444-4444-8444-444444444448', now(), profile_id, id,
      '77777777-7777-4777-8777-777777777770', finished_at, 'bike', 'power', 'power',
      1800, '77777777-7777-4777-8777-777777777769', 1, 0, 1800000, 0.8, 10,
      'watts', 245, 'derived', 'rejected-window', 'test-v1', '{}'::jsonb
    from public.activities where id = '77777777-7777-4777-8777-777777777773';
    begin;
    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, unit, observed_at,
      rejection_reason, policy_version, diagnostics, source_activity_id, source_revision
    ) select
      '55555555-5555-4555-8555-555555555555', profile_id, 'bike', 'power',
      'bike_power_30m', 'rejected', 'watts', finished_at, 'coverage_insufficient',
      'threshold-rejected-linked-v1', '{"coverage":0.8}'::jsonb, id, segments_revision
    from public.activities where id = '77777777-7777-4777-8777-777777777773';
    insert into public.threshold_evaluation_efforts values (
      '55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444448',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bike',
      '77777777-7777-4777-8777-777777777773', 1, 'power', 'power', 'power', 'primary', 0
    );
    commit;
  `);
  const rejectedForms = await target.query<{ linked_count: string; zero_link_count: string }>(`
    select
      (select count(*) from public.threshold_evaluation_efforts
       where evaluation_id = '55555555-5555-4555-8555-555555555555')::text as linked_count,
      (select count(*) from public.threshold_evaluation_efforts
       where evaluation_id = '55555555-5555-4555-8555-555555555554')::text as zero_link_count
  `);
  if (
    rejectedForms.rows[0]?.linked_count !== "1" ||
    rejectedForms.rows[0]?.zero_link_count !== "0"
  ) {
    throw new Error("rejected evaluations did not preserve linked and zero-link forms");
  }
  await expectDatabaseError(
    target,
    `insert into public.thresholds (
      id, profile_id, activity_category, metric, evaluation_id, value, unit, confidence,
      method, effective_at, policy_version
    ) select
      '66666666-6666-4666-8666-666666666665', profile_id, activity_category, metric,
      id, 250, unit, 0.5, method, observed_at, policy_version
    from public.threshold_evaluations where id = '55555555-5555-4555-8555-555555555554'`,
    { code: "23514", constraint: "thresholds_evaluation_snapshot" },
  );
  await target.query(
    "delete from public.activity_efforts where id = '44444444-4444-4444-8444-444444444448'",
  );
  const rejectedCascade = await target.query<{ linked_count: string; zero_count: string }>(`
    select
      (select count(*) from public.threshold_evaluations
       where id = '55555555-5555-4555-8555-555555555555')::text as linked_count,
      (select count(*) from public.threshold_evaluations
       where id = '55555555-5555-4555-8555-555555555554')::text as zero_count
  `);
  if (
    rejectedCascade.rows[0]?.linked_count !== "0" ||
    rejectedCascade.rows[0]?.zero_count !== "1"
  ) {
    throw new Error("rejected linked evaluation cascade affected zero-link diagnostics");
  }
  console.log(
    "[db:threshold-rejections] zero-link and measured-link rejections persist; linked cascade and publication denial passed",
  );

  await expectDatabaseError(
    target,
    `begin;
     insert into public.threshold_evaluations (
       id, profile_id, activity_category, metric, method, outcome, value, unit, confidence,
       observed_at, policy_version, diagnostics, source_activity_id, source_revision
     ) select
       '55555555-5555-4555-8555-555555555550', profile_id, 'bike', 'power',
       'bike_power_30m', 'qualified', 237.5, 'watts', 0.9, finished_at,
       'threshold-policy-v1', '{}'::jsonb, id, segments_revision
     from public.activities where id = '77777777-7777-4777-8777-777777777773';
     commit;`,
    { code: "23514", constraint: "threshold_evaluations_primary_effort" },
  );
  await target.query("rollback");

  await target.query(`
    begin;
    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, value, unit, confidence,
      observed_at, policy_version, diagnostics, source_activity_id, source_revision
    ) select
      '55555555-5555-4555-8555-555555555551', profile_id, 'bike', 'power',
      'bike_power_30m', 'qualified', 237.5, 'watts', 0.9, finished_at,
      'threshold-policy-v1', '{}'::jsonb, id, segments_revision
    from public.activities where id = '77777777-7777-4777-8777-777777777773';
    insert into public.threshold_evaluation_efforts (
      evaluation_id, effort_id, profile_id, activity_category, activity_id,
      source_revision, metric, effort_type, source_series, role, ordinal
    ) values (
      '55555555-5555-4555-8555-555555555551',
      '44444444-4444-4444-8444-444444444441',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bike',
      '77777777-7777-4777-8777-777777777773', 1, 'power', 'power', 'power', 'primary', 0
    );
    commit;
    insert into public.thresholds (
      id, profile_id, activity_category, metric, evaluation_id, value, unit, confidence,
      method, effective_at, policy_version
    ) select
      '66666666-6666-4666-8666-666666666661', profile_id, activity_category, metric,
      id, value, unit, confidence, method, observed_at, policy_version
    from public.threshold_evaluations where id = '55555555-5555-4555-8555-555555555551';

    insert into public.activities (
      id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
      timing_coverage, parser_version, decoded_contract_version, materializer_version
    ) select
      '77777777-7777-4777-8777-777777777761', profile_id, 'second threshold source',
      started_at + interval '1 day', finished_at + interval '1 day', elapsed_ms, active_ms,
      moving_ms, timing_coverage, parser_version, decoded_contract_version, materializer_version
    from public.activities where id = '77777777-7777-4777-8777-777777777773';
    insert into public.activity_artifacts (
      id, profile_id, digest, byte_size, bucket, path, media_type, format
    ) values (
      '77777777-7777-4777-8777-777777777762', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat('b', 64), 1, 'activity-files',
      public.activity_artifact_content_path('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('b', 64)),
      'application/vnd.ant.fit', 'fit'
    );
    insert into public.activity_artifact_links (
      id, activity_id, artifact_id, profile_id, role, ordinal, is_current
    ) values (
      '77777777-7777-4777-8777-777777777763', '77777777-7777-4777-8777-777777777761',
      '77777777-7777-4777-8777-777777777762', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'source', 0, true
    );
    insert into public.activity_segments (
      id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms,
      end_offset_ms, source_artifact_id, summary, timing_coverage, active_ms, moving_ms,
      parser_version, materializer_version
    ) values (
      '77777777-7777-4777-8777-777777777764', '77777777-7777-4777-8777-777777777761',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 'activity', 'bike', 0, 1800000,
      '77777777-7777-4777-8777-777777777762',
      '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1800000,"movingMs":1800000}}'::jsonb,
      'complete', 1800000, 1800000, 'fixture', 'fixture'
    );
    insert into public.activity_efforts (
      id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
      effort_type, source_series, duration_seconds, source_artifact_id, source_revision, start_offset_ms,
      end_offset_ms, window_coverage, max_gap_seconds, unit, value, source, method,
      calculation_version, provenance
    ) select
      '44444444-4444-4444-8444-444444444442', now(), profile_id, id,
      '77777777-7777-4777-8777-777777777764', finished_at, 'bike', 'power', 'power', 1800,
      '77777777-7777-4777-8777-777777777762', 1, 0, 1800000, 1, 2,
      'watts', 260, 'derived', 'best_effort', 'test-v1', '{}'::jsonb
    from public.activities where id = '77777777-7777-4777-8777-777777777761';
    begin;
    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, value, unit, confidence,
      observed_at, policy_version, diagnostics, source_activity_id, source_revision
    ) select
      '55555555-5555-4555-8555-555555555552', profile_id, 'bike', 'power',
      'bike_power_30m', 'qualified', 247, 'watts', 0.92, finished_at,
      'threshold-policy-v1', '{}'::jsonb, id, segments_revision
    from public.activities where id = '77777777-7777-4777-8777-777777777761';
    insert into public.threshold_evaluation_efforts values (
      '55555555-5555-4555-8555-555555555552', '44444444-4444-4444-8444-444444444442',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bike',
      '77777777-7777-4777-8777-777777777761', 1, 'power', 'power', 'power', 'primary', 0
    );
    commit;
    insert into public.thresholds (
      id, profile_id, activity_category, metric, evaluation_id, value, unit, confidence,
      method, effective_at, policy_version, supersedes_id
    ) select
      '66666666-6666-4666-8666-666666666662', profile_id, activity_category, metric,
      id, value, unit, confidence, method, observed_at, policy_version,
      '66666666-6666-4666-8666-666666666661'
    from public.threshold_evaluations where id = '55555555-5555-4555-8555-555555555552';

    insert into public.activities (
      id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
      timing_coverage, parser_version, decoded_contract_version, materializer_version
    ) select
      '77777777-7777-4777-8777-777777777751', profile_id, 'third threshold source',
      started_at + interval '2 days', finished_at + interval '2 days', elapsed_ms, active_ms,
      moving_ms, timing_coverage, parser_version, decoded_contract_version, materializer_version
    from public.activities where id = '77777777-7777-4777-8777-777777777773';
    insert into public.activity_artifacts (
      id, profile_id, digest, byte_size, bucket, path, media_type, format
    ) values (
      '77777777-7777-4777-8777-777777777752', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat('8', 64), 1, 'activity-files',
      public.activity_artifact_content_path('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('8', 64)),
      'application/vnd.ant.fit', 'fit'
    );
    insert into public.activity_artifact_links (
      id, activity_id, artifact_id, profile_id, role, ordinal, is_current
    ) values (
      '77777777-7777-4777-8777-777777777753', '77777777-7777-4777-8777-777777777751',
      '77777777-7777-4777-8777-777777777752', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'source', 0, true
    );
    insert into public.activity_segments (
      id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms,
      end_offset_ms, source_artifact_id, summary, timing_coverage, active_ms, moving_ms,
      parser_version, materializer_version
    ) values (
      '77777777-7777-4777-8777-777777777754', '77777777-7777-4777-8777-777777777751',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 'activity', 'bike', 0, 1800000,
      '77777777-7777-4777-8777-777777777752',
      '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1800000,"movingMs":1800000}}'::jsonb,
      'complete', 1800000, 1800000, 'fixture', 'fixture'
    );
    insert into public.activity_efforts (
      id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
      effort_type, source_series, duration_seconds, source_artifact_id, source_revision, start_offset_ms,
      end_offset_ms, window_coverage, max_gap_seconds, unit, value, source, method,
      calculation_version, provenance
    ) select
      '44444444-4444-4444-8444-444444444445', now(), profile_id, id,
      '77777777-7777-4777-8777-777777777754', finished_at, 'bike', 'power', 'power', 1800,
      '77777777-7777-4777-8777-777777777752', 1, 0, 1800000, 1, 2,
      'watts', 270, 'derived', 'best_effort', 'test-v1', '{}'::jsonb
    from public.activities where id = '77777777-7777-4777-8777-777777777751';
    begin;
    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, value, unit, confidence,
      observed_at, policy_version, diagnostics, source_activity_id, source_revision
    ) select
      '55555555-5555-4555-8555-555555555553', profile_id, 'bike', 'power',
      'bike_power_30m', 'qualified', 256.5, 'watts', 0.94, finished_at,
      'threshold-policy-v1', '{}'::jsonb, id, segments_revision
    from public.activities where id = '77777777-7777-4777-8777-777777777751';
    insert into public.threshold_evaluation_efforts values (
      '55555555-5555-4555-8555-555555555553', '44444444-4444-4444-8444-444444444445',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bike',
      '77777777-7777-4777-8777-777777777751', 1, 'power', 'power', 'power', 'primary', 0
    );
    commit;
    insert into public.thresholds (
      id, profile_id, activity_category, metric, evaluation_id, value, unit, confidence,
      method, effective_at, policy_version, supersedes_id
    ) select
      '66666666-6666-4666-8666-666666666663', profile_id, activity_category, metric,
      id, value, unit, confidence, method, observed_at, policy_version,
      '66666666-6666-4666-8666-666666666662'
    from public.threshold_evaluations where id = '55555555-5555-4555-8555-555555555553';
  `);
  await assertThresholdChain(target, [
    { id: "66666666-6666-4666-8666-666666666661", supersedesId: null },
    {
      id: "66666666-6666-4666-8666-666666666662",
      supersedesId: "66666666-6666-4666-8666-666666666661",
    },
    {
      id: "66666666-6666-4666-8666-666666666663",
      supersedesId: "66666666-6666-4666-8666-666666666662",
    },
  ]);

  await expectDatabaseError(
    target,
    `begin;
     insert into public.threshold_evaluations (
       id, profile_id, activity_category, metric, method, outcome, unit, observed_at,
       rejection_reason, policy_version, diagnostics, source_activity_id, source_revision
     ) select
       '55555555-5555-4555-8555-555555555549', profile_id, 'bike', 'power',
       'bike_power_30m', 'rejected', 'watts', finished_at, 'coverage_insufficient',
       'threshold-rejected-cross-source-v1', '{"coverage":0.5}'::jsonb, id, segments_revision
     from public.activities where id = '77777777-7777-4777-8777-777777777773';
     insert into public.threshold_evaluation_efforts values (
       '55555555-5555-4555-8555-555555555549', '44444444-4444-4444-8444-444444444442',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bike',
       '77777777-7777-4777-8777-777777777761', 1, 'power', 'power', 'power',
       'supporting', 0
     );
     commit;`,
    { code: "23514", constraint: "threshold_evaluations_rejected_effort_source" },
  );
  await target.query("rollback");

  await expectDatabaseError(
    target,
    "update public.activity_efforts set value = 251 where id = '44444444-4444-4444-8444-444444444441'",
    { code: "23514", constraint: "threshold_truth_immutable" },
  );
  for (const statement of [
    "update public.activity_efforts set value = value where id = '44444444-4444-4444-8444-444444444441'",
    "delete from public.activity_efforts where id = '44444444-4444-4444-8444-444444444441'",
    "update public.threshold_evaluations set confidence = confidence where id = '55555555-5555-4555-8555-555555555551'",
    "delete from public.threshold_evaluations where id = '55555555-5555-4555-8555-555555555551'",
    "update public.threshold_evaluation_efforts set ordinal = ordinal where evaluation_id = '55555555-5555-4555-8555-555555555551'",
    "delete from public.threshold_evaluation_efforts where evaluation_id = '55555555-5555-4555-8555-555555555551'",
    "update public.thresholds set value = value where id = '66666666-6666-4666-8666-666666666661'",
    "delete from public.thresholds where id = '66666666-6666-4666-8666-666666666661'",
  ]) {
    await expectServiceRoleDenied(target, statement);
  }

  await target.query(
    "delete from public.activity_efforts where id = '44444444-4444-4444-8444-444444444445'",
  );
  await assertThresholdChain(target, [
    { id: "66666666-6666-4666-8666-666666666661", supersedesId: null },
    {
      id: "66666666-6666-4666-8666-666666666662",
      supersedesId: "66666666-6666-4666-8666-666666666661",
    },
  ]);

  await target.query(`
    insert into public.activity_efforts (
      id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
      effort_type, source_series, duration_seconds, source_artifact_id, source_revision, start_offset_ms,
      end_offset_ms, window_coverage, max_gap_seconds, unit, value, source, method,
      calculation_version, provenance
    ) select
      '44444444-4444-4444-8444-444444444445', now(), profile_id, id,
      '77777777-7777-4777-8777-777777777754', finished_at, 'bike', 'power', 'power', 1800,
      '77777777-7777-4777-8777-777777777752', 1, 0, 1800000, 1, 2,
      'watts', 270, 'derived', 'best_effort', 'test-v1', '{}'::jsonb
    from public.activities where id = '77777777-7777-4777-8777-777777777751';
    begin;
    insert into public.threshold_evaluations (
      id, profile_id, activity_category, metric, method, outcome, value, unit, confidence,
      observed_at, policy_version, diagnostics, source_activity_id, source_revision
    ) select
      '55555555-5555-4555-8555-555555555553', profile_id, 'bike', 'power',
      'bike_power_30m', 'qualified', 256.5, 'watts', 0.94, finished_at,
      'threshold-policy-v1', '{}'::jsonb, id, segments_revision
    from public.activities where id = '77777777-7777-4777-8777-777777777751';
    insert into public.threshold_evaluation_efforts values (
      '55555555-5555-4555-8555-555555555553', '44444444-4444-4444-8444-444444444445',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bike',
      '77777777-7777-4777-8777-777777777751', 1, 'power', 'power', 'power', 'primary', 0
    );
    commit;
    insert into public.thresholds (
      id, profile_id, activity_category, metric, evaluation_id, value, unit, confidence,
      method, effective_at, policy_version, supersedes_id
    ) select
      '66666666-6666-4666-8666-666666666663', profile_id, activity_category, metric,
      id, value, unit, confidence, method, observed_at, policy_version,
      '66666666-6666-4666-8666-666666666662'
    from public.threshold_evaluations where id = '55555555-5555-4555-8555-555555555553';
  `);

  const immutableSuccessorBefore = await target.query<{ snapshot: string }>(`
    select (to_jsonb(thresholds) - 'supersedes_id')::text as snapshot
    from public.thresholds where id = '66666666-6666-4666-8666-666666666663'
  `);
  await target.query(
    "delete from public.activities where id = '77777777-7777-4777-8777-777777777761'",
  );
  await assertThresholdChain(target, [
    { id: "66666666-6666-4666-8666-666666666661", supersedesId: null },
    {
      id: "66666666-6666-4666-8666-666666666663",
      supersedesId: "66666666-6666-4666-8666-666666666661",
    },
  ]);
  const immutableSuccessorAfter = await target.query<{ snapshot: string }>(`
    select (to_jsonb(thresholds) - 'supersedes_id')::text as snapshot
    from public.thresholds where id = '66666666-6666-4666-8666-666666666663'
  `);
  if (immutableSuccessorBefore.rows[0]?.snapshot !== immutableSuccessorAfter.rows[0]?.snapshot) {
    throw new Error("middle deletion mutated immutable successor fields during chain rewiring");
  }

  await target.query(
    "delete from public.activity_efforts where id = '44444444-4444-4444-8444-444444444441'",
  );
  await assertThresholdChain(target, [
    { id: "66666666-6666-4666-8666-666666666663", supersedesId: null },
  ]);
  await target.query(
    "delete from public.activities where id = '77777777-7777-4777-8777-777777777751'",
  );
  await assertThresholdChain(target, []);
  console.log(
    "[db:threshold-truth] root, middle, and leaf source cascades preserved one immutable linear chain",
  );
}

type ProfileGoalConstraintInput = {
  activityCategory: string | null;
  priority: number;
  targetDate: string | null;
  targetPayload: unknown;
  title: string;
};

function profileGoalConstraintId(index: number) {
  return `f0000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

async function insertProfileGoalConstraintFixture(
  target: {
    query: <Row extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Row[] }>;
  },
  index: number,
  input: ProfileGoalConstraintInput,
) {
  await target.query(
    `insert into public.profile_goals (
      id, profile_id, title, priority, activity_category, target_date,
      target_payload, created_at, updated_at
    ) values ($1::uuid, '11111111-1111-4111-8111-111111111111', $2, $3, $4, $5::date, $6::jsonb, now(), now())`,
    [
      profileGoalConstraintId(index),
      input.title,
      input.priority,
      input.activityCategory,
      input.targetDate,
      input.targetPayload == null ? null : JSON.stringify(input.targetPayload),
    ],
  );
}

async function assertProfileGoalConstraints(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const base = {
    activityCategory: "run",
    priority: 5,
    targetDate: "2026-10-01",
    title: "Constraint fixture",
  } satisfies Omit<ProfileGoalConstraintInput, "targetPayload">;
  const validPayloads: Array<{ activityCategory: string; targetPayload: unknown }> = [
    {
      activityCategory: "run",
      targetPayload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1500,
      },
    },
    {
      activityCategory: "bike",
      targetPayload: { type: "threshold", metric: "power", value: 300 },
    },
    {
      activityCategory: "swim",
      targetPayload: { type: "completion", distance_m: 1500 },
    },
    {
      activityCategory: "strength",
      targetPayload: { type: "consistency", target_weeks: 8 },
    },
  ];
  for (const [index, valid] of validPayloads.entries()) {
    await insertProfileGoalConstraintFixture(target, index + 1, { ...base, ...valid });
  }

  const invalidInputs: ProfileGoalConstraintInput[] = [
    { ...base, activityCategory: null, targetPayload: { type: "consistency", target_weeks: 8 } },
    { ...base, targetDate: null, targetPayload: { type: "consistency", target_weeks: 8 } },
    { ...base, targetPayload: null },
    { ...base, title: " ", targetPayload: { type: "consistency", target_weeks: 8 } },
    { ...base, title: "x".repeat(101), targetPayload: { type: "consistency", target_weeks: 8 } },
    { ...base, priority: 11, targetPayload: { type: "consistency", target_weeks: 8 } },
    {
      ...base,
      activityCategory: "rowing",
      targetPayload: { type: "consistency", target_weeks: 8 },
    },
    { ...base, targetPayload: [] },
    { ...base, targetPayload: { type: "unknown" } },
    {
      ...base,
      targetPayload: {
        type: "event_performance",
        activity_category: "bike",
        distance_m: 5000,
        target_time_s: 1500,
      },
    },
  ];
  for (const [index, invalid] of invalidInputs.entries()) {
    try {
      await insertProfileGoalConstraintFixture(target, index + 100, invalid);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "22P02" || code === "23502" || code === "23514") continue;
      throw error;
    }
    throw new Error(`profile_goals accepted invalid constraint fixture ${index + 1}`);
  }

  await target.query(`delete from public.profile_goals where id = any($1::uuid[])`, [
    validPayloads.map((_, index) => profileGoalConstraintId(index + 1)),
  ]);
  console.log("[db:profile-goals] basic payload and column constraints passed");
}

async function assertArtifactLifecycleFunctionPrivileges(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const privileges = await target.query<{
    function_identity: string;
    service_role_execute: boolean;
    anon_execute: boolean;
    authenticated_execute: boolean;
  }>(`
    select
      function_identity,
      pg_catalog.has_function_privilege('service_role', function_identity, 'EXECUTE') as service_role_execute,
      pg_catalog.has_function_privilege('anon', function_identity, 'EXECUTE') as anon_execute,
      pg_catalog.has_function_privilege('authenticated', function_identity, 'EXECUTE') as authenticated_execute
    from (values
      ('public.request_activity_artifact_deletion(uuid)'),
      ('public.finalize_activity_artifact_deletion(uuid,boolean)'),
      ('public.purge_deleted_activity_artifact(uuid)'),
      ('public.switch_activity_source_artifact(uuid,uuid,uuid,text)')
    ) as lifecycle_functions(function_identity)
  `);
  for (const privilege of privileges.rows) {
    if (
      !privilege.service_role_execute ||
      privilege.anon_execute ||
      privilege.authenticated_execute
    ) {
      throw new Error(
        `invalid lifecycle function privileges for ${privilege.function_identity}: service_role=${privilege.service_role_execute}, anon=${privilege.anon_execute}, authenticated=${privilege.authenticated_execute}`,
      );
    }
  }

  await target.query(`
    insert into public.activity_artifacts (
      id, profile_id, digest, byte_size, bucket, path, media_type, format,
      availability, deletion_requested_at, deleted_at
    ) values
      (
        '44444444-4444-4444-8444-444444444444',
        '11111111-1111-4111-8111-111111111111', repeat('a', 64), 1, 'activity-files',
        public.activity_artifact_content_path(
          '11111111-1111-4111-8111-111111111111', repeat('a', 64)
        ), 'application/octet-stream', 'fit', 'accepted', null, null
      ),
      (
        '55555555-5555-4555-8555-555555555555',
        '11111111-1111-4111-8111-111111111111', repeat('b', 64), 1, 'activity-files',
        public.activity_artifact_content_path(
          '11111111-1111-4111-8111-111111111111', repeat('b', 64)
        ), 'application/octet-stream', 'fit', 'deletion_pending', now(), null
      ),
      (
        '66666666-6666-4666-8666-666666666666',
        '11111111-1111-4111-8111-111111111111', repeat('c', 64), 1, 'activity-files',
        public.activity_artifact_content_path(
          '11111111-1111-4111-8111-111111111111', repeat('c', 64)
        ), 'application/octet-stream', 'fit', 'deleted', now(), now()
      );

    begin;
    set local role service_role;
    do $verify_artifact_lifecycle$
    begin
      perform set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true);
      begin
        update public.activity_artifacts
        set availability = 'deletion_pending', deletion_requested_at = now()
        where id = '44444444-4444-4444-8444-444444444444';
        raise exception 'service_role bypassed the lifecycle function';
      exception when others then
        if sqlerrm = 'service_role bypassed the lifecycle function' then raise; end if;
        if sqlerrm <> 'activity artifact lifecycle requires authorized service workflow' then
          raise;
        end if;
      end;

      perform set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true);
      begin
        delete from public.activity_artifacts
        where id = '66666666-6666-4666-8666-666666666666';
        raise exception 'service_role bypassed the artifact purge function';
      exception when others then
        if sqlerrm = 'service_role bypassed the artifact purge function' then raise; end if;
        if sqlerrm <> 'activity artifact delete requires completed service lifecycle' then raise; end if;
      end;

      begin
        perform public.switch_activity_source_artifact(
          '22222222-2222-4222-8222-222222222222',
          '55555555-5555-4555-8555-555555555555',
          '11111111-1111-4111-8111-111111111111',
          null
        );
        raise exception 'deletion-pending artifact was attached as a current source';
      exception when others then
        if sqlerrm = 'deletion-pending artifact was attached as a current source' then raise; end if;
        if sqlerrm <> 'accepted artifact/profile not found' then raise; end if;
      end;
    end
    $verify_artifact_lifecycle$;
    rollback;
  `);
}

async function assertRouteStorageLifecycle(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  await target.query(`
    insert into public.activity_routes (
      id, profile_id, name, file_path, file_sha256, storage_state,
      total_distance, total_ascent, total_descent, polyline
    ) values
      (
        '77777777-7777-4777-8777-777777777777',
        '11111111-1111-4111-8111-111111111111', 'pending route',
        '11111111-1111-4111-8111-111111111111/pending.gpx', repeat('d', 64),
        'deletion_pending', 0, 0, 0, ''
      ),
      (
        '88888888-8888-4888-8888-888888888888',
        '11111111-1111-4111-8111-111111111111', 'ready route',
        '11111111-1111-4111-8111-111111111111/ready.gpx', repeat('e', 64),
        'ready', 0, 0, 0, ''
      );

    do $verify_route_storage$
    begin
      begin
        insert into public.events (
          id, profile_id, event_type, title, starts_at, scheduled_date, route_id
        ) values (
          '99999999-9999-4999-8999-999999999999',
          '11111111-1111-4111-8111-111111111111', 'custom', 'invalid pending route',
          now(), current_date::text, '77777777-7777-4777-8777-777777777777'
        );
        raise exception 'event accepted a route whose storage was not ready';
      exception when others then
        if sqlerrm = 'event accepted a route whose storage was not ready' then raise; end if;
        if sqlerrm <> 'event route must reference ready route storage' then raise; end if;
      end;

      insert into public.events (
        id, profile_id, event_type, title, starts_at, scheduled_date, route_id
      ) values (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', 'custom', 'valid ready route',
        now(), current_date::text, '88888888-8888-4888-8888-888888888888'
      );

      begin
        insert into public.likes (id, created_at, profile_id, entity_id, entity_type)
        values (
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now(),
          '11111111-1111-4111-8111-111111111111',
          '77777777-7777-4777-8777-777777777777', 'route'
        );
        raise exception 'like accepted a route whose storage was not ready';
      exception when others then
        if sqlerrm = 'like accepted a route whose storage was not ready' then raise; end if;
        if sqlerrm <> 'route social content requires ready route storage' then raise; end if;
      end;

      begin
        insert into public.comments (
          id, profile_id, entity_type, entity_id, content, created_at, updated_at
        ) values (
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          '11111111-1111-4111-8111-111111111111', 'route',
          '77777777-7777-4777-8777-777777777777', 'invalid pending route', now(), now()
        );
        raise exception 'comment accepted a route whose storage was not ready';
      exception when others then
        if sqlerrm = 'comment accepted a route whose storage was not ready' then raise; end if;
        if sqlerrm <> 'route social content requires ready route storage' then raise; end if;
      end;

      insert into public.likes (id, created_at, profile_id, entity_id, entity_type)
      values (
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd', now(),
        '11111111-1111-4111-8111-111111111111',
        '88888888-8888-4888-8888-888888888888', 'route'
      );
      insert into public.comments (
        id, profile_id, entity_type, entity_id, content, created_at, updated_at
      ) values (
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        '11111111-1111-4111-8111-111111111111', 'route',
        '88888888-8888-4888-8888-888888888888', 'valid ready route', now(), now()
      );
    end
    $verify_route_storage$;
  `);

  const triggers = await target.query<{ trigger_count: number }>(`
    select count(*)::int as trigger_count
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgname in (
        'events_require_ready_route',
        'group_events_require_ready_route',
        'likes_require_ready_route',
        'comments_require_ready_route'
      )
  `);
  if (triggers.rows[0]?.trigger_count !== 4) {
    throw new Error("ready-route storage guards are missing from route reference tables");
  }
}

async function assertProfileObservationsDoNotInvalidateAthleteState(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const triggers = await target.query<{ tgname: string }>(`
    select tgname
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgrelid = pg_catalog.to_regclass('public.profile_metrics')
      and tgname = 'profile_metrics_bump_athlete_state_source_revision'
  `);
  if (triggers.rows.length > 0) {
    throw new Error("profile observations must not invalidate athlete state");
  }
}

async function assertLegacyThresholdObjectsAbsent(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const legacy = await target.query<{ kind: string; name: string }>(`
    with legacy_relations(name) as (
      values
        ('performance_calibration_evidence'),
        ('performance_calibration_model_inputs'),
        ('performance_calibration_selection_evidence'),
        ('performance_calibrations'),
        ('swimming_css_protocol_evidence')
    ), legacy_types(name) as (
      values
        ('performance_calibration_metric_key'),
        ('performance_calibration_evidence_state'),
        ('performance_calibration_rejection_reason'),
        ('performance_calibration_source_semantics')
    )
    select 'relation' as kind, name
    from legacy_relations
    where pg_catalog.to_regclass('public.' || name) is not null
    union all
    select 'type' as kind, name
    from legacy_types
    where pg_catalog.to_regtype('public.' || name) is not null
    union all
    select 'function' as kind, p.proname as name
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'performance_calibration%' or p.proname like '%performance_calibration%')
    union all
    select 'trigger' as kind, t.tgname as name
    from pg_catalog.pg_trigger t
    where not t.tgisinternal
      and (t.tgname like 'performance_calibration%' or t.tgname like '%swimming_css%')
  `);
  if (legacy.rows.length > 0) {
    throw new Error(
      `fresh baseline retained legacy threshold objects: ${legacy.rows.map(({ kind, name }) => `${kind}:${name}`).join(", ")}`,
    );
  }
}

async function assertBoundedTextValues(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const profileId = "11111111-1111-4111-8111-111111111111";
  const invalidFixtures = [
    {
      constraint: "content_access_grants_content_type_check",
      statement: `insert into public.content_access_grants (
        content_type, content_id, grantee_profile_id, access_level, source_type, source_id
      ) values ('document', gen_random_uuid(), '${profileId}', 'read', 'event', gen_random_uuid())`,
    },
    {
      constraint: "content_access_grants_access_level_check",
      statement: `insert into public.content_access_grants (
        content_type, content_id, grantee_profile_id, access_level, source_type, source_id
      ) values ('profile', gen_random_uuid(), '${profileId}', 'write', 'event', gen_random_uuid())`,
    },
    {
      constraint: "content_access_grants_source_type_check",
      statement: `insert into public.content_access_grants (
        content_type, content_id, grantee_profile_id, access_level, source_type, source_id
      ) values ('profile', gen_random_uuid(), '${profileId}', 'read', 'group', gen_random_uuid())`,
    },
    {
      constraint: "follows_status_check",
      statement: `insert into public.follows (
        follower_id, following_id, status, created_at, updated_at
      ) values ('${profileId}', '${profileId}', 'blocked', now(), now())`,
    },
    {
      constraint: "comments_entity_type_check",
      statement: `insert into public.comments (
        id, profile_id, entity_type, entity_id, content, created_at, updated_at
      ) values (gen_random_uuid(), '${profileId}', 'post', gen_random_uuid(), 'invalid', now(), now())`,
    },
  ] as const;

  for (const fixture of invalidFixtures) {
    await expectConstraintViolation(target, fixture.statement, {
      code: "23514",
      constraint: fixture.constraint,
    });
  }
  console.log("[db:bounded-text-values] grant, follow, and comment checks rejected invalid values");
}

async function assertGroupEventRsvpResponses(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const profileId = "00000000-0000-4000-8000-000000000081";
  const groupId = "00000000-0000-4000-8000-000000000082";
  const eventId = "00000000-0000-4000-8000-000000000083";
  await target.query(`insert into auth.users (id) values ($1::uuid)`, [profileId]);
  await target.query(
    `insert into public.groups (id, created_by_profile_id, name, slug)
     values ($1::uuid, $2::uuid, 'RSVP constraint group', 'rsvp-constraint-group')`,
    [groupId, profileId],
  );
  await target.query(
    `insert into public.group_events (id, group_id, created_by_profile_id, title, starts_at, timezone)
     values ($1::uuid, $2::uuid, $3::uuid, 'RSVP constraint event', now() + interval '1 day', 'UTC')`,
    [eventId, groupId, profileId],
  );

  const deadIndexes = await target.query<{ name: string }>(`
    select indexname as name
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in (
        'group_event_rsvps_profile_status_idx',
        'group_event_series_rsvps_profile_status_idx'
      )
  `);
  if (deadIndexes.rows.length > 0) {
    throw new Error(
      `group-event RSVP tables retained redundant status indexes: ${deadIndexes.rows
        .map(({ name }) => name)
        .join(", ")}`,
    );
  }

  for (const [tableName, eventColumn] of [
    ["group_event_rsvps", "group_event_id"],
    ["group_event_series_rsvps", "group_event_series_id"],
  ] as const) {
    const inserted = await target.query<{ profile_id: string; status: string }>(
      `insert into public.${tableName} (${eventColumn}, profile_id, status)
       values ($1::uuid, $2::uuid, 'going') returning profile_id, status`,
      [eventId, profileId],
    );
    if (inserted.rows[0]?.profile_id !== profileId || inserted.rows[0]?.status !== "going") {
      throw new Error(`${tableName} did not persist an explicit going response`);
    }
    await target.query(
      `update public.${tableName} set status = 'declined' where ${eventColumn} = $1::uuid and profile_id = $2::uuid`,
      [eventId, profileId],
    );
    await expectConstraintViolation(
      target,
      `update public.${tableName} set status = 'accepted' where ${eventColumn} = '${eventId}'::uuid and profile_id = '${profileId}'::uuid`,
      { code: "23514", constraint: `${tableName}_status_check` },
    );
  }
  console.log("[db:group-event-rsvps] going and declined persist; invalid responses are rejected");
}

async function assertPrelaunchSchemaHardening(target: VerificationTarget) {
  const profileId = "11111111-1111-4111-8111-111111111111";
  const activityPlanId = "80000000-0000-4000-8000-000000000001";
  const groupId = "80000000-0000-4000-8000-000000000002";
  const groupEventId = "80000000-0000-4000-8000-000000000003";
  const completedActivityId = "80000000-0000-4000-8000-000000000004";
  const plannedSessionId = "80000000-0000-4000-8000-000000000005";
  const thresholdActivityId = "80000000-0000-4000-8000-000000000006";
  const revisionActivityPlanId = "80000000-0000-4000-8000-000000000014";
  const prescription = {
    version: 5 as const,
    activity_category: "run",
    items: [
      {
        type: "step" as const,
        id: "80000000-0000-4000-8000-000000000011",
        name: "Run",
        duration: { type: "time" as const, seconds: 60 },
        targets: [{ type: "RPE" as const, intensity: 5 }],
      },
    ],
  };

  const prescriptionHash = structureHash(prescription);
  const semanticHash = activityPlanSemanticHash({
    structure: activityPlanStructureSchema.parse(prescription),
    trainingIntent: "general_maintenance",
  });

  await target.query(
    `insert into public.activity_plans (id, profile_id, name, structure, structure_hash, semantic_hash)
     values ($1::uuid, $2::uuid, 'planned-session hardening', $3::jsonb, $4, $5)`,
    [activityPlanId, profileId, JSON.stringify(prescription), prescriptionHash, semanticHash],
  );
  await target.query(
    `insert into public.activity_plans (id, profile_id, name, structure, structure_hash, semantic_hash)
     values ($1::uuid, $2::uuid, 'revision contract', $3::jsonb, $4, $5)`,
    [
      revisionActivityPlanId,
      profileId,
      JSON.stringify(prescription),
      prescriptionHash,
      semanticHash,
    ],
  );
  await target.query(
    `update public.activity_plans set name = 'metadata only', revision = 99 where id = $1::uuid`,
    [revisionActivityPlanId],
  );
  const metadataRevision = await target.query<{ revision: string }>(
    `select revision::text from public.activity_plans where id = $1::uuid`,
    [revisionActivityPlanId],
  );
  if (metadataRevision.rows[0]?.revision !== "1") {
    throw new Error("activity plan revision changed without a prescription structure change");
  }
  const changedPrescription = structuredClone(prescription);
  const firstItem = changedPrescription.items[0];
  if (!firstItem) throw new Error("Missing fixture item");
  firstItem.name = "Changed run";
  await target.query(
    `update public.activity_plans
     set structure = $2::jsonb, structure_hash=$3, semantic_hash=$4, revision = 99
     where id = $1::uuid`,
    [
      revisionActivityPlanId,
      JSON.stringify(changedPrescription),
      structureHash(changedPrescription),
      activityPlanSemanticHash({
        structure: activityPlanStructureSchema.parse(changedPrescription),
        trainingIntent: "general_maintenance",
      }),
    ],
  );
  await target.query(
    `update public.activity_plans set notes = 'metadata after change', revision = 99 where id = $1::uuid`,
    [revisionActivityPlanId],
  );
  const structureRevision = await target.query<{ revision: string }>(
    `select revision::text from public.activity_plans where id = $1::uuid`,
    [revisionActivityPlanId],
  );
  if (structureRevision.rows[0]?.revision !== "2") {
    throw new Error("activity plan revision did not increment exactly once for a structure change");
  }
  await target.query(
    `insert into public.groups (id, created_by_profile_id, name, slug)
     values ($1::uuid, $2::uuid, 'planned-session group', 'planned-session-hardening')`,
    [groupId, profileId],
  );
  await target.query(
    `insert into public.group_events (id, group_id, created_by_profile_id, title, starts_at, timezone)
     values ($1::uuid, $2::uuid, $3::uuid, 'group authority', now() + interval '1 day', 'UTC')`,
    [groupEventId, groupId, profileId],
  );
  await target.query(`
    begin;
    insert into public.activities (
      id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
      timing_coverage, parser_version, decoded_contract_version, materializer_version
    ) values
      ('${completedActivityId}', '${profileId}', 'planned completion',
       now() - interval '1 hour', now(), 3600000, 3600000, 3600000,
       'complete', 'fixture', 'fixture', 'fixture'),
      ('${thresholdActivityId}', '${profileId}', 'threshold evidence',
       now() - interval '1 hour', now(), 3600000, 3600000, 3600000,
       'complete', 'fixture', 'fixture', 'fixture');
    insert into public.activity_segments (
      id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms,
      end_offset_ms, summary, timing_coverage, active_ms, moving_ms,
      parser_version, materializer_version
    ) values
      ('80000000-0000-4000-8000-000000000007', '${completedActivityId}', '${profileId}',
       0, 'activity', 'run', 0, 3600000,
       '{"version":"1","timing":{"timingCoverage":"complete","activeMs":3600000,"movingMs":3600000}}',
       'complete', 3600000, 3600000, 'fixture', 'fixture'),
      ('80000000-0000-4000-8000-000000000008', '${thresholdActivityId}', '${profileId}',
       0, 'activity', 'bike', 0, 3600000,
       '{"version":"1","timing":{"timingCoverage":"complete","activeMs":3600000,"movingMs":3600000}}',
       'complete', 3600000, 3600000, 'fixture', 'fixture');
    commit;
  `);
  await target.query(
    `insert into public.planned_sessions (
        id, profile_id, planning_date, original_target_date, source_kind, idempotency_key,
        direct_operation_id, group_event_id, activity_plan_id, status, completed_activity_id,
        completion_state, linked_at
      ) values (
        $1::uuid, $2::uuid, current_date, current_date, 'direct',
        'direct:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        $3::uuid, $4::uuid, 'completed', $5::uuid, 'linked', now()
      )`,
    [plannedSessionId, profileId, groupEventId, activityPlanId, completedActivityId],
  );
  await expectDatabaseError(
    target,
    `insert into public.planned_sessions (
        id, profile_id, planning_date, original_target_date, source_kind, idempotency_key,
        direct_operation_id, group_event_id, activity_plan_id
      ) values (
        '80000000-0000-4000-8000-000000000015', '${profileId}', current_date, current_date,
        'direct', 'direct:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '${groupEventId}', '${activityPlanId}'
      )`,
    { code: "23505", constraint: "planned_sessions_profile_group_event_unique" },
  );
  await expectDatabaseError(
    target,
    `insert into public.planned_sessions (
       id, profile_id, planning_date, original_target_date, source_kind, idempotency_key,
       direct_operation_id, activity_plan_id, activity_plan_revision
     ) values (
       '80000000-0000-4000-8000-000000000016', '${profileId}', current_date, current_date,
       'direct', 'direct:cccccccccccccccccccccccccccccccc',
       'cccccccccccccccccccccccccccccccc', '${activityPlanId}', 1
     )`,
    { code: "23514", constraint: "planned_sessions_legacy_prescription_check" },
  );
  await expectDatabaseError(
    target,
    `delete from public.activities where id = '${completedActivityId}'`,
    { code: "23503", constraint: "planned_sessions_completed_activity_owner_fkey" },
  );
  await target.query(`
    begin;
    update public.planned_sessions
    set completed_activity_id = null,
        completion_state = 'activity_deleted',
        completion_unlinked_at = now(),
        updated_at = now()
    where id = '${plannedSessionId}';
    delete from public.activities where id = '${completedActivityId}';
    commit;
  `);
  await target.query(`delete from public.group_events where id = '${groupEventId}'`);
  const retainedSession = await target.query<{
    completion_state: string;
    completed_activity_id: string | null;
    group_event_id: string | null;
  }>(`
    select completion_state, completed_activity_id::text, group_event_id::text
    from public.planned_sessions where id = '${plannedSessionId}'
  `);
  if (
    retainedSession.rows[0]?.completion_state !== "activity_deleted" ||
    retainedSession.rows[0]?.completed_activity_id !== null ||
    retainedSession.rows[0]?.group_event_id !== null
  ) {
    throw new Error("planned session did not retain explicit completion history after unlinking");
  }

  await target.query(`
    insert into public.profile_athlete_state (
      profile_id, source_revision, published_revision, dirty_from_at
    ) values ('${profileId}', 2, 1, now())
    on conflict (profile_id) do update set
      source_revision = excluded.source_revision,
      published_revision = excluded.published_revision,
      dirty_from_at = excluded.dirty_from_at;
    insert into public.daily_training_load (
      profile_id, planning_date, common_load, fitness, fatigue, form, readiness,
      coverage_status, contributing_activity_count, omitted_activity_count,
      source_revision, calculation_version
    ) values
      ('${profileId}', current_date, 100, 10, 3, 7.0000000005, 80,
       'complete', 1, 0, 1, 'fixture-v1'),
      ('${profileId}', current_date, 120, 11, 4, 7, 82,
       'complete', 2, 0, 2, 'fixture-v1');
  `);
  await expectDatabaseError(
    target,
    `insert into public.daily_training_load (
       profile_id, planning_date, common_load, fitness, fatigue, form, readiness,
       coverage_status, contributing_activity_count, omitted_activity_count,
       source_revision, calculation_version
     ) values ('${profileId}', current_date, 130, 10, 3, 7.0000000011, 80,
       'complete', 1, 0, 3, 'fixture-v1')`,
    { code: "23514", constraint: "daily_training_load_state_check" },
  );
  const publishedBefore = await target.query<{ common_load: string; source_revision: string }>(`
    select load.common_load::text, load.source_revision::text
    from public.profile_athlete_state state
    join public.daily_training_load load
      on load.profile_id = state.profile_id
     and load.source_revision = state.published_revision
    where state.profile_id = '${profileId}' and load.planning_date = current_date
  `);
  await target.query(
    `update public.profile_athlete_state set published_revision = 2 where profile_id = $1::uuid`,
    [profileId],
  );
  const publishedAfter = await target.query<{ common_load: string; source_revision: string }>(`
    select load.common_load::text, load.source_revision::text
    from public.profile_athlete_state state
    join public.daily_training_load load
      on load.profile_id = state.profile_id
     and load.source_revision = state.published_revision
    where state.profile_id = '${profileId}' and load.planning_date = current_date
  `);
  if (
    publishedBefore.rows[0]?.source_revision !== "1" ||
    publishedBefore.rows[0]?.common_load !== "100" ||
    publishedAfter.rows[0]?.source_revision !== "2" ||
    publishedAfter.rows[0]?.common_load !== "120"
  ) {
    throw new Error("daily training load publication pointer exposed a mixed revision");
  }

  await target.query(`
    insert into public.athlete_recalculation_queue (
      profile_id, idempotency_key, earliest_affected_at, earliest_affected_planning_date,
      source_revision, reasons, requested_at
    ) values (
      '${profileId}', 'athlete-recalculation:${profileId}', now(), current_date, 2,
      array['activity_changed']::public.athlete_recalculation_reason[], now()
    );
  `);
  const queueLockColumns = await target.query<{ column_name: string }>(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'athlete_recalculation_queue'
      and column_name in (
        'state', 'attempt_count', 'available_at', 'claim_token', 'claimed_at',
        'lease_expires_at', 'failure_code', 'failed_at', 'next_attempt_at', 'completed_at'
      )
  `);
  const stateFenceColumns = await target.query<{ column_name: string }>(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_athlete_state'
      and column_name in ('source_revision', 'published_revision', 'lease_token', 'lease_expires_at')
  `);
  if (queueLockColumns.rows.length !== 0 || stateFenceColumns.rows.length !== 4) {
    throw new Error("profile_athlete_state is not the sole publication and lease fence");
  }

  await target.query(`
    insert into public.threshold_evidence (
      id, profile_id, activity_id, activity_category, metric, unit, method, value,
      source_series_id, source_series_metric, start_timestamp_seconds, end_timestamp_seconds,
      exact_window_seconds, conversion_factor, policy_version, plausibility_version,
      observed_at, calculation_version, confidence
    ) values (
      '80000000-0000-4000-8000-000000000021', '${profileId}', '${thresholdActivityId}',
      'bike', 'power', 'watts', 'bike_power_30m', 250, 'power-series', 'power',
      0, 1800, 1800, 0.95, 'threshold-policy-v1', 'threshold-plausibility-v1',
      now(), 'fixture-v1', 0.9
    )
  `);
  await expectDatabaseError(
    target,
    `insert into public.threshold_evidence (
       id, profile_id, activity_id, activity_category, metric, unit, method, value,
       source_series_id, source_series_metric, start_timestamp_seconds, end_timestamp_seconds,
       exact_window_seconds, conversion_factor, policy_version, plausibility_version,
       observed_at, calculation_version, confidence
     ) values (
       '80000000-0000-4000-8000-000000000022', '${profileId}', '${thresholdActivityId}',
       'bike', 'power', 'watts', 'bike_power_30m', 251, 'replacement-series', 'power',
       0, 1800, 1800, 0.95, 'threshold-policy-v1', 'threshold-plausibility-v1',
       now(), 'fixture-v1', 0.9
     )`,
    { code: "23505", constraint: "threshold_evidence_profile_category_activity_unique" },
  );

  await target.query("set enable_seqscan = off");
  const ingestionPlan = await target.query<Record<string, unknown>>(
    `explain (format json) select * from public.activity_file_ingestions where activity_id = $1::uuid`,
    [thresholdActivityId],
  );
  await target.query("reset enable_seqscan");
  const ingestionIndexes = await target.query<{ indexname: string }>(`
    select indexname from pg_catalog.pg_indexes
    where schemaname = 'public' and tablename = 'activity_file_ingestions'
      and indexname in (
        'idx_activity_file_ingestions_activity_profile',
        'idx_activity_file_ingestions_activity_id'
      )
    order by indexname
  `);
  if (
    JSON.stringify(ingestionPlan.rows).includes("idx_activity_file_ingestions_activity_profile") ===
      false ||
    JSON.stringify(ingestionIndexes.rows.map(({ indexname }) => indexname)) !==
      JSON.stringify(["idx_activity_file_ingestions_activity_profile"])
  ) {
    throw new Error("the composite ingestion index did not replace the redundant activity index");
  }

  console.log(
    "[db:prelaunch-hardening] event ownership, explicit completion unlink, revision publication, sole lease fence, threshold identity, numeric tolerance, and index replacement passed",
  );
}

async function main() {
  const args = process.argv.slice(2);
  await withDisposableDatabase(args, "fresh_verify", async (target, targetUrl) => {
    await bootstrapSupabaseSchemas(target);
    const baseline = requireFreshBaseline();
    for (const migrationPath of baseline.migrationPaths) {
      await applySqlFile(target, migrationPath);
    }
    await assertCanonicalActivityCategories(target);
    await assertActivityAnalysisRevisionContract(target);
    await assertActivitySourceIdentityContract(target, targetUrl);
    await assertStrictlyPositiveActivityEfforts(target);
    await assertThresholdTruthContract(target, targetUrl);
    await assertProfileGoalConstraints(target);
    await assertArtifactLifecycleFunctionPrivileges(target);
    await assertBoundedTextValues(target);
    await assertRouteStorageLifecycle(target);
    await assertProfileObservationsDoNotInvalidateAthleteState(target);
    await assertLegacyThresholdObjectsAbsent(target);
    await assertGroupEventRsvpResponses(target);
    await assertPrelaunchSchemaHardening(target);

    const env = {
      ...process.env,
      DATABASE_URL: targetUrl,
      POSTGRES_URL: targetUrl,
      GRADIENTPEAK_FRESH_FINGERPRINT_WRITE: "1",
    };
    const fingerprintArgs = ["exec", "tsx", "scripts/check-schema-fingerprint.ts"];
    if (args.includes("--write-fingerprint")) fingerprintArgs.push("--write");
    execFileSync("pnpm", fingerprintArgs, { cwd: dbPackageRoot, env, stdio: "inherit" });
    execFileSync("pnpm", ["exec", "tsx", "scripts/check-schema-parity.ts"], {
      cwd: dbPackageRoot,
      env,
      stdio: "inherit",
    });
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "scripts/verify-public-table-security.ts",
        "--disposable",
        "--local",
        `--database-url=${targetUrl}`,
      ],
      {
        cwd: dbPackageRoot,
        env,
        stdio: "inherit",
      },
    );
    execFileSync("pnpm", ["exec", "tsx", "scripts/verify-storage-assets.ts"], {
      cwd: dbPackageRoot,
      env,
      stdio: "inherit",
    });
    runSupabaseCli(
      ["db", "lint", "--db-url", targetUrl, "--schema", "public", "--fail-on", "warning"],
      dbPackageRoot,
    );
    if (args.includes("--diff")) {
      const diff = runSupabaseCli(
        ["db", "diff", "--db-url", targetUrl, "--schema", "public"],
        dbPackageRoot,
        "utf8",
      ).toString();
      if (!isEmptyPublicSchemaDiff(diff))
        throw new Error(`fresh target schema diff is not empty:\n${diff}`);
      console.log("[db:diff] disposable authoritative target has no public schema diff");
    }
    console.log(
      "[db:fresh:verify] one policy-selected baseline, parity, fingerprint, storage, security, and lint passed in a disposable target",
    );
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[db:fresh:verify] ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.cause) console.error(String(error.cause));
    process.exit(1);
  });
}
