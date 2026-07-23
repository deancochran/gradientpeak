import { describe, expect, it } from "vitest";
import { calculateBestEffort, MAX_BEST_EFFORT_SAMPLE_GAP_SECONDS } from "../best-efforts";

describe("calculateBestEffort", () => {
  it("preserves expected behavior for a normal 1 Hz stream", () => {
    const effort = calculateBestEffort(
      [10, 10, 10, 20, 20, 20, 10, 10],
      [0, 1, 2, 3, 4, 5, 6, 7],
      3,
    );

    expect(effort).toEqual({
      duration: 3,
      value: 20,
      startIndex: 3,
      endIndex: 5,
      startTimeSeconds: 3,
      endTimeSeconds: 6,
    });
  });

  it("weights irregularly timed samples by their contributing duration", () => {
    const effort = calculateBestEffort([10, 20, 40, 0], [0, 0.5, 2, 3], 2);

    expect(effort).not.toBeNull();
    expect(effort?.value).toBeCloseTo(30);
    expect(effort?.startIndex).toBe(1);
    expect(effort?.endIndex).toBe(2);
  });

  it("uses exact boundaries without including the endpoint sample", () => {
    const effort = calculateBestEffort([10, 20, 30, 1_000], [0, 1, 2, 3], 3);

    expect(effort).toEqual({
      duration: 3,
      value: 20,
      startIndex: 0,
      endIndex: 2,
      startTimeSeconds: 0,
      endTimeSeconds: 3,
    });
  });

  it("accepts intervals exactly at the maximum gap policy", () => {
    const gap = MAX_BEST_EFFORT_SAMPLE_GAP_SECONDS;
    const effort = calculateBestEffort([10, 20, 1_000], [0, gap, gap * 2], gap * 2);

    expect(effort).toEqual({
      duration: gap * 2,
      value: 15,
      startIndex: 0,
      endIndex: 1,
      startTimeSeconds: 0,
      endTimeSeconds: gap * 2,
    });
  });

  it("rejects efforts that would cross a sparse gap", () => {
    expect(calculateBestEffort([100, 100, 100, 100], [0, 1, 10, 11], 2)).toBeNull();
  });

  it("can use a continuously covered segment without crossing a sparse gap", () => {
    const effort = calculateBestEffort([10, 20, 30, 100, 100], [0, 1, 2, 10, 11], 2);

    expect(effort).toEqual({
      duration: 2,
      value: 15,
      startIndex: 0,
      endIndex: 1,
      startTimeSeconds: 0,
      endTimeSeconds: 2,
    });
  });

  it("reports exact boundaries when the winning window starts inside a sample interval", () => {
    const effort = calculateBestEffort([0, 100, 0], [0, 1, 2.5], 2);

    expect(effort).toMatchObject({
      value: 75,
      startIndex: 0,
      endIndex: 1,
      startTimeSeconds: 0.5,
      endTimeSeconds: 2.5,
    });
  });

  it.each([
    { stream: [], timestamps: [], name: "empty streams" },
    { stream: [1], timestamps: [0], name: "fewer than two samples" },
    { stream: [1, 2], timestamps: [0], name: "mismatched lengths" },
    { stream: [1, Number.NaN], timestamps: [0, 1], name: "non-finite values" },
    { stream: [1, 2], timestamps: [0, Number.POSITIVE_INFINITY], name: "non-finite timestamps" },
    { stream: [1, 2], timestamps: [0, 0], name: "duplicate timestamps" },
    { stream: [1, 2], timestamps: [1, 0], name: "decreasing timestamps" },
  ])("rejects $name", ({ stream, timestamps }) => {
    expect(calculateBestEffort(stream, timestamps, 1)).toBeNull();
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid duration %s", (duration) => {
    expect(calculateBestEffort([1, 2], [0, 1], duration)).toBeNull();
  });
});
