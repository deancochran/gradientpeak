import {
  type CommonLoadResult,
  calculateAvailableCommonLoad,
  createObservationQuantificationBundle,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalDailyLoads,
  buildWorkloadEnvelopes,
  resolveActivitySourceIntegrity,
} from "../workload";

const start = new Date("2026-02-01T00:00:00.000Z");
const end = new Date("2026-02-28T00:00:00.000Z");

function observation(
  commonLoad: CommonLoadResult,
  source:
    | { artifactId: string; capability: "activity_file" }
    | { provider: string; externalId: string; capability: "provider_summary" }
    | { capability: "unknown" }
    | undefined = undefined,
) {
  const provider = source && "provider" in source ? source.provider : "wahoo";
  const externalId = source && "externalId" in source ? source.externalId : "provider-activity";
  return quantifyCompletedActivityObservation({
    activityCategory: "bike",
    source: {
      activityId: "activity-1",
      segmentId: "segment-1",
      provider:
        source?.capability === "unknown" || source?.capability === "activity_file"
          ? null
          : provider,
      externalId:
        source?.capability === "unknown" || source?.capability === "activity_file"
          ? null
          : externalId,
      artifactId: source && "artifactId" in source ? source.artifactId : null,
      capability: source?.capability ?? "provider_summary",
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
      startedAt: "2026-02-01T12:00:00.000Z",
      finishedAt: "2026-02-01T13:00:00.000Z",
      elapsedSeconds: 3600,
      activeSeconds: 3600,
      movingSeconds: 3600,
    },
    distance: { meters: 20_000, source: "unknown", basis: "unknown" },
    intensity: {
      averageHeartRateBpm: null,
      averagePowerWatts: 200,
      averageSpeedMetersPerSecond: null,
      normalizedSpeedMetersPerSecond: null,
    },
    commonLoad,
  });
}

function observationBundle(commonLoad: CommonLoadResult) {
  return createObservationQuantificationBundle({ members: [observation(commonLoad)] });
}

function unknownObservationBundle(commonLoad: CommonLoadResult) {
  return createObservationQuantificationBundle({
    members: [observation(commonLoad, { capability: "unknown" })],
  });
}

function unavailableCommonLoad(): CommonLoadResult {
  return {
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
    activity_category: "bike",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-02-01T12:00:00.000Z",
    contributingDurationSeconds: null,
    reason: "threshold_missing",
  };
}

