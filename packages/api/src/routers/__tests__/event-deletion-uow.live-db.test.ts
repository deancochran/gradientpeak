import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  contentAccessGrants,
  events,
  integrations,
  profiles,
  providerSyncJobs,
  users,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  createEventCompletionRepository,
  createProviderSyncRepository,
} from "../../infrastructure/repositories";
import { createContentAccessPermissions } from "../../permissions/content-access";

const seededProfileIds: string[] = [];

async function seedDeletionTarget() {
  const profileId = randomUUID();
  const eventId = randomUUID();
  const integrationId = randomUUID();
  const grantId = randomUUID();
  const now = new Date();
  const startsAt = new Date("2026-08-01T08:00:00.000Z");
  const email = `${profileId}@event-delete-uow.test`;
  seededProfileIds.push(profileId);

  await db.insert(users).values({
    id: profileId,
    email,
    emailVerified: true,
    name: "Event deletion UOW test",
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    is_public: false,
    planning_timezone: "UTC",
    created_at: now,
    updated_at: now,
  });
  await db.insert(events).values({
    id: eventId,
    profile_id: profileId,
    event_type: "planned",
    status: "scheduled",
    title: "Transactional deletion target",
    all_day: false,
    timezone: "UTC",
    starts_at: startsAt,
    scheduled_date: "2026-08-01",
    created_at: now,
    updated_at: now,
  });
  await db.insert(contentAccessGrants).values({
    id: grantId,
    content_type: "activity_plan",
    content_id: randomUUID(),
    grantee_profile_id: profileId,
    actor_profile_id: profileId,
    access_level: "read",
    source_type: "event",
    source_id: eventId,
  });
  await db.insert(integrations).values({
    id: integrationId,
    profile_id: profileId,
    provider: "wahoo",
    external_id: randomUUID(),
    created_at: now,
    updated_at: now,
  });

  return {
    anchorEvent: {
      id: eventId,
      series_id: null,
      starts_at: startsAt.toISOString(),
      training_plan_id: null,
      updated_at: now.toISOString(),
    },
    eventId,
    grantId,
    integrationId,
    profileId,
  };
}

function enqueueInput(input: { eventId: string; integrationId: string; profileId: string }) {
  return {
    dedupeKey: `wahoo:unsync:event:${input.eventId}`,
    integrationId: input.integrationId,
    internalResourceId: input.eventId,
    jobType: "wahoo.unsync_event",
    operation: "unsync",
    payload: { eventId: input.eventId, operation: "unsync" },
    profileId: input.profileId,
    provider: "wahoo" as const,
    resourceKind: "event" as const,
    runAt: new Date().toISOString(),
    syncLaneKey: `wahoo:${input.integrationId}:event:${input.eventId}`,
  };
}

afterEach(async () => {
  while (seededProfileIds.length > 0) {
    const profileId = seededProfileIds.pop();
    if (profileId) await db.delete(users).where(eq(users.id, profileId));
  }
});

afterAll(async () => pool.end());

describe("event deletion unit of work", () => {
  it("rolls back grant revocation and outbox enqueue when the unit of work fails", async () => {
    const target = await seedDeletionTarget();
    const repository = createEventCompletionRepository(db);
    const providerSyncRepository = createProviderSyncRepository({ db });

    await expect(
      repository.deleteOwnedEventsForScope({
        anchorEvent: target.anchorEvent,
        profileId: target.profileId,
        scope: "single",
        beforeDelete: async ({ candidates, tx }) => {
          expect(candidates.map((candidate) => candidate.id)).toEqual([target.eventId]);
          await createContentAccessPermissions(tx).revokeEventGrants(target.eventId);
          await providerSyncRepository.enqueueJobInTransaction(tx, enqueueInput(target));
          throw new Error("force unit-of-work rollback");
        },
      }),
    ).rejects.toThrow("force unit-of-work rollback");

    expect(await db.select().from(events).where(eq(events.id, target.eventId))).toHaveLength(1);
    const [grant] = await db
      .select({ revokedAt: contentAccessGrants.revoked_at })
      .from(contentAccessGrants)
      .where(eq(contentAccessGrants.id, target.grantId));
    expect(grant?.revokedAt).toBeNull();
    expect(
      await db
        .select()
        .from(providerSyncJobs)
        .where(
          and(
            eq(providerSyncJobs.profile_id, target.profileId),
            eq(providerSyncJobs.internal_resource_id, target.eventId),
          ),
        ),
    ).toEqual([]);
  });

  it("commits grant revocation, outbox enqueue, and exact event deletion together", async () => {
    const target = await seedDeletionTarget();
    const repository = createEventCompletionRepository(db);
    const providerSyncRepository = createProviderSyncRepository({ db });

    const deleted = await repository.deleteOwnedEventsForScope({
      anchorEvent: target.anchorEvent,
      profileId: target.profileId,
      scope: "single",
      beforeDelete: async ({ tx }) => {
        await createContentAccessPermissions(tx).revokeEventGrants(target.eventId);
        await providerSyncRepository.enqueueJobInTransaction(tx, enqueueInput(target));
      },
    });

    expect(deleted.map((candidate) => candidate.id)).toEqual([target.eventId]);
    expect(await db.select().from(events).where(eq(events.id, target.eventId))).toEqual([]);
    const [grant] = await db
      .select({ revokedAt: contentAccessGrants.revoked_at })
      .from(contentAccessGrants)
      .where(eq(contentAccessGrants.id, target.grantId));
    expect(grant?.revokedAt).toBeInstanceOf(Date);
    const [job] = await db
      .select()
      .from(providerSyncJobs)
      .where(
        and(
          eq(providerSyncJobs.profile_id, target.profileId),
          eq(providerSyncJobs.internal_resource_id, target.eventId),
        ),
      );
    expect(job).toMatchObject({
      operation: "unsync",
      status: "queued",
      resource_kind: "event",
    });
  });
});
