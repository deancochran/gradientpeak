import { Duration, Target } from "../schemas/activity_payload";
import {
  createSystemActivityPlanAdaptationBuilder,
  createSystemActivityPlanBuilderFactory,
} from "./activity-plan-builder";
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
      purpose: "warmup",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(60)],
      notes: "Easy pace jogging to prepare legs and lungs",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Threshold Interval",
          purpose: "work",
          duration: Duration.minutes(5),
          targets: [Target.thresholdHR(95)],
          notes: "Steady effort at high intensity",
        },
        {
          name: "Active Recovery",
          purpose: "recovery",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(70)],
          notes: "Easy jog or walk to bring HR down",
        },
      ],
    })
    .step({
      name: "Cool-down",
      purpose: "cooldown",
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
      purpose: "warmup",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(60)],
      notes: "Gradually increase speed to prep for intervals",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Long Threshold Interval",
          purpose: "work",
          duration: Duration.minutes(8),
          targets: [Target.thresholdHR(95)],
          notes: "Maintain pace comfortably hard",
        },
        {
          name: "Recovery Jog",
          purpose: "recovery",
          duration: Duration.minutes(5),
          targets: [Target.thresholdHR(60)],
          notes: "Keep HR below 70% threshold",
        },
      ],
    })
    .step({
      name: "Short Threshold Push",
      purpose: "work",
      duration: Duration.minutes(3),
      targets: [Target.thresholdHR(95)],
      notes: "Push pace for short duration",
    })
    .step({
      name: "Cool-down",
      purpose: "cooldown",
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
      purpose: "warmup",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Include some strides in final 5 minutes to prepare for speed",
    })
    .interval({
      repeat: 6,
      steps: [
        {
          name: "Speed Interval",
          purpose: "work",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(105)],
          notes: "Fast pace - should feel hard but controlled",
        },
        {
          name: "Recovery Jog",
          purpose: "recovery",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(65)],
          notes: "Light jog to recover",
        },
      ],
    })
    .step({
      name: "Cool-down",
      purpose: "cooldown",
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
const easyRecoveryRunStructure = createPlan()
  .step({
    name: "Easy Recovery Run",
    purpose: "recovery",
    duration: Duration.minutes(30),
    targets: [Target.thresholdHR(60)],
    notes: "Very easy pace - should feel relaxed and restorative",
  })
  .build();
const easyRecoveryRunSegment = easyRecoveryRunStructure.segments[0];
if (!easyRecoveryRunSegment || easyRecoveryRunSegment.role !== "activity") {
  throw new Error("Easy Recovery Run must contain an activity segment");
}
const easyRecoveryRunInterval = easyRecoveryRunSegment.intervals[0];
const easyRecoveryRunStep = easyRecoveryRunInterval?.steps[0];
if (!easyRecoveryRunInterval || !easyRecoveryRunStep) {
  throw new Error("Easy Recovery Run must contain a steady step");
}

export const EASY_RECOVERY_RUN: RecordingServiceActivityPlan = {
  id: "1b4c5d6e-7f8a-4b0c-9d2e-3f4a5b6c7d8e",
  name: "Easy Recovery Run",
  description: "Low-intensity recovery run for active recovery",
  gps_recording_enabled: false,
  structure: easyRecoveryRunStructure,
  adaptation: {
    controls: [
      createSystemActivityPlanAdaptationBuilder("easy-recovery-run").control({
        key: "steady_duration_seconds",
        label: "Easy recovery duration",
        kind: "step_quantity",
        range: { minimum: 1500, default: 1800, maximum: 2100, increment: 300 },
        targets: [
          {
            type: "step_quantity",
            activitySegmentId: easyRecoveryRunSegment.id,
            intervalId: easyRecoveryRunInterval.id,
            stepId: easyRecoveryRunStep.id,
            quantityType: "time",
          },
        ],
      }),
    ],
  },
};

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
      purpose: "warmup",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Start on 0% grade, gradually increase pace",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Hill Climb",
          purpose: "work",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(88)],
          notes: "Increase incline to 6-8%, maintain strong effort uphill",
        },
        {
          name: "Recovery Descent",
          purpose: "recovery",
          duration: Duration.seconds(90),
          targets: [Target.thresholdHR(65)],
          notes: "Return to 0% grade, easy jog to recover",
        },
      ],
    })
    .step({
      name: "Cool-down",
      purpose: "cooldown",
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
  EASY_RECOVERY_RUN,
  HILL_INTERVALS_WORKOUT,
];