describe("workload utils", () => {
  it("does not manufacture a numeric workload when Common Load is absent", () => {
    const result = buildCanonicalDailyLoads([], start, end);

    expect(result).toMatchObject({ source: "none", complete: false, series: [] });
    expect(buildWorkloadEnvelopes([], start, end).acwr).toMatchObject({
      value: null,
      reasonCode: "missing_quantification",
    });
  });

  it("counts a known activity with unavailable Common Load as known zero without estimating load", () => {
    const result = buildWorkloadEnvelopes(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          sourceIntegrity: "trusted",
          observationQuantification: observationBundle(unavailableCommonLoad()),
        },
      ],
      start,
      end,
      {
        knownRestDates: Array.from({ length: 27 }, (_, index) =>
          new Date(Date.UTC(2026, 1, index + 2)).toISOString().slice(0, 10),
        ),
      },
    );

    expect(result.acwr).toMatchObject({
      value: null,
      coverageDays: 28,
      reasonCode: "chronic_load_zero",
    });
    expect(result.monotony).toMatchObject({
      value: null,
      coverageDays: 7,
      reasonCode: "zero_variance",
    });
  });

  it("counts an activity with one trusted provider source and missing quantification as known zero", () => {
    const sourceIntegrity = resolveActivitySourceIntegrity({
      evidence: {
        currentArtifactIds: [],
        providerReferences: [{ provider: "wahoo", externalId: "provider-activity" }],
      },
      observationQuantification: null,
    });
    const result = buildCanonicalDailyLoads(
      [{ started_at: "2026-02-01T12:00:00.000Z", sourceIntegrity }],
      start,
      end,
    );

    expect(sourceIntegrity).toBe("trusted");
    expect(result).toMatchObject({ complete: true, source: "common_load" });
    expect(result.series[0]?.observations[0]).toEqual({
      date: "2026-02-01",
      state: "known_zero",
      value: 0,
    });
  });

  it("keeps invalid activity timestamps unavailable", () => {
    for (const started_at of ["not-a-date", "2026-02-30T12:00:00.000Z"]) {
      expect(
        buildWorkloadEnvelopes([{ started_at, sourceIntegrity: "trusted" }], start, end).acwr,
      ).toMatchObject({
        value: null,
        reasonCode: "missing_quantification",
      });
    }
  });

  it.each([
    undefined,
    "missing",
    "invalid",
  ] as const)("fails closed when per-activity source integrity is %s", (sourceIntegrity) => {
    const result = buildWorkloadEnvelopes(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          ...(sourceIntegrity === undefined ? {} : { sourceIntegrity }),
        },
      ],
      start,
      end,
    );

    expect(result.acwr).toMatchObject({
      value: null,
      reasonCode: "source_integrity_unavailable",
    });
  });

  it("rejects quantification provenance that conflicts with the persisted current source", () => {
    const quantification = createObservationQuantificationBundle({
      members: [
        observation(unavailableCommonLoad(), {
          artifactId: "artifact-in-quantification",
          capability: "activity_file",
        }),
      ],
    });

    expect(
      resolveActivitySourceIntegrity({
        evidence: {
          currentArtifactIds: ["different-current-artifact"],
          providerReferences: [],
        },
        observationQuantification: quantification,
      }),
    ).toBe("invalid");
    expect(
      buildWorkloadEnvelopes(
        [
          {
            started_at: "2026-02-01T12:00:00.000Z",
            sourceIntegrity: "invalid",
            observationQuantification: quantification,
          },
        ],
        start,
        end,
      ).acwr,
    ).toMatchObject({ value: null, reasonCode: "source_integrity_unavailable" });
  });

  it.each([
    {
      label: "unknown provenance",
      evidence: { currentArtifactIds: ["artifact"], providerReferences: [] },
      quantification: unknownObservationBundle(unavailableCommonLoad()),
    },
    {
      label: "mixed artifact and provider evidence",
      evidence: {
        currentArtifactIds: ["artifact"],
        providerReferences: [{ provider: "wahoo", externalId: "provider-activity" }],
      },
      quantification: createObservationQuantificationBundle({
        members: [
          observation(unavailableCommonLoad(), {
            artifactId: "artifact",
            capability: "activity_file",
          }),
        ],
      }),
    },
    {
      label: "ambiguous provider references",
      evidence: {
        currentArtifactIds: [],
        providerReferences: [
          { provider: "wahoo", externalId: "provider-activity" },
          { provider: "wahoo", externalId: "another-activity" },
        ],
      },
      quantification: observationBundle(unavailableCommonLoad()),
    },
  ])("fails closed for $label", ({ evidence, quantification }) => {
    expect(
      resolveActivitySourceIntegrity({ evidence, observationQuantification: quantification }),
    ).toBe("invalid");
  });

  it.each([
    {
      label: "mixed evidence with absent quantification",
      evidence: {
        currentArtifactIds: ["artifact"],
        providerReferences: [{ provider: "wahoo", externalId: "provider-activity" }],
      },
      observationQuantification: null,
    },
    {
      label: "multiple provider references with malformed quantification",
      evidence: {
        currentArtifactIds: [],
        providerReferences: [
          { provider: "wahoo", externalId: "provider-activity" },
          { provider: "wahoo", externalId: "another-activity" },
        ],
      },
      observationQuantification: { malformed: true },
    },
  ])("validates $label before allowing known zero", (input) => {
    const sourceIntegrity = resolveActivitySourceIntegrity(input);
    expect(sourceIntegrity).toBe("invalid");
    expect(
      buildCanonicalDailyLoads(
        [{ started_at: "2026-02-01T12:00:00.000Z", sourceIntegrity }],
        start,
        end,
      ),
    ).toMatchObject({ complete: false, rejectionReason: "source_integrity_unavailable" });
  });

  it("trusts an exact activity-file source binding", () => {
    const quantification = createObservationQuantificationBundle({
      members: [
        observation(unavailableCommonLoad(), {
          artifactId: "artifact",
          capability: "activity_file",
        }),
      ],
    });
    expect(
      resolveActivitySourceIntegrity({
        evidence: { currentArtifactIds: ["artifact"], providerReferences: [] },
        observationQuantification: quantification,
      }),
    ).toBe("trusted");
  });

  it("rejects a quantification from an incompatible Common Load model version", () => {
    const compatible = observationBundle(unavailableCommonLoad());
    const incompatible = {
      ...compatible,
      summary: {
        ...compatible.summary,
        commonLoad: { ...compatible.summary.commonLoad, version: "0" },
      },
    };

    const result = buildWorkloadEnvelopes(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          sourceIntegrity: "trusted",
          observationQuantification: incompatible,
        },
      ],
      start,
      end,
    );

    expect(result.acwr).toMatchObject({
      value: null,
      reasonCode: "incompatible_common_load_identity",
    });
  });

  it("builds one compatible Common Load series without TSS or IF aliases", () => {
    const commonLoad = calculateAvailableCommonLoad({
      activity_category: "bike",
      method: "power_threshold",
      intensity: 0.8,
      contributingDurationSeconds: 3600,
      quality: {
        source: "manual",
        observed_at: "2026-01-01T00:00:00.000Z",
        valid_at: "2026-01-01T00:00:00.000Z",
        confidence: "high",
        stale: false,
        estimate: false,
        calculation_version: "1",
        evidence_fingerprint: "quality",
      },
      thresholdEvidence: {
        type: "ftp_watts",
        value: 250,
        unit: "watts",
        source: "manual",
        observedAt: "2026-01-01T00:00:00.000Z",
        validAt: "2026-01-01T00:00:00.000Z",
        freshness: "current",
        calculationVersion: "1",
        sourceFingerprint: "threshold",
      },
      evidenceFingerprint: "activity",
      computedAsOf: "2026-02-01T12:00:00.000Z",
      estimated: false,
    });
    const result = buildCanonicalDailyLoads(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          sourceIntegrity: "trusted",
          observationQuantification: observationBundle(commonLoad),
        },
      ],
      start,
      end,
      {
        knownRestDates: Array.from({ length: 27 }, (_, index) =>
          new Date(Date.UTC(2026, 1, index + 2)).toISOString().slice(0, 10),
        ),
      },
    );

    expect(result).toMatchObject({
      complete: true,
      source: "common_load",
      exactIdentity: {
        family: "common_load",
        method: "gradientpeak_relative_load",
        version: "1",
      },
    });
    expect(result).not.toHaveProperty("tss");
    expect(result).not.toHaveProperty("intensityFactor");
  });

  it("returns an explicit duplicate-subject rejection before workload arithmetic", () => {
    const commonLoad = calculateAvailableCommonLoad({
      activity_category: "bike",
      method: "power_threshold",
      intensity: 0.8,
      contributingDurationSeconds: 3600,
      quality: {
        source: "manual",
        observed_at: "2026-01-01T00:00:00.000Z",
        valid_at: "2026-01-01T00:00:00.000Z",
        confidence: "high",
        stale: false,
        estimate: false,
        calculation_version: "1",
        evidence_fingerprint: "quality",
      },
      thresholdEvidence: {
        type: "ftp_watts",
        value: 250,
        unit: "watts",
        source: "manual",
        observedAt: "2026-01-01T00:00:00.000Z",
        validAt: "2026-01-01T00:00:00.000Z",
        freshness: "current",
        calculationVersion: "1",
        sourceFingerprint: "threshold",
      },
      evidenceFingerprint: "activity",
      computedAsOf: "2026-02-01T12:00:00.000Z",
      estimated: false,
    });
    const duplicated = observationBundle(commonLoad);
    const deliveries = [
      {
        started_at: "2026-02-01T12:00:00.000Z",
        sourceIntegrity: "trusted" as const,
        observationQuantification: duplicated,
      },
      {
        started_at: "2026-02-02T12:00:00.000Z",
        sourceIntegrity: "trusted" as const,
        observationQuantification: duplicated,
      },
    ];
    const result = buildCanonicalDailyLoads(deliveries, start, end);

    expect(result).toMatchObject({
      complete: false,
      source: "common_load",
      series: [],
      exactIdentity: null,
      rejectionReason: "duplicate_subject",
    });
    expect(buildWorkloadEnvelopes(deliveries, start, end).acwr).toMatchObject({
      value: null,
      reasonCode: "duplicate_subject",
    });
  });

  it("assigns an instant at a UTC boundary to the profile-local calendar date", () => {
    const result = buildCanonicalDailyLoads(
      [{ started_at: "2026-02-01T15:30:00.000Z", sourceIntegrity: "trusted" }],
      new Date("2026-02-01T15:00:00.000Z"),
      new Date("2026-02-02T14:59:59.999Z"),
      { planningTimezone: "Asia/Tokyo" },
    );

    expect(result.series[0]?.observations).toEqual([
      { date: "2026-02-02", state: "known_zero", value: 0 },
    ]);
  });

  it("uses local calendar bounds across a DST-shortened day", () => {
    const result = buildCanonicalDailyLoads(
      [{ started_at: "2026-03-09T06:30:00.000Z", sourceIntegrity: "trusted" }],
      new Date("2026-03-08T08:00:00.000Z"),
      new Date("2026-03-09T06:59:59.999Z"),
      { planningTimezone: "America/Los_Angeles" },
    );

    expect(result.series[0]?.observations).toEqual([
      { date: "2026-03-08", state: "known_zero", value: 0 },
    ]);
  });

  it("rejects an invalid planning timezone instead of consulting ambient time", () => {
    expect(() =>
      buildCanonicalDailyLoads([], start, end, { planningTimezone: "Mars/Olympus_Mons" }),
    ).toThrow(/valid IANA zone/);
  });
});
