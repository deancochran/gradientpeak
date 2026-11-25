import { createHash, randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { db, pool } from "@repo/db/client";
import {
  activityPlans,
  integrationCredentials,
  integrationResourceLinks,
  integrations,
  plannedSessions,
  profiles,
  providerSyncJobs,
  relationalSchema,
  users,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { garminProviderRuntime } from "../../application/integrations/garmin-provider-runtime";
import { projectGarminTrainingActivityPlan } from "../../lib/integrations/garmin/training-mapper";
import { executeGarminTrainingSyncJob } from "../../lib/provider-sync/planned-activities/garmin-training-sync";
import {
  admitGarminPlannedSessionSyncWindow,
  claimDueGarminTrainingSyncJobs,
  createDrizzleGarminTrainingSyncRepository,
  enqueueGarminPlannedSessionSync,
} from "./drizzle-garmin-training-sync-repository";

const GARMIN_TRAINING_JOB_TYPE = "garmin.training_planned_session";
const ids: string[] = [];
const now = new Date("2026-10-01T12:00:00.000Z");
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "11111111-1111-4111-8111-111111111111",
      duration: { type: "time", seconds: 60 },
      targets: [],
    },
  ],
});
const semanticHash = activityPlanSemanticHash({ structure, trainingIntent: "general_maintenance" });

function disposableDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  return (
    process.env.RUN_GARMIN_TRAINING_LIVE_DB === "1" &&
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.port === "54322" &&
    /^\/gradientpeak_garmin_training_sync_\d+_\d+$/.test(url.pathname)
  );
}

async function seed(
  input: {
    planningDate?: string;
    structure?: ReturnType<typeof activityPlanStructureSchema.parse>;
  } = {},
) {
  const profileId = randomUUID();
  const integrationId = randomUUID();
  const activityPlanId = randomUUID();
  const plannedSessionId = randomUUID();
  ids.push(profileId);
  await db.insert(users).values({
    id: profileId,
    email: `${profileId}@garmin-training-sync.test`,
    emailVerified: true,
    name: "Garmin training sync test",
  });
  await db.insert(profiles).values({
    id: profileId,
    email: `${profileId}@garmin-training-sync.test`,
    full_name: "Garmin training sync test",
    username: `garmin-${profileId.slice(0, 8)}`,
    planning_timezone: "UTC",
    onboarding_status: "completed",
    is_public: false,
  });
  await db.insert(integrations).values({
    id: integrationId,
    profile_id: profileId,
    provider: "garmin",
    external_id: `synthetic-${profileId}`,
    generation: 1,
  });
  await db.insert(integrationCredentials).values({
    integration_id: integrationId,
    access_token: "enc:v1:synthetic-access-token",
    scope: "WORKOUT_IMPORT",
  });
  await db.insert(activityPlans).values({
    id: activityPlanId,
    profile_id: profileId,
    name: "Synthetic Garmin run",
    training_intent: "general_maintenance",
    structure: input.structure ?? structure,
    structure_hash: activityPlanStructureHash(input.structure ?? structure),
    semantic_hash:
      input.structure === undefined
        ? semanticHash
        : activityPlanSemanticHash({
            structure: input.structure,
            trainingIntent: "general_maintenance",
          }),
  });
  const operationId = `garmin${randomUUID().replaceAll("-", "")}`;
  await db.insert(plannedSessions).values({
    id: plannedSessionId,
    profile_id: profileId,
    planning_date: input.planningDate ?? "2026-10-02",
    original_target_date: input.planningDate ?? "2026-10-02",
    source_kind: "direct",
    direct_operation_id: operationId,
    idempotency_key: `direct:${operationId}`,
    activity_plan_id: activityPlanId,
  });
  return {
    activityPlanId,
    integrationId,
    plannedSessionId,
    profileId,
    planningDate: input.planningDate ?? "2026-10-02",
  };
}

function currentProjectionHash() {
  return createHash("sha256")
    .update(
      JSON.stringify(
        projectGarminTrainingActivityPlan({
          name: "Synthetic Garmin run",
          description: null,
          structure,
        }),
      ),
    )
    .digest("hex");
}

async function markConverged(fixture: Awaited<ReturnType<typeof seed>>) {
  await db.insert(integrationResourceLinks).values({
    id: randomUUID(),
    profile_id: fixture.profileId,
    integration_id: fixture.integrationId,
    provider: "garmin",
    resource_kind: "planned_session",
    internal_resource_id: fixture.plannedSessionId,
    external_id: `activityPlan-${fixture.plannedSessionId}`,
    provider_metadata: {
      garminTraining: {
        workoutId: 7,
        ownerId: 9,
        scheduleId: 8,
        date: fixture.planningDate,
        appliedProjectionHash: currentProjectionHash(),
        integrationGeneration: 1,
      },
    },
  });
}

