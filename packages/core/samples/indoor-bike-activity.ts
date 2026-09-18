/**
 * Sample Indoor Bike Trainer Activities for Development Testing
 *
 * These activities provide realistic examples for testing schema navigation,
 * compliance scoring, and UI components during development.
 */

import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilderFactory } from "./activity-plan-builder";
import type { SystemActivityPlanTemplate as RecordingServiceActivityPlan } from "./types";

const createPlan = createSystemActivityPlanBuilderFactory("bike", [
  "Progressive Warm-up:1:Progressive Warm-up|Interval 2:3:Activation Effort:Recovery|Preparation:1:Preparation|Interval 4:5:VO2 Max Interval:Recovery|Cool-down:1:Cool-down",
  "Easy Warm-up:1:Easy Warm-up|Steady Recovery Effort:1:Steady Recovery Effort|Easy Cool-down:1:Easy Cool-down",
  "Progressive Warm-up:1:Progressive Warm-up|Interval 2:3:Sprint Opener:Recovery|Interval 3:6:Max Sprint:Recovery|Cool-down:1:Cool-down",
  "Easy Warm-up:1:Easy Warm-up|Gradual Build:1:Gradual Build|Interval 3:4:Threshold Interval:Recovery|Cool-down:1:Cool-down",
  "Warm-up Spin:1:Warm-up Spin|Threshold Effort:1:Threshold Effort|High-HR Surge:1:High-HR Surge|Fixed Watt Step:1:Fixed Watt Step|Interval 5:2:Cadence Drill:Micro-Recovery|Cool-down:1:Cool-down",
  "Warmup:1:Warmup|Build:1:Build|Sweet Spot:3:Sweet Spot:Recovery|Cooldown:1:Cooldown",
  "Warmup:1:Warmup|VO2 Max:5:Hard:Recovery|Cooldown:1:Cooldown",
  "Warmup:1:Warmup|Threshold:4:Threshold:Recovery|Cooldown:1:Cooldown",
]);

/**
 * Advanced Indoor Bike Activity - VO2 Max Intervals
 * Total time: 75 minutes
 * Estimated Common Load: ~95
 */
export const SAMPLE_VO2_MAX_WORKOUT: RecordingServiceActivityPlan = {
  id: "8a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d",
  name: "VO2 Max Development",
  description: "75-minute activity with challenging VO2 max intervals",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      purpose: "warmup",
      duration: Duration.minutes(15),
      targets: [Target.ftp(60)],
      notes: "Start easy and build gradually. Include some leg openers.",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Activation Effort",
          purpose: "warmup",
          duration: Duration.seconds(30),
          targets: [Target.ftp(120)],
          notes: "Hard but controlled effort",
        },
        {
          name: "Recovery",
          purpose: "recovery",
          duration: Duration.seconds(150),
          targets: [Target.ftp(55)],
          notes: "Complete recovery before next effort",
        },
      ],
    })
    .step({
      name: "Preparation",
      purpose: "recovery",
      duration: Duration.minutes(5),
      targets: [Target.ftp(55)],
      notes: "Mental preparation for the main set",
    })
    .interval({
      repeat: 5,
      steps: [
        {
          name: "VO2 Max Interval",
          purpose: "work",
          duration: Duration.minutes(5),
          targets: [Target.ftp(110)],
          notes: "Sustained effort at VO2 max power. Focus on smooth breathing.",
        },
        {
          name: "Recovery",
          purpose: "recovery",
          duration: Duration.minutes(4),
          targets: [Target.ftp(55)],
          notes: "Active recovery. Heart rate should come down significantly.",
        },
      ],
    })
    .step({
      name: "Cool-down",
      purpose: "cooldown",
      duration: Duration.minutes(15),
      targets: [Target.ftp(50)],
      notes: "Take time to cool down properly after intense efforts",
    })
    .build(),
};

/**
 * Recovery Indoor Bike Activity
 * Total time: 45 minutes
 * Estimated Common Load: ~25
 */
