import { randomUUID } from "node:crypto";
import {
  ACTIVITY_FILE_INGESTION_CONTRACT_VERSION,
  activityFileIngestionOperationSchema,
} from "@repo/core/activity-files";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  athleteRecalculationIdempotencyKey,
  athleteRecalculationRequestSchema,
} from "@repo/core/athlete-derived-state";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityPlans,
  dailyTrainingLoad,
  groupEvents,
  groupMemberships,
  groups,
  profiles,
  trainingPlans,
  users,
} from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { createDrizzleActivityIngestionRepository } from "./drizzle-activity-ingestion-repository";
import { createDrizzleAthleteDerivedStateRepository } from "./drizzle-athlete-derived-state-repository";
import { createEventReadRepository } from "./drizzle-event-read-repository";
import { createDrizzlePlannedSessionRepository } from "./drizzle-planned-session-repository";

function isDisposableLocalDatabase(): boolean {
  if (process.env.RUN_LIVE_DB_TESTS !== "1" && process.env.RUN_PHASE_ONE_REPOSITORY_LIVE_DB !== "1")
    return false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return (
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      (url.port === "54322" ||
        (url.port === "55439" && process.env.RUN_PHASE_ONE_REPOSITORY_LIVE_DB === "1")) &&
      url.pathname === "/postgres"
    );
  } catch {
    return false;
  }
}
const describeDisposable = isDisposableLocalDatabase() ? describe : describe.skip;
const profileIds: string[] = [];
const groupIds: string[] = [];
async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@phase-one-repositories.test`;
  profileIds.push(id);
  await db.insert(users).values({ id, name: label, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `phase-one-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    planning_timezone: "UTC",
    is_public: false,
  });
  return id;
}
afterEach(async () => {
  for (const groupId of groupIds.splice(0)) await db.delete(groups).where(eq(groups.id, groupId));
  for (const profileId of profileIds.splice(0)) {
    await db.delete(users).where(eq(users.id, profileId));
  }
});
afterAll(async () => {
  await pool.end();
});
describeDisposable("Phase 1 Drizzle repositories against a disposable database", () => {
  it("reads a new reference-based session with all legacy snapshot columns null", async () => {
    const profileId = await seedProfile("Current-plan effective-load owner");
    const activityPlanId = randomUUID();
    const structure = activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "run",
      items: [
        {
          type: "step",
          id: randomUUID(),
          name: "Current plan",
          duration: { type: "time", seconds: 1_800 },
          targets: [{ type: "RPE", intensity: 5 }],
        },
      ],
    });
    await db.insert(activityPlans).values({
      id: activityPlanId,
      profile_id: profileId,
      name: "Current effective-load plan",
      structure,
      structure_hash: activityPlanStructureHash(structure),
      semantic_hash: activityPlanSemanticHash({ structure, trainingIntent: "general_maintenance" }),
    });
    const session = plannedSessionSchema.parse({
      contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
      id: randomUUID(),
      profileId,
      sessionRevision: 1,
      planningDate: "2026-08-20",
      originalTargetDate: "2026-08-20",
      source: { kind: "direct", operationId: `direct_${"n".repeat(32)}` },
      idempotencyKey: plannedSessionIdempotencyKey({
        kind: "direct",
        operationId: `direct_${"n".repeat(32)}`,
      }),
      activityPlanId,
      lifecycle: { status: "scheduled" },
    });
    await createDrizzlePlannedSessionRepository(db).createOwned({ profileId, session });

    const result = await createEventReadRepository(db).getEffectivePlanLoadInputs({
      asOf: new Date("2026-08-20T12:00:00.000Z"),
      profileId,
    });

    expect(result.plannedSessions).toEqual([
      expect.objectContaining({
        id: session.id,
        currentPlan: expect.objectContaining({ id: activityPlanId }),
        resolutionManifest: null,
      }),
    ]);
  });

  it("coalesces athlete work and fences daily publication by revision and lease", async () => {
    const profileId = await seedProfile("Athlete state owner");
    const repository = createDrizzleAthleteDerivedStateRepository(db);
    const first = athleteRecalculationRequestSchema.parse({
      contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
      profileId,
      idempotencyKey: athleteRecalculationIdempotencyKey(profileId),
      earliestAffectedAt: "2026-08-10T12:00:00.000Z",
      earliestAffectedPlanningDate: "2026-08-10",
      sourceRevision: 4,
      reasons: ["activity_changed"],
      requestedAt: "2026-08-10T12:01:00.000Z",
    });
    const second = athleteRecalculationRequestSchema.parse({
      ...first,
      earliestAffectedAt: "2026-08-09T12:00:00.000Z",
      earliestAffectedPlanningDate: "2026-08-09",
      sourceRevision: 5,
      reasons: ["threshold_changed"],
      requestedAt: "2026-08-10T12:02:00.000Z",
    });
    await repository.coalesceRecalculationRequest({ profileId, request: first });
    await expect(
      repository.coalesceRecalculationRequest({ profileId, request: second }),
    ).resolves.toMatchObject({
      earliestAffectedAt: "2026-08-09T12:00:00.000Z",
      earliestAffectedPlanningDate: "2026-08-09",
      sourceRevision: 5,
      reasons: ["activity_changed", "threshold_changed"],
    });
    const claimedAt = new Date();
    const claimToken = randomUUID();
    const claim = await repository.claimNextRecalculation({
      claimToken,
      claimedAt: claimedAt.toISOString(),
      leaseExpiresAt: new Date(claimedAt.getTime() + 60000).toISOString(),
    });
    expect(claim).toMatchObject({ lifecycle: { state: "processing", claimToken } });
    const day = {
      contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
      profileId,
      planningDate: "2026-08-10",
      sourceRevision: 5,
      commonLoad: 50,
      fitness: 30,
      fatigue: 20,
      form: 10,
      readiness: 80,
      coverage: {
        status: "complete" as const,
        contributingActivityCount: 1,
        omittedActivityCount: 0 as const,
      },
      calculationVersion: "daily-load-v1",
    };
    const publicationState = {
      computedAt: "2026-08-10T12:00:00.000Z",
      fitness: 30,
      fatigue: 20,
      evidenceConfidence: 0.9,
      coverageStartAt: "2026-08-10T12:00:00.000Z",
      coverageEndAt: "2026-08-10T12:00:00.000Z",
      lastActivityAt: "2026-08-10T12:00:00.000Z",
      calculationVersion: "athlete-state-projection-v1",
      capabilities: [],
    };
    await expect(
      repository.publishDailyTrainingLoad({
        profileId,
        fromPlanningDate: "2026-08-10",
        expectedPublishedRevision: 1,
        targetPublishedRevision: 5,
        claimToken,
        days: [day],
        state: publicationState,
      }),
    ).resolves.toMatchObject({ status: "stale_revision", currentPublishedRevision: 0 });
    await expect(
      repository.publishDailyTrainingLoad({
        profileId,
        fromPlanningDate: "2026-08-10",
        expectedPublishedRevision: 0,
        targetPublishedRevision: 5,
        claimToken: randomUUID(),
        days: [day],
        state: publicationState,
      }),
    ).resolves.toEqual({ status: "lease_lost" });
    await db.insert(dailyTrainingLoad).values({
      ...{
        profile_id: profileId,
        contract_version: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
        common_load: 1,
        fitness: 1,
        fatigue: 1,
        form: 0,
        readiness: null,
        coverage_status: "complete" as const,
        contributing_activity_count: 0,
        omitted_activity_count: 0,
        source_revision: 5,
        calculation_version: "daily-load-v1",
      },
      planning_date: "2026-08-11",
    });
    await expect(
      repository.publishDailyTrainingLoad({
        profileId,
        fromPlanningDate: "2026-08-10",
        expectedPublishedRevision: 0,
        targetPublishedRevision: 5,
        claimToken,
        days: [day],
        state: publicationState,
      }),
    ).resolves.toEqual({ status: "published", publishedRevision: 5 });
    await expect(
      repository.readDailyTrainingLoadRange({
        profileId,
        startDate: "2026-08-10",
        endDate: "2026-08-12",
        publishedRevision: 5,
      }),
    ).resolves.toEqual([day]);
    const activityId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.insert(activities).values({
        id: activityId,
        profile_id: profileId,
        name: "Threshold source ride",
        started_at: new Date("2026-08-10T12:00:00.000Z"),
        finished_at: new Date("2026-08-10T12:30:00.000Z"),
        elapsed_ms: 1800000,
        parser_version: "phase-one-v1",
        decoded_contract_version: "phase-one-v1",
        materializer_version: "phase-one-v1",
      });
    });
    const thresholdRecord = (evidenceId: string, value: number) => ({
      contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
      profileId,
      calculationVersion: "threshold-v1",
      confidence: 0.9,
      evidence: {
        evidenceId,
        activityId,
        activityCategory: "bike" as const,
        metric: "power" as const,
        unit: "watts" as const,
        method: "bike_power_30m" as const,
        value,
        sourceSeriesId: "power-primary",
        sourceSeriesMetric: "power" as const,
        startTimestampSeconds: 0,
        endTimestampSeconds: 1800,
        exactWindowSeconds: 1800,
        conversionFactor: 1,
        policyVersion: "threshold-policy-v1" as const,
        plausibilityVersion: "threshold-plausibility-v1" as const,
        observedAt: "2026-08-10T12:30:00.000Z",
      },
      lifecycle: { status: "active" as const, invalidatedAt: null },
    });
    const lthrRecord = (evidenceId: string, value: number) => {
      const record = thresholdRecord(evidenceId, value);
      return {
        ...record,
        evidence: {
          ...record.evidence,
          metric: "lthr" as const,
          unit: "bpm" as const,
          method: "lthr_30m_final_20m" as const,
          sourceSeriesId: "heart-rate-primary",
          sourceSeriesMetric: "heart_rate" as const,
          startTimestampSeconds: 600,
          exactWindowSeconds: 1200,
        },
      };
    };
    await repository.replaceThresholdEvidenceForActivity({
      profileId,
      activityId,
      evidence: [thresholdRecord(randomUUID(), 275), lthrRecord(randomUUID(), 170)],
    });
    const replacementPowerEvidenceId = randomUUID();
    const replacementLthrEvidenceId = randomUUID();
    const replacementEvidence = [
      thresholdRecord(replacementPowerEvidenceId, 280),
      lthrRecord(replacementLthrEvidenceId, 172),
    ];
    await repository.replaceThresholdEvidenceForActivity({
      profileId,
      activityId,
      evidence: replacementEvidence,
    });
    await repository.replaceThresholdEvidenceForActivity({
      profileId,
      activityId,
      evidence: replacementEvidence,
    });
    const replaced = await repository.listActiveThresholdEvidence({
      profileId,
      fromObservedAt: "2026-08-01T00:00:00.000Z",
      limit: 10,
    });
    expect(replaced.hasMore).toBe(false);
    expect(replaced.items).toHaveLength(2);
    expect(new Set(replaced.items.map(({ evidence }) => evidence.evidenceId))).toEqual(
      new Set([replacementPowerEvidenceId, replacementLthrEvidenceId]),
    );
    expect(new Set(replaced.items.map(({ evidence }) => evidence.metric))).toEqual(
      new Set(["power", "lthr"]),
    );
  });
  it("replays direct ingestion operations once and enforces lifecycle transitions", async () => {
    const profileId = await seedProfile("Ingestion owner");
    const otherProfileId = await seedProfile("Other ingestion owner");
    const operationRepository = createDrizzleActivityIngestionRepository(db);
    const now = new Date();
    const operation = activityFileIngestionOperationSchema.parse({
      id: randomUUID(),
      profileId,
      contractVersion: ACTIVITY_FILE_INGESTION_CONTRACT_VERSION,
      operationId: `manual_${"a".repeat(32)}`,
      source: "manual_import",
      provider: null,
      externalId: null,
      integrationId: null,
      activityId: null,
      artifactId: null,
      stagingBucket: "private-artifacts",
      stagingPath: `profiles/${profileId}/upload.fit`,
      expectedSha256: "a".repeat(64),
      expectedByteSize: 128,
      expectedFormat: "fit",
      expectedMediaType: "application/vnd.ant.fit",
      uploadedAt: null,
      stagingCleanupPending: false,
      stagingCleanedAt: null,
      stagingCleanupError: null,
      status: "awaiting_upload",
      failureCode: null,
      requestedAt: now.toISOString(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      receivedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await expect(operationRepository.createOrLoad(operation)).resolves.toMatchObject({
      status: "created",
    });
    await expect(operationRepository.createOrLoad(operation)).resolves.toMatchObject({
      status: "unchanged",
      operation: { id: operation.id },
    });
    await expect(
      operationRepository.getOwned({ profileId: otherProfileId, ingestionId: operation.id }),
    ).resolves.toBeNull();
    await expect(
      operationRepository.createOrLoad({ ...operation, stagingPath: "other/path.fit" }),
    ).resolves.toEqual({ status: "identity_conflict" });
    await expect(
      operationRepository.transitionLifecycle({
        profileId,
        ingestionId: operation.id,
        update: { status: "processing", startedAt: now.toISOString() },
      }),
    ).resolves.toMatchObject({ status: "updated", operation: { status: "processing" } });
    await expect(
      operationRepository.transitionLifecycle({
        profileId,
        ingestionId: operation.id,
        update: {
          status: "failed_retryable",
          failureCode: "promotion_failed",
          failedAt: now.toISOString(),
        },
      }),
    ).resolves.toMatchObject({ status: "updated", operation: { status: "failed_retryable" } });
    await expect(
      operationRepository.transitionLifecycle({
        profileId,
        ingestionId: operation.id,
        update: { status: "processing", startedAt: new Date().toISOString() },
      }),
    ).resolves.toMatchObject({ status: "updated", operation: { status: "processing" } });
    await expect(
      operationRepository.transitionLifecycle({
        profileId,
        ingestionId: operation.id,
        update: {
          status: "failed_terminal",
          failureCode: "invalid_activity",
          failedAt: new Date().toISOString(),
        },
      }),
    ).resolves.toMatchObject({ status: "updated", operation: { status: "failed_terminal" } });
    await expect(
      operationRepository.transitionLifecycle({
        profileId,
        ingestionId: operation.id,
        update: { status: "processing", startedAt: new Date().toISOString() },
      }),
    ).resolves.toMatchObject({
      status: "state_conflict",
      operation: { status: "failed_terminal" },
    });
  });
  it("enforces planned-session ownership, idempotency, revisions, group uniqueness, and unlink history", async () => {
    const profileId = await seedProfile("Planned session owner");
    const otherProfileId = await seedProfile("Other planned session owner");
    const repository = createDrizzlePlannedSessionRepository(db);
    const activityPlanId = randomUUID();
    const trainingPlanId = randomUUID();
    const trainingPlanStructure = {
      version: 1,
      sessions: [{ activity_plan_id: activityPlanId, offset_days: 0 }],
    };
    const structure = activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "bike",
      items: [
        {
          type: "step",
          id: randomUUID(),
          name: "Steady",
          duration: { type: "time", seconds: 1800 },
          targets: [{ type: "%FTP", intensity: 75 }],
        },
      ],
    });
    await db.insert(activityPlans).values({
      id: activityPlanId,
      profile_id: profileId,
      name: "Phase 1 activity plan",
      structure,
      structure_hash: activityPlanStructureHash(structure),
      semantic_hash: activityPlanSemanticHash({
        structure,
        trainingIntent: "general_maintenance",
      }),
    });
    await db.insert(trainingPlans).values({
      id: trainingPlanId,
      profile_id: profileId,
      name: "Phase 1 training plan",
      structure: trainingPlanStructure,
      structure_hash: activityPlanStructureHash(trainingPlanStructure),
    });
    const makeDirectSession = (id: string, operationId: string) =>
      plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id,
        profileId,
        sessionRevision: 1,
        planningDate: "2026-08-20",
        originalTargetDate: "2026-08-20",
        source: { kind: "direct", operationId },
        idempotencyKey: plannedSessionIdempotencyKey({ kind: "direct", operationId }),
        groupEventId: null,
        prescription: {
          resolutionManifest: createResolutionManifestFixture({
            activityPlanId,
            structure,
            demand: {
              activity_category: "bike",
              training_intent: "general_maintenance",
              target_duration_minutes: 30,
              target_common_load: null,
              importance: "normal",
            },
          }),
          capturedAt: "2026-08-01T12:00:00.000Z",
        },
        lifecycle: { status: "scheduled" },
      });
    const first = makeDirectSession(randomUUID(), `direct_${"a".repeat(32)}`);
    const second = makeDirectSession(randomUUID(), `direct_${"b".repeat(32)}`);
    await expect(repository.createOwned({ profileId, session: first })).resolves.toMatchObject({
      status: "created",
    });
    await expect(repository.createOwned({ profileId, session: first })).resolves.toMatchObject({
      status: "unchanged",
    });
    await repository.createOwned({ profileId, session: second });
    const trainingSource = {
      kind: "training_plan" as const,
      trainingPlanId,
      trainingPlanRevision: 1,
      sourceSessionId: randomUUID(),
    };
    const trainingSession = plannedSessionSchema.parse({
      ...first,
      id: randomUUID(),
      source: trainingSource,
      idempotencyKey: plannedSessionIdempotencyKey(trainingSource),
    });
    await expect(
      repository.createOwned({ profileId, session: trainingSession }),
    ).resolves.toMatchObject({ status: "created" });
    await expect(
      repository.createOwned({ profileId, session: trainingSession }),
    ).resolves.toMatchObject({ status: "unchanged" });
    await expect(
      repository.getOwned({ profileId: otherProfileId, sessionId: first.id }),
    ).resolves.toBeNull();
    await expect(
      repository.mutateOwned({
        action: "move",
        profileId,
        sessionId: first.id,
        expectedRevision: 9,
        planningDate: "2026-08-21",
      }),
    ).resolves.toEqual({ status: "stale_revision", currentRevision: 1 });
    const groupId = randomUUID();
    const groupEventId = randomUUID();
    groupIds.push(groupId);
    await db.insert(groups).values({
      id: groupId,
      created_by_profile_id: profileId,
      name: "Phase 1 group",
      slug: `phase-one-${groupId}`,
    });
    await db.insert(groupMemberships).values({
      group_id: groupId,
      profile_id: profileId,
      role: "owner",
      status: "active",
    });
    await db.insert(groupEvents).values({
      id: groupEventId,
      group_id: groupId,
      created_by_profile_id: profileId,
      title: "Phase 1 event",
      starts_at: new Date("2026-08-20T12:00:00.000Z"),
      timezone: "UTC",
    });
    await expect(
      repository.mutateOwned({
        action: "associate_group_event",
        profileId,
        sessionId: first.id,
        expectedRevision: 1,
        groupEventId,
      }),
    ).resolves.toMatchObject({ status: "updated" });
    await expect(
      repository.mutateOwned({
        action: "associate_group_event",
        profileId,
        sessionId: second.id,
        expectedRevision: 1,
        groupEventId,
      }),
    ).resolves.toEqual({ status: "conflict", reason: "group_event_already_linked" });
    const activityId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.insert(activities).values({
        id: activityId,
        profile_id: profileId,
        name: "Completed ride",
        started_at: new Date("2026-08-20T12:00:00.000Z"),
        finished_at: new Date("2026-08-20T12:30:00.000Z"),
        elapsed_ms: 1800000,
        parser_version: "phase-one-v1",
        decoded_contract_version: "phase-one-v1",
        materializer_version: "phase-one-v1",
      });
    });
    const linked = await repository.mutateOwned({
      action: "link_completion",
      profileId,
      sessionId: second.id,
      expectedRevision: 1,
      activityId,
      outcome: "full",
      linkedAt: "2026-08-20T12:31:00.000Z",
    });
    expect(linked).toMatchObject({ status: "updated", session: { sessionRevision: 2 } });
    await expect(
      repository.mutateOwned({
        action: "unlink_deleted_activity",
        profileId,
        sessionId: second.id,
        expectedRevision: 2,
        activityId,
        unlinkedAt: "2026-08-21T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      status: "updated",
      session: {
        lifecycle: {
          status: "completed",
          completion: { state: "activity_deleted", linkedAt: "2026-08-20T12:31:00.000Z" },
        },
      },
    });
    await db.delete(groupEvents).where(eq(groupEvents.id, groupEventId));
    await expect(repository.getOwned({ profileId, sessionId: first.id })).resolves.toMatchObject({
      groupEventId: null,
      lifecycle: { status: "scheduled" },
    });
    await expect(
      repository.trainingPlanExistsForProfile({ profileId, trainingPlanId }),
    ).resolves.toBe(true);
    await expect(
      repository.trainingPlanExistsForProfile({ profileId: otherProfileId, trainingPlanId }),
    ).resolves.toBe(false);
  });
});
