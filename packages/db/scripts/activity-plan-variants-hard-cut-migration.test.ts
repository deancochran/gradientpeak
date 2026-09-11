import assert from "node:assert/strict";
import { basename } from "node:path";

import { getSystemActivityTemplateDefinitions, getSystemTrainingPlanDefinitions } from "@repo/core";
import {
  activityPlanDocumentSchema,
  initializeActivityPlanDocument,
} from "@repo/core/activity-plan";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import { canonicalTrainingPlanStructureSchema } from "@repo/core/schemas";
import type { PoolClient } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";
import { structureHash } from "./canonical-json";
import {
  activityPlanVariantsHardCutMigrationName,
  buildActivityPlanVariantsHardCutMigration,
} from "./generate-activity-plan-variants-hard-cut-migration";
import {
  materializeSystemActivityTemplateSeedValues,
  materializeSystemTrainingPlanSeedValues,
} from "./system-content-seed-values";

type HashedDocumentRow = {
  canonical: string;
  id: string;
  revision: string;
  structure: unknown;
  structure_hash: string;
};

const expectedActivityDocumentCount = 198;
const expectedTrainingDocumentCount = 6;
const profileId = "91000000-0000-4000-8000-000000000001";
const plannedSessionId = "91000000-0000-4000-8000-000000000002";
const eventId = "91000000-0000-4000-8000-000000000003";
const ambiguousEventId = "91000000-0000-4000-8000-000000000004";
const unmatchedEventId = "91000000-0000-4000-8000-000000000005";

function withoutVariantPins(
  structure: ReturnType<typeof materializeSystemTrainingPlanSeedValues>["structure"],
) {
  return {
    ...structure,
    sessions: structure.sessions.map(
      ({ activity_plan_variant_id: _variantId, ...session }) => session,
    ),
  };
}

async function expectCheckViolation(client: PoolClient, statement: string, values: unknown[]) {
  try {
    await client.query(statement, values);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    assert.equal(code, "23514");
    return;
  }
  throw new Error("expected a check-constraint violation");
}