export const SAMPLE_RECOVERY_WORKOUT: RecordingServiceActivityPlan = {
  id: "9b2c3d4e-5f6a-4b8c-9d0e-1f2a3b4c5d6e",
  name: "Active Recovery Ride",
  description: "45-minute easy recovery ride to promote blood flow",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      purpose: "warmup",
      duration: Duration.minutes(5),
      targets: [Target.ftp(45)],
      notes: "Start very easy, just getting the legs moving",
    })
    .step({
      name: "Steady Recovery Effort",
      purpose: "recovery",
      duration: Duration.minutes(35),
      targets: [Target.maxHR(65)],
      notes: "Comfortable conversational effort. Should feel refreshing, not tiring.",
    })
    .step({
      name: "Easy Cool-down",
      purpose: "cooldown",
      duration: Duration.minutes(5),
      targets: [Target.ftp(45)],
      notes: "End as easy as you started",
    })
    .build(),
};

/**
 * Sprint Power Development Activity
 * Total time: 50 minutes
 * Estimated Common Load: ~55
 */
export const SAMPLE_SPRINT_WORKOUT: RecordingServiceActivityPlan = {
  id: "0c3d4e5f-6a7b-4c9d-8e1f-2a3b4c5d6e7f",
  name: "Sprint Power Development",
  description: "Short activity focusing on neuromuscular power and sprint development",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      purpose: "warmup",
      duration: Duration.minutes(15),
      targets: [Target.ftp(60)],
      notes: "Include some higher cadence work to prepare for sprints",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Sprint Opener",
          purpose: "warmup",
          duration: Duration.seconds(10),
          targets: [Target.watts(600)],
          notes: "All-out sprint from moderate speed",
        },
        {
          name: "Recovery",
          purpose: "recovery",
          duration: Duration.seconds(230),
          targets: [Target.ftp(55)],
          notes: "Complete recovery",
        },
      ],
    })
    .interval({
      repeat: 6,
      steps: [
        {
          name: "Max Sprint",
          purpose: "work",
          duration: Duration.seconds(15),
          targets: [Target.watts(750)],
          notes: "All-out sprint - maximum power output",
        },
        {
          name: "Recovery",
          purpose: "recovery",
          duration: Duration.seconds(345),
          targets: [Target.ftp(50)],
          notes: "Complete recovery is essential for quality",
        },
      ],
    })
    .step({
      name: "Cool-down",
      purpose: "cooldown",
      duration: Duration.minutes(10),
      targets: [Target.ftp(50)],
      notes: "Easy spinning to flush lactate",
    })
    .build(),
};

export const SAMPLE_THRESHOLD_HR_WORKOUT: RecordingServiceActivityPlan = {
  id: "1d4e5f6a-7b8c-4d0e-9f2a-3b4c5d6e7f8a",
  name: "Threshold Heart Rate Intervals",
  description:
    "45-minute indoor trainer activity focused on threshold heart rate intervals. Maintain steady cadence of 85-95 RPM and target threshold HR zones during main intervals.",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      purpose: "warmup",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Spin easy, focus on smooth pedaling and preparing the legs",
    })
    .step({
      name: "Gradual Build",
      purpose: "warmup",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(75)],
      notes: "Steadily increase intensity to get near threshold",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Threshold Interval",
          purpose: "work",
          duration: Duration.minutes(5),
          targets: [Target.thresholdHR(100)],
          notes: "Maintain steady cadence, focus on consistent threshold effort",
        },
        {
          name: "Recovery",
          purpose: "recovery",
          duration: Duration.seconds(150),
          targets: [Target.thresholdHR(65)],
          notes: "Spin easy to recover, prepare for next interval",
        },
      ],
    })
    .step({
      name: "Cool-down",
      purpose: "cooldown",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(55)],
      notes: "Spin easy, focus on relaxed breathing and form",
    })
    .build(),
};

