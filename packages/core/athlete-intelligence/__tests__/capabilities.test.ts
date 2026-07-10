import { describe, expect, it } from "vitest";
import { assessCapabilities } from "../capabilities";

const assessedAt = "2026-07-10T00:00:00.000Z";

describe("assessCapabilities", () => {
  it("is deterministic and returns all six canonical dimensions", () => {
    const input = {
      athleteId: "athlete-1",
      assessedAt,
      goalActivityCategory: "run",
      activities: [
        {
          type: "run",
          startedAt: "2026-07-01T00:00:00.000Z",
          durationSeconds: 7200,
          distanceMeters: 20000,
          maxPower: 350,
        },
        {
          type: "swim",
          startedAt: "2026-07-03T00:00:00.000Z",
          durationSeconds: 3600,
          distanceMeters: 2500,
          avgSwolf: 38,
        },
      ],
      metrics: [{ metricType: "ftp" as const, recordedAt: assessedAt, value: 280 }],
    };

    expect(assessCapabilities(input)).toEqual(assessCapabilities(input));
    expect(Object.keys(assessCapabilities(input).capabilities)).toEqual([
      "endurance",
      "threshold",
      "high_intensity",
      "durability",
      "technical",
      "specificity",
    ]);
  });

  it("preserves missing signals as unknown rather than inferring zero", () => {
    const assessment = assessCapabilities({
      athleteId: "athlete-1",
      assessedAt,
      activities: [],
      metrics: [],
    });

    for (const capability of Object.values(assessment.capabilities)) {
      expect(capability.value).toBeNull();
      expect(capability.confidence.score).toBe(0);
    }
  });
});
