/**
 * Sample Indoor Bike Trainer Activities for Development Testing
 *
 * These activities provide realistic examples for testing schema navigation,
 * compliance scoring, and UI components during development.
 */

import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Advanced Indoor Bike Activity - VO2 Max Intervals
 * Total time: 75 minutes
 * Estimated TSS: ~95
 */
export const SAMPLE_VO2_MAX_WORKOUT: RecordingServiceActivityPlan = {
  id: "8a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
  version: "2.0",
  name: "VO2 Max Development",
  description: "75-minute activity with challenging VO2 max intervals",
  activity_category: "bike",
  activity_location: "indoor",
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
  id: "9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
  version: "2.0",
  name: "Active Recovery Ride",
  description: "45-minute easy recovery ride to promote blood flow",
  activity_category: "bike",
  activity_location: "indoor",
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
  id: "0c3d4e5f-6a7b-8c9d-0e1f-2a3b4c5d6e7f",
  version: "2.0",
  name: "Sprint Power Development",
  description:
    "Short activity focusing on neuromuscular power and sprint development",
  activity_category: "bike",
  activity_location: "indoor",
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
  id: "1d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a",
  version: "2.0",
  name: "Threshold Heart Rate Intervals",
  description:
    "45-minute indoor trainer activity focused on threshold heart rate intervals. Maintain steady cadence of 85-95 RPM and target threshold HR zones during main intervals.",
  activity_category: "bike",
  activity_location: "indoor",
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
  id: "2e5f6a7b-8c9d-0e1f-2a3b-4c5d6e7f8a9b",
  version: "2.0",
  name: "Comprehensive 1-Minute Schema Test",
  description:
    "A short test activity containing every major step type and target style to validate parsing, UI rendering, and compliance scoring.",
  activity_category: "bike",
  activity_location: "indoor",
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

export const SYSTEM_SWEET_SPOT_WORKOUT: RecordingServiceActivityPlan = {
  id: "d2c8f1a0-5b9e-4e3a-8f7d-9c6b4a2e1f0d",
  version: "2.0",
  name: "Sweet Spot Intervals",
  description: "Classic sweet spot workout with 3x10min intervals at 90% FTP",
  activity_category: "bike",
  activity_location: "indoor",
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(10),
      targets: [Target.ftp(60)],
      notes: "Easy spin to warm up",
    })
    .step({
      name: "Build",
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
          duration: Duration.minutes(10),
          targets: [Target.ftp(90), Target.bpm(155)],
          notes: "Steady effort in sweet spot zone",
        },
        {
          name: "Recovery",
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

export const SYSTEM_VO2_MAX_WORKOUT: RecordingServiceActivityPlan = {
  id: "e3d9a2b1-6c0f-5f4b-9a8e-0d7c5b3f2a1e",
  version: "2.0",
  name: "VO2 Max Intervals",
  description:
    "5x3min at 120% FTP with 3min recovery - High intensity aerobic capacity development",
  activity_category: "bike",
  activity_location: "indoor",
  structure: createPlan()
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
          duration: Duration.minutes(3),
          targets: [Target.ftp(120), Target.bpm(180)],
          notes: "Maximum sustainable effort",
        },
        {
          name: "Recovery",
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
    .build(),
};

export const SYSTEM_FTP_INTERVALS_WORKOUT: RecordingServiceActivityPlan = {
  id: "f4e0b3c2-7d1a-6a5c-0b9f-1e8d6c4a3b2f",
  version: "2.0",
  name: "FTP Intervals",
  description:
    "4x8min at 95% FTP (threshold) - Build sustainable power at threshold",
  activity_category: "bike",
  activity_location: "indoor",
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
          duration: Duration.minutes(8),
          targets: [Target.ftp(95), Target.thresholdHR(100)],
          notes: "At threshold - max sustainable for 1 hour",
        },
        {
          name: "Recovery",
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

export const SAMPLE_INDOOR_TRAINER_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    SAMPLE_VO2_MAX_WORKOUT,
    SAMPLE_RECOVERY_WORKOUT,
    SAMPLE_SPRINT_WORKOUT,
    SAMPLE_THRESHOLD_HR_WORKOUT,
    SAMPLE_TESTING_WORKOUT,
    SYSTEM_SWEET_SPOT_WORKOUT,
    SYSTEM_VO2_MAX_WORKOUT,
    SYSTEM_FTP_INTERVALS_WORKOUT,
  ];
