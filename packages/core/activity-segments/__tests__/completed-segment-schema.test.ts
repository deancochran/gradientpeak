import { describe, expect, it } from "vitest";

import {
  completedActivitySegmentSetSchemaV1,
  SEGMENT_SUMMARY_V1_LIMITS,
  segmentSummarySchemaV1,
} from "../completed-segment-schema";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const completeSummary = (activeMs: number, movingMs = activeMs) => ({
  version: 1 as const,
  timing: { timingCoverage: "complete" as const, activeMs, movingMs },
});

describe("completed activity segment contract", () => {
  it("accepts ordered half-open ranges with uncovered pause gaps", () => {
    const result = completedActivitySegmentSetSchemaV1.parse({
      version: 1,
      elapsedMs: 10_000,
      segments: [
        {
          id: id(1),
          ordinal: 0,
          role: "activity",
          category: "run",
          startOffsetMs: 0,
          endOffsetMs: 4_000,
          summary: completeSummary(3_000, 2_500),
        },
        {
          id: id(2),
          ordinal: 1,
          role: "transition",
          startOffsetMs: 5_000,
          endOffsetMs: 6_000,
          summary: completeSummary(800, 500),
        },
        {
          id: id(3),
          ordinal: 2,
          role: "activity",
          category: "bike",
          startOffsetMs: 6_000,
          endOffsetMs: 10_000,
          summary: completeSummary(4_000),
        },
      ],
    });

    expect(result.segments).toHaveLength(3);
  });

  it("structurally forbids category and creation labels on non-activity roles", () => {
    const result = completedActivitySegmentSetSchemaV1.safeParse({
      version: 1,
      elapsedMs: 1_000,
      segments: [
        {
          id: id(1),
          ordinal: 0,
          role: "rest",
          category: "run",
          createdBy: "mobile",
          startOffsetMs: 0,
          endOffsetMs: 1_000,
          summary: completeSummary(1_000),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("requires raw source identity for unknown and raw-only references", () => {
    const base = {
      version: 1,
      elapsedMs: 1_000,
      segments: [
        {
          id: id(1),
          ordinal: 0,
          role: "unknown",
          startOffsetMs: 0,
          endOffsetMs: 1_000,
          summary: { version: 1, timing: { timingCoverage: "unavailable" } },
          source: { kind: "raw" },
        },
      ],
    };
    expect(completedActivitySegmentSetSchemaV1.safeParse(base).success).toBe(false);
    expect(
      completedActivitySegmentSetSchemaV1.safeParse({
        ...base,
        segments: [{ ...base.segments[0], source: { kind: "raw", rawSport: 254 } }],
      }).success,
    ).toBe(true);
  });

  it("validates artifact locator shape and forbids artifact indexes on raw references", () => {
    const segment = {
      id: id(1),
      ordinal: 0,
      role: "activity",
      category: "run",
      startOffsetMs: 0,
      endOffsetMs: 1_000,
      summary: completeSummary(1_000),
    };
    const set = (source: unknown) => ({
      version: 1,
      elapsedMs: 1_000,
      segments: [{ ...segment, source }],
    });

    expect(
      completedActivitySegmentSetSchemaV1.safeParse(
        set({
          kind: "artifact",
          artifactId: id(2),
          source: { standard: "fit", format: "fit" },
          sessionMessageIndex: 0,
        }),
      ).success,
    ).toBe(true);
    expect(
      completedActivitySegmentSetSchemaV1.safeParse(
        set({ kind: "artifact", artifactId: id(2), source: { standard: "fit", format: "tcx" } }),
      ).success,
    ).toBe(false);
    expect(
      completedActivitySegmentSetSchemaV1.safeParse(
        set({ kind: "raw", rawType: "workout", sessionMessageIndex: 0 }),
      ).success,
    ).toBe(false);
  });

  it("enforces ranges, ordering, adjacency, and moving-active-range timing", () => {
    const result = completedActivitySegmentSetSchemaV1.safeParse({
      version: 1,
      elapsedMs: 2_000,
      segments: [
        {
          id: id(1),
          ordinal: 1,
          role: "rest",
          startOffsetMs: 0,
          endOffsetMs: 1_500,
          summary: completeSummary(1_600, 1_700),
        },
        {
          id: id(2),
          ordinal: 1,
          role: "rest",
          startOffsetMs: 1_000,
          endOffsetMs: 2_500,
          summary: completeSummary(1_000),
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(" ");
      expect(messages).toContain("Moving time cannot exceed active time");
      expect(messages).toContain("Active time cannot exceed");
      expect(messages).toContain("ordinals");
      expect(messages).toContain("overlap");
      expect(messages).toContain("Rest segments cannot be consecutive");
    }
  });

  it("requires partial timing evidence", () => {
    expect(
      segmentSummarySchemaV1.safeParse({
        version: 1,
        timing: { timingCoverage: "partial" },
      }).success,
    ).toBe(false);
    expect(
      segmentSummarySchemaV1.safeParse({
        version: 1,
        timing: { timingCoverage: "partial", movingMs: 10 },
      }).success,
    ).toBe(true);
  });

  it("accepts canonical cadence, speed, and bounded swim metrics", () => {
    expect(
      segmentSummarySchemaV1.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        averageCadenceRpm: 90,
        averageSpeedMetersPerSecond: 5.2,
        normalizedPowerWatts: 250,
        normalizedSpeedMetersPerSecond: 5.4,
        normalizedGradedSpeedMetersPerSecond: 5.5,
        swim: {
          poolLengthMeters: 25,
          lengthCount: 40,
          strokeCount: 800,
          averageStrokeRatePerMinute: 32,
          averageSwolf: 42,
        },
      }).success,
    ).toBe(true);
    expect(
      segmentSummarySchemaV1.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        averageCadenceRpm: SEGMENT_SUMMARY_V1_LIMITS.maxCadenceRpm + 1,
        averageSpeedMetersPerSecond: SEGMENT_SUMMARY_V1_LIMITS.maxSpeedMetersPerSecond + 1,
        normalizedSpeedMetersPerSecond: SEGMENT_SUMMARY_V1_LIMITS.maxSpeedMetersPerSecond + 1,
        swim: { poolLengthMeters: SEGMENT_SUMMARY_V1_LIMITS.maxPoolLengthMeters + 1 },
      }).success,
    ).toBe(false);
    expect(
      segmentSummarySchemaV1.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        swim: {},
      }).success,
    ).toBe(false);
  });
});
