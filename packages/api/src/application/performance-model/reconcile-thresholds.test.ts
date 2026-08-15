import { extractBestEfforts } from "@repo/core/calculations";
import { describe, expect, it } from "vitest";
import { evaluateActivityThreshold, selectActivityThreshold } from "./reconcile-thresholds";

function extraction(input: {
  metric: "power" | "speed" | "grade_adjusted_speed";
  durationSeconds: number;
  value: number | null;
  durationsSeconds: number[];
}) {
  return extractBestEfforts({
    metric: input.metric,
    samples: Array.from({ length: input.durationSeconds + 1 }, (_, timestampSeconds) => ({
      timestampSeconds,
      value: input.value,
    })),
    config: { durationsSeconds: input.durationsSeconds },
  });
}

function series(
  id: string,
  value: ReturnType<typeof extraction>,
): {
  seriesId: string;
  ownershipVerified: boolean;
  extraction: ReturnType<typeof extraction>;
} {
  return { seriesId: id, ownershipVerified: true, extraction: value };
}

describe("hard-cut activity threshold qualification", () => {
  it("qualifies bike power only from the exact 1800-second window", () => {
    const evaluation = evaluateActivityThreshold({
      activityCategory: "bike",
      series: [
        series(
          "bike:power",
          extraction({
            metric: "power",
            durationSeconds: 1_900,
            value: 300,
            durationsSeconds: [1_200, 1_800],
          }),
        ),
      ],
    });
    expect(evaluation).toMatchObject({
      status: "qualified",
      candidate: {
        method: "bike_power_30m",
        exactWindowSeconds: 1_800,
        value: 285,
      },
    });
  });

  it("uses the explicit raw-speed fallback when grade-adjusted speed has no exact window", () => {
    const evaluation = evaluateActivityThreshold({
      activityCategory: "run",
      series: [
        series(
          "run:grade",
          extraction({
            metric: "grade_adjusted_speed",
            durationSeconds: 1_900,
            value: null,
            durationsSeconds: [1_800],
          }),
        ),
        series(
          "run:raw",
          extraction({
            metric: "speed",
            durationSeconds: 1_900,
            value: 4,
            durationsSeconds: [1_800],
          }),
        ),
      ],
    });
    expect(evaluation).toMatchObject({
      status: "qualified",
      candidate: {
        method: "run_speed_30m",
        sourceSeriesId: "run:raw",
        sourceSeriesMetric: "speed",
        exactWindowSeconds: 1_800,
        value: 4,
      },
    });
  });

  it("uses raw speed after any preferred rejection and retains both attempt diagnostics", () => {
    const selection = selectActivityThreshold({
      activityCategory: "run",
      series: [
        series(
          "run:grade",
          extraction({
            metric: "grade_adjusted_speed",
            durationSeconds: 1_900,
            value: 100,
            durationsSeconds: [1_800],
          }),
        ),
        series(
          "run:raw",
          extraction({
            metric: "speed",
            durationSeconds: 1_900,
            value: 4,
            durationsSeconds: [1_800],
          }),
        ),
      ],
    });
    expect(selection).toMatchObject({
      status: "qualified",
      selectedRole: "fallback",
      attempts: [
        { role: "preferred", evaluation: { status: "rejected", reason: "value_implausible" } },
        { role: "fallback", evaluation: { status: "qualified" } },
      ],
    });
  });

  it("persists the specific measured fallback rejection instead of an absent preferred series", () => {
    expect(
      evaluateActivityThreshold({
        activityCategory: "run",
        series: [
          series(
            "run:raw",
            extraction({
              metric: "speed",
              durationSeconds: 1_900,
              value: 20,
              durationsSeconds: [1_800],
            }),
          ),
        ],
      }),
    ).toMatchObject({
      status: "rejected",
      reason: "value_implausible",
      diagnostics: { selectedSeriesId: "run:raw", selectedSeriesRole: "fallback" },
    });
  });

  it("qualifies swim speed only from the exact 900-second window", () => {
    const evaluation = evaluateActivityThreshold({
      activityCategory: "swim",
      series: [
        series(
          "swim:speed",
          extraction({
            metric: "speed",
            durationSeconds: 1_000,
            value: 1.4,
            durationsSeconds: [900],
          }),
        ),
      ],
    });
    expect(evaluation).toMatchObject({
      status: "qualified",
      candidate: { method: "swim_speed_15m", exactWindowSeconds: 900 },
    });
    if (evaluation.status !== "qualified") throw new Error("Expected qualified swim threshold");
    expect(evaluation.candidate.value).toBeCloseTo(1.4, 10);
  });

  it("rejects a short activity rather than substituting its longest effort", () => {
    expect(
      evaluateActivityThreshold({
        activityCategory: "bike",
        series: [
          series(
            "bike:power",
            extraction({
              metric: "power",
              durationSeconds: 1_200,
              value: 300,
              durationsSeconds: [1_200],
            }),
          ),
        ],
      }),
    ).toMatchObject({
      status: "rejected",
      reason: "exact_window_missing",
      diagnostics: { exactWindowSeconds: 1_800 },
    });
  });

  it("preserves absent, unavailable, and ambiguous measurement diagnostics", () => {
    expect(evaluateActivityThreshold({ activityCategory: "bike", series: [] })).toMatchObject({
      status: "rejected",
      reason: "series_missing",
    });

    expect(
      evaluateActivityThreshold({
        activityCategory: "bike",
        series: [
          series(
            "bike:unavailable",
            extraction({
              metric: "power",
              durationSeconds: 1_900,
              value: null,
              durationsSeconds: [1_800],
            }),
          ),
        ],
      }),
    ).toMatchObject({ status: "rejected", reason: "exact_window_incomplete" });

    expect(
      evaluateActivityThreshold({
        activityCategory: "bike",
        series: [
          series(
            "bike:power:one",
            extraction({
              metric: "power",
              durationSeconds: 1_900,
              value: 300,
              durationsSeconds: [1_800],
            }),
          ),
          series(
            "bike:power:two",
            extraction({
              metric: "power",
              durationSeconds: 1_900,
              value: 310,
              durationsSeconds: [1_800],
            }),
          ),
        ],
      }),
    ).toMatchObject({ status: "rejected", reason: "series_ambiguous" });
  });
});
