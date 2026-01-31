import { describe, expect, it } from "vitest";
import { calculateTrainingEffect } from "../training-effect";

describe("Training Effect", () => {
  it("should return recovery for low HR", () => {
    const hrStream = Array(60).fill(100);
    const timestamps = Array.from({ length: 60 }, (_, i) => i);
    const lthr = 170;
    expect(calculateTrainingEffect(hrStream, timestamps, lthr)).toBe(
      "recovery",
    );
  });

  it("should return threshold for HR near LTHR", () => {
    const hrStream = Array(60).fill(165); // 97% of 170
    const timestamps = Array.from({ length: 60 }, (_, i) => i);
    const lthr = 170;
    expect(calculateTrainingEffect(hrStream, timestamps, lthr)).toBe(
      "threshold",
    );
  });

  it("should return vo2max for HR above LTHR", () => {
    const hrStream = Array(60).fill(175); // > 100% of 170
    const timestamps = Array.from({ length: 60 }, (_, i) => i);
    const lthr = 170;
    expect(calculateTrainingEffect(hrStream, timestamps, lthr)).toBe("vo2max");
  });
});
