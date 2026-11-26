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
  chatbotOperationReceipts,
  integrationCredentials,
  integrationResourceLinks,
  integrations,
  plannedSessions,
  profileAthleteState,
  profiles,
  providerSyncJobs,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  type ActivitySubmission,
  activityArtifactId,
  submitActivity,
} from "../../application/activities/submit-activity";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { AthleteStateWorkerService } from "../../application/athlete-intelligence/athlete-state-worker";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { encryptProviderToken } from "../../lib/provider-token-crypto";
import { markAthleteStateDirty } from "../../repositories/athlete-state-repository";
import { readyActivityIngestion } from "../../test-support/ready-activity-ingestion";
import { createPlannedSessionsRouter } from "../planned-sessions";

const now = new Date("2026-08-01T12:00:00.000Z");
const tokenKey = Buffer.alloc(32, 17).toString("base64");
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "11111111-1111-4111-8111-111111111111",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "watts", intensity: 180 }],
    },
  ],
});

function isDisposableDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return (
      process.env.RUN_LIVE_DB_TESTS === "1" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      /^\/gradientpeak_api_live_db_\d+_\d+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

const describeDisposable = isDisposableDatabase() ? describe : describe.skip;

function caller(profileId: string) {
  return createPlannedSessionsRouter({ now: () => now }).createCaller({
    auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id: profileId, email: `${profileId}@scenario-outbox.test` } },
    trpcSource: "vitest-live-db",
  } as never);
}

async function seedProfile() {
  const profileId = randomUUID();
  const email = `${profileId}@scenario-outbox.test`;
  await db
    .insert(users)
    .values({ id: profileId, name: "Scenario outbox", email, emailVerified: true });
  await db.insert(profiles).values({
    id: profileId,
    email,
    full_name: "Scenario outbox",
    username: `scenario-outbox-${profileId.slice(0, 8)}`,
    onboarding_status: "completed",
    planning_timezone: "UTC",
    is_public: false,
  });
  return profileId;
}

