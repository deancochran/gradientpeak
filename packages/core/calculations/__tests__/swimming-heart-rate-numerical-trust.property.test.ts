import { describe, expect, it } from "vitest";

import { calculateSwimTiming } from "../../activity-analysis/swim-timing";
import { evaluateCssFrom400m200mTest } from "../swim-pace-curve";
import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/swimming-heart-rate-numerical-trust-v1";
import {
  calculateReferenceCss400m200m,
  calculateReferenceSwimTiming,
} from "./support/swimming-heart-rate-reference";

const PROPERTY_CASE_COUNT = 64;
const seedLabel = `${fixtures.propertySeed.version}:0x${fixtures.propertySeed.value.toString(16)}`;

function createGenerator(seed: number) {
  let state = seed >>> 0;
  return {
    integer(minimum: number, maximum: number): number {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return minimum + (state % (maximum - minimum + 1));
    },
  };
}

describe(`seeded CSS/swim timing properties (${seedLabel})`, () => {
  it("keeps valid CSS examples exact, finite, and monotone in the 400m-minus-200m delta", () => {
    const generator = createGenerator(fixtures.propertySeed.value);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const time200Seconds = generator.integer(120, 240);
      const cssSecondsPer100m = generator.integer(Math.floor(time200Seconds / 2) + 1, 180);
      const time400Seconds = time200Seconds + 2 * cssSecondsPer100m;
      const result = evaluateCssFrom400m200mTest({ time400Seconds, time200Seconds });
      const reference = calculateReferenceCss400m200m({ time400Seconds, time200Seconds });
      expect(result.status, `${seedLabel}:css-${sequence}`).toBe("available");
      if (result.status !== "available") throw new Error(`${seedLabel}:css-${sequence}`);
      if (reference.status !== "available")
        throw new Error(`${seedLabel}:css-reference-${sequence}`);
      expect(result.cssSecondsPer100m).toBe(reference.cssSecondsPer100m);
      expect(result.cssMetersPerSecond).toBe(reference.cssMetersPerSecond);
      expect(result.cssSecondsPer100m, `${seedLabel}:css-${sequence}`).toBe(cssSecondsPer100m);
      expect(result.cssMetersPerSecond, `${seedLabel}:css-${sequence}`).toBe(
        100 / cssSecondsPer100m,
      );

      const slower = evaluateCssFrom400m200mTest({
        time400Seconds: time400Seconds + 2,
        time200Seconds,
      });
      expect(slower.status, `${seedLabel}:css-${sequence}:slower`).toBe("available");
      if (slower.status !== "available") throw new Error(`${seedLabel}:css-${sequence}:slower`);
      expect(slower.cssSecondsPer100m).toBe(cssSecondsPer100m + 1);
      expect(slower.cssMetersPerSecond).toBeLessThan(result.cssMetersPerSecond);
    }
  });

  it("preserves additive active/rest totals under deterministic length reordering", () => {
    const generator = createGenerator(fixtures.propertySeed.value ^ 0x51a1_5005);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const activeOne = generator.integer(10, 90);
      const activeTwo = generator.integer(10, 90);
      const rest = generator.integer(1, 60);
      const elapsedDurationSeconds = activeOne + activeTwo + rest;
      const lengths = [
        { lengthType: "active", totalTimerTime: activeOne },
        { lengthType: "rest", totalElapsedTime: rest },
        { lengthType: "active", totalTimerTime: activeTwo },
      ];
      const forward = calculateSwimTiming({
        elapsedDurationSeconds,
        expectedActiveLengthCount: 2,
        lengths,
      });
      const reverse = calculateSwimTiming({
        elapsedDurationSeconds,
        expectedActiveLengthCount: 2,
        lengths: [...lengths].reverse(),
      });
      expect(forward, `${seedLabel}:timing-${sequence}`).toMatchObject({
        status: "available",
        activeDurationSeconds: activeOne + activeTwo,
        restDurationSeconds: rest,
      });
      expect(reverse, `${seedLabel}:timing-${sequence}`).toEqual(forward);
      expect(forward).toMatchObject(
        calculateReferenceSwimTiming({
          elapsedDurationSeconds,
          expectedActiveLengthCount: 2,
          lengths,
        }),
      );
    }
  });
});
