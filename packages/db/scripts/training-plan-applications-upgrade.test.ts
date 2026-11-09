import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "./disposable-database-test-harness";

const targetMigration = "20260914120000_training_plan_applications.sql";
const hash = `v1:sha256:${"a".repeat(64)}`;

await withDisposableDatabase(
  process.argv.slice(2),
  "training_plan_applications_upgrade",
  async (target, connectionString) => {
    await bootstrapSupabaseSchemas(target);
    const migrations = requireFreshBaseline().migrationPaths;
    const targetIndex = migrations.findIndex((path) => path.endsWith(targetMigration));
    assert.ok(targetIndex > 0, "application migration must follow the immutable-source migration");
    for (const migrationPath of migrations.slice(0, targetIndex))
      await applySqlFile(target, migrationPath);

    const pool = new Pool({ connectionString });
    const profileId = randomUUID();
    const activityPlanId = randomUUID();
    const matchedPlanId = randomUUID();
    const unmatchedPlanId = randomUUID();
    const matchedSourceId = randomUUID();
    const unmatchedSourceId = randomUUID();
    const matchedSessionId = randomUUID();
    const unmatchedSessionId = randomUUID();
    const email = `${profileId}@upgrade.test`;
    const activityStructure = {
      version: 3,
      activity_category: "bike",
      segments: [
        {
          id: randomUUID(),
          role: "activity",
          name: "Ride",
          intervals: [
            {
              id: randomUUID(),
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: randomUUID(),
                  name: "Steady",
                  duration: { type: "time", seconds: 3600 },
                  targets: [{ type: "%FTP", intensity: 80 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const manifest = {
      resolver_version: "upgrade-test",
      policy_version: "upgrade-test",
      activity_plan_id: activityPlanId,
      activity_plan_revision: 1,
      activity_plan_semantic_hash: hash,
      session_demand: {},
      adaptation_values: {},
      effective_target_duration_minutes: null,
      effective_target_common_load: null,
      evidence_facts: [],
      reason_codes: [],
      resolved_structure: {},
      resolved_structure_hash: hash,
      prescription_estimate: {},
      fingerprint: hash,
    };
    const planStructure = (sourceId: string) => ({
      version: 1,
      plan_preferences: {
        weekly_session_count: 1,
        target_weekly_duration_minutes: 60,
        maximum_session_duration_minutes: 60,
        preferred_weekdays: [1],
        rest_days: [],
        progression_style: "balanced",
        recovery_priority: "balanced",
      },
      sessions: [
        {
          id: sourceId,
          activity_plan_id: activityPlanId,
          offset_days: 0,
          demand: {
            activity_category: "bike",
            training_intent: "aerobic_base",
            target_duration_minutes: 60,
            target_common_load: null,
            importance: "normal",
          },
        },
      ],
    });
    try {
      await pool.query(
        `insert into public.users(id, name, email, email_verified) values ($1, 'Upgrade', $2, true)`,
        [profileId, email],
      );
      await pool.query(
        `insert into public.profiles(id, email, planning_timezone) values ($1, $2, 'UTC')`,
        [profileId, email],
      );
      await pool.query(
        `insert into public.activity_plans(id, profile_id, name, training_intent, structure, structure_hash, semantic_hash)
         values ($1, $2, 'Ride', 'aerobic_base', $3::jsonb, $4, $4)`,
        [activityPlanId, profileId, JSON.stringify(activityStructure), hash],
      );
      await pool.query(
        `insert into public.training_plans(id, profile_id, name, structure, structure_hash, revision)
         values ($1, $2, 'Matched', $3::jsonb, $4, 1)`,
        [matchedPlanId, profileId, JSON.stringify(planStructure(matchedSourceId)), hash],
      );
      await pool.query(
        `insert into public.training_plans(id, profile_id, name, structure, structure_hash, revision)
         values ($1, $2, 'Unmatched', $3::jsonb, $4, 2)`,
        [unmatchedPlanId, profileId, JSON.stringify(planStructure(unmatchedSourceId)), hash],
      );
      const insertSession = async (id: string, planId: string, sourceId: string, date: string) =>
        pool.query(
          `insert into public.planned_sessions(
            id, profile_id, planning_date, original_target_date, source_kind, idempotency_key,
            training_plan_id, training_plan_revision, source_session_id, activity_plan_id,
            activity_plan_revision, resolution_manifest, prescription_captured_at
          ) values ($1::uuid, $2::uuid, $3::date, $3::date, 'training_plan', 'training-plan:' || $4::text || ':1:' || $5::text,
            $4::uuid, 1, $5::uuid, $6::uuid, 1, $7::jsonb, now())`,
          [id, profileId, date, planId, sourceId, activityPlanId, JSON.stringify(manifest)],
        );
      await insertSession(matchedSessionId, matchedPlanId, matchedSourceId, "2026-08-03");
      await insertSession(unmatchedSessionId, unmatchedPlanId, unmatchedSourceId, "2026-08-10");
      const targetMigrationPath = migrations[targetIndex];
      assert.ok(targetMigrationPath, "target migration must be present");
      await applySqlFile(target, targetMigrationPath);
      const rows = await pool.query<{
        id: string;
        training_plan_application_id: string | null;
        idempotency_key: string;
        resolution_manifest: unknown;
      }>(
        `select id, training_plan_application_id, idempotency_key, resolution_manifest
         from public.planned_sessions where id = any($1::uuid[]) order by id`,
        [[matchedSessionId, unmatchedSessionId]],
      );
      const matched = rows.rows.find((row) => row.id === matchedSessionId);
      const unmatched = rows.rows.find((row) => row.id === unmatchedSessionId);
      assert.ok(matched, "matched session must be present");
      assert.ok(unmatched, "unmatched session must be present");
      assert.ok(matched.training_plan_application_id, "validated current revision must backfill");
      assert.deepEqual(matched.resolution_manifest, manifest);
      assert.equal(
        unmatched.training_plan_application_id,
        null,
        "revision mismatch must remain legacy",
      );
      assert.equal(
        unmatched.idempotency_key,
        `training-plan:${unmatchedPlanId}:1:${unmatchedSourceId}`,
      );
      for (const statement of [
        `update public.planned_sessions set source_session_id = gen_random_uuid() where id = '${matchedSessionId}'`,
        `update public.planned_sessions set training_plan_application_id = null where id = '${matchedSessionId}'`,
        `update public.planned_sessions set resolution_manifest = '{}'::jsonb where id = '${matchedSessionId}'`,
      ]) {
        await assert.rejects(pool.query(statement), { code: "23514" });
      }
    } finally {
      await pool.end();
    }
  },
);
