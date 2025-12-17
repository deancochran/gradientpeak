import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Threshold Run - Indoor Treadmill
 * Total time: 50 minutes
 * Estimated TSS: ~60
 */
export const THRESHOLD_RUN_WORKOUT_1: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Threshold Run Development 1",
  description:
    "Indoor treadmill session focusing on threshold heart rate intervals",
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(60)],
      notes: "Easy pace jogging to prepare legs and lungs",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Threshold Interval",
          duration: Duration.minutes(5),
          targets: [Target.thresholdHR(85)],
          notes: "Steady effort at high intensity",
        },
        {
          name: "Active Recovery",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(70)],
          notes: "Easy jog or walk to bring HR down",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(70)],
      notes: "Relaxed pace to flush lactate",
    })
    .build(),
};

/**
 * Threshold Run - Indoor Treadmill
 * Total time: 60 minutes
 * Estimated TSS: ~70
 */
export const THRESHOLD_RUN_WORKOUT_2: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Threshold Run Development 2",
  description:
    "Longer indoor treadmill threshold session with progressive intervals",
  structure: createPlan()
    .step({
      name: "Warm-up Jog",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(60)],
      notes: "Gradually increase speed to prep for intervals",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Long Threshold Interval",
          duration: Duration.minutes(8),
          targets: [Target.thresholdHR(70)],
          notes: "Maintain pace comfortably hard",
        },
        {
          name: "Recovery Jog",
          duration: Duration.minutes(5),
          targets: [Target.thresholdHR(60)],
          notes: "Keep HR below 70% threshold",
        },
      ],
    })
    .step({
      name: "Short Threshold Push",
      duration: Duration.minutes(3),
      targets: [Target.thresholdHR(80)],
      notes: "Push pace for short duration",
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Relaxed pace to normalize heart rate",
    })
    .build(),
};

/**
 * Speed Intervals - Indoor Treadmill
 * Total time: 40 minutes
 * Estimated TSS: ~65
 */
export const SPEED_INTERVALS_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Speed Intervals",
  description: "High-intensity speed intervals for VO2 max development",
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Include some strides in final 5 minutes to prepare for speed",
    })
    .interval({
      repeat: 6,
      steps: [
        {
          name: "Speed Interval",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(92)],
          notes: "Fast pace - should feel hard but controlled",
        },
        {
          name: "Recovery Jog",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(65)],
          notes: "Light jog to recover",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Easy pace to bring heart rate down",
    })
    .build(),
};

/**
 * Easy Recovery Run - Indoor Treadmill
 * Total time: 30 minutes
 * Estimated TSS: ~25
 */
export const EASY_RECOVERY_RUN: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Easy Recovery Run",
  description: "Low-intensity recovery run for active recovery",
  structure: createPlan()
    .step({
      name: "Easy Recovery Run",
      duration: Duration.minutes(30),
      targets: [Target.thresholdHR(60)],
      notes: "Very easy pace - should feel relaxed and restorative",
    })
    .build(),
};

/**
 * Hill Intervals - Indoor Treadmill
 * Total time: 45 minutes
 * Estimated TSS: ~70
 */
export const HILL_INTERVALS_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Hill Intervals",
  description: "Incline-based intervals for strength and power development",
  structure: createPlan()
    .step({
      name: "Flat Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Start on 0% grade, gradually increase pace",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Hill Climb",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(88)],
          notes: "Increase incline to 6-8%, maintain strong effort uphill",
        },
        {
          name: "Recovery Descent",
          duration: Duration.seconds(90),
          targets: [Target.thresholdHR(65)],
          notes: "Return to 0% grade, easy jog to recover",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Flat grade, easy pace to cool down",
    })
    .build(),
};

export const SAMPLE_TREADMILL_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    THRESHOLD_RUN_WORKOUT_1,
    THRESHOLD_RUN_WORKOUT_2,
    SPEED_INTERVALS_WORKOUT,
    EASY_RECOVERY_RUN,
    HILL_INTERVALS_WORKOUT,
  ];
