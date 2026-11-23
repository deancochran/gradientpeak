import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { db, pool } from "@repo/db/client";
import {
  activityPlans,
  activityTrainingEffects,
  chatbotOperationReceipts,
  plannedSessions,
  profileAthleteState,
  profileGoals,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { markAthleteStateDirty } from "../../repositories/athlete-state-repository";
import { readyActivityIngestion } from "../../test-support/ready-activity-ingestion";
import {
  type ActivitySubmission,
  activityArtifactId,
  submitActivity,
} from "../activities/submit-activity";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { AthleteStateWorkerService } from "../athlete-intelligence/athlete-state-worker";
import { applyPlannedSessionScenario } from "./apply-planned-session-scenario";
import { previewPlannedSessionScenario } from "./preview-planned-session-scenario";

function isDisposableScenarioDatabase() {
  if (process.env.RUN_PLANNED_SESSION_LIVE_DB !== "1" && process.env.RUN_LIVE_DB_TESTS !== "1")
    return false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return (
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      /^\/gradientpeak_(?:planned_sessions|api_live_db)_\d+_\d+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

const describeDisposable = isDisposableScenarioDatabase() ? describe : describe.skip;
const now = new Date("2026-08-01T12:00:00.000Z");
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "11111111-1111-4111-8111-111111111111",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "%FTP", intensity: 75 }],
    },
  ],
});

async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@scenario-disposable.test`;
  await db.insert(users).values({ id, name: label, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `scenario-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    planning_timezone: "UTC",
    is_public: false,
  });
  return id;
}

async function submitCanonicalBikeFixture(input: {
  profileId: string;
  finishedAt: Date;
  durationMs: number;
  powerWatts: number;
  calibration?: boolean;
}) {
  const activityId = randomUUID();
  const segmentId = randomUUID();
  const digest = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
  const artifact = {
    sha256: digest,
    byteSize: 1_024,
    bucket: "activity-files",
    path: `artifacts/sha256/${input.profileId}/${digest}`,
    mediaType: "application/vnd.ant.fit" as const,
    format: "fit" as const,
  };
  const startedAt = new Date(input.finishedAt.getTime() - input.durationMs);
  const sourceArtifactId = activityArtifactId(input.profileId, artifact.sha256, artifact.byteSize);
  const ingestion = await readyActivityIngestion(db, {
    profileId: input.profileId,
    operationId: `scenario-preview:${activityId}`,
    source: "manual_import",
    artifact,
  });
  const normalizedPowerResult = calculateCyclingNormalizedPower({
    samples: Array.from({ length: input.durationMs / 5_000 + 1 }, (_, index) => ({
      timestampSeconds: Math.min(index * 5, input.durationMs / 1_000),
      powerWatts: input.powerWatts,
    })),
  });
  if (normalizedPowerResult.status === "unavailable") throw new Error("Expected numeric power");
  const effortId = randomUUID();
  const submission: ActivitySubmission = {
    requestedActivityId: activityId,
    profileId: input.profileId,
    name: "Canonical cycling scenario fixture",
    notes: null,
    contentVisibility: "private",
    startedAt,
    finishedAt: input.finishedAt,
    elapsedMs: input.durationMs,
    activeMs: input.durationMs,
    movingMs: input.durationMs,
    timingCoverage: "complete",
    distanceMeters: 20_000,
    calories: null,
    elevationGainMeters: null,
    avgHeartRate: null,
    maxHeartRate: null,
    avgPower: Math.round(input.powerWatts),
    maxPower: Math.round(input.powerWatts),
    avgCadence: null,
    maxCadence: null,
    avgSpeedMps: null,
    maxSpeedMps: null,
    normalizedSpeedMps: null,
    avgTemperature: null,
    deviceManufacturer: null,
    deviceProduct: null,
    laps: null,
    mapBounds: null,
    polyline: null,
    segmentSet: {
      version: 1,
      elapsedMs: input.durationMs,
      segments: [
        {
          id: segmentId,
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: input.durationMs,
          source: {
            kind: "artifact",
            artifactId: sourceArtifactId,
            source: { standard: "fit", format: "fit" },
          },
          summary: {
            version: 1,
            timing: {
              timingCoverage: "complete",
              activeMs: input.durationMs,
              movingMs: input.durationMs,
            },
            distanceMeters: 20_000,
            averagePowerWatts: input.powerWatts,
            normalizedPowerResult,
          },
        },
      ],
    },
    analysis: {
      efforts: input.calibration
        ? [
            {
              id: effortId,
              created_at: input.finishedAt,
              profile_id: input.profileId,
              activity_id: activityId,
              segment_id: segmentId,
              recorded_at: input.finishedAt,
              activity_category: "bike",
              effort_type: "power",
              source_series: "power",
              duration_seconds: input.durationMs / 1_000,
              source_artifact_id: sourceArtifactId,
              source_revision: 1,
              start_offset_ms: 0,
              end_offset_ms: input.durationMs,
              window_coverage: 1,
              max_gap_seconds: 2,
              unit: "watts",
              value: input.powerWatts,
              source: "imported",
              method: "activity_file_best_effort",
              calculation_version: "best-effort-extraction-v1",
              provenance: {
                observation_id: effortId,
                activity_id: activityId,
                segment_id: segmentId,
                derived_from: "activity_file_stream",
                source_series: "power",
                interval_convention: "current_sample_applies_to_preceding_interval",
                exact_window_start_timestamp_seconds: startedAt.getTime() / 1_000,
                exact_window_end_timestamp_seconds: input.finishedAt.getTime() / 1_000,
                exact_window_start_offset_seconds: 0,
                exact_window_end_offset_seconds: input.durationMs / 1_000,
                duration_seconds: input.durationMs / 1_000,
                contributing_duration_seconds: input.durationMs / 1_000,
                window_coverage: 1,
                source_time_coverage: 1,
                extraction_status: "available",
                extraction_reason: null,
                persisted_start_offset_quantization: "nearest_millisecond_v1",
                calculation_version: "best-effort-extraction-v1",
              },
            },
          ]
        : [],
      detectedLTHR: null,
      ingestion: { source: "manual_import", ...ingestion, artifact },
    },
  };
  return submitActivity(db, submission);
}

