import { randomUUID } from "node:crypto";
import { activityPlanStructureSchema, initializeActivityPlanDocument } from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifacts,
  type activityEfforts,
  activityPlans,
  events,
  integrationCredentials,
  integrationResourceLinks,
  integrations,
  profileAthleteState,
  profileMetrics,
  profiles,
  providerSyncJobs,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ActivitySubmission,
  activityArtifactId,
  submitActivity,
} from "../../../application/activities/submit-activity";
import { activityPlanDocumentHash } from "../../../application/activity-plans/structure-hash";
import { AthleteStateWorkerService } from "../../../application/athlete-intelligence/athlete-state-worker";
import { wahooProjectionSnapshotSchema } from "../../integrations/wahoo/plan-converter";
import { wahooPlannedActivityRequiredScopes } from "../../integrations/wahoo/planned-activity-scopes";
import { encryptProviderToken } from "../../provider-token-crypto";
import { enqueueWahooPlannedActivitySyncAfterCalendarMutation } from "./wahoo-calendar-mutation-sync";

const profileIds: string[] = [];
const providerTokenKey = Buffer.alloc(32, 11).toString("base64");
const plannedActivityScope = [...wahooPlannedActivityRequiredScopes, "offline_data"].join(" ");
const unavailableNormalizedPower = calculateCyclingNormalizedPower({ samples: [] });

type Owner = { integrationId: string; profileId: string };

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

async function publishDueAthleteState(now: Date) {
  await new AthleteStateWorkerService({ db }).processDueJobs({
    limit: 1,
    now: new Date(now.getTime() + 60_000),
  });
}

function cyclingEfforts(input: {
  activityId: string;
  artifactId: string;
  bias: "long" | "short";
  completedAt: Date;
  profileId: string;
  scale: number;
  segmentId: string;
}): Array<typeof activityEfforts.$inferInsert> {
  const activityStartedAtSeconds = input.completedAt.getTime() / 1_000 - 3_600;
  const shortDurationPower = new Map([
    [5, 1_200],
    [30, 600],
    [60, 500],
  ]);
  return [5, 30, 60, 180, 300, 600, 900, 1_200, 1_800, 3_600].map((durationSeconds) => {
    const id = randomUUID();
    const endOffsetSeconds = 3_600;
    const startOffsetSeconds = endOffsetSeconds - durationSeconds;
    return {
      id,
      created_at: input.completedAt,
      profile_id: input.profileId,
      activity_id: input.activityId,
      segment_id: input.segmentId,
      recorded_at: input.completedAt,
      activity_category: "bike",
      effort_type: "power",
      source_series: "power",
      duration_seconds: durationSeconds,
      source_artifact_id: input.artifactId,
      source_revision: 1,
      start_offset_ms: startOffsetSeconds * 1_000,
      end_offset_ms: endOffsetSeconds * 1_000,
      window_coverage: 1,
      max_gap_seconds: 2,
      unit: "watts",
      value:
        (shortDurationPower.get(durationSeconds) ?? 240 + 24_000 / durationSeconds) *
        input.scale *
        ((input.bias === "short") === durationSeconds <= 600 ? 1 : 0.98),
      source: "imported",
      method: "activity_file_best_effort",
      calculation_version: "best-effort-extraction-v1",
      provenance: {
        observation_id: id,
        activity_id: input.activityId,
        segment_id: input.segmentId,
        derived_from: "activity_file_stream",
        source_series: "power",
        interval_convention: "current_sample_applies_to_preceding_interval",
        exact_window_start_timestamp_seconds: activityStartedAtSeconds + startOffsetSeconds,
        exact_window_end_timestamp_seconds: activityStartedAtSeconds + endOffsetSeconds,
        exact_window_start_offset_seconds: startOffsetSeconds,
        exact_window_end_offset_seconds: endOffsetSeconds,
        duration_seconds: durationSeconds,
        contributing_duration_seconds: durationSeconds,
        window_coverage: 1,
        source_time_coverage: 1,
        extraction_status: "available",
        extraction_reason: null,
        persisted_start_offset_quantization: "floor_seconds_v1",
        calculation_version: "best-effort-extraction-v1",
      },
    };
  });
}

