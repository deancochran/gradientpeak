import {
  SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION,
  SWIMMING_CSS_SOURCE_EFFORT_METHOD,
  swimmingCssProtocolIdForActivity,
} from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { describe, expect, it } from "vitest";
import type {
  SwimmingCssProtocolSourceEffort,
  SwimmingCssProtocolSourceSnapshot,
} from "../../repositories/swimming-css-protocol-evidence-repository";
import { qualifySwimmingCssProtocolSourceSnapshot } from "./reconcile-swimming-css-protocol-evidence";

const profileId = "00000000-0000-4000-8000-000000000001";
const activityId = "00000000-0000-4000-8000-000000000002";
const artifactId = "00000000-0000-4000-8000-000000000003";
const observationId = "00000000-0000-4000-8000-000000000004";
const artifactDigest = "a".repeat(64);

function id(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function sourceEffort(input: {
  distance: 400 | 200;
  durationSeconds: number;
  index: number;
  ordinal: number;
  startOffsetMs: number;
  endOffsetMs: number;
  overrides?: Partial<SwimmingCssProtocolSourceEffort>;
  provenanceOverrides?: Record<string, unknown>;
}): SwimmingCssProtocolSourceEffort {
  const effortId = id(input.index);
  const segmentId = id(input.index + 100);
  const recordedAt = new Date(Date.parse("2026-07-01T00:00:00.000Z") + input.endOffsetMs);
  return {
    id: effortId,
    profile_id: profileId,
    activity_id: activityId,
    segment_id: segmentId,
    recorded_at: recordedAt,
    activity_category: "swim",
    effort_type: "speed",
    duration_seconds: input.durationSeconds,
    distance_meters: input.distance,
    unit: "meters_per_second",
    value: input.distance / input.durationSeconds,
    source: "imported",
    method: SWIMMING_CSS_SOURCE_EFFORT_METHOD,
    calculation_version: SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION,
    provenance: {
      observation_id: effortId,
      protocol_id: swimmingCssProtocolIdForActivity(activityId),
      protocol: "css_400m_200m",
      activity_id: activityId,
      segment_id: segmentId,
      derived_from: "activity_file_swim_segment",
      source_series: "swim_distance",
      distance_meters: input.distance,
      active_duration_seconds: input.durationSeconds,
      segment_start_offset_ms: input.startOffsetMs,
      segment_end_offset_ms: input.endOffsetMs,
      environment: "pool",
      timing_basis: "pool_length_timing",
      pool_length_meters: 25,
      calculation_version: SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION,
      ...input.provenanceOverrides,
    },
    segment_profile_id: profileId,
    segment_role: "activity",
    segment_activity_category: "swim",
    segment_start_offset_ms: input.startOffsetMs,
    segment_end_offset_ms: input.endOffsetMs,
    segment_ordinal: input.ordinal,
    segment_source_artifact_id: artifactId,
    segment_summary: {
      version: 1,
      timing: {
        timingCoverage: "complete",
        activeMs: input.durationSeconds * 1_000,
        movingMs: input.durationSeconds * 1_000,
      },
      distanceMeters: input.distance,
      normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
      swim: {
        poolLengthMeters: 25,
        timingEvidence: {
          status: "available",
          calculationVersion: "swim-active-rest-duration-v1",
          elapsedDurationSeconds: input.durationSeconds,
          knownDurationSeconds: input.durationSeconds,
          sourceLengthCount: input.distance / 25,
          activeLengthCount: input.distance / 25,
          activeDurationSeconds: input.durationSeconds,
          restDurationSeconds: 0,
        },
      },
    },
    segment_timing_coverage: "complete",
    segment_active_ms: input.durationSeconds * 1_000,
    segment_revision: 3,
    ...input.overrides,
  };
}

function snapshot(
  input: {
    activityPoolLength?: number | null;
    efforts?: SwimmingCssProtocolSourceEffort[];
    artifactAvailability?: "accepted" | "deletion_pending" | "deleted";
  } = {},
): SwimmingCssProtocolSourceSnapshot {
  return {
    activity: {
      id: activityId,
      profile_id: profileId,
      pool_length_meters: input.activityPoolLength === undefined ? 25 : input.activityPoolLength,
      segments_revision: 3,
    },
    currentArtifact: {
      artifact_id: artifactId,
      profile_id: profileId,
      role: "source",
      is_current: true,
      availability: input.artifactAvailability ?? "accepted",
      digest: artifactDigest,
    },
    efforts: input.efforts ?? [
      fourHundredEffort(),
      sourceEffort({
        distance: 200,
        durationSeconds: 150,
        index: 20,
        ordinal: 1,
        startOffsetMs: 360_000,
        endOffsetMs: 510_000,
      }),
    ],
    existingEvidence: null,
  };
}

function fourHundredEffort(): SwimmingCssProtocolSourceEffort {
  return sourceEffort({
    distance: 400,
    durationSeconds: 320,
    index: 10,
    ordinal: 0,
    startOffsetMs: 0,
    endOffsetMs: 320_000,
  });
}

function qualify(source: SwimmingCssProtocolSourceSnapshot) {
  return qualifySwimmingCssProtocolSourceSnapshot({
    profileId,
    activityId,
    observationId,
    snapshot: source,
  });
}

describe("canonical swimming CSS protocol qualification", () => {
  it("persists source protocol identity and two observed efforts, never a CSS scalar", () => {
    const result = qualify(snapshot());
    expect(result).toMatchObject({
      status: "qualified",
      reasons: [],
      evidence: {
        protocolId: swimmingCssProtocolIdForActivity(activityId),
        observationId,
        evidenceRevision: 3,
        sourceArtifactId: artifactId,
        sourceArtifactDigest: artifactDigest,
        status: "qualified",
        reasons: [],
        efforts: [
          { distanceMeters: 400, sequence: 1, activeDurationSeconds: 320 },
          { distanceMeters: 200, sequence: 2, activeDurationSeconds: 150 },
        ],
      },
    });
    expect(result.evidence).not.toHaveProperty("cssSecondsPer100Meters");
  });

  it("rejects missing or mismatched pool context", () => {
    expect(qualify(snapshot({ activityPoolLength: null }))).toEqual({
      status: "rejected",
      reasons: ["css_pool_context_missing"],
      evidence: null,
    });
    const mismatched = sourceEffort({
      distance: 200,
      durationSeconds: 150,
      index: 20,
      ordinal: 1,
      startOffsetMs: 360_000,
      endOffsetMs: 510_000,
      provenanceOverrides: { pool_length_meters: 50 },
    });
    expect(qualify(snapshot({ efforts: [fourHundredEffort(), mismatched] }))).toMatchObject({
      status: "rejected",
      reasons: ["css_pool_context_missing"],
    });
  });

  it("rejects mismatched protocol identities and non-current artifacts or revisions", () => {
    const mismatched = sourceEffort({
      distance: 200,
      durationSeconds: 150,
      index: 20,
      ordinal: 1,
      startOffsetMs: 360_000,
      endOffsetMs: 510_000,
      provenanceOverrides: { protocol_id: "another-protocol" },
    });
    expect(qualify(snapshot({ efforts: [fourHundredEffort(), mismatched] }))).toMatchObject({
      reasons: ["css_protocol_identity_mismatch"],
    });
    expect(qualify(snapshot({ artifactAvailability: "deletion_pending" }))).toMatchObject({
      reasons: ["css_source_artifact_not_current"],
    });
    const stale = sourceEffort({
      distance: 200,
      durationSeconds: 150,
      index: 20,
      ordinal: 1,
      startOffsetMs: 360_000,
      endOffsetMs: 510_000,
      overrides: { segment_revision: 2 },
    });
    expect(qualify(snapshot({ efforts: [fourHundredEffort(), stale] }))).toMatchObject({
      reasons: ["css_source_segment_not_current"],
    });
  });

  it("rejects incomplete timing and invalid 400 m then 200 m ordering", () => {
    const incomplete = sourceEffort({
      distance: 200,
      durationSeconds: 150,
      index: 20,
      ordinal: 1,
      startOffsetMs: 360_000,
      endOffsetMs: 510_000,
      overrides: { segment_timing_coverage: "partial" },
    });
    expect(qualify(snapshot({ efforts: [fourHundredEffort(), incomplete] }))).toMatchObject({
      reasons: ["css_timing_incomplete"],
    });
    const outOfOrder = sourceEffort({
      distance: 200,
      durationSeconds: 150,
      index: 20,
      ordinal: 0,
      startOffsetMs: 100_000,
      endOffsetMs: 250_000,
    });
    expect(qualify(snapshot({ efforts: [fourHundredEffort(), outOfOrder] }))).toMatchObject({
      reasons: ["css_effort_order_invalid"],
    });
  });
});