async function seedJob(input: {
  integrationId: string;
  plannedSessionId: string;
  profileId: string;
  attempt?: number;
  generation?: number;
  payload?: Record<string, unknown>;
  operation?: "publish" | "cancel";
  runAt?: Date;
  status?: "queued" | "failed" | "running";
}) {
  const id = randomUUID();
  await db.insert(providerSyncJobs).values({
    id,
    profile_id: input.profileId,
    integration_id: input.integrationId,
    provider: "garmin",
    integration_generation: input.generation ?? 1,
    job_type: GARMIN_TRAINING_JOB_TYPE,
    operation: input.operation ?? "publish",
    resource_kind: "planned_session",
    internal_resource_id: input.plannedSessionId,
    sync_lane_key: `garmin:${input.integrationId}:planned_session:${input.plannedSessionId}`,
    dedupe_key: `synthetic-${id}`,
    payload: input.payload ?? {
      plannedSessionId: input.plannedSessionId,
      planningDate: "2026-10-02",
      operation: "publish",
    },
    run_at: input.runAt ?? now,
    attempt: input.attempt ?? 0,
    max_attempts: 3,
    status: input.status ?? "queued",
  });
  return id;
}

const describeDisposable = disposableDatabase() ? describe : describe.skip;

beforeAll(() => {
  if (!disposableDatabase())
    throw new Error("Garmin training live DB tests require their guarded disposable database");
});
afterEach(async () => {
  await Promise.all(ids.splice(0).map((id) => db.delete(users).where(eq(users.id, id))));
});
afterAll(async () => pool.end());