async function seedOwner(): Promise<Owner> {
  const profileId = randomUUID();
  const integrationId = randomUUID();
  const now = new Date();
  const email = `${profileId}@wahoo-target-refresh.test`;
  profileIds.push(profileId);
  await db.insert(users).values({
    id: profileId,
    email,
    emailVerified: true,
    name: "Wahoo target refresh test",
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    planning_timezone: "UTC",
    created_at: now,
    updated_at: now,
  });
  await db.insert(integrations).values({
    id: integrationId,
    profile_id: profileId,
    provider: "wahoo",
    external_id: `wahoo-${profileId}`,
    created_at: now,
    updated_at: now,
  });
  await db.insert(integrationCredentials).values({
    integration_id: integrationId,
    access_token: encryptProviderToken("target-refresh-access"),
    refresh_token: encryptProviderToken("target-refresh-refresh"),
    scope: plannedActivityScope,
  });
  await db.insert(profileAthleteState).values({
    profile_id: profileId,
    source_revision: 1,
    published_revision: 1,
    dirty_from_at: null,
    fitness: 0,
    fatigue: 0,
    evidence_confidence: 1,
    algorithm_version: "athlete-state-projection-v1",
    computed_at: now,
  });
  return { integrationId, profileId };
}

function lthrSubmission(input: {
  completedAt: Date;
  externalId?: string;
  lthrBpm?: number;
  owner: Owner;
  powerBias?: "long" | "short";
  powerScale?: number;
}): ActivitySubmission {
  const activityId = randomUUID();
  const segmentId = randomUUID();
  const externalId = input.externalId ?? `activity-${randomUUID()}`;
  const digestSeed = randomUUID().replaceAll("-", "");
  const digest = `${digestSeed}${digestSeed}`;
  const artifactId = activityArtifactId(input.owner.profileId, digest, 1_024);
  const startedAt = new Date(input.completedAt.getTime() - 3_600_000);
  const completedAtSeconds = input.completedAt.getTime() / 1_000;
  return {
    requestedActivityId: activityId,
    profileId: input.owner.profileId,
    name: `Imported performance evidence ${input.lthrBpm ?? input.powerScale ?? "empty"}`,
    notes: null,
    contentVisibility: "private",
    startedAt,
    finishedAt: input.completedAt,
    elapsedMs: 3_600_000,
    activeMs: 3_600_000,
    movingMs: 3_600_000,
    timingCoverage: "complete",
    distanceMeters: 30_000,
    calories: null,
    elevationGainMeters: null,
    avgHeartRate: null,
    maxHeartRate: null,
    avgPower: null,
    maxPower: null,
    avgCadence: null,
    maxCadence: null,
    avgSpeedMps: null,
    maxSpeedMps: null,
    normalizedSpeedMps: null,
    avgTemperature: null,
    deviceManufacturer: "Wahoo",
    deviceProduct: "ELEMNT",
    laps: null,
    mapBounds: null,
    polyline: null,
    providerProvenance: {
      connector: { connectorId: "wahoo", externalId },
      source: { sourceId: "wahoo", externalId },
      integrationId: input.owner.integrationId,
      integrationGeneration: 1,
      providerUpdatedAt: input.completedAt.toISOString(),
    },
    segmentSet: {
      version: 1,
      elapsedMs: 3_600_000,
      segments: [
        {
          id: segmentId,
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: 3_600_000,
          source: {
            kind: "artifact",
            artifactId,
            source: { standard: "fit", format: "fit" },
          },
          summary: {
            version: 1,
            timing: {
              timingCoverage: "complete",
              activeMs: 3_600_000,
              movingMs: 3_600_000,
            },
            normalizedPowerResult: unavailableNormalizedPower,
          },
        },
      ],
    },
    analysis: {
      efforts:
        input.powerScale === undefined
          ? []
          : cyclingEfforts({
              activityId,
              artifactId,
              bias: input.powerBias ?? "short",
              completedAt: input.completedAt,
              profileId: input.owner.profileId,
              scale: input.powerScale,
              segmentId,
            }),
      detectedLTHR:
        input.lthrBpm === undefined
          ? null
          : {
              valueBpm: input.lthrBpm,
              recordedAt: input.completedAt,
              calculationVersion: "activity-file-lthr-v1",
              provenance: {
                activity_id: activityId,
                segment_id: segmentId,
                derived_from: "activity_file_best_effort",
                source_series: "heart_rate",
                source_effort_calculation_version: "best-effort-extraction-v1",
                exact_window_start_timestamp_seconds: completedAtSeconds - 1_200,
                exact_window_end_timestamp_seconds: completedAtSeconds,
                duration_seconds: 1_200,
                window_coverage: 1,
                extraction_status: "available",
                extraction_reason: null,
              },
            },
      ingestion: {
        source: "provider_sync",
        provider: "wahoo",
        externalId,
        operationId: `provider_sync:wahoo:${externalId}:${digest}`,
        artifact: {
          sha256: digest,
          byteSize: 1_024,
          bucket: "activity-files",
          path: `artifacts/sha256/${input.owner.profileId}/${digest}`,
          mediaType: "application/vnd.ant.fit",
          format: "fit",
          originalName: `${externalId}.fit`,
        },
      },
    },
  };
}

