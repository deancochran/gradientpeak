import { describe, expect, it } from "vitest";

import {
  selectThresholdCandidate,
  type ThresholdExactWindowObservation,
  type ThresholdSelectionResult,
} from "./index";

function runObservation(
  metric: "grade_adjusted_speed" | "speed",
  overrides: Partial<ThresholdExactWindowObservation> = {},
): ThresholdExactWindowObservation {
  return {
    evidenceId: `${metric}-evidence`,
    activityId: "activity-one",
    seriesId: `${metric}-series`,
    metric,
    sourceAccepted: true,
    ownershipVerified: true,
    availability: "available",
    durationSeconds: 1_800,
    value: metric === "grade_adjusted_speed" ? 4.2 : 4,
    startTimestampSeconds: 100,
    endTimestampSeconds: 1_900,
    windowCoverage: 1,
    maximumGapSeconds: 2,
    ...overrides,
  };
}

function selectedRawAfterGrade(input: {
  grade: readonly ThresholdExactWindowObservation[];
  expectedGradeReason: string;
}): ThresholdSelectionResult {
  const result = selectThresholdCandidate({
    activityCategory: "run",
    observations: [...input.grade, runObservation("speed")],
  });
  expect(result).toMatchObject({
    status: "qualified",
    selectedRole: "fallback",
    selectedEvidenceId: "speed-evidence",
    candidate: { sourceSeriesMetric: "speed", value: 4 },
    attempts: [
      {
        role: "preferred",
        metric: "grade_adjusted_speed",
        evaluation: { status: "rejected", reason: input.expectedGradeReason },
      },
      {
        role: "fallback",
        metric: "speed",
        evaluation: { status: "qualified", candidate: { value: 4 } },
      },
    ],
  });
  return result;
}

const thresholdBoundaryCases = [
  [
    "bike",
    runObservation("speed", {
      evidenceId: "bike-power",
      seriesId: "bike-power",
      metric: "power",
      value: 300,
    }),
    285,
  ],
  ["run", runObservation("grade_adjusted_speed"), 4.2],
  [
    "swim",
    runObservation("speed", {
      evidenceId: "swim-speed",
      seriesId: "swim-speed",
      durationSeconds: 900,
      endTimestampSeconds: 1_000,
      value: 1.5,
    }),
    1.5,
  ],
] as const;

