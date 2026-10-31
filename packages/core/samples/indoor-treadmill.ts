import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilderFactory } from "./activity-plan-builder";
import type { SystemActivityPlanTemplate as RecordingServiceActivityPlan } from "./types";

const createPlan = createSystemActivityPlanBuilderFactory("run", [
  "Progressive Warm-up:1:Progressive Warm-up|Interval 2:4:Threshold Interval:Active Recovery|Cool-down:1:Cool-down",
  "Warm-up Jog:1:Warm-up Jog|Interval 2:3:Long Threshold Interval:Recovery Jog|Short Threshold Push:1:Short Threshold Push|Cool-down:1:Cool-down",
  "Progressive Warm-up:1:Progressive Warm-up|Interval 2:6:Speed Interval:Recovery Jog|Cool-down:1:Cool-down",
  "Easy Recovery Run:1:Easy Recovery Run",
  "Flat Warm-up:1:Flat Warm-up|Interval 2:8:Hill Climb:Recovery Descent|Cool-down:1:Cool-down",
]);

/**
 * Threshold Run - Indoor Treadmill
 * Total time: 50 minutes
 * Estimated Common Load: ~60
 */
export const THRESHOLD_RUN_WORKOUT_1: RecordingServiceActivityPlan = {
  id: "8e1f2a3b-4c5d-4e7f-8a9b-0c1d2e3f4a5b",
  name: "Threshold Run Development 1",
  description: "Indoor treadmill session focusing on threshold heart rate intervals",
  gps_recording_enabled: false,
  training_intent: "threshold_development",
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
          targets: [Target.thresholdHR(95)],
          notes: "Steady effort at high intensity",
        },
        {
          name: "Active Recovery",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(70)],
          notes:
            "Jog very easily; walk briefly if needed. Let heart rate fall naturally rather than chasing the target immediately after the effort.",
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
 * Estimated Common Load: ~70
 */
export const THRESHOLD_RUN_WORKOUT_2: RecordingServiceActivityPlan = {
  id: "9f2a3b4c-5d6e-4f8a-9b0c-1d2e3f4a5b6c",
  name: "Threshold Run Development 2",
  description: "Longer indoor treadmill threshold session with progressive intervals",
  gps_recording_enabled: false,
  training_intent: "threshold_development",
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
          targets: [Target.thresholdHR(95)],
          notes: "Maintain pace comfortably hard",
        },
        {
          name: "Recovery Jog",
          duration: Duration.minutes(5),
          targets: [Target.thresholdHR(60)],
          notes:
            "Jog very easily with relaxed breathing. Let heart rate fall naturally; do not speed up to chase the recovery target.",
        },
      ],
    })
    .step({
      name: "Short Threshold Push",
      duration: Duration.minutes(3),
      targets: [Target.thresholdHR(95)],
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
 * Estimated Common Load: ~65
 */
export const SPEED_INTERVALS_WORKOUT: RecordingServiceActivityPlan = {
  id: "0a3b4c5d-6e7f-4a9b-8c1d-2e3f4a5b6c7d",
  name: "Speed Intervals",
  description: "High-intensity speed intervals for VO2 max development",
  gps_recording_enabled: false,
  training_intent: "vo2max",
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
          targets: [Target.thresholdHR(105)],
          notes: "Fast pace - should feel hard but controlled",
        },
        {
          name: "Recovery Jog",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(65)],
          notes:
            "Jog very easily; walk briefly if needed to regain controlled breathing before the next fast interval.",
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
 * Estimated Common Load: ~25
 */

/**
 * Hill Intervals - Indoor Treadmill
 * Total time: 45 minutes
 * Estimated Common Load: ~70
 */
export const HILL_INTERVALS_WORKOUT: RecordingServiceActivityPlan = {
  id: "2c5d6e7f-8a9b-4c1d-ae3f-4a5b6c7d8e9f",
  name: "Hill Intervals",
  description: "Incline-based intervals for strength and power development",
  gps_recording_enabled: false,
  training_intent: "muscular_endurance",
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
          targets: [Target.thresholdHR(90)],
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

export const SAMPLE_TREADMILL_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  THRESHOLD_RUN_WORKOUT_1,
  THRESHOLD_RUN_WORKOUT_2,
  SPEED_INTERVALS_WORKOUT,
  HILL_INTERVALS_WORKOUT,
];