function plannedActivityStructure(target: {
  intensity: number;
  type: "%FTP" | "%ThresholdHR" | "bpm";
}) {
  return activityPlanStructureSchema.parse({
    version: 3,
    segments: [
      {
        id: randomUUID(),
        role: "activity",
        activity_category: "bike",
        name: "Bike",
        intervals: [
          {
            id: randomUUID(),
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: randomUUID(),
                name: "Target",
                duration: { type: "time", seconds: 1_800 },
                targets: [target],
              },
            ],
          },
        ],
      },
    ],
  });
}

async function seedPlannedActivity(input: {
  owner: Owner;
  startsAt: Date;
  target: { intensity: number; type: "%FTP" | "%ThresholdHR" | "bpm" };
}) {
  const planId = randomUUID();
  const eventId = randomUUID();
  const structure = plannedActivityStructure(input.target);
  const document = initializeActivityPlanDocument({ activityPlanId: planId, structure });
  await db.insert(activityPlans).values({
    id: planId,
    profile_id: input.owner.profileId,
    name: `Target refresh ${eventId}`,
    description: "Provider target refresh fixture",
    structure: document,
    structure_hash: activityPlanDocumentHash(document),
  });
  await db.insert(events).values({
    id: eventId,
    profile_id: input.owner.profileId,
    event_type: "planned",
    status: "scheduled",
    title: `Planned activity ${eventId}`,
    timezone: "UTC",
    starts_at: input.startsAt,
    ends_at: new Date(input.startsAt.getTime() + 3_600_000),
    scheduled_date: input.startsAt.toISOString().slice(0, 10),
    activity_plan_id: planId,
  });
  return { eventId, planId };
}

async function enqueueInitialPublish(owner: Owner, eventId: string) {
  const result = await enqueueWahooPlannedActivitySyncAfterCalendarMutation({
    db,
    eventIds: [eventId],
    operation: "publish",
    profileId: owner.profileId,
  });
  if (!result?.jobId) throw new Error("Expected Wahoo publish job");
  const [job] = await db
    .select()
    .from(providerSyncJobs)
    .where(eq(providerSyncJobs.id, result.jobId))
    .limit(1);
  if (!job) throw new Error("Expected persisted Wahoo publish job");
  return job;
}

function projectionSnapshot(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Expected Wahoo publish payload object");
  }
  if (!("projectionSnapshot" in payload)) {
    throw new Error("Expected Wahoo projection snapshot");
  }
  return wahooProjectionSnapshotSchema.parse(payload.projectionSnapshot);
}

function projectionHash(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Expected Wahoo publish payload object");
  }
  if (!("projectionHash" in payload) || typeof payload.projectionHash !== "string") {
    throw new Error("Expected Wahoo projection hash");
  }
  return payload.projectionHash;
}

async function markPublished(input: {
  eventId: string;
  jobId: string;
  owner: Owner;
  payload: unknown;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(providerSyncJobs)
      .set({ status: "completed", updated_at: now })
      .where(eq(providerSyncJobs.id, input.jobId));
    await tx.insert(integrationResourceLinks).values({
      id: randomUUID(),
      profile_id: input.owner.profileId,
      integration_id: input.owner.integrationId,
      provider: "wahoo",
      resource_kind: "event",
      internal_resource_id: input.eventId,
      external_id: `remote-${input.eventId}`,
      provider_metadata: {
        wahoo: { projectionHash: projectionHash(input.payload) },
      },
      synced_at: now,
      created_at: now,
      updated_at: now,
    });
  });
}

