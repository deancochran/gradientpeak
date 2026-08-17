import { randomUUID } from "node:crypto";
import { activityPlanStructureSchema } from "@repo/core/activity-plan";
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
  groupEvents,
  groupMemberships,
  groups,
  profiles,
  thresholdEvidence,
  trainingPlans,
  users,
} from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDrizzleAthleteDerivedStateRepository } from "../../infrastructure/repositories/drizzle-athlete-derived-state-repository";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories/drizzle-planned-session-repository";
import { deleteActivityForProfile } from "../activities/activity-mutations";
import { cancelPlannedSession } from "./cancel-planned-session";
import { createPlannedSession } from "./create-planned-session";
import { linkPlannedSessionCompletion } from "./link-planned-session-completion";
import { linkPlannedSessionGroupEvent } from "./link-planned-session-group-event";
import { movePlannedSession } from "./move-planned-session";
import {
  PlannedSessionAccessError,
  PlannedSessionStaleRevisionError,
  PlannedSessionStateConflictError,
} from "./planned-session-errors";
import { readPlannedSessionRange } from "./read-planned-session-range";
import { removeGroupEventAssociationsForDeletion } from "./remove-group-event-associations";
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
      activityPlanId: input.activityPlanId,
      activityPlanRevision: 1,
      structure,
      prescriptionQuantification: null,
      capturedAt: "2026-08-01T00:00:00.000Z",
    },
    lifecycle: { status: "scheduled" },
  });
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
          structure_hash: `v1:sha256:${"1".repeat(64)}`,
        },
        {
          id: otherActivityPlanId,
          profile_id: otherProfileId,
          name: "Other activity plan",
          structure,
          structure_hash: `v1:sha256:${"2".repeat(64)}`,
        },
        {
          id: systemActivityPlanId,
          profile_id: null,
          name: "System activity plan",
          structure,
          structure_hash: `v1:sha256:${"3".repeat(64)}`,
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

      const trainingSource = {
        kind: "training_plan" as const,
        trainingPlanId: ownTrainingPlanId,
        trainingPlanRevision: 1,
        sourceSessionKey: "2026-08-20:sessions.0",
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

      const recurrenceSource = {
        kind: "recurrence" as const,
        seriesId: first.id,
        occurrenceKey: "2026-08-22",
      };
      const recurrence = plannedSessionSchema.parse({
        ...first,
        id: randomUUID(),
        planningDate: "2026-08-22",
        originalTargetDate: "2026-08-22",
        source: recurrenceSource,
        idempotencyKey: plannedSessionIdempotencyKey(recurrenceSource),
      });
      await expect(
        createPlannedSession({ repository, profileId, session: recurrence }),
      ).resolves.toMatchObject({ status: "created" });
      await expect(
        createPlannedSession({
          repository,
          profileId,
          session: { ...recurrence, id: randomUUID() },
        }),
      ).resolves.toMatchObject({ status: "unchanged", session: { id: recurrence.id } });

      const moved = await movePlannedSession({
        repository,
        profileId,
        sessionId: recurrence.id,
        expectedRevision: 1,
        planningDate: "2026-08-24",
      });
      expect(moved).toMatchObject({
        sessionRevision: 2,
        planningDate: "2026-08-24",
        originalTargetDate: "2026-08-22",
        source: { occurrenceKey: "2026-08-22" },
        prescription: recurrence.prescription,
      });

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
        operationId: `direct_${"f".repeat(32)}`,
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
        sourceSessionKey: "system-session",
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
            prescription: { ...first.prescription, activityPlanId: systemActivityPlanId },
          }),
        }),
      ).resolves.toMatchObject({ status: "created" });
      const otherSource = {
        kind: "training_plan" as const,
        trainingPlanId: otherTrainingPlanId,
        trainingPlanRevision: 1,
        sourceSessionKey: "other-session",
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
});
