import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const ownerProfileId = "11000000-0000-4000-8000-000000000011";
const otherProfileId = "11000000-0000-4000-8000-000000000012";
const ownerIntegrationId = "22000000-0000-4000-8000-000000000011";
const otherIntegrationId = "22000000-0000-4000-8000-000000000012";
const importRunId = "33000000-0000-4000-8000-000000000011";
const jobId = "55000000-0000-4000-8000-000000000011";

type VerificationTarget = {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
};

async function expectForeignKeyViolation(operation: Promise<unknown>, constraint: string) {
  await assert.rejects(operation, (error: unknown) => {
    const databaseError = error as { code?: string; constraint?: string };
    return databaseError.code === "23503" && databaseError.constraint === constraint;
  });
}

export async function assertFreshProviderJobOwnership(db: VerificationTarget) {
  await db.query(
    `insert into public.users (id, name, email) values
       ($1, 'Fresh provider-job owner', 'fresh-provider-job-owner@example.test'),
       ($2, 'Other fresh provider-job owner', 'other-fresh-provider-job-owner@example.test')`,
    [ownerProfileId, otherProfileId],
  );
  await db.query("insert into public.profiles (id) values ($1), ($2)", [
    ownerProfileId,
    otherProfileId,
  ]);
  await db.query(
    `insert into public.integrations (id, profile_id, provider, external_id) values
       ($1, $2, 'wahoo', 'fresh-provider-job-owner'),
       ($3, $4, 'garmin', 'other-fresh-provider-job-owner')`,
    [ownerIntegrationId, ownerProfileId, otherIntegrationId, otherProfileId],
  );
  await db.query(
    `insert into public.activity_import_runs
      (id, profile_id, integration_id, integration_generation, kind)
     values ($1, $2, $3, 1, 'manual_sync')`,
    [importRunId, ownerProfileId, ownerIntegrationId],
  );
  await db.query(
    `insert into public.provider_sync_jobs
      (id, profile_id, integration_id, provider, import_run_id, job_type)
     values ($1, $2, $3, 'wahoo', $4, 'import_activities')`,
    [jobId, ownerProfileId, ownerIntegrationId, importRunId],
  );

  const insertedJob = await db.query<{
    attempt: number;
    import_run_id: string;
    integration_generation: number;
    integration_id: string;
    max_attempts: number;
    priority: number;
    profile_id: string;
    queue_sequence: string;
    run_at: Date;
    status: string;
  }>(
    `select queue_sequence::text, profile_id, integration_id, integration_generation, import_run_id,
            status, priority, run_at, attempt, max_attempts
     from public.provider_sync_jobs where id = $1`,
    [jobId],
  );
  assert.equal(insertedJob.rows.length, 1);
  assert.deepEqual(
    {
      ...insertedJob.rows[0],
      queue_sequence: Number(insertedJob.rows[0]?.queue_sequence) > 0,
      run_at: insertedJob.rows[0]?.run_at instanceof Date,
    },
    {
      queue_sequence: true,
      profile_id: ownerProfileId,
      integration_id: ownerIntegrationId,
      integration_generation: 1,
      import_run_id: importRunId,
      status: "queued",
      priority: 100,
      run_at: true,
      attempt: 0,
      max_attempts: 8,
    },
  );

  await expectForeignKeyViolation(
    db.query(
      `insert into public.provider_sync_jobs
        (profile_id, integration_id, provider, import_run_id, job_type)
       values ($1, $2, 'garmin', $3, 'cross_profile_import')`,
      [otherProfileId, otherIntegrationId, importRunId],
    ),
    "provider_sync_jobs_import_run_profile_fkey",
  );

  const constraint = await db.query<{ definition: string }>(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conname = 'provider_sync_jobs_import_run_profile_fkey'
  `);
  assert.deepEqual(constraint.rows, [
    {
      definition:
        "FOREIGN KEY (import_run_id, profile_id) REFERENCES activity_import_runs(id, profile_id) ON DELETE SET NULL (import_run_id)",
    },
  ]);

  await db.query("delete from public.activity_import_runs where id = $1", [importRunId]);
  const deletedRunJob = await db.query<{
    import_run_id: string | null;
    integration_id: string;
    profile_id: string;
  }>(
    `select import_run_id, integration_id, profile_id
     from public.provider_sync_jobs where id = $1`,
    [jobId],
  );
  assert.deepEqual(deletedRunJob.rows, [
    {
      import_run_id: null,
      integration_id: ownerIntegrationId,
      profile_id: ownerProfileId,
    },
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await withDisposableDatabase(process.argv.slice(2), "fresh_provider_job", async (db) => {
    await bootstrapSupabaseSchemas(db);
    for (const migrationPath of requireFreshBaseline().migrationPaths) {
      await applySqlFile(db, migrationPath);
    }
    await assertFreshProviderJobOwnership(db);
  });
  console.log(
    "Fresh baseline provider-job ownership preserves lifecycle fields, rejects cross-profile runs, and clears only import_run_id.",
  );
}
