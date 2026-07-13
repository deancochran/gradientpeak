import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { integrations, profiles, providerSyncJobs, users } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createProviderSyncRepository } from "../../infrastructure/repositories";

const userIds: string[] = [];

async function seedOwner() {
  const userId = randomUUID();
  const integrationId = randomUUID();
  const now = new Date();
  userIds.push(userId);
  await db.insert(users).values({
    id: userId,
    email: `${userId}@gradientpeak.test`,
    emailVerified: true,
    name: "Provider Sync Claim Test",
  });
  await db.insert(profiles).values({
    created_at: now,
    email: `${userId}@gradientpeak.test`,
    id: userId,
    is_public: false,
    updated_at: now,
  });
  await db.insert(integrations).values({
    created_at: now,
    external_id: randomUUID(),
    id: integrationId,
    profile_id: userId,
    provider: "wahoo",
    updated_at: now,
  });
  return { integrationId, profileId: userId };
}

afterEach(async () => {
  const userId = userIds.pop();
  if (userId) await db.delete(users).where(eq(users.id, userId));
});

afterAll(async () => {
  await pool.end();
});

describe("provider sync PostgreSQL claims", () => {
  it("uses immutable idx as lane precedence and run_at only for head eligibility", async () => {
    const owner = await seedOwner();
    const repository = createProviderSyncRepository({ db });
    const base = Date.parse("2026-07-13T12:00:00.000Z");
    const headId = randomUUID();
    const laterId = randomUUID();
    await db.insert(providerSyncJobs).values([
      {
        attempt: 0,
        created_at: new Date(base),
        id: headId,
        integration_id: owner.integrationId,
        job_type: "wahoo.publish_event",
        payload: {},
        max_attempts: 3,
        priority: 100,
        profile_id: owner.profileId,
        provider: "wahoo",
        run_at: new Date(base + 60_000),
        sync_lane_key: "test-lane",
        status: "queued",
        updated_at: new Date(base),
      },
      {
        attempt: 0,
        created_at: new Date(base),
        id: laterId,
        integration_id: owner.integrationId,
        job_type: "wahoo.publish_event",
        payload: {},
        max_attempts: 3,
        priority: 1,
        profile_id: owner.profileId,
        provider: "wahoo",
        run_at: new Date(base - 60_000),
        sync_lane_key: "test-lane",
        status: "queued",
        updated_at: new Date(base),
      },
    ]);

    await expect(
      repository.claimDueJobs({
        limit: 2,
        lockExpiresAt: new Date(base + 300_000).toISOString(),
        now: new Date(base).toISOString(),
        provider: "wahoo",
        workerId: "eligibility-worker",
      }),
    ).resolves.toEqual([]);

    await db
      .update(providerSyncJobs)
      .set({ run_at: new Date(base - 30_000) })
      .where(eq(providerSyncJobs.id, headId));
    const claimed = await repository.claimDueJobs({
      limit: 2,
      lockExpiresAt: new Date(base + 300_000).toISOString(),
      now: new Date(base).toISOString(),
      provider: "wahoo",
      workerId: "ordering-worker",
    });
    expect(claimed.map((job) => job.id)).toEqual([headId]);
    expect(await repository.markJobSucceeded(headId, "ordering-worker")).toBe(true);

    const next = await repository.claimDueJobs({
      limit: 1,
      lockExpiresAt: new Date(base + 300_000).toISOString(),
      now: new Date(base).toISOString(),
      provider: "wahoo",
      workerId: "next-worker",
    });
    expect(next.map((job) => job.id)).toEqual([laterId]);
  });

  it("reclaims expired leases and fences the stale worker from finalizing", async () => {
    const owner = await seedOwner();
    const repository = createProviderSyncRepository({ db });
    const base = Date.parse("2026-07-13T13:00:00.000Z");
    const jobId = randomUUID();
    await db.insert(providerSyncJobs).values({
      attempt: 0,
      created_at: new Date(base),
      id: jobId,
      integration_id: owner.integrationId,
      job_type: "wahoo.publish_event",
      payload: {},
      max_attempts: 3,
      priority: 100,
      profile_id: owner.profileId,
      provider: "wahoo",
      run_at: new Date(base - 1_000),
      sync_lane_key: "lease-test-lane",
      status: "queued",
      updated_at: new Date(base),
    });

    const oldWorker = `old:${randomUUID()}`;
    const newWorker = `new:${randomUUID()}`;
    expect(oldWorker).not.toBe(newWorker);
    await repository.claimDueJobs({
      limit: 1,
      lockExpiresAt: new Date(base + 1_000).toISOString(),
      now: new Date(base).toISOString(),
      provider: "wahoo",
      workerId: oldWorker,
    });
    const reclaimed = await repository.claimDueJobs({
      limit: 1,
      lockExpiresAt: new Date(base + 20_000).toISOString(),
      now: new Date(base + 2_000).toISOString(),
      provider: "wahoo",
      workerId: newWorker,
    });
    expect(reclaimed[0]).toMatchObject({ id: jobId, staleLockRecovered: true });
    expect(await repository.markJobSucceeded(jobId, oldWorker)).toBe(false);
    expect(
      await repository.renewJobLease({
        id: jobId,
        lockExpiresAt: new Date(base + 30_000).toISOString(),
        workerId: newWorker,
      }),
    ).toBe(true);
    expect(await repository.markJobSucceeded(jobId, newWorker)).toBe(true);
  });
});
