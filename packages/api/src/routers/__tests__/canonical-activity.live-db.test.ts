import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityFileIngestions,
  activitySegments,
  integrationResourceLinks,
  integrations,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  type ActivitySubmission,
  activityArtifactId,
  type ExistingActivityEnrichmentSubmission,
  submitActivity,
} from "../../application/activities/submit-activity";

const seededUserIds: string[] = [];

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
    onboarded: true,
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
    isPrivate: true,
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
          category: "bike",
          startOffsetMs: 0,
          endOffsetMs: 3_600_000,
          summary: {
            version: 1,
            timing: { timingCoverage: "complete", activeMs: 3_500_000, movingMs: 3_500_000 },
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
    normalizedPower: null,
    avgCadence: null,
    maxCadence: null,
    avgSpeedMps: null,
    maxSpeedMps: null,
    normalizedSpeedMps: null,
    normalizedGradedSpeedMps: null,
    efficiencyFactor: null,
    aerobicDecoupling: null,
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
  category: "bike" | "run" = "bike",
  sourceArtifactId?: string,
): ActivitySubmission["segmentSet"] {
  return {
    version: 1,
    elapsedMs,
    segments: [
      {
        id: randomUUID(),
        ordinal: 0,
        role: "activity",
        category,
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
      activityCompletedAt: new Date("2026-01-01T11:01:40Z"),
      activityPlanId: null,
      name: "Enriched activity",
      notes: "updated",
      isPrivate: false,
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
      is_private: false,
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
      category: "run",
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
        activityCompletedAt: new Date("2026-01-01T11:00:00.000Z"),
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationKey: `provider:${externalId}:one`,
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
        activityCompletedAt: new Date("2026-01-01T11:00:00.000Z"),
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationKey: `provider:${externalId}:one`,
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
        activityCompletedAt: new Date("2026-01-01T11:00:00.000Z"),
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationKey: `provider:${externalId}:stale`,
          artifact: artifact(profileId, "b", 43),
        },
      },
    });
    const current = await submitActivity(db, {
      ...submission(profileId, { name: "Provider revision two" }),
      providerProvenance: { ...provider, providerUpdatedAt: "2026-01-01T12:01:00.000Z" },
      analysis: {
        efforts: [],
        detectedLTHR: null,
        activityCompletedAt: new Date("2026-01-01T11:00:00.000Z"),
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId,
          operationKey: `provider:${externalId}:two`,
          artifact: artifact(profileId, "b", 43),
        },
      },
    });
    expect(exactRedelivery).toMatchObject({ id: first.id, noOp: true });
    expect(stale).toMatchObject({ id: first.id, noOp: true });
    expect(current).toMatchObject({ id: first.id, noOp: false });
    const imports = await db
      .select()
      .from(activities)
      .where(eq(activities.external_id, externalId));
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({ id: first.id, name: "Provider revision two" });
    const [resource] = await db
      .select()
      .from(integrationResourceLinks)
      .where(eq(integrationResourceLinks.internal_resource_id, first.id));
    expect(resource?.provider_updated_at?.toISOString()).toBe("2026-01-01T12:01:00.000Z");
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
        activityCompletedAt: new Date("2026-01-01T11:00:00.000Z"),
        ingestion: {
          source: "mobile_recording",
          operationKey: `recording:${randomUUID()}`,
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
