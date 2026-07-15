import type {
  ActivityPlanStructureV2,
  IntensityTargetV2,
  IntervalStepV2,
  IntervalV2,
} from "@repo/core";
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
          createStep({
            name: "Distance",
            duration: { type: "distance", meters: 250 },
          }),
          createStep({ name: "Open", duration: { type: "untilFinished" } }),
          createStep({
            name: "Reps",
            duration: { type: "repetitions", count: 3 },
          }),
        ],
      }),
      createInterval({
        repetitions: 1,
        steps: [
          createStep({
            name: "Cool Down",
            duration: { type: "time", seconds: 15 },
          }),
        ],
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

  it.each([
    {
      activityType: "bike",
      target: { type: "%FTP", intensity: 70 },
      error: "%FTP targets require a finite positive FTP in the athlete profile",
    },
    {
      activityType: "bike",
      target: { type: "watts", intensity: 200 },
      expectedTarget: { type: "watts", low: 190, high: 210 },
    },
    {
      activityType: "bike",
      target: { type: "bpm", intensity: 150 },
      expectedTarget: { type: "hr", low: 145, high: 155 },
    },
    {
      activityType: "bike",
      target: { type: "%ThresholdHR", intensity: 80 },
      error: "%ThresholdHR targets require a finite positive threshold heart rate",
    },
    {
      activityType: "bike",
      target: { type: "%MaxHR", intensity: 80 },
      error: "%MaxHR targets require a finite positive maximum heart rate",
    },
    {
      activityType: "bike",
      target: { type: "speed", intensity: 18 },
      error: "speed targets are not supported for bike workouts",
    },
    {
      activityType: "bike",
      target: { type: "cadence", intensity: 100 },
      expectedTarget: { type: "rpm", low: 95, high: 105 },
    },
    {
      activityType: "bike",
      target: { type: "RPE", intensity: 7 },
      error: "RPE targets are not supported by Wahoo",
    },
    {
      activityType: "run",
      target: { type: "%FTP", intensity: 70 },
      error: "%FTP targets are not supported for run workouts",
    },
    {
      activityType: "run",
      target: { type: "watts", intensity: 200 },
      error: "watts targets are not supported for run workouts",
    },
    {
      activityType: "run",
      target: { type: "bpm", intensity: 150 },
      expectedTarget: { type: "hr", low: 145, high: 155 },
    },
    {
      activityType: "run",
      target: { type: "%ThresholdHR", intensity: 80 },
      error: "%ThresholdHR targets require a finite positive threshold heart rate",
    },
    {
      activityType: "run",
      target: { type: "%MaxHR", intensity: 80 },
      error: "%MaxHR targets require a finite positive maximum heart rate",
    },
    {
      activityType: "run",
      target: { type: "speed", intensity: 18 },
      expectedTarget: { type: "speed", low: 4.75, high: 5.25 },
    },
    {
      activityType: "run",
      target: { type: "cadence", intensity: 100 },
      expectedTarget: { type: "rpm", low: 95, high: 105 },
    },
    {
      activityType: "run",
      target: { type: "RPE", intensity: 7 },
      error: "RPE targets are not supported by Wahoo",
    },
  ] satisfies Array<{
    activityType: "bike" | "run";
    target: IntensityTargetV2;
    expectedTarget?: { type: string; low: number; high: number };
    error?: string;
  }>)("preserves or rejects $activityType $target.type with zero athlete metrics without domain substitution", ({
    activityType,
    target,
    expectedTarget,
    error,
  }) => {
    const convert = () =>
      convertToWahooPlan(
        createStructure([
          createInterval({
            steps: [createStep({ name: "Sparse target", targets: [target] })],
          }),
        ]),
        {
          activityType,
          name: "Sparse athlete workout",
          ftp: 0,
          max_hr: 0,
          threshold_hr: 0,
        },
      );

    if (error) {
      expect(convert).toThrow(error);
      return;
    }

    expect(convert().intervals[0]?.targets).toEqual([expectedTarget]);
  });

  it("rejects cycling RPE even when FTP exists rather than fabricating FTP intensity", () => {
    expect(() =>
      convertToWahooPlan(
        createStructure([
          createInterval({
            steps: [
              createStep({
                name: "Hard effort",
                targets: [{ type: "RPE", intensity: 8 }],
              }),
            ],
          }),
        ]),
        { activityType: "bike", ftp: 250, name: "RPE Ride" },
      ),
    ).toThrow("RPE targets are not supported by Wahoo");
  });

  it("reports unsupported RPE instead of requiring FTP when watts is also present", () => {
    expect(() =>
      convertToWahooPlan(
        createStructure([
          createInterval({
            steps: [
              createStep({
                name: "Power with perceived effort guidance",
                targets: [
                  { type: "watts", intensity: 220 },
                  { type: "RPE", intensity: 8 },
                ],
              }),
            ],
          }),
        ]),
        { activityType: "bike", name: "Power Ride" },
      ),
    ).toThrow("RPE targets are not supported by Wahoo");
  });

  it("converts single-step duration without inventing a target", () => {
    const structure = createStructure([
      createInterval({
        steps: [
          createStep({
            name: "Cadence Drills",
            duration: { type: "repetitions", count: 4 },
            targets: [{ type: "cadence", intensity: 95 }],
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
    ]);
  });

  it("rejects targetless steps because the Wahoo contract has no no-target representation", () => {
    expect(() =>
      convertToWahooPlan(
        createStructure([
          createInterval({
            steps: [createStep({ name: "Free Ride", targets: [] })],
          }),
        ]),
        { activityType: "bike", name: "Open Workout" },
      ),
    ).toThrow(
      'Step "Free Ride" cannot be synced to Wahoo without a target. Wahoo\'s plan contract requires every step to contain a target.',
    );
  });

  it("does not hide an invalid secondary target behind a representable run target", () => {
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
        ],
      }),
    ]);

    expect(() =>
      convertToWahooPlan(structure, {
        activityType: "run",
        name: "Marathon Pace Long Run",
      }),
    ).toThrow("%FTP targets are not supported for run workouts");
  });

  it("converts persisted V2 km/h speed for Wahoo while identifying the chosen target", () => {
    const structure = createStructure([
      createInterval({
        steps: [
          createStep({
            name: "Fast Run",
            targets: [
              { type: "bpm", intensity: 158 },
              { type: "speed", intensity: 18 },
              { type: "cadence", intensity: 176 },
            ],
          }),
        ],
      }),
    ]);

    expect(
      convertToWahooPlan(structure, { activityType: "run", name: "Fast Run" }).intervals[0]
        ?.targets,
    ).toEqual([{ type: "speed", low: 4.75, high: 5.25 }]);
    expect(
      validateWahooCompatibility(structure, { activityType: "run", name: "Fast Run" }).warnings,
    ).toContain(
      'Step "Fast Run" has multiple targets. Wahoo will display the selected speed target; every secondary target must also be compatible.',
    );
  });

  it("does not substitute max HR for an invalid run power target", () => {
    expect(() =>
      convertToWahooPlan(
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
      ),
    ).toThrow("%FTP targets are not supported for run workouts");
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

  it("rejects max-heart-rate targets when maximum heart rate is unavailable", () => {
    expect(() =>
      convertToWahooPlan(
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
      ),
    ).toThrow("%MaxHR targets require a finite positive maximum heart rate");
  });

  it("does not substitute max HR for a threshold-heart-rate target", () => {
    expect(() =>
      convertToWahooPlan(
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
      ),
    ).toThrow("%ThresholdHR targets require a finite positive threshold heart rate");
  });

  it("marks explicit RPE incompatible even when another target is present", () => {
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

    expect(
      validateWahooCompatibility(structure, {
        activityType: "bike",
        name: "Ride",
      }),
    ).toEqual({
      compatible: false,
      issues: [
        {
          code: "unsupported_target",
          message:
            'Step "Mixed Guidance" cannot be synced to Wahoo: RPE targets are not supported by Wahoo; add a provider-supported physiological target',
        },
      ],
      warnings: [
        'Step "Mixed Guidance" has multiple targets. Wahoo will display the selected bpm target; every secondary target must also be compatible.',
        'Step "Mixed Guidance" cannot be synced to Wahoo: RPE targets are not supported by Wahoo; add a provider-supported physiological target',
        'Step "Mixed Guidance" uses repetitions as duration. This will be converted to time estimate.',
      ],
    });
  });

  it("classifies targetless, unsupported, and missing-metric targets actionably", () => {
    const result = validateWahooCompatibility(
      createStructure([
        createInterval({
          steps: [
            createStep({ name: "Free Ride", targets: [] }),
            createStep({
              name: "Run Power",
              targets: [{ type: "watts", intensity: 250 }],
            }),
            createStep({
              name: "Threshold",
              targets: [{ type: "%ThresholdHR", intensity: 90 }],
            }),
          ],
        }),
      ]),
      { activityType: "run", name: "Unsupported Run" },
    );

    expect(result.issues).toEqual([
      {
        code: "unsupported_target",
        message:
          'Step "Free Ride" has no target. Wahoo requires every workout step to contain a target.',
      },
      {
        code: "unsupported_target",
        message:
          'Step "Run Power" cannot be synced to Wahoo: watts targets are not supported for run workouts',
      },
      {
        code: "missing_metric",
        message:
          'Step "Threshold" cannot be synced to Wahoo: %ThresholdHR targets require a finite positive threshold heart rate in the athlete profile',
      },
    ]);
  });

  it("marks empty or oversized workouts as incompatible", () => {
    expect(
      validateWahooCompatibility(
        { version: 2, intervals: [] as never[] },
        { activityType: "bike", name: "Empty" },
      ),
    ).toEqual({
      compatible: false,
      issues: [
        {
          code: "invalid_plan",
          message: "Workout has no intervals. Wahoo requires at least one interval.",
        },
      ],
      warnings: ["Workout has no intervals. Wahoo requires at least one interval."],
    });

    const oversized = createStructure([
      createInterval({
        repetitions: 101,
        steps: [
          createStep({
            name: "Endless Repeats",
            targets: [{ type: "watts", intensity: 200 }],
          }),
        ],
      }),
    ]);

    expect(
      validateWahooCompatibility(oversized, {
        activityType: "bike",
        name: "Oversized",
      }),
    ).toEqual({
      compatible: false,
      issues: [
        {
          code: "invalid_plan",
          message: "Workout has 101 steps. Wahoo may have issues with very long workouts.",
        },
      ],
      warnings: ["Workout has 101 steps. Wahoo may have issues with very long workouts."],
    });
  });
});
