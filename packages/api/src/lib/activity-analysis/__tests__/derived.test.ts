import {
  COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
  completedSegmentSummarySchema,
} from "@repo/core";
import {
  type CyclingNormalizedPowerResult,
  calculateCyclingNormalizedPower,
} from "@repo/core/calculations";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import type { HeartRateDurationEvidence } from "@repo/core/zones";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityAnalysisContextEvidenceRequest,
  ActivityAnalysisContextSnapshot,
  ActivityAnalysisStore,
} from "../../../repositories";
import {
  buildActivityDerivedSummaryMap,
  buildActivitySegmentDerivedSummaries,
  buildCompletedSegmentAnalysisActivity,
  buildDynamicStressSeries,
  deriveActivityParentClassification,
} from "../derived";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });
type NumericNormalizedPowerResult = Exclude<
  CyclingNormalizedPowerResult,
  { status: "unavailable" }
>;
const NORMALIZED_POWER_BY_DURATION = new Map<number, NumericNormalizedPowerResult>();

function unavailableTargets(asOf: Date, _reason?: string) {
  return buildPerformanceTargetFactsFixture({
    asOf: asOf.toISOString(),
    athleteId: PROFILE_ID,
  });
}

function normalizedPowerForDuration(durationSeconds: number): NumericNormalizedPowerResult {
  const cached = NORMALIZED_POWER_BY_DURATION.get(durationSeconds);
  if (cached) return cached;
  const timestamps = [0];
  let timestampSeconds = 0;
  while (timestampSeconds < durationSeconds) {
    timestampSeconds = Math.min(durationSeconds, timestampSeconds + 5);
    timestamps.push(timestampSeconds);
  }
  const result = calculateCyclingNormalizedPower({
    samples: timestamps.map((timestamp) => ({ timestampSeconds: timestamp, powerWatts: 200 })),
  });
  if (result.status === "unavailable") {
    throw new Error(`Expected numeric Normalized Power for ${durationSeconds} seconds`);
  }
  NORMALIZED_POWER_BY_DURATION.set(durationSeconds, result);
  return result;
}

function segment(
  id: string,
  ordinal: number,
  activity_category: "bike" | "run" | "swim" | "strength" | "other",
  start: number,
  end: number,
  heartRateDistribution?: HeartRateDurationEvidence,
) {
  const normalizedPowerResult =
    activity_category === "bike"
      ? normalizedPowerForDuration((end - start) / 1_000)
      : unavailableNormalizedPowerResult;
  return {
    id,
    activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ordinal,
    role: "activity" as const,
    activity_category,
    start_offset_ms: start,
    end_offset_ms: end,
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
    active_ms: end - start,
    moving_ms: end - start,
    summary: {
      version: 1,
      timing: { timingCoverage: "complete", activeMs: end - start, movingMs: end - start },
      distanceMeters:
        activity_category === "bike" ? 20_000 : activity_category === "run" ? 5_000 : 3_600,
      averagePowerWatts: activity_category === "bike" ? 200 : undefined,
      normalizedPowerResult,
      averageSpeedMetersPerSecond:
        activity_category === "run" ? 3.5 : activity_category === "swim" ? 1 : undefined,
      averageHeartRateBpm: heartRateDistribution ? 150 : undefined,
      heartRateDistribution,
    },
  };
}

function heartRateEvidence(
  coverageSeconds: number,
  buckets: Array<{ bpm: number; seconds: number }>,
): HeartRateDurationEvidence {
  const eligibleDurationSeconds = 3600;
  const partial = coverageSeconds < eligibleDurationSeconds;
  const evidence = {
    calculationVersion: "heart-rate-zone-duration-v1" as const,
    coverageSeconds,
    eligibleDurationSeconds,
    sourceTimeCoverage: coverageSeconds / eligibleDurationSeconds,
    timeWeightedAverageBpm:
      buckets.reduce((sum, bucket) => sum + bucket.bpm * bucket.seconds, 0) / coverageSeconds,
    buckets,
    diagnostics: {
      sourceSampleCount: 0,
      acceptedTimestampCount: 0,
      contributingIntervalCount: 0,
      observedSpanSeconds: eligibleDurationSeconds,
      pausedDurationSeconds: 0,
      excludedGapDurationSeconds: 0,
      excludedMissingDurationSeconds: eligibleDurationSeconds - coverageSeconds,
      excludedInvalidDurationSeconds: 0,
      duplicateTimestampCount: 0,
      reversedTimestampCount: 0,
      invalidTimestampCount: 0,
    },
  };
  return partial
    ? { ...evidence, status: "partial", reason: "source_incomplete" }
    : { ...evidence, status: "available" };
}

function activity(
  segments: ReturnType<typeof segment>[],
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  startedAt = new Date("2026-07-01T08:00:00.000Z"),
) {
  return {
    id,
    profile_id: PROFILE_ID,
    started_at: startedAt,
    finished_at: new Date("2026-07-01T09:00:00.000Z"),
    elapsed_ms: 3_600_000,
    active_ms: 3_600_000,
    moving_ms: 3_600_000,
    timing_coverage: "complete" as const,
    distance_meters: 25_000,
    avg_heart_rate: null,
    max_heart_rate: null,
    segments: segments.map((value) => ({ ...value, activity_id: id })),
  };
}

function store() {
  const snapshot: ActivityAnalysisContextSnapshot = {
    profile: { dob: null, gender: null },
    profileMetrics: [],
    recentEfforts: [
      {
        id: "prior-threshold-effort",
        activity_id: "prior-threshold-ride",
        activity_category: "bike",
        duration_seconds: 1200,
        effort_type: "power",
        recorded_at: new Date("2026-06-01T00:00:00.000Z"),
        unit: "watts",
        value: 250 / 0.95,
        source: "imported",
        method: "activity_file_best_effort",
        provenance: {
          activity_id: "prior-threshold-ride",
          derived_from: "activity_file_stream",
        },
      },
    ],
  };
  return {
    getPerformanceTargetsAsOf: vi.fn(async ({ asOf }: { asOf: Date }) =>
      buildPerformanceTargetFactsFixture({
        athleteId: PROFILE_ID,
        asOf: asOf.toISOString(),
        bikeThresholdWatts: 250,
      }),
    ),
    getContextSnapshot: vi.fn(async () => snapshot),
    loadContextEvidence: vi.fn(
      async (_input: { requests: ActivityAnalysisContextEvidenceRequest[] }) =>
        new Map([[PROFILE_ID, snapshot]]),
    ),
  } satisfies ActivityAnalysisStore;
}

