import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityPlans,
  activityRoutes,
  activitySegments,
  profiles,
  trainingPlans,
  users,
} from "@repo/db/schema";
import { eq, ilike, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { publicShareRouter } from "../public-share";

const createdAt = new Date("2026-08-20T12:00:00.000Z");
const activityPlanStructure = {
  version: 3,
  activity_category: "bike",
  segments: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      role: "activity",
      name: "Ride",
      intervals: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              name: "Steady",
              duration: { type: "time", seconds: 1800 },
              targets: [{ type: "%FTP", intensity: 70 }],
            },
          ],
        },
      ],
    },
  ],
} as const;
const structureHash = `v1:sha256:${"0".repeat(64)}`;

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

let seeded: SeedState | undefined;

function createPublicCaller() {
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

async function seedPublicShareEntities(): Promise<SeedState> {
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
      structure_hash: structureHash,
      content_visibility: "public",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: privateActivityPlanId,
      profile_id: profileId,
      name: "Private Activity Plan",
      structure: activityPlanStructure,
      structure_hash: structureHash,
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
    sessions: [{ offset_days: 0, activity_plan_id: activityPlanId }],
  });
  await db.insert(trainingPlans).values([
    {
      id: publicTrainingPlanId,
      profile_id: profileId,
      name: "Public Training Plan",
      structure: trainingStructure(publicTrainingPlanId, publicActivityPlanId),
      structure_hash: structureHash,
      content_visibility: "public",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: privateTrainingPlanId,
      profile_id: profileId,
      name: "Private Training Plan",
      structure: trainingStructure(privateTrainingPlanId, privateActivityPlanId),
      structure_hash: structureHash,
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
        finished_at: new Date(createdAt.getTime() + 3_600_000),
        content_visibility: "public",
        elapsed_ms: 3_600_000,
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
        finished_at: new Date(createdAt.getTime() + 3_600_000),
        content_visibility: "private",
        elapsed_ms: 3_600_000,
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
        end_offset_ms: 3_600_000,
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

async function cleanupPublicShareProfiles() {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(ilike(profiles.email, "%@public-share-visibility.test"));
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) await db.delete(users).where(inArray(users.id, ids));
}

beforeEach(async () => {
  await cleanupPublicShareProfiles();
  seeded = await seedPublicShareEntities();
});

afterEach(async () => {
  if (seeded) await db.delete(users).where(eq(users.id, seeded.profileId));
  await cleanupPublicShareProfiles();
  seeded = undefined;
});

afterAll(async () => {
  await pool.end();
});

describe("public share visibility boundary", () => {
  it("returns only public activities and hides private and missing ids", async () => {
    if (!seeded) throw new Error("public share live-DB seed was not created");
    const caller = createPublicCaller();

    await expect(caller.activity({ id: seeded.publicActivityId })).resolves.toMatchObject({
      id: seeded.publicActivityId,
    });
    await expect(caller.activity({ id: seeded.privateActivityId })).resolves.toBeNull();
    await expect(caller.activity({ id: randomUUID() })).resolves.toBeNull();
  });

  it("returns only public activity plans and hides private and missing ids", async () => {
    if (!seeded) throw new Error("public share live-DB seed was not created");
    const caller = createPublicCaller();

    await expect(caller.activityPlan({ id: seeded.publicActivityPlanId })).resolves.toMatchObject({
      id: seeded.publicActivityPlanId,
    });
    await expect(caller.activityPlan({ id: seeded.privateActivityPlanId })).resolves.toBeNull();
    await expect(caller.activityPlan({ id: randomUUID() })).resolves.toBeNull();
  });

  it("returns only public training plans and hides private and missing ids", async () => {
    if (!seeded) throw new Error("public share live-DB seed was not created");
    const caller = createPublicCaller();

    await expect(caller.trainingPlan({ id: seeded.publicTrainingPlanId })).resolves.toMatchObject({
      id: seeded.publicTrainingPlanId,
    });
    await expect(caller.trainingPlan({ id: seeded.privateTrainingPlanId })).resolves.toBeNull();
    await expect(caller.trainingPlan({ id: randomUUID() })).resolves.toBeNull();
  });

  it("returns only public routes and hides private and missing ids", async () => {
    if (!seeded) throw new Error("public share live-DB seed was not created");
    const caller = createPublicCaller();

    await expect(caller.route({ id: seeded.publicRouteId })).resolves.toMatchObject({
      id: seeded.publicRouteId,
    });
    await expect(caller.route({ id: seeded.privateRouteId })).resolves.toBeNull();
    await expect(caller.route({ id: randomUUID() })).resolves.toBeNull();
  });
});
