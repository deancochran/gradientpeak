import { describe, expect, it } from "vitest";
import { AEROBIC_NUMERICAL_TRUST_FIXTURES_V1 } from "../../calculations/__tests__/fixtures/aerobic-numerical-trust-v1";
import { RUNNING_NUMERICAL_TRUST_FIXTURES_V1 } from "../../calculations/__tests__/fixtures/running-numerical-trust-v1";
import { extractBestEfforts } from "../../calculations/best-efforts";
import {
  calculateAerobicDecoupling,
  calculateEfficiencyFactor,
  selectAerobicDecouplingValue,
  selectEfficiencyFactorValue,
} from "../../calculations/efficiency";
import {
  calculateRunningNormalizedGradedPace,
  selectRunningNormalizedGradedSpeedMetersPerSecond,
} from "../../calculations/normalized-graded-pace";
import { calculateCyclingNormalizedPower } from "../../calculations/normalized-power";
import {
  activitySegmentAnalysisSchema,
  completedActivitySegmentSetSchema,
  completedSegmentSummarySchema,
  createAnalyzedActivitySegmentAnalysis,
  createFailedActivitySegmentAnalysis,
  createProcessingActivitySegmentAnalysis,
  rawOnlySegmentSourceReferenceSchema,
  SEGMENT_SUMMARY_LIMITS,
} from "../completed-segment-schema";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });
const completeSummary = (activeMs: number, movingMs = activeMs) => ({
  version: 1 as const,
  timing: { timingCoverage: "complete" as const, activeMs, movingMs },
  normalizedPowerResult: unavailableNormalizedPowerResult,
});

