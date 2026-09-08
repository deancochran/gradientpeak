import type { SemanticMetric } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  describeTrainingPlanSessions,
  formatActivityPlanProjectionMetrics,
  getActivityPlanMetricSummary,
} from "./activity-plan-presentation";

describe("activity plan presentation", () => {
  it("summarizes canonical training plan sessions", () => {
    expect(describeTrainingPlanSessions({ sessions: [{}, {}] })).toBe("2 sessions");
  });

  it("fails loudly when a legacy normalized-intensity metric reaches a plan summary", () => {
    const metrics: SemanticMetric[] = [
      {
        key: "elapsed_duration",
        label: "Duration",
        status: "partial",
        value: 180,
        unit: "seconds",
        reason: "incomplete_members",
      },
      {
        key: "common_load",
        label: "Load",
        status: "partial",
        value: 1.5,
        unit: "score",
        reason: "incomplete_members",
      },
      {
        key: "normalized_intensity",
        label: "Normalized intensity",
        status: "partial",
        value: 0.55,
        unit: "ratio",
        reason: "incomplete_members",
      },
    ];
    expect(() => getActivityPlanMetricSummary({ metrics })).toThrow(
      "Activity-plan summaries must use objective_intensity",
    );
  });

  it("renders unavailable objective intensity as an em dash", () => {
    expect(
      formatActivityPlanProjectionMetrics([
        {
          key: "objective_intensity",
          label: "Intensity",
          status: "unavailable",
          value: null,
          unit: "ratio",
          reason: "incomplete_objective_coverage",
          provenance: null,
        },
      ]),
    ).toEqual(["Intensity —"]);
  });

  it("formats the single objective intensity ratio", () => {
    expect(
      formatActivityPlanProjectionMetrics([
        {
          key: "objective_intensity",
          label: "Intensity",
          status: "available",
          value: 2_439 / 3_500,
          unit: "ratio",
          reason: null,
          provenance: "estimated",
        },
      ]),
    ).toEqual(["Intensity ~0.70"]);
  });
});
