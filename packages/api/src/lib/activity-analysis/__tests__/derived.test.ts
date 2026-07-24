import { describe, expect, it, vi } from "vitest";
import {
  buildActivityDerivedSummaryMap,
  buildActivitySegmentDerivedSummaries,
  deriveActivityParentClassification,
} from "../derived";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

function segment(
  id: string,
  ordinal: number,
  category: "bike" | "run",
  start: number,
  end: number,
  heartRateDistribution?: {
    coverageSeconds: number;
    buckets: Array<{ bpm: number; seconds: number }>;
  },
) {
  return {
    id,
    activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ordinal,
    role: "activity" as const,
    category,
    start_offset_ms: start,
    end_offset_ms: end,
    timing_coverage: "complete" as const,
    active_ms: end - start,
    moving_ms: end - start,
    summary: {
      version: 1,
      timing: { timingCoverage: "complete", activeMs: end - start, movingMs: end - start },
      distanceMeters: category === "bike" ? 20_000 : 5_000,
      averagePowerWatts: category === "bike" ? 200 : undefined,
      averageSpeedMetersPerSecond: category === "run" ? 3.5 : undefined,
      averageHeartRateBpm: heartRateDistribution ? 150 : undefined,
      heartRateDistribution,
    },
  };
}

function activity(segments: ReturnType<typeof segment>[]) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    profile_id: PROFILE_ID,
    started_at: new Date("2026-07-01T08:00:00.000Z"),
    finished_at: new Date("2026-07-01T09:00:00.000Z"),
    elapsed_ms: 3_600_000,
    active_ms: 3_600_000,
    moving_ms: 3_600_000,
    timing_coverage: "complete" as const,
    distance_meters: 25_000,
    avg_heart_rate: null,
    max_heart_rate: null,
    segments,
  };
}

function store() {
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
    ),
  };
}

function heartRateStore() {
  return {
    loadContextEvidence: vi.fn(
      async () =>
        new Map([
          [
            PROFILE_ID,
            {
              profile: { dob: null, gender: null },
              profileMetrics: [
                {
                  id: "run-lthr-evidence",
                  metric_type: "lthr",
                  recorded_at: new Date("2026-06-15T10:30:00.000Z"),
                  unit: "bpm",
                  value: 150,
                  source: "derived",
                  method: "activity_file_lthr_detection",
                  calculation_version: "lthr-detection-v1",
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
    calculation_version: "best-efforts-v1",
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
      category: null,
    });
  });

  it("publishes a multisport common-load parent without legacy TSS or IF", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 1_800_000),
      segment("22222222-2222-4222-8222-222222222222", 1, "run", 1_800_000, 3_600_000),
    ]);
    const segments = await buildActivitySegmentDerivedSummaries({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    expect(segments.map(({ category }) => category)).toEqual(["bike", "run"]);
    expect(segments[0]).toMatchObject({
      dedupe_key: `activity-segment:${input.id}:11111111-1111-4111-8111-111111111111:load:v1`,
      load_stream_key: "bike:power_threshold:activity_analysis:1",
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
      tss: null,
      tss_identity: null,
      intensity_factor: null,
      method: null,
      common_load: {
        totalActivityCount: 2,
      },
    });
    expect(parent.has(input.segments[0]?.id ?? "missing-segment")).toBe(true);
  });

  it("preserves one segment's legacy TSS evidence while aggregating its common load", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);

    const [part] = await buildActivitySegmentDerivedSummaries({
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
      tss: part?.tss,
      tss_identity: part?.tss_identity,
      intensity_factor: part?.intensity_factor,
      method: part?.method,
      unavailable_reason: part?.unavailable_reason,
      calibration_quality: part?.calibration_quality,
      common_load: {
        totalActivityCount: 1,
        contributingActivityCount: 1,
      },
    });
  });

  it("publishes summed TSS and duration-weighted RMS IF for compatible segments", async () => {
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
      tss: parts.reduce((total, part) => total + (part.tss ?? 0), 0),
      tss_identity: parts[0]?.tss_identity,
      intensity_factor: expect.any(Number),
      method: "power_threshold",
      unavailable_reason: null,
      common_load: {
        status: "complete",
        totalActivityCount: 2,
        contributingActivityCount: 2,
      },
    });
    expect(parent.get(input.id)?.intensity_factor).toBeCloseTo(
      Math.sqrt(
        (1_200 * (parts[0]?.intensity_factor ?? 0) ** 2 +
          2_400 * (parts[1]?.intensity_factor ?? 0) ** 2) /
          3_600,
      ),
      2,
    );
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
        },
      ],
    });
    expect(summaries[0]).toMatchObject({
      method: null,
      unavailable_reason: "threshold_missing",
      intensity_factor: null,
      calibration_quality: null,
      common_load: {
        status: "unavailable",
        reason: "threshold_missing",
      },
    });
    expect(summaries[0]?.tss).toBeNull();
  });

  it.each([
    {
      name: "full",
      distribution: {
        coverageSeconds: 3600,
        buckets: [
          { bpm: 110, seconds: 1800 },
          { bpm: 150, seconds: 1800 },
        ],
      },
      expected: { status: "available", contributingDurationSeconds: 3600 },
    },
    {
      name: "partial",
      distribution: {
        coverageSeconds: 1800,
        buckets: [{ bpm: 150, seconds: 1800 }],
      },
      expected: {
        status: "partial",
        contributingDurationSeconds: 1800,
        eligibleDurationSeconds: 3600,
        sourceTimeCoverage: 0.5,
        reason: "duration_partial",
      },
    },
  ])("derives $name HR-zone common load from the persisted segment summary", async ({
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
      tss: 100,
      intensity_factor: 1,
      method: "heart_rate_threshold",
      common_load: {
        ...expected,
        method: "heart_rate_zones",
        evidenceFingerprint: expect.stringMatching(/^activity-common-load:v1:/),
        thresholdEvidence: {
          observedAt: "2026-06-15T10:30:00.000Z",
          validAt: "2026-06-15T10:30:00.000Z",
          sourceFingerprint: expect.stringMatching(/^activity-metric:v1:sha256:/),
        },
      },
    });
  });

  it("keeps eligible FTP ahead of guarded Critical Power for the load stream", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
    ]);

    const summaries = await buildActivitySegmentDerivedSummaries({
      store: criticalPowerStore() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });

    expect(summaries[0]).toMatchObject({
      tss: 65,
      method: "power_threshold",
      tss_identity: {
        method: "power_threshold",
        calibration: { type: "ftp_watts", value: 249 },
      },
      calibration_quality: {
        calculation_version: "twenty_minute_effort_v1",
      },
      load_stream_key: "bike:power_threshold:activity_analysis:1",
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
    });
    expect(summaries[0]).toMatchObject({
      tss: null,
      method: null,
      unavailable_reason: "threshold_missing",
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
      method: "power_threshold",
      unavailable_reason: null,
    });
    expect(summaries.find((item) => item.activity_id === secondId)).toMatchObject({
      method: null,
      unavailable_reason: "threshold_missing",
    });
  });
  it("loads effective owned session-RPE through the analysis store as a fallback", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 3_600_000),
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

    expect(analysisStore.loadEffectiveSessionRpeEvidence).toHaveBeenCalledWith({
      activityIds: [input.id],
      profileId: PROFILE_ID,
    });
    expect(summaries[0]).toMatchObject({
      common_load: {
        status: "available",
        method: "session_rpe",
        load: 100,
        thresholdEvidence: null,
        estimated: true,
      },
    });
  });
});
