/**
 * Sample Indoor Bike Trainer Activities for Development Testing
 *
 * These activities provide realistic examples for testing schema navigation,
 * compliance scoring, and UI components during development.
 */

import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Beginner Indoor Bike Activity - Sweet Spot Intervals
 * Total time: 60 minutes
 * Estimated TSS: ~75
 */
export const SAMPLE_SWEET_SPOT_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Sweet Spot Intervals",
  description:
    "60-minute indoor trainer activity focusing on sweet spot power development. Focus on maintaining steady power output during intervals. Use cadence of 85-95 RPM throughout",
  estimated_tss: 75,
  estimated_duration: 3600,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.ftp(55)],
      notes: "Focus on smooth pedaling and getting the legs moving",
    })
    .step({
      name: "Build to Threshold",
      duration: Duration.minutes(5),
      targets: [Target.ftp(85)],
      notes: "Steady progressive increase in effort",
    })
    .step({
      name: "Recovery",
      duration: Duration.minutes(3),
      targets: [Target.ftp(55)],
      notes: "Keep legs moving, prepare for main set",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Sweet Spot Interval",
          duration: Duration.minutes(8),
          targets: [Target.ftp(90)],
          notes: "Hold steady power in sweet spot zone (88-94% FTP)",
        },
        {
          name: "Recovery",
          duration: Duration.minutes(3),
          targets: [Target.ftp(55)],
          notes: "Active recovery, keep pedaling easy",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.ftp(50)],
      notes: "Easy spinning to flush the legs",
    })
    .build(),
};

/**
 * Advanced Indoor Bike Activity - VO2 Max Intervals
 * Total time: 75 minutes
 * Estimated TSS: ~95
 */
export const SAMPLE_VO2_MAX_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "VO2 Max Development",
  description: "75-minute activity with challenging VO2 max intervals",
  estimated_tss: 95,
  estimated_duration: 4500,
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.ftp(60)],
      notes: "Start easy and build gradually. Include some leg openers.",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Activation Effort",
          duration: Duration.seconds(30),
          targets: [Target.ftp(120)],
          notes: "Hard but controlled effort",
        },
        {
          name: "Recovery",
          duration: Duration.seconds(150),
          targets: [Target.ftp(55)],
          notes: "Complete recovery before next effort",
        },
      ],
    })
    .step({
      name: "Preparation",
      duration: Duration.minutes(5),
      targets: [Target.ftp(55)],
      notes: "Mental preparation for the main set",
    })
    .interval({
      repeat: 5,
      steps: [
        {
          name: "VO2 Max Interval",
          duration: Duration.minutes(5),
          targets: [Target.ftp(110)],
          notes:
            "Sustained effort at VO2 max power. Focus on smooth breathing.",
        },
        {
          name: "Recovery",
          duration: Duration.minutes(4),
          targets: [Target.ftp(55)],
          notes: "Active recovery. Heart rate should come down significantly.",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(15),
      targets: [Target.ftp(50)],
      notes: "Take time to cool down properly after intense efforts",
    })
    .build(),
};

/**
 * Recovery Indoor Bike Activity
 * Total time: 45 minutes
 * Estimated TSS: ~25
 */
export const SAMPLE_RECOVERY_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Active Recovery Ride",
  description: "45-minute easy recovery ride to promote blood flow",
  estimated_tss: 25,
  estimated_duration: 2700,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      duration: Duration.minutes(5),
      targets: [Target.ftp(45)],
      notes: "Start very easy, just getting the legs moving",
    })
    .step({
      name: "Steady Recovery Effort",
      duration: Duration.minutes(35),
      targets: [Target.maxHR(65)],
      notes:
        "Comfortable conversational effort. Should feel refreshing, not tiring.",
    })
    .step({
      name: "Easy Cool-down",
      duration: Duration.minutes(5),
      targets: [Target.ftp(45)],
      notes: "End as easy as you started",
    })
    .build(),
};

