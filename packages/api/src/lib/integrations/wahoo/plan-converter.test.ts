import type { ActivityPlanStructureV2, IntervalStepV2, IntervalV2 } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  calculateWorkoutDuration,
  convertToWahooPlan,
  validateWahooCompatibility,
  validateWahooPlanContract,
} from "./plan-converter";

function createStep(overrides: Partial<IntervalStepV2> = {}): IntervalStepV2 {
  return {
    id: crypto.randomUUID(),
    name: "Step",
    duration: { type: "time", seconds: 60 },
    targets: [],
    ...overrides,
  };
}

function createInterval(overrides: Partial<IntervalV2> = {}): IntervalV2 {
  return {
    id: crypto.randomUUID(),
    name: "Interval",
    repetitions: 1,
    steps: [createStep()],
    ...overrides,
  };
}

function createStructure(intervals: IntervalV2[]): ActivityPlanStructureV2 {
  return {
    version: 2,
    intervals,
  };
}

describe("plan-converter", () => {
  it("calculates total duration across mixed step types and interval repetitions", () => {
    const structure = createStructure([
      createInterval({
        repetitions: 2,
        steps: [
          createStep({ name: "Time", duration: { type: "time", seconds: 30 } }),
          createStep({ name: "Distance", duration: { type: "distance", meters: 250 } }),
          createStep({ name: "Open", duration: { type: "untilFinished" } }),
          createStep({ name: "Reps", duration: { type: "repetitions", count: 3 } }),
        ],
      }),
      createInterval({
        repetitions: 1,
        steps: [createStep({ name: "Cool Down", duration: { type: "time", seconds: 15 } })],
      }),
    ]);

    expect(calculateWorkoutDuration(structure)).toBe(275);
  });

  it("converts repeated intervals into Wahoo repeat blocks and keeps only the first visible target", () => {
    const structure = createStructure([
      createInterval({
        name: "Main Set",
        repetitions: 3,
        steps: [
          createStep({
            name: "Warmup",
            duration: { type: "time", seconds: 600 },
            targets: [{ type: "%FTP", intensity: 55 }],
          }),
          createStep({
            name: "Cruise",
            duration: { type: "distance", meters: 1000 },
            targets: [
              { type: "watts", intensity: 220 },
              { type: "bpm", intensity: 150 },
            ],
          }),
        ],
      }),
    ]);

    const plan = convertToWahooPlan(structure, {
      activityType: "bike",
      hasRoute: true,
      name: "Saturday Ride",
      description: "Outdoor intervals",
      ftp: 280,
      threshold_hr: 172,
    });

    expect(plan.header).toEqual({
      name: "Saturday Ride",
      version: "1.0.0",
      description: "Outdoor intervals",
      workout_type_family: 0,
      workout_type_location: 1,
      ftp: 280,
      threshold_hr: 172,
    });

    expect(plan.intervals).toHaveLength(1);
    expect(plan.intervals[0]).toMatchObject({
      name: "Main Set",
      exit_trigger_type: "repeat",
      exit_trigger_value: 2,
      intensity_type: "active",
    });
    expect(plan.intervals[0]?.intervals).toHaveLength(2);
    expect(plan.intervals[0]?.intervals?.[0]).toEqual({
      name: "Warmup",
      exit_trigger_type: "time",
      exit_trigger_value: 600,
      intensity_type: "recover",
      targets: [{ type: "ftp", low: 0.5225, high: 0.5775000000000001 }],
    });
    expect(plan.intervals[0]?.intervals?.[1]).toEqual({
      name: "Cruise",
      exit_trigger_type: "distance",
      exit_trigger_value: 1000,
      intensity_type: "lt",
      targets: [{ type: "watts", low: 209, high: 231 }],
    });
  });

  it("converts single-step duration and uses run-native fallbacks", () => {
    const structure = createStructure([
      createInterval({
        steps: [
          createStep({
            name: "Cadence Drills",
            duration: { type: "repetitions", count: 4 },
            targets: [{ type: "cadence", intensity: 95 }],
          }),
          createStep({
            name: "Free Run",
            duration: { type: "untilFinished" },
            targets: [{ type: "RPE", intensity: 8 }],
          }),
        ],
      }),
    ]);

    const plan = convertToWahooPlan(structure, {
      activityType: "run",
      name: "Track Session",
    });

    expect(plan.header.workout_type_family).toBe(1);
    expect(plan.header.workout_type_location).toBe(0);
    expect(plan.header.description).toBe("");
    expect(plan.header.ftp).toBeUndefined();
    expect(plan.intervals).toEqual([
      {
        name: "Cadence Drills",
        exit_trigger_type: "time",
        exit_trigger_value: 120,
        intensity_type: "active",
        targets: [{ type: "rpm", low: 90.25, high: 99.75 }],
      },
      {
        name: "Free Run",
        exit_trigger_type: "time",
        exit_trigger_value: 300,
        intensity_type: "active",
        targets: [{ type: "speed", low: 0.5, high: 8 }],
      },
    ]);
  });

  it("prefers run-native targets over power-relative targets", () => {
    const structure = createStructure([
      createInterval({
        steps: [
          createStep({
            name: "Marathon Pace",
            duration: { type: "time", seconds: 1200 },
            targets: [
              { type: "%FTP", intensity: 82 },
              { type: "bpm", intensity: 158 },
            ],
          }),
          createStep({
            name: "Easy Finish",
            duration: { type: "time", seconds: 600 },
            targets: [{ type: "%FTP", intensity: 60 }],
          }),
        ],
      }),
    ]);

    const plan = convertToWahooPlan(structure, {
      activityType: "run",
      name: "Marathon Pace Long Run",
    });

    expect(plan.header.ftp).toBeUndefined();
    expect(plan.intervals).toEqual([
      {
        name: "Marathon Pace",
        exit_trigger_type: "time",
        exit_trigger_value: 1200,
        intensity_type: "active",
        targets: [{ type: "hr", low: 153, high: 163 }],
      },
      {
        name: "Easy Finish",
        exit_trigger_type: "time",
        exit_trigger_value: 600,
        intensity_type: "active",
        targets: [{ type: "speed", low: 0.5, high: 8 }],
      },
    ]);
  });

  it("does not convert globally invalid run power targets even when max HR is available", () => {
    const plan = convertToWahooPlan(
      createStructure([
        createInterval({
          steps: [
            createStep({
              name: "Warmup",
              targets: [{ type: "%FTP", intensity: 65 }],
            }),
          ],
        }),
      ]),
      { activityType: "run", max_hr: 193, name: "Run" },
    );

    expect(plan.header.max_hr).toBeUndefined();
    expect(plan.intervals[0]?.targets).toEqual([{ type: "speed", low: 0.5, high: 8 }]);
  });

  it("throws when the activity type is unsupported by Wahoo", () => {
    const structure = createStructure([createInterval()]);

    expect(() =>
      convertToWahooPlan(structure, {
        activityType: "swim" as never,
        name: "Pool Session",
      }),
    ).toThrow("Activity type 'swim' is not supported by Wahoo");
  });

  it("validates Wahoo plan file shapes that the provider rejects", () => {
    expect(
      validateWahooPlanContract({
        header: {
          name: "Invalid Run",
          version: "1.0.0",
          workout_type_family: 1,
          workout_type_location: 0,
        },
        intervals: [
          {
            name: "No Targets",
            exit_trigger_type: "time",
            exit_trigger_value: 300,
            intensity_type: "active",
            targets: [],
          },
          {
            name: "Bad HR",
            exit_trigger_type: "time",
            exit_trigger_value: 300,
            intensity_type: "active",
            targets: [{ type: "hr", value: 150 }],
          },
          {
            name: "FTP Without Header",
            exit_trigger_type: "time",
            exit_trigger_value: 300,
            intensity_type: "active",
            targets: [{ type: "ftp", low: 0.6, high: 0.7 }],
          },
        ],
      }),
    ).toEqual({
      valid: false,
      errors: [
        "header.description is required",
        "intervals[0].targets must contain at least one target",
        "intervals[1].targets[0].value is not allowed for hr targets",
        "intervals[2].targets[0] requires header.ftp",
      ],
    });
  });

  it("falls back away from unsupported max-heart-rate targets", () => {
    const plan = convertToWahooPlan(
      createStructure([
        createInterval({
          steps: [
            createStep({
              name: "Max HR Unsupported",
              targets: [{ type: "%MaxHR", intensity: 85 }],
            }),
          ],
        }),
      ]),
      { activityType: "run", name: "Run" },
    );

    expect(plan.header.max_hr).toBeUndefined();
    expect(plan.intervals[0]?.targets).toEqual([{ type: "speed", low: 0.5, high: 8 }]);
  });

  it("falls run threshold-heart-rate targets back to max-heart-rate when LTHR is unavailable", () => {
    const plan = convertToWahooPlan(
      createStructure([
        createInterval({
          steps: [
            createStep({
              name: "Warmup",
              targets: [{ type: "%ThresholdHR", intensity: 65 }],
            }),
          ],
        }),
      ]),
      { activityType: "run", max_hr: 193, name: "Run" },
    );

    expect(plan.header.max_hr).toBe(193);
    expect(plan.header.threshold_hr).toBeUndefined();
    expect(plan.intervals[0]?.targets?.[0]).toMatchObject({ type: "max_hr" });
    expect(plan.intervals[0]?.targets?.[0]?.low).toBeCloseTo(0.6175);
    expect(plan.intervals[0]?.targets?.[0]?.high).toBeCloseTo(0.6825);
  });

  it("treats lightweight compatibility warnings as syncable", () => {
    const structure = createStructure([
      createInterval({
        steps: [
          createStep({
            name: "Mixed Guidance",
            duration: { type: "repetitions", count: 2 },
            targets: [
              { type: "RPE", intensity: 6 },
              { type: "bpm", intensity: 155 },
            ],
          }),
        ],
      }),
    ]);

    expect(validateWahooCompatibility(structure)).toEqual({
      compatible: true,
      warnings: [
        'Step "Mixed Guidance" has multiple targets. Wahoo devices only show the first target.',
        'Step "Mixed Guidance" uses RPE targets. These will be converted to approximate FTP percentages.',
        'Step "Mixed Guidance" uses repetitions as duration. This will be converted to time estimate.',
      ],
    });
  });

  it("marks empty or oversized workouts as incompatible", () => {
    expect(validateWahooCompatibility({ version: 2, intervals: [] as never[] })).toEqual({
      compatible: false,
      warnings: ["Workout has no intervals. Wahoo requires at least one interval."],
    });

    const oversized = createStructure([
      createInterval({
        repetitions: 101,
        steps: [createStep({ name: "Endless Repeats" })],
      }),
    ]);

    expect(validateWahooCompatibility(oversized)).toEqual({
      compatible: false,
      warnings: ["Workout has 101 steps. Wahoo may have issues with very long workouts."],
    });
  });
});
