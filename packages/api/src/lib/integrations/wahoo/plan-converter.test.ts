import {
  type ActivityPlanDuration,
  activityPlanStructureSchema,
  compileActivityPlan,
  getActivityPlanProviderProjection,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  calculateWorkoutDuration,
  convertToWahooPlan,
  getWahooProjectionSnapshot,
  validateWahooCompatibility,
  WahooPlanConversionError,
} from "./plan-converter";

const options = { activityType: "bike" as const, name: "Fixture" };
function plan(durations: ActivityPlanDuration[], repetitions = 3) {
  return activityPlanStructureSchema.parse({
    version: 3,
    activity_category: "bike",
    segments: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        role: "activity",
        name: "Bike",
        intervals: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Main",
            repetitions,
            steps: durations.map((duration, index) => ({
              id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
              name: "Step",
              duration,
              targets: [{ type: "watts", intensity: 200 }],
            })),
          },
        ],
      },
    ],
  });
}

describe("Wahoo plan converter", () => {
  it("exports the pure plan converter", () => {
    expect(convertToWahooPlan).toBeTypeOf("function");
  });
  it.each([
    { type: "untilFinished" },
    { type: "repetitions", count: 8 },
  ] satisfies ActivityPlanDuration[])("rejects historic $type consistently without changing native execution", (duration) => {
    const structure = plan([duration]);
    const compatibility = validateWahooCompatibility(structure, options);
    expect(compatibility.compatible).toBe(false);
    expect(compatibility.issues).toContainEqual(
      expect.objectContaining({ reasonCode: "unsupported_duration", semantic: "duration" }),
    );
    for (const convert of [
      () => convertToWahooPlan(structure, options),
      () => getWahooProjectionSnapshot(structure, options),
      () => calculateWorkoutDuration(structure),
    ]) {
      expect(convert).toThrow(WahooPlanConversionError);
      expect(convert).toThrow(/completion cannot be converted/);
    }
    expect(
      compileActivityPlan(structure).occurrences.map((occurrence) => occurrence.duration),
    ).toEqual([duration, duration, duration]);
    expect(getActivityPlanProviderProjection({ structure, provider: "native" }).disposition).toBe(
      "compatible",
    );
  });
  it("keeps interval repetitions expanded once and metadata equal to exported timed intervals", () => {
    const structure = plan([
      { type: "time", seconds: 61 },
      { type: "time", seconds: 29 },
    ]);
    const converted = convertToWahooPlan(structure, options);
    expect(converted.intervals).toHaveLength(6);
    expect(converted.intervals.map((interval) => interval.exit_trigger_value)).toEqual([
      61, 29, 61, 29, 61, 29,
    ]);
    expect(calculateWorkoutDuration(structure)).toBe(270);
    expect(calculateWorkoutDuration(structure)).toBe(
      converted.intervals.reduce((sum, interval) => sum + interval.exit_trigger_value, 0),
    );
  });
  it.each([
    [{ type: "distance", meters: 500 }],
    [
      { type: "time", seconds: 60 },
      { type: "distance", meters: 500 },
    ],
  ] satisfies ActivityPlanDuration[][])("preserves distance export and reports total time unavailable: %j", (...durations) => {
    const structure = plan(durations);
    expect(validateWahooCompatibility(structure, options).compatible).toBe(true);
    const converted = convertToWahooPlan(structure, options);
    expect(
      converted.intervals
        .filter((interval) => interval.exit_trigger_type === "distance")
        .map((interval) => interval.exit_trigger_value),
    ).toEqual([500, 500, 500]);
    expect(calculateWorkoutDuration(structure)).toBeNull();
  });
  it("does not stop validation at an earlier distance step", () => {
    expect(() =>
      calculateWorkoutDuration(
        plan([{ type: "distance", meters: 100 }, { type: "untilFinished" }]),
      ),
    ).toThrow(WahooPlanConversionError);
  });
  it("does not report rest-boundary time while silently dropping it from export", () => {
    const structure = plan([{ type: "time", seconds: 60 }]);
    structure.segments.push({
      id: "44444444-4444-4444-8444-444444444444",
      role: "rest",
      name: "Rest",
      duration: { type: "time", seconds: 30 },
    });
    expect(validateWahooCompatibility(structure, options).compatible).toBe(false);
    expect(() => convertToWahooPlan(structure, options)).toThrow(/rest boundaries/);
    expect(() => calculateWorkoutDuration(structure)).toThrow(/rest boundaries/);
  });
});
