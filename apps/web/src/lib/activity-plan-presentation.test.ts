import { describe, expect, it } from "vitest";
import { createActivityQuantificationBundle } from "../test-support/activity-quantification";

import {
  describeTrainingPlanSessions,
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
    ).toEqual([
      "Common Load 88.2 · Derived",
      "Normalized intensity 0.84 · Derived from Common Load",
      "Prescribed intensity 84% FTP · Prescribed",
      "1h 15m",
      "12.5 km",
    ]);
  });

  it("presents bundle summaries with derived evidence", () => {
    expect(
      getActivityPlanMetricSummary({
        prescriptionQuantification: quantification,
      }),
    ).toEqual([
      "Common Load 88.2 · Derived",
      "Normalized intensity 0.84 · Derived from Common Load",
      "Prescribed intensity 84% FTP · Prescribed",
      "1h 15m",
      "12.5 km",
    ]);
  });

  it("keeps unavailable values explicit and preserves native structure targets", () => {
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
    ).toEqual([
      "Common Load unavailable",
      "Normalized intensity unavailable",
      "Prescribed intensity RPE 7 · Prescribed",
    ]);
  });
});
