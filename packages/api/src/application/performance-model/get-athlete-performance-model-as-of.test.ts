import { describe, expect, it, vi } from "vitest";
import type {
  ActivityEffortPerformanceRow,
  AthletePerformanceModelRepository,
} from "../../repositories/athlete-performance-model-repository";
import { getAthletePerformanceModelAsOf } from "./get-athlete-performance-model-as-of";

const athleteId = "00000000-0000-4000-8000-000000000001";
const asOf = new Date("2026-07-30T00:00:00.000Z");
const activityStartedAtSeconds = Date.parse("2026-07-01T00:00:00.000Z") / 1_000;

function uuid(index: number) {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function bikeRow(
  durationSeconds: number,
  value: number,
  index: number,
): ActivityEffortPerformanceRow {
  const id = uuid(100 + index);
  const activityId = uuid(10 + (index % 3));
  const segmentId = uuid(200 + index);
  const artifactId = uuid(300 + index);
  return {
    id,
    profile_id: athleteId,
    activity_id: activityId,
    segment_id: segmentId,
    recorded_at: new Date((activityStartedAtSeconds + durationSeconds) * 1_000),
    activity_category: "bike",
    effort_type: "power",
    source_series: "power",
    duration_seconds: durationSeconds,
    source_artifact_id: artifactId,
    source_revision: 1,
    start_offset_ms: 0,
    end_offset_ms: durationSeconds * 1_000,
    window_coverage: 1,
    max_gap_seconds: 2,
    unit: "watts",
    value,
    source: "imported",
    method: "activity_file_best_effort",
    calculation_version: "best-effort-extraction-v1",
    provenance: {
      observation_id: id,
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
      persisted_start_offset_quantization: "nearest_millisecond_v1",
      calculation_version: "best-effort-extraction-v1",
    },
    segment_revision: 1,
    accepted_segments_revision: 1,
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
  };
}

function repository(options: { truncated?: boolean } = {}): AthletePerformanceModelRepository {
  const durations = [5, 30, 60, 180, 300, 600, 900, 1_200, 1_800, 3_600];
  const shortDurationPower = new Map([
    [5, 1_200],
    [30, 600],
    [60, 500],
  ]);
  const rows = durations.map((duration, index) =>
    bikeRow(duration, shortDurationPower.get(duration) ?? 240 + 24_000 / duration, index),
  );
  return {
    readAthletePerformanceEvidenceSnapshot: vi.fn(async () => ({
      effortReads: {
        bike: { rows, truncated: options.truncated ?? false },
        run: { rows: [], truncated: false },
        swim: { rows: [], truncated: false },
      },
      heartRateReads: {
        bike: {
          maxHr: { rows: [], truncated: false },
        },
        run: {
          maxHr: { rows: [], truncated: false },
        },
        swim: {
          maxHr: { rows: [], truncated: false },
        },
      },
    })),
  };
}

describe("getAthletePerformanceModelAsOf", () => {
  it("runs canonical category models and returns strict HR calibration facts", async () => {
    const result = await getAthletePerformanceModelAsOf({ athleteId, asOf }, repository());
    expect(result).toMatchObject({
      contractVersion: "athlete-performance-model-snapshot-v1",
      athleteId,
      asOf: asOf.toISOString(),
      categories: {
        bike: {
          activityCategory: "bike",
          parameters: {
            planningThresholdPower: { status: "available" },
            modeledTimeToExhaustion: { status: "available" },
            durationRetention: { status: "available" },
          },
        },
        run: { activityCategory: "run", speedPaceCurve: { status: "unavailable" } },
        swim: { activityCategory: "swim", paceDurationCurve: { status: "unavailable" } },
      },
      heartRate: {
        bike: {
          lthr: { status: "unavailable", valueBpm: null, sourceActivityId: null },
          maxHr: { status: "unavailable", reason: "no_eligible_evidence" },
        },
      },
    });
    expect(result.categories.bike.parameters.planningThresholdPower.status).toBe("available");
    expect(result.heartRate.bike.lthr).toMatchObject({
      status: "unavailable",
      sourceEvidenceId: null,
      sourceActivityId: null,
    });
    if (result.categories.bike.parameters.planningThresholdPower.status !== "unavailable") {
      expect(result.categories.bike.parameters.planningThresholdPower.value.watts).toBeCloseTo(
        247,
        6,
      );
    }
    expect(
      result.categories.bike.trainingLevels.every((level) => level.status === "unavailable"),
    ).toBe(true);
  });

  it("preserves query truncation and self-exclusion semantics", async () => {
    const store = repository({ truncated: true });
    const excludedActivityId = uuid(999);
    const result = await getAthletePerformanceModelAsOf(
      { athleteId, asOf, excludedActivityId },
      store,
    );
    expect(store.readAthletePerformanceEvidenceSnapshot).toHaveBeenCalledWith({
      athleteId,
      asOf,
      excludedActivityId,
    });
    expect(result.categories.bike.parameters.planningThresholdPower).toMatchObject({
      status: "unavailable",
      reasons: ["evidence_read_truncated"],
    });
  });

  it("rejects malformed candidate evidence instead of substituting a fallback", async () => {
    const store = repository();
    const reads = await store.readAthletePerformanceEvidenceSnapshot({ athleteId, asOf });
    const first = reads.effortReads.bike.rows[0];
    if (!first) throw new Error("Expected fixture effort");
    if (
      first.provenance === null ||
      typeof first.provenance !== "object" ||
      Array.isArray(first.provenance)
    ) {
      throw new Error("Expected object provenance");
    }
    first.provenance = { ...first.provenance, source_series: "speed" };
    store.readAthletePerformanceEvidenceSnapshot = vi.fn(async () => reads);
    await expect(getAthletePerformanceModelAsOf({ athleteId, asOf }, store)).rejects.toThrow();
  });

  it("returns an unavailable swim duration curve for speed without qualified swim context", async () => {
    const store = repository();
    const reads = await store.readAthletePerformanceEvidenceSnapshot({ athleteId, asOf });
    const unqualifiedSwim = bikeRow(300, 1.4, 90);
    unqualifiedSwim.activity_category = "swim";
    unqualifiedSwim.effort_type = "speed";
    unqualifiedSwim.source_series = "swim_speed";
    unqualifiedSwim.unit = "meters_per_second";
    unqualifiedSwim.segment_activity_category = "swim";
    if (
      unqualifiedSwim.provenance === null ||
      typeof unqualifiedSwim.provenance !== "object" ||
      Array.isArray(unqualifiedSwim.provenance)
    ) {
      throw new Error("Expected object provenance");
    }
    unqualifiedSwim.provenance = {
      ...unqualifiedSwim.provenance,
      source_series: "swim_speed",
    };
    store.readAthletePerformanceEvidenceSnapshot = vi.fn(async () => ({
      effortReads: {
        ...reads.effortReads,
        swim: { rows: [unqualifiedSwim], truncated: false },
      },
      heartRateReads: reads.heartRateReads,
    }));

    await expect(getAthletePerformanceModelAsOf({ athleteId, asOf }, store)).resolves.toMatchObject(
      {
        categories: {
          swim: {
            paceDurationCurve: { status: "unavailable", value: null },
          },
        },
      },
    );
  });
});
