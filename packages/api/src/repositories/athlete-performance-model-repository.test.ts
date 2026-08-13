import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { describe, expect, it, vi } from "vitest";
import {
  type ActivityEffortPerformanceRow,
  adaptActivityEffortToCanonicalPerformanceEvidence,
  adaptQualifiedSwimmingPerformanceEvidence,
  createAthletePerformanceModelRepository,
} from "./athlete-performance-model-repository";

const athleteId = "00000000-0000-4000-8000-000000000001";
const activityId = "00000000-0000-4000-8000-000000000002";
const segmentId = "00000000-0000-4000-8000-000000000003";
const evidenceId = "00000000-0000-4000-8000-000000000004";
const artifactId = "00000000-0000-4000-8000-000000000005";
const activityStartedAtSeconds = Date.parse("2026-07-01T00:00:00.000Z") / 1_000;

function effortProvenance(
  durationSeconds = 300,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    observation_id: evidenceId,
    activity_id: activityId,
    segment_id: segmentId,
    derived_from: "activity_file_stream",
    source_series: "power",
    interval_convention: "current_sample_applies_to_preceding_interval",
    exact_window_start_timestamp_seconds: activityStartedAtSeconds,
    exact_window_end_timestamp_seconds: activityStartedAtSeconds + durationSeconds,
    exact_window_start_offset_seconds: 0,
    exact_window_end_offset_seconds: durationSeconds,
    duration_seconds: durationSeconds,
    contributing_duration_seconds: durationSeconds,
    window_coverage: 1,
    source_time_coverage: 1,
    extraction_status: "available",
    extraction_reason: null,
    persisted_start_offset_quantization: "floor_seconds_v1",
    calculation_version: "best-effort-extraction-v1",
    ...overrides,
  };
}

function row(overrides: Partial<ActivityEffortPerformanceRow> = {}): ActivityEffortPerformanceRow {
  const durationSeconds = overrides.duration_seconds ?? 300;
  const recordedAt = new Date((activityStartedAtSeconds + durationSeconds) * 1_000);
  return {
    id: evidenceId,
    profile_id: athleteId,
    activity_id: activityId,
    segment_id: segmentId,
    recorded_at: recordedAt,
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: durationSeconds,
    start_offset: 0,
    unit: "watts",
    value: 300,
    source: "imported",
    method: "activity_file_best_effort",
    calculation_version: "best-effort-extraction-v1",
    provenance: effortProvenance(durationSeconds),
    segment_revision: 3,
    accepted_segments_revision: 3,
    segment_role: "activity",
    segment_activity_category: "bike",
    segment_summary: {},
    segment_source_artifact_id: artifactId,
    current_artifact_id: artifactId,
    current_artifact_profile_id: athleteId,
    current_artifact_role: "source",
    current_artifact_is_current: true,
    artifact_owner_profile_id: athleteId,
    artifact_availability: "accepted",
    activity_pool_length_meters: null,
    ...overrides,
  };
}

