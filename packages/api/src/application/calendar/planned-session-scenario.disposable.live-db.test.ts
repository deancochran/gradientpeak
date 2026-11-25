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
  profileMetrics,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
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

async function createScheduledScenarioSession(input: {
  profileId: string;
  planId: string;
  planningDate: string;
}) {
  const id = randomUUID();
  const source = { kind: "direct" as const, operationId: `scenario_${id.replaceAll("-", "")}` };
  await expect(
    createDrizzlePlannedSessionRepository(db).createOwned({
      profileId: input.profileId,
      session: plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id,
        profileId: input.profileId,
        sessionRevision: 1,
        planningDate: input.planningDate,
        originalTargetDate: input.planningDate,
        source,
        idempotencyKey: plannedSessionIdempotencyKey(source),
        groupEventId: null,
        activityPlanId: input.planId,
        lifecycle: { status: "scheduled" },
      }),
    }),
  ).resolves.toMatchObject({ status: "created" });
  return id;
}

async function createAvailableScenarioFixture(label: string) {
  const ownerId = await seedProfile(label);
  const planId = randomUUID();
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
    name: `${label} source plan`,
    structure,
    structure_hash: hash,
    semantic_hash: semanticHash,
    content_visibility: "private",
  });
  const selectedSessionId = await createScheduledScenarioSession({
    profileId: ownerId,
    planId,
    planningDate: "2026-08-10",
  });
  const otherSessionId = await createScheduledScenarioSession({
    profileId: ownerId,
    planId,
    planningDate: "2026-08-11",
  });
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
  if (preview.status !== "available") throw new Error("Expected available scenario preview");
  return {
    ownerId,
    planId,
    selectedSessionId,
    otherSessionId,
    publishedState,
    previewRequest,
    preview,
  };
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
    const beforeStaleFingerprint = await readScenarioRows(ownerId);
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: {
          ...request,
          expectedPreviewFingerprint: `v1:sha256:${"f".repeat(64)}`,
          operationId: "stale-fingerprint-scenario-operation",
        },
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).resolves.toMatchObject({ status: "stale", reason: "preview_fingerprint" });
    expect(await readScenarioRows(ownerId)).toEqual(beforeStaleFingerprint);
    expect(providerCalls).toHaveLength(0);
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
    expect(activityPlanStructureSchema.parse(copy?.structure).items).toMatchObject([
      { type: "step", duration: { type: "time", seconds: 900 } },
    ]);
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
    const copiesBeforeConflict = await db
      .select({ id: activityPlans.id })
      .from(activityPlans)
      .where(eq(activityPlans.profile_id, ownerId));
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: {
          ...request,
          preview: { ...previewRequest, scenario: { kind: "less", targetDurationSeconds: 1_200 } },
        },
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).rejects.toMatchObject({ name: "OperationReceiptConflictError" });
    expect(
      await db
        .select({ id: activityPlans.id })
        .from(activityPlans)
        .where(eq(activityPlans.profile_id, ownerId)),
    ).toEqual(copiesBeforeConflict);
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
    expect(activityPlanStructureSchema.parse(moreCopy?.structure).items).toMatchObject([
      { type: "step", duration: { type: "time", seconds: 2_700 } },
    ]);

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
    const futureSkipRequest = {
      preview: skipPreviewRequest,
      expectedPreviewFingerprint: skipPreview.previewFingerprint,
      operationId: "future-skip-scenario-operation-0001",
    };
    const futureSkip = await applyPlannedSessionScenario({
      db,
      actorId: ownerId,
      profileId: ownerId,
      request: futureSkipRequest,
      now,
      enqueueProviderSync: async ({ sessionId, action }) => {
        providerCalls.push({ sessionId, action });
      },
    });
    expect(futureSkip).toMatchObject({ status: "applied", action: "cancelled" });
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: futureSkipRequest,
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).resolves.toEqual(futureSkip);
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
    ).toHaveLength(5);

    const sameDaySessionId = randomUUID();
    const sameDaySource = {
      kind: "direct" as const,
      operationId: `scenario_${sameDaySessionId.replaceAll("-", "")}`,
    };
    await createDrizzlePlannedSessionRepository(db).createOwned({
      profileId: ownerId,
      session: plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id: sameDaySessionId,
        profileId: ownerId,
        sessionRevision: 1,
        planningDate: "2026-08-01",
        originalTargetDate: "2026-08-01",
        source: sameDaySource,
        idempotencyKey: plannedSessionIdempotencyKey(sameDaySource),
        groupEventId: null,
        activityPlanId: planId,
        lifecycle: { status: "scheduled" },
      }),
    });
    const sameDayPreviewRequest = {
      sessionId: sameDaySessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "skip" as const },
    };
    const sameDayPreview = await previewPlannedSessionScenario({
      db,
      profileId: ownerId,
      values: sameDayPreviewRequest,
      now,
    });
    if (sameDayPreview.status !== "available") throw new Error("Expected same-day skip preview");
    const sameDaySkipRequest = {
      preview: sameDayPreviewRequest,
      expectedPreviewFingerprint: sameDayPreview.previewFingerprint,
      operationId: "same-day-skip-scenario-operation01",
    };
    const sameDaySkip = await applyPlannedSessionScenario({
      db,
      actorId: ownerId,
      profileId: ownerId,
      request: sameDaySkipRequest,
      now,
      enqueueProviderSync: async ({ sessionId, action }) => {
        providerCalls.push({ sessionId, action });
      },
    });
    expect(sameDaySkip).toMatchObject({ status: "applied", action: "skipped" });
    const [sameDayAfter] = await db
      .select()
      .from(plannedSessions)
      .where(eq(plannedSessions.id, sameDaySessionId));
    expect(sameDayAfter).toMatchObject({
      status: "completed",
      completion_outcome: "skipped",
      completed_activity_id: null,
    });
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: sameDaySkipRequest,
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).resolves.toEqual(sameDaySkip);
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: {
          ...sameDaySkipRequest,
          operationId: "terminal-session-scenario-operation",
        },
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "session_not_scheduled" });
    expect(providerCalls).toEqual([
      { sessionId: selectedSessionId, action: "publish" },
      { sessionId: moreSessionId, action: "publish" },
      { sessionId: otherSessionId, action: "delete" },
      { sessionId: sameDaySessionId, action: "delete" },
    ]);

    const ownedAlternativeId = randomUUID();
    const foreignOwnerId = await seedProfile("Scenario foreign candidate");
    const foreignAlternativeId = randomUUID();
    await db.insert(activityPlans).values([
      {
        id: ownedAlternativeId,
        profile_id: ownerId,
        name: "Owned private substitute",
        structure,
        structure_hash: hash,
        semantic_hash: semanticHash,
        content_visibility: "private",
      },
      {
        id: foreignAlternativeId,
        profile_id: foreignOwnerId,
        name: "Foreign private substitute",
        structure,
        structure_hash: hash,
        semantic_hash: semanticHash,
        content_visibility: "private",
      },
    ]);
    const substituteSessionId = randomUUID();
    const substituteSource = {
      kind: "direct" as const,
      operationId: `scenario_${substituteSessionId.replaceAll("-", "")}`,
    };
    await createDrizzlePlannedSessionRepository(db).createOwned({
      profileId: ownerId,
      session: plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id: substituteSessionId,
        profileId: ownerId,
        sessionRevision: 1,
        planningDate: "2026-08-14",
        originalTargetDate: "2026-08-14",
        source: substituteSource,
        idempotencyKey: plannedSessionIdempotencyKey(substituteSource),
        groupEventId: null,
        activityPlanId: planId,
        lifecycle: { status: "scheduled" },
      }),
    });
    const substitutePreviewRequest = {
      sessionId: substituteSessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "substitute" as const, activityPlanId: ownedAlternativeId },
    };
    const substitutePreview = await previewPlannedSessionScenario({
      db,
      profileId: ownerId,
      values: substitutePreviewRequest,
      now,
    });
    if (substitutePreview.status !== "available")
      throw new Error("Expected owned substitute preview");
    const substituteResult = await applyPlannedSessionScenario({
      db,
      actorId: ownerId,
      profileId: ownerId,
      request: {
        preview: substitutePreviewRequest,
        expectedPreviewFingerprint: substitutePreview.previewFingerprint,
        operationId: "owned-substitute-scenario-operation1",
      },
      now,
      enqueueProviderSync: async ({ sessionId, action }) => {
        providerCalls.push({ sessionId, action });
      },
    });
    expect(substituteResult).toMatchObject({ status: "applied", action: "repointed" });
    if (substituteResult.status !== "applied" || !substituteResult.createdActivityPlanId)
      throw new Error("Expected owned substitute copy");
    const [ownedSubstituteCopy] = await db
      .select()
      .from(activityPlans)
      .where(eq(activityPlans.id, substituteResult.createdActivityPlanId));
    expect(ownedSubstituteCopy).toMatchObject({
      profile_id: ownerId,
      content_visibility: "private",
      structure_hash: hash,
    });

    const foreignSessionId = randomUUID();
    const foreignSource = {
      kind: "direct" as const,
      operationId: `scenario_${foreignSessionId.replaceAll("-", "")}`,
    };
    await createDrizzlePlannedSessionRepository(db).createOwned({
      profileId: ownerId,
      session: plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id: foreignSessionId,
        profileId: ownerId,
        sessionRevision: 1,
        planningDate: "2026-08-15",
        originalTargetDate: "2026-08-15",
        source: foreignSource,
        idempotencyKey: plannedSessionIdempotencyKey(foreignSource),
        groupEventId: null,
        activityPlanId: planId,
        lifecycle: { status: "scheduled" },
      }),
    });
    const foreignRequest = {
      sessionId: foreignSessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "substitute" as const, activityPlanId: foreignAlternativeId },
    };
    const beforeForeignApply = await readScenarioRows(ownerId);
    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: ownerId,
        profileId: ownerId,
        request: {
          preview: foreignRequest,
          expectedPreviewFingerprint: `v1:sha256:${"e".repeat(64)}`,
          operationId: "foreign-substitute-scenario-operation",
        },
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "candidate_unavailable" });
    expect(await readScenarioRows(ownerId)).toEqual(beforeForeignApply);

    const concurrentSessionId = randomUUID();
    const concurrentSource = {
      kind: "direct" as const,
      operationId: `scenario_${concurrentSessionId.replaceAll("-", "")}`,
    };
    await createDrizzlePlannedSessionRepository(db).createOwned({
      profileId: ownerId,
      session: plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id: concurrentSessionId,
        profileId: ownerId,
        sessionRevision: 1,
        planningDate: "2026-08-16",
        originalTargetDate: "2026-08-16",
        source: concurrentSource,
        idempotencyKey: plannedSessionIdempotencyKey(concurrentSource),
        groupEventId: null,
        activityPlanId: planId,
        lifecycle: { status: "scheduled" },
      }),
    });
    const concurrentPreviewRequest = {
      sessionId: concurrentSessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: publishedState.published_revision,
      scenario: { kind: "less" as const, targetDurationSeconds: 900 },
    };
    const concurrentPreview = await previewPlannedSessionScenario({
      db,
      profileId: ownerId,
      values: concurrentPreviewRequest,
      now,
    });
    if (concurrentPreview.status !== "available") throw new Error("Expected concurrent preview");
    const copiesBeforeConcurrent = await db
      .select({ id: activityPlans.id })
      .from(activityPlans)
      .where(eq(activityPlans.profile_id, ownerId));
    const concurrentResults = await Promise.all(
      ["concurrent-scenario-operation-0001", "concurrent-scenario-operation-0002"].map(
        (operationId) =>
          applyPlannedSessionScenario({
            db,
            actorId: ownerId,
            profileId: ownerId,
            request: {
              preview: concurrentPreviewRequest,
              expectedPreviewFingerprint: concurrentPreview.previewFingerprint,
              operationId,
            },
            now,
            enqueueProviderSync: async ({ sessionId, action }) => {
              providerCalls.push({ sessionId, action });
            },
          }),
      ),
    );
    expect(concurrentResults.filter((result) => result.status === "applied")).toHaveLength(1);
    expect(concurrentResults.filter((result) => result.status === "stale")).toHaveLength(1);
    expect(
      await db
        .select({ id: activityPlans.id })
        .from(activityPlans)
        .where(eq(activityPlans.profile_id, ownerId)),
    ).toHaveLength(copiesBeforeConcurrent.length + 1);
    const [concurrentAfter] = await db
      .select()
      .from(plannedSessions)
      .where(eq(plannedSessions.id, concurrentSessionId));
    expect(concurrentAfter).toMatchObject({ session_revision: 2, status: "scheduled" });
    expect(providerCalls.filter((call) => call.sessionId === concurrentSessionId)).toEqual([
      { sessionId: concurrentSessionId, action: "publish" },
    ]);

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
        createRepository: (executor) => {
          const repository = createDrizzlePlannedSessionRepository(executor);
          return {
            ...repository,
            mutateOwned: async (mutation) =>
              mutation.action === "repoint_activity_plan"
                ? { status: "stale_revision" as const, currentRevision: 2 }
                : repository.mutateOwned(mutation),
          };
        },
        enqueueProviderSync: async () => {
          throw new Error("provider follow-up must not run after stale repoint");
        },
      }),
    ).resolves.toEqual({
      status: "stale",
      reason: "session_revision",
      currentSessionRevision: 2,
      currentPlanRevision: 1,
      currentStateRevision: publishedState.published_revision,
    });
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

  it("rejects an old preview after each persisted scenario authority change without copying, repointing, or syncing", async () => {
    const cases = [
      {
        label: "selected session",
        change: async (fixture: Awaited<ReturnType<typeof createAvailableScenarioFixture>>) => {
          await db
            .update(plannedSessions)
            .set({ session_revision: 2 })
            .where(eq(plannedSessions.id, fixture.selectedSessionId));
        },
      },
      {
        label: "source plan",
        change: async (fixture: Awaited<ReturnType<typeof createAvailableScenarioFixture>>) => {
          const changedStructure = activityPlanStructureSchema.parse({
            version: 5,
            activity_category: "bike",
            items: [
              {
                type: "step",
                id: "11111111-1111-4111-8111-111111111111",
                duration: { type: "time", seconds: 1_200 },
                targets: [{ type: "%FTP", intensity: 75 }],
              },
            ],
          });
          await db
            .update(activityPlans)
            .set({
              structure: changedStructure,
              structure_hash: activityPlanStructureHash(changedStructure),
              semantic_hash: activityPlanSemanticHash({
                structure: changedStructure,
                trainingIntent: "general_maintenance",
              }),
            })
            .where(eq(activityPlans.id, fixture.planId));
        },
      },
      {
        label: "published state",
        change: async (fixture: Awaited<ReturnType<typeof createAvailableScenarioFixture>>) => {
          await submitCanonicalBikeFixture({
            profileId: fixture.ownerId,
            finishedAt: new Date("2026-07-31T10:00:00.000Z"),
            durationMs: 1_800_000,
            powerWatts: 280,
          });
          await db.transaction((tx) =>
            markAthleteStateDirty(tx, {
              profileId: fixture.ownerId,
              effectiveAt: new Date("2026-07-31T10:00:00.000Z"),
              now,
            }),
          );
          await new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now });
          await new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now });
        },
      },
      {
        label: "other horizon session",
        change: async (fixture: Awaited<ReturnType<typeof createAvailableScenarioFixture>>) => {
          await db
            .update(plannedSessions)
            .set({ session_revision: 2 })
            .where(eq(plannedSessions.id, fixture.otherSessionId));
        },
      },
    ];

    for (const testCase of cases) {
      const fixture = await createAvailableScenarioFixture(`Stale ${testCase.label}`);
      const providerCalls: Array<{ sessionId: string; action: string }> = [];
      const plansBefore = await db
        .select({ id: activityPlans.id })
        .from(activityPlans)
        .where(eq(activityPlans.profile_id, fixture.ownerId));
      await testCase.change(fixture);
      const [selectedBeforeApply] = await db
        .select()
        .from(plannedSessions)
        .where(eq(plannedSessions.id, fixture.selectedSessionId));

      const result = await applyPlannedSessionScenario({
        db,
        actorId: fixture.ownerId,
        profileId: fixture.ownerId,
        request: {
          preview: fixture.previewRequest,
          expectedPreviewFingerprint: fixture.preview.previewFingerprint,
          operationId: `stale-authority-${testCase.label.replaceAll(" ", "-")}-0001`,
        },
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      });
      expect(result.status, testCase.label).toBe("stale");
      expect(
        await db
          .select({ id: activityPlans.id })
          .from(activityPlans)
          .where(eq(activityPlans.profile_id, fixture.ownerId)),
      ).toEqual(plansBefore);
      expect(
        await db.query.plannedSessions.findFirst({
          where: eq(plannedSessions.id, fixture.selectedSessionId),
        }),
      ).toEqual(selectedBeforeApply);
      expect(providerCalls).toEqual([]);
    }
  });

  it("uses a planning-day-stable fingerprint and invalidates it for a persisted observation", async () => {
    const fixture = await createAvailableScenarioFixture("Fingerprint observation");
    const morning = await previewPlannedSessionScenario({
      db,
      profileId: fixture.ownerId,
      values: fixture.previewRequest,
      now: new Date("2026-08-01T00:01:00.000Z"),
    });
    const evening = await previewPlannedSessionScenario({
      db,
      profileId: fixture.ownerId,
      values: fixture.previewRequest,
      now: new Date("2026-08-01T01:00:00.000Z"),
    });
    expect(morning.status).toBe("available");
    expect(evening.status).toBe("available");
    if (morning.status !== "available" || evening.status !== "available")
      throw new Error("Expected available planning-day previews");
    expect(evening.provenance.selectedAlternative?.structure).toEqual(
      morning.provenance.selectedAlternative?.structure,
    );
    expect(evening.baseline).toEqual(morning.baseline);
    expect(evening.alternative).toEqual(morning.alternative);
    expect(evening.previewFingerprint).toBe(morning.previewFingerprint);

    await db.insert(profileMetrics).values({
      id: randomUUID(),
      profile_id: fixture.ownerId,
      metric_type: "resting_hr",
      value: 47,
      unit: "bpm",
      recorded_at: new Date("2026-07-31T12:00:00.000Z"),
      source: "manual",
      method: "scenario-disposable-fixture",
      calculation_version: "scenario-disposable-v1",
      quality_score: 1,
      provenance: { source: "scenario-disposable-fixture" },
    });
    const changed = await previewPlannedSessionScenario({
      db,
      profileId: fixture.ownerId,
      values: fixture.previewRequest,
      now: new Date("2026-08-01T01:00:00.000Z"),
    });
    expect(changed.status).toBe("available");
    if (changed.status !== "available") throw new Error("Expected changed available preview");
    expect(changed.previewFingerprint).not.toBe(morning.previewFingerprint);
  });

  it("denies the original actor's replay after the applied session is transferred to another actor", async () => {
    const fixture = await createAvailableScenarioFixture("Receipt ownership transfer");
    const newOwnerId = await seedProfile("Receipt ownership transfer recipient");
    const providerCalls: Array<{ sessionId: string; action: string }> = [];
    const request = {
      preview: fixture.previewRequest,
      expectedPreviewFingerprint: fixture.preview.previewFingerprint,
      operationId: "receipt-ownership-transfer-operation",
    };
    const applied = await applyPlannedSessionScenario({
      db,
      actorId: fixture.ownerId,
      profileId: fixture.ownerId,
      request,
      now,
      enqueueProviderSync: async ({ sessionId, action }) => {
        providerCalls.push({ sessionId, action });
      },
    });
    expect(applied).toMatchObject({ status: "applied", action: "repointed" });
    // Ownership fields are immutable in production. This disposable fixture
    // transition models an administrative ownership transfer while preserving
    // the real receipt fence and its post-fence authorization check.
    await db.execute(
      sql`alter table planned_sessions disable trigger planned_sessions_identity_immutable`,
    );
    try {
      await db
        .update(plannedSessions)
        .set({ profile_id: newOwnerId })
        .where(eq(plannedSessions.id, fixture.selectedSessionId));
    } finally {
      await db.execute(
        sql`alter table planned_sessions enable trigger planned_sessions_identity_immutable`,
      );
    }

    await expect(
      applyPlannedSessionScenario({
        db,
        actorId: fixture.ownerId,
        profileId: fixture.ownerId,
        request,
        now,
        enqueueProviderSync: async ({ sessionId, action }) => {
          providerCalls.push({ sessionId, action });
        },
      }),
    ).rejects.toMatchObject({ name: "OperationReceiptUnauthorizedError" });
    expect(providerCalls).toEqual([{ sessionId: fixture.selectedSessionId, action: "publish" }]);
  });
});
