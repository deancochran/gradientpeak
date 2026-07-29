import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityFileIngestions,
  integrationCredentials,
  integrationResourceLinks,
  integrations,
  oauthStates,
  profiles,
  providerSyncJobs,
  providerSyncState,
  providerWebhookReceipts,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ActivitySubmission,
  submitActivity,
} from "../../application/activities/submit-activity";
import { getProviderSyncOverview } from "../../application/integrations/syncOverviewUseCase";
import {
  createWahooStagingCleanupReservation,
  WAHOO_STAGING_CLEANUP_GRACE_MS,
} from "../../lib/provider-sync/wahoo-staging-cleanup";
import { WahooWebhookJobService } from "../../lib/provider-sync/wahoo-webhook-job-service";
import { encryptProviderToken } from "../../lib/provider-token-crypto";
import {
  IntegrationDisconnectPendingError,
  IntegrationLifecycleChangedError,
} from "../../repositories/integrations-repository";
import { createIntegrationsRepositories } from "./drizzle-integrations-repository";
import { createProviderSyncRepository } from "./drizzle-provider-sync-repository";
import { createWahooRepository } from "./drizzle-wahoo-repository";

const userIds: string[] = [];
const key = Buffer.alloc(32, 9).toString("base64");

async function seed() {
  const profileId = randomUUID();
  const integrationId = randomUUID();
  const now = new Date();
  userIds.push(profileId);
  await db.insert(users).values({
    id: profileId,
    email: `${profileId}@gradientpeak.test`,
    emailVerified: true,
    name: "Disconnect test",
  });
  await db.insert(profiles).values({
    created_at: now,
    email: `${profileId}@gradientpeak.test`,
    id: profileId,
    is_public: false,
    updated_at: now,
  });
  await db.insert(integrations).values({
    created_at: now,
    external_id: `wahoo-${profileId}`,
    id: integrationId,
    profile_id: profileId,
    provider: "wahoo",
    updated_at: now,
  });
  await db.insert(integrationCredentials).values({
    access_token: encryptProviderToken("old-access"),
    integration_id: integrationId,
    refresh_token: encryptProviderToken("old-refresh"),
  });
  return { integrationId, profileId };
}

async function claimDisconnect(integrationId: string, profileId: string) {
  const repository = createProviderSyncRepository({ db });
  const workerId = `disconnect:${randomUUID()}`;
  const claimNow = new Date(Date.now() + 60_000).toISOString();
  const jobs = await repository.claimDueJobs({
    jobTypes: ["wahoo.disconnect"],
    limit: 100,
    lockExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    now: claimNow,
    workerId,
  });
  const job = jobs.find(
    (candidate) => candidate.integrationId === integrationId && candidate.profileId === profileId,
  );
  if (!job) throw new Error("Expected disconnect job claim");
  return { job, repository, workerId };
}

function importedSubmission(profileId: string): ActivitySubmission {
  return {
    activeMs: 3_500_000,
    avgCadence: null,
    avgHeartRate: null,
    avgPower: null,
    avgSpeedMps: null,
    calories: null,
    distanceMeters: 20_000,
    elapsedMs: 3_600_000,
    elevationGainMeters: null,
    finishedAt: new Date("2026-01-01T11:00:00.000Z"),
    contentVisibility: "private",
    maxCadence: null,
    maxHeartRate: null,
    maxPower: null,
    maxSpeedMps: null,
    movingMs: 3_500_000,
    name: "Imported activity",
    notes: null,
    profileId,
    startedAt: new Date("2026-01-01T10:00:00.000Z"),
    timingCoverage: "complete",
    normalizedSpeedMps: null,
    normalizedGradedSpeedMps: null,
    efficiencyFactor: null,
    aerobicDecoupling: null,
    avgTemperature: null,
    deviceManufacturer: null,
    deviceProduct: null,
    laps: null,
    mapBounds: null,
    polyline: null,
    segmentSet: {
      elapsedMs: 3_600_000,
      segments: [
        {
          activity_category: "bike",
          endOffsetMs: 3_600_000,
          id: randomUUID(),
          ordinal: 0,
          role: "activity",
          startOffsetMs: 0,
          summary: {
            version: 1,
            timing: { activeMs: 3_500_000, movingMs: 3_500_000, timingCoverage: "complete" },
          },
        },
      ],
      version: 1,
    },
  };
}

