import { describe, expect, it } from "vitest";
import { compileActivityPlanV3 } from "../../activity-plan";
import {
  describeActivityPlanDuration,
  formatDuration,
  getExactDurationSeconds,
  summarizeActivityPlanDuration,
} from "../index";
import { formatDurationCompact, formatDuration as formatElapsedDuration } from "../time-format";

const ids = Array.from(
  { length: 8 },
  (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

describe("duration module", () => {
  it("never assigns exact elapsed time to distance, repetitions, or open completion", () => {
    expect(getExactDurationSeconds({ type: "distance", meters: 1000 })).toBeNull();
    expect(describeActivityPlanDuration({ type: "repetitions", count: 10 })).toMatchObject({
      exactElapsedSeconds: null,
      repetitionCount: 10,
    });
    expect(describeActivityPlanDuration({ type: "untilFinished" })).toMatchObject({
      exactElapsedSeconds: null,
      open: true,
    });
  });

  it("formats authored duration semantics", () => {
    expect(formatDuration({ type: "time", seconds: 90 })).toBe("1m 30s");
    expect(formatDuration({ type: "distance", meters: 1500 })).toBe("1.50km");
    expect(formatDuration({ type: "repetitions", count: 8 })).toBe("8 reps");
  });

  it("preserves seconds-based elapsed-duration formatting", () => {
    expect(formatElapsedDuration(59)).toBe("0:59");
    expect(formatElapsedDuration(3_661)).toBe("1:01:01");
    expect(formatDurationCompact(59)).toBe("59s");
    expect(formatDurationCompact(3_661)).toBe("1h 1m");
  });

  it("separates active, rest, distance, and open semantics", () => {
    const compiled = compileActivityPlanV3({
      version: 3,
      segments: [
        {
          role: "activity",
          id: ids[0],
          name: "Run",
          activity_category: "run",
          intervals: [
            {
              id: ids[1],
              name: "Set",
              repetitions: 1,
              steps: [
                {
                  id: ids[2],
                  name: "Timed",
                  duration: { type: "time", seconds: 300 },
                  targets: [{ type: "speed", intensity: 12 }],
                },
                {
                  id: ids[3],
                  name: "Distance",
                  duration: { type: "distance", meters: 1000 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
                {
                  id: ids[4],
                  name: "Open",
                  duration: { type: "untilFinished" },
                  targets: [{ type: "RPE", intensity: 4 }],
                },
              ],
            },
          ],
        },
        {
          role: "rest",
          id: ids[5],
          name: "Rest",
          duration: { type: "time", seconds: 30 },
        },
      ],
    });

    expect(summarizeActivityPlanDuration(compiled)).toMatchObject({
      exactElapsedSeconds: null,
      timedActiveSeconds: 300,
      restSeconds: 30,
      distanceMeters: 1000,
      openOccurrenceCount: 1,
    });
  });
});
