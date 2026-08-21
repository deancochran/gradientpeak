import { describe, expect, it } from "vitest";
import { createActivityQuantificationBundle } from "../test-support/activity-quantification";

import {
  describeTrainingPlanSessions,
  formatActivityPlanProjectionMetrics,
  getActivityPlanMetricSummary,
} from "./activity-plan-presentation";

const quantification = createActivityQuantificationBundle({
  distanceMeters: 12_500,
  durationSeconds: 4_500,
  id: "plan-1",
  load: 88.2,
  nativeIntensity: 84,
});

describe("activity plan presentation", () => {
  it("summarizes canonical training plan sessions", () => {
    expect(describeTrainingPlanSessions({ sessions: [{}, {}] })).toBe("2 sessions");
    expect(describeTrainingPlanSessions({ phases: [] })).toBe("No sessions specified");
  });

  it("builds a compact metric summary from the canonical prescription bundle", () => {
    expect(
      getActivityPlanMetricSummary({
        prescriptionQuantification: quantification,
      }),
    ).toEqual(["1h 15m", "12.5 km", "Personalized load 88.2", "Calculated intensity 0.84"]);
  });

  it("presents bundle summaries with derived evidence", () => {
    expect(
      getActivityPlanMetricSummary({
        prescriptionQuantification: quantification,
      }),
    ).toEqual(["1h 15m", "12.5 km", "Personalized load 88.2", "Calculated intensity 0.84"]);
  });

  it("omits unavailable estimates and never outlines authored step targets", () => {
    expect(
      getActivityPlanMetricSummary({
        structure: {
          version: 3,
          activity_category: "run",
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              role: "activity",
              name: "Run",
              intervals: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  name: "Tempo",
                  repetitions: 1,
                  steps: [
                    {
                      id: "00000000-0000-4000-8000-000000000003",
                      name: "Work",
                      duration: { type: "time", seconds: 600 },
                      targets: [{ type: "RPE", intensity: 7 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ).toEqual([]);
  });

  it("formats card summaries without zero substitution or step-target text", () => {
    expect(
      formatActivityPlanProjectionMetrics([
        {
          key: "elapsed_duration",
          label: "Duration",
          status: "partial",
          value: 900,
          unit: "seconds",
          reason: "incomplete_members",
        },
        {
          key: "common_load",
          label: "Load",
          status: "unavailable",
          value: null,
          unit: "score",
          reason: "no_load_data",
        },
      ]),
    ).toEqual(["Duration 15m 0s known (partial)"]);
  });
});
