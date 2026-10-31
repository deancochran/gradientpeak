import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  activities,
  activityPlans,
  activityRoutes,
  activitySegments,
  profiles,
  trainingPlans,
  users,
} from "@repo/db/schema";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { describe, expect, it } from "vitest";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { publicShareRouter } from "../public-share";

const createdAt = new Date("2026-08-20T12:00:00.000Z");
const activityPlanStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "20000000-0000-4000-8000-000000000001",
      name: "Main",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "%FTP", intensity: 70 }],
    },
  ],
});
type SeedState = {
  profileId: string;
  publicActivityId: string;
  privateActivityId: string;
  publicActivityPlanId: string;
  privateActivityPlanId: string;
  publicRouteId: string;
  privateRouteId: string;
  publicTrainingPlanId: string;
  privateTrainingPlanId: string;
};
function createPublicCaller(db: DrizzleDbClient) {
  return publicShareRouter.createCaller({
    auth: {
      lookupInput: { clientType: "web", headers: new Headers() },
      session: null,
    },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: null,
    trpcSource: "vitest-live-db",
  } as never);
}
async function seedPublicShareEntities(db: DrizzleDbClient): Promise<SeedState> {
  const profileId = randomUUID();
  const email = `${profileId}@public-share-visibility.test`;
  await db.insert(users).values({
    id: profileId,
    name: "Public Share Owner",
    email,
    emailVerified: true,
    createdAt,
    updatedAt: createdAt,
  });
  await db.insert(profiles).values({
    id: profileId,
    created_at: createdAt,
    updated_at: createdAt,
    email,
    full_name: "Public Share Owner",
    username: `public-share-${profileId.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
    planning_timezone: "UTC",
  });
  const publicActivityPlanId = randomUUID();
  const privateActivityPlanId = randomUUID();
  await db.insert(activityPlans).values([
    {
      id: publicActivityPlanId,
      profile_id: profileId,
      name: "Public Activity Plan",
      structure: activityPlanStructure,
      structure_hash: activityPlanStructureHash(activityPlanStructure),
      semantic_hash: activityPlanSemanticHash({
        structure: activityPlanStructure,
        trainingIntent: "general_maintenance",
      }),
      content_visibility: "public",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: privateActivityPlanId,
      profile_id: profileId,
      name: "Private Activity Plan",
      structure: activityPlanStructure,
      structure_hash: activityPlanStructureHash(activityPlanStructure),
      semantic_hash: activityPlanSemanticHash({
        structure: activityPlanStructure,
        trainingIntent: "general_maintenance",
      }),
      content_visibility: "private",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ]);
  const publicTrainingPlanId = randomUUID();
  const privateTrainingPlanId = randomUUID();
  const trainingStructure = (id: string, activityPlanId: string) => ({
    id,
    version: 1 as const,
    plan_preferences: {
      weekly_session_count: 1,
      target_weekly_duration_minutes: null,
      maximum_session_duration_minutes: null,
      preferred_weekdays: [3],
      rest_days: [],
      progression_style: null,
      recovery_priority: null,
    },
    sessions: [
      {
        id: randomUUID(),
        offset_days: 0,
        activity_plan_id: activityPlanId,
        demand: {
          activity_category: "bike" as const,
          training_intent: "aerobic_base" as const,
          target_duration_minutes: null,
          target_common_load: null,
          importance: "normal" as const,
        },
      },
    ],
  });
  const publicTrainingStructure = trainingStructure(publicTrainingPlanId, publicActivityPlanId);
  const privateTrainingStructure = trainingStructure(privateTrainingPlanId, privateActivityPlanId);
  await db.insert(trainingPlans).values([
    {
      id: publicTrainingPlanId,
      profile_id: profileId,
      name: "Public Training Plan",
      structure: publicTrainingStructure,
      structure_hash: activityPlanStructureHash(publicTrainingStructure),
      content_visibility: "public",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: privateTrainingPlanId,
      profile_id: profileId,
      name: "Private Training Plan",
      structure: privateTrainingStructure,
      structure_hash: activityPlanStructureHash(privateTrainingStructure),
      content_visibility: "private",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ]);
  const publicRouteId = randomUUID();
  const privateRouteId = randomUUID();
  await db.insert(activityRoutes).values([
    {
      id: publicRouteId,
      profile_id: profileId,
      name: "Public Route",
      description: "Public route description",
      file_path: `${publicRouteId}.gpx`,
      total_distance: 5000,
      polyline: "encoded-public-route",
      is_public: true,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: privateRouteId,
      profile_id: profileId,
      name: "Private Route",
      file_path: `${privateRouteId}.gpx`,
      total_distance: 5000,
      polyline: "encoded-private-route",
      is_public: false,
      created_at: createdAt,
      updated_at: createdAt,
    },
  ]);
  const publicActivityId = randomUUID();
  const privateActivityId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(activities).values([
      {
        id: publicActivityId,
        profile_id: profileId,
        name: "Public Activity",
        started_at: createdAt,
        finished_at: new Date(createdAt.getTime() + 3600000),
        content_visibility: "public",
        elapsed_ms: 3600000,
        timing_coverage: "unavailable",
        parser_version: "public-share-test-v1",
        decoded_contract_version: "public-share-test-v1",
        materializer_version: "public-share-test-v1",
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        id: privateActivityId,
        profile_id: profileId,
        name: "Private Activity",
        started_at: createdAt,
        finished_at: new Date(createdAt.getTime() + 3600000),
        content_visibility: "private",
        elapsed_ms: 3600000,
        timing_coverage: "unavailable",
        parser_version: "public-share-test-v1",
        decoded_contract_version: "public-share-test-v1",
        materializer_version: "public-share-test-v1",
        created_at: createdAt,
        updated_at: createdAt,
      },
    ]);
    await tx.insert(activitySegments).values(
      [publicActivityId, privateActivityId].map((activityId) => ({
        id: randomUUID(),
        activity_id: activityId,
        profile_id: profileId,
        ordinal: 0,
        role: "activity" as const,
        activity_category: "bike" as const,
        start_offset_ms: 0,
        end_offset_ms: 3600000,
        summary: {
          version: 1,
          timing: { timingCoverage: "unavailable", activeMs: null, movingMs: null },
        },
        summary_version: 1,
        timing_coverage: "unavailable" as const,
        parser_version: "public-share-test-v1",
        materializer_version: "public-share-test-v1",
        created_at: createdAt,
      })),
    );
  });
  return {
    profileId,
    publicActivityId,
    privateActivityId,
    publicActivityPlanId,
    privateActivityPlanId,
    publicTrainingPlanId,
    privateTrainingPlanId,
    publicRouteId,
    privateRouteId,
  };
}
async function assertVisibility(
  procedure: "activity" | "activityPlan" | "trainingPlan" | "route",
  publicKey: keyof SeedState,
  privateKey: keyof SeedState,
) {
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "public_share_visibility",
    async (pool, connectionString) => {
      await bootstrapSupabaseSchemas(pool);
      for (const migration of requireFreshBaseline().migrationPaths)
        await applySqlFile(pool, migration);
      const client = createDbClient({ url: connectionString });
      try {
        const seeded = await seedPublicShareEntities(client.db);
        const caller = createPublicCaller(client.db);
        await expect(caller[procedure]({ id: seeded[publicKey] })).resolves.toMatchObject({
          id: seeded[publicKey],
        });
        await expect(caller[procedure]({ id: seeded[privateKey] })).resolves.toBeNull();
        await expect(caller[procedure]({ id: randomUUID() })).resolves.toBeNull();
      } finally {
        await client.close();
      }
    },
  );
}

describe("public share visibility boundary", () => {
  it("returns only public activities and hides private and missing ids", async () => {
    await assertVisibility("activity", "publicActivityId", "privateActivityId");
  }, 60_000);
  it("returns only public activity plans and hides private and missing ids", async () => {
    await assertVisibility("activityPlan", "publicActivityPlanId", "privateActivityPlanId");
  }, 60_000);
  it("returns only public training plans and hides private and missing ids", async () => {
    await assertVisibility("trainingPlan", "publicTrainingPlanId", "privateTrainingPlanId");
  }, 60_000);
  it("returns only public routes and hides private and missing ids", async () => {
    await assertVisibility("route", "publicRouteId", "privateRouteId");
  }, 60_000);
});