/**
 * Sprint Power Development Activity
 * Total time: 50 minutes
 * Estimated TSS: ~55
 */
export const SAMPLE_SPRINT_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Sprint Power Development",
  description:
    "Short activity focusing on neuromuscular power and sprint development",
  estimated_tss: 55,
  estimated_duration: 2100,
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.ftp(60)],
      notes: "Include some higher cadence work to prepare for sprints",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Sprint Opener",
          duration: Duration.seconds(10),
          targets: [Target.watts(600)],
          notes: "All-out sprint from moderate speed",
        },
        {
          name: "Recovery",
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
          duration: Duration.seconds(15),
          targets: [Target.watts(750)],
          notes: "All-out sprint - maximum power output",
        },
        {
          name: "Recovery",
          duration: Duration.seconds(345),
          targets: [Target.ftp(50)],
          notes: "Complete recovery is essential for quality",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.ftp(50)],
      notes: "Easy spinning to flush lactate",
    })
    .build(),
};

export const SAMPLE_THRESHOLD_HR_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Threshold Heart Rate Intervals",
  description:
    "45-minute indoor trainer activity focused on threshold heart rate intervals. Maintain steady cadence of 85-95 RPM and target threshold HR zones during main intervals.",
  estimated_tss: 60,
  estimated_duration: 2700, // 45 minutes
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Spin easy, focus on smooth pedaling and preparing the legs",
    })
    .step({
      name: "Gradual Build",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(75)],
      notes: "Steadily increase intensity to get near threshold",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Threshold Interval",
          duration: Duration.minutes(5),
          targets: [Target.thresholdHR(100)],
          notes:
            "Maintain steady cadence, focus on consistent threshold effort",
        },
        {
          name: "Recovery",
          duration: Duration.seconds(150),
          targets: [Target.thresholdHR(65)],
          notes: "Spin easy to recover, prepare for next interval",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(55)],
      notes: "Spin easy, focus on relaxed breathing and form",
    })
    .build(),
};

export const SAMPLE_TESTING_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Comprehensive 1-Minute Schema Test",
  description:
    "A short test activity containing every major step type and target style to validate parsing, UI rendering, and compliance scoring.",
  estimated_tss: 1,
  estimated_duration: 60,
  structure: createPlan()
    .step({
      name: "Warm-up Spin",
      duration: Duration.seconds(10),
      targets: [Target.ftp(60)],
      notes: "Smooth cadence around 90 RPM",
    })
    .step({
      name: "Threshold Effort",
      duration: Duration.seconds(10),
      targets: [Target.thresholdHR(100)],
      notes: "Simulate sustained threshold effort",
    })
    .step({
      name: "High-HR Surge",
      duration: Duration.seconds(10),
      targets: [Target.maxHR(95)],
      notes: "Short high-intensity test for HR mapping",
    })
    .step({
      name: "Fixed Watt Step",
      duration: Duration.seconds(10),
      targets: [Target.watts(250)],
      notes: "Test absolute watt targeting logic",
    })
    .interval({
      repeat: 2,
      steps: [
        {
          name: "Cadence Drill",
          duration: Duration.seconds(5),
          targets: [Target.cadence(110)],
          notes: "Check non-power/HR target parsing",
        },
        {
          name: "Micro-Recovery",
          duration: Duration.seconds(2),
          targets: [Target.ftp(50)],
          notes: "Verify short-duration handling",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.seconds(11),
      targets: [Target.thresholdHR(60)],
      notes: "End of test sequence",
    })
    .build(),
};

export const SAMPLE_INDOOR_TRAINER_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    SAMPLE_SWEET_SPOT_WORKOUT,
    SAMPLE_VO2_MAX_WORKOUT,
    SAMPLE_RECOVERY_WORKOUT,
    SAMPLE_SPRINT_WORKOUT,
    SAMPLE_THRESHOLD_HR_WORKOUT,
    SAMPLE_TESTING_WORKOUT,
  ];
