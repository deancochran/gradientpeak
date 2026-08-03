import { projectAthletePerformanceTargetFacts } from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityEffortPerformanceRow,
  AthletePerformanceModelRepository,
  HeartRateCalibrationCandidateRow,
  SwimmingCssProtocolPerformanceRow,
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
    duration_seconds: durationSeconds,
    start_offset: 0,
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
      persisted_start_offset_quantization: "floor_seconds_v1",
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

function lthrRow(): HeartRateCalibrationCandidateRow {
  const activityId = uuid(20);
  const segmentId = uuid(21);
  const recordedAt = new Date("2026-07-20T00:20:00.000Z");
  return {
    id: uuid(22),
    profile_id: athleteId,
    metric_type: "lthr",
    recorded_at: recordedAt,
    unit: "bpm",
    value: 172,
    source: "derived",
    method: "activity_file_lthr_detection",
    calculation_version: "activity-file-lthr-v1",
    reference_activity_id: activityId,
    activity_category: "bike",
    provenance: {
      activity_id: activityId,
      segment_id: segmentId,
      derived_from: "activity_file_best_effort",
      source_series: "heart_rate",
      source_effort_calculation_version: "best-effort-extraction-v1",
      exact_window_start_timestamp_seconds: recordedAt.getTime() / 1_000 - 1_200,
      exact_window_end_timestamp_seconds: recordedAt.getTime() / 1_000,
      duration_seconds: 1_200,
      window_coverage: 1,
      extraction_status: "available",
      extraction_reason: null,
    },
  };
}

function swimSegmentSummary(distanceMeters: 400 | 200, activeDurationSeconds: number) {
  return {
    version: 1,
    timing: {
      timingCoverage: "complete",
      activeMs: activeDurationSeconds * 1_000,
      movingMs: activeDurationSeconds * 1_000,
    },
    distanceMeters,
    normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
    swim: {
      poolLengthMeters: 25,
      timingEvidence: {
        status: "available",
        calculationVersion: "swim-active-rest-duration-v1",
        elapsedDurationSeconds: activeDurationSeconds,
        knownDurationSeconds: activeDurationSeconds,
        sourceLengthCount: distanceMeters / 25,
        activeLengthCount: distanceMeters / 25,
        activeDurationSeconds,
        restDurationSeconds: 0,
      },
    },
  };
}

function swimmingCssProtocolRow(): SwimmingCssProtocolPerformanceRow {
  const cssActivityId = uuid(50);
  const cssArtifactId = uuid(51);
  const effort400Id = uuid(52);
  const effort200Id = uuid(53);
  const segment400Id = uuid(54);
  const segment200Id = uuid(55);
  const observed400 = new Date("2026-07-20T00:05:20.000Z");
  const observed200 = new Date("2026-07-20T00:08:30.000Z");
  return {
    id: uuid(56),
    protocol_id: `css_400m_200m:${cssActivityId}`,
    evidence_id: `sha256:${"b".repeat(64)}`,
    evidence_revision: 2,
    profile_id: athleteId,
    activity_id: cssActivityId,
    source_artifact_id: cssArtifactId,
    source_artifact_digest: "a".repeat(64),
    observed_at: observed200,
    protocol: "css_400m_200m",
    environment: "pool",
    pool_length_meters: 25,
    timing_basis: "pool_length_timing",
    status: "qualified",
    reasons: [],
    effort_400_id: effort400Id,
    effort_400_evidence_revision: 2,
    effort_400_segment_id: segment400Id,
    effort_400_observed_at: observed400,
    effort_400_duration_seconds: 320,
    effort_400_start_offset_ms: 0,
    effort_400_end_offset_ms: 320_000,
    effort_200_id: effort200Id,
    effort_200_evidence_revision: 2,
    effort_200_segment_id: segment200Id,
    effort_200_observed_at: observed200,
    effort_200_duration_seconds: 150,
    effort_200_start_offset_ms: 360_000,
    effort_200_end_offset_ms: 510_000,
    calculation_version: "canonical-swim-css-protocol-evidence-v1",
    activity_segments_revision: 2,
    activity_pool_length_meters: 25,
    current_artifact_id: cssArtifactId,
    current_artifact_profile_id: athleteId,
    current_artifact_role: "source",
    current_artifact_is_current: true,
    artifact_owner_profile_id: athleteId,
    artifact_availability: "accepted",
    artifact_digest: "a".repeat(64),
    effort_400_actual_id: effort400Id,
    effort_400_actual_profile_id: athleteId,
    effort_400_actual_activity_id: cssActivityId,
    effort_400_actual_segment_id: segment400Id,
    effort_400_actual_recorded_at: observed400,
    effort_400_actual_distance_meters: 400,
    effort_400_actual_duration_seconds: 320,
    effort_400_actual_source: "imported",
    effort_400_actual_method: "activity_file_swim_distance_effort",
    effort_400_actual_calculation_version: "activity-file-swim-distance-effort-v1",
    segment_400_summary: swimSegmentSummary(400, 320),
    segment_400_timing_coverage: "complete",
    segment_400_active_ms: 320_000,
    segment_400_revision: 2,
    segment_400_source_artifact_id: cssArtifactId,
    effort_200_actual_id: effort200Id,
    effort_200_actual_profile_id: athleteId,
    effort_200_actual_activity_id: cssActivityId,
    effort_200_actual_segment_id: segment200Id,
    effort_200_actual_recorded_at: observed200,
    effort_200_actual_distance_meters: 200,
    effort_200_actual_duration_seconds: 150,
    effort_200_actual_source: "imported",
    effort_200_actual_method: "activity_file_swim_distance_effort",
    effort_200_actual_calculation_version: "activity-file-swim-distance-effort-v1",
    segment_200_summary: swimSegmentSummary(200, 150),
    segment_200_timing_coverage: "complete",
    segment_200_active_ms: 150_000,
    segment_200_revision: 2,
    segment_200_source_artifact_id: cssArtifactId,
  };
}

