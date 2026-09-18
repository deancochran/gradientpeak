import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION } from "@repo/core/athlete-derived-state";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityPlans,
  activitySegments,
  groupEvents,
  groupMemberships,
  groups,
  plannedSessions,
  profiles,
  relationalSchema,
  thresholdEvidence,
  trainingPlans,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";
import { createDrizzleAthleteDerivedStateRepository } from "../../infrastructure/repositories/drizzle-athlete-derived-state-repository";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories/drizzle-planned-session-repository";
import { groupEventsRouter } from "../../routers/groups/events";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { createRouterCaller } from "../../test/router";
import { deleteActivityForProfile } from "../activities/activity-mutations";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { cancelPlannedSession } from "./cancel-planned-session";
import { createDirectPlannedSession } from "./create-direct-planned-session";
import { createPlannedSession } from "./create-planned-session";
import { linkPlannedSessionCompletion } from "./link-planned-session-completion";
import { linkPlannedSessionGroupEvent } from "./link-planned-session-group-event";
import { movePlannedSession } from "./move-planned-session";
import {
  PlannedSessionAccessError,
  PlannedSessionFutureDateError,
  PlannedSessionStaleRevisionError,
  PlannedSessionStateConflictError,
} from "./planned-session-errors";
import { readPlannedSessionRange } from "./read-planned-session-range";
import {
  ManualCompletionReconciliationConflictError,
  reconcileManualPlannedSessionCompletion,
} from "./reconcile-manual-planned-session-completion";
import { removeGroupEventAssociationsForDeletion } from "./remove-group-event-associations";
import { skipPlannedSession } from "./skip-planned-session";
import { unlinkDeletedActivityCompletion } from "./unlink-deleted-activity-completion";

function isDisposablePlannedSessionDatabase(): boolean {
  if (process.env.RUN_PLANNED_SESSION_LIVE_DB !== "1") return false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return (
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.port === "54322" &&
      /^\/gradientpeak_planned_sessions_\d+_\d+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

const describeDisposable = isDisposablePlannedSessionDatabase() ? describe : describe.skip;

const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "bike",
  segments: [
    {
      id: randomUUID(),
      role: "activity",
      name: "Ride",
      intervals: [
        {
          id: randomUUID(),
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: randomUUID(),
              name: "Steady",
              duration: { type: "time", seconds: 1800 },
              targets: [{ type: "%FTP", intensity: 75 }],
            },
          ],
        },
      ],
    },
  ],
});
const semanticHash = activityPlanSemanticHash({
  structure,
  adaptation: null,
  trainingIntent: "general_maintenance",
});

async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@planned-session-services.test`;
  await db.insert(users).values({ id, name: label, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `planned-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    planning_timezone: "UTC",
    is_public: false,
  });
  return id;
}

