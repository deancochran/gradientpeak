import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  integrations,
  profiles,
  providerSyncJobs,
  providerWebhookReceipts,
  users,
} from "@repo/db/schema";
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
  it("keeps mixed-version concurrent inserts in identical idx and queue_sequence order", async () => {
    const owner = await seedOwner();
    const repository = createProviderSyncRepository({ db });
    const oldJobId = randomUUID();
    const newJobId = randomUUID();
    const lane = `mixed-${randomUUID()}`;
    const insert = `
      insert into public.provider_sync_jobs (
        id, created_at, updated_at, profile_id, integration_id, provider,
        job_type, sync_lane_key, status, priority, run_at, attempt, max_attempts,
        payload
      ) values ($1, now(), now(), $2, $3, 'wahoo', 'wahoo.publish_event',
        $4, 'queued', 100, now(), 0, 3, '{}'::jsonb)
    `;
    const newWorkerInsert = insert
      .replace("payload\n", "payload, queue_sequence\n")
      .replace("'{}'::jsonb)", "'{}'::jsonb, $5)");
    await Promise.all([
      pool.query(insert, [oldJobId, owner.profileId, owner.integrationId, lane]),
      pool.query(newWorkerInsert, [
        newJobId,
        owner.profileId,
        owner.integrationId,
        lane,
        9_999_999,
      ]),
    ]);

    const ordered = await pool.query<{ id: string; idx: number; queue_sequence: string }>(
      `select id, idx, queue_sequence::text
       from public.provider_sync_jobs where id = any($1::uuid[]) order by idx`,
      [[oldJobId, newJobId]],
    );
    expect(ordered.rows).toHaveLength(2);
    expect(ordered.rows.every((row) => String(row.idx) === row.queue_sequence)).toBe(true);

    const claimed = await repository.claimDueJobs({
      limit: 2,
      lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      now: new Date().toISOString(),
      provider: "wahoo",
      workerId: "mixed-version-worker",
    });
    expect(claimed.map((job) => job.id)).toEqual([ordered.rows[0]?.id]);
  });

  it("uses immutable queue_sequence as lane precedence and run_at only for head eligibility", async () => {
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

  it("atomically fences stale webhook receipt and job finalization after lease loss", async () => {
    const owner = await seedOwner();
    const repository = createProviderSyncRepository({ db });
    const base = Date.parse("2026-07-13T14:00:00.000Z");
    const jobId = randomUUID();
    const receiptId = randomUUID();
    await db.insert(providerSyncJobs).values({
      attempt: 0,
      created_at: new Date(base),
      id: jobId,
      integration_id: owner.integrationId,
      job_type: "wahoo.process_webhook_receipt",
      max_attempts: 3,
      payload: { receiptId },
      priority: 100,
      profile_id: owner.profileId,
      provider: "wahoo",
      run_at: new Date(base - 1_000),
      status: "queued",
      sync_lane_key: `webhook-${receiptId}`,
      updated_at: new Date(base),
    });
    await db.insert(providerWebhookReceipts).values({
      created_at: new Date(base),
      event_type: "workout_summary",
      id: receiptId,
      integration_id: owner.integrationId,
      job_id: jobId,
      payload: { event_type: "workout_summary", user: { id: 42 } },
      processing_status: "pending",
      provider: "wahoo",
      received_at: new Date(base),
    });

    const staleWorker = `stale:${randomUUID()}`;
    const ownerWorker = `owner:${randomUUID()}`;
    await repository.claimDueJobs({
      limit: 1,
      lockExpiresAt: new Date(base + 1_000).toISOString(),
      now: new Date(base).toISOString(),
      provider: "wahoo",
      workerId: staleWorker,
    });
    await repository.claimDueJobs({
      limit: 1,
      lockExpiresAt: new Date(base + 20_000).toISOString(),
      now: new Date(base + 2_000).toISOString(),
      provider: "wahoo",
      workerId: ownerWorker,
    });
    expect(
      await repository.renewJobLease({
        id: jobId,
        lockExpiresAt: new Date(base + 30_000).toISOString(),
        workerId: staleWorker,
      }),
    ).toBe(false);
    expect(
      await repository.finalizeWebhookReceiptJob({
        jobId,
        jobStatus: "completed",
        receiptId,
        receiptStatus: "processed",
        workerId: staleWorker,
      }),
    ).toBe(false);

    const [stillPending] = await db
      .select({
        jobStatus: providerSyncJobs.status,
        receiptStatus: providerWebhookReceipts.processing_status,
      })
      .from(providerSyncJobs)
      .innerJoin(providerWebhookReceipts, eq(providerWebhookReceipts.job_id, providerSyncJobs.id))
      .where(eq(providerSyncJobs.id, jobId));
    expect(stillPending).toEqual({ jobStatus: "running", receiptStatus: "pending" });

    expect(
      await repository.finalizeWebhookReceiptJob({
        jobId,
        jobStatus: "completed",
        receiptId,
        receiptStatus: "processed",
        workerId: ownerWorker,
      }),
    ).toBe(true);
    const [consistent] = await db
      .select({
        jobStatus: providerSyncJobs.status,
        receiptStatus: providerWebhookReceipts.processing_status,
      })
      .from(providerSyncJobs)
      .innerJoin(providerWebhookReceipts, eq(providerWebhookReceipts.job_id, providerSyncJobs.id))
      .where(eq(providerSyncJobs.id, jobId));
    expect(consistent).toEqual({ jobStatus: "completed", receiptStatus: "processed" });
  });
});
