import { describe, expect, it } from "vitest";
import { calculateActivityFileStreamDerivedCalculations } from "./stream-derived-calculations";
import { collectActivityFileStreamMetadata } from "./stream-metadata";

const activityId = "11111111-1111-4111-8111-111111111111";
const profileId = "22222222-2222-4222-8222-222222222222";
const segmentId = "33333333-3333-4333-8333-333333333333";
const sourceArtifactId = "44444444-4444-4444-8444-444444444444";

function records(durationSeconds: number, values: { power?: number; speed?: number }) {
  return Array.from({ length: durationSeconds + 1 }, (_, second) => ({
    timestamp: new Date(second * 1_000),
    ...values,
  }));
}

describe("threshold-window effort persistence", () => {
  it("persists an exact bike window with immutable source identity and millisecond offsets", () => {
    const calculation = calculateActivityFileStreamDerivedCalculations({
      activityId,
      profileId,
      segmentId,
      sourceArtifactId,
      sourceRevision: 7,
      activityStartedAt: new Date(0),
      segmentStartOffsetSeconds: 0,
      segmentEndOffsetSeconds: 1_900,
      activityCategory: "bike",
      distance: 0,
      duration: 1_900,
      streamMetadata: collectActivityFileStreamMetadata(records(1_900, { power: 300 })),
    });
    expect(
      calculation.effortsToInsert.find((effort) => effort.duration_seconds === 1_800),
    ).toMatchObject({
      source_artifact_id: sourceArtifactId,
      source_revision: 7,
      start_offset_ms: 0,
      end_offset_ms: 1_800_000,
      duration_seconds: 1_800,
      window_coverage: 1,
      max_gap_seconds: 2,
      effort_type: "power",
      source_series: "power",
      unit: "watts",
    });
  });

  it("persists both exact run source series when both are available", () => {
    const calculation = calculateActivityFileStreamDerivedCalculations({
      activityId,
      profileId,
      segmentId,
      sourceArtifactId,
      sourceRevision: 2,
      activityStartedAt: new Date(0),
      segmentStartOffsetSeconds: 0,
      segmentEndOffsetSeconds: 1_900,
      activityCategory: "run",
      distance: 7_600,
      duration: 1_900,
      streamMetadata: collectActivityFileStreamMetadata(
        Array.from({ length: 1_901 }, (_, second) => ({
          timestamp: new Date(second * 1_000),
          speed: 4,
          altitude: second * 0.01,
        })),
      ),
    });
    const exact = calculation.effortsToInsert.filter(
      (effort) => effort.duration_seconds === 1_800 && effort.effort_type === "speed",
    );
    expect(exact).toHaveLength(2);
    expect(exact.map((effort) => effort.source_series)).toEqual([
      "grade_adjusted_speed",
      "raw_speed",
    ]);
    expect(exact).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_revision: 2,
          start_offset_ms: 0,
          end_offset_ms: 1_800_000,
          window_coverage: 1,
          max_gap_seconds: 2,
          source_series: "raw_speed",
          provenance: expect.objectContaining({ source_series: "raw_speed" }),
        }),
      ]),
    );
  });

  it("persists the exact 900-second swim speed window", () => {
    const calculation = calculateActivityFileStreamDerivedCalculations({
      activityId,
      profileId,
      segmentId,
      sourceArtifactId,
      sourceRevision: 3,
      activityStartedAt: new Date(0),
      segmentStartOffsetSeconds: 0,
      segmentEndOffsetSeconds: 1_000,
      activityCategory: "swim",
      distance: 1_400,
      duration: 1_000,
      swimmingEvidenceContext: {
        environment: "open_water",
        timingBasis: "open_water_continuous_timing",
        poolLengthMeters: null,
      },
      streamMetadata: collectActivityFileStreamMetadata(records(1_000, { speed: 1.4 })),
    });
    const exact = calculation.effortsToInsert.find((effort) => effort.duration_seconds === 900);
    expect(exact).toMatchObject({
      source_revision: 3,
      duration_seconds: 900,
      effort_type: "speed",
      source_series: "swim_speed",
      unit: "meters_per_second",
    });
    expect((exact?.end_offset_ms ?? 0) - (exact?.start_offset_ms ?? 0)).toBe(900_000);
  });
});
