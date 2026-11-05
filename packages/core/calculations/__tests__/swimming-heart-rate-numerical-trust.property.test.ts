import { describe, expect, it } from "vitest";

import { calculateSwimTiming } from "../../activity-analysis/swim-timing";
import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/swimming-heart-rate-numerical-trust-v1";
import { calculateReferenceSwimTiming } from "./support/swimming-heart-rate-reference";

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

describe(`seeded swim timing properties (${seedLabel})`, () => {
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