describe("adaptActivityEffortToCanonicalPerformanceEvidence", () => {
  it("retains canonical identities, revision, timestamps, coverage, and provenance", () => {
    expect(adaptActivityEffortToCanonicalPerformanceEvidence(row())).toEqual(
      expect.objectContaining({
        observationId: evidenceId,
        evidenceId,
        evidenceRevision: 3,
        athleteId,
        activityId,
        segmentId,
        activityCategory: "bike",
        metric: "power",
        unit: "watts",
        evidenceContext: { kind: "cycling_power" },
        provenance: expect.objectContaining({
          sourceSeries: "power",
          extractionStatus: "available",
          windowCoverage: 1,
          sourceTimeCoverage: 1,
        }),
      }),
    );
  });

  it("keeps raw and grade-adjusted running lanes distinct", () => {
    const raw = row({
      activity_category: "run",
      effort_type: "speed",
      unit: "meters_per_second",
      value: 4,
      segment_activity_category: "run",
      provenance: effortProvenance(300, { source_series: "raw_speed" }),
    });
    const adjusted = row({
      ...raw,
      id: "00000000-0000-4000-8000-000000000005",
      provenance: effortProvenance(300, {
        observation_id: "00000000-0000-4000-8000-000000000005",
        source_series: "grade_adjusted_speed",
      }),
    });
    expect(adaptActivityEffortToCanonicalPerformanceEvidence(raw)).toMatchObject({
      evidenceContext: { kind: "running_speed", basis: "raw_speed" },
    });
    expect(adaptActivityEffortToCanonicalPerformanceEvidence(adjusted)).toMatchObject({
      evidenceContext: { kind: "running_speed", basis: "grade_adjusted_speed" },
    });
  });

  it("accepts pool identity only when timing and pool length agree", () => {
    const swimSummary = {
      version: 1,
      timing: { timingCoverage: "complete", activeMs: 300_000, movingMs: 300_000 },
      normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
      swim: {
        poolLengthMeters: 25,
        timingEvidence: {
          status: "available",
          calculationVersion: "swim-active-rest-duration-v1",
          elapsedDurationSeconds: 300,
          knownDurationSeconds: 300,
          sourceLengthCount: 12,
          activeLengthCount: 12,
          activeDurationSeconds: 300,
          restDurationSeconds: 0,
        },
      },
    };
    const swim = row({
      activity_category: "swim",
      effort_type: "speed",
      unit: "meters_per_second",
      value: 1.4,
      segment_activity_category: "swim",
      segment_summary: swimSummary,
      activity_pool_length_meters: 25,
      provenance: effortProvenance(300, {
        source_series: "swim_speed",
        swimming_environment: "pool",
        timing_basis: "pool_length_timing",
        pool_length_meters: 25,
      }),
    });
    expect(adaptActivityEffortToCanonicalPerformanceEvidence(swim)).toMatchObject({
      evidenceContext: {
        kind: "swimming_speed",
        environment: "pool",
        timingBasis: "pool_length_timing",
        poolLengthMeters: 25,
      },
    });
    expect(() =>
      adaptActivityEffortToCanonicalPerformanceEvidence({
        ...swim,
        activity_pool_length_meters: 50,
      }),
    ).toThrow("matching pool length");
  });

  it("demotes swim speed without qualified environment and timing context", () => {
    const swim = row({
      activity_category: "swim",
      effort_type: "speed",
      unit: "meters_per_second",
      value: 1.4,
      segment_activity_category: "swim",
      provenance: effortProvenance(300, { source_series: "swim_speed" }),
    });

    expect(adaptQualifiedSwimmingPerformanceEvidence(swim)).toBeNull();
  });

  const incompatibleRows = [
    ["identity", { provenance: effortProvenance(300, { activity_id: athleteId }) }],
    ["accepted revision", { accepted_segments_revision: 4 }],
    ["current artifact", { current_artifact_id: athleteId }],
    ["current artifact owner", { current_artifact_profile_id: activityId }],
    ["current source role", { current_artifact_role: "attachment" }],
    ["current link status", { current_artifact_is_current: false }],
    ["artifact owner", { artifact_owner_profile_id: activityId }],
    ["artifact acceptance", { artifact_availability: "pending" }],
    ["coverage", { provenance: effortProvenance(300, { window_coverage: 0.99 }) }],
    ["timestamp", { recorded_at: new Date("2026-07-02T00:00:00.000Z") }],
    ["source", { source: "provider" as const }],
  ] satisfies Array<[string, Partial<ActivityEffortPerformanceRow>]>;

  it.each(incompatibleRows)("rejects incompatible %s rows", (_name, overrides) => {
    expect(() => adaptActivityEffortToCanonicalPerformanceEvidence(row(overrides))).toThrow();
  });
});

describe("createAthletePerformanceModelRepository", () => {
  function transactionFixture() {
    const select = vi.fn(() => {
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: async () => [],
      };
      return builder;
    });
    const execute = vi.fn(async () => ({ rows: [] }));
    const tx = { select, execute };
    const transaction = vi.fn(async (operation: (executor: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );
    return { db: { transaction }, execute, select, transaction };
  }

  it("reads one immutable evidence snapshot in a read-only repeatable-read transaction", async () => {
    const fixture = transactionFixture();
    const repository = createAthletePerformanceModelRepository(fixture.db as never);

    const snapshot = await repository.readAthletePerformanceEvidenceSnapshot({
      athleteId,
      asOf: new Date("2026-07-10T00:00:00.000Z"),
      excludedActivityId: activityId,
    });

    expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
    expect(fixture.select).toHaveBeenCalledTimes(7);
    expect(fixture.execute).toHaveBeenCalledOnce();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.effortReads)).toBe(true);
    expect(Object.isFrozen(snapshot.effortReads.bike.rows)).toBe(true);
    expect(Object.isFrozen(snapshot.heartRateReads.bike)).toBe(true);
  });

  it("uses a fixed eight-query evidence batch independent of request count", async () => {
    const fixture = transactionFixture();
    const repository = createAthletePerformanceModelRepository(fixture.db as never);
    const requests = Array.from({ length: 25 }, (_, index) => ({
      athleteId,
      asOf: new Date(Date.parse("2026-07-10T00:00:00.000Z") + index * 60_000),
    }));

    await expect(repository.readEvidenceBatch?.(requests)).resolves.toHaveLength(25);
    expect(fixture.select).toHaveBeenCalledTimes(7);
    expect(fixture.execute).toHaveBeenCalledOnce();
    expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
  });
});
