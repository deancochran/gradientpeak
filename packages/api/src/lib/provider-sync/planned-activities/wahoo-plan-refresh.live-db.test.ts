import { randomUUID } from "node:crypto";
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
  users,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { activityPlanStructureHash } from "../../../application/activity-plans/structure-hash";
import { encryptProviderToken } from "../../provider-token-crypto";
import {
  enqueueWahooActivityPlanRefreshAfterMutation,
  enqueueWahooPlannedSessionSyncAfterMutation,
} from "./wahoo-calendar-mutation-sync";

const tokenKey = Buffer.alloc(32, 11).toString("base64");
const owners: string[] = [];
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "11111111-1111-4111-8111-111111111111",
      name: "Steady",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "watts", intensity: 180 }],
    },
  ],
});
const semanticHash = activityPlanSemanticHash({ structure, trainingIntent: "general_maintenance" });

function disposableDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return (
      process.env.RUN_PLANNED_SESSION_LIVE_DB === "1" &&
      url.hostname === "127.0.0.1" &&
      url.port === "54322" &&
      /^\/gradientpeak_planned_sessions_\d+_\d+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
const describeDisposable = disposableDatabase() ? describe : describe.skip;

async function seed() {
  const profileId = randomUUID();
  const planId = randomUUID();
  const integrationId = randomUUID();
  owners.push(profileId);
  await db.insert(users).values({
    id: profileId,
    name: "Wahoo refresh",
    email: `${profileId}@test`,
    emailVerified: true,
  });
  await db.insert(profiles).values({
    id: profileId,
    email: `${profileId}@test`,
    full_name: "Wahoo refresh",
    username: `wahoo-${profileId.slice(0, 8)}`,
    onboarding_status: "completed",
    planning_timezone: "UTC",
    is_public: false,
  });
  await db.insert(activityPlans).values({
    id: planId,
    profile_id: profileId,
    name: "Before",
    structure,
    structure_hash: activityPlanStructureHash(structure),
    semantic_hash: semanticHash,
  });
  await db.insert(integrations).values({
    id: integrationId,
    profile_id: profileId,
    provider: "wahoo",
    external_id: randomUUID(),
  });
  await db.insert(integrationCredentials).values({
    integration_id: integrationId,
    access_token: encryptProviderToken("access"),
    refresh_token: encryptProviderToken("refresh"),
    scope: "plans_read plans_write workouts_read workouts_write",
  });
  return { integrationId, planId, profileId };
}
async function schedule(
  profileId: string,
  planId: string,
  date: string,
  status: "scheduled" | "cancelled" | "completed" = "scheduled",
) {
  const id = randomUUID();
  const operationId = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await db.insert(plannedSessions).values({
    id,
    profile_id: profileId,
    planning_date: date,
    original_target_date: date,
    source_kind: "direct",
    direct_operation_id: operationId,
    idempotency_key: `direct:${operationId}`,
    activity_plan_id: planId,
    status,
    ...(status === "cancelled"
      ? { cancellation_reason: "user_requested", cancelled_at: new Date() }
      : {}),
    ...(status === "completed"
      ? { completion_outcome: "skipped", skip_operation_id: randomUUID(), linked_at: new Date() }
      : {}),
  });
  return id;
}
async function refresh(seedData: Awaited<ReturnType<typeof seed>>, date = "2026-10-23") {
  return db.transaction((tx) =>
    enqueueWahooActivityPlanRefreshAfterMutation({
      activityPlanId: seedData.planId,
      db,
      profileId: seedData.profileId,
      transaction: tx,
      upcomingOnOrAfter: date,
    }),
  );
}

afterEach(async () => {
  vi.unstubAllEnvs();
  const owner = owners.pop();
  if (owner) await db.delete(users).where(eq(users.id, owner));
});
afterAll(async () => {
  await pool.end();
});

describeDisposable("Wahoo current-plan refresh against a disposable database", () => {
  it("coalesces two plan edits into the latest current-plan payload and does not admit wrong-owner or completed sessions", async () => {
    vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", tokenKey);
    const seeded = await seed();
    const sessionId = await schedule(seeded.profileId, seeded.planId, "2026-10-24");
    await schedule(seeded.profileId, seeded.planId, "2026-10-24", "cancelled");
    await schedule(seeded.profileId, seeded.planId, "2026-10-24", "completed");
    await db
      .update(activityPlans)
      .set({ name: "First edit" })
      .where(eq(activityPlans.id, seeded.planId));
    await refresh(seeded);
    const [first] = await db
      .select()
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.internal_resource_id, sessionId));
    if (!first) throw new Error("Expected the first current-plan refresh job");
    await db
      .update(providerSyncJobs)
      .set({
        status: "running",
        locked_by: "first-worker",
        locked_at: new Date(),
        lock_expires_at: new Date(Date.now() + 60_000),
      })
      .where(eq(providerSyncJobs.id, first.id));
    await db
      .update(activityPlans)
      .set({ name: "Second edit" })
      .where(eq(activityPlans.id, seeded.planId));
    await refresh(seeded);
    const jobs = await db
      .select()
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.internal_resource_id, sessionId));
    expect(jobs).toHaveLength(2);
    const queued = jobs.find((job) => job.status === "queued");
    expect(queued?.payload_hash).not.toBe(first?.payload_hash);
    expect(queued?.payload).toMatchObject({
      projectionSnapshot: { plan: { header: { name: "Second edit" } } },
    });

    await expect(refresh({ ...seeded, profileId: randomUUID() })).resolves.toBeNull();
    expect(
      await db
        .select()
        .from(providerSyncJobs)
        .where(eq(providerSyncJobs.internal_resource_id, sessionId)),
    ).toHaveLength(2);
  });

  it("replaces a moved publish with cancellation unsync, so an older publish cannot win", async () => {
    vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", tokenKey);
    const seeded = await seed();
    const sessionId = await schedule(seeded.profileId, seeded.planId, "2026-10-24");
    await refresh(seeded);
    await db
      .update(plannedSessions)
      .set({ planning_date: "2026-10-26", session_revision: 2 })
      .where(eq(plannedSessions.id, sessionId));
    await refresh(seeded);
    await db
      .update(plannedSessions)
      .set({
        status: "cancelled",
        cancellation_reason: "user_requested",
        cancelled_at: new Date(),
        session_revision: 3,
      })
      .where(eq(plannedSessions.id, sessionId));
    await db.insert(integrationResourceLinks).values({
      id: randomUUID(),
      profile_id: seeded.profileId,
      integration_id: seeded.integrationId,
      provider: "wahoo",
      resource_kind: "planned_session",
      internal_resource_id: sessionId,
      external_id: "remote-workout",
    });
    await db.transaction((tx) =>
      enqueueWahooPlannedSessionSyncAfterMutation({
        db,
        transaction: tx,
        plannedSessionIds: [sessionId],
        operation: "unsync",
        profileId: seeded.profileId,
      }),
    );
    const [job] = await db
      .select()
      .from(providerSyncJobs)
      .where(
        and(
          eq(providerSyncJobs.internal_resource_id, sessionId),
          eq(providerSyncJobs.status, "queued"),
        ),
      );
    expect(job?.operation).toBe("unsync");
    expect(job?.payload).toMatchObject({ operation: "unsync", plannedSessionId: sessionId });
  });
});