function repository(
  options: { cssProtocolRows?: SwimmingCssProtocolPerformanceRow[]; truncated?: boolean } = {},
): AthletePerformanceModelRepository {
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
      swimmingCssProtocolRead: { rows: options.cssProtocolRows ?? [], truncated: false },
      heartRateReads: {
        bike: {
          lthr: { rows: [lthrRow()], truncated: false },
          maxHr: { rows: [], truncated: false },
        },
        run: {
          lthr: { rows: [], truncated: false },
          maxHr: { rows: [], truncated: false },
        },
        swim: {
          lthr: { rows: [], truncated: false },
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
        swim: { activityCategory: "swim", css: { status: "unavailable" } },
      },
      heartRate: {
        bike: {
          lthr: { status: "available", valueBpm: 172, sourceActivityId: uuid(20) },
          maxHr: { status: "unavailable", reason: "no_eligible_evidence" },
        },
      },
    });
    expect(result.categories.bike.parameters.planningThresholdPower.status).toBe("available");
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

  it("projects a swimming target only from qualified canonical protocol evidence", async () => {
    const protocol = swimmingCssProtocolRow();
    const model = await getAthletePerformanceModelAsOf(
      { athleteId, asOf },
      repository({ cssProtocolRows: [protocol] }),
    );
    expect(model.categories.swim.css).toMatchObject({
      status: "available",
      sourceEvidenceIds: [protocol.evidence_id],
      value: {
        protocol: "css_400m_200m",
        cssSecondsPer100Meters: 85,
      },
    });
    expect(projectAthletePerformanceTargetFacts(model).swimming.css).toMatchObject({
      status: "available",
      value: 85,
      unit: "seconds_per_100_meters",
      sourceEvidenceIds: [protocol.evidence_id],
      evidenceTime: {
        observedFrom: protocol.observed_at.toISOString(),
        observedThrough: protocol.observed_at.toISOString(),
        computedAt: asOf.toISOString(),
      },
    });
  });

  it("withholds stale-revision and future CSS protocol rows", async () => {
    const stale = swimmingCssProtocolRow();
    stale.activity_segments_revision += 1;
    const future = swimmingCssProtocolRow();
    future.observed_at = new Date("2026-08-01T00:00:00.000Z");
    future.effort_200_observed_at = future.observed_at;
    future.effort_200_actual_recorded_at = future.observed_at;

    for (const protocol of [stale, future]) {
      const model = await getAthletePerformanceModelAsOf(
        { athleteId, asOf },
        repository({ cssProtocolRows: [protocol] }),
      );
      expect(model.categories.swim.css).toMatchObject({ status: "unavailable", value: null });
    }
  });

  it("derives target observation bounds from supporting efforts without refreshing them at a later cutoff", async () => {
    const store = repository();
    const firstModel = await getAthletePerformanceModelAsOf({ athleteId, asOf }, store);
    const laterAsOf = new Date("2026-07-31T00:00:00.000Z");
    const laterModel = await getAthletePerformanceModelAsOf({ athleteId, asOf: laterAsOf }, store);
    const first = projectAthletePerformanceTargetFacts(firstModel);
    const later = projectAthletePerformanceTargetFacts(laterModel);
    const sourceIds = new Set(first.cycling.planningThresholdPower.sourceEvidenceIds);
    const reads = await store.readAthletePerformanceEvidenceSnapshot({ athleteId, asOf });
    const supportingTimes = reads.effortReads.bike.rows
      .filter((row) => sourceIds.has(row.id))
      .map((row) => row.recorded_at.toISOString())
      .sort();

    expect(first.cycling.planningThresholdPower.evidenceTime).toEqual({
      observedFrom: supportingTimes[0],
      observedThrough: supportingTimes.at(-1),
      computedAt: asOf.toISOString(),
    });
    expect(later.cycling.planningThresholdPower.evidenceTime).toEqual({
      observedFrom: supportingTimes[0],
      observedThrough: supportingTimes.at(-1),
      computedAt: laterAsOf.toISOString(),
    });
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
    expect(
      projectAthletePerformanceTargetFacts(result).cycling.planningThresholdPower,
    ).toMatchObject({
      status: "unavailable",
      sourceEvidenceIds: [],
      evidenceTime: { observedFrom: null, observedThrough: null, computedAt: asOf.toISOString() },
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

  it("returns an unavailable swim model for persisted speed without qualified swim context", async () => {
    const store = repository();
    const reads = await store.readAthletePerformanceEvidenceSnapshot({ athleteId, asOf });
    const unqualifiedSwim = bikeRow(300, 1.4, 90);
    unqualifiedSwim.activity_category = "swim";
    unqualifiedSwim.effort_type = "speed";
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
      swimmingCssProtocolRead: reads.swimmingCssProtocolRead,
      heartRateReads: reads.heartRateReads,
    }));

    await expect(getAthletePerformanceModelAsOf({ athleteId, asOf }, store)).resolves.toMatchObject(
      {
        categories: {
          swim: {
            css: { status: "unavailable", value: null },
          },
        },
      },
    );
  });
});