async function readScenarioRows(profileId: string) {
  return Promise.all([
    db.select().from(plannedSessions).where(eq(plannedSessions.profile_id, profileId)),
    db.select().from(activityPlans).where(eq(activityPlans.profile_id, profileId)),
    db.select().from(profileGoals).where(eq(profileGoals.profile_id, profileId)),
    db.select().from(profileAthleteState).where(eq(profileAthleteState.profile_id, profileId)),
    db
      .select()
      .from(activityTrainingEffects)
      .where(eq(activityTrainingEffects.profile_id, profileId)),
  ]);
}

describeDisposable("planned-session scenario preview against a disposable database", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("keeps owned preview reads fenced, owner-scoped, and non-mutating", async () => {
    const ownerId = await seedProfile("Scenario owner");
    const otherId = await seedProfile("Scenario other");
    const planId = randomUUID();
    const privateOtherPlanId = randomUUID();
    const sessionId = randomUUID();
    const source = { kind: "direct" as const, operationId: `scenario_${"a".repeat(32)}` };
    const hash = activityPlanStructureHash(structure);
    const semanticHash = activityPlanSemanticHash({
      structure,
      trainingIntent: "general_maintenance",
    });

    await submitCanonicalBikeFixture({
      profileId: ownerId,
      finishedAt: new Date("2026-07-20T10:00:00.000Z"),
      durationMs: 1_800_000,
      powerWatts: 300,
      calibration: true,
    });
    await submitCanonicalBikeFixture({
      profileId: ownerId,
      finishedAt: new Date("2026-07-31T10:00:00.000Z"),
      durationMs: 1_440_000,
      powerWatts: 300,
    });
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId: ownerId,
        effectiveAt: new Date("2026-07-20T10:00:00.000Z"),
        now,
      }),
    );
    await new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now });
    await new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now });
    const [publishedState] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, ownerId));
    if (!publishedState?.published_revision) throw new Error("Expected published athlete state");

    await db.insert(activityPlans).values([
      {
        id: planId,
        profile_id: ownerId,
        name: "Owner scenario plan",
        structure,
        structure_hash: hash,
        semantic_hash: semanticHash,
      },
      {
        id: privateOtherPlanId,
        profile_id: otherId,
        name: "Other private scenario plan",
        structure,
        structure_hash: hash,
        semantic_hash: semanticHash,
      },
    ]);
    const session = plannedSessionSchema.parse({
      contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
      id: sessionId,
      profileId: ownerId,
      sessionRevision: 1,
      planningDate: "2026-08-10",
      originalTargetDate: "2026-08-10",
      source,
      idempotencyKey: plannedSessionIdempotencyKey(source),
      groupEventId: null,
      activityPlanId: planId,
      lifecycle: { status: "scheduled" },
    });
    await expect(
      createDrizzlePlannedSessionRepository(db).createOwned({ profileId: ownerId, session }),
    ).resolves.toMatchObject({ status: "created" });

    const before = await readScenarioRows(ownerId);
    const values = {
      sessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "as_planned" as const },
    };

    await expect(
      previewPlannedSessionScenario({ db, profileId: otherId, values, now }),
    ).resolves.toEqual({ status: "unavailable", reason: "session_not_found" });
    await expect(
      previewPlannedSessionScenario({
        db,
        profileId: ownerId,
        values: { ...values, scenario: { kind: "substitute", activityPlanId: privateOtherPlanId } },
        now,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "candidate_unavailable" });
    await expect(
      previewPlannedSessionScenario({ db, profileId: ownerId, values, now }),
    ).resolves.toMatchObject({
      status: "available",
      stateRevision: publishedState.published_revision,
      selectedSession: { id: sessionId, sessionRevision: 1, planningDate: "2026-08-10" },
      provenance: { selectedPlan: { id: planId, revision: 1 } },
    });

    expect(await readScenarioRows(ownerId)).toEqual(before);
    expect(
      await db.query.plannedSessions.findFirst({
        where: and(eq(plannedSessions.id, sessionId), eq(plannedSessions.profile_id, ownerId)),
      }),
    ).toBeTruthy();
  });

  it("durably applies a canonical less scenario once while retaining source provenance", async () => {
    const ownerId = await seedProfile("Scenario apply owner");
    const planId = randomUUID();
    const selectedSessionId = randomUUID();
    const otherSessionId = randomUUID();
    const hash = activityPlanStructureHash(structure);
    const semanticHash = activityPlanSemanticHash({
      structure,
      trainingIntent: "general_maintenance",
    });

    await submitCanonicalBikeFixture({
      profileId: ownerId,
      finishedAt: new Date("2026-07-20T10:00:00.000Z"),
      durationMs: 1_800_000,
      powerWatts: 300,
      calibration: true,
    });
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId: ownerId,
        effectiveAt: new Date("2026-07-20T10:00:00.000Z"),
        now,
      }),
    );
    await new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now });
    await new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now });
    const [publishedState] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, ownerId));
    if (!publishedState?.published_revision) throw new Error("Expected published athlete state");

    await db.insert(activityPlans).values({
      id: planId,
      profile_id: ownerId,
      name: "Canonical private source",
      structure,
      structure_hash: hash,
      semantic_hash: semanticHash,
      content_visibility: "private",
    });
    for (const [id, planningDate] of [
      [selectedSessionId, "2026-08-10"],
      [otherSessionId, "2026-08-11"],
    ] as const) {
      const source = { kind: "direct" as const, operationId: `scenario_${id.replaceAll("-", "")}` };
      const session = plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id,
        profileId: ownerId,
        sessionRevision: 1,
        planningDate,
        originalTargetDate: planningDate,
        source,
        idempotencyKey: plannedSessionIdempotencyKey(source),
        groupEventId: null,
        activityPlanId: planId,
        lifecycle: { status: "scheduled" },
      });
      await expect(
        createDrizzlePlannedSessionRepository(db).createOwned({ profileId: ownerId, session }),
      ).resolves.toMatchObject({ status: "created" });
    }

    const previewRequest = {
      sessionId: selectedSessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "less" as const, targetDurationSeconds: 900 },
    };
    const preview = await previewPlannedSessionScenario({
      db,
      profileId: ownerId,
      values: previewRequest,
      now,
    });
    expect(preview.status).toBe("available");
    if (preview.status !== "available") throw new Error("Expected available scenario preview");
    const providerCalls: Array<{ sessionId: string; action: string }> = [];
    const request = {
      preview: previewRequest,
      expectedPreviewFingerprint: preview.previewFingerprint,
      operationId: "less-scenario-apply-operation-00001",
    };
    const result = await applyPlannedSessionScenario({
      db,
      actorId: ownerId,
      profileId: ownerId,
      request,
      now,
      enqueueProviderSync: async ({ sessionId, action }) => {
        providerCalls.push({ sessionId, action });
      },
    });
    expect(result).toMatchObject({ status: "applied", action: "repointed" });
    if (result.status !== "applied" || !result.createdActivityPlanId)
      throw new Error("Expected created scenario copy");
    expect(providerCalls).toEqual([{ sessionId: selectedSessionId, action: "publish" }]);

    const [sourceAfter] = await db.select().from(activityPlans).where(eq(activityPlans.id, planId));
    const [copy] = await db
      .select()
      .from(activityPlans)
      .where(eq(activityPlans.id, result.createdActivityPlanId));
    const [selectedAfter] = await db
      .select()
      .from(plannedSessions)
      .where(eq(plannedSessions.id, selectedSessionId));
    const [otherAfter] = await db
      .select()
      .from(plannedSessions)
      .where(eq(plannedSessions.id, otherSessionId));
    expect(sourceAfter).toMatchObject({
      id: planId,
      structure_hash: hash,
      semantic_hash: semanticHash,
      content_visibility: "private",
    });
    expect(copy).toMatchObject({
      profile_id: ownerId,
      content_visibility: "private",
      is_system_template: false,
    });
    expect(copy?.id).not.toBe(planId);
    expect(copy?.structure_hash).not.toBe(hash);
    expect(selectedAfter).toMatchObject({
      activity_plan_id: copy?.id,
      session_revision: 2,
      status: "scheduled",
    });
    expect(otherAfter).toMatchObject({
      activity_plan_id: planId,
      session_revision: 1,
      status: "scheduled",
    });

    const replay = await applyPlannedSessionScenario({
      db,
      actorId: ownerId,
      profileId: ownerId,
      request,
      now,
      enqueueProviderSync: async ({ sessionId, action }) => {
        providerCalls.push({ sessionId, action });
      },
    });
    expect(replay).toEqual(result);
    expect(providerCalls).toHaveLength(1);

    const moreSessionId = randomUUID();
    const moreSource = {
      kind: "direct" as const,
      operationId: `scenario_${moreSessionId.replaceAll("-", "")}`,
    };
    await createDrizzlePlannedSessionRepository(db).createOwned({
      profileId: ownerId,
      session: plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id: moreSessionId,
        profileId: ownerId,
        sessionRevision: 1,
        planningDate: "2026-08-12",
        originalTargetDate: "2026-08-12",
        source: moreSource,
        idempotencyKey: plannedSessionIdempotencyKey(moreSource),
        groupEventId: null,
        activityPlanId: planId,
        lifecycle: { status: "scheduled" },
      }),
    });
    const morePreviewRequest = {
      sessionId: moreSessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "more" as const, targetDurationSeconds: 2_700 },
    };
    const morePreview = await previewPlannedSessionScenario({
      db,
      profileId: ownerId,
      values: morePreviewRequest,
      now,
    });
    expect(morePreview.status).toBe("available");
    if (morePreview.status !== "available") throw new Error("Expected available more preview");
    const moreResult = await applyPlannedSessionScenario({
      db,
      actorId: ownerId,
      profileId: ownerId,
      request: {
        preview: morePreviewRequest,
        expectedPreviewFingerprint: morePreview.previewFingerprint,
        operationId: "more-scenario-apply-operation-00001",
      },
      now,
      enqueueProviderSync: async ({ sessionId, action }) => {
        providerCalls.push({ sessionId, action });
      },
    });
    expect(moreResult).toMatchObject({ status: "applied", action: "repointed" });
    if (moreResult.status !== "applied" || !moreResult.createdActivityPlanId)
      throw new Error("Expected more scenario copy");
    const [moreCopy] = await db
      .select()
      .from(activityPlans)
      .where(eq(activityPlans.id, moreResult.createdActivityPlanId));
    expect(moreCopy).toMatchObject({ profile_id: ownerId, content_visibility: "private" });
    expect(moreCopy?.structure_hash).not.toBe(hash);

    const unchangedPreviewRequest = {
      sessionId: otherSessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "as_planned" as const },
    };
    const unchangedPreview = await previewPlannedSessionScenario({
      db,
      profileId: ownerId,
      values: unchangedPreviewRequest,
      now,
    });
    if (unchangedPreview.status !== "available") throw new Error("Expected as-planned preview");
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: {
          preview: unchangedPreviewRequest,
          expectedPreviewFingerprint: unchangedPreview.previewFingerprint,
          operationId: "unchanged-scenario-apply-operation1",
        },
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).resolves.toMatchObject({
      status: "applied",
      action: "unchanged",
      createdActivityPlanId: null,
    });

    const skipPreviewRequest = { ...unchangedPreviewRequest, scenario: { kind: "skip" as const } };
    const skipPreview = await previewPlannedSessionScenario({
      db,
      profileId: ownerId,
      values: skipPreviewRequest,
      now,
    });
    if (skipPreview.status !== "available") throw new Error("Expected future skip preview");
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: {
          preview: skipPreviewRequest,
          expectedPreviewFingerprint: skipPreview.previewFingerprint,
          operationId: "future-skip-scenario-operation-0001",
        },
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).resolves.toMatchObject({ status: "applied", action: "cancelled" });
    expect(providerCalls).toEqual([
      { sessionId: selectedSessionId, action: "publish" },
      { sessionId: moreSessionId, action: "publish" },
      { sessionId: otherSessionId, action: "delete" },
    ]);
    expect(
      await db
        .select()
        .from(chatbotOperationReceipts)
        .where(eq(chatbotOperationReceipts.profile_id, ownerId)),
    ).toHaveLength(4);

    const rollbackSessionId = randomUUID();
    const rollbackSource = {
      kind: "direct" as const,
      operationId: `scenario_${rollbackSessionId.replaceAll("-", "")}`,
    };
    await createDrizzlePlannedSessionRepository(db).createOwned({
      profileId: ownerId,
      session: plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id: rollbackSessionId,
        profileId: ownerId,
        sessionRevision: 1,
        planningDate: "2026-08-13",
        originalTargetDate: "2026-08-13",
        source: rollbackSource,
        idempotencyKey: plannedSessionIdempotencyKey(rollbackSource),
        groupEventId: null,
        activityPlanId: planId,
        lifecycle: { status: "scheduled" },
      }),
    });
    const rollbackPreviewRequest = {
      sessionId: rollbackSessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "less" as const, targetDurationSeconds: 900 },
    };
    const rollbackPreview = await previewPlannedSessionScenario({
      db,
      profileId: ownerId,
      values: rollbackPreviewRequest,
      now,
    });
    if (rollbackPreview.status !== "available") throw new Error("Expected rollback preview");
    const plansBeforeOutboxFailure = await db
      .select({ id: activityPlans.id })
      .from(activityPlans)
      .where(eq(activityPlans.profile_id, ownerId));
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: {
          preview: rollbackPreviewRequest,
          expectedPreviewFingerprint: rollbackPreview.previewFingerprint,
          operationId: "outbox-failure-scenario-operation01",
        },
        now,
        enqueueProviderSync: async () => {
          throw new Error("simulated durable outbox failure");
        },
      }),
    ).rejects.toThrow("simulated durable outbox failure");
    expect(
      await db
        .select({ id: activityPlans.id })
        .from(activityPlans)
        .where(eq(activityPlans.profile_id, ownerId)),
    ).toEqual(plansBeforeOutboxFailure);
    const [rollbackSession] = await db
      .select()
      .from(plannedSessions)
      .where(eq(plannedSessions.id, rollbackSessionId));
    expect(rollbackSession).toMatchObject({ activity_plan_id: planId, session_revision: 1 });
    expect(
      await db
        .select()
        .from(chatbotOperationReceipts)
        .where(
          and(
            eq(chatbotOperationReceipts.profile_id, ownerId),
            eq(chatbotOperationReceipts.operation_id, "outbox-failure-scenario-operation01"),
          ),
        ),
    ).toHaveLength(0);
  });
});
