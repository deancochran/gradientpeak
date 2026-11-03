import assert from "node:assert/strict";
import type { Pool } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "./disposable-database-test-harness";

const profileA = "10000000-0000-4000-8000-000000000001";
const profileB = "10000000-0000-4000-8000-000000000002";
const integrationA = "20000000-0000-4000-8000-000000000001";
const integrationB = "20000000-0000-4000-8000-000000000002";
const importRunA = "30000000-0000-4000-8000-000000000001";
const importRunB = "30000000-0000-4000-8000-000000000002";
const ordinaryReference = "40000000-0000-4000-8000-000000000001";
const materialReference = "40000000-0000-4000-8000-000000000002";
const syncJob = "50000000-0000-4000-8000-000000000001";

async function expectForeignKeyViolation(
  db: Pool,
  statement: string,
  values: unknown[],
  constraint: string,
) {
  await assert.rejects(db.query(statement, values), (error: unknown) => {
    const databaseError = error as { code?: string; constraint?: string };
    return databaseError.code === "23503" && databaseError.constraint === constraint;
  });
}

await withDisposableDatabase(process.argv.slice(2), "import_run_ownership", async (db) => {
  await bootstrapSupabaseSchemas(db);
  for (const migrationPath of requireFreshBaseline().migrationPaths) {
    await applySqlFile(db, migrationPath);
  }

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'import-owner-a@example.test', '{}'::jsonb),
       ($2, 'import-owner-b@example.test', '{}'::jsonb)`,
    [profileA, profileB],
  );
  await db.query(
    `insert into public.integrations (id, profile_id, provider, external_id) values
       ($1, $2, 'wahoo', 'import-owner-a'),
       ($3, $4, 'garmin', 'import-owner-b')`,
    [integrationA, profileA, integrationB, profileB],
  );
  await db.query(
    `insert into public.activity_import_runs (id, profile_id, integration_id, integration_generation, kind)
     values ($1, $2, $3, 1, 'manual_sync'), ($4, $5, $6, 1, 'manual_sync')`,
    [importRunA, profileA, integrationA, importRunB, profileB, integrationB],
  );
  await db.query(
    `insert into public.activity_source_references
       (id, profile_id, integration_id, provider, provider_external_id, resolution_status, last_import_run_id)
     values ($1, $2, $3, 'wahoo', 'ordinary-owned', 'review', $4)`,
    [ordinaryReference, profileA, integrationA, importRunA],
  );
  await db.query(
    `insert into public.activity_source_references
       (id, profile_id, integration_id, provider, provider_external_id, resolution_status,
        last_material_import_run_id, last_material_effective_at)
     values ($1, $2, $3, 'wahoo', 'material-owned', 'review', $4, '2026-10-01T00:00:00Z')`,
    [materialReference, profileA, integrationA, importRunA],
  );
  await db.query(
    `insert into public.provider_sync_jobs
       (id, profile_id, integration_id, provider, import_run_id, job_type)
     values ($1, $2, $3, 'wahoo', $4, 'import-owned')`,
    [syncJob, profileA, integrationA, importRunA],
  );

  await expectForeignKeyViolation(
    db,
    `insert into public.activity_source_references
       (profile_id, integration_id, provider, provider_external_id, resolution_status, last_import_run_id)
     values ($1, $2, 'garmin', 'ordinary-cross-profile', 'review', $3)`,
    [profileB, integrationB, importRunA],
    "activity_source_refs_last_import_run_profile_fk",
  );
  await expectForeignKeyViolation(
    db,
    `insert into public.activity_source_references
       (profile_id, integration_id, provider, provider_external_id, resolution_status,
        last_material_import_run_id, last_material_effective_at)
     values ($1, $2, 'garmin', 'material-cross-profile', 'review', $3, '2026-10-01T00:00:00Z')`,
    [profileB, integrationB, importRunA],
    "activity_source_refs_material_import_run_profile_fk",
  );
  await expectForeignKeyViolation(
    db,
    `insert into public.provider_sync_jobs
       (profile_id, integration_id, provider, import_run_id, job_type)
     values ($1, $2, 'garmin', $3, 'import-cross-profile')`,
    [profileB, integrationB, importRunA],
    "provider_sync_jobs_import_run_profile_fkey",
  );

  await db.query("delete from public.activity_import_runs where id = $1", [importRunA]);

  const cleared = await db.query<{
    id: string;
    profile_id: string;
    last_import_run_id: string | null;
    last_material_import_run_id: string | null;
    last_material_effective_at: Date | null;
  }>(
    `select id, profile_id, last_import_run_id, last_material_import_run_id, last_material_effective_at
     from public.activity_source_references
     where id in ($1, $2)
     order by id`,
    [ordinaryReference, materialReference],
  );
  assert.deepEqual(cleared.rows, [
    {
      id: ordinaryReference,
      profile_id: profileA,
      last_import_run_id: null,
      last_material_import_run_id: null,
      last_material_effective_at: null,
    },
    {
      id: materialReference,
      profile_id: profileA,
      last_import_run_id: null,
      last_material_import_run_id: null,
      last_material_effective_at: null,
    },
  ]);
  const clearedJob = await db.query<{ profile_id: string; import_run_id: string | null }>(
    "select profile_id, import_run_id from public.provider_sync_jobs where id = $1",
    [syncJob],
  );
  assert.deepEqual(clearedJob.rows, [{ profile_id: profileA, import_run_id: null }]);

  const constraints = await db.query<{ conname: string; definition: string }>(
    `select conname, pg_get_constraintdef(oid) as definition
     from pg_constraint
     where conname = any($1::text[])
     order by conname`,
    [
      [
        "activity_source_refs_last_import_run_profile_fk",
        "activity_source_refs_material_import_run_profile_fk",
        "provider_sync_jobs_import_run_profile_fkey",
      ],
    ],
  );
  assert.deepEqual(constraints.rows, [
    {
      conname: "activity_source_refs_last_import_run_profile_fk",
      definition:
        "FOREIGN KEY (last_import_run_id, profile_id) REFERENCES activity_import_runs(id, profile_id) ON DELETE SET NULL (last_import_run_id)",
    },
    {
      conname: "activity_source_refs_material_import_run_profile_fk",
      definition:
        "FOREIGN KEY (last_material_import_run_id, profile_id) REFERENCES activity_import_runs(id, profile_id) ON DELETE SET NULL (last_material_import_run_id)",
    },
    {
      conname: "provider_sync_jobs_import_run_profile_fkey",
      definition:
        "FOREIGN KEY (import_run_id, profile_id) REFERENCES activity_import_runs(id, profile_id) ON DELETE SET NULL (import_run_id)",
    },
  ]);
  const trigger = await db.query<{ definition: string }>(
    `select pg_get_triggerdef(oid) as definition
     from pg_trigger
     where tgname = 'activity_import_runs_clear_material_source_references' and not tgisinternal`,
  );
  assert.match(trigger.rows[0]?.definition ?? "", /BEFORE DELETE ON public\.activity_import_runs/);

  console.log(
    "[db:import-run-ownership] scoped references, delete cleanup, and catalog actions passed",
  );
});
