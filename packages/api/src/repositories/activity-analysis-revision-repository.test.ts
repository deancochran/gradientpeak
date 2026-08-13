import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { isSQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import {
  activityAnalysisFingerprint,
  appendActivityAnalysisRevision,
  MANUAL_ACTIVITY_ANALYSIS_VERSION,
  selectActivityAnalysisPerformanceTargets,
} from "./activity-analysis-revision-repository";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_WITH_REVISION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEGACY_ACTIVITY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SEGMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function projection() {
  return {
    version: 1 as const,
    segments: [
      {
        segmentId: SEGMENT_ID,
        activityCategory: "run" as const,
        commonLoad: {
          status: "unavailable" as const,
          model: "gradientpeak_relative_load" as const,
          version: "1" as const,
          activity_category: "run" as const,
          method: null,
          quality: null,
          thresholdEvidence: null,
          evidenceFingerprint: null,
          computedAsOf: "2026-01-01T00:00:00.000Z",
          contributingDurationSeconds: null,
          reason: "threshold_missing" as const,
        },
      },
    ],
  };
}

function target(power: number) {
  return buildPerformanceTargetFactsFixture({
    athleteId: PROFILE_ID,
    asOf: "2026-01-01T00:00:00.000Z",
    planningThresholdPowerWatts: power,
  });
}

function originalSnapshot(targets: ReturnType<typeof target>) {
  return {
    contractVersion: "completed-activity-performance-target-snapshot-v1" as const,
    capturedAt: "2026-01-01T00:00:00.000Z",
    publishedRevision: null,
    publicationStatus: "unavailable" as const,
    targets,
  };
}

describe("activity analysis revision repository", () => {
  it("appends only against the owned current activity segments", async () => {
    const performanceTargets = target(250);
    const loadProjection = projection();
    const whereConditions: unknown[] = [];
    const activityBuilder: Record<string, unknown> = {
      from: vi.fn(() => activityBuilder),
      where: vi.fn((condition: unknown) => {
        whereConditions.push(condition);
        return activityBuilder;
      }),
      limit: vi.fn(() => activityBuilder),
      for: vi.fn(async () => [{ segmentsRevision: 3 }]),
    };
    const segmentBuilder: Record<string, unknown> = {
      from: vi.fn(() => segmentBuilder),
      where: vi.fn((condition: unknown) => {
        whereConditions.push(condition);
        return segmentBuilder;
      }),
      orderBy: vi.fn(async () => [{ id: SEGMENT_ID }]),
    };
    const latestBuilder: Record<string, unknown> = {
      from: vi.fn(() => latestBuilder),
      where: vi.fn((condition: unknown) => {
        whereConditions.push(condition);
        return latestBuilder;
      }),
      orderBy: vi.fn(() => latestBuilder),
      limit: vi.fn(async () => [{ revision: 4 }]),
    };
    let insertedValues: Record<string, unknown> | undefined;
    const insertBuilder: Record<string, unknown> = {
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues = values;
        return insertBuilder;
      }),
      returning: vi.fn(async () => [{ revision: 5 }]),
    };
    const builders = [activityBuilder, segmentBuilder, latestBuilder];
    const tx = {
      select: vi.fn(() => builders.shift()),
      insert: vi.fn(() => insertBuilder),
    } as never;

    const result = await appendActivityAnalysisRevision(tx, {
      activityId: ACTIVITY_WITH_REVISION,
      profileId: PROFILE_ID,
      sourceSegmentsRevision: 3,
      performanceTargets,
      targetFingerprint: activityAnalysisFingerprint(performanceTargets),
      segmentLoadProjection: loadProjection,
      outputFingerprint: activityAnalysisFingerprint(loadProjection),
      computedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ profileId: PROFILE_ID, revision: 5 });
    expect(activityBuilder.for).toHaveBeenCalledWith("update");
    expect(insertedValues).toMatchObject({
      activity_id: ACTIVITY_WITH_REVISION,
      profile_id: PROFILE_ID,
      source_segments_revision: 3,
    });
    expect(whereConditions).toHaveLength(3);
    for (const condition of whereConditions) {
      if (!isSQLWrapper(condition)) throw new Error("Expected an owner-scoped append predicate");
      const query = new PgDialect().sqlToQuery(condition.getSQL());
      expect(query.params).toEqual(expect.arrayContaining([ACTIVITY_WITH_REVISION, PROFILE_ID]));
    }
  });

  it("aborts before insert when the activity segment revision changed", async () => {
    const performanceTargets = target(250);
    const loadProjection = projection();
    const activityBuilder: Record<string, unknown> = {
      from: vi.fn(() => activityBuilder),
      where: vi.fn(() => activityBuilder),
      limit: vi.fn(() => activityBuilder),
      for: vi.fn(async () => [{ segmentsRevision: 4 }]),
    };
    const insert = vi.fn();
    const tx = { select: vi.fn(() => activityBuilder), insert } as never;

    await expect(
      appendActivityAnalysisRevision(tx, {
        activityId: ACTIVITY_WITH_REVISION,
        profileId: PROFILE_ID,
        sourceSegmentsRevision: 3,
        performanceTargets,
        targetFingerprint: activityAnalysisFingerprint(performanceTargets),
        segmentLoadProjection: loadProjection,
        outputFingerprint: activityAnalysisFingerprint(loadProjection),
        computedAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("segment revision changed");

    expect(insert).not.toHaveBeenCalled();
  });

  it("selects the newest valid current revision before the immutable original snapshot", async () => {
    const original = target(200);
    const selected = target(250);
    const legacy = target(225);
    const loadProjection = projection();
    let whereCondition: unknown;
    const rows = [
      {
        activityId: ACTIVITY_WITH_REVISION,
        activitySegmentsRevision: 3,
        originalSnapshot: originalSnapshot(original),
        revision: 3,
        revisionSegmentsRevision: 3,
        revisionAnalysisVersion: MANUAL_ACTIVITY_ANALYSIS_VERSION,
        revisionSnapshot: selected,
        revisionTargetFingerprint: "sha256:invalid",
        revisionProjection: loadProjection,
        revisionOutputFingerprint: activityAnalysisFingerprint(loadProjection),
        revisionProfileId: PROFILE_ID,
      },
      {
        activityId: ACTIVITY_WITH_REVISION,
        activitySegmentsRevision: 3,
        originalSnapshot: originalSnapshot(original),
        revision: 2,
        revisionSegmentsRevision: 3,
        revisionAnalysisVersion: MANUAL_ACTIVITY_ANALYSIS_VERSION,
        revisionSnapshot: selected,
        revisionTargetFingerprint: activityAnalysisFingerprint(selected),
        revisionProjection: loadProjection,
        revisionOutputFingerprint: activityAnalysisFingerprint(loadProjection),
        revisionProfileId: PROFILE_ID,
      },
      {
        activityId: LEGACY_ACTIVITY,
        activitySegmentsRevision: 1,
        originalSnapshot: originalSnapshot(legacy),
        revision: null,
        revisionSegmentsRevision: null,
        revisionAnalysisVersion: null,
        revisionSnapshot: null,
        revisionTargetFingerprint: null,
        revisionProjection: null,
        revisionOutputFingerprint: null,
        revisionProfileId: null,
      },
    ];
    const builder: Record<string, unknown> = {
      from: vi.fn(() => builder),
      leftJoin: vi.fn(() => builder),
      where: vi.fn((condition: unknown) => {
        whereCondition = condition;
        return builder;
      }),
      orderBy: vi.fn(async () => rows),
    };

    const result = await selectActivityAnalysisPerformanceTargets(
      { select: vi.fn(() => builder) } as never,
      {
        profileId: PROFILE_ID,
        activities: [
          { activityId: ACTIVITY_WITH_REVISION, segmentsRevision: 3 },
          { activityId: LEGACY_ACTIVITY, segmentsRevision: 1 },
        ],
      },
    );

    expect(result.get(ACTIVITY_WITH_REVISION)).toMatchObject({
      source: "analysis_revision",
      revision: 2,
      performanceTargets: selected,
    });
    expect(result.get(LEGACY_ACTIVITY)).toMatchObject({
      source: "original_snapshot",
      revision: null,
      performanceTargets: legacy,
    });
    if (!isSQLWrapper(whereCondition)) throw new Error("Expected owner-scoped selection SQL");
    const query = new PgDialect().sqlToQuery(whereCondition.getSQL());
    expect(query.sql).toContain('"activities"."profile_id"');
    expect(query.params).toEqual(
      expect.arrayContaining([PROFILE_ID, ACTIVITY_WITH_REVISION, LEGACY_ACTIVITY]),
    );
  });

  it("ignores a revision target owned by another profile", async () => {
    const foreign = buildPerformanceTargetFactsFixture({
      athleteId: "22222222-2222-4222-8222-222222222222",
      asOf: "2026-01-01T00:00:00.000Z",
      planningThresholdPowerWatts: 250,
    });
    const builder: Record<string, unknown> = {
      from: vi.fn(() => builder),
      leftJoin: vi.fn(() => builder),
      where: vi.fn(() => builder),
      orderBy: vi.fn(async () => [
        {
          activityId: ACTIVITY_WITH_REVISION,
          activitySegmentsRevision: 3,
          originalSnapshot: null,
          revision: 1,
          revisionSegmentsRevision: 3,
          revisionAnalysisVersion: MANUAL_ACTIVITY_ANALYSIS_VERSION,
          revisionSnapshot: foreign,
          revisionTargetFingerprint: activityAnalysisFingerprint(foreign),
          revisionProjection: projection(),
          revisionOutputFingerprint: activityAnalysisFingerprint(projection()),
          revisionProfileId: PROFILE_ID,
        },
      ]),
    };

    const result = await selectActivityAnalysisPerformanceTargets(
      { select: vi.fn(() => builder) } as never,
      {
        profileId: PROFILE_ID,
        activities: [{ activityId: ACTIVITY_WITH_REVISION, segmentsRevision: 3 }],
      },
    );
    expect(result.has(ACTIVITY_WITH_REVISION)).toBe(false);
  });
});
