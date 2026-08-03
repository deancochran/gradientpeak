import { randomUUID } from "node:crypto";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
  profiles,
  swimmingCssProtocolEvidence,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createAthletePerformanceModelRepository } from "../../repositories/athlete-performance-model-repository";
import { reconcileGeneratedActivityEvidence } from "../activities/reconcile-activity-evidence";
import { getAthletePerformanceModelAsOf } from "./get-athlete-performance-model-as-of";
import {
  reconcileSwimmingCssProtocolEvidence,
  reconcileSwimmingCssProtocolEvidenceWithProfileLockHeld,
} from "./reconcile-swimming-css-protocol-evidence";

const seededProfileIds: string[] = [];
const startedAt = new Date("2026-07-20T00:00:00.000Z");
const seededAt = new Date("2026-07-20T01:00:00.000Z");

function acceptedArtifact(profileId: string, digestCharacter: string) {
  const digest = digestCharacter.repeat(64);
  return {
    id: randomUUID(),
    profile_id: profileId,
    digest_algorithm: "sha256" as const,
    digest,
    byte_size: 1_024,
    bucket: "activity-files",
    path: `artifacts/sha256/${profileId}/${digest}`,
    media_type: "application/vnd.ant.fit",
    format: "fit",
    availability: "accepted" as const,
    first_accepted_at: seededAt,
  };
}

async function seedProfile(): Promise<string> {
  const profileId = randomUUID();
  const email = `${profileId}@swimming-css-protocol.test`;
  seededProfileIds.push(profileId);
  await db.insert(users).values({
    id: profileId,
    name: "Swimming CSS protocol test",
    email,
    emailVerified: true,
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    created_at: seededAt,
    updated_at: seededAt,
  });
  return profileId;
}

function segmentSummary(distanceMeters: 400 | 200, durationSeconds: number) {
  return {
    version: 1,
    timing: {
      timingCoverage: "complete" as const,
      activeMs: durationSeconds * 1_000,
      movingMs: durationSeconds * 1_000,
    },
    distanceMeters,
    swim: {
      poolLengthMeters: 25,
      timingEvidence: {
        status: "available" as const,
        calculationVersion: "swim-active-rest-duration-v1" as const,
        elapsedDurationSeconds: durationSeconds,
        knownDurationSeconds: durationSeconds,
        sourceLengthCount: distanceMeters / 25,
        activeLengthCount: distanceMeters / 25,
        activeDurationSeconds: durationSeconds,
        restDurationSeconds: 0,
      },
    },
    normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
  };
}

function cssSourceRows(input: {
  activityId: string;
  artifactId: string;
  profileId: string;
  revision: number;
}) {
  const segment400Id = randomUUID();
  const segment200Id = randomUUID();
  const effort400Id = randomUUID();
  const effort200Id = randomUUID();
  const protocolId = `css_400m_200m:${input.activityId}`;
  const observed400 = new Date(startedAt.getTime() + 320_000);
  const observed200 = new Date(startedAt.getTime() + 510_000);
  const segmentRows: Array<typeof activitySegments.$inferInsert> = [
    {
      id: segment400Id,
      activity_id: input.activityId,
      profile_id: input.profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "swim",
      start_offset_ms: 0,
      end_offset_ms: 320_000,
      source_artifact_id: input.artifactId,
      source_session_index: 0,
      summary: segmentSummary(400, 320),
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 320_000,
      moving_ms: 320_000,
      segment_revision: input.revision,
      parser_version: `test-parser-v${input.revision}`,
      materializer_version: `test-materializer-v${input.revision}`,
      created_at: seededAt,
    },
    {
      id: segment200Id,
      activity_id: input.activityId,
      profile_id: input.profileId,
      ordinal: 1,
      role: "activity",
      activity_category: "swim",
      start_offset_ms: 360_000,
      end_offset_ms: 510_000,
      source_artifact_id: input.artifactId,
      source_session_index: 1,
      summary: segmentSummary(200, 150),
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 150_000,
      moving_ms: 150_000,
      segment_revision: input.revision,
      parser_version: `test-parser-v${input.revision}`,
      materializer_version: `test-materializer-v${input.revision}`,
      created_at: seededAt,
    },
  ];
  const effort = (source: {
    distanceMeters: 400 | 200;
    durationSeconds: number;
    endOffsetMs: number;
    id: string;
    observedAt: Date;
    segmentId: string;
    startOffsetMs: number;
  }): typeof activityEfforts.$inferInsert => ({
    id: source.id,
    created_at: seededAt,
    updated_at: seededAt,
    profile_id: input.profileId,
    activity_id: input.activityId,
    segment_id: source.segmentId,
    recorded_at: source.observedAt,
    activity_category: "swim",
    effort_type: "speed",
    duration_seconds: source.durationSeconds,
    distance_meters: source.distanceMeters,
    start_offset: source.startOffsetMs / 1_000,
    unit: "meters_per_second",
    value: source.distanceMeters / source.durationSeconds,
    source: "imported",
    method: "activity_file_swim_distance_effort",
    calculation_version: "activity-file-swim-distance-effort-v1",
    provenance: {
      observation_id: source.id,
      protocol_id: protocolId,
      protocol: "css_400m_200m",
      activity_id: input.activityId,
      segment_id: source.segmentId,
      derived_from: "activity_file_swim_segment",
      source_series: "swim_distance",
      distance_meters: source.distanceMeters,
      active_duration_seconds: source.durationSeconds,
      segment_start_offset_ms: source.startOffsetMs,
      segment_end_offset_ms: source.endOffsetMs,
      environment: "pool",
      timing_basis: "pool_length_timing",
      pool_length_meters: 25,
      calculation_version: "activity-file-swim-distance-effort-v1",
    },
  });
  const effortRows = [
    effort({
      id: effort400Id,
      segmentId: segment400Id,
      distanceMeters: 400,
      durationSeconds: 320,
      startOffsetMs: 0,
      endOffsetMs: 320_000,
      observedAt: observed400,
    }),
    effort({
      id: effort200Id,
      segmentId: segment200Id,
      distanceMeters: 200,
      durationSeconds: 150,
      startOffsetMs: 360_000,
      endOffsetMs: 510_000,
      observedAt: observed200,
    }),
  ];
  return { effortRows, segmentRows };
}

