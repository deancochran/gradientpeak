import { describe, expect, it } from "vitest";
import { parseManualReviewValues, parseTrainerTargetPower } from "./review-inputs";

describe("recording review inputs", () => {
  it("keeps the durable distance for blank manual input and preserves null calories", () => {
    expect(
      parseManualReviewValues({ artifactDistanceMeters: 345, distanceMeters: "", calories: "" }),
    ).toEqual({
      distanceMeters: 345,
      calories: null,
      distanceEnteredManually: false,
      caloriesEnteredManually: false,
    });
  });

  it("retains explicit zero as a manual measurement", () => {
    expect(
      parseManualReviewValues({ artifactDistanceMeters: 345, distanceMeters: "0", calories: "0" }),
    ).toEqual({
      distanceMeters: 0,
      calories: 0,
      distanceEnteredManually: true,
      caloriesEnteredManually: true,
    });
  });

  it.each(["-1", "NaN"])("rejects invalid manual values: %s", (value) => {
    expect(
      parseManualReviewValues({ artifactDistanceMeters: 345, distanceMeters: value, calories: "" }),
    ).toBeNull();
    expect(
      parseManualReviewValues({ artifactDistanceMeters: 345, distanceMeters: "", calories: value }),
    ).toBeNull();
  });

  it.each(["-1", "NaN"])("rejects invalid trainer target power: %s", (value) => {
    expect(parseTrainerTargetPower(value)).toBeNull();
  });

  it("accepts explicit zero trainer target power", () => {
    expect(parseTrainerTargetPower("0")).toBe(0);
  });
});
