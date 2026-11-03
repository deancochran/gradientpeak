import assert from "node:assert/strict";
import type { Pool } from "pg";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import {
  activityPlanSqlArtifacts,
  installActivityPlanSqlFunctions,
} from "./activity-plan-sql-artifacts";
import {
  exportDrizzleSchemaSql,
  installImportRunOwnershipSchema,
} from "./materialize-local-drizzle-schema";

const profileA = "11000000-0000-4000-8000-000000000001";
const profileB = "11000000-0000-4000-8000-000000000002";
const integrationA = "22000000-0000-4000-8000-000000000001";
const integrationB = "22000000-0000-4000-8000-000000000002";
const importRunA = "33000000-0000-4000-8000-000000000001";
const sourceReference = "44000000-0000-4000-8000-000000000001";
const materialReference = "44000000-0000-4000-8000-000000000002";
const syncJob = "55000000-0000-4000-8000-000000000001";

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

await withDisposableDatabase(process.argv.slice(2), "materialized_import_run", async (db, url) => {
  await bootstrapSupabaseSchemas(db);
  await db.query(`
    create extension if not exists btree_gist with schema extensions;
    create function public.activity_artifact_content_path(target_profile_id uuid, target_digest text)
      returns text language sql immutable strict set search_path = pg_catalog
      as $$ select 'artifacts/sha256/' || target_profile_id::text || '/' || target_digest $$;
    create function public.activity_plan_v5_structure_is_valid(input jsonb)
      returns boolean language sql immutable strict set search_path = pg_catalog
      as $$ select true $$;
  `);
  await db.query(exportDrizzleSchemaSql(url));
  await db.query("set check_function_bodies = off");
  try {
    await installActivityPlanSqlFunctions(db);
  } finally {
    await db.query("set check_function_bodies = on");
  }
  await db.query(activityPlanSqlArtifacts().triggers);
  await installImportRunOwnershipSchema(db);

  const validStructure = {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "66000000-0000-4000-8000-000000000001",
        name: "Easy run",
        instructions: "Keep an easy pace.",
        duration: { type: "time", seconds: 600 },
        targets: [],
      },
    ],
  };
  const validValidator = await db.query<{ valid: boolean }>(
    "select public.activity_plan_v5_structure_is_valid($1::jsonb) as valid",
    [JSON.stringify(validStructure)],
  );
  assert.deepEqual(validValidator.rows, [{ valid: true }]);
  const invalidValidator = await db.query<{ valid: boolean }>(
    "select public.activity_plan_v5_structure_is_valid($1::jsonb) as valid",
    [
      JSON.stringify({
        ...validStructure,
        items: [{ ...validStructure.items[0], instructions: "   " }],
      }),
    ],
  );
  assert.deepEqual(invalidValidator.rows, [{ valid: false }]);
  const validatorSource = await db.query<{ definition: string }>(
    "select pg_get_functiondef('public.activity_plan_v5_structure_is_valid(jsonb)'::regprocedure) as definition",
  );
  assert.match(validatorSource.rows[0]?.definition ?? "", /activity_plan_ecmascript_trim/);
  assert.doesNotMatch(validatorSource.rows[0]?.definition ?? "", /select true/i);
  const targetHelperSource = await db.query<{ definition: string }>(
    "select pg_get_functiondef('public.activity_plan_target_is_canonical(jsonb,text)'::regprocedure) as definition",
  );
  assert.match(targetHelperSource.rows[0]?.definition ?? "", /when 'watts'/);
  assert.doesNotMatch(targetHelperSource.rows[0]?.definition ?? "", /select true/i);
  const exactKeysHelperSource = await db.query<{ definition: string }>(
    "select pg_get_functiondef('public.activity_plan_jsonb_has_exact_keys(jsonb,text[],text[])'::regprocedure) as definition",
  );
  assert.match(exactKeysHelperSource.rows[0]?.definition ?? "", /jsonb_object_keys/);
  const targetSemantics = await db.query<{ valid: boolean }>(
    `select public.activity_plan_target_is_canonical($1::jsonb, $2::text) as valid
     union all select public.activity_plan_target_is_canonical($3::jsonb, $4::text)
     union all select public.activity_plan_target_is_canonical($5::jsonb, $6::text)
     union all select public.activity_plan_target_is_canonical($7::jsonb, $8::text)`,
    [
      JSON.stringify({ type: "watts", intensity: 250 }),
      "run",
      JSON.stringify({ type: "watts", intensity: 250 }),
      "bike",
      JSON.stringify({ type: "watts", intensity: 250, unit: "watts" }),
      "bike",
      JSON.stringify({ type: "watts", intensity: 3001 }),
      "bike",
    ],
  );
  assert.deepEqual(targetSemantics.rows, [
    { valid: false },
    { valid: true },
    { valid: false },
    { valid: false },
  ]);

  await db.query(
    `insert into public.users (id, name, email) values
      ($1, 'Materialized owner A', 'materialized-owner-a@example.test'),
      ($2, 'Materialized owner B', 'materialized-owner-b@example.test')`,
    [profileA, profileB],
  );
  await db.query("insert into public.profiles (id) values ($1), ($2)", [profileA, profileB]);
  const hashes = await db.query<{ structure: string; semantic: string }>(
    `select public.activity_plan_core_structure_hash($1::jsonb) as structure,
      public.activity_plan_core_semantic_hash($1::jsonb, 'general_maintenance') as semantic`,
    [JSON.stringify(validStructure)],
  );
  const initialHashes = hashes.rows[0];
  assert.match(initialHashes?.structure ?? "", /^v1:sha256:[0-9a-f]{64}$/);
  assert.match(initialHashes?.semantic ?? "", /^v2:sha256:[0-9a-f]{64}$/);
  const activityPlanId = "77000000-0000-4000-8000-000000000001";
  await db.query(
    `insert into public.activity_plans
      (id, profile_id, name, structure, structure_hash, semantic_hash, training_intent)
     values ($1, $2, 'Materialized plan', $3::jsonb, $4, $5, 'general_maintenance')`,
    [
      activityPlanId,
      profileA,
      JSON.stringify(validStructure),
      initialHashes?.structure,
      initialHashes?.semantic,
    ],
  );
  const revisedStructure = {
    ...validStructure,
    items: [{ ...validStructure.items[0], duration: { type: "time", seconds: 601 } }],
  };
  const revisedHashes = await db.query<{ structure: string; semantic: string }>(
    `select public.activity_plan_core_structure_hash($1::jsonb) as structure,
      public.activity_plan_core_semantic_hash($1::jsonb, 'general_maintenance') as semantic`,
    [JSON.stringify(revisedStructure)],
  );
  await db.query(
    `update public.activity_plans set structure = $2::jsonb, structure_hash = $3,
      semantic_hash = $4, revision = 999 where id = $1`,
    [
      activityPlanId,
      JSON.stringify(revisedStructure),
      revisedHashes.rows[0]?.structure,
      revisedHashes.rows[0]?.semantic,
    ],
  );
  const revisedPlan = await db.query<{ revision: number }>(
    "select revision from public.activity_plans where id = $1",
    [activityPlanId],
  );
  assert.deepEqual(revisedPlan.rows, [{ revision: 2 }]);
  await assert.rejects(
    db.query("update public.activity_plans set semantic_hash = structure_hash where id = $1", [
      activityPlanId,
    ]),
    (error: unknown) =>
      (error as { constraint?: string }).constraint === "activity_plans_hash_guard",
  );
  const retiredManifestValidator = await db.query<{ removed: boolean }>(
    `select to_regprocedure(
      'public.planned_session_resolution_manifest_is_valid(jsonb,uuid,integer)'
    ) is null as removed`,
  );
  assert.deepEqual(retiredManifestValidator.rows, [{ removed: true }]);
  await db.query(
    `insert into public.integrations (id, profile_id, provider, external_id) values
      ($1, $2, 'wahoo', 'materialized-owner-a'),
      ($3, $4, 'garmin', 'materialized-owner-b')`,
    [integrationA, profileA, integrationB, profileB],
  );
  await db.query(
    `insert into public.activity_import_runs (id, profile_id, integration_id, integration_generation, kind)
     values ($1, $2, $3, 1, 'manual_sync')`,
    [importRunA, profileA, integrationA],
  );
  await db.query(
    `insert into public.activity_source_references
      (id, profile_id, integration_id, provider, provider_external_id, resolution_status, last_import_run_id)
     values ($1, $2, $3, 'wahoo', 'materialized-owned', 'review', $4)`,
    [sourceReference, profileA, integrationA, importRunA],
  );
  await db.query(
    `insert into public.activity_source_references
      (id, profile_id, integration_id, provider, provider_external_id, resolution_status,
       last_material_import_run_id, last_material_effective_at)
     values ($1, $2, $3, 'wahoo', 'materialized-material', 'review', $4, '2026-10-01T00:00:00Z')`,
    [materialReference, profileA, integrationA, importRunA],
  );
  await db.query(
    `insert into public.provider_sync_jobs
      (id, profile_id, integration_id, provider, import_run_id, job_type)
     values ($1, $2, $3, 'wahoo', $4, 'materialized-import')`,
    [syncJob, profileA, integrationA, importRunA],
  );

  await expectForeignKeyViolation(
    db,
    `insert into public.activity_source_references
      (profile_id, integration_id, provider, provider_external_id, resolution_status, last_import_run_id)
     values ($1, $2, 'garmin', 'materialized-cross-source', 'review', $3)`,
    [profileB, integrationB, importRunA],
    "activity_source_refs_last_import_run_profile_fk",
  );
  await expectForeignKeyViolation(
    db,
    `insert into public.activity_source_references
      (profile_id, integration_id, provider, provider_external_id, resolution_status,
       last_material_import_run_id, last_material_effective_at)
     values ($1, $2, 'garmin', 'materialized-cross-material', 'review', $3, '2026-10-01T00:00:00Z')`,
    [profileB, integrationB, importRunA],
    "activity_source_refs_material_import_run_profile_fk",
  );
  await expectForeignKeyViolation(
    db,
    `insert into public.provider_sync_jobs
      (profile_id, integration_id, provider, import_run_id, job_type)
     values ($1, $2, 'garmin', $3, 'materialized-cross-job')`,
    [profileB, integrationB, importRunA],
    "provider_sync_jobs_import_run_profile_fkey",
  );

  await db.query("delete from public.activity_import_runs where id = $1", [importRunA]);
  const sources = await db.query<{
    id: string;
    profile_id: string;
    last_import_run_id: string | null;
    last_material_import_run_id: string | null;
    last_material_effective_at: Date | null;
  }>(
    `select id, profile_id, last_import_run_id, last_material_import_run_id, last_material_effective_at
     from public.activity_source_references where id in ($1, $2) order by id`,
    [sourceReference, materialReference],
  );
  assert.deepEqual(sources.rows, [
    {
      id: sourceReference,
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
  const job = await db.query<{ profile_id: string; import_run_id: string | null }>(
    "select profile_id, import_run_id from public.provider_sync_jobs where id = $1",
    [syncJob],
  );
  assert.deepEqual(job.rows, [{ profile_id: profileA, import_run_id: null }]);

  const catalog = await db.query<{ conname: string; definition: string }>(
    `select conname, pg_get_constraintdef(oid) as definition from pg_constraint
     where conname = any($1::text[]) order by conname`,
    [
      [
        "activity_source_refs_last_import_run_profile_fk",
        "activity_source_refs_material_import_run_profile_fk",
        "provider_sync_jobs_import_run_profile_fkey",
      ],
    ],
  );
  assert.equal(catalog.rows.length, 3);
  assert.ok(catalog.rows.every(({ definition }) => definition.includes("ON DELETE SET NULL (")));
  const trigger = await db.query<{ definition: string }>(
    `select pg_get_triggerdef(oid) as definition from pg_trigger
     where tgname = 'activity_import_runs_clear_material_source_references' and not tgisinternal`,
  );
  assert.match(trigger.rows[0]?.definition ?? "", /BEFORE DELETE ON public\.activity_import_runs/);
  console.log("[db:materialized-import-run-ownership] canonical Drizzle export parity passed");
});
