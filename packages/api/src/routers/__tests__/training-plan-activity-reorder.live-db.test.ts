import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { events, profiles, trainingPlans, users } from "@repo/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { trainingPlansRouter } from "../planning/training-plans";

const seededUserIds: string[] = [];
const structureHash = `v1:sha256:${"0".repeat(64)}`;

function createCaller(profileId: string) {
  return trainingPlansRouter.createCaller({
    db,
    session: { user: { id: profileId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest-live-db",
    // biome-ignore lint/suspicious/noExplicitAny: the live-DB caller only needs this bounded context fixture.
  } as any);
}

async function seedUser(label: string) {
  const id = randomUUID();
  const email = `${id}@gradientpeak.test`;
  const now = new Date();
  seededUserIds.push(id);
  await db.insert(users).values({
    id,
    name: label,
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `reorder-${id.slice(0, 8)}`,
    onboarded: true,
    is_public: false,
    planning_timezone: "UTC",
  });
  return id;
}

async function seedPlanFixture() {
  const ownerId = await seedUser("Activity reorder owner");
  const otherUserId = await seedUser("Activity reorder other user");
  const activityPlanResult = await db.execute(sql<{ id: string }>`
    select id from activity_plans order by created_at limit 1
  `);
  const activityPlanId = activityPlanResult.rows[0]?.id as string | undefined;
  if (!activityPlanId) throw new Error("Expected a seeded activity plan for live-DB tests");
  const planId = randomUUID();
  const otherPlanId = randomUUID();
  const firstEventId = randomUUID();
  const secondEventId = randomUUID();
  const eventIds = [firstEventId, secondEventId];

  await db.insert(trainingPlans).values([
    {
      id: planId,
      profile_id: ownerId,
      name: "Reorder plan",
      structure: {
        version: 1,
        sessions: [{ activity_plan_id: activityPlanId, offset_days: 0 }],
      },
      structure_hash: structureHash,
    },
    {
      id: otherPlanId,
      profile_id: ownerId,
      name: "Other plan",
      structure: {
        version: 1,
        sessions: [{ activity_plan_id: activityPlanId, offset_days: 0 }],
      },
      structure_hash: structureHash,
    },
  ]);
  await db.insert(events).values([
    {
      id: firstEventId,
      profile_id: ownerId,
      event_type: "planned",
      status: "scheduled",
      title: "Activity one",
      all_day: true,
      timezone: "UTC",
      starts_at: new Date("2026-08-01T00:00:00.000Z"),
      ends_at: new Date("2026-08-02T00:00:00.000Z"),
      scheduled_date: "2026-08-01",
      activity_plan_id: activityPlanId,
      training_plan_id: planId,
    },
    {
      id: secondEventId,
      profile_id: ownerId,
      event_type: "planned",
      status: "scheduled",
      title: "Activity two",
      all_day: true,
      timezone: "UTC",
      starts_at: new Date("2026-08-02T00:00:00.000Z"),
      ends_at: new Date("2026-08-03T00:00:00.000Z"),
      scheduled_date: "2026-08-02",
      activity_plan_id: activityPlanId,
      training_plan_id: planId,
    },
  ]);

  return { eventIds, firstEventId, otherPlanId, otherUserId, ownerId, planId, secondEventId };
}

async function readEventDates(eventIds: string[]) {
  const rows = await db
    .select({
      ends_at: events.ends_at,
      id: events.id,
      scheduled_date: events.scheduled_date,
      starts_at: events.starts_at,
      timezone: events.timezone,
    })
    .from(events)
    .where(inArray(events.id, eventIds));
  return new Map(rows.map((row) => [row.id, row]));
}

function localWallTime(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

afterEach(async () => {
  while (seededUserIds.length > 0) {
    const userId = seededUserIds.pop();
    if (userId) await db.delete(users).where(eq(users.id, userId));
  }
});

afterAll(async () => {
  await pool.end();
});

describe("trainingPlans.reorderActivities live DB", () => {
  it("updates every requested activity in one mutation", async () => {
    const fixture = await seedPlanFixture();
    const result = await createCaller(fixture.ownerId).reorderActivities({
      training_plan_id: fixture.planId,
      changes: [
        {
          event_id: fixture.firstEventId,
          expected_scheduled_date: "2026-08-01",
          requested_scheduled_date: "2026-08-03",
        },
        {
          event_id: fixture.secondEventId,
          expected_scheduled_date: "2026-08-02",
          requested_scheduled_date: "2026-08-04",
        },
      ],
    });
    const dates = await readEventDates(fixture.eventIds);

    expect(result).toEqual({
      affected_count: 2,
      affected_event_ids: expect.arrayContaining(fixture.eventIds),
    });
    expect(dates.get(fixture.firstEventId)?.scheduled_date).toBe("2026-08-03");
    expect(dates.get(fixture.firstEventId)?.starts_at.toISOString()).toBe(
      "2026-08-03T00:00:00.000Z",
    );
    expect(dates.get(fixture.secondEventId)?.scheduled_date).toBe("2026-08-04");
  });

  it("preserves New York start and end wall times across spring-forward", async () => {
    const fixture = await seedPlanFixture();
    await db
      .update(events)
      .set({
        all_day: false,
        ends_at: new Date("2026-03-07T16:00:00.000Z"),
        scheduled_date: "2026-03-07",
        starts_at: new Date("2026-03-07T14:30:00.000Z"),
        timezone: "America/New_York",
      })
      .where(eq(events.id, fixture.firstEventId));

    await createCaller(fixture.ownerId).reorderActivities({
      training_plan_id: fixture.planId,
      changes: [
        {
          event_id: fixture.firstEventId,
          expected_scheduled_date: "2026-03-07",
          requested_scheduled_date: "2026-03-09",
        },
      ],
    });
    const event = (await readEventDates([fixture.firstEventId])).get(fixture.firstEventId);

    expect(event?.scheduled_date).toBe("2026-03-09");
    expect(event?.starts_at.toISOString()).toBe("2026-03-09T13:30:00.000Z");
    expect(event?.ends_at?.toISOString()).toBe("2026-03-09T15:00:00.000Z");
    expect(localWallTime(event?.starts_at as Date, "America/New_York")).toBe("2026-03-09T09:30");
    expect(localWallTime(event?.ends_at as Date, "America/New_York")).toBe("2026-03-09T11:00");
  });

  it("preserves New York start and end wall times across fall-back", async () => {
    const fixture = await seedPlanFixture();
    await db
      .update(events)
      .set({
        all_day: false,
        ends_at: new Date("2026-10-31T15:00:00.000Z"),
        scheduled_date: "2026-10-31",
        starts_at: new Date("2026-10-31T13:30:00.000Z"),
        timezone: "America/New_York",
      })
      .where(eq(events.id, fixture.firstEventId));

    await createCaller(fixture.ownerId).reorderActivities({
      training_plan_id: fixture.planId,
      changes: [
        {
          event_id: fixture.firstEventId,
          expected_scheduled_date: "2026-10-31",
          requested_scheduled_date: "2026-11-02",
        },
      ],
    });
    const event = (await readEventDates([fixture.firstEventId])).get(fixture.firstEventId);

    expect(event?.scheduled_date).toBe("2026-11-02");
    expect(event?.starts_at.toISOString()).toBe("2026-11-02T14:30:00.000Z");
    expect(event?.ends_at?.toISOString()).toBe("2026-11-02T16:00:00.000Z");
    expect(localWallTime(event?.starts_at as Date, "America/New_York")).toBe("2026-11-02T09:30");
    expect(localWallTime(event?.ends_at as Date, "America/New_York")).toBe("2026-11-02T11:00");
  });

  it("rejects a target date whose New York end wall time falls in the spring gap", async () => {
    const fixture = await seedPlanFixture();
    await db
      .update(events)
      .set({
        all_day: false,
        ends_at: new Date("2026-03-07T07:30:00.000Z"),
        scheduled_date: "2026-03-07",
        starts_at: new Date("2026-03-07T06:30:00.000Z"),
        timezone: "America/New_York",
      })
      .where(eq(events.id, fixture.firstEventId));

    await expect(
      createCaller(fixture.ownerId).reorderActivities({
        training_plan_id: fixture.planId,
        changes: [
          {
            event_id: fixture.firstEventId,
            expected_scheduled_date: "2026-03-07",
            requested_scheduled_date: "2026-03-08",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const event = (await readEventDates([fixture.firstEventId])).get(fixture.firstEventId);
    expect(event?.scheduled_date).toBe("2026-03-07");
    expect(event?.starts_at.toISOString()).toBe("2026-03-07T06:30:00.000Z");
    expect(event?.ends_at?.toISOString()).toBe("2026-03-07T07:30:00.000Z");
  });

  it("rejects a target date whose New York start wall time falls in the fall fold", async () => {
    const fixture = await seedPlanFixture();
    await db
      .update(events)
      .set({
        all_day: false,
        ends_at: null,
        scheduled_date: "2026-10-31",
        starts_at: new Date("2026-10-31T05:30:00.000Z"),
        timezone: "America/New_York",
      })
      .where(eq(events.id, fixture.firstEventId));

    await expect(
      createCaller(fixture.ownerId).reorderActivities({
        training_plan_id: fixture.planId,
        changes: [
          {
            event_id: fixture.firstEventId,
            expected_scheduled_date: "2026-10-31",
            requested_scheduled_date: "2026-11-01",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const event = (await readEventDates([fixture.firstEventId])).get(fixture.firstEventId);
    expect(event?.scheduled_date).toBe("2026-10-31");
    expect(event?.starts_at.toISOString()).toBe("2026-10-31T05:30:00.000Z");
    expect(event?.ends_at).toBeNull();
  });

  it("does not let another actor manage the plan", async () => {
    const fixture = await seedPlanFixture();

    await expect(
      createCaller(fixture.otherUserId).reorderActivities({
        training_plan_id: fixture.planId,
        changes: [
          {
            event_id: fixture.firstEventId,
            expected_scheduled_date: "2026-08-01",
            requested_scheduled_date: "2026-08-03",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an event from another training plan", async () => {
    const fixture = await seedPlanFixture();

    await expect(
      createCaller(fixture.ownerId).reorderActivities({
        training_plan_id: fixture.otherPlanId,
        changes: [
          {
            event_id: fixture.firstEventId,
            expected_scheduled_date: "2026-08-01",
            requested_scheduled_date: "2026-08-03",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns CONFLICT when an expected date is stale", async () => {
    const fixture = await seedPlanFixture();

    await expect(
      createCaller(fixture.ownerId).reorderActivities({
        training_plan_id: fixture.planId,
        changes: [
          {
            event_id: fixture.firstEventId,
            expected_scheduled_date: "2026-07-31",
            requested_scheduled_date: "2026-08-03",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rolls back matched updates when any requested activity is stale", async () => {
    const fixture = await seedPlanFixture();

    await expect(
      createCaller(fixture.ownerId).reorderActivities({
        training_plan_id: fixture.planId,
        changes: [
          {
            event_id: fixture.firstEventId,
            expected_scheduled_date: "2026-08-01",
            requested_scheduled_date: "2026-08-03",
          },
          {
            event_id: fixture.secondEventId,
            expected_scheduled_date: "2026-07-31",
            requested_scheduled_date: "2026-08-04",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const dates = await readEventDates(fixture.eventIds);
    expect(dates.get(fixture.firstEventId)?.scheduled_date).toBe("2026-08-01");
    expect(dates.get(fixture.secondEventId)?.scheduled_date).toBe("2026-08-02");
  });
});