async function seedLegacyRows(client: PoolClient) {
  const activityDefinitions = await getSystemActivityTemplateDefinitions();
  const trainingDefinitions = await getSystemTrainingPlanDefinitions();
  assert.equal(activityDefinitions.length, expectedActivityDocumentCount);
  assert.equal(trainingDefinitions.length, expectedTrainingDocumentCount);

  for (const [index, definition] of activityDefinitions.entries()) {
    const expected = materializeSystemActivityTemplateSeedValues(definition);
    await client.query(
      `insert into public.activity_plans (
         id, profile_id, name, description, notes, structure, structure_hash, revision,
         gps_recording_enabled, content_visibility, is_system_template, system_content_key,
         system_content_version, system_content_hash
       ) values (
         $1::uuid, null, $2, $3, $4, $5::jsonb,
         'v1:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         $6, $7, 'public', true, $8, $9, $10
       )`,
      [
        expected.id,
        expected.name,
        expected.description,
        expected.notes,
        JSON.stringify(definition.content.structure),
        index === 0 ? 7 : 1,
        expected.gps_recording_enabled,
        expected.system_content_key,
        expected.system_content_version,
        expected.system_content_hash,
      ],
    );
  }

  for (const [index, definition] of trainingDefinitions.entries()) {
    const expected = materializeSystemTrainingPlanSeedValues(definition);
    await client.query(
      `insert into public.training_plans (
         id, profile_id, name, description, structure, structure_hash, content_visibility,
         is_system_template, system_content_key, system_content_version, system_content_hash,
         sessions_per_week_target, duration_hours, revision
       ) values (
         $1::uuid, null, $2, $3, $4::jsonb,
         'v1:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
         'public', true, $5, $6, $7, $8, $9, $10
       )`,
      [
        expected.id,
        expected.name,
        expected.description,
        JSON.stringify(withoutVariantPins(expected.structure)),
        expected.system_content_key,
        expected.system_content_version,
        expected.system_content_hash,
        expected.sessions_per_week_target,
        expected.duration_hours,
        index === 0 ? 5 : 1,
      ],
    );
  }

  const firstActivityDefinition = activityDefinitions[0];
  const firstTrainingDefinition = trainingDefinitions[0];
  assert.ok(firstActivityDefinition);
  assert.ok(firstTrainingDefinition);
  const activity = materializeSystemActivityTemplateSeedValues(firstActivityDefinition);
  const training = materializeSystemTrainingPlanSeedValues(firstTrainingDefinition);
  const firstVariant = activityPlanDocumentSchema.parse(activity.structure).variants[0];
  assert.ok(firstVariant);
  const prescription = firstVariant.structure;
  await client.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1::uuid, 'hard-cut-upgrade@example.test', '{}'::jsonb)`,
    [profileId],
  );
  await client.query(
    `insert into public.events (
       id, profile_id, event_type, status, title, all_day, timezone, starts_at,
       ends_at, scheduled_date, training_plan_id, activity_plan_id
     ) values (
       $1::uuid, $2::uuid, 'planned', 'scheduled', 'Legacy pinned session', true, 'UTC',
       '2026-09-10T00:00:00Z'::timestamptz, '2026-09-11T00:00:00Z'::timestamptz,
       '2026-09-10', $3::uuid, $4::uuid
     )`,
    [eventId, profileId, training.id, activity.id],
  );
  await client.query("insert into public.profiles (id) values ($1::uuid) on conflict do nothing", [
    profileId,
  ]);
  await client.query(
    `insert into public.planned_sessions (
       id, profile_id, contract_version, session_revision, planning_date, original_target_date,
       source_kind, idempotency_key, training_plan_id, training_plan_revision, source_session_key,
       activity_plan_id, activity_plan_revision, prescription_structure,
       prescription_quantification, prescription_captured_at
     ) values (
       $1::uuid, $2::uuid, 'planned-session-v1', 3, '2026-09-10', '2026-09-10',
       'training_plan', $3, $4::uuid, 5, 'legacy-session', $5::uuid, 7, $6::jsonb,
       $7::jsonb, '2026-09-10T12:34:56Z'::timestamptz
     )`,
    [
      plannedSessionId,
      profileId,
      `training-plan:${training.id}:5:legacy-session`,
      training.id,
      activity.id,
      JSON.stringify(prescription),
      JSON.stringify({ version: 1, values: [0, 1.25, "line\n雪😀"] }),
    ],
  );

  return { activityDefinitions, activityPlanId: activity.id, trainingDefinitions, prescription };
}

async function snapshotIdentityAndRevisions(client: PoolClient) {
  const activityPlans = await client.query<{ id: string; revision: string }>(
    "select id::text, revision::text from public.activity_plans order by id",
  );
  const trainingPlans = await client.query<{ id: string; revision: string }>(
    "select id::text, revision::text from public.training_plans order by id",
  );
  const plannedSessions = await client.query<{
    activity_plan_id: string;
    activity_plan_revision: string;
    id: string;
    prescription_captured_at: string;
    prescription_quantification: unknown;
    prescription_structure: unknown;
    session_revision: string;
    training_plan_id: string;
    training_plan_revision: string;
  }>(`select
      id::text, session_revision::text, training_plan_id::text, training_plan_revision::text,
      activity_plan_id::text, activity_plan_revision::text, prescription_structure,
      prescription_quantification, prescription_captured_at::text
      from public.planned_sessions order by id`);
  return {
    activityPlans: activityPlans.rows,
    plannedSessions: plannedSessions.rows,
    trainingPlans: trainingPlans.rows,
  };
}

async function assertCanonicalEdgeParity(client: PoolClient) {
  await client.query("set extra_float_digits = 1");
  const rawJsonFixtures = [
    "null",
    "true",
    "-0",
    "1e-7",
    "0.000001",
    "100000000000000000000",
    "1e21",
    "9007199254740993",
    "333333333.33333329",
    "5e-324",
    "1.7976931348623157e308",
    JSON.stringify('quote" slash/ backslash\\ controls\b\f\n\r\t 雪\u2028😀'),
    JSON.stringify({ "\ue000": "bmp", 𐀀: "astral", a: [1e-7, "\u00a0"] }),
  ];

  for (const rawJson of rawJsonFixtures) {
    const result = await client.query<{ canonical: string; structure_hash: string }>(
      `select
         pg_temp.activity_plan_canonical_json($1::jsonb) as canonical,
         pg_temp.activity_plan_structure_hash($1::jsonb) as structure_hash`,
      [rawJson],
    );
    const parsed = JSON.parse(rawJson) as unknown;
    assert.equal(result.rows[0]?.canonical, stringifyCanonicalJson(parsed), rawJson);
    assert.equal(result.rows[0]?.structure_hash, structureHash(parsed), rawJson);
  }
}

async function runUpgradeProof(client: PoolClient) {
  const seeded = await seedLegacyRows(client);
  const before = await snapshotIdentityAndRevisions(client);
  assert.equal(before.activityPlans.length, expectedActivityDocumentCount);
  assert.equal(before.trainingPlans.length, expectedTrainingDocumentCount);
  assert.equal(before.plannedSessions.length, 1);

  const migrationSql = buildActivityPlanVariantsHardCutMigration();
  await client.query(
    `insert into public.events (
       id, profile_id, event_type, status, title, all_day, timezone, starts_at,
       ends_at, scheduled_date, training_plan_id, activity_plan_id
     )
     select $1::uuid, profile_id, event_type, status, title, all_day, timezone,
       starts_at + interval '1 day', ends_at + interval '1 day', '2026-09-11',
       training_plan_id, activity_plan_id
     from public.events where id = $2::uuid`,
    [unmatchedEventId, eventId],
  );
  await assert.rejects(
    client.query(migrationSql),
    /event to planned-session backfill requires exactly one snapshot candidate per training-plan event/,
  );
  await client.query("rollback");
  await client.query("delete from public.events where id = $1::uuid", [unmatchedEventId]);
  await client.query(
    `insert into public.events (
       id, profile_id, event_type, status, title, all_day, timezone, starts_at,
       ends_at, scheduled_date, training_plan_id, activity_plan_id
     )
     select $1::uuid, profile_id, event_type, status, title, all_day, timezone,
       starts_at, ends_at, scheduled_date, training_plan_id, activity_plan_id
     from public.events where id = $2::uuid`,
    [ambiguousEventId, eventId],
  );
  await assert.rejects(
    client.query(migrationSql),
    /event to planned-session backfill is ambiguous because one snapshot matches multiple training-plan events/,
  );
  await client.query("rollback");
  const preservedEvents = await client.query<{ count: string }>(
    "select count(*)::text as count from public.events where id in ($1::uuid, $2::uuid)",
    [eventId, ambiguousEventId],
  );
  assert.equal(preservedEvents.rows[0]?.count, "2");
  await client.query("delete from public.events where id = $1::uuid", [ambiguousEventId]);
  await client.query(migrationSql);
  const after = await snapshotIdentityAndRevisions(client);
  assert.deepEqual(after.trainingPlans, before.trainingPlans);
  assert.deepEqual(after.plannedSessions, before.plannedSessions);
  assert.deepEqual(
    after.activityPlans,
    before.activityPlans.map((plan) => ({
      id: plan.id,
      revision: String(Number(plan.revision) + 1),
    })),
  );

  const activityRows = await client.query<HashedDocumentRow>(`
    select id::text, revision::text, structure, structure_hash,
      pg_temp.activity_plan_canonical_json(structure) as canonical
    from public.activity_plans order by id
  `);
  assert.equal(activityRows.rows.length, expectedActivityDocumentCount);
  const activityDefinitionById = new Map(
    seeded.activityDefinitions.map((definition) => [definition.content.id, definition]),
  );
  for (const row of activityRows.rows) {
    const definition = activityDefinitionById.get(row.id);
    assert.ok(definition);
    const expectedDocument = initializeActivityPlanDocument({
      activityPlanId: row.id,
      structure: definition.content.structure,
    });
    assert.deepEqual(activityPlanDocumentSchema.parse(row.structure), expectedDocument);
    assert.equal(row.canonical, stringifyCanonicalJson(expectedDocument));
    assert.equal(row.structure_hash, structureHash(expectedDocument));
  }

  const trainingRows = await client.query<HashedDocumentRow>(`
    select id::text, revision::text, structure, structure_hash,
      pg_temp.activity_plan_canonical_json(structure) as canonical
    from public.training_plans order by id
  `);
  assert.equal(trainingRows.rows.length, expectedTrainingDocumentCount);
  const trainingDefinitionById = new Map(
    seeded.trainingDefinitions.map((definition) => [definition.content.id, definition]),
  );
  for (const row of trainingRows.rows) {
    const definition = trainingDefinitionById.get(row.id);
    assert.ok(definition);
    const expectedStructure = materializeSystemTrainingPlanSeedValues(definition).structure;
    assert.deepEqual(canonicalTrainingPlanStructureSchema.parse(row.structure), expectedStructure);
    assert.equal(row.canonical, stringifyCanonicalJson(expectedStructure));
    assert.equal(row.structure_hash, structureHash(expectedStructure));
  }

  const plannedSession = await client.query<{
    activity_plan_variant_id: string;
    activity_plan_variant_name: string;
    contract_version: string;
  }>(
    `select contract_version, activity_plan_variant_id::text, activity_plan_variant_name
      from public.planned_sessions where id = $1::uuid`,
    [plannedSessionId],
  );
  assert.deepEqual(plannedSession.rows[0], {
    activity_plan_variant_id: seeded.activityPlanId,
    activity_plan_variant_name: "Base",
    contract_version: "planned-session-v2",
  });
  const linkedEvent = await client.query<{
    planned_session_id: string;
    prescription_structure_hash: string;
  }>(
    `select event.planned_session_id::text, planned_session.prescription_structure_hash
     from public.events as event
     join public.planned_sessions as planned_session on planned_session.id = event.planned_session_id
     where event.id = $1::uuid`,
    [eventId],
  );
  assert.deepEqual(linkedEvent.rows[0], {
    planned_session_id: plannedSessionId,
    prescription_structure_hash: structureHash(seeded.prescription),
  });

  for (const whitespace of ["\u00a0", "\u1680", "\u202f", "\u3000", "\ufeff"]) {
    const invalidDocument = initializeActivityPlanDocument({
      activityPlanId: seeded.activityPlanId,
      structure: seeded.prescription,
    });
    const invalidVariant = invalidDocument.variants[0];
    assert.ok(invalidVariant);
    invalidVariant.name = `${whitespace}Base${whitespace}`;
    const canonicalCheck = await client.query<{ accepted: boolean }>(
      "select public.activity_plan_document_is_canonical($1::jsonb) as accepted",
      [JSON.stringify(invalidDocument)],
    );
    assert.equal(canonicalCheck.rows[0]?.accepted, false);
    await expectCheckViolation(
      client,
      "update public.planned_sessions set activity_plan_variant_name = $1 where id = $2::uuid",
      [`${whitespace}Base${whitespace}`, plannedSessionId],
    );
  }

  await assertCanonicalEdgeParity(client);
}

const args = process.argv.slice(2);
await withDisposableDatabase(args, "activity_plan_variants_upgrade", async (target) => {
  await bootstrapSupabaseSchemas(target);
  const orderedMigrations = requireFreshBaseline().migrationPaths;
  const hardCutIndex = orderedMigrations.findIndex(
    (migrationPath) => basename(migrationPath) === activityPlanVariantsHardCutMigrationName,
  );
  assert.equal(
    hardCutIndex,
    orderedMigrations.length - 1,
    "hard cut must be the current migration",
  );
  for (const migrationPath of orderedMigrations.slice(0, hardCutIndex)) {
    await applySqlFile(target, migrationPath);
  }
  await target.query(`
    alter table public.activity_plans set (autovacuum_enabled = false);
    alter table public.training_plans set (autovacuum_enabled = false);
    alter table public.planned_sessions set (autovacuum_enabled = false);
  `);

  const client = await target.connect();
  try {
    await runUpgradeProof(client);
  } finally {
    client.release();
  }
});

process.stdout.write(
  `activity-plan hard-cut upgrade and canonical parity passed for ${expectedActivityDocumentCount} activity documents and ${expectedTrainingDocumentCount} training documents\n`,
);
