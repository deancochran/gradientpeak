import assert from "node:assert/strict";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import { buildMaterializedSchemaTarget } from "./materialize-local-drizzle-schema";

const profileId = "11000000-0000-4000-8000-000000000001";
const integrationId = "22000000-0000-4000-8000-000000000001";
const importRunId = "33000000-0000-4000-8000-000000000001";
const referenceId = "44000000-0000-4000-8000-000000000001";

await withDisposableDatabase(process.argv.slice(2), "materialized_import_run", async (db, url) => {
  await bootstrapSupabaseSchemas(db);
  await buildMaterializedSchemaTarget(db, url);

  const validatorAndHash = await db.query<{
    hash: string;
    invalid_target: boolean;
    invalid_v5: boolean;
    valid_target: boolean;
    valid_v5: boolean;
  }>(`
    select
      public.activity_plan_target_is_canonical('{"type":"%FTP","intensity":100}'::jsonb, 'run') as invalid_target,
      public.activity_plan_target_is_canonical('{"type":"RPE","intensity":6}'::jsonb, 'run') as valid_target,
      public.activity_plan_v5_structure_is_valid(
        '{"version":5,"activity_category":"run","items":[{"type":"step","id":"66000000-0000-4000-8000-000000000001","name":"Tempo","instructions":"Maintain a controlled effort.","duration":{"type":"time","seconds":600},"targets":[{"type":"%FTP","intensity":100}]}]}'::jsonb
      ) as invalid_v5,
      public.activity_plan_v5_structure_is_valid(
        '{"version":5,"activity_category":"run","items":[{"type":"step","id":"66000000-0000-4000-8000-000000000001","name":"Easy run","instructions":"Keep an easy pace.","duration":{"type":"time","seconds":600},"targets":[]}]}'::jsonb
      ) as valid_v5,
      public.activity_plan_core_structure_hash('{"value":1}'::jsonb) as hash
  `);
  assert.equal(validatorAndHash.rows[0]?.invalid_target, false);
  assert.equal(validatorAndHash.rows[0]?.invalid_v5, false);
  assert.equal(validatorAndHash.rows[0]?.valid_target, true);
  assert.equal(validatorAndHash.rows[0]?.valid_v5, true);
  assert.match(validatorAndHash.rows[0]?.hash ?? "", /^v1:sha256:[0-9a-f]{64}$/);

  await db.query(
    "insert into public.users (id, name, email) values ($1, 'Materialized owner', 'materialized-owner@example.test')",
    [profileId],
  );
  await db.query("insert into public.profiles (id) values ($1)", [profileId]);
  await db.query(
    "insert into public.integrations (id, profile_id, provider, external_id) values ($1, $2, 'wahoo', 'materialized-owner')",
    [integrationId, profileId],
  );
  await db.query(
    "insert into public.activity_import_runs (id, profile_id, integration_id, integration_generation, kind) values ($1, $2, $3, 1, 'manual_sync')",
    [importRunId, profileId, integrationId],
  );
  await db.query(
    `insert into public.activity_source_references (
       id, profile_id, integration_id, provider, provider_external_id, resolution_status,
       last_import_run_id, last_material_import_run_id, last_material_effective_at
     ) values ($1, $2, $3, 'wahoo', 'materialized-reference', 'review', $4, $4, '2026-11-04T00:00:00Z')`,
    [referenceId, profileId, integrationId, importRunId],
  );

  const constraints = await db.query<{ definition: string }>(`
    select pg_get_constraintdef(oid) as definition from pg_constraint
    where conname in (
      'activity_source_refs_last_import_run_profile_fk',
      'activity_source_refs_material_import_run_profile_fk'
    ) order by conname
  `);
  assert.deepEqual(constraints.rows, [
    {
      definition:
        "FOREIGN KEY (last_import_run_id, profile_id) REFERENCES activity_import_runs(id, profile_id) ON DELETE SET NULL (last_import_run_id)",
    },
    {
      definition:
        "FOREIGN KEY (last_material_import_run_id, profile_id) REFERENCES activity_import_runs(id, profile_id) ON DELETE SET NULL (last_material_import_run_id)",
    },
  ]);
  const trigger = await db.query<{ definition: string }>(`
    select pg_get_triggerdef(oid) as definition from pg_trigger
    where tgname = 'activity_import_runs_clear_material_source_references' and not tgisinternal
  `);
  assert.match(trigger.rows[0]?.definition ?? "", /BEFORE DELETE ON public\.activity_import_runs/);

  await db.query("delete from public.activity_import_runs where id = $1", [importRunId]);
  const cleared = await db.query<{
    profile_id: string;
    last_import_run_id: string | null;
    last_material_import_run_id: string | null;
    last_material_effective_at: Date | null;
  }>(
    `select profile_id, last_import_run_id, last_material_import_run_id, last_material_effective_at
     from public.activity_source_references where id = $1`,
    [referenceId],
  );
  assert.deepEqual(cleared.rows, [
    {
      profile_id: profileId,
      last_import_run_id: null,
      last_material_import_run_id: null,
      last_material_effective_at: null,
    },
  ]);
});

console.log("Materialized import-run ownership supplemental artifact verification passed.");
