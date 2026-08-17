import { randomUUID } from "node:crypto";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  type activityEfforts,
  activityFileIngestions,
  activitySegments,
  activitySourceReferences,
  integrationResourceLinks,
  integrations,
  profiles,
  thresholdEvaluations,
  thresholds,
  users,
} from "@repo/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  ActivityArtifactLifecycleRetryableError,
  type ActivitySubmission,
  activityArtifactId,
  type ExistingActivityEnrichmentSubmission,
  submitActivity,
} from "../../application/activities/submit-activity";

const seededUserIds: string[] = [];
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

async function seedProfile() {
  const id = randomUUID();
  const email = `${id}@canonical-activity.test`;
  const now = new Date();
  await db.insert(users).values({
    id,
    name: "Canonical Activity Test",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: "Canonical Activity Test",
    username: `canonical-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    created_at: now,
    updated_at: now,
  });
  seededUserIds.push(id);
  return id;
}

function submission(
  profileId: string,
  overrides: Partial<ActivitySubmission> = {},
): ActivitySubmission {
  return {
    profileId,
    name: `Canonical ${randomUUID()}`,
    notes: null,
    contentVisibility: "private",
    startedAt: new Date("2026-01-01T10:00:00Z"),
    finishedAt: new Date("2026-01-01T11:00:00Z"),
    elapsedMs: 3_600_000,
    activeMs: 3_500_000,
    movingMs: 3_500_000,
    timingCoverage: "complete",
    segmentSet: {
      version: 1,
      elapsedMs: 3_600_000,
      segments: [
        {
          id: randomUUID(),
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: 3_600_000,
          summary: {
            version: 1,
            timing: { timingCoverage: "complete", activeMs: 3_500_000, movingMs: 3_500_000 },
            normalizedPowerResult: unavailableNormalizedPowerResult,
          },
        },
      ],
    },
    distanceMeters: 20_000,
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
    deviceManufacturer: null,
    deviceProduct: null,
    laps: null,
    mapBounds: null,
    polyline: null,
    ...overrides,
  };
}

function segmentManifest(
  elapsedMs: number,
  activeMs: number,
  movingMs: number,
  activity_category: "bike" | "run" = "bike",
  sourceArtifactId?: string,
  segmentId: string = randomUUID(),
): NonNullable<ActivitySubmission["segmentSet"]> {
  return {
    version: 1,
    elapsedMs,
    segments: [
      {
        id: segmentId,
        ordinal: 0,
        role: "activity",
        activity_category,
        startOffsetMs: 0,
        endOffsetMs: elapsedMs,
        ...(sourceArtifactId
          ? {
              source: {
                kind: "artifact" as const,
                artifactId: sourceArtifactId,
                source: { standard: "fit" as const, format: "fit" },
              },
            }
          : {}),
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs, movingMs },
          normalizedPowerResult: unavailableNormalizedPowerResult,
        },
      },
    ],
  };
}

function artifact(profileId: string, digestCharacter: string, byteSize: number) {
  const sha256 = digestCharacter.repeat(64);
  return {
    sha256,
    byteSize,
    bucket: "activity-files",
    path: `artifacts/sha256/${profileId}/${sha256}`,
    mediaType: "application/octet-stream",
    format: "fit",
    originalName: "activity.fit",
  } as const;
}

function manualBikeThresholdSubmission(input: {
  profileId: string;
  finishedAt: Date;
  valueWatts: number;
  digestCharacter: string;
}) {
  const activityId = randomUUID();
  const segmentId = randomUUID();
  const effortId = randomUUID();
  const elapsedMs = 1_800_000;
  const startedAt = new Date(input.finishedAt.getTime() - elapsedMs);
  const acceptedArtifact = artifact(input.profileId, input.digestCharacter, 1_024);
  const sourceArtifactId = activityArtifactId(
    input.profileId,
    acceptedArtifact.sha256,
    acceptedArtifact.byteSize,
  );
  return {
    activityId,
    submission: submission(input.profileId, {
      requestedActivityId: activityId,
      name: `Concurrent threshold ${input.valueWatts}`,
      startedAt,
      finishedAt: input.finishedAt,
      elapsedMs,
      activeMs: elapsedMs,
      movingMs: elapsedMs,
      segmentSet: segmentManifest(
        elapsedMs,
        elapsedMs,
        elapsedMs,
        "bike",
        sourceArtifactId,
        segmentId,
      ),
      analysis: {
        efforts: [
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
            duration_seconds: 1_800,
            source_artifact_id: sourceArtifactId,
            source_revision: 1,
            start_offset_ms: 0,
            end_offset_ms: elapsedMs,
            window_coverage: 1,
            max_gap_seconds: 2,
            unit: "watts",
            value: input.valueWatts,
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
              exact_window_end_offset_seconds: 1_800,
              duration_seconds: 1_800,
              contributing_duration_seconds: 1_800,
              window_coverage: 1,
              source_time_coverage: 1,
              extraction_status: "available",
              extraction_reason: null,
              persisted_start_offset_quantization: "nearest_millisecond_v1",
              calculation_version: "best-effort-extraction-v1",
            },
          } satisfies typeof activityEfforts.$inferInsert,
        ],
        detectedLTHR: null,
        ingestion: {
          source: "manual_import",
          operationId: `manual-threshold:${activityId}`,
          artifact: acceptedArtifact,
        },
      },
    }),
  };
}

afterEach(async () => {
  while (seededUserIds.length) {
    const id = seededUserIds.pop();
    if (id) {
      await db.transaction(async (tx) => {
        await tx.delete(activities).where(eq(activities.profile_id, id));
        await tx.execute(
          sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
        );
        await tx
          .update(activityArtifacts)
          .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
          .where(eq(activityArtifacts.profile_id, id));
        await tx
          .update(activityArtifacts)
          .set({ availability: "deleted", deleted_at: new Date() })
          .where(eq(activityArtifacts.profile_id, id));
        await tx.execute(
          sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
        );
        await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, id));
      });
      await db.delete(profiles).where(eq(profiles.id, id));
      await db.delete(users).where(eq(users.id, id));
    }
  }
});
afterAll(async () => pool.end());

describe("canonical activity persistence against PostgreSQL", () => {
  it("creates a fresh activity and captures canonical performance targets in its write snapshot", async () => {
    const profileId = await seedProfile();
    const created = await submitActivity(db, submission(profileId));

    const [activity] = await db.select().from(activities).where(eq(activities.id, created.id));
    expect(activity?.performance_target_snapshot).toMatchObject({
      contractVersion: "completed-activity-performance-target-snapshot-v2",
      publishedRevision: null,
      publicationStatus: "available",
      targets: {
        athleteId: profileId,
        thresholds: {
          bike: { status: "unavailable", thresholdId: null },
          run: { status: "unavailable", thresholdId: null },
          swim: { status: "unavailable", thresholdId: null },
        },
      },
    });
  });

  it("serializes same-profile manual thresholds before snapshot capture while other profiles proceed", async () => {
    const profileId = await seedProfile();
    const otherProfileId = await seedProfile();
    const first = manualBikeThresholdSubmission({
      profileId,
      finishedAt: new Date("2026-01-01T11:00:00.000Z"),
      valueWatts: 300,
      digestCharacter: "a",
    });
    const second = manualBikeThresholdSubmission({
      profileId,
      finishedAt: new Date("2026-01-02T11:00:00.000Z"),
      valueWatts: 330,
      digestCharacter: "b",
    });
    const independent = manualBikeThresholdSubmission({
      profileId: otherProfileId,
      finishedAt: new Date("2026-01-01T11:00:00.000Z"),
      valueWatts: 280,
      digestCharacter: "c",
    });

    let signalFirstBeforePersist!: () => void;
    const firstBeforePersist = new Promise<void>((resolve) => {
      signalFirstBeforePersist = resolve;
    });
    let releaseFirst!: () => void;
    const firstMayCommit = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstCommit = submitActivity(db, first.submission, {
      beforePersist: async () => {
        signalFirstBeforePersist();
        await firstMayCommit;
      },
    });
    await firstBeforePersist;

    let signalSecondTransactionStarted!: () => void;
    const secondTransactionStarted = new Promise<void>((resolve) => {
      signalSecondTransactionStarted = resolve;
    });
    const secondSession = {
      $client: {
        connect: async () => {
          const client = await pool.connect();
          let firstQuery = true;
          return new Proxy(client, {
            get(target, property) {
              const value = Reflect.get(target, property, target);
              if (property === "query") {
                return (...args: unknown[]) => {
                  if (firstQuery) {
                    firstQuery = false;
                    signalSecondTransactionStarted();
                  }
                  return (value as (...queryArgs: unknown[]) => unknown).apply(target, args);
                };
              }
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
      },
    } as unknown as typeof db;
    let secondReachedBeforePersist = false;
    const secondCommit = submitActivity(secondSession, second.submission, {
      beforePersist: async () => {
        secondReachedBeforePersist = true;
      },
    });
    await secondTransactionStarted;

    const independentCommit = submitActivity(db, independent.submission);
    let independentGateFailure: unknown;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        independentCommit,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("A separate profile was blocked by the submission fence")),
            3_000,
          );
        }),
      ]);
      expect(secondReachedBeforePersist).toBe(false);
    } catch (error) {
      independentGateFailure = error;
    } finally {
      if (timeout) clearTimeout(timeout);
      releaseFirst();
    }

    const commits = await Promise.allSettled([firstCommit, secondCommit, independentCommit]);
    if (independentGateFailure) throw independentGateFailure;
    for (const commit of commits) {
      if (commit.status === "rejected") throw commit.reason;
    }
    expect(secondReachedBeforePersist).toBe(true);

    const chain = await db
      .select()
      .from(thresholds)
      .where(eq(thresholds.profile_id, profileId))
      .orderBy(asc(thresholds.effective_at), asc(thresholds.id));
    expect(chain).toHaveLength(2);
    expect(chain[0]?.supersedes_id).toBeNull();
    expect(chain[1]?.supersedes_id).toBe(chain[0]?.id);
    expect(chain.filter(({ supersedes_id }) => supersedes_id === null)).toHaveLength(1);

    const evaluations = await db
      .select()
      .from(thresholdEvaluations)
      .where(eq(thresholdEvaluations.profile_id, profileId));
    expect(evaluations).toHaveLength(2);
    const [secondActivity] = await db
      .select({ snapshot: activities.performance_target_snapshot })
      .from(activities)
      .where(eq(activities.id, second.activityId));
    expect(secondActivity?.snapshot).toMatchObject({
      targets: { thresholds: { bike: { thresholdId: chain[0]?.id } } },
    });

    const independentChain = await db
      .select()
      .from(thresholds)
      .where(eq(thresholds.profile_id, otherProfileId));
    expect(independentChain).toHaveLength(1);
    expect(independentChain[0]?.supersedes_id).toBeNull();
  });

  it("fails closed while a conflicting content artifact is pending deletion", async () => {
    const profileId = await seedProfile();
    const acceptedArtifact = artifact(profileId, "d", 42);
    const first = await submitActivity(db, {
      ...submission(profileId),
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "manual_import",
          artifact: acceptedArtifact,
          operationId: `first:${randomUUID()}`,
        },
      },
    });
    const artifactId = activityArtifactId(
      profileId,
      acceptedArtifact.sha256,
      acceptedArtifact.byteSize,
    );
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
      );
      await tx
        .update(activityArtifacts)
        .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
        .where(eq(activityArtifacts.id, artifactId));
    });

    await expect(
      submitActivity(db, {
        ...submission(profileId, { name: "Retry after deletion repair" }),
        analysis: {
          efforts: [],
          detectedLTHR: null,
          ingestion: {
            source: "manual_import",
            artifact: acceptedArtifact,
            operationId: `retry:${randomUUID()}`,
          },
        },
      }),
    ).rejects.toBeInstanceOf(ActivityArtifactLifecycleRetryableError);
    expect(await db.select().from(activities).where(eq(activities.id, first.id))).toHaveLength(1);
  });

  it("rolls back the complete projection when composed persistence fails", async () => {
    const profileId = await seedProfile();
    const activityId = randomUUID();
    const name = `Rollback ${randomUUID()}`;
    await expect(
      submitActivity(db, {
        ...submission(profileId),
        requestedActivityId: activityId,
        name,
        composition: {
          persist: async () => {
            throw new Error("composition failed");
          },
        },
      }),
    ).rejects.toThrow("composition failed");
    expect(await db.select().from(activities).where(eq(activities.name, name))).toEqual([]);
    expect(
      await db.select().from(activitySegments).where(eq(activitySegments.activity_id, activityId)),
    ).toEqual([]);
  });

  it("ownership-scopes and atomically upserts an existing activity projection", async () => {
    const profileId = await seedProfile();
    const otherProfileId = await seedProfile();
    const created = await submitActivity(db, submission(profileId));
    const enrichment: ExistingActivityEnrichmentSubmission = {
      kind: "enrich" as const,
      activityId: created.id,
      profileId,
      deviceManufacturer: "Wahoo",
      deviceProduct: "ELEMNT",
      laps: [],
      mapBounds: null,
      polyline: "encoded-line",
      summaryValues: {
        activity_id: created.id,
        profile_id: profileId,
        elapsed_ms: 3_700_000,
        active_ms: 3_600_000,
        moving_ms: 3_550_000,
        timing_coverage: "complete",
        distance_meters: 21_000,
      },
      segmentSet: segmentManifest(3_700_000, 3_600_000, 3_550_000, "run"),
      efforts: [],
      detectedLTHR: null,
      activityPlanId: null,
      name: "Enriched activity",
      notes: "updated",
      contentVisibility: "followers",
      startedAt: new Date("2026-01-01T10:01:00Z"),
      finishedAt: new Date("2026-01-01T11:01:40Z"),
    };
    await submitActivity(db, enrichment);
    const [activity] = await db.select().from(activities).where(eq(activities.id, created.id));
    const segments = await db
      .select()
      .from(activitySegments)
      .where(eq(activitySegments.activity_id, created.id));
    expect(activity).toMatchObject({
      profile_id: profileId,
      name: "Enriched activity",
      notes: "updated",
      content_visibility: "followers",
      activity_plan_id: null,
      elapsed_ms: 3_700_000,
      active_ms: 3_600_000,
      moving_ms: 3_550_000,
      timing_coverage: "complete",
      distance_meters: 21_000,
      polyline: "encoded-line",
      segments_revision: 2,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      profile_id: profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "run",
      start_offset_ms: 0,
      end_offset_ms: 3_700_000,
      timing_coverage: "complete",
      active_ms: 3_600_000,
      moving_ms: 3_550_000,
      segment_revision: 2,
    });

    await expect(submitActivity(db, { ...enrichment, profileId: otherProfileId })).rejects.toThrow(
      "Activity not found for profile",
    );
    expect(
      await db
        .select()
        .from(activities)
        .where(and(eq(activities.id, created.id), eq(activities.profile_id, otherProfileId))),
    ).toEqual([]);
  });

  it("deterministically fences and idempotently upserts provider revisions", async () => {
    const profileId = await seedProfile();
    const [integration] = await db
      .insert(integrations)
      .values({ profile_id: profileId, provider: "wahoo", external_id: randomUUID() })
      .returning({ id: integrations.id });
    if (!integration) throw new Error("Failed to seed integration");
    const externalId = randomUUID();
    const provider = {
      provider: "wahoo" as const,
      externalId,
      integrationId: integration.id,
      providerUpdatedAt: "2026-01-01T12:00:00.000Z",
    };
    const first = await submitActivity(db, {
      ...submission(profileId, { name: "Provider revision one" }),
      providerProvenance: provider,
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationId: `provider:${externalId}:one`,
          artifact: artifact(profileId, "a", 42),
        },
      },
    });
    const exactRedelivery = await submitActivity(db, {
      ...submission(profileId, { name: "Ignored exact redelivery" }),
      providerProvenance: provider,
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationId: `provider:${externalId}:one`,
          artifact: artifact(profileId, "a", 42),
        },
      },
    });
    const stale = await submitActivity(db, {
      ...submission(profileId, { name: "Ignored stale revision" }),
      providerProvenance: { ...provider, providerUpdatedAt: "2026-01-01T11:59:59.000Z" },
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationId: `provider:${externalId}:stale`,
          artifact: artifact(profileId, "b", 43),
        },
      },
    });
    const newerRevisionWithSameArtifact = await submitActivity(db, {
      ...submission(profileId, { name: "Provider metadata revision" }),
      providerProvenance: { ...provider, providerUpdatedAt: "2026-01-01T12:00:30.000Z" },
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationId: `provider:${externalId}:one`,
          artifact: artifact(profileId, "a", 42),
        },
      },
    });
    const current = await submitActivity(db, {
      ...submission(profileId, { name: "Provider revision two" }),
      providerProvenance: { ...provider, providerUpdatedAt: "2026-01-01T12:01:00.000Z" },
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationId: `provider:${externalId}:two`,
          artifact: artifact(profileId, "b", 43),
        },
      },
    });
    expect(exactRedelivery).toMatchObject({ id: first.id, noOp: true });
    expect(stale).toMatchObject({ id: first.id, noOp: true });
    expect(newerRevisionWithSameArtifact).toMatchObject({ id: first.id, noOp: false });
    expect(current).toMatchObject({ id: first.id, noOp: false });
    const imports = await db.select().from(activities).where(eq(activities.id, first.id));
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      id: first.id,
      name: "Provider revision two",
      segments_revision: 3,
    });
    const [sourceReference] = await db
      .select()
      .from(activitySourceReferences)
      .where(eq(activitySourceReferences.activity_id, first.id));
    expect(sourceReference?.provider_revision).toBe("2026-01-01T12:01:00.000Z");
    await expect(
      db
        .select()
        .from(integrationResourceLinks)
        .where(eq(integrationResourceLinks.internal_resource_id, first.id)),
    ).resolves.toEqual([]);
    const links = await db
      .select()
      .from(activityArtifactLinks)
      .where(eq(activityArtifactLinks.activity_id, first.id));
    expect(links).toHaveLength(2);
    expect(links.filter((link) => link.is_current)).toEqual([
      expect.objectContaining({ ordinal: 1, provider_revision: "2026-01-01T12:01:00.000Z" }),
    ]);
  });

  it("commits recording artifact, segment, and ready ingestion semantics atomically", async () => {
    const profileId = await seedProfile();
    const acceptedArtifact = artifact(profileId, "c", 42);
    const created = await submitActivity(db, {
      ...submission(profileId, {
        segmentSet: segmentManifest(
          3_600_000,
          3_500_000,
          3_500_000,
          "bike",
          activityArtifactId(profileId, acceptedArtifact.sha256, acceptedArtifact.byteSize),
        ),
      }),
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "mobile_recording",
          operationId: `recording:${randomUUID()}`,
          artifact: acceptedArtifact,
          fileType: "fit",
        },
      },
    });
    const rows = await db
      .select()
      .from(activityFileIngestions)
      .where(eq(activityFileIngestions.activity_id, created.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "ready",
      source: "mobile_recording",
      activity_id: created.id,
      attempt_count: 1,
    });
    expect(rows[0]?.artifact_id).not.toBeNull();
    const [storedArtifact] = await db
      .select()
      .from(activityArtifacts)
      .where(eq(activityArtifacts.id, rows[0]?.artifact_id ?? ""));
    expect(storedArtifact).toMatchObject({
      profile_id: profileId,
      digest: acceptedArtifact.sha256,
      byte_size: 42,
      path: acceptedArtifact.path,
      availability: "accepted",
    });
    const [sourceLink] = await db
      .select()
      .from(activityArtifactLinks)
      .where(eq(activityArtifactLinks.activity_id, created.id));
    expect(sourceLink).toMatchObject({
      artifact_id: storedArtifact?.id,
      role: "source",
      ordinal: 0,
      is_current: true,
    });
    const [segment] = await db
      .select()
      .from(activitySegments)
      .where(eq(activitySegments.activity_id, created.id));
    expect(segment).toMatchObject({
      ordinal: 0,
      source_artifact_id: storedArtifact?.id,
      timing_coverage: "complete",
      active_ms: 3_500_000,
      moving_ms: 3_500_000,
    });
  });
});
