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

function segment(
  ordinal: number,
  category: "run" | "bike",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `99999999-9999-4999-8999-${ordinal.toString().padStart(12, "0")}`,
    activity_id: ACTIVITY_ID,
    ordinal,
    role: "activity" as const,
    category,
    start_offset_ms: ordinal * 1_000,
    end_offset_ms: (ordinal + 1) * 1_000,
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
  ])("builds category containment with $mode segment cardinality", ({ mode, comparison }) => {
    const condition = buildActivityCompositionCondition({
      activityId: activities.id,
      category: "run",
      mode,
    });
    const query = dialect.sqlToQuery(condition!).sql;

    expect(query).toMatch(/"activity_segments"\."category" = \$\d+/);
    expect(query).toContain('"activity_segments"."role" = \'activity\'');
    if (comparison) expect(query).toContain(comparison);
    else expect(query).not.toContain("select count(*)");
  });

  it("sums only matching-category evidence and nulls incomplete totals", () => {
    const summary = summarizeMatchedCategory({
      category: "run",
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
      distance_meters: 200,
      active_ms: 2_000,
      moving_ms: null,
      tss: null,
      tss_identity: null,
    });
  });

  it("combines matching multisport TSS only for one complete compatible load stream", () => {
    const segments = [segment(0, "run"), segment(1, "bike"), segment(2, "run")];
    const identity = {
      sport: "run",
      method: "run_pace_threshold",
      source: "activity_analysis",
      version: "1",
      calibration: { type: "threshold_speed_mps", value: 4.2 },
    } as const;
    const derived = [
      { segment: segments[0]!, tss: 30, stream: "run:pace" },
      { segment: segments[2]!, tss: 45, stream: "run:pace" },
    ].map(({ segment: item, tss, stream }) => ({
      activity_id: ACTIVITY_ID,
      segment_id: item.id,
      category: "run" as const,
      tss,
      tss_identity: identity,
      intensity_factor: 0.8,
      method: "run_pace_threshold" as const,
      unavailable_reason: null,
      calibration_quality: null,
      computed_as_of: "2026-01-01T00:00:00.000Z",
      dedupe_key: item.id,
      load_stream_key: stream,
    }));

    expect(
      summarizeMatchedCategory({
        segments,
        category: "run",
        derivedSegments: derived,
      }),
    ).toMatchObject({
      tss: 75,
      tss_identity: identity,
    });
    expect(
      summarizeMatchedCategory({
        segments,
        category: "run",
        derivedSegments: [{ ...derived[0]!, load_stream_key: "run:other" }, derived[1]!],
      }),
    ).toMatchObject({ tss: null, tss_identity: null });
  });
});
