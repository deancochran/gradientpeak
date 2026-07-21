import { describe, expect, it } from "vitest";
import {
  buildActivityStreamSeries,
  buildChartPolyline,
  normalizeWebActivityLaps,
  summarizeSwimDetails,
} from "./activity-stream-presentation";

describe("activity stream presentation", () => {
  it("builds deterministic chart series without inventing missing samples", () => {
    const series = buildActivityStreamSeries([
      { timestamp: "2026-01-01T10:00:00Z", heartRate: 120, power: 200 },
      { timestamp: "2026-01-01T10:00:10Z", heartRate: 130 },
      { timestamp: "2026-01-01T10:00:20Z", heartRate: 140, power: 240 },
    ]);
    expect(series.map((item) => [item.key, item.values.length])).toEqual([
      ["heartRate", 3],
      ["power", 2],
    ]);
    expect(buildChartPolyline(series[0]?.values ?? [])).toBe("0.00,100.00 50.00,50.00 100.00,0.00");
  });

  it("normalizes FIT lap and swim fields while preserving unavailable values", () => {
    expect(
      normalizeWebActivityLaps([
        { messageIndex: 2, totalElapsedTime: 60, totalDistance: 200, avgHeartRate: 145 },
      ]),
    ).toEqual([
      {
        index: 2,
        elapsedSeconds: 60,
        distanceMeters: 200,
        averageHeartRate: 145,
        averagePower: null,
      },
    ]);
    expect(
      summarizeSwimDetails({
        summary: { poolLength: 25, poolLengthUnit: "meters", totalStrokes: 40 },
        lengths: [{ lengthType: 1 }, { lengthType: 0 }],
      }),
    ).toEqual({
      poolLength: 25,
      poolLengthUnit: "meters",
      totalStrokes: 40,
      averageStrokeDistance: null,
      lengths: 2,
      activeLengths: 1,
    });
  });
});
