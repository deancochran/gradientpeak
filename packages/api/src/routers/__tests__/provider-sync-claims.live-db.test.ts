import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  integrationCredentials,
  integrations,
  oauthStates,
  profiles,
  providerSyncJobs,
  providerWebhookReceipts,
  users,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  createIntegrationsRepositories,
  createProviderSyncRepository,
} from "../../infrastructure/repositories";

const userIds: string[] = [];

function futureBase(offsetMs: number) {
  return Date.now() + 86_400_000 + offsetMs;
}

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
  vi.unstubAllEnvs();
  const userId = userIds.pop();
  if (userId) await db.delete(users).where(eq(users.id, userId));
});

afterAll(async () => {
  await pool.end();
});

describe("provider sync PostgreSQL claims", () => {
  it("consumes one OAuth state with one atomic credential write", async () => {
    const owner = await seedOwner();
    await db.delete(integrations).where(eq(integrations.id, owner.integrationId));
    const state = randomUUID();
    await db.insert(oauthStates).values({
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      id: randomUUID(),
      mobile_redirect_uri: "gradientpeak://integrations",
      profile_id: owner.profileId,
      provider: "wahoo",
      state,
    });
    const repository = createIntegrationsRepositories(db).integrations;
    const input = {
      accessToken: "access-token",
      expiresAt: new Date(Date.now() + 3_600_000),
      externalId: "wahoo-account",
      now: new Date(),
      profileId: owner.profileId,
      provider: "wahoo" as const,
      refreshToken: "refresh-token",
      scope: "workouts_read",
      state,
    };

    const results = await Promise.all([
      repository.upsertFromOAuthState(input),
      repository.upsertFromOAuthState(input),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(oauthStates).where(eq(oauthStates.state, state))).toHaveLength(0);
    const storedIntegrations = await db
      .select()
      .from(integrations)
      .where(eq(integrations.profile_id, owner.profileId));
    expect(storedIntegrations).toHaveLength(1);
    const storedIntegration = storedIntegrations[0];
    if (!storedIntegration) throw new Error("Expected stored integration");
    expect(
      await db
        .select()
        .from(integrationCredentials)
        .where(eq(integrationCredentials.integration_id, storedIntegration.id)),
    ).toHaveLength(1);
  });

  it("rolls OAuth state consumption back when credential protection fails", async () => {
    const owner = await seedOwner();
    await db.delete(integrations).where(eq(integrations.id, owner.integrationId));
    const state = randomUUID();
    await db.insert(oauthStates).values({
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      id: randomUUID(),
      mobile_redirect_uri: "gradientpeak://integrations",
      profile_id: owner.profileId,
      provider: "wahoo",
      state,
    });
    const repository = createIntegrationsRepositories(db).integrations;
    vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", "invalid");

    await expect(
      repository.upsertFromOAuthState({
        accessToken: "access-token",
        expiresAt: null,
        externalId: "wahoo-account",
        now: new Date(),
        profileId: owner.profileId,
        provider: "wahoo",
        refreshToken: "refresh-token",
        scope: null,
        state,
      }),
    ).rejects.toThrow("PROVIDER_TOKEN_ENCRYPTION_KEY");
    expect(await db.select().from(oauthStates).where(eq(oauthStates.state, state))).toHaveLength(1);
    expect(
      await db.select().from(integrations).where(eq(integrations.profile_id, owner.profileId)),
    ).toHaveLength(0);
  });

  it("coalesces concurrent enqueues with the same dedupe key into one active job", async () => {
    const owner = await seedOwner();
    const repository = createProviderSyncRepository({ db });
    const dedupeKey = `concurrent-${randomUUID()}`;
    const input = {
      dedupeKey,
      integrationId: owner.integrationId,
      jobType: "wahoo.publish_event",
      payload: { eventId: randomUUID() },
      profileId: owner.profileId,
      provider: "wahoo" as const,
      runAt: new Date(futureBase(0)).toISOString(),
    };

    const enqueued = await Promise.all(
      Array.from({ length: 8 }, () => repository.enqueueJob(input)),
    );

    expect(new Set(enqueued.map((job) => job.id)).size).toBe(1);
    const active = await pool.query<{ id: string }>(
      `select id from public.provider_sync_jobs
       where dedupe_key = $1 and status in ('queued', 'running')`,
      [dedupeKey],
    );
    expect(active.rows).toEqual([{ id: enqueued[0]?.id }]);
  });

  it("maps queue sequence and filters listJobs to the requested event and provider", async () => {
    const owner = await seedOwner();
    const repository = createProviderSyncRepository({ db });
    const eventId = randomUUID();
    const unrelatedEventId = randomUUID();
    const first = await repository.enqueueJob({
      dedupeKey: `first-${eventId}`,
      integrationId: owner.integrationId,
      internalResourceId: eventId,
      jobType: "wahoo.publish_event",
      payload: { eventId },
      profileId: owner.profileId,
      provider: "wahoo",
      runAt: new Date(futureBase(120_000)).toISOString(),
    });
    const newest = await repository.enqueueJob({
      dedupeKey: `newest-${eventId}`,
      integrationId: owner.integrationId,
      internalResourceId: eventId,
      jobType: "wahoo.publish_event",
      payload: { eventId },
      profileId: owner.profileId,
      provider: "wahoo",
      runAt: new Date(futureBase(60_000)).toISOString(),
    });
    await repository.enqueueJob({
      dedupeKey: `unrelated-${unrelatedEventId}`,
      integrationId: owner.integrationId,
      internalResourceId: unrelatedEventId,
      jobType: "wahoo.publish_event",
      payload: { eventId: unrelatedEventId },
      profileId: owner.profileId,
      provider: "wahoo",
      runAt: new Date(futureBase(180_000)).toISOString(),
    });

    const jobs = await repository.listJobs({
      internalResourceId: eventId,
      limit: 2,
      order: "newest_authority",
      profileId: owner.profileId,
      provider: "wahoo",
    });

    expect(jobs.map((job) => job.id)).toEqual([newest.id, first.id]);
    expect(jobs.every((job) => job.internalResourceId === eventId)).toBe(true);
    expect(jobs.every((job) => job.provider === "wahoo")).toBe(true);
    expect(jobs.map((job) => job.queueSequence)).toEqual([expect.any(Number), expect.any(Number)]);
    expect(jobs[0]?.queueSequence).toBeGreaterThan(jobs[1]?.queueSequence ?? Number.MAX_VALUE);
  });

  it("coalesces an unchanged running intent and queues one successor for concurrent payload changes", async () => {
    const owner = await seedOwner();
    const repository = createProviderSyncRepository({ db });
    const eventId = randomUUID();
    const lane = `event-${eventId}`;
    const workerId = `worker-${randomUUID()}`;
    const runAt = new Date().toISOString();
    const initialInput = {
      dedupeKey: `publish-${eventId}`,
      integrationId: owner.integrationId,
      jobType: "wahoo.publish_event",
      operation: "publish",
      payload: { eventId, operation: "publish" },
      payloadHash: "publish-v1",
      profileId: owner.profileId,
      provider: "wahoo" as const,
      runAt,
      syncLaneKey: lane,
    };
    const running = await repository.enqueueJob(initialInput);
    await repository.claimDueJobs({
      limit: 1,
      lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      now: new Date().toISOString(),
      provider: "wahoo",
      workerId,
    });

    await expect(repository.enqueueJob(initialInput)).resolves.toEqual({
      id: running.id,
      status: "running",
    });

    const changedInput = { ...initialInput, payloadHash: "publish-v2" };
    const successors = await Promise.all(
      Array.from({ length: 8 }, () => repository.enqueueJob(changedInput)),
    );
    expect(new Set(successors.map((job) => job.id)).size).toBe(1);
    expect(successors.every((job) => job.status === "queued")).toBe(true);
    expect(successors[0]?.id).not.toBe(running.id);

    const active = await pool.query<{ id: string; payload_hash: string; status: string }>(
      `select id, payload_hash, status from public.provider_sync_jobs
       where sync_lane_key = $1 and status in ('queued', 'running') order by queue_sequence`,
      [lane],
    );
    expect(active.rows).toEqual([
      { id: running.id, payload_hash: "publish-v1", status: "running" },
      { id: successors[0]?.id, payload_hash: "publish-v2", status: "queued" },
    ]);
  });

  it("keeps one latest-intent successor for publish-unsync-publish while publish is running", async () => {
    const owner = await seedOwner();
    const repository = createProviderSyncRepository({ db });
    const eventId = randomUUID();
    const lane = `event-${eventId}`;
    const publishDedupe = `publish-${eventId}`;
    const runAt = new Date().toISOString();
    const workerId = `worker-${randomUUID()}`;
    const runningPublish = await repository.enqueueJob({
      dedupeKey: publishDedupe,
      integrationId: owner.integrationId,
      jobType: "wahoo.publish_event",
      operation: "publish",
      payload: { eventId, operation: "publish" },
      payloadHash: "publish-v1",
      profileId: owner.profileId,
      provider: "wahoo",
      runAt,
      syncLaneKey: lane,
    });
    const claimed = await repository.claimDueJobs({
      jobTypes: ["wahoo.publish_event"],
      limit: 1,
      lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      now: new Date().toISOString(),
      provider: "wahoo",
      workerId,
    });
    expect(claimed.map((job) => job.id)).toEqual([runningPublish.id]);

    const unsyncSuccessor = await repository.enqueueJob({
      dedupeKey: `unsync-${eventId}`,
      integrationId: owner.integrationId,
      jobType: "wahoo.unsync_event",
      operation: "unsync",
      payload: { eventId, operation: "unsync" },
      payloadHash: "unsync-v1",
      profileId: owner.profileId,
      provider: "wahoo",
      runAt,
      syncLaneKey: lane,
    });
    const latestPublish = await repository.enqueueJob({
      dedupeKey: publishDedupe,
      integrationId: owner.integrationId,
      jobType: "wahoo.publish_event",
      operation: "publish",
      payload: { eventId, operation: "publish" },
      payloadHash: "publish-v2",
      profileId: owner.profileId,
      provider: "wahoo",
      runAt,
      syncLaneKey: lane,
    });

    expect(latestPublish).toEqual({ id: unsyncSuccessor.id, status: "queued" });
    const active = await pool.query<{
      dedupe_key: string;
      id: string;
      operation: string;
      payload_hash: string;
      status: string;
    }>(
      `select id, dedupe_key, operation, payload_hash, status
       from public.provider_sync_jobs
       where sync_lane_key = $1 and status in ('queued', 'running') order by queue_sequence`,
      [lane],
    );
    expect(active.rows).toEqual([
      {
        dedupe_key: publishDedupe,
        id: runningPublish.id,
        operation: "publish",
        payload_hash: "publish-v1",
        status: "running",
      },
      {
        dedupe_key: publishDedupe,
        id: unsyncSuccessor.id,
        operation: "publish",
        payload_hash: "publish-v2",
        status: "queued",
      },
    ]);

    expect(
      await repository.claimDueJobs({
        limit: 1,
        lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        now: new Date().toISOString(),
        provider: "wahoo",
        workerId: `blocked-${randomUUID()}`,
      }),
    ).toEqual([]);
    expect(await repository.markJobSucceeded(runningPublish.id, workerId)).toBe(true);
    const successorClaim = await repository.claimDueJobs({
      limit: 1,
      lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      now: new Date().toISOString(),
      provider: "wahoo",
      workerId: `successor-${randomUUID()}`,
    });
    expect(successorClaim).toMatchObject([
      {
        id: unsyncSuccessor.id,
        operation: "publish",
        payloadHash: "publish-v2",
        status: "running",
      },
    ]);
  });

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
    const base = futureBase(0);
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
    const base = futureBase(3_600_000);
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
    const base = futureBase(7_200_000);
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
