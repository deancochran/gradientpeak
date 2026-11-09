import { describe, expect, it } from "vitest";

import { activityPlanProjectionSchema, createActivityPlanProjection } from "../index";

function occurrence(input: {
  id: string;
  policy?: "time" | "distance" | "repetitions" | "untilFinished";
  weight?: number | null;
  values: unknown[];
  distance?: number | null;
  objectiveIntensity?:
    | { status: "available"; value: number; source: "direct_relative" | "athlete_calibrated" }
    | {
        status: "unavailable";
        value: null;
        reason: "no_objective_target" | "ambiguous_objective_targets" | "calibration_required";
      };
}) {
  const policy = input.policy ?? "time";
  return {
    occurrenceId: input.id,
    completionPolicy: policy,
    weight:
      input.weight === undefined
        ? policy === "time"
          ? 60
          : policy === "distance"
            ? 100
            : policy === "repetitions"
              ? 10
              : null
        : input.weight,
    objectiveIntensity: input.objectiveIntensity ?? {
      status: "unavailable" as const,
      value: null,
      reason: "no_objective_target" as const,
    },
    distance:
      input.distance === null
        ? null
        : input.distance === undefined
          ? policy === "distance"
            ? { value: 100, provenance: "authored" as const }
            : null
          : { value: input.distance, provenance: "derived" as const },
  };
}

