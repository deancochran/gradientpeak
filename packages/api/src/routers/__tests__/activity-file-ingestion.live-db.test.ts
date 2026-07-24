import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { activityFileIngestions, profiles, users } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  ActivityFileIngestionClaimLostError,
  createActivityFileIngestion,
  markProcessing,
  markUploaded,
} from "../../application/activity-file-ingestion/ingestion-state";

const profileIds: string[] = [];

async function seedProfile() {
  const id = randomUUID();
  const email = `${id}@gradientpeak.test`;
  const now = new Date();
  await db.insert(users).values({
    id,
    name: "Ingestion Live DB Test",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: "Ingestion Live DB Test",
    username: `ingestion-${id.slice(0, 8)}`,
    onboarded: true,
    is_public: false,
    planning_timezone: "UTC",
    created_at: now,
    updated_at: now,
  });
  profileIds.push(id);
  return id;
}

afterEach(async () => {
  while (profileIds.length) {
    const id = profileIds.pop();
    if (!id) continue;
    await db.delete(profiles).where(eq(profiles.id, id));
    await db.delete(users).where(eq(users.id, id));
  }
});

afterAll(async () => {
  await pool.end();
});

describe("activity file ingestion lease fencing", () => {
  it("reclaims only an expired processing lease using the database clock", async () => {
    const profileId = await seedProfile();
    const ingestion = await createActivityFileIngestion(db, {
      activityId: null,
      profileId,
      source: "manual_import",
      operationKey: `manual_import:${randomUUID()}`,
    });
    await markUploaded(db, { id: ingestion.id, profileId });
    await db
      .update(activityFileIngestions)
      .set({
        status: "processing",
        claim_token: randomUUID(),
        lease_expires_at: new Date(Date.now() - 1_000),
      })
      .where(
        and(
          eq(activityFileIngestions.id, ingestion.id),
          eq(activityFileIngestions.profile_id, profileId),
        ),
      );

    const reclaimed = await markProcessing(db, { id: ingestion.id, profileId });
    expect(reclaimed.claim_token).not.toBeNull();
    expect(reclaimed.attempt_count).toBe(1);

    await expect(markProcessing(db, { id: ingestion.id, profileId })).rejects.toBeInstanceOf(
      ActivityFileIngestionClaimLostError,
    );
  });

  it("reuses one nullable row for concurrent same-operation creation", async () => {
    const profileId = await seedProfile();
    const operationKey = `manual_import:${randomUUID()}`;
    const [first, second] = await Promise.all([
      createActivityFileIngestion(db, {
        activityId: null,
        profileId,
        source: "manual_import",
        operationKey,
      }),
      createActivityFileIngestion(db, {
        activityId: null,
        profileId,
        source: "manual_import",
        operationKey,
      }),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.activity_id).toBeNull();
  });
});