export const SAMPLE_TESTING_WORKOUT: RecordingServiceActivityPlan = {
  id: "2e5f6a7b-8c9d-4e1f-aa3b-4c5d6e7f8a9b",
  name: "Comprehensive 1-Minute Schema Test",
  description:
    "A short test activity containing every major step type and target style to validate parsing, UI rendering, and compliance scoring.",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Warm-up Spin",
      purpose: "warmup",
      duration: Duration.seconds(10),
      targets: [Target.ftp(60)],
      notes: "Smooth cadence around 90 RPM",
    })
    .step({
      name: "Threshold Effort",
      purpose: "work",
      duration: Duration.seconds(10),
      targets: [Target.thresholdHR(100)],
      notes: "Simulate sustained threshold effort",
    })
    .step({
      name: "High-HR Surge",
      purpose: "work",
      duration: Duration.seconds(10),
      targets: [Target.maxHR(95)],
      notes: "Short high-intensity test for HR mapping",
    })
    .step({
      name: "Fixed Watt Step",
      purpose: "work",
      duration: Duration.seconds(10),
      targets: [Target.watts(250)],
      notes: "Test absolute watt targeting logic",
    })
    .interval({
      repeat: 2,
      steps: [
        {
          name: "Cadence Drill",
          purpose: "technique",
          duration: Duration.seconds(5),
          targets: [Target.cadence(110), Target.rpe(3)],
          notes: "Check non-power/HR target parsing",
        },
        {
          name: "Micro-Recovery",
          purpose: "recovery",
          duration: Duration.seconds(2),
          targets: [Target.ftp(50)],
          notes: "Verify short-duration handling",
        },
      ],
    })
    .step({
      name: "Cool-down",
      purpose: "cooldown",
      duration: Duration.seconds(11),
      targets: [Target.thresholdHR(60)],
      notes: "End of test sequence",
    })
    .build(),
};

export const SYSTEM_SWEET_SPOT_WORKOUT: RecordingServiceActivityPlan = {
  id: "d2c8f1a0-5b9e-4e3a-8f7d-9c6b4a2e1f0d",
  name: "Sweet Spot Intervals",
  description: "Classic sweet spot activity with 3x10min intervals at 90% FTP",
  gps_recording_enabled: false,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(10),
      targets: [Target.ftp(60)],
      notes: "Easy spin to warm up",
    })
    .step({
      name: "Build",
      purpose: "warmup",
      duration: Duration.minutes(5),
      targets: [Target.ftp(75)],
      notes: "Gradually increase intensity",
    })
    .interval({
      repeat: 3,
      name: "Sweet Spot",
      steps: [
        {
          name: "Sweet Spot",
          purpose: "work",
          duration: Duration.minutes(10),
          targets: [Target.ftp(90)],
          notes: "Steady effort in sweet spot zone",
        },
        {
          name: "Recovery",
          purpose: "recovery",
          duration: Duration.minutes(5),
          targets: [Target.ftp(55)],
          notes: "Easy recovery spin",
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.ftp(50)],
      notes: "Easy spin to cool down",
    })
    .build(),
};

const systemVo2MaxStructure = createPlan()
  .warmup({
    duration: Duration.minutes(15),
    targets: [Target.ftp(65)],
  })
  .interval({
    repeat: 5,
    name: "VO2 Max",
    steps: [
      {
        name: "Hard",
        purpose: "work",
        duration: Duration.minutes(3),
        targets: [Target.ftp(120)],
        notes: "Maximum sustainable effort",
      },
      {
        name: "Recovery",
        purpose: "recovery",
        duration: Duration.minutes(3),
        targets: [Target.ftp(50)],
        notes: "Full recovery",
      },
    ],
  })
  .cooldown({
    duration: Duration.minutes(10),
    targets: [Target.ftp(55)],
  })
  .build();
const systemVo2Segment = systemVo2MaxStructure.segments[0];
if (!systemVo2Segment || systemVo2Segment.role !== "activity") {
  throw new Error("System VO2max structure is missing its activity segment");
}
const systemVo2Interval = systemVo2Segment.intervals[1];
const systemVo2WorkStep = systemVo2Interval?.steps[0];
const systemVo2RecoveryStep = systemVo2Interval?.steps[1];
if (!systemVo2Interval || !systemVo2WorkStep || !systemVo2RecoveryStep) {
  throw new Error("System VO2max structure is missing its adaptable interval");
}