async function submitCanonicalBikeFixture(profileId: string) {
  const activityId = randomUUID();
  const durationMs = 1_800_000;
  const finishedAt = new Date("2026-07-20T10:00:00.000Z");
  const startedAt = new Date(finishedAt.getTime() - durationMs);
  const digest = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
  const artifact = {
    sha256: digest,
    byteSize: 1_024,
    bucket: "activity-files",
    path: `artifacts/sha256/${profileId}/${digest}`,
    mediaType: "application/vnd.ant.fit" as const,
    format: "fit" as const,
  };
  const sourceArtifactId = activityArtifactId(profileId, artifact.sha256, artifact.byteSize);
  const normalizedPowerResult = calculateCyclingNormalizedPower({
    samples: Array.from({ length: durationMs / 5_000 + 1 }, (_, index) => ({
      timestampSeconds: Math.min(index * 5, durationMs / 1_000),
      powerWatts: 300,
    })),
  });
  if (normalizedPowerResult.status === "unavailable") throw new Error("Expected numeric power");
  const ingestion = await readyActivityIngestion(db, {
    profileId,
    operationId: `scenario-outbox:${activityId}`,
    source: "manual_import",
    artifact,
  });
  const segmentId = randomUUID();
  const effortId = randomUUID();
  const submission: ActivitySubmission = {
    requestedActivityId: activityId,
    profileId,
    name: "Canonical scenario outbox fixture",
    notes: null,
    contentVisibility: "private",
    startedAt,
    finishedAt,
    elapsedMs: durationMs,
    activeMs: durationMs,
    movingMs: durationMs,
    timingCoverage: "complete",
    distanceMeters: 20_000,
    calories: null,
    elevationGainMeters: null,
    avgHeartRate: null,
    maxHeartRate: null,
    avgPower: 300,
    maxPower: 300,
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
      elapsedMs: durationMs,
      segments: [
        {
          id: segmentId,
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: durationMs,
          source: {
            kind: "artifact",
            artifactId: sourceArtifactId,
            source: { standard: "fit", format: "fit" },
          },
          summary: {
            version: 1,
            timing: { timingCoverage: "complete", activeMs: durationMs, movingMs: durationMs },
            distanceMeters: 20_000,
            averagePowerWatts: 300,
            normalizedPowerResult,
          },
        },
      ],
    },
    analysis: {
      efforts: [
        {
          id: effortId,
          created_at: finishedAt,
          profile_id: profileId,
          activity_id: activityId,
          segment_id: segmentId,
          recorded_at: finishedAt,
          activity_category: "bike",
          effort_type: "power",
          source_series: "power",
          duration_seconds: durationMs / 1_000,
          source_artifact_id: sourceArtifactId,
          source_revision: 1,
          start_offset_ms: 0,
          end_offset_ms: durationMs,
          window_coverage: 1,
          max_gap_seconds: 2,
          unit: "watts",
          value: 300,
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
            exact_window_end_timestamp_seconds: finishedAt.getTime() / 1_000,
            exact_window_start_offset_seconds: 0,
            exact_window_end_offset_seconds: durationMs / 1_000,
            duration_seconds: durationMs / 1_000,
            contributing_duration_seconds: durationMs / 1_000,
            window_coverage: 1,
            source_time_coverage: 1,
            extraction_status: "available",
            extraction_reason: null,
            persisted_start_offset_quantization: "nearest_millisecond_v1",
            calculation_version: "best-effort-extraction-v1",
          },
        },
      ],
      detectedLTHR: null,
      ingestion: { source: "manual_import", ...ingestion, artifact },
    },
  };
  await submitActivity(db, submission);
  await db.transaction((tx) =>
    markAthleteStateDirty(tx, { profileId, effectiveAt: finishedAt, now }),
  );
  const worker = new AthleteStateWorkerService({ db });
  await worker.processDueJobs({ limit: 1, now });
  await worker.processDueJobs({ limit: 1, now });
  const [state] = await db
    .select()
    .from(profileAthleteState)
    .where(eq(profileAthleteState.profile_id, profileId));
  if (!state?.published_revision) throw new Error("Expected reconciled athlete state");
  return state.published_revision;
}

async function seedScenario(profileId: string) {
  const stateRevision = await submitCanonicalBikeFixture(profileId);
  const planId = randomUUID();
  const sessionId = randomUUID();
  const hash = activityPlanStructureHash(structure);
  await db.insert(activityPlans).values({
    id: planId,
    profile_id: profileId,
    name: "Scenario source",
    training_intent: "general_maintenance",
    structure,
    structure_hash: hash,
    semantic_hash: activityPlanSemanticHash({ structure, trainingIntent: "general_maintenance" }),
    content_visibility: "private",
  });
  const source = {
    kind: "direct" as const,
    operationId: `scenario_${sessionId.replaceAll("-", "")}`,
  };
  await createDrizzlePlannedSessionRepository(db).createOwned({
    profileId,
    session: plannedSessionSchema.parse({
      contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
      id: sessionId,
      profileId,
      sessionRevision: 1,
      planningDate: "2026-08-10",
      originalTargetDate: "2026-08-10",
      source,
      idempotencyKey: plannedSessionIdempotencyKey(source),
      groupEventId: null,
      activityPlanId: planId,
      lifecycle: { status: "scheduled" },
    }),
  });
  const wahooIntegrationId = randomUUID();
  const garminIntegrationId = randomUUID();
  await db.insert(integrations).values([
    { id: wahooIntegrationId, profile_id: profileId, provider: "wahoo", external_id: randomUUID() },
    {
      id: garminIntegrationId,
      profile_id: profileId,
      provider: "garmin",
      external_id: `synthetic-${profileId}`,
    },
  ]);
  await db.insert(integrationCredentials).values([
    {
      integration_id: wahooIntegrationId,
      access_token: encryptProviderToken("synthetic-wahoo-access"),
      refresh_token: encryptProviderToken("synthetic-wahoo-refresh"),
      scope: "plans_read plans_write workouts_read workouts_write",
    },
    {
      integration_id: garminIntegrationId,
      access_token: "enc:v1:synthetic-garmin-access",
      scope: "WORKOUT_IMPORT",
    },
  ]);
  return { planId, sessionId, stateRevision, wahooIntegrationId };
}

