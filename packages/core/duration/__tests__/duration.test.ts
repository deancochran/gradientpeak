import { describe, expect, it } from "vitest";
import { compileActivityPlanV3 } from "../../activity-plan";
import {
  describeActivityPlanDuration,
  formatDuration,
  getExactDurationSeconds,
  summarizeActivityPlanDuration,
} from "../index";

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

  it("separates active, rest, transition, distance, and open semantics", () => {
    const compiled = compileActivityPlanV3({
      version: 3,
      segments: [
        {
          role: "activity",
          id: ids[0],
          name: "Run",
          category: "run",
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
        { role: "transition", id: ids[5], name: "T1", duration: { type: "time", seconds: 60 } },
        {
          role: "activity",
          id: ids[6],
          name: "Bike",
          category: "bike",
          intervals: [
            {
              id: ids[7],
              name: "Bike",
              repetitions: 1,
              steps: [
                {
                  id: "10000000-0000-4000-8000-000000000009",
                  name: "Bike",
                  duration: { type: "time", seconds: 1 },
                  targets: [{ type: "%FTP", intensity: 50 }],
                },
              ],
            },
          ],
        },
        {
          role: "rest",
          id: "10000000-0000-4000-8000-000000000010",
          name: "Rest",
          duration: { type: "time", seconds: 30 },
        },
      ],
    });

    expect(summarizeActivityPlanDuration(compiled)).toMatchObject({
      exactElapsedSeconds: null,
      timedActiveSeconds: 301,
      restSeconds: 30,
      transitionSeconds: 60,
      distanceMeters: 1000,
      openOccurrenceCount: 1,
    });
  });
});
