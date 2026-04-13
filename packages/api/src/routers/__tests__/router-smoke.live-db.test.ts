import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db, pool } from "@repo/db/client";
import { activityRoutes, events, profiles, users } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { eventsRouter } from "../events";
import { routesRouter } from "../routes";

type SeedState = {
  eventId?: string;
  profileId: string;
  routeId?: string;
  userId: string;
};

const seededStates: SeedState[] = [];

function createCallerContext(profileId: string, email: string) {
  return {
    db,
    session: {
      user: {
        id: profileId,
        email,
        emailVerified: true,
      },
    },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest-live-db",
  } as const;
}

async function seedUserProfile() {
  const userId = randomUUID();
  const email = `${userId}@gradientpeak.test`;
  const now = new Date();

  await db.insert(users).values({
    id: userId,
    name: "Live DB Test User",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(profiles).values({
    id: userId,
    created_at: now,
    updated_at: now,
    email,
    full_name: "Live DB Test User",
    username: `live-db-${userId.slice(0, 8)}`,
    onboarded: true,
    is_public: true,
  });

  const seedState: SeedState = {
    userId,
    profileId: userId,
  };
  seededStates.push(seedState);

  return {
    email,
    seedState,
  };
}

async function cleanupSeedState(seedState: SeedState) {
  if (seedState.eventId) {
    await db.delete(events).where(eq(events.id, seedState.eventId));
  }

  if (seedState.routeId) {
    await db.delete(activityRoutes).where(eq(activityRoutes.id, seedState.routeId));
  }

  await db.delete(profiles).where(eq(profiles.id, seedState.profileId));
  await db.delete(users).where(eq(users.id, seedState.userId));
}

afterEach(async () => {
  while (seededStates.length > 0) {
    const seedState = seededStates.pop();
    if (seedState) {
      await cleanupSeedState(seedState);
    }
  }
});

afterAll(async () => {
  await pool.end();
});

describe("router live-db smoke", () => {
  it("routes.list succeeds against the migrated local database", async () => {
    const { email, seedState } = await seedUserProfile();
    const routeId = randomUUID();
    seedState.routeId = routeId;

    await db.insert(activityRoutes).values({
      id: routeId,
      profile_id: seedState.profileId,
      name: "Live DB Route",
      description: "Route seeded for live DB smoke test.",
      activity_category: "run",
      file_path: `${seedState.profileId}/live-db-route.gpx`,
      total_distance: 6200,
      total_ascent: 88,
      total_descent: 80,
      source: "vitest-live-db",
      elevation_polyline: null,
      polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
      is_public: false,
      likes_count: 0,
      created_at: new Date("2026-04-01T09:00:00.000Z"),
      updated_at: new Date("2026-04-01T09:00:00.000Z"),
    });

    const caller = routesRouter.createCaller(
      createCallerContext(seedState.profileId, email) as any,
    );
    const result = await caller.list({ direction: "forward", limit: 20 });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: routeId,
          name: "Live DB Route",
          is_public: false,
          has_liked: false,
        }),
      ]),
    );
  });

  it("events.list succeeds against the migrated local database", async () => {
    const { email, seedState } = await seedUserProfile();
    const eventId = randomUUID();
    seedState.eventId = eventId;

    await db.insert(events).values({
      id: eventId,
      profile_id: seedState.profileId,
      event_type: "custom",
      status: "scheduled",
      title: "Live DB Calendar Event",
      description: "Event seeded for live DB smoke test.",
      all_day: false,
      timezone: "UTC",
      occurrence_key: `live-db-${eventId}`,
      starts_at: new Date("2026-04-02T07:30:00.000Z"),
      ends_at: new Date("2026-04-02T08:15:00.000Z"),
      scheduled_date: "2026-04-02",
      created_at: new Date("2026-04-01T09:00:00.000Z"),
      updated_at: new Date("2026-04-01T09:00:00.000Z"),
    });

    const caller = eventsRouter.createCaller(
      createCallerContext(seedState.profileId, email) as any,
    );
    const result = await caller.list({
      include_adhoc: true,
      limit: 20,
      date_from: "2026-04-01",
      date_to: "2026-04-03",
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: eventId,
          title: "Live DB Calendar Event",
          event_type: "custom",
          scheduled_date: "2026-04-02",
        }),
      ]),
    );
  });
});