describe("activity plan projection", () => {
  it("publishes only a completely covered objective ratio", () => {
    const complete = createActivityPlanProjection({
      revisionFingerprint: "revision-objective",
      occurrences: [
        occurrence({
          id: "one",
          weight: 60,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 4 },
            },
          ],
          objectiveIntensity: { status: "available", value: 0.6, source: "direct_relative" },
        }),
        occurrence({
          id: "two",
          weight: 120,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 6 },
            },
          ],
          objectiveIntensity: { status: "available", value: 0.9, source: "direct_relative" },
        }),
      ],
    });
    expect(complete.objectiveIntensity).toEqual({
      status: "available",
      value: 0.8,
      unit: "ratio",
      reason: null,
      completionPolicy: "time",
      weightingBasis: "duration_seconds",
      contributorCoverage: { contributing: 2, total: 2 },
      provenance: "plan_intent",
      basis: "compiled_occurrences",
    });

    const incomplete = createActivityPlanProjection({
      revisionFingerprint: "revision-objective-incomplete",
      occurrences: [
        occurrence({
          id: "one",
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 5 },
            },
          ],
          objectiveIntensity: { status: "available", value: 0.8, source: "direct_relative" },
        }),
        occurrence({
          id: "two",
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 5 },
            },
          ],
        }),
      ],
    });
    expect(incomplete.objectiveIntensity).toMatchObject({
      status: "unavailable",
      value: null,
      reason: "incomplete_objective_coverage",
      contributorCoverage: { contributing: 1, total: 2 },
    });
  });

  it("fails objective aggregation closed across completion bases", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-objective-mixed",
      occurrences: [
        occurrence({
          id: "time",
          policy: "time",
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 5 },
            },
          ],
          objectiveIntensity: { status: "available", value: 0.7, source: "direct_relative" },
        }),
        occurrence({
          id: "distance",
          policy: "distance",
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 5 },
            },
          ],
          objectiveIntensity: { status: "available", value: 0.8, source: "direct_relative" },
        }),
      ],
    });
    expect(projection.objectiveIntensity).toMatchObject({
      status: "unavailable",
      value: null,
      reason: "mixed_completion_bases",
    });
  });

  it("weights objective intensity by repetition count", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-objective-repetitions",
      occurrences: [
        occurrence({
          id: "one",
          policy: "repetitions",
          weight: 1,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 5 },
            },
          ],
          objectiveIntensity: { status: "available", value: 0.5, source: "direct_relative" },
        }),
        occurrence({
          id: "two",
          policy: "repetitions",
          weight: 3,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 5 },
            },
          ],
          objectiveIntensity: { status: "available", value: 0.9, source: "direct_relative" },
        }),
      ],
    });

    expect(projection.objectiveIntensity).toMatchObject({
      status: "available",
      value: 0.8,
      completionPolicy: "repetitions",
      weightingBasis: "repetition_count",
    });
  });

  it.each([
    ["open completion", "untilFinished", null, "open_completion"],
    ["invalid weight", "time", 0, "invalid_weight"],
  ] as const)("fails objective aggregation closed for %s", (_name, policy, weight, reason) => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: `revision-objective-${reason}`,
      occurrences: [
        occurrence({
          id: "one",
          policy,
          weight,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 5 },
            },
          ],
          objectiveIntensity: { status: "available", value: 0.8, source: "direct_relative" },
        }),
      ],
    });

    expect(projection.objectiveIntensity).toMatchObject({
      status: "unavailable",
      value: null,
      reason,
    });
  });

  it.each([
    [
      "RPE",
      { metric: "perceived_exertion", unit: "rpe_0_10", magnitude: { kind: "point", value: 6 } },
    ],
    [
      "FTP",
      {
        metric: "relative_threshold",
        reference: "ftp",
        unit: "percent",
        magnitude: { kind: "point", value: 80 },
      },
    ],
    ["power", { metric: "power", unit: "watts", magnitude: { kind: "point", value: 240 } }],
    [
      "heart rate",
      { metric: "heart_rate", unit: "beats_per_minute", magnitude: { kind: "point", value: 155 } },
    ],
    [
      "speed",
      { metric: "speed", unit: "kilometers_per_hour", magnitude: { kind: "point", value: 18 } },
    ],
    [
      "pace",
      { metric: "pace", unit: "seconds_per_kilometer", magnitude: { kind: "point", value: 240 } },
    ],
    [
      "cadence",
      {
        metric: "cadence",
        unit: "revolutions_per_minute",
        magnitude: { kind: "point", value: 90 },
      },
    ],
  ])("does not project a native %s target family", (_name, value) => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-1",
      occurrences: [occurrence({ id: "one", values: [value] })],
    });

    expect(projection).not.toHaveProperty("prescribedIntensity");
    expect(
      activityPlanProjectionSchema.safeParse({ ...projection, prescribedIntensity: [] }).success,
    ).toBe(false);
  });

  it("does not aggregate authored point/range targets into the plan projection", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-range",
      occurrences: [
        occurrence({
          id: "one",
          weight: 60,
          values: [
            {
              metric: "power",
              unit: "watts",
              magnitude: { kind: "range", lower: 180, upper: 220 },
            },
          ],
        }),
        occurrence({
          id: "two",
          weight: 60,
          values: [{ metric: "power", unit: "watts", magnitude: { kind: "point", value: 260 } }],
        }),
      ],
    });

    expect(projection).not.toHaveProperty("prescribedIntensity");
  });

  it("keeps authored native families out of the plan projection", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-families",
      occurrences: [
        occurrence({
          id: "one",
          values: [
            {
              metric: "relative_threshold",
              reference: "ftp",
              unit: "percent",
              magnitude: { kind: "point", value: 80 },
            },
            {
              metric: "relative_threshold",
              reference: "lthr",
              unit: "percent",
              magnitude: { kind: "point", value: 80 },
            },
            {
              metric: "speed",
              unit: "kilometers_per_hour",
              magnitude: { kind: "point", value: 15 },
            },
            {
              metric: "pace",
              unit: "seconds_per_kilometer",
              magnitude: { kind: "point", value: 240 },
            },
          ],
        }),
      ],
    });

    expect(projection).not.toHaveProperty("prescribedIntensity");
  });

  it("does not expose ambiguous same-family targets through the plan projection", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-ambiguous",
      occurrences: [
        occurrence({
          id: "one",
          values: [
            { metric: "power", unit: "watts", magnitude: { kind: "point", value: 200 } },
            { metric: "power", unit: "watts", magnitude: { kind: "point", value: 250 } },
          ],
        }),
      ],
    });

    expect(projection).not.toHaveProperty("prescribedIntensity");
  });

  it("retains occurrence completion policies without a native intensity aggregate", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-mixed",
      occurrences: [
        occurrence({
          id: "time",
          policy: "time",
          weight: 120,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 4 },
            },
          ],
        }),
        occurrence({
          id: "distance",
          policy: "distance",
          weight: 400,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 6 },
            },
          ],
        }),
        occurrence({
          id: "reps",
          policy: "repetitions",
          weight: 12,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 8 },
            },
          ],
        }),
        occurrence({
          id: "open",
          policy: "untilFinished",
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 5 },
            },
          ],
        }),
      ],
    });

    expect(projection.occurrences.map((value) => value.completionPolicy)).toEqual([
      "time",
      "distance",
      "repetitions",
      "untilFinished",
    ]);
    expect(projection).not.toHaveProperty("prescribedIntensity");
  });

  it("does not expose partial native intensity coverage through the plan projection", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-coverage",
      occurrences: [
        occurrence({
          id: "targeted",
          weight: 60,
          values: [{ metric: "power", unit: "watts", magnitude: { kind: "point", value: 200 } }],
        }),
        occurrence({
          id: "other",
          weight: 40,
          values: [
            {
              metric: "cadence",
              unit: "revolutions_per_minute",
              magnitude: { kind: "point", value: 90 },
            },
          ],
        }),
      ],
    });

    expect(projection).not.toHaveProperty("prescribedIntensity");
  });

  it("scopes timed-speed distance to its actual lane when repetitions have no distance", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-derived-time-lane",
      occurrences: [
        occurrence({
          id: "timed-speed",
          policy: "time",
          weight: 600,
          distance: 3_000,
          values: [
            {
              metric: "speed",
              unit: "kilometers_per_hour",
              magnitude: { kind: "point", value: 18 },
            },
          ],
        }),
        occurrence({
          id: "repetitions",
          policy: "repetitions",
          weight: 12,
          distance: null,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 7 },
            },
          ],
        }),
      ],
    });

    expect(projection.distance).toEqual({
      status: "partial",
      value: 3_000,
      reason: "lane_scope",
      nativeMetric: "distance",
      unit: "meters",
      scope: { kind: "completion_lane", completionPolicy: "time" },
      weightingBasis: "distance_meters",
      coverage: {
        contributors: { contributing: 1, laneTotal: 1, planTotal: 2 },
        weight: { covered: 3_000, total: 3_000 },
      },
      provenance: "derived",
      basis: "compiled_occurrences",
    });
  });

  it("reports distance derived across multiple completion lanes as a partial full-plan aggregate", () => {
    const projection = createActivityPlanProjection({
      revisionFingerprint: "revision-multiple-derived-lanes",
      occurrences: [
        occurrence({
          id: "timed-speed",
          policy: "time",
          weight: 600,
          distance: 3_000,
          values: [
            {
              metric: "speed",
              unit: "kilometers_per_hour",
              magnitude: { kind: "point", value: 18 },
            },
          ],
        }),
        occurrence({
          id: "repetitions-distance",
          policy: "repetitions",
          weight: 12,
          distance: 240,
          values: [
            {
              metric: "perceived_exertion",
              unit: "rpe_0_10",
              magnitude: { kind: "point", value: 7 },
            },
          ],
        }),
      ],
    });

    expect(projection.distance).toEqual({
      status: "partial",
      value: 3_240,
      reason: "mixed_completion_lanes",
      nativeMetric: "distance",
      unit: "meters",
      scope: { kind: "full_plan", completionPolicy: null },
      weightingBasis: "distance_meters",
      coverage: {
        contributors: { contributing: 2, laneTotal: 2, planTotal: 2 },
        weight: { covered: 3_240, total: 3_240 },
      },
      provenance: "derived",
      basis: "compiled_occurrences",
    });
  });
});