function guardedImportedSubmission(owner: {
  integrationId: string;
  profileId: string;
}): ActivitySubmission {
  const externalId = `activity-${randomUUID()}`;
  const digest = "a".repeat(64);
  return {
    ...importedSubmission(owner.profileId),
    providerProvenance: {
      provider: "wahoo",
      externalId,
      integrationId: owner.integrationId,
      integrationGeneration: 1,
      providerUpdatedAt: "2026-01-01T11:00:00.000Z",
    },
    analysis: {
      activityCompletedAt: new Date("2026-01-01T11:00:00.000Z"),
      detectedLTHR: null,
      efforts: [],
      ingestion: {
        source: "provider_sync",
        provider: "wahoo",
        externalId,
        artifact: {
          bucket: "activity-files",
          byteSize: 3,
          format: "fit",
          mediaType: "application/octet-stream",
          path: `artifacts/sha256/${owner.profileId}/${digest}`,
          sha256: digest,
        },
      },
    },
  };
}

async function lockActiveWahooGeneration(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  owner: { integrationId: string; profileId: string },
) {
  const [active] = await tx
    .select({ id: integrations.id })
    .from(integrations)
    .where(
      and(
        eq(integrations.id, owner.integrationId),
        eq(integrations.profile_id, owner.profileId),
        eq(integrations.provider, "wahoo"),
        eq(integrations.lifecycle_status, "active"),
        eq(integrations.generation, 1),
      ),
    )
    .limit(1)
    .for("share");
  if (!active) throw new Error("integration_generation_inactive");
}

beforeEach(() => vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", key));
afterEach(async () => {
  vi.unstubAllEnvs();
  while (userIds.length) {
    const userId = userIds.pop();
    if (!userId) continue;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`delete from provider_webhook_receipts where integration_id in (select id from integrations where profile_id = ${userId})`,
      );
      await tx.delete(providerSyncJobs).where(eq(providerSyncJobs.profile_id, userId));
      await tx.delete(activityFileIngestions).where(eq(activityFileIngestions.profile_id, userId));
      await tx.delete(activityArtifactLinks).where(eq(activityArtifactLinks.profile_id, userId));
      await tx
        .delete(integrationResourceLinks)
        .where(eq(integrationResourceLinks.profile_id, userId));
      await tx.delete(activities).where(eq(activities.profile_id, userId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
      );
      await tx
        .update(activityArtifacts)
        .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
        .where(eq(activityArtifacts.profile_id, userId));
      await tx
        .update(activityArtifacts)
        .set({ availability: "deleted", deleted_at: new Date() })
        .where(eq(activityArtifacts.profile_id, userId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
      );
      await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, userId));
    });
    await db.delete(users).where(eq(users.id, userId));
  }
});
afterAll(async () => pool.end());

