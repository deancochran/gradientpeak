import {
  type CommonLoadResult,
  createObservationQuantificationBundle,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { activities } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  buildActivityCompositionCondition,
  describeActivityComposition,
  summarizeMatchedCategory,
} from "./activity-discovery";

const dialect = new PgDialect();
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const quality = {
  source: "manual" as const,
  observed_at: "2026-01-01T00:00:00.000Z",
  valid_at: "2026-01-01T00:00:00.000Z",
  confidence: "high" as const,
  stale: false,
  estimate: false,
  calculation_version: "1",
  evidence_fingerprint: "threshold-evidence",
};

function segment(
  ordinal: number,
  activity_category: "run" | "bike",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `99999999-9999-4999-8999-${ordinal.toString().padStart(12, "0")}`,
    activity_id: ACTIVITY_ID,
    ordinal,
    role: "activity" as const,
    activity_category,
    start_offset_ms: ordinal * 1_000,
    end_offset_ms: (ordinal + 1) * 1_000,
    source_artifact_id: null,
    source_session_index: null,
    source_message_index: null,
    raw_type_string: null,
    raw_type_integer: null,
    raw_sport_string: null,
    raw_sport_integer: null,
    raw_sub_sport_string: null,
    raw_sub_sport_integer: null,
    timing_coverage: "complete" as const,
    active_ms: 1_000,
    moving_ms: 900,
    summary: {
      version: 1 as const,
      timing: {
        timingCoverage: "complete" as const,
        activeMs: 1_000,
        movingMs: 900,
      },
      distanceMeters: 100,
    },
    ...overrides,
  };
}

function observation(item: ReturnType<typeof segment>, commonLoad: CommonLoadResult) {
  return quantifyCompletedActivityObservation({
    activityCategory: item.activity_category,
    source: {
      activityId: item.activity_id,
      segmentId: item.id,
      provider: null,
      externalId: null,
      artifactId: null,
      capability: "unknown",
      parserVersion: null,
      decodedContractVersion: null,
      materializerVersion: null,
      segmentsRevision: null,
      segmentRevision: null,
      summaryVersion: 1,
      sourceSessionIndex: null,
      sourceMessageIndex: null,
      rawType: null,
      rawSport: null,
      rawSubSport: null,
    },
    timing: {
      coverage: "complete",
      source: "unknown",
      basis: "unknown",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      elapsedSeconds: 1,
      activeSeconds: 1,
      movingSeconds: 0.9,
    },
    distance: { meters: 100, source: "unknown", basis: "unknown" },
    intensity: {
      averageHeartRateBpm: null,
      averagePowerWatts: null,
      averageSpeedMetersPerSecond: null,
      normalizedSpeedMetersPerSecond: null,
    },
    commonLoad,
  });
}

describe("activity discovery", () => {
  it("classifies repeated same-category activity segments as multisport in ordinal order", () => {
    expect(describeActivityComposition([segment(1, "run"), segment(0, "run")])).toEqual({
      activity_categories: ["run", "run"],
      activity_segment_count: 2,
      activity_kind: "multisport",
    });
  });

  it.each([
    { mode: "single_only" as const, comparison: "= $2" },
    { mode: "include_multisport" as const, comparison: undefined },
    { mode: "multisport_only" as const, comparison: "> 1" },
  ])("builds activity_category containment with $mode segment cardinality", ({
    mode,
    comparison,
  }) => {
    const condition = buildActivityCompositionCondition({
      activityId: activities.id,
      activity_category: "run",
      mode,
    });
    if (!condition) throw new Error("Expected an activity composition condition");
    const query = dialect.sqlToQuery(condition).sql;

    expect(query).toMatch(/"activity_segments"\."activity_category" = \$\d+/);
    expect(query).toContain('"activity_segments"."role" = \'activity\'');
    if (comparison) expect(query).toContain(comparison);
    else expect(query).not.toContain("select count(*)");
  });

  it("does not project raw category quantities without complete canonical quantification", () => {
    const summary = summarizeMatchedCategory({
      activity_category: "run",
      segments: [
        segment(0, "run"),
        segment(1, "bike", {
          summary: { version: 1, timing: { timingCoverage: "unavailable" } },
        }),
        segment(2, "run", { moving_ms: null }),
      ],
    });

    expect(summary).toMatchObject({
      segment_count: 2,
      distance_meters: null,
      active_ms: null,
      moving_ms: null,
      common_load: null,
    });
  });

  it("combines matching multisport common Load while retaining aggregate coverage", () => {
    const firstSegment = segment(0, "run");
    const secondSegment = segment(1, "bike");
    const thirdSegment = segment(2, "run");
    const segments = [firstSegment, secondSegment, thirdSegment];
    const derived = [
      { segment: firstSegment, load: 64 },
      { segment: thirdSegment, load: 64 },
    ].map(({ segment: item, load }) => {
      const commonLoad = {
        status: "available" as const,
        model: "gradientpeak_relative_load" as const,
        version: "1" as const,
        activity_category: "run" as const,
        method: "run_pace_threshold" as const,
        load,
        intensity: 0.8,
        contributingDurationSeconds: 3600,
        quality,
        thresholdEvidence: {
          type: "threshold_speed_mps" as const,
          value: 4.2,
          unit: "meters_per_second" as const,
          source: "manual" as const,
          observedAt: "2026-01-01T00:00:00.000Z",
          validAt: "2026-01-01T00:00:00.000Z",
          freshness: "current" as const,
          calculationVersion: "1",
          sourceFingerprint: "threshold-evidence",
        },
        evidenceFingerprint: "activity-evidence",
        computedAsOf: "2026-01-01T00:00:00.000Z",
        estimated: false,
      } satisfies CommonLoadResult;
      return {
        activity_id: ACTIVITY_ID,
        segment_id: item.id,
        activity_category: "run" as const,
        common_load: commonLoad,
        observationQuantification: createObservationQuantificationBundle({
          members: [observation(item, commonLoad)],
        }),
        computed_as_of: "2026-01-01T00:00:00.000Z",
        dedupe_key: item.id,
        load_stream_key: null,
      };
    });

    expect(
      summarizeMatchedCategory({
        segments,
        activity_category: "run",
        derivedSegments: derived,
      }),
    ).toMatchObject({
      common_load: {
        status: "complete",
        load: 128,
        totalActivityCount: 2,
      },
    });
    expect(
      summarizeMatchedCategory({
        segments,
        activity_category: "run",
        derivedSegments: [
          (() => {
            const commonLoad = {
              status: "unavailable",
              model: "gradientpeak_relative_load",
              version: "1",
              activity_category: "run",
              method: null,
              quality: null,
              thresholdEvidence: null,
              evidenceFingerprint: null,
              computedAsOf: "2026-01-01T00:00:00.000Z",
              contributingDurationSeconds: null,
              reason: "threshold_missing",
            } satisfies CommonLoadResult;
            const firstDerived = derived[0];
            const firstSegment = segments[0];
            const secondDerived = derived[1];
            if (!firstDerived || !firstSegment || !secondDerived) {
              throw new Error("Activity discovery fixture requires two derived segments");
            }
            return {
              ...firstDerived,
              common_load: commonLoad,
              observationQuantification: createObservationQuantificationBundle({
                members: [observation(firstSegment, commonLoad)],
              }),
            };
          })(),
          (() => {
            const secondDerived = derived[1];
            if (!secondDerived)
              throw new Error("Activity discovery fixture requires two derived segments");
            return secondDerived;
          })(),
        ],
      }),
    ).toMatchObject({ common_load: { status: "partial", load: 64, unavailableActivityCount: 1 } });
  });
});
