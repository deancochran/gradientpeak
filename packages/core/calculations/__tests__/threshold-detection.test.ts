import { describe, expect, it } from "vitest";
import { detectLTHR } from "../threshold-detection";

describe("Threshold Detection", () => {
  it("should detect LTHR from 20min effort", () => {
    // 20 mins = 1200 seconds
    // Create a stream with 20 mins of steady HR at 170
    const hrStream = Array(1300).fill(140);
    // Insert 20 mins at 170 (need > 1200s duration, so > 1200 samples if 1Hz)
    for (let i = 50; i < 1260; i++) {
      hrStream[i] = 170;
    }
    const timestamps = Array.from({ length: 1300 }, (_, i) => i);

    // LTHR = 95% of 20min avg
    // 170 * 0.95 = 161.5 -> rounded to 162
    expect(detectLTHR(hrStream, timestamps)).toBe(162);
  });
});