function directSession(input: {
  id?: string;
  profileId: string;
  activityPlanId: string;
  operationId: string;
  planningDate?: string;
  groupEventId?: string | null;
}) {
  const planningDate = input.planningDate ?? "2026-08-20";
  const source = { kind: "direct" as const, operationId: input.operationId };
  return plannedSessionSchema.parse({
    contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
    id: input.id ?? randomUUID(),
    profileId: input.profileId,
    sessionRevision: 1,
    planningDate,
    originalTargetDate: planningDate,
    source,
    idempotencyKey: plannedSessionIdempotencyKey(source),
    groupEventId: input.groupEventId ?? null,
    prescription: {
      resolutionManifest: createResolutionManifestFixture({
        activityPlanId: input.activityPlanId,
        structure,
        demand: {
          activity_category: "bike",
          training_intent: "general_maintenance",
          target_duration_minutes: 30,
          target_common_load: null,
          importance: "normal",
        },
      }),
      capturedAt: "2026-08-01T00:00:00.000Z",
    },
    lifecycle: { status: "scheduled" },
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitForBackendBlockedBy(
  blockingPid: number,
  relationName: "group_events" | "group_memberships",
  timeoutMs = 3_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: number }>(
      `
        select count(*)::int as count
        from pg_stat_activity
        where datname = current_database()
          and wait_event_type = 'Lock'
          and query ilike $2
          and $1 = any(pg_blocking_pids(pid))
      `,
      [blockingPid, `%${relationName}%`],
    );
    if (Number(result.rows[0]?.count) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for a ${relationName} row lock`);
}

async function within<T>(promise: Promise<T>, timeoutMs = 5_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

afterAll(async () => {
  await pool.end();
});

describeDisposable("planned-session services against a disposable database", () => {
  it("enforces lifecycle, ownership, idempotency, associations, and deletion history", async () => {
    const profileId = await seedProfile("Planned session owner");
    const otherProfileId = await seedProfile("Other planned session owner");
    const ownActivityPlanId = randomUUID();
    const otherActivityPlanId = randomUUID();
    const systemActivityPlanId = randomUUID();
    const ownTrainingPlanId = randomUUID();
    const otherTrainingPlanId = randomUUID();
    const systemTrainingPlanId = randomUUID();
    const groupId = randomUUID();
    try {
      await db.insert(activityPlans).values([
        {
          id: ownActivityPlanId,
          profile_id: profileId,
          name: "Owned activity plan",
          structure,
          structure_hash: activityPlanStructureHash(structure),
          semantic_hash: semanticHash,
        },
        {
          id: otherActivityPlanId,
          profile_id: otherProfileId,
          name: "Other activity plan",
          structure,
          structure_hash: `v1:sha256:${"2".repeat(64)}`,
          semantic_hash: semanticHash,
        },
        {
          id: systemActivityPlanId,
          profile_id: null,
          name: "System activity plan",
          structure,
          structure_hash: activityPlanStructureHash(structure),
          semantic_hash: semanticHash,
          content_visibility: "public",
          is_system_template: true,
          system_content_key: `planned-session-${systemActivityPlanId}`,
          system_content_version: 1,
          system_content_hash: `v1:sha256:${"4".repeat(64)}`,
        },
      ]);
      const trainingStructure = (id: string) => ({
        id,
        version: 1 as const,
        sessions: [{ activity_plan_id: ownActivityPlanId, offset_days: 0 }],
      });
      await db.insert(trainingPlans).values([
        {
          id: ownTrainingPlanId,
          profile_id: profileId,
          name: "Owned training plan",
          structure: trainingStructure(ownTrainingPlanId),
          structure_hash: `v1:sha256:${"5".repeat(64)}`,
        },
        {
          id: otherTrainingPlanId,
          profile_id: otherProfileId,
          name: "Other training plan",
          structure: trainingStructure(otherTrainingPlanId),
          structure_hash: `v1:sha256:${"6".repeat(64)}`,
        },
        {
          id: systemTrainingPlanId,
          profile_id: null,
          name: "System training plan",
          structure: trainingStructure(systemTrainingPlanId),
          structure_hash: `v1:sha256:${"7".repeat(64)}`,
          content_visibility: "public",
          is_system_template: true,
          system_content_key: `planned-session-${systemTrainingPlanId}`,
          system_content_version: 1,
          system_content_hash: `v1:sha256:${"8".repeat(64)}`,
        },
      ]);

      const repository = createDrizzlePlannedSessionRepository(db);
      await expect(
        createDirectPlannedSession({
          db,
          repository,
          profileId,
          sessionId: randomUUID(),
          planningDate: "2026-08-20",
          source: { kind: "direct", operationId: `direct_${"n".repeat(32)}` },
          activityPlanId: ownActivityPlanId,
          groupEventId: null,
          capturedAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
      ).resolves.toMatchObject({
        status: "created",
        session: {
          prescription: {
            resolutionManifest: { fallback_level: "system_default_no_context" },
          },
        },
      });
      await expect(
        createDirectPlannedSession({
          db,
          repository,
          profileId,
          sessionId: randomUUID(),
          planningDate: "2026-08-20",
          source: { kind: "direct", operationId: `direct_${"s".repeat(32)}` },
          activityPlanId: systemActivityPlanId,
          groupEventId: null,
          capturedAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
      ).resolves.toMatchObject({
        status: "created",
        session: {
          profileId,
          prescription: {
            resolutionManifest: {
              activity_plan_id: systemActivityPlanId,
              fallback_level: "system_default_no_context",
            },
          },
        },
      });
      const first = directSession({
        profileId,
        activityPlanId: ownActivityPlanId,
        operationId: `direct_${"a".repeat(32)}`,
      });
      await expect(
        createPlannedSession({ repository, profileId, session: first }),
      ).resolves.toMatchObject({ status: "created" });
      await expect(
        createPlannedSession({
          repository,
          profileId,
          session: { ...first, id: randomUUID() },
        }),
      ).resolves.toMatchObject({ status: "unchanged", session: { id: first.id } });

      const pastSession = directSession({
        profileId,
        activityPlanId: ownActivityPlanId,
        operationId: `direct_${"x".repeat(32)}`,
        planningDate: "2026-08-19",
      });
      const todaySession = directSession({
        profileId,
        activityPlanId: ownActivityPlanId,
        operationId: `direct_${"y".repeat(32)}`,
        planningDate: "2026-08-20",
      });
      const futureSession = directSession({
        profileId,
        activityPlanId: ownActivityPlanId,
        operationId: `direct_${"z".repeat(32)}`,
        planningDate: "2026-08-21",
      });
      await Promise.all(
        [pastSession, todaySession, futureSession].map((session) =>
          createPlannedSession({ repository, profileId, session }),
        ),
      );
      const skippedAt = "2026-08-20T12:00:00.000Z";
      await expect(
        skipPlannedSession({
          db,
          profileId,
          sessionId: pastSession.id,
          expectedRevision: 1,
          operationId: randomUUID(),
          skippedAt,
          now: new Date(skippedAt),
        }),
      ).resolves.toMatchObject({ id: pastSession.id, lifecycle: { status: "completed" } });
      const skipOperationId = randomUUID();
      await expect(
        skipPlannedSession({
          db,
          profileId,
          sessionId: todaySession.id,
          expectedRevision: 1,
          operationId: skipOperationId,
          skippedAt,
          now: new Date(skippedAt),
        }),
      ).resolves.toMatchObject({
        id: todaySession.id,
        lifecycle: { completion: { state: "skipped", operationId: skipOperationId } },
      });
      await expect(
        skipPlannedSession({
          db,
          profileId,
          sessionId: todaySession.id,
          expectedRevision: 1,
          operationId: skipOperationId,
          skippedAt,
          now: new Date("2026-08-19T23:00:00.000Z"),
        }),
      ).resolves.toMatchObject({ id: todaySession.id });
      await expect(
        skipPlannedSession({
          db,
          profileId,
          sessionId: futureSession.id,
          expectedRevision: 1,
          operationId: randomUUID(),
          skippedAt,
          now: new Date(skippedAt),
        }),
      ).rejects.toBeInstanceOf(PlannedSessionFutureDateError);

      const trainingSource = {
        kind: "training_plan" as const,
        trainingPlanId: ownTrainingPlanId,
        trainingPlanRevision: 1,
        sourceSessionId: randomUUID(),
      };
      const training = plannedSessionSchema.parse({
        ...first,
        id: randomUUID(),
        source: trainingSource,
        idempotencyKey: plannedSessionIdempotencyKey(trainingSource),
      });
      await expect(
        createPlannedSession({ repository, profileId, session: training }),
      ).resolves.toMatchObject({ status: "created" });
      await expect(
        createPlannedSession({
          repository,
          profileId,
          session: { ...training, id: randomUUID() },
        }),
      ).resolves.toMatchObject({ status: "unchanged", session: { id: training.id } });

      for (const mutation of [
        movePlannedSession({
          repository,
          profileId,
          sessionId: first.id,
          expectedRevision: 9,
          planningDate: "2026-08-25",
        }),
        cancelPlannedSession({
          repository,
          profileId,
          sessionId: first.id,
          expectedRevision: 9,
          reason: "user_requested",
          cancelledAt: "2026-08-20T00:00:00.000Z",
        }),
      ]) {
        await expect(mutation).rejects.toBeInstanceOf(PlannedSessionStaleRevisionError);
      }
      const cancellable = directSession({
        profileId,
        activityPlanId: ownActivityPlanId,
        operationId: `reconcile${randomUUID().replaceAll("-", "")}`,
        planningDate: "2026-08-25",
      });
      await createPlannedSession({ repository, profileId, session: cancellable });
      await expect(
        cancelPlannedSession({
          repository,
          profileId,
          sessionId: cancellable.id,
          expectedRevision: 1,
          reason: "user_requested",
          cancelledAt: "2026-08-16T00:00:00.000Z",
        }),
      ).resolves.toMatchObject({
        sessionRevision: 2,
        lifecycle: { status: "cancelled", reason: "user_requested" },
      });

      const systemSource = {
        kind: "training_plan" as const,
        trainingPlanId: systemTrainingPlanId,
        trainingPlanRevision: 1,
        sourceSessionId: randomUUID(),
      };
      await expect(
        createPlannedSession({
          repository,
          profileId,
          session: plannedSessionSchema.parse({
            ...first,
            id: randomUUID(),
            source: systemSource,
            idempotencyKey: plannedSessionIdempotencyKey(systemSource),
            prescription: {
              ...first.prescription,
              resolutionManifest: createResolutionManifestFixture({
                activityPlanId: systemActivityPlanId,
                structure,
                demand: {
                  activity_category: "bike",
                  training_intent: "general_maintenance",
                  target_duration_minutes: 30,
                  target_common_load: null,
                  importance: "normal",
                },
              }),
            },
          }),
        }),
      ).resolves.toMatchObject({ status: "created" });
      const otherSource = {
        kind: "training_plan" as const,
        trainingPlanId: otherTrainingPlanId,
        trainingPlanRevision: 1,
        sourceSessionId: randomUUID(),
      };
      await expect(
        createPlannedSession({
          repository,
          profileId,
          session: plannedSessionSchema.parse({
            ...first,
            id: randomUUID(),
            source: otherSource,
            idempotencyKey: plannedSessionIdempotencyKey(otherSource),
          }),
        }),
      ).rejects.toBeInstanceOf(PlannedSessionAccessError);
      await expect(
        createPlannedSession({
          repository,
          profileId,
          session: directSession({
            profileId,
            activityPlanId: otherActivityPlanId,
            operationId: `direct_${"b".repeat(32)}`,
          }),
        }),
      ).rejects.toBeInstanceOf(PlannedSessionAccessError);

      await db.insert(groups).values({
        id: groupId,
        created_by_profile_id: profileId,
        name: "Planned session group",
        slug: `planned-${groupId}`,
      });
      await db.insert(groupMemberships).values({
        group_id: groupId,
        profile_id: profileId,
        role: "owner",
        status: "active",
      });
      const groupEventId = randomUUID();
      await db.insert(groupEvents).values({
        id: groupEventId,
        group_id: groupId,
        created_by_profile_id: profileId,
        title: "Group ride",
        starts_at: new Date("2026-08-26T12:00:00.000Z"),
        timezone: "UTC",
      });
      const groupLinked = directSession({
        profileId,
        activityPlanId: ownActivityPlanId,
        operationId: `direct_${"c".repeat(32)}`,
        planningDate: "2026-08-26",
      });
      await createPlannedSession({ repository, profileId, session: groupLinked });
      await expect(
        repository.groupEventExistsForProfile({ profileId: otherProfileId, groupEventId }),
      ).resolves.toBe(false);
      await expect(
        linkPlannedSessionGroupEvent({
          repository,
          profileId: otherProfileId,
          sessionId: groupLinked.id,
          expectedRevision: 1,
          groupEventId,
        }),
      ).rejects.toBeInstanceOf(PlannedSessionAccessError);
      await expect(
        linkPlannedSessionGroupEvent({
          repository,
          profileId,
          sessionId: groupLinked.id,
          expectedRevision: 1,
          groupEventId,
        }),
      ).resolves.toMatchObject({ groupEventId, sessionRevision: 2 });
      await expect(
        createPlannedSession({
          repository,
          profileId,
          session: directSession({
            profileId,
            activityPlanId: ownActivityPlanId,
            operationId: `direct_${"d".repeat(32)}`,
            planningDate: "2026-08-26",
            groupEventId,
          }),
        }),
      ).rejects.toBeInstanceOf(PlannedSessionStateConflictError);
      await db.transaction(async (tx) => {
        await removeGroupEventAssociationsForDeletion({ db: tx, groupEventIds: [groupEventId] });
        await tx.delete(groupEvents).where(eq(groupEvents.id, groupEventId));
      });
      await expect(
        repository.getOwned({ profileId, sessionId: groupLinked.id }),
      ).resolves.toMatchObject({
        id: groupLinked.id,
        groupEventId: null,
        sessionRevision: 3,
        lifecycle: { status: "scheduled" },
      });
      await expect(
        movePlannedSession({
          repository,
          profileId,
          sessionId: groupLinked.id,
          expectedRevision: 2,
          planningDate: "2026-08-29",
        }),
      ).rejects.toBeInstanceOf(PlannedSessionStaleRevisionError);

      const activityId = randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local session_replication_role = replica`);
        await tx.insert(activities).values({
          id: activityId,
          profile_id: profileId,
          name: "Completed ride",
          started_at: new Date("2026-08-15T10:00:00.000Z"),
          finished_at: new Date("2026-08-15T11:00:00.000Z"),
          elapsed_ms: 3_600_000,
          parser_version: "planned-session-live-v1",
          decoded_contract_version: "planned-session-live-v1",
          materializer_version: "planned-session-live-v1",
        });
      });
      const thresholdRepository = createDrizzleAthleteDerivedStateRepository(db);
      await thresholdRepository.replaceThresholdEvidenceForActivity({
        profileId,
        activityId,
        evidence: [
          {
            contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
            profileId,
            calculationVersion: "threshold-v1",
            confidence: 0.9,
            evidence: {
              evidenceId: randomUUID(),
              activityId,
              activityCategory: "bike",
              metric: "power",
              unit: "watts",
              method: "bike_power_30m",
              value: 250,
              sourceSeriesId: "power-primary",
              sourceSeriesMetric: "power",
              startTimestampSeconds: 0,
              endTimestampSeconds: 1800,
              exactWindowSeconds: 1800,
              conversionFactor: 1,
              policyVersion: "threshold-policy-v1",
              plausibilityVersion: "threshold-plausibility-v1",
              observedAt: "2026-08-15T11:00:00.000Z",
            },
            lifecycle: { status: "active", invalidatedAt: null },
          },
        ],
      });
      const completion = directSession({
        profileId,
        activityPlanId: ownActivityPlanId,
        operationId: `direct_${"e".repeat(32)}`,
        planningDate: "2026-08-27",
      });
      await createPlannedSession({ repository, profileId, session: completion });
      await expect(
        linkPlannedSessionCompletion({
          repository,
          profileId,
          sessionId: completion.id,
          expectedRevision: 9,
          activityId,
          linkedAt: "2026-08-15T11:01:00.000Z",
        }),
      ).rejects.toBeInstanceOf(PlannedSessionStaleRevisionError);
      await linkPlannedSessionCompletion({
        repository,
        profileId,
        sessionId: completion.id,
        expectedRevision: 1,
        activityId,
        linkedAt: "2026-08-15T11:01:00.000Z",
      });
      const manualActivityId = randomUUID();
      const importedActivityId = randomUUID();
      const wrongCategoryActivityId = randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local session_replication_role = replica`);
        await tx.insert(activities).values([
          {
            id: manualActivityId,
            profile_id: profileId,
            name: "Manual partial ride",
            notes: "Keep this report",
            entry_provenance: "manual",
            manual_activity_category: "bike",
            diary_date: "2026-08-20",
            diary_timezone: "UTC",
            started_at: null,
            finished_at: null,
            elapsed_ms: null,
            distance_meters: null,
            parser_version: "manual-diary-v1",
            decoded_contract_version: "manual-diary-v1",
            materializer_version: "manual-diary-v1",
          },
          {
            id: importedActivityId,
            profile_id: profileId,
            name: "Imported ride",
            started_at: new Date("2026-08-20T10:00:00.000Z"),
            finished_at: new Date("2026-08-20T11:00:00.000Z"),
            elapsed_ms: 3_600_000,
            distance_meters: 20_000,
            parser_version: "provider-v1",
            decoded_contract_version: "provider-v1",
            materializer_version: "provider-v1",
          },
          {
            id: wrongCategoryActivityId,
            profile_id: profileId,
            name: "Imported run",
            started_at: new Date("2026-08-20T10:00:00.000Z"),
            finished_at: new Date("2026-08-20T11:00:00.000Z"),
            elapsed_ms: 3_600_000,
            distance_meters: 10_000,
            parser_version: "provider-v1",
            decoded_contract_version: "provider-v1",
            materializer_version: "provider-v1",
          },
        ]);
        await tx.insert(activitySegments).values([
          {
            id: randomUUID(),
            activity_id: importedActivityId,
            profile_id: profileId,
            ordinal: 0,
            role: "activity",
            activity_category: "bike",
            start_offset_ms: 0,
            end_offset_ms: 3_600_000,
            summary: { version: 1, timing: { timingCoverage: "complete" } },
            summary_version: 1,
            timing_coverage: "complete",
            active_ms: 3_600_000,
            moving_ms: 3_600_000,
            segment_revision: 1,
            parser_version: "provider-v1",
            materializer_version: "provider-v1",
            created_at: new Date("2026-08-20T11:00:00.000Z"),
          },
          {
            id: randomUUID(),
            activity_id: wrongCategoryActivityId,
            profile_id: profileId,
            ordinal: 0,
            role: "activity",
            activity_category: "run",
            start_offset_ms: 0,
            end_offset_ms: 3_600_000,
            summary: { version: 1, timing: { timingCoverage: "complete" } },
            summary_version: 1,
            timing_coverage: "complete",
            active_ms: 3_600_000,
            moving_ms: 3_600_000,
            segment_revision: 1,
            parser_version: "provider-v1",
            materializer_version: "provider-v1",
            created_at: new Date("2026-08-20T11:00:00.000Z"),
          },
        ]);
      });
      const manualCompletion = directSession({
        profileId,
        activityPlanId: ownActivityPlanId,
        operationId: `direct_${"f".repeat(32)}`,
        planningDate: "2026-08-20",
      });
      await createPlannedSession({ repository, profileId, session: manualCompletion });
      await linkPlannedSessionCompletion({
        repository,
        profileId,
        sessionId: manualCompletion.id,
        expectedRevision: 1,
        activityId: manualActivityId,
        outcome: "partial",
        linkedAt: "2026-08-20T12:00:00.000Z",
      });
      await expect(
        db.transaction((tx) =>
          reconcileManualPlannedSessionCompletion({
            tx,
            profileId,
            sessionId: manualCompletion.id,
            expectedRevision: 2,
            activityId: wrongCategoryActivityId,
            operationId: randomUUID(),
            reconciledAt: new Date("2026-08-20T12:01:00.000Z"),
          }),
        ),
      ).rejects.toBeInstanceOf(ManualCompletionReconciliationConflictError);
      const reconciliationOperationId = randomUUID();
      const reconciliation = await db.transaction((tx) =>
        reconcileManualPlannedSessionCompletion({
          tx,
          profileId,
          sessionId: manualCompletion.id,
          expectedRevision: 2,
          activityId: importedActivityId,
          operationId: reconciliationOperationId,
          reconciledAt: new Date("2026-08-20T12:01:00.000Z"),
        }),
      );
      expect(reconciliation).toMatchObject({
        outcome: "updated",
        session: {
          lifecycle: {
            completion: { state: "linked", activityId: importedActivityId, outcome: "partial" },
          },
        },
      });
      await expect(
        db.query.activities.findFirst({
          where: eq(activities.id, manualActivityId),
          columns: { notes: true, superseded_by_activity_id: true },
        }),
      ).resolves.toEqual({
        notes: "Keep this report",
        superseded_by_activity_id: importedActivityId,
      });
      await expect(
        db.transaction((tx) =>
          reconcileManualPlannedSessionCompletion({
            tx,
            profileId,
            sessionId: manualCompletion.id,
            expectedRevision: 2,
            activityId: importedActivityId,
            operationId: reconciliationOperationId,
            reconciledAt: new Date("2026-08-20T12:02:00.000Z"),
          }),
        ),
      ).resolves.toMatchObject({ outcome: "unchanged" });
      await expect(
        db.transaction((tx) =>
          reconcileManualPlannedSessionCompletion({
            tx,
            profileId,
            sessionId: manualCompletion.id,
            expectedRevision: 2,
            activityId: manualActivityId,
            operationId: reconciliationOperationId,
            reconciledAt: new Date("2026-08-20T12:02:00.000Z"),
          }),
        ),
      ).rejects.toBeInstanceOf(ManualCompletionReconciliationConflictError);
      await expect(
        unlinkDeletedActivityCompletion({
          repository,
          profileId,
          sessionId: completion.id,
          expectedRevision: 9,
          activityId,
          unlinkedAt: "2026-08-16T00:00:00.000Z",
        }),
      ).rejects.toBeInstanceOf(PlannedSessionStaleRevisionError);
      await deleteActivityForProfile({
        db,
        artifactStorage: {} as never,
        activityId,
        profileId,
      });
      await expect(
        db.select().from(thresholdEvidence).where(eq(thresholdEvidence.activity_id, activityId)),
      ).resolves.toEqual([]);
      await expect(
        thresholdRepository.listActiveThresholdEvidence({
          profileId,
          fromObservedAt: "2026-01-01T00:00:00.000Z",
          limit: 10,
        }),
      ).resolves.toEqual({ items: [], hasMore: false });
      await expect(
        repository.getOwned({ profileId, sessionId: completion.id }),
      ).resolves.toMatchObject({
        sessionRevision: 3,
        lifecycle: {
          status: "completed",
          completion: {
            state: "activity_deleted",
            linkedAt: "2026-08-15T11:01:00.000Z",
          },
        },
      });

      const range = await readPlannedSessionRange({
        repository,
        profileId,
        startDate: "2026-08-20",
        endDate: "2026-08-31",
      });
      expect(range.items.length).toBeGreaterThan(0);
      expect(range.items.every((candidate) => candidate.profileId === profileId)).toBe(true);
      await expect(
        readPlannedSessionRange({
          repository,
          profileId: otherProfileId,
          startDate: "2026-08-20",
          endDate: "2026-08-31",
        }),
      ).resolves.toEqual({ items: [], truncated: false });
    } finally {
      await db.delete(groups).where(eq(groups.id, groupId));
      await db.delete(users).where(eq(users.id, profileId));
      await db.delete(users).where(eq(users.id, otherProfileId));
      await db.delete(trainingPlans).where(eq(trainingPlans.id, systemTrainingPlanId));
      await db.delete(activityPlans).where(eq(activityPlans.id, systemActivityPlanId));
    }
  });

  it("serializes group-event association with revocation, cancellation, and deletion", async () => {
    const profileId = await seedProfile("Concurrent planned session owner");
    const activityPlanId = randomUUID();
    const groupId = randomUUID();
    const membershipRaceEventId = randomUUID();
    const cancellationRaceEventId = randomUUID();
    const lateLinkEventId = randomUUID();
    const lateCreateEventId = randomUUID();
    const eventIds = [
      membershipRaceEventId,
      cancellationRaceEventId,
      lateLinkEventId,
      lateCreateEventId,
    ];

    try {
      await db.insert(activityPlans).values({
        id: activityPlanId,
        profile_id: profileId,
        name: "Concurrent association plan",
        structure,
        structure_hash: `v1:sha256:${"9".repeat(64)}`,
        semantic_hash: semanticHash,
      });
      await db.insert(groups).values({
        id: groupId,
        created_by_profile_id: profileId,
        name: "Concurrent planned session group",
        slug: `planned-concurrency-${groupId}`,
      });
      await db.insert(groupMemberships).values({
        group_id: groupId,
        profile_id: profileId,
        role: "owner",
        status: "active",
      });
      await db.insert(groupEvents).values(
        eventIds.map((id, index) => ({
          id,
          group_id: groupId,
          created_by_profile_id: profileId,
          title: `Concurrent group ride ${index + 1}`,
          starts_at: new Date(`2026-09-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`),
          timezone: "UTC",
        })),
      );

      const repository = createDrizzlePlannedSessionRepository(db);

      const membershipRaceSession = directSession({
        profileId,
        activityPlanId,
        operationId: `membership_${"a".repeat(32)}`,
        planningDate: "2026-09-01",
        groupEventId: membershipRaceEventId,
      });
      const revokingConnection = await pool.connect();
      let revocationCommitted = false;
      let pendingCreate: ReturnType<typeof createPlannedSession> | undefined;
      try {
        const blockerPid = Number(
          (await revokingConnection.query("select pg_backend_pid() as pid")).rows[0]?.pid,
        );
        await revokingConnection.query("begin");
        await revokingConnection.query(
          `
            update group_memberships
            set status = 'removed', updated_at = now()
            where group_id = $1 and profile_id = $2
          `,
          [groupId, profileId],
        );

        pendingCreate = createPlannedSession({
          repository,
          profileId,
          session: membershipRaceSession,
        });
        await waitForBackendBlockedBy(blockerPid, "group_memberships");
        await revokingConnection.query("commit");
        revocationCommitted = true;

        await expect(within(pendingCreate)).rejects.toBeInstanceOf(PlannedSessionAccessError);
      } finally {
        if (!revocationCommitted) {
          await revokingConnection.query("rollback").catch(() => undefined);
        }
        revokingConnection.release();
        await pendingCreate?.catch(() => undefined);
      }
      await expect(
        db
          .select({ id: plannedSessions.id })
          .from(plannedSessions)
          .where(eq(plannedSessions.id, membershipRaceSession.id)),
      ).resolves.toEqual([]);
      await db
        .update(groupMemberships)
        .set({ status: "active", updated_at: new Date() })
        .where(
          and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, profileId)),
        );

      const cancellationRaceSession = directSession({
        profileId,
        activityPlanId,
        operationId: `cancellation_${"b".repeat(32)}`,
        planningDate: "2026-09-02",
      });
      await createPlannedSession({ repository, profileId, session: cancellationRaceSession });
      const cancellingConnection = await pool.connect();
      let cancellationCommitted = false;
      let pendingLink: ReturnType<typeof linkPlannedSessionGroupEvent> | undefined;
      try {
        const blockerPid = Number(
          (await cancellingConnection.query("select pg_backend_pid() as pid")).rows[0]?.pid,
        );
        await cancellingConnection.query("begin");
        await cancellingConnection.query(
          "update group_events set cancelled_at = now(), updated_at = now() where id = $1",
          [cancellationRaceEventId],
        );

        pendingLink = linkPlannedSessionGroupEvent({
          repository,
          profileId,
          sessionId: cancellationRaceSession.id,
          expectedRevision: 1,
          groupEventId: cancellationRaceEventId,
        });
        await waitForBackendBlockedBy(blockerPid, "group_events");
        await cancellingConnection.query("commit");
        cancellationCommitted = true;

        await expect(within(pendingLink)).rejects.toBeInstanceOf(PlannedSessionAccessError);
      } finally {
        if (!cancellationCommitted) {
          await cancellingConnection.query("rollback").catch(() => undefined);
        }
        cancellingConnection.release();
        await pendingLink?.catch(() => undefined);
      }
      await expect(
        repository.getOwned({ profileId, sessionId: cancellationRaceSession.id }),
      ).resolves.toMatchObject({ groupEventId: null, sessionRevision: 1 });

      const lateLinkSession = directSession({
        profileId,
        activityPlanId,
        operationId: `late_link_${"c".repeat(32)}`,
        planningDate: "2026-09-03",
      });
      await createPlannedSession({ repository, profileId, session: lateLinkSession });
      const linkingConnection = await pool.connect();
      const linkingDb = drizzle({
        client: linkingConnection,
        schema: relationalSchema,
        casing: "snake_case",
      });
      const linkingPid = Number(
        (await linkingConnection.query("select pg_backend_pid() as pid")).rows[0]?.pid,
      );
      const linkReady = deferred<void>();
      const releaseLink = deferred<void>();
      let cancellation: Promise<unknown> | undefined;
      const linking = linkingDb.transaction(async (tx) => {
        try {
          const transactionRepository = createDrizzlePlannedSessionRepository(tx);
          const linked = await linkPlannedSessionGroupEvent({
            repository: transactionRepository,
            profileId,
            sessionId: lateLinkSession.id,
            expectedRevision: 1,
            groupEventId: lateLinkEventId,
          });
          const replayed = await linkPlannedSessionGroupEvent({
            repository: transactionRepository,
            profileId,
            sessionId: lateLinkSession.id,
            expectedRevision: 1,
            groupEventId: lateLinkEventId,
          });
          linkReady.resolve(undefined);
          await releaseLink.promise;
          return { linked, replayed };
        } catch (error) {
          linkReady.reject(error);
          throw error;
        }
      });
      try {
        await within(linkReady.promise);
        const caller = createRouterCaller(groupEventsRouter, { db, userId: profileId });
        cancellation = caller.cancel({ groupEventId: lateLinkEventId, scope: "single" });
        await waitForBackendBlockedBy(linkingPid, "group_events");
        releaseLink.resolve(undefined);

        const linked = await within(linking);
        expect(linked.replayed).toEqual(linked.linked);
        expect(linked.linked).toMatchObject({
          groupEventId: lateLinkEventId,
          sessionRevision: 2,
        });
        await expect(within(cancellation)).resolves.toMatchObject({
          event: { id: lateLinkEventId },
        });
      } finally {
        releaseLink.resolve(undefined);
        await linking.catch(() => undefined);
        await cancellation?.catch(() => undefined);
        linkingConnection.release();
      }
      await expect(
        repository.getOwned({ profileId, sessionId: lateLinkSession.id }),
      ).resolves.toMatchObject({ groupEventId: null, sessionRevision: 3 });

      const lateCreateSession = directSession({
        profileId,
        activityPlanId,
        operationId: `late_create_${"d".repeat(32)}`,
        planningDate: "2026-09-04",
        groupEventId: lateCreateEventId,
      });
      const creatingConnection = await pool.connect();
      const creatingDb = drizzle({
        client: creatingConnection,
        schema: relationalSchema,
        casing: "snake_case",
      });
      const creatingPid = Number(
        (await creatingConnection.query("select pg_backend_pid() as pid")).rows[0]?.pid,
      );
      const createReady = deferred<void>();
      const releaseCreate = deferred<void>();
      let deletion: Promise<number> | undefined;
      const creating = creatingDb.transaction(async (tx) => {
        try {
          const result = await createPlannedSession({
            repository: createDrizzlePlannedSessionRepository(tx),
            profileId,
            session: lateCreateSession,
          });
          createReady.resolve(undefined);
          await releaseCreate.promise;
          return result;
        } catch (error) {
          createReady.reject(error);
          throw error;
        }
      });
      try {
        await within(createReady.promise);
        deletion = db.transaction(async (tx) => {
          const removed = await removeGroupEventAssociationsForDeletion({
            db: tx,
            groupEventIds: [lateCreateEventId],
          });
          await tx.delete(groupEvents).where(eq(groupEvents.id, lateCreateEventId));
          return removed;
        });
        await waitForBackendBlockedBy(creatingPid, "group_events");
        releaseCreate.resolve(undefined);

        await expect(within(creating)).resolves.toMatchObject({ status: "created" });
        await expect(within(deletion)).resolves.toBe(1);
      } finally {
        releaseCreate.resolve(undefined);
        await creating.catch(() => undefined);
        await deletion?.catch(() => undefined);
        creatingConnection.release();
      }
      await expect(
        repository.getOwned({ profileId, sessionId: lateCreateSession.id }),
      ).resolves.toMatchObject({ groupEventId: null, sessionRevision: 2 });
      await expect(
        db
          .select({ id: groupEvents.id })
          .from(groupEvents)
          .where(eq(groupEvents.id, lateCreateEventId)),
      ).resolves.toEqual([]);
    } finally {
      await db.delete(groups).where(eq(groups.id, groupId));
      await db.delete(users).where(eq(users.id, profileId));
    }
  }, 30_000);
});