async function eventJobs(eventId: string) {
  return db
    .select()
    .from(providerSyncJobs)
    .where(
      and(
        eq(providerSyncJobs.internal_resource_id, eventId),
        eq(providerSyncJobs.job_type, "wahoo.publish_event"),
      ),
    )
    .orderBy(providerSyncJobs.queue_sequence);
}

beforeEach(() => {
  vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", providerTokenKey);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const profileId of profileIds.splice(0)) {
    await db.transaction(async (tx) => {
      await tx.delete(profileMetrics).where(eq(profileMetrics.profile_id, profileId));
      await tx.delete(activities).where(eq(activities.profile_id, profileId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
      );
      await tx
        .update(activityArtifacts)
        .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
        .where(eq(activityArtifacts.profile_id, profileId));
      await tx
        .update(activityArtifacts)
        .set({ availability: "deleted", deleted_at: new Date() })
        .where(eq(activityArtifacts.profile_id, profileId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
      );
      await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, profileId));
      await tx.delete(users).where(eq(users.id, profileId));
    });
  }
});

afterAll(async () => {
  await pool.end();
});

describe("Wahoo relative-target refresh after accepted activity evidence", () => {
  it("enqueues a new absolute target projection and keeps exact import retry idempotent", async () => {
    const owner = await seedOwner();
    const now = new Date();
    await submitActivity(
      db,
      lthrSubmission({
        completedAt: new Date(now.getTime() - 14_400_000),
        owner,
        powerBias: "short",
        powerScale: 1,
      }),
    );
    await submitActivity(
      db,
      lthrSubmission({
        completedAt: new Date(now.getTime() - 12_600_000),
        owner,
        powerBias: "long",
        powerScale: 1,
      }),
    );
    await publishDueAthleteState(now);
    const plannedActivity = await seedPlannedActivity({
      owner,
      startsAt: addDays(now, 2),
      target: { type: "%FTP", intensity: 90 },
    });
    const initialJob = await enqueueInitialPublish(owner, plannedActivity.eventId);
    const initialFtp = projectionSnapshot(initialJob.payload).plan.header.ftp;
    if (initialFtp === undefined) throw new Error("Expected initial absolute Wahoo FTP target");
    await markPublished({
      eventId: plannedActivity.eventId,
      jobId: initialJob.id,
      owner,
      payload: initialJob.payload,
    });

    await submitActivity(
      db,
      lthrSubmission({
        completedAt: new Date(now.getTime() - 7_200_000),
        owner,
        powerBias: "short",
        powerScale: 1.1,
      }),
    );
    const changedImport = lthrSubmission({
      completedAt: new Date(now.getTime() - 5_400_000),
      owner,
      powerBias: "long",
      powerScale: 1.1,
    });
    await submitActivity(db, changedImport);

    const afterChange = await eventJobs(plannedActivity.eventId);
    expect(afterChange).toHaveLength(2);
    expect(afterChange[0]).toMatchObject({ id: initialJob.id, status: "completed" });
    expect(afterChange[1]).toMatchObject({ operation: "publish", status: "queued" });
    expect(projectionSnapshot(afterChange[1]?.payload).plan.header.ftp).toBeGreaterThan(initialFtp);
    const replacement = afterChange[1];
    if (!replacement) throw new Error("Expected replacement Wahoo publish job");

    await expect(submitActivity(db, changedImport)).resolves.toMatchObject({ noOp: true });
    const afterRetry = await eventJobs(plannedActivity.eventId);
    expect(afterRetry).toHaveLength(2);
    expect(afterRetry[1]).toMatchObject({
      id: replacement.id,
      payload: replacement.payload,
      payload_hash: replacement.payload_hash,
      status: "queued",
      updated_at: replacement.updated_at,
    });
  });

  it("does not enqueue when newer canonical evidence leaves the Wahoo target unchanged", async () => {
    const owner = await seedOwner();
    const now = new Date();
    await submitActivity(
      db,
      lthrSubmission({ completedAt: new Date(now.getTime() - 10_800_000), lthrBpm: 180, owner }),
    );
    await publishDueAthleteState(now);
    const plannedActivity = await seedPlannedActivity({
      owner,
      startsAt: addDays(now, 2),
      target: { type: "%ThresholdHR", intensity: 90 },
    });
    const initialJob = await enqueueInitialPublish(owner, plannedActivity.eventId);
    await markPublished({
      eventId: plannedActivity.eventId,
      jobId: initialJob.id,
      owner,
      payload: initialJob.payload,
    });

    await submitActivity(
      db,
      lthrSubmission({ completedAt: new Date(now.getTime() - 7_200_000), lthrBpm: 180, owner }),
    );

    await expect(eventJobs(plannedActivity.eventId)).resolves.toEqual([
      expect.objectContaining({
        id: initialJob.id,
        payload: initialJob.payload,
        payload_hash: initialJob.payload_hash,
        status: "completed",
      }),
    ]);
  });

  it("preserves an existing future planned activity when changed evidence removes its target anchor", async () => {
    const owner = await seedOwner();
    const now = new Date();
    const externalId = `activity-${randomUUID()}`;
    await submitActivity(
      db,
      lthrSubmission({
        completedAt: new Date(now.getTime() - 10_800_000),
        externalId,
        lthrBpm: 170,
        owner,
      }),
    );
    await publishDueAthleteState(now);
    const plannedActivity = await seedPlannedActivity({
      owner,
      startsAt: addDays(now, 2),
      target: { type: "%ThresholdHR", intensity: 90 },
    });
    const initialJob = await enqueueInitialPublish(owner, plannedActivity.eventId);
    await markPublished({
      eventId: plannedActivity.eventId,
      jobId: initialJob.id,
      owner,
      payload: initialJob.payload,
    });

    await submitActivity(
      db,
      lthrSubmission({
        completedAt: new Date(now.getTime() - 7_200_000),
        externalId,
        owner,
      }),
    );

    await expect(eventJobs(plannedActivity.eventId)).resolves.toEqual([
      expect.objectContaining({ id: initialJob.id, operation: "publish", status: "completed" }),
    ]);
    await expect(
      db
        .select()
        .from(integrationResourceLinks)
        .where(
          and(
            eq(integrationResourceLinks.internal_resource_id, plannedActivity.eventId),
            eq(integrationResourceLinks.resource_kind, "event"),
          ),
        ),
    ).resolves.toHaveLength(1);
  });

  it("excludes absolute-target and out-of-window planned activities from target refresh", async () => {
    const owner = await seedOwner();
    const now = new Date();
    await submitActivity(
      db,
      lthrSubmission({ completedAt: new Date(now.getTime() - 10_800_000), lthrBpm: 170, owner }),
    );
    await publishDueAthleteState(now);
    const absolute = await seedPlannedActivity({
      owner,
      startsAt: addDays(now, 2),
      target: { type: "bpm", intensity: 150 },
    });
    const outsideWindow = await seedPlannedActivity({
      owner,
      startsAt: addDays(now, 8),
      target: { type: "%ThresholdHR", intensity: 90 },
    });
    const absoluteJob = await enqueueInitialPublish(owner, absolute.eventId);
    const outsideJob = await enqueueInitialPublish(owner, outsideWindow.eventId);
    await markPublished({
      eventId: absolute.eventId,
      jobId: absoluteJob.id,
      owner,
      payload: absoluteJob.payload,
    });

    await submitActivity(
      db,
      lthrSubmission({ completedAt: new Date(now.getTime() - 7_200_000), lthrBpm: 180, owner }),
    );

    await expect(eventJobs(absolute.eventId)).resolves.toEqual([
      expect.objectContaining({
        id: absoluteJob.id,
        payload: absoluteJob.payload,
        payload_hash: absoluteJob.payload_hash,
        status: "completed",
      }),
    ]);
    const outsideJobs = await eventJobs(outsideWindow.eventId);
    expect(outsideJobs).toHaveLength(1);
    expect(outsideJobs[0]).toMatchObject({
      id: outsideJob.id,
      payload: outsideJob.payload,
      payload_hash: outsideJob.payload_hash,
      status: "queued",
      updated_at: outsideJob.updated_at,
    });
    expect(projectionSnapshot(outsideJobs[0]?.payload).plan.header.threshold_hr).toBe(170);
  });
});
