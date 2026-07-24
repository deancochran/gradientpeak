import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { activityPlans, contentAccessGrants, follows, profiles, users } from "@repo/db/schema";
import { eq, ilike, inArray, or } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityPlansRouter } from "../activity-plans";

const createdAt = new Date("2026-07-01T12:00:00.000Z");
const expiredAt = new Date("2020-01-01T00:00:00.000Z");
const activityPlanStructure = {
  version: 3,
  segments: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      role: "activity",
      category: "bike",
      name: "Bike",
      intervals: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              name: "Ride",
              duration: { type: "time", seconds: 1800 },
              targets: [{ type: "%FTP", intensity: 75 }],
            },
          ],
        },
      ],
    },
  ],
};
const structureHash = `v1:sha256:${"0".repeat(64)}`;

function createCaller(profileId: string) {
  return activityPlansRouter.createCaller({
    db,
    session: { user: { id: profileId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest-live-db",
    // biome-ignore lint/suspicious/noExplicitAny: bounded live-DB caller context fixture.
  } as any);
}

async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@activity-plan-access.test`;
  await db.insert(users).values({
    id,
    name: label,
    email,
    emailVerified: true,
    createdAt,
    updatedAt: createdAt,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `plan-access-${id.slice(0, 8)}`,
    onboarded: true,
    is_public: false,
    planning_timezone: "UTC",
    created_at: createdAt,
    updated_at: createdAt,
  });
  return id;
}

async function seedPlan(input: {
  ownerId?: string;
  visibility: "private" | "followers" | "public";
  system?: boolean;
}) {
  const id = randomUUID();
  await db.insert(activityPlans).values({
    id,
    profile_id: input.system ? null : input.ownerId,
    name: `Access ${id}`,
    description: null,
    notes: null,
    structure: activityPlanStructure,
    structure_hash: structureHash,
    gps_recording_enabled: true,
    template_visibility: input.system ? "public" : input.visibility,
    content_visibility: input.system ? "public" : input.visibility,
    is_system_template: input.system ?? false,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return id;
}

async function visibleIds(viewerId: string, ids: string[]) {
  const result = await createCaller(viewerId).getManyByIds({ ids });
  return result.items.map((item) => item.id);
}

async function cleanupSeededProfiles() {
  const seededProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(ilike(profiles.email, "%@activity-plan-access.test"));
  const profileIds = seededProfiles.map((profile) => profile.id);
  if (profileIds.length === 0) return;

  await db
    .delete(follows)
    .where(or(inArray(follows.follower_id, profileIds), inArray(follows.following_id, profileIds)));
  await db.delete(users).where(inArray(users.id, profileIds));
}

beforeEach(cleanupSeededProfiles);

afterEach(async () => {
  await cleanupSeededProfiles();
});

afterAll(async () => {
  await pool.end();
});

describe("activityPlans.getManyByIds access live DB", () => {
  it("returns owner, public, system, and accepted-follower plans but not pending-follower plans", async () => {
    const ownerId = await seedProfile("Plan access owner");
    const viewerId = await seedProfile("Plan access viewer");
    const ownPlanId = await seedPlan({ ownerId: viewerId, visibility: "private" });
    const publicPlanId = await seedPlan({ ownerId, visibility: "public" });
    const systemPlanId = await seedPlan({ visibility: "public", system: true });
    const acceptedFollowerPlanId = await seedPlan({ ownerId, visibility: "followers" });
    const pendingOwnerId = await seedProfile("Plan access pending owner");
    const pendingFollowerPlanId = await seedPlan({
      ownerId: pendingOwnerId,
      visibility: "followers",
    });

    await db.insert(follows).values([
      {
        follower_id: viewerId,
        following_id: ownerId,
        status: "accepted",
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        follower_id: viewerId,
        following_id: pendingOwnerId,
        status: "pending",
        created_at: createdAt,
        updated_at: createdAt,
      },
    ]);

    await expect(
      visibleIds(viewerId, [
        pendingFollowerPlanId,
        ownPlanId,
        publicPlanId,
        systemPlanId,
        acceptedFollowerPlanId,
      ]),
    ).resolves.toEqual([ownPlanId, publicPlanId, systemPlanId, acceptedFollowerPlanId]);
  });

  it("returns only private plans with an active full-read grant", async () => {
    const ownerId = await seedProfile("Plan grant owner");
    const viewerId = await seedProfile("Plan grant viewer");
    const activePlanId = await seedPlan({ ownerId, visibility: "private" });
    const revokedPlanId = await seedPlan({ ownerId, visibility: "private" });
    const expiredPlanId = await seedPlan({ ownerId, visibility: "private" });
    const geometryPlanId = await seedPlan({ ownerId, visibility: "private" });

    await db.insert(contentAccessGrants).values([
      {
        content_type: "activity_plan",
        content_id: activePlanId,
        grantee_profile_id: viewerId,
        actor_profile_id: ownerId,
        access_level: "read",
        source_type: "event",
        source_id: randomUUID(),
        revoked_at: null,
        expires_at: null,
        created_at: createdAt,
      },
      {
        content_type: "activity_plan",
        content_id: revokedPlanId,
        grantee_profile_id: viewerId,
        actor_profile_id: ownerId,
        access_level: "read",
        source_type: "event",
        source_id: randomUUID(),
        revoked_at: createdAt,
        expires_at: null,
        created_at: createdAt,
      },
      {
        content_type: "activity_plan",
        content_id: expiredPlanId,
        grantee_profile_id: viewerId,
        actor_profile_id: ownerId,
        access_level: "read",
        source_type: "event",
        source_id: randomUUID(),
        revoked_at: null,
        expires_at: expiredAt,
        created_at: createdAt,
      },
      {
        content_type: "activity_plan",
        content_id: geometryPlanId,
        grantee_profile_id: viewerId,
        actor_profile_id: ownerId,
        access_level: "read_geometry",
        source_type: "event",
        source_id: randomUUID(),
        revoked_at: null,
        expires_at: null,
        created_at: createdAt,
      },
    ]);

    await expect(
      visibleIds(viewerId, [revokedPlanId, expiredPlanId, geometryPlanId, activePlanId]),
    ).resolves.toEqual([activePlanId]);
  });

  it("uses visibility at query time after a follower-visible plan becomes private", async () => {
    const ownerId = await seedProfile("Plan state-change owner");
    const viewerId = await seedProfile("Plan state-change viewer");
    const planId = await seedPlan({ ownerId, visibility: "followers" });
    await db.insert(follows).values({
      follower_id: viewerId,
      following_id: ownerId,
      status: "accepted",
      created_at: createdAt,
      updated_at: createdAt,
    });

    await db
      .update(activityPlans)
      .set({ content_visibility: "private", updated_at: new Date("2026-07-01T12:01:00.000Z") })
      .where(eq(activityPlans.id, planId));

    await expect(visibleIds(viewerId, [planId])).resolves.toEqual([]);
  });
});
