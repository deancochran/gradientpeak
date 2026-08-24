import { createHash } from "node:crypto";
import type { TestInfo } from "@playwright/test";
import { activityPlanStructureSchema, defaultAthletePreferenceProfile } from "@repo/core";
import { currentE2EActor } from "../support/actors";
import { currentE2ECleanupRegistry } from "../support/cleanup";
import { type E2EQuery, LocalE2EDatabase } from "../support/database";
import { createE2EExecutionIdentity } from "../support/identity";
import { registerTrainingPlanCleanup } from "./cleanup";

type TrainingPlanFixture = {
  ownedName: string;
  templateName: string;
};

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
  const identity = createE2EExecutionIdentity(testInfo);
  return {
    ownedName: identity.name("Playwright Training Plan"),
    templateName: identity.name("Playwright Training Template"),
  };
}

async function actorProfileId(client: E2EQuery) {
  void client;
  return currentE2EActor("athlete").profileId;
}

function actorActivityPlanId() {
  const id = currentE2EActor("athlete").activityPlanId;
  if (!id) throw new Error("The isolated athlete activity plan was not provisioned.");
  return id;
}

async function normalizeSeededActivityPlanHash(client: E2EQuery) {
  const result = await client.query<{
    content_visibility: string;
    structure: unknown;
    structure_hash: string;
  }>(
    `select "structure", "structure_hash", "content_visibility"
     from "activity_plans" where "id" = $1 limit 1`,
    [actorActivityPlanId()],
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
    [actorActivityPlanId(), structureHash(parsed.data)],
  );
  return original;
}

export async function prepareTrainingPlanPrerequisites() {
  const pool = new LocalE2EDatabase();
  const client = await pool.connect();
  let original: Awaited<ReturnType<typeof normalizeSeededActivityPlanHash>> | undefined;
  const activityPlanId = actorActivityPlanId();
  let profileId: string | undefined;
  let planningTimezone: string | null | undefined;
  let originalSettings: { settings: unknown; updated_at: string | Date } | undefined;
  try {
    original = await normalizeSeededActivityPlanHash(client);
    profileId = await actorProfileId(client);
    const profile = await client.query<{ planning_timezone: string | null }>(
      'select "planning_timezone" from "profiles" where "id" = $1 limit 1',
      [profileId],
    );
    planningTimezone = profile.rows[0]?.planning_timezone;
    originalSettings = (
      await client.query<{ settings: unknown; updated_at: string | Date }>(
        'select "settings", "updated_at" from "profile_training_settings" where "profile_id" = $1',
        [profileId],
      )
    ).rows[0];
    await client.query(
      `insert into "profile_training_settings" ("profile_id", "settings", "updated_at")
       values ($1, $2::jsonb, now())
       on conflict ("profile_id") do update
       set "settings" = excluded."settings", "updated_at" = excluded."updated_at"`,
      [profileId, JSON.stringify(defaultAthletePreferenceProfile)],
    );
    await client.query(
      `insert into "profile_athlete_state" (
         "profile_id", "source_revision", "published_revision", "fitness", "fatigue",
         "evidence_confidence", "computed_at", "updated_at"
       ) values ($1, 1, 1, 0, 0, 0, now(), now())
       on conflict ("profile_id") do update set
         "source_revision" = 1, "published_revision" = 1, "dirty_from_at" = null,
         "fitness" = 0, "fatigue" = 0, "evidence_confidence" = 0,
         "computed_at" = now(), "updated_at" = now()`,
      [profileId],
    );
    await client.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
      profileId,
      "UTC",
    ]);
  } finally {
    client.release();
    await pool.close();
  }
  return async () => {
    const restorePool = new LocalE2EDatabase();
    try {
      await restorePool.query(
        `update "activity_plans"
         set "structure_hash" = $2, "content_visibility" = $3
         where "id" = $1`,
        [activityPlanId, original.structure_hash, original.content_visibility],
      );
      await restorePool.query('update "profiles" set "planning_timezone" = $2 where "id" = $1', [
        profileId,
        planningTimezone,
      ]);
      if (originalSettings) {
        await restorePool.query(
          `insert into "profile_training_settings" ("profile_id", "settings", "updated_at")
           values ($1, $2::jsonb, $3)
           on conflict ("profile_id") do update
           set "settings" = excluded."settings", "updated_at" = excluded."updated_at"`,
          [profileId, JSON.stringify(originalSettings.settings), originalSettings.updated_at],
        );
      } else {
        await restorePool.query('delete from "profile_training_settings" where "profile_id" = $1', [
          profileId,
        ]);
      }
      await restorePool.query('delete from "profile_athlete_state" where "profile_id" = $1', [
        profileId,
      ]);
    } finally {
      await restorePool.close();
    }
  };
}

export async function withTrainingPlanLibraryFixture(
  testInfo: TestInfo,
  run: (fixture: TrainingPlanFixture) => Promise<void>,
) {
  const identity = createE2EExecutionIdentity(testInfo);
  const names = fixtureNames(testInfo);
  const pool = new LocalE2EDatabase();
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
    const structureBase = {
      version: 1,
      sessions: [
        {
          activity_plan_id: actorActivityPlanId(),
          offset_days: 0,
          event_overrides: { title: "Playwright tempo" },
        },
      ],
    };
    const ownedId = identity.uuid("training-plan-owned");
    const templateId = identity.uuid("training-plan-template");
    const ownedStructure = { id: ownedId, ...structureBase };
    const templateStructure = { id: templateId, ...structureBase };
    const inserted = await client.query<{
      id: string;
      is_system_template: boolean;
      profile_id: string | null;
    }>(
      `insert into "training_plans" (
        "id", "profile_id", "name", "description", "structure", "structure_hash",
        "content_visibility", "is_system_template", "system_content_key",
        "system_content_version", "system_content_hash"
      ) values
        ($4::uuid, $1, $2, 'Owned browser-library fixture', $6::jsonb, $7, 'private', false, null, null, null),
        ($5::uuid, null, $3, 'System browser-library fixture', $8::jsonb, $9, 'public', true, $10, 1, $9)
       returning "id", "profile_id", "is_system_template"`,
      [
        profileId,
        names.ownedName,
        names.templateName,
        ownedId,
        templateId,
        JSON.stringify(ownedStructure),
        structureHash(ownedStructure),
        JSON.stringify(templateStructure),
        structureHash(templateStructure),
        `e2e:${names.templateName}`,
      ],
    );
    const registry = currentE2ECleanupRegistry();
    for (const plan of inserted.rows) {
      registerTrainingPlanCleanup(registry, {
        id: plan.id,
        ownerProfileId: plan.profile_id,
        scheduledByProfileId: profileId,
        systemTemplate: plan.is_system_template,
      });
    }
    await run(names);
  } finally {
    try {
      if (originalActivityPlan) {
        await client.query(
          `update "activity_plans"
           set "structure_hash" = $2, "content_visibility" = $3
           where "id" = $1`,
          [
            actorActivityPlanId(),
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
      await pool.close();
    }
  }
}
