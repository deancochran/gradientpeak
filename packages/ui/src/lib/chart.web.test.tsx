import { describe, expect, it } from "vitest";
import {
  alignSeriesByTimestamp,
  buildChartSegments,
  getPaddedChartDomain,
  summarizeChartValues,
} from "./chart";

describe("chart utilities", () => {
  it("pads the observed domain without flattening positive variation to zero", () => {
    expect(getPaddedChartDomain([70, 72], { minimumPadding: 0 })).toEqual({ min: 69.8, max: 72.2 });
  });

  it("produces a visible domain for constant and empty data", () => {
    expect(getPaddedChartDomain([5, 5])).toEqual({ min: 4, max: 6 });
    expect(getPaddedChartDomain([])).toEqual({ min: 0, max: 1 });
  });

  it("preserves gaps as separate coordinate segments", () => {
    const segments = buildChartSegments([
      { x: 0, y: 10 },
      { x: 1, y: null },
      { x: 2, y: 20 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.[0]?.plotX).toBe(0);
    expect(segments[1]?.[0]?.plotX).toBe(100);
  });

  it("summarizes finite values", () => {
    expect(summarizeChartValues([null, 4, 8, 6])).toEqual({
      direction: "up",
      first: 4,
      last: 6,
      min: 4,
      max: 8,
    });
  });

  it("aligns streams by timestamp using interpolation", () => {
    expect(
      alignSeriesByTimestamp(
        [
          { timestamp: 5, value: 100 },
          { timestamp: 15, value: 110 },
        ],
        [
          { timestamp: 0, value: 0 },
          { timestamp: 10, value: 1000 },
          { timestamp: 20, value: 2000 },
        ],
      ),
    ).toEqual([
      { timestamp: 5, primary: 100, secondary: 500 },
      { timestamp: 15, primary: 110, secondary: 1500 },
    ]);
  });
});