describe("Wahoo disconnect PostgreSQL lifecycle", () => {
  it("hides disconnected tombstones from the active overview and restores them on reconnect", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PROVIDER_OAUTH_TEST_ADAPTER", "1");
    const owner = await seed();
    const providerSyncRepository = createProviderSyncRepository({ db });
    await providerSyncRepository.requestWahooDisconnect({ profileId: owner.profileId });
    const [queuedDisconnect] = await db
      .select({ priority: providerSyncJobs.priority })
      .from(providerSyncJobs)
      .where(
        and(
          eq(providerSyncJobs.integration_id, owner.integrationId),
          eq(providerSyncJobs.job_type, "wahoo.disconnect"),
        ),
      );
    expect(queuedDisconnect?.priority).toBe(0);
    const disconnecting = await getProviderSyncOverview({ db, profileId: owner.profileId });
    expect(disconnecting.find((provider) => provider.provider === "wahoo")).toMatchObject({
      actions: [],
      connected: false,
      integrationId: null,
      primaryAction: null,
      providerHealth: { status: "disconnecting" },
      summary: {
        badge: "Disconnecting",
        health: "disconnecting",
        subtitle: "Revoking provider access",
      },
    });
    const { job, workerId } = await claimDisconnect(owner.integrationId, owner.profileId);
    await expect(
      providerSyncRepository.beginWahooDisconnectAttempt({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        workerId,
      }),
    ).resolves.toEqual({ accessToken: "old-access", disposition: "ready" });
    await expect(
      providerSyncRepository.finalizeWahooDisconnect({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        outcome: "confirmed",
        workerId,
      }),
    ).resolves.toBe(true);

    await db.insert(providerSyncState).values({
      integration_id: owner.integrationId,
      provider: "wahoo",
      resource: "historical_activities",
      sync_mode: "pull_windowed",
    });
    await db.insert(providerSyncJobs).values({
      integration_id: owner.integrationId,
      job_type: "wahoo.activity_history_reconcile",
      payload: { trigger: "scheduled" },
      profile_id: owner.profileId,
      provider: "wahoo",
      run_at: new Date(),
      status: "queued",
      sync_lane_key: `tombstone:${randomUUID()}`,
    });

    const integrationsRepository = createIntegrationsRepositories(db).integrations;
    await expect(
      integrationsRepository.findGrantByProfileIdAndProvider({
        profileId: owner.profileId,
        provider: "wahoo",
      }),
    ).resolves.toBeNull();
    await expect(
      createWahooRepository({ db }).findWahooIntegrationByProfileId(owner.profileId),
    ).resolves.toBeNull();
    const disconnected = await getProviderSyncOverview({ db, profileId: owner.profileId });
    expect(disconnected.find((provider) => provider.provider === "wahoo")).toMatchObject({
      activityHistory: { queuedJobId: null, status: "idle" },
      connected: false,
      integrationId: null,
      primaryAction: "connect",
      providerHealth: { status: "disconnected" },
    });
    expect(JSON.stringify(disconnected)).not.toContain("old-access");
    expect(JSON.stringify(disconnected)).not.toContain("old-refresh");

    await db
      .update(integrations)
      .set({
        disconnect_requested_at: null,
        disconnected_at: null,
        lifecycle_status: "active",
        remote_revoked_at: null,
        updated_at: new Date(),
      })
      .where(eq(integrations.id, owner.integrationId));
    await db.insert(integrationCredentials).values({
      access_token: encryptProviderToken("new-access"),
      integration_id: owner.integrationId,
      refresh_token: encryptProviderToken("new-refresh"),
      scope: "workouts_read offline_data",
    });

    const reconnected = await getProviderSyncOverview({ db, profileId: owner.profileId });
    expect(reconnected.find((provider) => provider.provider === "wahoo")).toMatchObject({
      connected: true,
      integrationId: owner.integrationId,
    });
  });

  it("allows only one profile to bind a provider account under concurrent updates", async () => {
    const first = await seed();
    const second = await seed();
    const externalId = `shared-wahoo-${randomUUID()}`;

    const results = await Promise.allSettled([
      db
        .update(integrations)
        .set({ external_id: externalId })
        .where(eq(integrations.id, first.integrationId)),
      db
        .update(integrations)
        .set({ external_id: externalId })
        .where(eq(integrations.id, second.integrationId)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const bound = await db
      .select({ profileId: integrations.profile_id })
      .from(integrations)
      .where(and(eq(integrations.provider, "wahoo"), eq(integrations.external_id, externalId)));
    expect(bound).toHaveLength(1);
  });

  it("updates a queued staging reservation outcome in place without changing its delayed authority", async () => {
    const owner = await seed();
    const repository = createProviderSyncRepository({ db });
    const now = new Date("2030-01-01T00:00:00.000Z");
    const reservation = createWahooStagingCleanupReservation({
      createAttemptId: () => "11111111-1111-4111-8111-111111111111",
      now: () => now,
      providerSyncRepository: repository,
    });

    const reserved = await reservation.reserve({
      integrationGeneration: 1,
      integrationId: owner.integrationId,
      profileId: owner.profileId,
      summaryId: 123,
    });
    const [initial] = await db
      .select({
        id: providerSyncJobs.id,
        payload: providerSyncJobs.payload,
        runAt: providerSyncJobs.run_at,
        syncLaneKey: providerSyncJobs.sync_lane_key,
      })
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.integration_id, owner.integrationId));
    expect(initial).toMatchObject({
      payload: { path: reserved.path, uploadOutcome: "uncertain" },
      runAt: new Date(now.getTime() + WAHOO_STAGING_CLEANUP_GRACE_MS),
    });

    await expect(reserved.recordOutcome("committed")).resolves.toBe(true);
    const rows = await db
      .select({
        id: providerSyncJobs.id,
        payload: providerSyncJobs.payload,
        runAt: providerSyncJobs.run_at,
        syncLaneKey: providerSyncJobs.sync_lane_key,
      })
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.integration_id, owner.integrationId));
    expect(rows).toEqual([
      {
        id: initial?.id,
        payload: { path: reserved.path, uploadOutcome: "committed" },
        runAt: initial?.runAt,
        syncLaneKey: initial?.syncLaneKey,
      },
    ]);
  });

  it("fails closed when a running staging reservation receives a committed successor", async () => {
    const owner = await seed();
    const repository = createProviderSyncRepository({ db });
    const now = new Date("2030-01-01T00:00:00.000Z");
    const reservation = createWahooStagingCleanupReservation({
      createAttemptId: () => "22222222-2222-4222-8222-222222222222",
      now: () => now,
      providerSyncRepository: repository,
    });
    const reserved = await reservation.reserve({
      integrationGeneration: 1,
      integrationId: owner.integrationId,
      profileId: owner.profileId,
      summaryId: 123,
    });
    const claimed = await repository.claimDueJobs({
      jobTypes: ["wahoo.staging_cleanup"],
      limit: 1,
      lockExpiresAt: new Date("2031-01-01T00:10:00.000Z").toISOString(),
      now: new Date("2031-01-01T00:00:00.000Z").toISOString(),
      provider: "wahoo",
      workerId: "staging-cleanup-claim",
    });
    const original = claimed[0];
    if (!original) throw new Error("Expected staging cleanup claim");

    await expect(reserved.recordOutcome("committed")).resolves.toBe(false);
    const rows = await db
      .select({
        id: providerSyncJobs.id,
        payload: providerSyncJobs.payload,
        status: providerSyncJobs.status,
      })
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.integration_id, owner.integrationId));
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          id: original.id,
          payload: { path: reserved.path, uploadOutcome: "uncertain" },
          status: "running",
        },
        expect.objectContaining({
          payload: { path: reserved.path, uploadOutcome: "committed" },
          status: "queued",
        }),
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("linearizes import persistence before a waiting disconnect without a worker-level deadlock", async () => {
    const owner = await seed();
    const lifecycle = createProviderSyncRepository({ db });
    let releaseImport: (() => void) | undefined;
    const importReleased = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    let guardAcquired: (() => void) | undefined;
    const guardAcquiredPromise = new Promise<void>((resolve) => {
      guardAcquired = resolve;
    });
    const imported = submitActivity(db, guardedImportedSubmission(owner), {
      beforePersist: async (tx) => {
        await lockActiveWahooGeneration(tx, owner);
        guardAcquired?.();
        await importReleased;
      },
    });
    await guardAcquiredPromise;
    let disconnectSettled = false;
    const disconnect = lifecycle
      .requestWahooDisconnect({ profileId: owner.profileId })
      .then((value) => {
        disconnectSettled = true;
        return value;
      });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(disconnectSettled).toBe(false);
    releaseImport?.();
    await expect(imported).resolves.toMatchObject({ id: expect.any(String) });
    await expect(disconnect).resolves.toMatchObject({ status: "pending" });
    expect(
      await db.select().from(activities).where(eq(activities.profile_id, owner.profileId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(activityArtifacts)
        .where(eq(activityArtifacts.profile_id, owner.profileId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(activityArtifactLinks)
        .where(eq(activityArtifactLinks.profile_id, owner.profileId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.integration_id, owner.integrationId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(activityFileIngestions)
        .where(eq(activityFileIngestions.profile_id, owner.profileId)),
    ).toHaveLength(1);

    const beforeRejectedWrites = await Promise.all([
      db.select().from(activities).where(eq(activities.profile_id, owner.profileId)),
      db.select().from(activityArtifacts).where(eq(activityArtifacts.profile_id, owner.profileId)),
      db
        .select()
        .from(activityArtifactLinks)
        .where(eq(activityArtifactLinks.profile_id, owner.profileId)),
      db
        .select()
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.integration_id, owner.integrationId)),
      db
        .select()
        .from(activityFileIngestions)
        .where(eq(activityFileIngestions.profile_id, owner.profileId)),
    ]);
    const staleGuard = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
      lockActiveWahooGeneration(tx, owner);
    await expect(
      submitActivity(db, guardedImportedSubmission(owner), { beforePersist: staleGuard }),
    ).rejects.toThrow("integration_generation_inactive");
    const existing = beforeRejectedWrites[0][0]!;
    const segmentSet = importedSubmission(owner.profileId).segmentSet;
    if (!segmentSet) throw new Error("Expected imported submission segment set");
    await expect(
      submitActivity(
        db,
        {
          kind: "enrich",
          activityId: existing.id,
          profileId: owner.profileId,
          deviceManufacturer: null,
          deviceProduct: null,
          laps: null,
          mapBounds: null,
          polyline: null,
          summaryValues: {},
          segmentSet,
          efforts: [],
          detectedLTHR: null,
          activityCompletedAt: new Date("2026-01-01T11:00:00.000Z"),
        },
        { beforePersist: staleGuard },
      ),
    ).rejects.toThrow("integration_generation_inactive");
    await expect(
      createWahooRepository({ db }).createImportedActivityResourceLink({
        activityId: existing.id,
        externalId: `stale-${randomUUID()}`,
        integrationId: owner.integrationId,
        integrationGeneration: 1,
        profileId: owner.profileId,
        provider: "wahoo",
        providerUpdatedAt: null,
      }),
    ).rejects.toThrow("integration_generation_inactive");
    expect(
      await Promise.all([
        db.select().from(activities).where(eq(activities.profile_id, owner.profileId)),
        db
          .select()
          .from(activityArtifacts)
          .where(eq(activityArtifacts.profile_id, owner.profileId)),
        db
          .select()
          .from(activityArtifactLinks)
          .where(eq(activityArtifactLinks.profile_id, owner.profileId)),
        db
          .select()
          .from(integrationResourceLinks)
          .where(eq(integrationResourceLinks.integration_id, owner.integrationId)),
        db
          .select()
          .from(activityFileIngestions)
          .where(eq(activityFileIngestions.profile_id, owner.profileId)),
      ]),
    ).toEqual(beforeRejectedWrites);

    const unrelated = await seed();
    await expect(
      submitActivity(db, guardedImportedSubmission(unrelated), {
        beforePersist: (tx) => lockActiveWahooGeneration(tx, unrelated),
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("rolls the lifecycle fence back when durable disconnect enqueue fails", async () => {
    const owner = await seed();
    const repository = createProviderSyncRepository({ db });
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `disconnect_enqueue_fail_${suffix}`;
    const triggerName = `disconnect_enqueue_fail_trigger_${suffix}`;
    await db.execute(
      sql.raw(`
      create function ${functionName}() returns trigger language plpgsql as $$
      begin
        if new.job_type = 'wahoo.disconnect' then raise exception 'disconnect enqueue failure'; end if;
        return new;
      end;
      $$;
      create trigger ${triggerName} before insert on provider_sync_jobs
      for each row execute function ${functionName}();
    `),
    );
    try {
      await expect(
        repository.requestWahooDisconnect({ profileId: owner.profileId }),
      ).rejects.toThrow("Failed query");
    } finally {
      await db.execute(
        sql.raw(
          `drop trigger if exists ${triggerName} on provider_sync_jobs; drop function if exists ${functionName}();`,
        ),
      );
    }
    expect(
      await db.select().from(integrations).where(eq(integrations.id, owner.integrationId)),
    ).toEqual([expect.objectContaining({ generation: 1, lifecycle_status: "active" })]);
    expect(
      await db
        .select()
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.integration_id, owner.integrationId)),
    ).toEqual([]);
  });

  it("atomically fences active work, enqueues one durable intent, and converges duplicate requests", async () => {
    const owner = await seed();
    const repository = createProviderSyncRepository({ db });
    await db.insert(providerSyncJobs).values({
      integration_id: owner.integrationId,
      job_type: "wahoo.activity_history_reconcile",
      payload: {},
      profile_id: owner.profileId,
      provider: "wahoo",
      run_at: new Date(),
      status: "queued",
      sync_lane_key: `old:${randomUUID()}`,
    });
    await db.insert(providerSyncJobs).values({
      integration_generation: 1,
      integration_id: owner.integrationId,
      job_type: "wahoo.staging_cleanup",
      payload: {
        path: `activities/${owner.profileId}/providers/wahoo/staging/${owner.integrationId}/1/123/11111111-1111-4111-8111-111111111111.fit`,
      },
      profile_id: owner.profileId,
      provider: "wahoo",
      run_at: new Date(),
      status: "queued",
      sync_lane_key: `cleanup:${randomUUID()}`,
    });

    const [first, duplicate] = await Promise.all([
      repository.requestWahooDisconnect({ profileId: owner.profileId }),
      repository.requestWahooDisconnect({ profileId: owner.profileId }),
    ]);
    expect(first).toMatchObject({
      generation: 2,
      integrationId: owner.integrationId,
      status: "pending",
    });
    expect(duplicate).toMatchObject({
      generation: 2,
      integrationId: owner.integrationId,
      status: "pending",
    });
    const jobs = await db
      .select()
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.integration_id, owner.integrationId));
    expect(jobs.filter((job) => job.job_type === "wahoo.disconnect")).toHaveLength(1);
    expect(jobs.find((job) => job.job_type === "wahoo.activity_history_reconcile")?.status).toBe(
      "completed",
    );
    expect(jobs.find((job) => job.job_type === "wahoo.staging_cleanup")?.status).toBe("queued");
  });

  it("classifies a late claimed job generation as superseded without deleting credentials", async () => {
    const owner = await seed();
    const repository = createProviderSyncRepository({ db });
    await repository.requestWahooDisconnect({ profileId: owner.profileId });
    const { job, workerId } = await claimDisconnect(owner.integrationId, owner.profileId);
    await db
      .update(integrations)
      .set({
        disconnect_requested_at: null,
        generation: 3,
        lifecycle_status: "active",
        updated_at: new Date(),
      })
      .where(eq(integrations.id, owner.integrationId));

    await expect(
      repository.beginWahooDisconnectAttempt({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        workerId,
      }),
    ).resolves.toEqual({ disposition: "superseded" });
    await expect(repository.markJobSucceeded(job.id, workerId)).resolves.toBe(true);
    expect(
      await db
        .select()
        .from(integrationCredentials)
        .where(eq(integrationCredentials.integration_id, owner.integrationId)),
    ).toHaveLength(1);
  });

  it("classifies a pending disconnect without credentials as invalid and dead-letters it", async () => {
    const owner = await seed();
    const repository = createProviderSyncRepository({ db });
    await repository.requestWahooDisconnect({ profileId: owner.profileId });
    const { job, workerId } = await claimDisconnect(owner.integrationId, owner.profileId);
    await db
      .delete(integrationCredentials)
      .where(eq(integrationCredentials.integration_id, owner.integrationId));

    await expect(
      repository.beginWahooDisconnectAttempt({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        workerId,
      }),
    ).resolves.toEqual({ disposition: "invalid" });
    await expect(
      repository.finalizeWahooDisconnect({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        outcome: "dead_lettered",
        workerId,
      }),
    ).resolves.toBe(true);
    expect(
      await db
        .select({ status: providerSyncJobs.status })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, job.id)),
    ).toEqual([{ status: "dead_lettered" }]);
    expect(
      await db
        .select({ lifecycleStatus: integrations.lifecycle_status })
        .from(integrations)
        .where(eq(integrations.id, owner.integrationId)),
    ).toEqual([{ lifecycleStatus: "disconnect_pending" }]);
  });

  it("confirmed revocation deletes credentials but retains historical resource links", async () => {
    const owner = await seed();
    const repository = createProviderSyncRepository({ db });
    await db.insert(integrationResourceLinks).values({
      external_id: "historical-activity",
      id: randomUUID(),
      integration_id: owner.integrationId,
      internal_resource_id: randomUUID(),
      profile_id: owner.profileId,
      provider: "wahoo",
      resource_kind: "activity",
    });
    await repository.requestWahooDisconnect({ profileId: owner.profileId });
    const { job, workerId } = await claimDisconnect(owner.integrationId, owner.profileId);
    await expect(
      repository.beginWahooDisconnectAttempt({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        workerId,
      }),
    ).resolves.toEqual({ accessToken: "old-access", disposition: "ready" });
    expect(
      await db
        .select({ lastError: providerSyncJobs.last_error })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, job.id)),
    ).toEqual([{ lastError: "disconnect_attempt_uncertain" }]);
    await expect(
      repository.finalizeWahooDisconnect({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        outcome: "confirmed",
        workerId,
      }),
    ).resolves.toBe(true);
    expect(
      await db
        .select()
        .from(integrationCredentials)
        .where(eq(integrationCredentials.integration_id, owner.integrationId)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.integration_id, owner.integrationId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(integrations).where(eq(integrations.id, owner.integrationId)),
    ).toEqual([
      expect.objectContaining({
        lifecycle_status: "disconnected",
        remote_revoked_at: expect.any(Date),
      }),
    ]);
  });

  it("blocks OAuth reconnect while revocation is in flight and permits it after confirmation", async () => {
    const owner = await seed();
    const providerSyncRepository = createProviderSyncRepository({ db });
    const integrationsRepository = createIntegrationsRepositories(db).integrations;
    const racedState = `raced-reconnect-${randomUUID()}`;
    await db.insert(oauthStates).values({
      expires_at: new Date(Date.now() + 60_000),
      mobile_redirect_uri: "gradientpeak://oauth",
      profile_id: owner.profileId,
      provider: "wahoo",
      state: racedState,
    });
    await providerSyncRepository.requestWahooDisconnect({ profileId: owner.profileId });
    const { job, workerId } = await claimDisconnect(owner.integrationId, owner.profileId);
    await expect(
      providerSyncRepository.beginWahooDisconnectAttempt({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        workerId,
      }),
    ).resolves.toEqual({ accessToken: "old-access", disposition: "ready" });

    const blockedState = `blocked-reconnect-${randomUUID()}`;
    await db.insert(oauthStates).values({
      expires_at: new Date(Date.now() + 60_000),
      mobile_redirect_uri: "gradientpeak://oauth",
      profile_id: owner.profileId,
      provider: "wahoo",
      state: blockedState,
    });
    await expect(
      integrationsRepository.upsertFromOAuthState({
        accessToken: "blocked-access",
        expectedIntegration: {
          generation: 1,
          kind: "present",
          lifecycleStatus: "active",
        },
        expiresAt: new Date(Date.now() + 3_600_000),
        externalId: `wahoo-${owner.profileId}`,
        now: new Date(),
        profileId: owner.profileId,
        provider: "wahoo",
        refreshToken: "blocked-refresh",
        scope: "workouts_read",
        state: blockedState,
      }),
    ).rejects.toBeInstanceOf(IntegrationDisconnectPendingError);
    expect(
      await db.select().from(oauthStates).where(eq(oauthStates.state, blockedState)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ generation: integrations.generation, status: integrations.lifecycle_status })
        .from(integrations)
        .where(eq(integrations.id, owner.integrationId)),
    ).toEqual([{ generation: 2, status: "disconnect_pending" }]);

    await expect(
      providerSyncRepository.finalizeWahooDisconnect({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        outcome: "confirmed",
        workerId,
      }),
    ).resolves.toBe(true);
    await expect(
      integrationsRepository.upsertFromOAuthState({
        accessToken: "raced-access",
        expectedIntegration: {
          generation: 1,
          kind: "present",
          lifecycleStatus: "active",
        },
        expiresAt: new Date(Date.now() + 3_600_000),
        externalId: `wahoo-${owner.profileId}`,
        now: new Date(),
        profileId: owner.profileId,
        provider: "wahoo",
        refreshToken: "raced-refresh",
        scope: "workouts_read",
        state: racedState,
      }),
    ).rejects.toBeInstanceOf(IntegrationLifecycleChangedError);
    expect(
      await db.select().from(oauthStates).where(eq(oauthStates.state, racedState)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ status: integrations.lifecycle_status })
        .from(integrations)
        .where(eq(integrations.id, owner.integrationId)),
    ).toEqual([{ status: "disconnected" }]);
    await db.delete(oauthStates).where(eq(oauthStates.state, blockedState));
    await db.delete(oauthStates).where(eq(oauthStates.state, racedState));
    const reconnectState = `confirmed-reconnect-${randomUUID()}`;
    await db.insert(oauthStates).values({
      expires_at: new Date(Date.now() + 60_000),
      mobile_redirect_uri: "gradientpeak://oauth",
      profile_id: owner.profileId,
      provider: "wahoo",
      state: reconnectState,
    });
    await expect(
      integrationsRepository.upsertFromOAuthState({
        accessToken: "new-access",
        expectedIntegration: {
          generation: 2,
          kind: "present",
          lifecycleStatus: "disconnected",
        },
        expiresAt: new Date(Date.now() + 3_600_000),
        externalId: `wahoo-${owner.profileId}`,
        now: new Date(),
        profileId: owner.profileId,
        provider: "wahoo",
        refreshToken: "new-refresh",
        scope: "workouts_read",
        state: reconnectState,
      }),
    ).resolves.toMatchObject({ generation: 3, lifecycle_status: "active" });
    await expect(
      createWahooRepository({ db }).findWahooIntegrationByProfileId(owner.profileId),
    ).resolves.toMatchObject({ accessToken: "new-access", integrationGeneration: 3 });
  });

  it("defensively rejects stale disconnect finalization after an out-of-band generation advance", async () => {
    const owner = await seed();
    const repository = createProviderSyncRepository({ db });
    await repository.requestWahooDisconnect({ profileId: owner.profileId });
    const { job, workerId } = await claimDisconnect(owner.integrationId, owner.profileId);
    await db
      .update(integrations)
      .set({
        disconnect_requested_at: null,
        generation: 3,
        lifecycle_status: "active",
        updated_at: new Date(),
      })
      .where(eq(integrations.id, owner.integrationId));
    await db
      .update(integrationCredentials)
      .set({
        access_token: encryptProviderToken("new-access"),
        generation: 2,
        updated_at: new Date(),
      })
      .where(eq(integrationCredentials.integration_id, owner.integrationId));

    await expect(
      repository.finalizeWahooDisconnect({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: job.id,
        outcome: "confirmed",
        workerId,
      }),
    ).resolves.toBe(false);
    expect(
      await db
        .select({ access: integrationCredentials.access_token })
        .from(integrationCredentials)
        .where(eq(integrationCredentials.integration_id, owner.integrationId)),
    ).toHaveLength(1);
  });

  it("keeps webhook receipts bound to the captured generation across disconnect and OAuth reconnect", async () => {
    const owner = await seed();
    const providerUserId = Number.parseInt(randomUUID().replaceAll("-", "").slice(0, 8), 16);
    await db
      .update(integrations)
      .set({ external_id: providerUserId.toString() })
      .where(eq(integrations.id, owner.integrationId));
    const providerSyncRepository = createProviderSyncRepository({ db });
    const importer = { importWorkoutSummary: vi.fn() };
    const service = new WahooWebhookJobService({
      importer: importer as never,
      providerSyncRepository,
      wahooRepository: createWahooRepository({ db }),
    });

    const captured = await service.storeAndEnqueueReceipt({
      event_type: "workout_summary",
      user: { id: providerUserId },
      workout_summary: { id: 101 },
    });
    expect(captured.queued).toBe(true);
    await expect(
      providerSyncRepository.requestWahooDisconnect({ profileId: owner.profileId }),
    ).resolves.toMatchObject({ generation: 2, status: "pending" });
    const { job: disconnectJob, workerId: disconnectWorkerId } = await claimDisconnect(
      owner.integrationId,
      owner.profileId,
    );
    await expect(
      providerSyncRepository.beginWahooDisconnectAttempt({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: disconnectJob.id,
        workerId: disconnectWorkerId,
      }),
    ).resolves.toEqual({ accessToken: "old-access", disposition: "ready" });
    await expect(
      providerSyncRepository.finalizeWahooDisconnect({
        generation: 2,
        integrationId: owner.integrationId,
        jobId: disconnectJob.id,
        outcome: "confirmed",
        workerId: disconnectWorkerId,
      }),
    ).resolves.toBe(true);

    const pendingReceipt = await service.storeAndEnqueueReceipt({
      event_type: "workout_summary",
      user: { id: providerUserId },
      workout_summary: { id: 102 },
    });
    expect(pendingReceipt).toMatchObject({ jobId: null, queued: false });
    expect(
      await db
        .select({
          integrationId: providerWebhookReceipts.integration_id,
          generation: providerWebhookReceipts.integration_generation,
          status: providerWebhookReceipts.processing_status,
        })
        .from(providerWebhookReceipts)
        .where(eq(providerWebhookReceipts.id, pendingReceipt.receiptId)),
    ).toEqual([{ generation: null, integrationId: null, status: "processed" }]);

    const state = `reconnect-${randomUUID()}`;
    await db.insert(oauthStates).values({
      callback_uri: "https://example.test/callback",
      expires_at: new Date(Date.now() + 60_000),
      mobile_redirect_uri: "gradientpeak://oauth",
      profile_id: owner.profileId,
      provider: "wahoo",
      requested_scope: "workouts_read",
      state,
      verifier_hash: "test-verifier",
    });
    const reconnected = await createIntegrationsRepositories(db).integrations.upsertFromOAuthState({
      accessToken: "new-access",
      expectedIntegration: {
        generation: 2,
        kind: "present",
        lifecycleStatus: "disconnected",
      },
      expiresAt: new Date(Date.now() + 3_600_000),
      externalId: providerUserId.toString(),
      now: new Date(),
      profileId: owner.profileId,
      provider: "wahoo",
      refreshToken: "new-refresh",
      scope: "workouts_read",
      state,
    });
    expect(reconnected).toMatchObject({ generation: 3, lifecycle_status: "active" });

    await expect(service.recoverPendingReceipts()).resolves.toEqual({ recovered: 0, skipped: 0 });
    expect(
      await db
        .select({
          status: providerWebhookReceipts.processing_status,
          error: providerWebhookReceipts.last_error,
        })
        .from(providerWebhookReceipts)
        .where(eq(providerWebhookReceipts.id, captured.receiptId)),
    ).toEqual([{ error: "integration_generation_inactive", status: "processed" }]);
    expect(
      await providerSyncRepository.finalizeWebhookReceiptJob({
        jobId: captured.jobId!,
        jobStatus: "completed",
        receiptId: captured.receiptId,
        receiptStatus: "processed",
        workerId: "stale-worker",
      }),
    ).toBe(false);
    expect(importer.importWorkoutSummary).not.toHaveBeenCalled();
    expect(
      await db.select().from(activities).where(eq(activities.profile_id, owner.profileId)),
    ).toEqual([]);
    await db
      .delete(providerWebhookReceipts)
      .where(eq(providerWebhookReceipts.integration_id, owner.integrationId));
  });
});