function contextRequestKeyForTest(request: ActivityAnalysisContextEvidenceRequest): string {
  return [
    request.profileId,
    request.asOf.toISOString(),
    request.effortLookbackAsOf?.toISOString() ?? "",
    request.activityIdToExclude ?? "",
  ].join("\u0000");
}

function heartRateStore(
  input: {
    lthrCategory?: "bike" | "run";
    runThresholdMetersPerSecond?: number;
    bikeThresholdWatts?: number;
  } = {},
) {
  const lthrCategory = input.lthrCategory ?? "run";
  return {
    getPerformanceTargetsAsOf: vi.fn(async ({ asOf }: { asOf: Date }) =>
      buildPerformanceTargetFactsFixture({
        athleteId: PROFILE_ID,
        asOf: asOf.toISOString(),
        heartRateObservedAt: "2026-06-15T10:30:00.000Z",
        lthrBpm: { [lthrCategory]: 150 },
        ...(input.runThresholdMetersPerSecond === undefined
          ? {}
          : {
              runThresholdMetersPerSecond: input.runThresholdMetersPerSecond,
            }),
        ...(input.bikeThresholdWatts === undefined
          ? {}
          : { bikeThresholdWatts: input.bikeThresholdWatts }),
      }),
    ),
    loadContextEvidence: vi.fn(
      async () =>
        new Map([
          [
            PROFILE_ID,
            {
              profile: { dob: null, gender: null },
              profileMetrics: [
                {
                  id: "older-run-lthr-evidence",
                  metric_type: "lthr",
                  recorded_at: new Date("2026-06-10T10:30:00.000Z"),
                  unit: "bpm",
                  value: 180,
                  source: "derived",
                  method: "activity_file_lthr_detection",
                  calculation_version: "activity-file-lthr-v1",
                  reference_activity_id: "older-prior-run",
                  reference_activity_category: "run",
                  provenance: {
                    activity_id: "older-prior-run",
                    derived_from: "activity_file_stream",
                  },
                },
                {
                  id: "run-lthr-evidence",
                  metric_type: "lthr",
                  recorded_at: new Date("2026-06-15T10:30:00.000Z"),
                  unit: "bpm",
                  value: 150,
                  source: "derived",
                  method: "activity_file_lthr_detection",
                  calculation_version: "activity-file-lthr-v1",
                  reference_activity_id: "prior-run",
                  reference_activity_category: "run",
                  provenance: {
                    activity_id: "prior-run",
                    derived_from: "activity_file_stream",
                  },
                },
              ],
              recentEfforts: [],
            },
          ],
        ]),
    ),
  };
}

function swimThresholdStore(available = true) {
  return {
    getPerformanceTargetsAsOf: vi.fn(async ({ asOf }: { asOf: Date }) =>
      available
        ? buildPerformanceTargetFactsFixture({
            athleteId: PROFILE_ID,
            asOf: asOf.toISOString(),
            swimThresholdMetersPerSecond: 1,
          })
        : unavailableTargets(asOf),
    ),
    loadContextEvidence: vi.fn(
      async () =>
        new Map([
          [
            PROFILE_ID,
            {
              profile: { dob: null, gender: null },
              profileMetrics: [],
              recentEfforts: [],
            },
          ],
        ]),
    ),
  };
}

function selfCalibratingStore() {
  return {
    loadContextEvidence: vi.fn(
      async () =>
        new Map([
          [
            PROFILE_ID,
            {
              profile: { dob: null, gender: null },
              profileMetrics: [],
              recentEfforts: [
                {
                  activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  activity_category: "bike",
                  duration_seconds: 1200,
                  effort_type: "power",
                  recorded_at: new Date("2026-07-01T08:45:00.000Z"),
                  unit: "watts",
                  value: 250,
                  source: "imported",
                  method: "activity_file_best_effort",
                  provenance: {
                    activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    derived_from: "activity_file_stream",
                  },
                },
              ],
            },
          ],
        ]),
    ),
  };
}

function selfCalibratingFallbackStore() {
  return {
    getContextSnapshot: vi.fn(async () => ({
      profile: { dob: null, gender: null },
      profileMetrics: [],
      recentEfforts: [
        {
          activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          activity_category: "bike",
          duration_seconds: 1200,
          effort_type: "power",
          recorded_at: new Date("2026-07-01T08:45:00.000Z"),
          unit: "watts",
          value: 250,
          source: "imported",
          method: "activity_file_best_effort",
          provenance: {
            activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            derived_from: "activity_file_stream",
          },
        },
      ],
    })),
  };
}

function criticalPowerStore() {
  const effort = (
    activityId: string,
    durationSeconds: number,
    value: number,
    recordedAt: string,
  ) => ({
    activity_id: activityId,
    activity_category: "bike",
    duration_seconds: durationSeconds,
    effort_type: "power",
    recorded_at: new Date(recordedAt),
    unit: "watts",
    value,
    source: "imported",
    method: "activity_file_best_effort",
    calculation_version: "best-effort-extraction-v1",
    provenance: { activity_id: activityId, derived_from: "activity_file_stream" },
  });
  return {
    loadContextEvidence: vi.fn(
      async () =>
        new Map([
          [
            PROFILE_ID,
            {
              profile: { dob: null, gender: null },
              profileMetrics: [],
              recentEfforts: [
                effort("ride-a", 300, 300, "2026-06-10T12:00:00.000Z"),
                effort("ride-b", 600, 275, "2026-06-15T12:00:00.000Z"),
                effort("ride-c", 1200, 262.5, "2026-06-20T12:00:00.000Z"),
              ],
            },
          ],
        ]),
    ),
  };
}