describeDisposable("Drizzle Garmin training queue against a disposable database", () => {
  it("keeps a schedule-create receipt authoritative over an existing activityPlan link", async () => {
    const fixture = await seed();
    const jobId = await seedJob({
      ...fixture,
      status: "running",
      payload: {
        plannedSessionId: fixture.plannedSessionId,
        garminTraining: { recoveryPhase: "schedule_create" },
      },
    });
    await db
      .update(providerSyncJobs)
      .set({ locked_by: "worker-a", lock_expires_at: new Date(now.getTime() + 60_000) })
      .where(eq(providerSyncJobs.id, jobId));
    await db.insert(integrationResourceLinks).values({
      id: randomUUID(),
      profile_id: fixture.profileId,
      integration_id: fixture.integrationId,
      provider: "garmin",
      resource_kind: "planned_session",
      internal_resource_id: fixture.plannedSessionId,
      external_id: "7",
      provider_metadata: { garminTraining: { workoutId: 7, ownerId: 9 } },
    });
    const state = await createDrizzleGarminTrainingSyncRepository(db, "worker-a").load({
      id: jobId,
      ...fixture,
      integrationGeneration: 1,
      operation: "publish",
      planningDate: "2026-10-02",
    });
    expect(state).toEqual({ kind: "recovery_required", phase: "schedule_create" });
  });

  it("retains a returned activityPlan receipt when disconnect wins before follow-up", async () => {
    const fixture = await seed();
    const jobId = await seedJob({ ...fixture, status: "running" });
    await db
      .update(providerSyncJobs)
      .set({
        locked_by: "worker-a",
        locked_at: new Date(),
        lock_expires_at: new Date(Date.now() + 60_000),
        attempt: 1,
      })
      .where(eq(providerSyncJobs.id, jobId));
    const store = createDrizzleGarminTrainingSyncRepository(db, "worker-a");
    let disconnected = false;
    const job = {
      id: jobId,
      ...fixture,
      integrationGeneration: 1,
      operation: "publish" as const,
      planningDate: "2026-10-02",
      attempt: 1,
    };
    const result = await executeGarminTrainingSyncJob({
      job,
      store: {
        ...store,
        isActiveAndGranted: async (candidate) =>
          !disconnected && store.isActiveAndGranted(candidate),
      },
      remote: {
        createActivityPlan: async () => {
          await db
            .update(integrations)
            .set({ lifecycle_status: "disconnect_pending" })
            .where(eq(integrations.id, fixture.integrationId));
          disconnected = true;
          return { workoutId: 77, ownerId: 99 };
        },
        updateActivityPlan: async () => {
          throw new Error("unexpected update");
        },
        createSchedule: async () => {
          throw new Error("must not schedule after disconnect");
        },
        updateSchedule: async () => {
          throw new Error("unexpected update");
        },
        deleteSchedule: async () => {
          throw new Error("unexpected delete");
        },
        deleteActivityPlan: async () => {
          throw new Error("unexpected delete");
        },
      },
    });
    expect(result).toBe("failed");
    await expect(
      db
        .select({
          payload: providerSyncJobs.payload,
          status: providerSyncJobs.status,
          error: providerSyncJobs.last_error,
        })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, jobId)),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "dead_lettered",
        error: "stale_generation",
        payload: expect.objectContaining({
          garminTraining: expect.objectContaining({
            recoveryPhase: "workout_create",
            receipt: expect.objectContaining({
              operationId: jobId,
              attempt: 1,
              integrationGeneration: 1,
              outcome: { workoutId: 77, ownerId: 99 },
            }),
          }),
        }),
      }),
    ]);
    await expect(
      db
        .select()
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.integration_id, fixture.integrationId)),
    ).resolves.toEqual([]);
  });

  it("does not reuse a resource link from an older integration generation", async () => {
    const fixture = await seed();
    const jobId = await seedJob({ ...fixture, generation: 2, status: "running" });
    await db
      .update(integrations)
      .set({ generation: 2 })
      .where(eq(integrations.id, fixture.integrationId));
    await db
      .update(providerSyncJobs)
      .set({ locked_by: "worker-a", lock_expires_at: new Date(Date.now() + 60_000), attempt: 1 })
      .where(eq(providerSyncJobs.id, jobId));
    await db.insert(integrationResourceLinks).values({
      id: randomUUID(),
      profile_id: fixture.profileId,
      integration_id: fixture.integrationId,
      provider: "garmin",
      resource_kind: "planned_session",
      internal_resource_id: fixture.plannedSessionId,
      external_id: "7",
      provider_metadata: { garminTraining: { workoutId: 7, ownerId: 9, integrationGeneration: 1 } },
    });
    const job = {
      id: jobId,
      ...fixture,
      integrationGeneration: 2,
      operation: "publish" as const,
      planningDate: "2026-10-02",
      attempt: 1,
    };
    const store = createDrizzleGarminTrainingSyncRepository(db, "worker-a");
    await expect(store.load(job)).resolves.toEqual({
      kind: "recovery_required",
      phase: "workout_update",
    });
    await expect(
      executeGarminTrainingSyncJob({
        job,
        store,
        remote: {
          createActivityPlan: async () => {
            throw new Error("must not create from a stale link");
          },
          updateActivityPlan: async () => {
            throw new Error("must not update from a stale link");
          },
          createSchedule: async () => {
            throw new Error("must not schedule from a stale link");
          },
          updateSchedule: async () => {
            throw new Error("must not move from a stale link");
          },
          deleteSchedule: async () => {
            throw new Error("must not delete from a stale link");
          },
          deleteActivityPlan: async () => {
            throw new Error("must not delete from a stale link");
          },
        },
      }),
    ).resolves.toBe("recovery_required");
    await expect(
      db
        .select({
          externalId: integrationResourceLinks.external_id,
          metadata: integrationResourceLinks.provider_metadata,
        })
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.integration_id, fixture.integrationId)),
    ).resolves.toEqual([
      {
        externalId: "7",
        metadata: { garminTraining: { workoutId: 7, ownerId: 9, integrationGeneration: 1 } },
      },
    ]);
  });

  it("records an expired lease response only while its immutable attempt remains claimed", async () => {
    const fixture = await seed();
    const jobId = await seedJob({ ...fixture, status: "running" });
    const job = {
      id: jobId,
      ...fixture,
      integrationGeneration: 1,
      operation: "publish" as const,
      planningDate: "2026-10-02",
      attempt: 1,
    };
    await db
      .update(providerSyncJobs)
      .set({ locked_by: "worker-a", lock_expires_at: new Date(Date.now() - 1_000), attempt: 1 })
      .where(eq(providerSyncJobs.id, jobId));
    const store = createDrizzleGarminTrainingSyncRepository(db, "worker-a");
    await expect(
      store.recordActivityPlanOutcome(job, { workoutId: 77, ownerId: 99 }),
    ).resolves.toBeUndefined();
    await db
      .update(providerSyncJobs)
      .set({ locked_by: "worker-b", lock_expires_at: new Date(Date.now() + 60_000), attempt: 2 })
      .where(eq(providerSyncJobs.id, jobId));
    await expect(
      store.recordActivityPlanOutcome(job, { workoutId: 88, ownerId: 100 }),
    ).rejects.toThrow("garmin_training_lease_or_attempt_lost");
    await expect(
      db
        .select({ payload: providerSyncJobs.payload })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, jobId)),
    ).resolves.toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          garminTraining: expect.objectContaining({
            receipt: expect.objectContaining({ outcome: { workoutId: 77, ownerId: 99 } }),
          }),
        }),
      }),
    ]);
  });

  it("does not reclaim an expired pre-POST receipt and lets its original attempt retain the returned ID", async () => {
    const fixture = await seed();
    const jobId = await seedJob({
      ...fixture,
      status: "running",
      attempt: 1,
      payload: {
        plannedSessionId: fixture.plannedSessionId,
        planningDate: fixture.planningDate,
        garminTraining: { recoveryPhase: "workout_create" },
      },
    });
    await db
      .update(providerSyncJobs)
      .set({
        locked_by: "worker-a",
        locked_at: new Date(now.getTime() - 120_000),
        lock_expires_at: new Date(now.getTime() - 60_000),
      })
      .where(eq(providerSyncJobs.id, jobId));

    await expect(
      claimDueGarminTrainingSyncJobs({ db, workerId: "worker-b", now }),
    ).resolves.toEqual([]);

    const original = {
      id: jobId,
      ...fixture,
      integrationGeneration: 1,
      operation: "publish" as const,
      planningDate: fixture.planningDate,
      attempt: 1,
    };
    await expect(
      createDrizzleGarminTrainingSyncRepository(db, "worker-a").recordActivityPlanOutcome(
        original,
        {
          workoutId: 77,
          ownerId: 99,
        },
      ),
    ).resolves.toBeUndefined();
    await expect(
      db
        .select({
          attempt: providerSyncJobs.attempt,
          lockedBy: providerSyncJobs.locked_by,
          status: providerSyncJobs.status,
          payload: providerSyncJobs.payload,
        })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, jobId)),
    ).resolves.toEqual([
      expect.objectContaining({
        attempt: 1,
        lockedBy: "worker-a",
        status: "running",
        payload: expect.objectContaining({
          garminTraining: expect.objectContaining({
            receipt: expect.objectContaining({ outcome: { workoutId: 77, ownerId: 99 } }),
          }),
        }),
      }),
    ]);
  });

  it("coalesces cancellation behind a running publish and performs cleanup only after it finishes", async () => {
    const fixture = await seed();
    const liveNow = new Date();
    await markConverged(fixture);
    const runningId = await seedJob({
      ...fixture,
      status: "running",
      attempt: 1,
      payload: {
        plannedSessionId: fixture.plannedSessionId,
        planningDate: fixture.planningDate,
        garminTraining: { recoveryPhase: "workout_create" },
      },
    });
    await db
      .update(providerSyncJobs)
      .set({ locked_by: "worker-a", lock_expires_at: new Date(liveNow.getTime() - 60_000) })
      .where(eq(providerSyncJobs.id, runningId));
    await db
      .update(plannedSessions)
      .set({ status: "cancelled", cancellation_reason: "user_requested", cancelled_at: now })
      .where(eq(plannedSessions.id, fixture.plannedSessionId));

    const successor = await enqueueGarminPlannedSessionSync({
      db,
      ...fixture,
      operation: "cancel",
      now,
    });
    expect(successor).toMatchObject({ queued: true });
    await expect(
      claimDueGarminTrainingSyncJobs({ db, workerId: "worker-b", now }),
    ).resolves.toEqual([]);

    await db
      .update(providerSyncJobs)
      .set({ status: "completed", locked_at: null, locked_by: null, lock_expires_at: null })
      .where(eq(providerSyncJobs.id, runningId));
    const [claimed] = await claimDueGarminTrainingSyncJobs({
      db,
      workerId: "worker-b",
      now: liveNow,
    });
    expect(claimed).toMatchObject({ id: successor?.id, operation: "cancel" });
    if (!claimed) throw new Error("expected cancellation successor claim");
    const deleted: string[] = [];
    await expect(
      executeGarminTrainingSyncJob({
        job: claimed,
        store: createDrizzleGarminTrainingSyncRepository(db, "worker-b"),
        remote: {
          createActivityPlan: async () => {
            throw new Error("must not publish after cancellation");
          },
          updateActivityPlan: async () => {
            throw new Error("must not update after cancellation");
          },
          createSchedule: async () => {
            throw new Error("must not schedule after cancellation");
          },
          updateSchedule: async () => {
            throw new Error("must not move after cancellation");
          },
          deleteSchedule: async (id) => void deleted.push(`schedule:${id}`),
          deleteActivityPlan: async ({ workoutId: activityPlanId }) =>
            void deleted.push(`activityPlan:${activityPlanId}`),
        },
      }),
    ).resolves.toBe("completed");
    expect(deleted).toEqual(["schedule:8", "activityPlan:7"]);
    await expect(
      db
        .select({ id: integrationResourceLinks.id })
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.integration_id, fixture.integrationId)),
    ).resolves.toEqual([]);
  });

  it("retains a terminal pre-PUT receipt and existing schedule link when the update outcome is unknown", async () => {
    const fixture = await seed();
    const liveNow = new Date();
    await markConverged(fixture);
    const jobId = await seedJob({ ...fixture, status: "running", attempt: 1 });
    await db
      .update(providerSyncJobs)
      .set({ locked_by: "worker-a", lock_expires_at: new Date(liveNow.getTime() + 60_000) })
      .where(eq(providerSyncJobs.id, jobId));
    const job = {
      id: jobId,
      ...fixture,
      integrationGeneration: 1,
      operation: "publish" as const,
      planningDate: "2026-10-03",
      attempt: 1,
      desiredProjectionHash: currentProjectionHash(),
    };
    await expect(
      executeGarminTrainingSyncJob({
        job,
        store: createDrizzleGarminTrainingSyncRepository(db, "worker-a"),
        remote: {
          createActivityPlan: async () => {
            throw new Error("unexpected create");
          },
          updateActivityPlan: async () => {
            throw new Error("unexpected activityPlan update");
          },
          createSchedule: async () => {
            throw new Error("unexpected schedule create");
          },
          updateSchedule: async () => {
            throw new Error("unknown PUT outcome");
          },
          deleteSchedule: async () => {
            throw new Error("unexpected delete");
          },
          deleteActivityPlan: async () => {
            throw new Error("unexpected delete");
          },
        },
      }),
    ).resolves.toBe("recovery_required");
    await expect(
      db
        .select({ status: providerSyncJobs.status, payload: providerSyncJobs.payload })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, jobId)),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "dead_lettered",
        payload: expect.objectContaining({
          garminTraining: expect.objectContaining({
            recoveryPhase: "schedule_update",
            receipt: expect.objectContaining({
              attempt: 1,
              integrationGeneration: 1,
              outcome: expect.objectContaining({
                scheduleId: 8,
                workoutId: 7,
                ownerId: 9,
                desiredDate: "2026-10-03",
                payloadHash: currentProjectionHash(),
              }),
            }),
          }),
        }),
      }),
    ]);
    await expect(
      db
        .select({ metadata: integrationResourceLinks.provider_metadata })
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.integration_id, fixture.integrationId)),
    ).resolves.toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          garminTraining: expect.objectContaining({ scheduleId: 8 }),
        }),
      }),
    ]);
  });

  it("retains pre-delete receipts and durably advances from a successful schedule delete before activityPlan delete", async () => {
    const fixture = await seed();
    const liveNow = new Date();
    await markConverged(fixture);
    const jobId = await seedJob({ ...fixture, status: "running", attempt: 1, operation: "cancel" });
    await db
      .update(providerSyncJobs)
      .set({ locked_by: "worker-a", lock_expires_at: new Date(liveNow.getTime() + 60_000) })
      .where(eq(providerSyncJobs.id, jobId));
    const job = {
      id: jobId,
      ...fixture,
      integrationGeneration: 1,
      operation: "cancel" as const,
      planningDate: fixture.planningDate,
      attempt: 1,
    };
    await expect(
      executeGarminTrainingSyncJob({
        job,
        store: createDrizzleGarminTrainingSyncRepository(db, "worker-a"),
        remote: {
          createActivityPlan: async () => {
            throw new Error("unexpected create");
          },
          updateActivityPlan: async () => {
            throw new Error("unexpected update");
          },
          createSchedule: async () => {
            throw new Error("unexpected schedule");
          },
          updateSchedule: async () => {
            throw new Error("unexpected update");
          },
          deleteSchedule: async () => undefined,
          deleteActivityPlan: async () => {
            throw new Error("unknown DELETE outcome");
          },
        },
      }),
    ).resolves.toBe("recovery_required");
    await expect(
      db
        .select({ status: providerSyncJobs.status, payload: providerSyncJobs.payload })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, jobId)),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "dead_lettered",
        payload: expect.objectContaining({
          garminTraining: expect.objectContaining({
            recoveryPhase: "workout_delete",
            receipt: expect.objectContaining({
              outcome: expect.objectContaining({ workoutId: 7, ownerId: 9 }),
            }),
          }),
        }),
      }),
    ]);
    await expect(
      db
        .select({ metadata: integrationResourceLinks.provider_metadata })
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.integration_id, fixture.integrationId)),
    ).resolves.toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          garminTraining: expect.objectContaining({ workoutId: 7, ownerId: 9 }),
        }),
      }),
    ]);
  });

  it("retains a schedule-delete receipt with the linked IDs when its DELETE outcome is unknown", async () => {
    const fixture = await seed();
    const liveNow = new Date();
    await markConverged(fixture);
    const jobId = await seedJob({ ...fixture, status: "running", attempt: 1, operation: "cancel" });
    await db
      .update(providerSyncJobs)
      .set({ locked_by: "worker-a", lock_expires_at: new Date(liveNow.getTime() + 60_000) })
      .where(eq(providerSyncJobs.id, jobId));
    await expect(
      executeGarminTrainingSyncJob({
        job: {
          id: jobId,
          ...fixture,
          integrationGeneration: 1,
          operation: "cancel",
          planningDate: fixture.planningDate,
          attempt: 1,
        },
        store: createDrizzleGarminTrainingSyncRepository(db, "worker-a"),
        remote: {
          createActivityPlan: async () => {
            throw new Error("unexpected create");
          },
          updateActivityPlan: async () => {
            throw new Error("unexpected update");
          },
          createSchedule: async () => {
            throw new Error("unexpected schedule");
          },
          updateSchedule: async () => {
            throw new Error("unexpected update");
          },
          deleteSchedule: async () => {
            throw new Error("unknown DELETE outcome");
          },
          deleteActivityPlan: async () => {
            throw new Error("must not delete activityPlan after uncertain schedule delete");
          },
        },
      }),
    ).resolves.toBe("recovery_required");
    await expect(
      db
        .select({ status: providerSyncJobs.status, payload: providerSyncJobs.payload })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, jobId)),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "dead_lettered",
        payload: expect.objectContaining({
          garminTraining: expect.objectContaining({
            recoveryPhase: "schedule_delete",
            receipt: expect.objectContaining({
              attempt: 1,
              integrationGeneration: 1,
              outcome: expect.objectContaining({ scheduleId: 8, workoutId: 7, ownerId: 9 }),
            }),
          }),
        }),
      }),
    ]);
  });

  it("claims one lane only once across two PostgreSQL connections", async () => {
    const fixture = await seed();
    const jobId = await seedJob(fixture);
    const one = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const two = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const claimed = await Promise.all([
        claimDueGarminTrainingSyncJobs({
          db: drizzle({ client: one, schema: relationalSchema, casing: "snake_case" }),
          workerId: "worker-one",
          now,
        }),
        claimDueGarminTrainingSyncJobs({
          db: drizzle({ client: two, schema: relationalSchema, casing: "snake_case" }),
          workerId: "worker-two",
          now,
        }),
      ]);
      expect(claimed.flat().map((job) => job.id)).toEqual([jobId]);
      await expect(
        db
          .select({ status: providerSyncJobs.status, lockedBy: providerSyncJobs.locked_by })
          .from(providerSyncJobs)
          .where(eq(providerSyncJobs.id, jobId)),
      ).resolves.toEqual([{ status: "running", lockedBy: expect.stringMatching(/^worker-/) }]);
    } finally {
      await Promise.all([one.end(), two.end()]);
    }
  });

  it("dead-letters exhausted lanes rather than claiming them", async () => {
    const fixture = await seed();
    const jobId = await seedJob({ ...fixture, attempt: 3 });
    await expect(claimDueGarminTrainingSyncJobs({ db, workerId: "worker", now })).resolves.toEqual(
      [],
    );
    await expect(
      db
        .select({ status: providerSyncJobs.status, error: providerSyncJobs.last_error })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, jobId)),
    ).resolves.toEqual([{ status: "dead_lettered", error: "max_attempts_exhausted" }]);
  });

  it("does not claim retries before their next run time", async () => {
    const fixture = await seed();
    await seedJob({
      ...fixture,
      status: "failed",
      attempt: 1,
      runAt: new Date(now.getTime() + 60_000),
    });
    await expect(claimDueGarminTrainingSyncJobs({ db, workerId: "worker", now })).resolves.toEqual(
      [],
    );
  });

  it("rejects stale integration generations and non-scheduled publish admission", async () => {
    const stale = await seed();
    await seedJob({ ...stale, generation: 2 });
    await expect(claimDueGarminTrainingSyncJobs({ db, workerId: "worker", now })).resolves.toEqual(
      [],
    );
    const accepted = await seed();
    await expect(
      enqueueGarminPlannedSessionSync({
        db,
        ...accepted,
        planningDate: "2026-10-02",
        operation: "publish",
        now,
      }),
    ).resolves.toMatchObject({ queued: true });
    await expect(
      db
        .select({ status: providerSyncJobs.status })
        .from(providerSyncJobs)
        .where(
          and(
            eq(providerSyncJobs.integration_id, accepted.integrationId),
            eq(providerSyncJobs.internal_resource_id, accepted.plannedSessionId),
          ),
        ),
    ).resolves.toEqual([{ status: "queued" }]);
    const cancelled = await seed();
    await db
      .update(plannedSessions)
      .set({ status: "cancelled", cancellation_reason: "user_requested", cancelled_at: now })
      .where(eq(plannedSessions.id, cancelled.plannedSessionId));
    await expect(
      enqueueGarminPlannedSessionSync({
        db,
        ...cancelled,
        planningDate: "2026-10-02",
        operation: "publish",
        now,
      }),
    ).resolves.toBeNull();
    await expect(
      db
        .select({ id: providerSyncJobs.id })
        .from(providerSyncJobs)
        .where(
          and(
            eq(providerSyncJobs.integration_id, cancelled.integrationId),
            eq(providerSyncJobs.internal_resource_id, cancelled.plannedSessionId),
          ),
        ),
    ).resolves.toEqual([]);
  });

  it("admits and claims a new generation after an old clean failed lane", async () => {
    const fixture = await seed();
    const oldJobId = await seedJob({ ...fixture, status: "failed", generation: 1, attempt: 1 });
    await db
      .update(integrations)
      .set({ generation: 2 })
      .where(eq(integrations.id, fixture.integrationId));

    await expect(admitGarminPlannedSessionSyncWindow({ db, now })).resolves.toEqual({
      profiles: 1,
      queued: 1,
    });
    const [claimed] = await claimDueGarminTrainingSyncJobs({ db, workerId: "worker", now });
    expect(claimed).toMatchObject({
      integrationGeneration: 2,
      plannedSessionId: fixture.plannedSessionId,
    });
    await expect(
      db
        .select({ status: providerSyncJobs.status })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.id, oldJobId)),
    ).resolves.toEqual([{ status: "failed" }]);
  });

  it("retains an old pre-effect receipt as a recovery block after reconnect", async () => {
    const fixture = await seed();
    await seedJob({
      ...fixture,
      status: "failed",
      generation: 1,
      payload: {
        plannedSessionId: fixture.plannedSessionId,
        planningDate: fixture.planningDate,
        garminTraining: { recoveryPhase: "workout_create" },
      },
    });
    await db
      .update(integrations)
      .set({ generation: 2 })
      .where(eq(integrations.id, fixture.integrationId));

    await expect(admitGarminPlannedSessionSyncWindow({ db, now })).resolves.toEqual({
      profiles: 0,
      queued: 0,
    });
    if (garminProviderRuntime.execution.kind !== "server")
      throw new Error("Expected server Garmin runtime");
    await expect(
      garminProviderRuntime.execution.server.overview.readOverviewEvidence({
        db,
        profileId: fixture.profileId,
        integration: { id: fixture.integrationId, generation: 2, lifecycleStatus: "active" },
        scope: "WORKOUT_IMPORT",
      }),
    ).resolves.toMatchObject({ plannedActivities: { status: "recovery_required" } });
  });

  it("does not report an expired old running lease as current syncing", async () => {
    const fixture = await seed();
    const oldJobId = await seedJob({ ...fixture, status: "running", generation: 1, attempt: 1 });
    await db
      .update(providerSyncJobs)
      .set({ lock_expires_at: new Date(now.getTime() - 60_000), locked_by: "old-worker" })
      .where(eq(providerSyncJobs.id, oldJobId));
    await db
      .update(integrations)
      .set({ generation: 2 })
      .where(eq(integrations.id, fixture.integrationId));
    if (garminProviderRuntime.execution.kind !== "server")
      throw new Error("Expected server Garmin runtime");
    await expect(
      garminProviderRuntime.execution.server.overview.readOverviewEvidence({
        db,
        profileId: fixture.profileId,
        integration: { id: fixture.integrationId, generation: 2, lifecycleStatus: "active" },
        scope: "WORKOUT_IMPORT",
      }),
    ).resolves.toMatchObject({ plannedActivities: { status: "automatic", queuedJobId: null } });
    await expect(admitGarminPlannedSessionSyncWindow({ db, now })).resolves.toEqual({
      profiles: 1,
      queued: 1,
    });
    await expect(claimDueGarminTrainingSyncJobs({ db, workerId: "worker", now })).resolves.toEqual([
      expect.objectContaining({ integrationGeneration: 2 }),
    ]);
  });

  it("does not enqueue an unchanged, already-converged session on repeated admission", async () => {
    const fixture = await seed();
    await markConverged(fixture);
    await expect(admitGarminPlannedSessionSyncWindow({ db, now })).resolves.toEqual({
      profiles: 0,
      queued: 0,
    });
    await expect(admitGarminPlannedSessionSyncWindow({ db, now })).resolves.toEqual({
      profiles: 0,
      queued: 0,
    });
    await expect(
      db
        .select({ id: providerSyncJobs.id })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.profile_id, fixture.profileId)),
    ).resolves.toEqual([]);
  });

  it("admits a changed projection for the same planning date without creating a second unchanged lane", async () => {
    const fixture = await seed();
    await markConverged(fixture);
    await db
      .update(activityPlans)
      .set({ name: "Changed Garmin run" })
      .where(eq(activityPlans.id, fixture.activityPlanId));
    await expect(admitGarminPlannedSessionSyncWindow({ db, now })).resolves.toEqual({
      profiles: 1,
      queued: 1,
    });
    await expect(
      db
        .select({ id: providerSyncJobs.id })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.profile_id, fixture.profileId)),
    ).resolves.toHaveLength(1);
  });

  it("round-robins past ten converged profiles instead of starving the eleventh", async () => {
    const fixtures = [] as Awaited<ReturnType<typeof seed>>[];
    for (let index = 0; index < 11; index += 1) {
      const fixture = await seed();
      // Make the first bounded SQL page deterministic without depending on UUID
      // ordering or the database clock's timestamp precision.
      await db
        .update(integrations)
        .set({ created_at: new Date(`2020-01-01T00:00:00.${String(index).padStart(3, "0")}Z`) })
        .where(eq(integrations.id, fixture.integrationId));
      fixtures.push(fixture);
    }
    const last = fixtures[10];
    if (!last) throw new Error("test fixture must contain eleven profiles");
    await Promise.all(fixtures.filter((fixture) => fixture !== last).map(markConverged));
    // A bounded first page may contain only converged profiles. The persisted
    // round-robin priority must make the omitted profile visible on the next drain.
    await expect(
      admitGarminPlannedSessionSyncWindow({ db, now, profileLimit: 10 }),
    ).resolves.toEqual({ profiles: 0, queued: 0 });
    await expect(
      admitGarminPlannedSessionSyncWindow({ db, now, profileLimit: 10 }),
    ).resolves.toEqual({ profiles: 1, queued: 1 });
    await expect(
      db
        .select({ id: providerSyncJobs.id })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.profile_id, last.profileId)),
    ).resolves.toHaveLength(1);
  });

  it("keyset-pages past fifty converged sessions to eventually admit later work", async () => {
    const fixture = await seed();
    await markConverged(fixture);
    for (let index = 0; index < 50; index += 1) {
      const sessionId = randomUUID();
      const operationId = `garmin${randomUUID().replaceAll("-", "")}`;
      await db.insert(plannedSessions).values({
        id: sessionId,
        profile_id: fixture.profileId,
        planning_date: "2026-10-02",
        original_target_date: "2026-10-02",
        source_kind: "direct",
        direct_operation_id: operationId,
        idempotency_key: `direct:${operationId}`,
        activity_plan_id: fixture.activityPlanId,
      });
      await db.insert(integrationResourceLinks).values({
        id: randomUUID(),
        profile_id: fixture.profileId,
        integration_id: fixture.integrationId,
        provider: "garmin",
        resource_kind: "planned_session",
        internal_resource_id: sessionId,
        external_id: `activityPlan-${sessionId}`,
        provider_metadata: {
          garminTraining: {
            workoutId: 7,
            ownerId: 9,
            scheduleId: 8,
            date: "2026-10-02",
            appliedProjectionHash: currentProjectionHash(),
            integrationGeneration: 1,
          },
        },
      });
    }
    const newSessionId = randomUUID();
    const newOperationId = `garmin${randomUUID().replaceAll("-", "")}`;
    await db.insert(plannedSessions).values({
      id: newSessionId,
      profile_id: fixture.profileId,
      planning_date: "2026-10-03",
      original_target_date: "2026-10-03",
      source_kind: "direct",
      direct_operation_id: newOperationId,
      idempotency_key: `direct:${newOperationId}`,
      activity_plan_id: fixture.activityPlanId,
    });
    // Each drain reads at most five sessions for an integration. Ten drains
    // cannot reach this later session; the eleventh proves durable keyset progress
    // rather than a full-window scan hidden behind a 50-job admission cap.
    for (let index = 0; index < 10; index += 1)
      await expect(
        admitGarminPlannedSessionSyncWindow({ db, now, profileId: fixture.profileId }),
      ).resolves.toEqual({ profiles: 0, queued: 0 });
    await expect(
      admitGarminPlannedSessionSyncWindow({ db, now, profileId: fixture.profileId }),
    ).resolves.toEqual({ profiles: 1, queued: 1 });
    await expect(
      db
        .select({ id: providerSyncJobs.id })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.internal_resource_id, newSessionId)),
    ).resolves.toHaveLength(1);
  });

  it("skips unsupported plans without repeatedly creating terminal lanes", async () => {
    const unsupported = activityPlanStructureSchema.parse({
      ...structure,
      activity_category: "swim",
    });
    const fixture = await seed({ structure: unsupported });
    await expect(admitGarminPlannedSessionSyncWindow({ db, now })).resolves.toEqual({
      profiles: 0,
      queued: 0,
    });
    await expect(admitGarminPlannedSessionSyncWindow({ db, now })).resolves.toEqual({
      profiles: 0,
      queued: 0,
    });
    await expect(
      db
        .select({ id: providerSyncJobs.id })
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.profile_id, fixture.profileId)),
    ).resolves.toEqual([]);
  });
});