describe("completed activity segment contract", () => {
  it("accepts ordered half-open ranges with uncovered pause gaps", () => {
    const result = completedActivitySegmentSetSchema.parse({
      version: 1,
      elapsedMs: 10_000,
      segments: [
        {
          id: id(1),
          ordinal: 0,
          role: "activity",
          activity_category: "run",
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
          activity_category: "bike",
          startOffsetMs: 6_000,
          endOffsetMs: 10_000,
          summary: completeSummary(4_000),
        },
      ],
    });

    expect(result.segments).toHaveLength(3);
  });

  it("structurally forbids activity_category and creation labels on non-activity roles", () => {
    const result = completedActivitySegmentSetSchema.safeParse({
      version: 1,
      elapsedMs: 1_000,
      segments: [
        {
          id: id(1),
          ordinal: 0,
          role: "rest",
          activity_category: "run",
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
          summary: {
            version: 1,
            timing: { timingCoverage: "unavailable" },
            normalizedPowerResult: unavailableNormalizedPowerResult,
          },
          source: { kind: "raw" },
        },
      ],
    };
    expect(completedActivitySegmentSetSchema.safeParse(base).success).toBe(false);
    expect(
      completedActivitySegmentSetSchema.safeParse({
        ...base,
        segments: [{ ...base.segments[0], source: { kind: "raw", rawSport: 254 } }],
      }).success,
    ).toBe(true);
  });

  it("bounds raw source strings by Unicode code point and integers by PostgreSQL range", () => {
    const parse = (rawSubSport: string | number) =>
      rawOnlySegmentSourceReferenceSchema.safeParse({ kind: "raw", rawSubSport }).success;

    expect(parse("😀".repeat(128))).toBe(true);
    expect(parse("")).toBe(false);
    expect(parse("😀".repeat(129))).toBe(false);
    expect(parse(-2_147_483_648)).toBe(true);
    expect(parse(2_147_483_647)).toBe(true);
    expect(parse(-2_147_483_649)).toBe(false);
    expect(parse(2_147_483_648)).toBe(false);
  });

  it("validates artifact locator shape and forbids artifact indexes on raw references", () => {
    const segment = {
      id: id(1),
      ordinal: 0,
      role: "activity",
      activity_category: "run",
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
      completedActivitySegmentSetSchema.safeParse(
        set({
          kind: "artifact",
          artifactId: id(2),
          source: { standard: "fit", format: "fit" },
          sessionMessageIndex: 0,
        }),
      ).success,
    ).toBe(true);
    expect(
      completedActivitySegmentSetSchema.safeParse(
        set({ kind: "artifact", artifactId: id(2), source: { standard: "fit", format: "tcx" } }),
      ).success,
    ).toBe(false);
    expect(
      completedActivitySegmentSetSchema.safeParse(
        set({ kind: "raw", rawType: "activity", sessionMessageIndex: 0 }),
      ).success,
    ).toBe(false);
  });

  it("enforces ranges, ordering, adjacency, and moving-active-range timing", () => {
    const result = completedActivitySegmentSetSchema.safeParse({
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
      completedSegmentSummarySchema.safeParse({
        version: 1,
        timing: { timingCoverage: "partial" },
        normalizedPowerResult: unavailableNormalizedPowerResult,
      }).success,
    ).toBe(false);
    expect(
      completedSegmentSummarySchema.safeParse({
        version: 1,
        timing: { timingCoverage: "partial", movingMs: 10 },
        normalizedPowerResult: unavailableNormalizedPowerResult,
      }).success,
    ).toBe(true);
  });

  it("preserves bounded recording completion and skip evidence without overstating coverage", () => {
    const parsed = completedSegmentSummarySchema.parse({
      version: 1,
      timing: { timingCoverage: "partial", activeMs: 30_000 },
      normalizedPowerResult: unavailableNormalizedPowerResult,
      recordingExecution: {
        version: 1,
        source: "recording_execution_manifest",
        coverage: "complete",
        occurrenceCount: 2,
        occurrences: [
          {
            occurrenceId: "step-1:1",
            globalOrdinal: 0,
            completion: { status: "completed", method: "automatic" },
          },
          {
            occurrenceId: "step-2:1",
            globalOrdinal: 1,
            completion: { status: "skipped", method: "manual" },
          },
        ],
      },
    });

    expect(parsed.recordingExecution?.occurrences).toEqual([
      expect.objectContaining({ completion: { status: "completed", method: "automatic" } }),
      expect.objectContaining({ completion: { status: "skipped", method: "manual" } }),
    ]);
    expect(
      completedSegmentSummarySchema.safeParse({
        ...parsed,
        recordingExecution: {
          ...parsed.recordingExecution,
          coverage: "complete",
          occurrenceCount: 3,
        },
      }).success,
    ).toBe(false);
  });

  it("accepts canonical cadence, speed, and bounded swim metrics", () => {
    const normalizedPowerResult = calculateCyclingNormalizedPower({
      samples: Array.from({ length: 61 }, (_, timestampSeconds) => ({
        timestampSeconds,
        powerWatts: 250,
      })),
    });
    if (normalizedPowerResult.status === "unavailable") {
      throw new Error("Expected a numeric Normalized Power fixture");
    }
    expect(
      completedSegmentSummarySchema.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        averageCadenceRpm: 90,
        averageSpeedMetersPerSecond: 5.2,
        normalizedPowerResult,
        normalizedSpeedMetersPerSecond: 5.4,
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
      completedSegmentSummarySchema.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        normalizedPowerResult: unavailableNormalizedPowerResult,
        averageCadenceRpm: SEGMENT_SUMMARY_LIMITS.maxCadenceRpm + 1,
        averageSpeedMetersPerSecond: SEGMENT_SUMMARY_LIMITS.maxSpeedMetersPerSecond + 1,
        normalizedSpeedMetersPerSecond: SEGMENT_SUMMARY_LIMITS.maxSpeedMetersPerSecond + 1,
        swim: { poolLengthMeters: SEGMENT_SUMMARY_LIMITS.maxPoolLengthMeters + 1 },
      }).success,
    ).toBe(false);
    expect(
      completedSegmentSummarySchema.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        normalizedPowerResult: unavailableNormalizedPowerResult,
        swim: {},
      }).success,
    ).toBe(false);
  });

  it("requires and preserves structured Normalized Power evidence independently of watts", () => {
    const unavailable = calculateCyclingNormalizedPower({ samples: [] });
    expect(
      completedSegmentSummarySchema.parse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        normalizedPowerResult: unavailable,
      }),
    ).toMatchObject({
      normalizedPowerResult: {
        status: "unavailable",
        reason: "no_samples",
        calculationVersion: "cycling-normalized-power-v1",
        diagnostics: { sourceTimeCoverage: 0, excludedGapDurationSeconds: 0 },
      },
    });
    expect(
      completedSegmentSummarySchema.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        normalizedPowerWatts: 250,
        normalizedPowerResult: unavailable,
      }).success,
    ).toBe(false);
  });

  it("keeps running NGP only in its versioned evidence result", () => {
    const ngp = calculateRunningNormalizedGradedPace({
      samples: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.flat.samples,
    });
    if (ngp.status === "unavailable") throw new Error("Expected fixture NGP");
    const summary = {
      version: 1 as const,
      timing: { timingCoverage: "complete" as const, activeMs: 60_000, movingMs: 60_000 },
      normalizedPowerResult: unavailableNormalizedPowerResult,
      normalizedGradedPaceResult: ngp,
    };

    expect(completedSegmentSummarySchema.safeParse(summary).success).toBe(true);
    expect(selectRunningNormalizedGradedSpeedMetersPerSecond(ngp)).toBe(ngp.valueMetersPerSecond);
    expect(
      completedSegmentSummarySchema.safeParse({
        ...summary,
        normalizedGradedSpeedMetersPerSecond: ngp.valueMetersPerSecond + 0.1,
      }).success,
    ).toBe(false);
    expect(
      completedSegmentSummarySchema.safeParse({
        ...summary,
        normalizedGradedPaceResult: calculateRunningNormalizedGradedPace({ samples: [] }),
      }).success,
    ).toBe(true);
  });

  it("couples aerobic scalars to structured results and preserves valid zero drift", () => {
    const availableInput = AEROBIC_NUMERICAL_TRUST_FIXTURES_V1.validZeroDrift.input;
    const efficiencyFactorResult = calculateEfficiencyFactor(availableInput);
    const aerobicDecouplingResult = calculateAerobicDecoupling(availableInput);
    if (
      efficiencyFactorResult.status === "unavailable" ||
      aerobicDecouplingResult.status === "unavailable"
    ) {
      throw new Error("Expected qualified aerobic fixture results");
    }
    const summary = {
      version: 1 as const,
      timing: {
        timingCoverage: "complete" as const,
        activeMs: 1_200_000,
        movingMs: 1_200_000,
      },
      normalizedPowerResult: unavailableNormalizedPowerResult,
      efficiencyFactorResult,
      aerobicDecouplingResult,
    };

    expect(aerobicDecouplingResult.value).toBe(0);
    expect(completedSegmentSummarySchema.safeParse(summary).success).toBe(true);
    expect(selectEfficiencyFactorValue(efficiencyFactorResult)).toBe(efficiencyFactorResult.value);
    expect(selectAerobicDecouplingValue(aerobicDecouplingResult)).toBe(0);

    const unavailableDecoupling = calculateAerobicDecoupling(
      AEROBIC_NUMERICAL_TRUST_FIXTURES_V1.missingHeartRate.input,
    );
    expect(
      completedSegmentSummarySchema.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        normalizedPowerResult: unavailableNormalizedPowerResult,
        aerobicDecouplingResult: unavailableDecoupling,
      }).success,
    ).toBe(true);
    expect(
      completedSegmentSummarySchema.safeParse({
        version: 1,
        timing: { timingCoverage: "unavailable" },
        normalizedPowerResult: unavailableNormalizedPowerResult,
        aerobicDecoupling: 0,
        aerobicDecouplingResult: unavailableDecoupling,
      }).success,
    ).toBe(false);
  });

  it("retains versioned partial and unavailable best-effort evidence by metric", () => {
    const power = extractBestEfforts({
      metric: "power",
      samples: [
        { timestampSeconds: 0, value: 100 },
        { timestampSeconds: 1, value: 100 },
        { timestampSeconds: 2, value: null },
        { timestampSeconds: 3, value: 200 },
        { timestampSeconds: 4, value: 200 },
      ],
      config: { durationsSeconds: [2, 3] },
    });
    const parsed = completedSegmentSummarySchema.parse({
      ...completeSummary(4_000),
      bestEffortExtractions: [power],
    });

    expect(parsed.bestEffortExtractions?.[0]?.results).toEqual([
      expect.objectContaining({ status: "partial", durationSeconds: 2, windowCoverage: 1 }),
      {
        status: "unavailable",
        reason: "insufficient_contiguous_coverage",
        durationSeconds: 3,
        value: null,
      },
    ]);
    expect(
      completedSegmentSummarySchema.safeParse({
        ...completeSummary(4_000),
        bestEffortExtractions: [power, power],
      }).success,
    ).toBe(false);
  });

  it("models processing, analyzed, and failed segment analysis without optional summaries", () => {
    const summary = completedSegmentSummarySchema.parse(completeSummary(1_000));
    const processing = createProcessingActivitySegmentAnalysis();
    const analyzed = createAnalyzedActivitySegmentAnalysis(summary);
    const failed = createFailedActivitySegmentAnalysis("analysis_failed");

    expect(processing).toEqual({ status: "processing", summary: null });
    expect(analyzed).toEqual({ status: "available", summary });
    expect(failed).toEqual({ status: "failed", summary: null, reason: "analysis_failed" });
    expect(
      activitySegmentAnalysisSchema.safeParse({ status: "available", summary: null }).success,
    ).toBe(false);
    expect(
      activitySegmentAnalysisSchema.safeParse({
        status: "available",
        summary: { version: 1, timing: { timingCoverage: "unavailable" } },
      }).success,
    ).toBe(false);
  });
});