describe("segment-derived activity analysis", () => {
  it("preserves ordered and repeated parent categories", () => {
    const segments = [
      segment("11111111-1111-4111-8111-111111111111", 0, "run", 0, 600_000),
      segment("22222222-2222-4222-8222-222222222222", 1, "bike", 600_000, 1_800_000),
      segment("33333333-3333-4333-8333-333333333333", 2, "run", 1_800_000, 2_400_000),
    ];
    expect(deriveActivityParentClassification(segments)).toEqual({
      kind: "multisport",
      categories: ["run", "bike", "run"],
      activity_category: null,
    });
  });

  it("publishes a multisport common-load parent", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 1_800_000),
      segment("22222222-2222-4222-8222-222222222222", 1, "run", 1_800_000, 3_600_000),
    ]);
    const legacySegment = input.segments[0];
    if (!legacySegment) throw new Error("Expected a legacy segment fixture");
    for (const field of [
      "source_artifact_id",
      "source_session_index",
      "source_message_index",
      "raw_type_string",
      "raw_type_integer",
      "raw_sport_string",
      "raw_sport_integer",
      "raw_sub_sport_string",
      "raw_sub_sport_integer",
    ]) {
      Reflect.deleteProperty(legacySegment, field);
    }
    const segments = await buildActivitySegmentDerivedSummaries({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    expect(segments.map(({ activity_category }) => activity_category)).toEqual(["bike", "run"]);
    expect(segments[0]).toMatchObject({
      dedupe_key: `activity-segment:${input.id}:11111111-1111-4111-8111-111111111111:load:v1`,
      load_stream_key: "bike:gradientpeak_relative_load:1",
      observationQuantification: {
        members: [
          {
            kind: "observation",
            stage: "final",
            activity_category: "bike",
            duration: {
              elapsed: { status: "available", evidenceRole: "measured", value: 1_800 },
              active: { status: "available", evidenceRole: "measured", value: 1_800 },
              moving: { status: "available", evidenceRole: "measured", value: 1_800 },
            },
            distance: { status: "available", evidenceRole: "measured", value: 20_000 },
            intensity: {
              observed: {
                status: "available",
                evidenceRole: "measured",
                values: [
                  {
                    metric: "power",
                    unit: "watts",
                    magnitude: { kind: "point", value: 200 },
                  },
                ],
              },
            },
          },
        ],
      },
      common_load: {
        status: "available",
        method: "power_threshold",
      },
    });

    const parent = await buildActivityDerivedSummaryMap({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    expect(parent.get(input.id)).toMatchObject({
      common_load: {
        totalActivityCount: 2,
      },
      observationQuantification: {
        summary: { kind: "aggregate", memberSubjectIdentities: expect.any(Array) },
        members: [
          expect.objectContaining({ kind: "observation" }),
          expect.objectContaining({ kind: "observation" }),
        ],
      },
    });
    expect(parent.has(input.segments[0]?.id ?? "missing-segment")).toBe(true);
  });

  it("aggregates one segment's common Load into its parent", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const analysisStore = store() as never;

    const [_part] = await buildActivitySegmentDerivedSummaries({
      store: analysisStore,
      profileId: PROFILE_ID,
      activities: [input],
    });
    const parent = await buildActivityDerivedSummaryMap({
      store: analysisStore,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(parent.get(input.id)).toMatchObject({
      common_load: {
        totalActivityCount: 1,
        contributingActivityCount: 1,
      },
    });

    const incompatible = {
      ...input,
      materializer_version: "activity-segments-v2",
      segments: input.segments.map((item) => ({
        ...item,
        materializer_version: "activity-segments-v1",
      })),
    };
    await expect(
      buildActivitySegmentDerivedSummaries({
        store: analysisStore,
        profileId: PROFILE_ID,
        activities: [incompatible],
      }),
    ).rejects.toThrow("Persisted activity segment version identity is incompatible");
  });

  it("keeps completed load on the captured published target after calibration changes", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const capturedTargets = buildPerformanceTargetFactsFixture({
      athleteId: PROFILE_ID,
      asOf: input.started_at.toISOString(),
      bikeThresholdWatts: 250,
    });
    const changedStore = store();
    changedStore.getPerformanceTargetsAsOf.mockImplementation(async ({ asOf }) =>
      buildPerformanceTargetFactsFixture({
        athleteId: PROFILE_ID,
        asOf: asOf.toISOString(),
        bikeThresholdWatts: 400,
      }),
    );

    const [frozen] = await buildActivitySegmentDerivedSummaries({
      store: changedStore,
      profileId: PROFILE_ID,
      activities: [
        {
          ...input,
          performance_target_snapshot: {
            contractVersion: COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
            capturedAt: input.finished_at.toISOString(),
            publishedRevision: 7,
            publicationStatus: "available",
            targets: capturedTargets,
          },
        },
      ],
    });
    const [driftingWithoutSnapshot] = await buildActivitySegmentDerivedSummaries({
      store: changedStore,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(frozen?.common_load).toMatchObject({ status: "available", method: "power_threshold" });
    expect(frozen?.common_load).not.toEqual(driftingWithoutSnapshot?.common_load);
  });

  it("preserves compatible segment common Load in the parent aggregate", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 1_200_000),
      segment("22222222-2222-4222-8222-222222222222", 1, "bike", 1_200_000, 3_600_000),
    ]);

    const parts = await buildActivitySegmentDerivedSummaries({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    const parent = await buildActivityDerivedSummaryMap({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(parent.get(input.id)).toMatchObject({
      common_load: {
        status: "complete",
        totalActivityCount: 2,
        contributingActivityCount: 2,
      },
    });
    expect(parts.map((part) => part.common_load)).toEqual([
      expect.objectContaining({ status: "available", load: expect.any(Number) }),
      expect.objectContaining({ status: "available", load: expect.any(Number) }),
    ]);
  });

  it("groups segment summaries by parent without mixing multiple activities", async () => {
    const first = activity(
      [
        segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 1_200_000),
        segment("22222222-2222-4222-8222-222222222222", 1, "bike", 1_200_000, 2_400_000),
      ],
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const second = activity(
      [
        segment("33333333-3333-4333-8333-333333333333", 0, "run", 0, 600_000),
        segment("44444444-4444-4444-8444-444444444444", 1, "run", 600_000, 1_200_000),
      ],
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );

    const summaries = await buildActivityDerivedSummaryMap({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [first, second],
    });

    expect(summaries.get(first.id)).toMatchObject({
      common_load: { totalActivityCount: 2 },
      observationQuantification: { summary: { kind: "aggregate" } },
    });
    expect(summaries.get(second.id)).toMatchObject({
      common_load: { totalActivityCount: 2 },
      observationQuantification: { summary: { kind: "aggregate" } },
    });
    expect(summaries.size).toBe(6);
  });

  it("loads one bounded evidence batch for multiple activity calibrations", async () => {
    const first = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const second = activity(
      [segment("22222222-2222-4222-8222-222222222222", 0, "bike", 0, 3_600_000)],
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      new Date("2026-07-02T08:00:00.000Z"),
    );
    const analysisStore = store();
    await buildActivitySegmentDerivedSummaries({
      store: analysisStore,
      profileId: PROFILE_ID,
      activities: [first, second],
    });
    expect(analysisStore.loadContextEvidence).toHaveBeenCalledTimes(1);
    expect(analysisStore.loadContextEvidence).toHaveBeenCalledWith({
      requests: expect.arrayContaining([
        expect.objectContaining({ asOf: first.started_at, profileId: PROFILE_ID }),
        expect.objectContaining({ asOf: second.started_at, profileId: PROFILE_ID }),
      ]),
    });
  });

  it("loads canonical performance targets once for a segment batch", async () => {
    const first = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const second = activity(
      [segment("22222222-2222-4222-8222-222222222222", 0, "bike", 0, 3_600_000)],
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      new Date("2026-07-02T08:00:00.000Z"),
    );
    const fallbackStore = store();
    const getPerformanceTargetsForRequests = vi.fn(
      async ({ requests }: { requests: Array<{ asOf: Date }> }) =>
        requests.map((request) =>
          buildPerformanceTargetFactsFixture({
            athleteId: PROFILE_ID,
            asOf: request.asOf.toISOString(),
            bikeThresholdWatts: 250,
          }),
        ),
    );
    await buildActivitySegmentDerivedSummaries({
      store: { ...fallbackStore, getPerformanceTargetsForRequests },
      profileId: PROFILE_ID,
      activities: [first, second],
    });

    expect(getPerformanceTargetsForRequests).toHaveBeenCalledTimes(1);
    expect(getPerformanceTargetsForRequests.mock.calls[0]?.[0].requests).toHaveLength(2);
    expect(fallbackStore.getPerformanceTargetsAsOf).not.toHaveBeenCalled();
  });

  it("keeps context-evidence queries small while retaining older valid evidence", async () => {
    const calculationAsOf = new Date("2026-08-01T12:00:00.000Z");
    const input = activity(
      Array.from({ length: 526 }, (_, index) =>
        segment(`segment-${index}`, index, "bike", index * 60_000, (index + 1) * 60_000),
      ),
    );
    const analysisStore = store();

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: analysisStore,
      profileId: PROFILE_ID,
      activities: [input],
      computedAsOf: calculationAsOf,
    });

    expect(analysisStore.loadContextEvidence).toHaveBeenCalledTimes(17);
    expect(
      analysisStore.loadContextEvidence.mock.calls.every(([batch]) => batch.requests.length <= 32),
    ).toBe(true);
    const requests = analysisStore.loadContextEvidence.mock.calls.flatMap(
      ([batch]) => batch.requests,
    );
    expect(requests).toHaveLength(526);
    expect(new Set(requests.map(contextRequestKeyForTest)).size).toBe(526);
    expect(
      requests.every(
        (request) =>
          request.activityIdToExclude === input.id &&
          request.effortLookbackAsOf?.toISOString() === request.asOf.toISOString(),
      ),
    ).toBe(true);
    expect(summaries).toHaveLength(526);
    expect(summaries.every((summary) => summary.common_load.status === "available")).toBe(true);
    expect(
      summaries.every((summary) => summary.computed_as_of === calculationAsOf.toISOString()),
    ).toBe(true);
    expect(summaries.at(-1)?.common_load).toMatchObject({
      status: "available",
      thresholdEvidence: {
        sourceFingerprint: "bike-threshold-test-fixture:bike-evaluation-test-fixture",
      },
    });
  }, 15_000);

  it("rejects duplicate calibration request keys before reading evidence", async () => {
    const input = activity([
      segment("duplicate-a", 0, "bike", 0, 60_000),
      segment("duplicate-b", 1, "bike", 0, 60_000),
    ]);
    const analysisStore = store();

    await expect(
      buildActivitySegmentDerivedSummaries({
        store: analysisStore,
        profileId: PROFILE_ID,
        activities: [input],
      }),
    ).rejects.toThrow(/Duplicate activity analysis context request/);
    expect(analysisStore.loadContextEvidence).not.toHaveBeenCalled();
  });

  it("resolves each segment at its own start while retaining one bounded evidence batch", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 1_800_000),
      segment("22222222-2222-4222-8222-222222222222", 1, "bike", 1_800_000, 3_600_000),
    ]);
    const analysisStore = store();
    analysisStore.getPerformanceTargetsAsOf.mockImplementation(async ({ asOf }) =>
      asOf >= new Date("2026-07-01T08:30:00.000Z")
        ? buildPerformanceTargetFactsFixture({
            athleteId: PROFILE_ID,
            asOf: asOf.toISOString(),
            bikeThresholdWatts: 250,
          })
        : unavailableTargets(asOf),
    );
    analysisStore.loadContextEvidence.mockResolvedValueOnce(
      new Map([
        [
          PROFILE_ID,
          {
            profile: { dob: null, gender: null },
            profileMetrics: [],
            recentEfforts: [
              {
                id: "between-segment-threshold",
                activity_id: "prior-threshold-ride",
                activity_category: "bike",
                duration_seconds: 1200,
                effort_type: "power",
                recorded_at: new Date("2026-07-01T08:15:00.000Z"),
                unit: "watts",
                value: 250 / 0.95,
                source: "imported",
                method: "activity_file_best_effort",
                provenance: {
                  activity_id: "prior-threshold-ride",
                  derived_from: "activity_file_stream",
                },
              },
            ],
          },
        ],
      ]),
    );

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: analysisStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summaries.map((summary) => summary.common_load?.status)).toEqual([
      "unavailable",
      "available",
    ]);
    expect(analysisStore.loadContextEvidence).toHaveBeenCalledTimes(1);
    expect(analysisStore.loadContextEvidence).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({ asOf: new Date("2026-07-01T08:00:00.000Z") }),
        expect.objectContaining({ asOf: new Date("2026-07-01T08:30:00.000Z") }),
      ],
    });
  });

  it("does not treat an old evidence sentinel as threshold authority", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const truncatedStore = store();
    truncatedStore.getPerformanceTargetsAsOf.mockImplementation(async ({ asOf }) =>
      unavailableTargets(asOf, "evidence_read_truncated"),
    );
    truncatedStore.loadContextEvidence.mockResolvedValueOnce(
      new Map([
        [
          PROFILE_ID,
          {
            calibrationTruncated: true,
            profile: { dob: null, gender: null },
            profileMetrics: [],
            recentEfforts: [
              {
                id: "otherwise-eligible-effort",
                activity_id: "prior-threshold-ride",
                activity_category: "bike",
                duration_seconds: 1200,
                effort_type: "power",
                recorded_at: new Date("2026-06-01T00:00:00.000Z"),
                unit: "watts",
                value: 250 / 0.95,
                source: "imported",
                method: "activity_file_best_effort",
                provenance: {
                  activity_id: "prior-threshold-ride",
                  derived_from: "activity_file_stream",
                },
              },
            ],
          },
        ],
      ]),
    );

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: truncatedStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summary).toMatchObject({
      common_load: { status: "unavailable", reason: "threshold_missing" },
      observationQuantification: {
        members: [
          {
            kind: "observation",
            commonLoad: { status: "unavailable", reason: "threshold_missing" },
          },
        ],
      },
    });
  });

  it("does not translate bulk reader overflow into canonical threshold facts", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const overflowStore = store();
    overflowStore.getPerformanceTargetsAsOf.mockImplementation(async ({ asOf }) =>
      unavailableTargets(asOf, "evidence_read_truncated"),
    );
    overflowStore.loadContextEvidence.mockResolvedValueOnce(new Map());

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: overflowStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summary?.common_load).toMatchObject({
      status: "unavailable",
      reason: "threshold_missing",
    });
  });

  it("keeps a stale canonical threshold usable and visibly stale", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const staleStore = {
      getPerformanceTargetsAsOf: vi.fn(async ({ asOf }: { asOf: Date }) =>
        (() => {
          const effectiveAt = new Date(asOf.getTime() - 91 * 86_400_000).toISOString();
          return buildPerformanceTargetFactsFixture({
            athleteId: PROFILE_ID,
            asOf: asOf.toISOString(),
            thresholdEffectiveAt: effectiveAt,
            bikeThresholdWatts: 250,
          });
        })(),
      ),
      loadContextEvidence: vi.fn(
        async () =>
          new Map([
            [
              PROFILE_ID,
              {
                profile: { dob: null, gender: null },
                profileMetrics: [],
                recentEfforts: [],
              },
            ],
          ]),
      ),
    };

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: staleStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summary?.common_load).toMatchObject({
      status: "available",
      thresholdEvidence: { freshness: "stale" },
      quality: { stale: true },
    });
  });

  it("does not let stale HR calibration relabel a missing performance target", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const mixedStore = {
      getPerformanceTargetsAsOf: vi.fn(async ({ asOf }: { asOf: Date }) =>
        unavailableTargets(asOf),
      ),
      loadContextEvidence: vi.fn(
        async () =>
          new Map([
            [
              PROFILE_ID,
              {
                profile: { dob: null, gender: null },
                profileMetrics: [
                  {
                    id: "stale-bike-lthr",
                    metric_type: "lthr",
                    recorded_at: new Date("2026-01-01T00:00:00.000Z"),
                    unit: "bpm",
                    value: 165,
                    source: "derived",
                    method: "activity_file_lthr_detection",
                    calculation_version: "activity-file-lthr-v1",
                    reference_activity_id: "prior-bike",
                    reference_activity_category: "bike",
                    provenance: {
                      activity_id: "prior-bike",
                      derived_from: "activity_file_stream",
                    },
                  },
                ],
                recentEfforts: [],
              },
            ],
          ]),
      ),
    };

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: mixedStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summary?.common_load).toMatchObject({
      status: "unavailable",
      method: "power_threshold",
      reason: "threshold_missing",
    });
  });

  it("builds a complete multi-activity dynamic stress series by activity date", async () => {
    const first = activity(
      [segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 1_800_000)],
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      new Date("2026-07-01T08:00:00.000Z"),
    );
    const second = activity(
      [segment("22222222-2222-4222-8222-222222222222", 0, "bike", 0, 3_600_000)],
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      new Date("2026-07-02T08:00:00.000Z"),
    );

    const series = await buildDynamicStressSeries({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [first, second],
    });

    expect(series.complete).toBe(true);
    expect(series.seriesIdentity).not.toBeNull();
    expect(series.byActivityId.has(first.id)).toBe(true);
    expect(series.byActivityId.has(second.id)).toBe(true);
    expect([...series.byDate.entries()]).toEqual([
      [
        "2026-07-01",
        series.segmentSummaries[0]?.common_load && "load" in series.segmentSummaries[0].common_load
          ? series.segmentSummaries[0].common_load.load
          : null,
      ],
      [
        "2026-07-02",
        series.segmentSummaries[1]?.common_load && "load" in series.segmentSummaries[1].common_load
          ? series.segmentSummaries[1].common_load.load
          : null,
      ],
    ]);
  });

  it("does not use an effort from the activity interval to score that activity", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const analysisStore = selfCalibratingStore();

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: analysisStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(analysisStore.loadContextEvidence).toHaveBeenCalledWith({
      requests: [
        {
          asOf: input.started_at,
          effortLookbackAsOf: input.started_at,
          profileId: PROFILE_ID,
          activityIdToExclude: input.id,
        },
      ],
    });
    expect(summaries[0]).toMatchObject({
      common_load: {
        status: "unavailable",
        reason: "threshold_missing",
      },
    });
    expect(summaries[0]?.common_load).toMatchObject({ status: "unavailable" });
  });

  it("uses corrected active-duration swim speed for threshold-backed Load", async () => {
    const activityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const segmentId = "11111111-1111-4111-8111-111111111111";
    const activeSeconds = 3_622;
    const elapsedSeconds = 4_629;
    const distanceMeters = 3_050;
    const correctedAverageSpeed = distanceMeters / activeSeconds;
    const sparseRecordAverageSpeed = 0.8830737704918031;
    const input = {
      id: activityId,
      profile_id: PROFILE_ID,
      started_at: new Date("2026-07-01T08:00:00.000Z"),
      finished_at: new Date("2026-07-01T09:17:09.000Z"),
      elapsed_ms: elapsedSeconds * 1_000,
      active_ms: null,
      moving_ms: null,
      timing_coverage: "partial" as const,
      distance_meters: distanceMeters,
      avg_heart_rate: null,
      max_heart_rate: null,
      segments: [
        {
          id: segmentId,
          activity_id: activityId,
          ordinal: 0,
          role: "activity" as const,
          activity_category: "swim" as const,
          start_offset_ms: 0,
          end_offset_ms: elapsedSeconds * 1_000,
          source_artifact_id: null,
          source_session_index: 0,
          source_message_index: null,
          raw_type_string: null,
          raw_type_integer: null,
          raw_sport_string: "swimming",
          raw_sport_integer: null,
          raw_sub_sport_string: null,
          raw_sub_sport_integer: null,
          timing_coverage: "partial" as const,
          active_ms: activeSeconds * 1_000,
          moving_ms: null,
          summary: {
            version: 1,
            timing: { timingCoverage: "partial" as const, activeMs: activeSeconds * 1_000 },
            distanceMeters,
            averageSpeedMetersPerSecond: correctedAverageSpeed,
            normalizedSpeedMetersPerSecond: distanceMeters / elapsedSeconds,
            normalizedPowerResult: unavailableNormalizedPowerResult,
          },
        },
      ],
    };
    const analysisStore = {
      getPerformanceTargetsAsOf: vi.fn(async ({ asOf }: { asOf: Date }) =>
        buildPerformanceTargetFactsFixture({
          athleteId: PROFILE_ID,
          asOf: asOf.toISOString(),
          swimThresholdMetersPerSecond: 1,
        }),
      ),
      loadContextEvidence: vi.fn(
        async () =>
          new Map([
            [
              PROFILE_ID,
              {
                profile: { dob: null, gender: null },
                profileMetrics: [],
                recentEfforts: [],
              },
            ],
          ]),
      ),
    };

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: analysisStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    const expectedLoad = (activeSeconds / 3_600) * correctedAverageSpeed ** 2 * 100;
    const sparseRecordLoad = (activeSeconds / 3_600) * sparseRecordAverageSpeed ** 2 * 100;

    expect(summary).toMatchObject({
      common_load: {
        status: "partial",
        method: "swim_pace_threshold",
        contributingDurationSeconds: activeSeconds,
        reason: "duration_partial",
      },
      observationQuantification: {
        members: [
          {
            duration: {
              elapsed: { status: "available", value: elapsedSeconds },
              active: { status: "partial", value: activeSeconds, reason: "source_incomplete" },
              moving: { status: "unavailable", value: null, reason: "source_missing" },
            },
            distance: { status: "available", value: distanceMeters },
          },
        ],
      },
    });
    const commonLoad = summary?.common_load;
    if (
      commonLoad?.status !== "partial" ||
      commonLoad.load === null ||
      commonLoad.intensity === null
    ) {
      throw new Error("Expected corrected swim Load to remain numeric partial evidence");
    }
    expect(commonLoad.intensity).toBeCloseTo(correctedAverageSpeed);
    expect(commonLoad.load).toBeCloseTo(expectedLoad);
    expect(commonLoad.load).toBeLessThan(sparseRecordLoad);
  });

  it.each([
    {
      name: "full",
      distribution: heartRateEvidence(3600, [
        { bpm: 110, seconds: 1800 },
        { bpm: 150, seconds: 1800 },
      ]),
      expected: { status: "available", contributingDurationSeconds: 3600 },
    },
    {
      name: "partial",
      distribution: heartRateEvidence(1800, [{ bpm: 150, seconds: 1800 }]),
      expected: {
        status: "unavailable",
        contributingDurationSeconds: 1800,
        eligibleDurationSeconds: 3600,
        sourceTimeCoverage: 0.5,
        reason: "insufficient_coverage",
      },
    },
  ])("completed activity Load uses a newer lower activity-category LTHR and matching evidence identity ($name)", async ({
    distribution,
    expected,
  }) => {
    const input = activity([
      segment("22222222-2222-4222-8222-222222222222", 0, "run", 0, 3_600_000, distribution),
    ]);

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: heartRateStore() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summaries[0]).toMatchObject({
      common_load: {
        ...expected,
        method: "heart_rate_zones",
        evidenceFingerprint: expect.stringMatching(/^activity-common-load:v1:/),
        thresholdEvidence: {
          observedAt: "2026-06-15T10:30:00.000Z",
          validAt: "2026-06-15T10:30:00.000Z",
          sourceFingerprint: "run-lthr-evidence",
        },
      },
    });
  });

  it("uses versioned HR evidence duration when a Wahoo-style active summary differs", async () => {
    const distribution: HeartRateDurationEvidence = {
      status: "available",
      calculationVersion: "heart-rate-zone-duration-v1",
      coverageSeconds: 1_800,
      eligibleDurationSeconds: 1_800,
      sourceTimeCoverage: 1,
      timeWeightedAverageBpm: 150,
      buckets: [{ bpm: 150, seconds: 1_800 }],
      diagnostics: {
        sourceSampleCount: 1_801,
        acceptedTimestampCount: 1_801,
        contributingIntervalCount: 1_800,
        observedSpanSeconds: 1_800,
        pausedDurationSeconds: 0,
        excludedGapDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
        excludedInvalidDurationSeconds: 0,
        duplicateTimestampCount: 0,
        reversedTimestampCount: 0,
        invalidTimestampCount: 0,
      },
    };
    const input = activity([
      segment("22222222-2222-4222-8222-222222222222", 0, "run", 0, 3_600_000, distribution),
    ]);
    const inputSegment = input.segments[0];
    if (!inputSegment) throw new Error("Expected a test segment");
    inputSegment.active_ms = 2_400_000;
    inputSegment.summary.timing = {
      timingCoverage: "complete",
      activeMs: 2_400_000,
      movingMs: 2_400_000,
    };

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: heartRateStore() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summary?.common_load).toMatchObject({
      status: "available",
      method: "heart_rate_zones",
      contributingDurationSeconds: 1_800,
      load: 50,
      intensity: 1,
    });
  });

  it("uses bounded versioned HR intervals when provider active timing is unavailable", async () => {
    const distribution: HeartRateDurationEvidence = {
      status: "partial",
      reason: "source_incomplete",
      calculationVersion: "heart-rate-zone-duration-v1",
      coverageSeconds: 3_717,
      eligibleDurationSeconds: 3_720,
      sourceTimeCoverage: 3_717 / 3_720,
      timeWeightedAverageBpm: 150,
      buckets: [{ bpm: 150, seconds: 3_717 }],
      diagnostics: {
        sourceSampleCount: 3_721,
        acceptedTimestampCount: 3_721,
        contributingIntervalCount: 3_717,
        observedSpanSeconds: 3_720,
        pausedDurationSeconds: 0,
        excludedGapDurationSeconds: 0,
        excludedMissingDurationSeconds: 3,
        excludedInvalidDurationSeconds: 0,
        duplicateTimestampCount: 0,
        reversedTimestampCount: 0,
        invalidTimestampCount: 0,
      },
    };
    const unavailable = {
      ...segment("22222222-2222-4222-8222-222222222222", 0, "run", 0, 3_720_000, distribution),
      timing_coverage: "unavailable",
      active_ms: null,
      moving_ms: null,
      summary: {
        ...segment("22222222-2222-4222-8222-222222222222", 0, "run", 0, 3_720_000, distribution)
          .summary,
        timing: { timingCoverage: "unavailable" },
      },
    } as unknown as ReturnType<typeof segment>;

    const analysisActivity = buildCompletedSegmentAnalysisActivity({
      activityStartedAt: new Date("2026-07-01T08:00:00.000Z"),
      segment: unavailable,
      summary: completedSegmentSummarySchema.parse(unavailable.summary),
    });
    expect(analysisActivity).toMatchObject({
      duration_seconds: 3_720,
      moving_seconds: null,
      timing_coverage: "unavailable",
    });

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: heartRateStore({ runThresholdMetersPerSecond: 1_000 / 300 }) as never,
      profileId: PROFILE_ID,
      activities: [activity([unavailable])],
    });

    expect(summary?.common_load).toMatchObject({
      status: "partial",
      method: "heart_rate_zones",
      contributingDurationSeconds: 3_717,
      eligibleDurationSeconds: 3_720,
      sourceTimeCoverage: 3_717 / 3_720,
      load: 103.25,
      intensity: 1,
      reason: "activity_data_partial",
    });
  });

  it("keeps duration unavailable when versioned HR evidence has no contributing intervals", async () => {
    const distribution: HeartRateDurationEvidence = {
      status: "unavailable",
      reason: "no_contributing_intervals",
      calculationVersion: "heart-rate-zone-duration-v1",
      coverageSeconds: 0,
      eligibleDurationSeconds: 60,
      sourceTimeCoverage: 0,
      timeWeightedAverageBpm: null,
      buckets: [],
      diagnostics: {
        sourceSampleCount: 61,
        acceptedTimestampCount: 61,
        contributingIntervalCount: 0,
        observedSpanSeconds: 60,
        pausedDurationSeconds: 0,
        excludedGapDurationSeconds: 0,
        excludedMissingDurationSeconds: 60,
        excludedInvalidDurationSeconds: 0,
        duplicateTimestampCount: 0,
        reversedTimestampCount: 0,
        invalidTimestampCount: 0,
      },
    };
    const source = segment(
      "22222222-2222-4222-8222-222222222222",
      0,
      "run",
      0,
      60_000,
      distribution,
    );
    const unavailable = {
      ...source,
      timing_coverage: "unavailable",
      active_ms: null,
      moving_ms: null,
      summary: { ...source.summary, timing: { timingCoverage: "unavailable" } },
    } as unknown as ReturnType<typeof segment>;

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: heartRateStore() as never,
      profileId: PROFILE_ID,
      activities: [activity([unavailable])],
    });

    expect(summary?.common_load).toMatchObject({
      status: "unavailable",
      method: null,
      contributingDurationSeconds: null,
      reason: "duration_missing",
    });
  });

  it("does not let HR-derived duration authorize direct power Load", async () => {
    const distribution: HeartRateDurationEvidence = {
      status: "available",
      calculationVersion: "heart-rate-zone-duration-v1",
      coverageSeconds: 60,
      eligibleDurationSeconds: 60,
      sourceTimeCoverage: 1,
      timeWeightedAverageBpm: 150,
      buckets: [{ bpm: 150, seconds: 60 }],
      diagnostics: {
        sourceSampleCount: 61,
        acceptedTimestampCount: 61,
        contributingIntervalCount: 60,
        observedSpanSeconds: 60,
        pausedDurationSeconds: 0,
        excludedGapDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
        excludedInvalidDurationSeconds: 0,
        duplicateTimestampCount: 0,
        reversedTimestampCount: 0,
        invalidTimestampCount: 0,
      },
    };
    const source = segment(
      "22222222-2222-4222-8222-222222222222",
      0,
      "bike",
      0,
      60_000,
      distribution,
    );
    const unavailable = {
      ...source,
      timing_coverage: "unavailable",
      active_ms: null,
      moving_ms: null,
      summary: { ...source.summary, timing: { timingCoverage: "unavailable" } },
    } as unknown as ReturnType<typeof segment>;

    const [summary] = await buildActivitySegmentDerivedSummaries({
      store: heartRateStore({
        lthrCategory: "bike",
        bikeThresholdWatts: 250,
      }) as never,
      profileId: PROFILE_ID,
      activities: [activity([unavailable])],
    });

    expect(summary?.common_load).toMatchObject({
      status: "available",
      method: "heart_rate_zones",
      contributingDurationSeconds: 60,
      intensity: 1,
    });
  });

  it("bulk completed-activity swim Load uses canonical threshold facts and rejects missing facts", async () => {
    const input = activity([
      segment("22222222-2222-4222-8222-222222222222", 0, "swim", 0, 3_600_000),
    ]);

    const [accepted] = await buildActivitySegmentDerivedSummaries({
      store: swimThresholdStore() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    expect(accepted).toMatchObject({
      common_load: { status: "available", method: "swim_pace_threshold" },
    });

    const [generic] = await buildActivitySegmentDerivedSummaries({
      store: swimThresholdStore(false) as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    expect(generic).toMatchObject({
      common_load: { status: "unavailable", reason: "threshold_missing" },
    });
  });

  it("does not synthesize a removed Critical Power fallback for the load stream", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: criticalPowerStore() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summaries[0]).toMatchObject({
      common_load: { status: "unavailable", reason: "threshold_missing" },
      load_stream_key: null,
    });
  });

  it("uses start-time evidence with a snapshot-only analysis store", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);
    const analysisStore = selfCalibratingFallbackStore();

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: analysisStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(analysisStore.getContextSnapshot).toHaveBeenCalledWith({
      asOf: input.started_at,
      effortLookbackAsOf: input.started_at,
      profileId: PROFILE_ID,
      activityIdToExclude: input.id,
    });
    expect(summaries[0]).toMatchObject({
      common_load: { status: "unavailable", reason: "threshold_missing" },
    });
  });

  it("keeps snapshot-only evidence distinct when activities share a finish time", async () => {
    const firstId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const finish = new Date("2026-07-01T09:00:00.000Z");
    const makeInput = (id: string, start: Date, segmentId: string) => {
      const input = activity([
        segment(segmentId, 0, "bike", 0, finish.getTime() - start.getTime()),
      ]);
      return {
        ...input,
        id,
        started_at: start,
        finished_at: finish,
        elapsed_ms: finish.getTime() - start.getTime(),
        active_ms: finish.getTime() - start.getTime(),
        moving_ms: finish.getTime() - start.getTime(),
        segments: input.segments.map((item) => ({ ...item, activity_id: id })),
      };
    };
    const first = makeInput(
      firstId,
      new Date("2026-07-01T07:00:00.000Z"),
      "11111111-1111-4111-8111-111111111111",
    );
    const second = makeInput(
      secondId,
      new Date("2026-07-01T08:00:00.000Z"),
      "22222222-2222-4222-8222-222222222222",
    );
    const analysisStore = {
      getContextSnapshot: vi.fn(async ({ effortLookbackAsOf }: { effortLookbackAsOf?: Date }) => ({
        profile: { dob: null, gender: null },
        profileMetrics: [],
        recentEfforts:
          effortLookbackAsOf?.toISOString() === first.started_at.toISOString()
            ? [
                {
                  activity_id: "prior-threshold-ride",
                  activity_category: "bike" as const,
                  duration_seconds: 1200,
                  effort_type: "power" as const,
                  value: 250 / 0.95,
                  unit: "watts",
                  recorded_at: new Date("2026-06-01T00:00:00.000Z"),
                  source: "imported" as const,
                  method: "activity_file_best_effort",
                  provenance: {
                    activity_id: "prior-threshold-ride",
                    derived_from: "activity_file_stream",
                  },
                },
              ]
            : [],
      })),
    };

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: analysisStore as never,
      profileId: PROFILE_ID,
      activities: [first, second],
    });

    expect(summaries.find((item) => item.activity_id === firstId)).toMatchObject({
      common_load: { status: "unavailable", reason: "threshold_missing" },
    });
    expect(summaries.find((item) => item.activity_id === secondId)).toMatchObject({
      common_load: { status: "unavailable", reason: "threshold_missing" },
    });
  });
  it.each([
    { category: "strength" as const, commonReason: "unsupported_modality" },
    { category: "other" as const, commonReason: "unsupported_modality" },
    { category: "bike" as const, commonReason: "duration_missing" },
    { category: "run" as const, commonReason: "duration_missing" },
    { category: "swim" as const, commonReason: "duration_missing" },
  ])("uses $commonReason before thresholds when $category timing is unavailable", async ({
    category,
    commonReason,
  }) => {
    const unavailable = {
      ...segment("11111111-1111-4111-8111-111111111111", 0, category, 0, 60_000),
      summary: {
        version: 1,
        timing: { timingCoverage: "unavailable" },
        normalizedPowerResult: unavailableNormalizedPowerResult,
      },
      timing_coverage: "unavailable",
      active_ms: null,
      moving_ms: null,
    } as unknown as ReturnType<typeof segment>;
    const [result] = await buildActivitySegmentDerivedSummaries({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [activity([unavailable])],
    });
    expect(result).toMatchObject({
      common_load: { status: "unavailable", reason: commonReason },
    });
  });

  it("does not load or inject effective session-RPE into canonical analysis", async () => {
    const rpeOnlySegment = segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000);
    const input = activity([
      {
        ...rpeOnlySegment,
        summary: {
          ...rpeOnlySegment.summary,
          averagePowerWatts: undefined,
          normalizedPowerResult: unavailableNormalizedPowerResult,
          averageHeartRateBpm: 150,
          heartRateDistribution: undefined,
        },
      },
    ]);
    const analysisStore = {
      getContextSnapshot: vi.fn(async () => ({
        profile: { dob: null, gender: null },
        profileMetrics: [],
        recentEfforts: [],
      })),
      loadEffectiveSessionRpeEvidence: vi.fn(
        async () =>
          new Map([
            [
              input.id,
              {
                activityId: input.id,
                recordedAt: new Date("2026-07-01T10:00:00.000Z"),
                rpe: 7,
                scale: "borg_cr10" as const,
                scaleVersion: "1" as const,
                source: "user" as const,
                provenanceFingerprint: "effective-rpe",
              },
            ],
          ]),
      ),
    };

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: analysisStore as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(analysisStore.loadEffectiveSessionRpeEvidence).not.toHaveBeenCalled();
    expect(summaries[0]).toMatchObject({
      common_load: {
        status: "unavailable",
        method: "heart_rate_zones",
        reason: "threshold_missing",
      },
    });
  });

  it("uses a selected current-segment analysis revision before the immutable original snapshot", async () => {
    const startedAt = new Date("2026-07-01T08:00:00.000Z");
    const selectedTargets = buildPerformanceTargetFactsFixture({
      athleteId: PROFILE_ID,
      asOf: startedAt.toISOString(),
      bikeThresholdWatts: 250,
    });
    const input = {
      ...activity([segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000)]),
      started_at: startedAt,
      segments_revision: 1,
      performance_target_snapshot: {
        contractVersion: COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
        capturedAt: startedAt.toISOString(),
        publishedRevision: null,
        publicationStatus: "unavailable" as const,
        targets: unavailableTargets(startedAt),
      },
    };
    const getPerformanceTargetsAsOf = vi.fn(async () => unavailableTargets(startedAt));

    const [result] = await buildActivitySegmentDerivedSummaries({
      store: {
        ...store(),
        getPerformanceTargetsAsOf,
        getPerformanceTargetSelectionsForActivities: vi.fn(
          async () =>
            new Map([
              [
                input.id,
                {
                  activityId: input.id,
                  source: "analysis_revision" as const,
                  sourceSegmentsRevision: 1,
                  revision: 2,
                  performanceTargets: selectedTargets,
                },
              ],
            ]),
        ),
      },
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(result?.common_load.status).toBe("available");
    expect(getPerformanceTargetsAsOf).not.toHaveBeenCalled();
  });

  it("falls back to the immutable completion snapshot when no revision is selected", async () => {
    const startedAt = new Date("2026-07-01T08:00:00.000Z");
    const getPerformanceTargetsAsOf = vi.fn(async () =>
      buildPerformanceTargetFactsFixture({
        athleteId: PROFILE_ID,
        asOf: startedAt.toISOString(),
        bikeThresholdWatts: 250,
      }),
    );
    const input = {
      ...activity([segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000)]),
      started_at: startedAt,
      segments_revision: 1,
      performance_target_snapshot: {
        contractVersion: COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
        capturedAt: startedAt.toISOString(),
        publishedRevision: null,
        publicationStatus: "unavailable" as const,
        targets: unavailableTargets(startedAt),
      },
    };

    const [result] = await buildActivitySegmentDerivedSummaries({
      store: { ...store(), getPerformanceTargetsAsOf },
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(result).toMatchObject({
      common_load: { status: "unavailable", reason: "threshold_missing" },
    });
    expect(getPerformanceTargetsAsOf).not.toHaveBeenCalled();
  });
});