async function providerJobs(profileId: string, sessionId: string) {
  return db
    .select({
      provider: providerSyncJobs.provider,
      operation: providerSyncJobs.operation,
      jobType: providerSyncJobs.job_type,
      status: providerSyncJobs.status,
      payload: providerSyncJobs.payload,
    })
    .from(providerSyncJobs)
    .where(
      and(
        eq(providerSyncJobs.profile_id, profileId),
        eq(providerSyncJobs.internal_resource_id, sessionId),
      ),
    )
    .orderBy(providerSyncJobs.queue_sequence);
}

describeDisposable("planned-session scenario provider outbox through the protected router", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("durably queues Wahoo and Garmin effects, replays safely, and rolls back an outbox failure", async () => {
    vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", tokenKey);
    const profileId = await seedProfile();
    const fixture = await seedScenario(profileId);
    const api = caller(profileId);
    const previewInput = {
      sessionId: fixture.sessionId,
      expectedSessionRevision: 1,
      expectedPlanRevision: 1,
      expectedStateRevision: fixture.stateRevision,
      scenario: { kind: "less" as const, targetDurationSeconds: 900 },
    };
    const preview = await api.previewScenario(previewInput);
    expect(preview.status).toBe("available");
    if (preview.status !== "available") throw new Error("Expected available scenario preview");
    const repointRequest = {
      preview: previewInput,
      expectedPreviewFingerprint: preview.previewFingerprint,
      operationId: "scenario-outbox-repoint-operation-01",
    };

    const repointed = await api.applyScenario(repointRequest);
    expect(repointed).toMatchObject({ status: "applied", action: "repointed" });
    if (repointed.status !== "applied" || !repointed.createdActivityPlanId)
      throw new Error("Expected repointed scenario result");
    await expect(providerJobs(profileId, fixture.sessionId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "wahoo",
          operation: "publish",
          jobType: "wahoo.publish_planned_session",
          status: "queued",
          payload: expect.objectContaining({
            plannedSessionId: fixture.sessionId,
            operation: "publish",
          }),
        }),
        expect.objectContaining({
          provider: "garmin",
          operation: "publish",
          jobType: "garmin.training_planned_session",
          status: "queued",
          payload: expect.objectContaining({
            plannedSessionId: fixture.sessionId,
            operation: "publish",
          }),
        }),
      ]),
    );
    const jobsAfterRepoint = await providerJobs(profileId, fixture.sessionId);
    await expect(api.applyScenario(repointRequest)).resolves.toEqual(repointed);
    await expect(providerJobs(profileId, fixture.sessionId)).resolves.toEqual(jobsAfterRepoint);

    await db.insert(integrationResourceLinks).values({
      id: randomUUID(),
      profile_id: profileId,
      integration_id: fixture.wahooIntegrationId,
      provider: "wahoo",
      resource_kind: "planned_session",
      internal_resource_id: fixture.sessionId,
      external_id: "synthetic-wahoo-calendar-entry",
    });
    const skipInput = {
      ...previewInput,
      expectedSessionRevision: 2,
      expectedPlanRevision: 1,
      scenario: { kind: "skip" as const },
    };
    const skipPreview = await api.previewScenario(skipInput);
    expect(skipPreview.status).toBe("available");
    if (skipPreview.status !== "available") throw new Error("Expected available skip preview");
    const skipRequest = {
      preview: skipInput,
      expectedPreviewFingerprint: skipPreview.previewFingerprint,
      operationId: "scenario-outbox-cancel-operation-01",
    };
    await expect(api.applyScenario(skipRequest)).resolves.toMatchObject({
      status: "applied",
      action: "cancelled",
    });
    await expect(providerJobs(profileId, fixture.sessionId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "wahoo",
          operation: "unsync",
          payload: expect.objectContaining({
            plannedSessionId: fixture.sessionId,
            operation: "unsync",
          }),
        }),
        expect.objectContaining({
          provider: "garmin",
          operation: "cancel",
          payload: expect.objectContaining({
            plannedSessionId: fixture.sessionId,
            operation: "cancel",
          }),
        }),
      ]),
    );
    const jobsAfterCancel = await providerJobs(profileId, fixture.sessionId);
    await expect(api.applyScenario(skipRequest)).resolves.toEqual(
      expect.objectContaining({ status: "applied", action: "cancelled" }),
    );
    await expect(providerJobs(profileId, fixture.sessionId)).resolves.toEqual(jobsAfterCancel);

    const failureSessionId = randomUUID();
    const failureSource = {
      kind: "direct" as const,
      operationId: `scenario_${failureSessionId.replaceAll("-", "")}`,
    };
    await createDrizzlePlannedSessionRepository(db).createOwned({
      profileId,
      session: plannedSessionSchema.parse({
        contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
        id: failureSessionId,
        profileId,
        sessionRevision: 1,
        planningDate: "2026-08-11",
        originalTargetDate: "2026-08-11",
        source: failureSource,
        idempotencyKey: plannedSessionIdempotencyKey(failureSource),
        groupEventId: null,
        activityPlanId: fixture.planId,
        lifecycle: { status: "scheduled" },
      }),
    });
    const failurePreviewInput = { ...previewInput, sessionId: failureSessionId };
    const failurePreview = await api.previewScenario(failurePreviewInput);
    if (failurePreview.status !== "available")
      throw new Error("Expected available failure preview");
    const failureOperationId = "scenario-outbox-rollback-operation-01";
    const plansBeforeFailure = await db
      .select({ id: activityPlans.id })
      .from(activityPlans)
      .where(eq(activityPlans.profile_id, profileId));
    await db.execute(sql`
      create function scenario_outbox_fail_garmin_insert() returns trigger language plpgsql as $$
      begin
        if new.provider = 'garmin' then raise exception 'scenario_outbox_test_garmin_enqueue_failure'; end if;
        return new;
      end;
      $$;
      create trigger scenario_outbox_fail_garmin_insert
      before insert on provider_sync_jobs
      for each row execute function scenario_outbox_fail_garmin_insert();
    `);
    try {
      await expect(
        api.applyScenario({
          preview: failurePreviewInput,
          expectedPreviewFingerprint: failurePreview.previewFingerprint,
          operationId: failureOperationId,
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          cause: expect.objectContaining({
            message: expect.stringContaining("scenario_outbox_test_garmin_enqueue_failure"),
          }),
        }),
      });
    } finally {
      await db.execute(sql`
        drop trigger if exists scenario_outbox_fail_garmin_insert on provider_sync_jobs;
        drop function if exists scenario_outbox_fail_garmin_insert();
      `);
    }
    await expect(
      db
        .select({ id: activityPlans.id })
        .from(activityPlans)
        .where(eq(activityPlans.profile_id, profileId)),
    ).resolves.toEqual(plansBeforeFailure);
    await expect(
      db.select().from(plannedSessions).where(eq(plannedSessions.id, failureSessionId)),
    ).resolves.toEqual([
      expect.objectContaining({ activity_plan_id: fixture.planId, session_revision: 1 }),
    ]);
    await expect(providerJobs(profileId, failureSessionId)).resolves.toEqual([]);
    await expect(
      db
        .select({ id: chatbotOperationReceipts.id })
        .from(chatbotOperationReceipts)
        .where(
          and(
            eq(chatbotOperationReceipts.profile_id, profileId),
            eq(chatbotOperationReceipts.operation_id, failureOperationId),
          ),
        ),
    ).resolves.toEqual([]);
  });
});