describe("selectThresholdCandidate", () => {
  it.each([
    ["missing", [], "series_missing"],
    [
      "unaccepted source",
      [runObservation("grade_adjusted_speed", { sourceAccepted: false })],
      "source_not_accepted",
    ],
    [
      "unverified ownership",
      [runObservation("grade_adjusted_speed", { ownershipVerified: false })],
      "ownership_unverified",
    ],
    [
      "wrong exact duration",
      [
        runObservation("grade_adjusted_speed", {
          durationSeconds: 1_799,
          endTimestampSeconds: 1_899,
        }),
      ],
      "exact_window_missing",
    ],
    [
      "incomplete",
      [runObservation("grade_adjusted_speed", { availability: "incomplete" })],
      "exact_window_incomplete",
    ],
    [
      "coverage",
      [runObservation("grade_adjusted_speed", { windowCoverage: 0.949_999 })],
      "coverage_insufficient",
    ],
    [
      "gaps",
      [runObservation("grade_adjusted_speed", { maximumGapSeconds: 10.000_001 })],
      "gap_bound_exceeded",
    ],
    ["plausibility", [runObservation("grade_adjusted_speed", { value: 20 })], "value_implausible"],
    [
      "ambiguity",
      [
        runObservation("grade_adjusted_speed", {
          evidenceId: "grade-b",
          seriesId: "grade-series-b",
        }),
        runObservation("grade_adjusted_speed", {
          evidenceId: "grade-a",
          seriesId: "grade-series-a",
        }),
      ],
      "series_ambiguous",
    ],
  ] as const)("uses qualified raw speed after grade-adjusted %s rejection", (_label, grade, expectedGradeReason) => {
    selectedRawAfterGrade({ grade, expectedGradeReason });
  });

  it("always prioritizes qualified grade-adjusted speed and retains both diagnostics", () => {
    expect(
      selectThresholdCandidate({
        activityCategory: "run",
        observations: [runObservation("speed"), runObservation("grade_adjusted_speed")],
      }),
    ).toMatchObject({
      status: "qualified",
      selectedRole: "preferred",
      selectedEvidenceId: "grade_adjusted_speed-evidence",
      candidate: { sourceSeriesMetric: "grade_adjusted_speed", value: 4.2 },
      attempts: [
        {
          role: "preferred",
          evaluation: {
            status: "qualified",
            diagnostics: { selectedSeriesId: "grade_adjusted_speed-series" },
          },
        },
        {
          role: "fallback",
          evaluation: {
            status: "qualified",
            diagnostics: { selectedSeriesId: "speed-series" },
          },
        },
      ],
    });
  });

  it("retains both rejection diagnostics when neither run measurement qualifies", () => {
    expect(
      selectThresholdCandidate({
        activityCategory: "run",
        observations: [
          runObservation("grade_adjusted_speed", { value: 20 }),
          runObservation("speed", { availability: "incomplete" }),
        ],
      }),
    ).toMatchObject({
      status: "rejected",
      reason: "no_qualified_measurement",
      attempts: [
        { evaluation: { status: "rejected", reason: "value_implausible" } },
        { evaluation: { status: "rejected", reason: "exact_window_incomplete" } },
      ],
    });
  });

  it("is import-order independent, including ambiguous grade observations", () => {
    const observations = [
      runObservation("grade_adjusted_speed", {
        evidenceId: "grade-z",
        seriesId: "grade-z",
      }),
      runObservation("speed"),
      runObservation("grade_adjusted_speed", {
        evidenceId: "grade-a",
        seriesId: "grade-a",
      }),
    ];
    const forward = selectThresholdCandidate({ activityCategory: "run", observations });
    const reversed = selectThresholdCandidate({
      activityCategory: "run",
      observations: [...observations].reverse(),
    });
    expect(reversed).toEqual(forward);
    expect(forward).toMatchObject({
      status: "qualified",
      selectedRole: "fallback",
      attempts: [{ evidenceIds: ["grade-a", "grade-z"] }, { evidenceIds: ["speed-evidence"] }],
    });
  });

  it("fails duplicate evidence identity and cross-activity selection closed", () => {
    expect(() =>
      selectThresholdCandidate({
        activityCategory: "run",
        observations: [
          runObservation("grade_adjusted_speed", { evidenceId: "duplicate" }),
          runObservation("speed", { evidenceId: "duplicate" }),
        ],
      }),
    ).toThrow("Threshold selection evidence IDs must be unique");
    expect(() =>
      selectThresholdCandidate({
        activityCategory: "run",
        observations: [
          runObservation("grade_adjusted_speed"),
          runObservation("speed", { activityId: "activity-two" }),
        ],
      }),
    ).toThrow("Threshold selection observations must belong to one activity");
  });

  it("uses one configured measurement for bike and swim", () => {
    const bike = runObservation("speed", {
      evidenceId: "bike-power",
      seriesId: "bike-power",
      metric: "power",
      durationSeconds: 1_800,
      value: 300,
    });
    const swim = runObservation("speed", {
      evidenceId: "swim-speed",
      seriesId: "swim-speed",
      durationSeconds: 900,
      value: 1.5,
      endTimestampSeconds: 1_000,
    });
    expect(
      selectThresholdCandidate({ activityCategory: "bike", observations: [bike] }),
    ).toMatchObject({
      status: "qualified",
      candidate: { value: 285, sourceSeriesMetric: "power" },
      attempts: [{ role: "preferred", metric: "power" }],
    });
    expect(
      selectThresholdCandidate({ activityCategory: "swim", observations: [swim] }),
    ).toMatchObject({
      status: "qualified",
      candidate: { value: 1.5, sourceSeriesMetric: "speed" },
      attempts: [{ role: "preferred", metric: "speed" }],
    });
  });

  it.each(
    thresholdBoundaryCases,
  )("%s accepts exact 95%% coverage and 10-second gaps, then rejects values just outside both bounds", (activityCategory, observation, expectedValue) => {
    const atBoundary = selectThresholdCandidate({
      activityCategory,
      observations: [{ ...observation, windowCoverage: 0.95, maximumGapSeconds: 10 }],
    });
    expect(atBoundary).toMatchObject({
      status: "qualified",
      candidate: { value: expectedValue },
    });
    expect(atBoundary.attempts[0]).toMatchObject({
      evaluation: {
        status: "qualified",
        diagnostics: { requiredWindowCoverage: 0.95, maximumGapSeconds: 10 },
      },
    });

    const belowCoverage = selectThresholdCandidate({
      activityCategory,
      observations: [{ ...observation, windowCoverage: 0.949_999, maximumGapSeconds: 10 }],
    });
    expect(belowCoverage).toMatchObject({ status: "rejected" });
    expect(belowCoverage.attempts[0]).toMatchObject({
      evaluation: { status: "rejected", reason: "coverage_insufficient" },
    });

    const aboveGap = selectThresholdCandidate({
      activityCategory,
      observations: [{ ...observation, windowCoverage: 0.95, maximumGapSeconds: 10.000_001 }],
    });
    expect(aboveGap).toMatchObject({ status: "rejected" });
    expect(aboveGap.attempts[0]).toMatchObject({
      evaluation: { status: "rejected", reason: "gap_bound_exceeded" },
    });
  });
});