export const SYSTEM_VO2_MAX_WORKOUT: RecordingServiceActivityPlan = {
  id: "e3d9a2b1-6c0f-5f4b-9a8e-0d7c5b3f2a1e",
  name: "VO2 Max Intervals",
  description:
    "5x3min at 120% FTP with 3min recovery - High intensity aerobic capacity development",
  gps_recording_enabled: false,
  training_intent: "vo2max",
  structure: systemVo2MaxStructure,
  adaptation: {
    controls: [
      {
        id: "4cefb72f-82d0-4e8b-8259-241ffbe18a80",
        key: "work_repetitions",
        label: "Work repetitions",
        kind: "interval_repetitions",
        range: { minimum: 3, default: 5, maximum: 6, increment: 1 },
        targets: [
          {
            type: "interval_repetitions",
            activitySegmentId: systemVo2Segment.id,
            intervalId: systemVo2Interval.id,
          },
        ],
      },
      {
        id: "984774d3-7416-4c35-ae72-013ce36ce25a",
        key: "work_seconds",
        label: "Work duration",
        kind: "step_quantity",
        range: { minimum: 180, default: 180, maximum: 300, increment: 60 },
        targets: [
          {
            type: "step_quantity",
            activitySegmentId: systemVo2Segment.id,
            intervalId: systemVo2Interval.id,
            stepId: systemVo2WorkStep.id,
            quantityType: "time",
          },
        ],
      },
      {
        id: "b702d29f-e5eb-49bc-a30e-2c2e8feb631e",
        key: "recovery_seconds",
        label: "Recovery duration",
        kind: "recovery_quantity",
        range: { minimum: 120, default: 180, maximum: 300, increment: 60 },
        targets: [
          {
            type: "recovery_step",
            activitySegmentId: systemVo2Segment.id,
            intervalId: systemVo2Interval.id,
            stepId: systemVo2RecoveryStep.id,
            quantityType: "time",
          },
        ],
      },
      {
        id: "1d0566ac-d959-4c5d-a8d2-46fd43c4e208",
        key: "work_ftp_percent",
        label: "Work intensity",
        kind: "target_intensity",
        range: { minimum: 110, default: 120, maximum: 125, increment: 5 },
        targets: [
          {
            type: "target_intensity",
            activitySegmentId: systemVo2Segment.id,
            intervalId: systemVo2Interval.id,
            stepId: systemVo2WorkStep.id,
            targetType: "%FTP",
          },
        ],
      },
    ],
  },
};

export const SYSTEM_FTP_INTERVALS_WORKOUT: RecordingServiceActivityPlan = {
  id: "f4e0b3c2-7d1a-4a5c-8b9f-1e8d6c4a3b2f",
  name: "FTP Intervals",
  description: "4x8min at 95% FTP (threshold) - Build sustainable power at threshold",
  gps_recording_enabled: false,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(15),
      targets: [Target.ftp(65)],
    })
    .interval({
      repeat: 4,
      name: "Threshold",
      steps: [
        {
          name: "Threshold",
          purpose: "work",
          duration: Duration.minutes(8),
          targets: [Target.ftp(95)],
          notes: "At threshold - max sustainable for 1 hour",
        },
        {
          name: "Recovery",
          purpose: "recovery",
          duration: Duration.minutes(4),
          targets: [Target.ftp(55)],
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.ftp(60)],
    })
    .build(),
};

export const SAMPLE_INDOOR_TRAINER_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  SAMPLE_VO2_MAX_WORKOUT,
  SAMPLE_RECOVERY_WORKOUT,
  SAMPLE_SPRINT_WORKOUT,
  SAMPLE_THRESHOLD_HR_WORKOUT,
  SAMPLE_TESTING_WORKOUT,
  SYSTEM_SWEET_SPOT_WORKOUT,
  SYSTEM_VO2_MAX_WORKOUT,
  SYSTEM_FTP_INTERVALS_WORKOUT,
];