async function seedActivity(profileId: string) {
  const activityId = randomUUID();
  const artifact = acceptedArtifact(profileId, "a");
  const source = cssSourceRows({
    activityId,
    artifactId: artifact.id,
    profileId,
    revision: 1,
  });
  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id: activityId,
      profile_id: profileId,
      name: "Canonical 400 m / 200 m CSS protocol",
      started_at: startedAt,
      finished_at: new Date(startedAt.getTime() + 510_000),
      elapsed_ms: 510_000,
      active_ms: 470_000,
      moving_ms: 470_000,
      timing_coverage: "complete",
      distance_meters: 600,
      pool_length_meters: 25,
      segments_revision: 1,
      parser_version: "test-parser-v1",
      decoded_contract_version: "test-decoded-v1",
      materializer_version: "test-materializer-v1",
      segments_generated_at: seededAt,
      created_at: seededAt,
      updated_at: seededAt,
    });
    await tx.insert(activityArtifacts).values(artifact);
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: activityId,
      artifact_id: artifact.id,
      profile_id: profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: seededAt,
    });
    await tx.insert(activitySegments).values(source.segmentRows);
    await tx.insert(activityEfforts).values(source.effortRows);
  });
  return { activityId, artifact, source };
}

afterEach(async () => {
  for (const profileId of seededProfileIds.splice(0)) {
    await db.transaction(async (tx) => {
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

afterAll(async () => pool.end());

describe("canonical swimming CSS protocol persistence", () => {
  it("qualifies through generated activity-evidence reconciliation without rewriting source methods", async () => {
    const profileId = await seedProfile();
    const { activityId, source } = await seedActivity(profileId);

    await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId,
        profileId,
        efforts: source.effortRows,
        detectedLTHR: null,
        now: seededAt,
      }),
    );

    const persistedEfforts = await db
      .select({ method: activityEfforts.method })
      .from(activityEfforts)
      .where(eq(activityEfforts.activity_id, activityId));
    expect(persistedEfforts).toHaveLength(2);
    expect(
      persistedEfforts.every(({ method }) => method === "activity_file_swim_distance_effort"),
    ).toBe(true);
    await expect(
      db
        .select({ id: swimmingCssProtocolEvidence.id })
        .from(swimmingCssProtocolEvidence)
        .where(eq(swimmingCssProtocolEvidence.activity_id, activityId)),
    ).resolves.toHaveLength(1);
  });

  it("qualifies, reads as-of, self-excludes, invalidates, and replaces source evidence", async () => {
    const profileId = await seedProfile();
    const { activityId, artifact } = await seedActivity(profileId);
    const repository = createAthletePerformanceModelRepository(db);
    const asOf = new Date("2026-07-21T00:00:00.000Z");

    const beforeProtocol = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    expect(beforeProtocol.categories.swim.css).toMatchObject({ status: "unavailable" });
    await expect(
      db.execute(sql`insert into public.profile_metrics (
        id, profile_id, metric_type, recorded_at, unit, value, source, method,
        calculation_version, created_at, updated_at
      ) values (
        ${randomUUID()}::uuid, ${profileId}::uuid, 'css_seconds_per_100m', ${startedAt},
        'seconds_per_100m', 85, 'derived', 'css_400m_200m_test', 'legacy-css-v1', now(), now()
      )`),
    ).rejects.toMatchObject({ cause: { code: "22P02" } });
    const stillUnavailable = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    expect(stillUnavailable.categories.swim.css).toMatchObject({ status: "unavailable" });

    const qualified = await reconcileSwimmingCssProtocolEvidence(db, {
      activityId,
      profileId,
      now: seededAt,
    });
    expect(qualified).toMatchObject({ status: "qualified", reasons: [] });
    const [persisted] = await db
      .select()
      .from(swimmingCssProtocolEvidence)
      .where(eq(swimmingCssProtocolEvidence.activity_id, activityId));
    if (!persisted) throw new Error("Expected persisted CSS protocol evidence");
    expect(persisted).toMatchObject({
      status: "qualified",
      reasons: [],
      evidence_revision: 1,
      source_artifact_id: artifact.id,
      effort_400_duration_seconds: 320,
      effort_200_duration_seconds: 150,
    });
    expect(persisted).not.toHaveProperty("css_seconds_per_100m");

    const model = await getAthletePerformanceModelAsOf({ athleteId: profileId, asOf }, repository);
    expect(model.categories.swim.css).toMatchObject({
      status: "available",
      sourceEvidenceIds: [persisted.evidence_id],
      value: { cssSecondsPer100Meters: 85 },
    });
    const beforeObserved = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf: new Date("2026-07-20T00:08:29.999Z") },
      repository,
    );
    expect(beforeObserved.categories.swim.css).toMatchObject({ status: "unavailable" });
    const selfExcluded = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf, excludedActivityId: activityId },
      repository,
    );
    expect(selfExcluded.categories.swim.css).toMatchObject({ status: "unavailable" });

    const replacementArtifact = acceptedArtifact(profileId, "b");
    await db.transaction(async (tx) => {
      await tx.insert(activityArtifacts).values(replacementArtifact);
      await tx
        .update(activityArtifactLinks)
        .set({ is_current: false })
        .where(
          and(
            eq(activityArtifactLinks.activity_id, activityId),
            eq(activityArtifactLinks.artifact_id, artifact.id),
          ),
        );
      await tx.insert(activityArtifactLinks).values({
        id: randomUUID(),
        activity_id: activityId,
        artifact_id: replacementArtifact.id,
        profile_id: profileId,
        role: "source",
        ordinal: 1,
        is_current: true,
        linked_at: new Date(seededAt.getTime() + 1_000),
      });
    });
    const invalidated = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    expect(invalidated.categories.swim.css).toMatchObject({ status: "unavailable" });

    const replacement = cssSourceRows({
      activityId,
      artifactId: replacementArtifact.id,
      profileId,
      revision: 2,
    });
    await db.transaction(async (tx) => {
      await tx
        .update(activities)
        .set({
          segments_revision: 2,
          parser_version: "test-parser-v2",
          materializer_version: "test-materializer-v2",
          segments_generated_at: new Date(seededAt.getTime() + 2_000),
          updated_at: new Date(seededAt.getTime() + 2_000),
        })
        .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId)));
      await tx.delete(activitySegments).where(eq(activitySegments.activity_id, activityId));
      await tx.insert(activitySegments).values(replacement.segmentRows);
      await tx.insert(activityEfforts).values(replacement.effortRows);
      await reconcileSwimmingCssProtocolEvidenceWithProfileLockHeld(tx, {
        activityId,
        profileId,
        now: new Date(seededAt.getTime() + 2_000),
      });
    });

    const [replaced] = await db
      .select()
      .from(swimmingCssProtocolEvidence)
      .where(eq(swimmingCssProtocolEvidence.activity_id, activityId));
    if (!replaced) throw new Error("Expected replacement CSS protocol evidence");
    expect(replaced).toMatchObject({
      evidence_revision: 2,
      source_artifact_id: replacementArtifact.id,
    });
    expect(replaced.evidence_id).not.toBe(persisted.evidence_id);
    const replacedModel = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    expect(replacedModel.categories.swim.css).toMatchObject({
      status: "available",
      sourceEvidenceIds: [replaced.evidence_id],
      value: { cssSecondsPer100Meters: 85 },
    });
  });
});
