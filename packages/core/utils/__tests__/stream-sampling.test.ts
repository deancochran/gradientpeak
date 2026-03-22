import { describe, expect, it } from "vitest";

import {
  downsampleGPSRoute,
  downsampleStream,
  getSamplingStrategy,
  removeNullValues,
} from "../stream-sampling";

describe("stream sampling", () => {
  it("downsamples numeric streams with averaging", () => {
    const result = downsampleStream([1, 2, 3, 4], [10, 20, 30, 40], 2, "avg");

    expect(result).toEqual({
      values: [1.5, 3.5],
      timestamps: [20, 40],
    });
  });

  it("preserves endpoints when downsampling gps routes", () => {
    const result = downsampleGPSRoute(
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      [10, 20, 30, 40, 50],
      2,
    );

    expect(result.coordinates[0]).toEqual([1, 1]);
    expect(result.coordinates.at(-1)).toEqual([5, 5]);
    expect(result.timestamps[0]).toBe(10);
    expect(result.timestamps.at(-1)).toBe(50);
  });

  it("returns expected stream strategies", () => {
    expect(getSamplingStrategy("power")).toBe("max");
    expect(getSamplingStrategy("heartrate")).toBe("avg");
    expect(getSamplingStrategy("unknown")).toBe("avg");
  });

  it("removes null and NaN values while keeping timestamps aligned", () => {
    expect(removeNullValues([1, null, Number.NaN, 4], [10, 20, 30, 40])).toEqual({
      values: [1, 4],
      timestamps: [10, 40],
    });
  });
});
