import { createHash } from "node:crypto";
import type { TestInfo } from "@playwright/test";
import { activityPlanStructureSchema } from "@repo/core";
import { Pool, type PoolClient } from "pg";

import { TEST_ACTIVITY_PLAN_ID, TEST_USERS } from "../utils/testData";

type TrainingPlanFixture = {
  ownedName: string;
  templateName: string;
};

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    // biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Training-plan E2E fixtures only support the local database.");
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Fixture contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error(`Fixture contains unsupported ${typeof value}.`);
}

function structureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(canonicalJson(structure)).digest("hex")}`;
}

function fixtureNames(testInfo: TestInfo): TrainingPlanFixture {
  const digest = createHash("sha256")
    .update(`${testInfo.project.name}|${testInfo.titlePath.join("|")}`)
    .digest("hex")
    .slice(0, 12);
  return {
    ownedName: `Playwright Training Plan ${digest}`,
    templateName: `Playwright Training Template ${digest}`,
  };
}

async function actorProfileId(client: PoolClient) {
  const result = await client.query<{ id: string }>(
    `select p."id" from "profiles" p
     inner join "users" u on u."id" = p."id"
     where lower(u."email") = lower($1) limit 1`,
    [TEST_USERS.athlete.email],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("The local athlete fixture was not provisioned.");
  return id;
}

async function cleanup(client: PoolClient, profileId: string, names: TrainingPlanFixture) {
  await client.query(
    `delete from "events" where "profile_id" = $1
     and "training_plan_id" in (select "id" from "training_plans" where "name" = any($2::text[]))`,
    [profileId, [names.ownedName]],
  );
  await client.query('delete from "training_plans" where "name" = any($1::text[])', [
    [names.ownedName, names.templateName],
  ]);
}

async function normalizeSeededActivityPlanHash(client: PoolClient) {
  const result = await client.query<{
    content_visibility: string;
    structure: unknown;
    structure_hash: string;
  }>(
    `select "structure", "structure_hash", "content_visibility"
     from "activity_plans" where "id" = $1 limit 1`,
    [TEST_ACTIVITY_PLAN_ID],
  );
  const original = result.rows[0];
  const parsed = activityPlanStructureSchema.safeParse(result.rows[0]?.structure);
  if (!parsed.success || !original) {
    throw new Error(
      "The local training-plan activity fixture is not a current activity-plan structure.",
    );
  }
  await client.query(
    `update "activity_plans"
     set "structure_hash" = $2, "content_visibility" = 'public'
     where "id" = $1`,
    [TEST_ACTIVITY_PLAN_ID, structureHash(parsed.data)],
  );
  return original;
}

export async function prepareTrainingPlanPrerequisites() {
  const pool = new Pool({ connectionString: localDatabaseUrl() });
  const client = await pool.connect();
  let original: Awaited<ReturnType<typeof normalizeSeededActivityPlanHash>> | undefined;
  let profileId: string | undefined;
  let planningTimezone: string | null | undefined;
  try {
    original = await normalizeSeededActivityPlanHash(client);
    profileId = await actorProfileId(client);
    const profile = await client.query<{ planning_timezone: string | null }>(
      'select "planning_timezone" from "profiles" where "id" = $1 limit 1',
      [profileId],
    );
    planningTimezone = profile.rows[0]?.planning_timezone;
    await client.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
      profileId,
      "UTC",
    ]);
  } finally {
    client.release();
    await pool.end();
  }
  return async () => {
    const restorePool = new Pool({ connectionString: localDatabaseUrl() });
    try {
      await restorePool.query(
        `update "activity_plans"
         set "structure_hash" = $2, "content_visibility" = $3
         where "id" = $1`,
        [TEST_ACTIVITY_PLAN_ID, original.structure_hash, original.content_visibility],
      );
      await restorePool.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
        profileId,
        planningTimezone,
      ]);
    } finally {
      await restorePool.end();
    }
  };
}

export async function withTrainingPlanLibraryFixture(
  testInfo: TestInfo,
  run: (fixture: TrainingPlanFixture) => Promise<void>,
) {
  const names = fixtureNames(testInfo);
  const pool = new Pool({ connectionString: localDatabaseUrl() });
  const client = await pool.connect();
  let originalActivityPlan: Awaited<ReturnType<typeof normalizeSeededActivityPlanHash>> | undefined;
  let profileId: string | undefined;
  let planningTimezone: string | null | undefined;
  try {
    profileId = await actorProfileId(client);
    const profile = await client.query<{ planning_timezone: string | null }>(
      'select "planning_timezone" from "profiles" where "id" = $1 limit 1',
      [profileId],
    );
    planningTimezone = profile.rows[0]?.planning_timezone;
    await client.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
      profileId,
      "UTC",
    ]);
    originalActivityPlan = await normalizeSeededActivityPlanHash(client);
    const structure = {
      version: 1,
      sessions: [
        {
          activity_plan_id: TEST_ACTIVITY_PLAN_ID,
          offset_days: 0,
          event_overrides: { title: "Playwright tempo" },
        },
      ],
    };
    await cleanup(client, profileId, names);
    await client.query(
      `insert into "training_plans" (
        "id", "profile_id", "name", "description", "structure", "structure_hash",
        "content_visibility", "is_system_template"
      ) values
        (gen_random_uuid(), $1, $2, 'Owned browser-library fixture', $4::jsonb, $5, 'private', false),
        (gen_random_uuid(), null, $3, 'System browser-library fixture', $4::jsonb, $5, 'public', true)`,
      [
        profileId,
        names.ownedName,
        names.templateName,
        JSON.stringify(structure),
        structureHash(structure),
      ],
    );
    await run(names);
  } finally {
    try {
      const cleanupProfileId = await actorProfileId(client);
      await cleanup(client, cleanupProfileId, names);
      if (originalActivityPlan) {
        await client.query(
          `update "activity_plans"
           set "structure_hash" = $2, "content_visibility" = $3
           where "id" = $1`,
          [
            TEST_ACTIVITY_PLAN_ID,
            originalActivityPlan.structure_hash,
            originalActivityPlan.content_visibility,
          ],
        );
      }
      if (profileId) {
        await client.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
          profileId,
          planningTimezone,
        ]);
      }
    } finally {
      client.release();
      await pool.end();
    }
  }
}

export async function cleanupTrainingPlanByName(name: string) {
  const pool = new Pool({ connectionString: localDatabaseUrl() });
  const client = await pool.connect();
  try {
    const profileId = await actorProfileId(client);
    const names = { ownedName: name, templateName: name };
    await cleanup(client, profileId, names);
  } finally {
    client.release();
    await pool.end();
  }
}
