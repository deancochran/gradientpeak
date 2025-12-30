import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Easy Aerobic Run - Outdoor
 * Total time: 45 minutes
 * Estimated TSS: ~35
 */
export const EASY_AEROBIC_RUN: RecordingServiceActivityPlan = {
  id: "3b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e",
  version: "2.0",
  name: "Easy Aerobic Run",
  description: "Comfortable outdoor run focusing on aerobic base building",
  activity_category: "run",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Easy Run",
      duration: Duration.minutes(45),
      targets: [Target.thresholdHR(65)],
      notes:
        "Should feel comfortable and easy - you should be able to hold a conversation",
    })
    .build(),
};

/**
 * Tempo Run - Outdoor
 * Total time: 60 minutes
 * Estimated TSS: ~75
 */
export const TEMPO_RUN: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Tempo Run",
  description: "Sustained tempo effort with warm-up and cool-down",
  activity_category: "run",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Warm-up Jog",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Gradually increase pace to prepare for tempo",
    })
    .step({
      name: "Tempo Block",
      duration: Duration.minutes(30),
      targets: [Target.thresholdHR(85)],
      notes: "Steady, controlled effort - should feel comfortably hard",
    })
    .step({
      name: "Cool-down Jog",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Relax and gradually bring heart rate down",
    })
    .build(),
};

/**
 * Interval Training - Outdoor
 * Total time: 55 minutes
 * Estimated TSS: ~85
 */
export const INTERVAL_RUN: RecordingServiceActivityPlan = {
  id: "4c7d8e9f-0a1b-2c3d-4e5f-6a7b8c9d0e1f",
  version: "2.0",
  name: "5K Pace Intervals",
  description: "High-intensity intervals at 5K race pace",
  activity_category: "run",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Start easy and gradually build pace",
    })
    .interval({
      repeat: 6,
      steps: [
        {
          name: "5K Pace Interval",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(95)],
          notes: "Run at your 5K race pace - this should feel hard",
        },
        {
          name: "Recovery Jog",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(70)],
          notes: "Active recovery - keep moving but very easy",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Easy pace to bring heart rate down",
    })
    .build(),
};

/**
 * Long Run - Outdoor
 * Total time: 90 minutes
 * Estimated TSS: ~65
 */
export const LONG_RUN: RecordingServiceActivityPlan = {
  id: "5d8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
  version: "2.0",
  name: "Long Steady Run",
  description: "Extended aerobic run for endurance building",
  activity_category: "run",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Easy Start",
      duration: Duration.minutes(30),
      targets: [Target.thresholdHR(65)],
      notes: "Start easy and settle into rhythm",
    })
    .step({
      name: "Steady Middle",
      duration: Duration.seconds(3000), // 50 minutes
      targets: [Target.thresholdHR(75)],
      notes: "Maintain steady, comfortable effort",
    })
    .step({
      name: "Easy Finish",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Relax and finish strong but controlled",
    })
    .build(),
};

/**
 * Fartlek Run - Outdoor
 * Total time: 50 minutes
 * Estimated TSS: ~70
 */
export const FARTLEK_RUN: RecordingServiceActivityPlan = {
  id: "6e9f0a1b-2c3d-4e5f-6a7b-8c9d0e1f2a3b",
  version: "2.0",
  name: "Fartlek Training",
  description: "Unstructured speed play with varied intensities",
  activity_category: "run",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Start easy and prepare for varied efforts",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Hard Surge",
          duration: Duration.seconds(90),
          targets: [Target.thresholdHR(90)],
          notes: "Surge to hard effort - use terrain and feel",
        },
        {
          name: "Easy Recovery",
          duration: Duration.seconds(150),
          targets: [Target.thresholdHR(70)],
          notes: "Relax and recover between surges",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Easy pace to bring heart rate down",
    })
    .build(),
};

export const SYSTEM_TEMPO_RUN: RecordingServiceActivityPlan = {
  id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
  version: "2.0",
  name: "Tempo Run",
  description:
    "20 minute tempo run at 85% FTP - Comfortably hard sustained effort",
  activity_category: "run",
  activity_location: "outdoor",
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(10),
      targets: [Target.ftp(65)],
      notes: "Easy warmup pace",
    })
    .step({
      name: "Tempo",
      duration: Duration.minutes(20),
      targets: [Target.ftp(85), Target.bpm(165)],
      notes: "Comfortably hard tempo pace",
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.ftp(60)],
      notes: "Easy cool down",
    })
    .build(),
};

export const SYSTEM_THRESHOLD_INTERVALS_RUN: RecordingServiceActivityPlan = {
  id: "c7d3e6f5-0a4b-9c8d-3e2f-4a1b7c6d5e3a",
  version: "2.0",
  name: "Threshold Intervals",
  description: "6x1km at 95% FTP with 2min recovery - Build speed endurance",
  activity_category: "run",
  activity_location: "outdoor",
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(15),
      targets: [Target.ftp(65)],
    })
    .interval({
      repeat: 6,
      name: "Intervals",
      steps: [
        {
          name: "Fast",
          duration: Duration.km(1),
          targets: [Target.ftp(95)],
          notes: "Threshold pace",
        },
        {
          name: "Recovery",
          duration: Duration.minutes(2),
          targets: [Target.ftp(60)],
          notes: "Easy jog",
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.ftp(60)],
    })
    .build(),
};

export const SYSTEM_LONG_EASY_RUN: RecordingServiceActivityPlan = {
  id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
  version: "2.0",
  name: "Long Easy Run",
  description: "15km easy long run at 70% effort - Build aerobic endurance",
  activity_category: "run",
  activity_location: "outdoor",
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(10),
      targets: [Target.ftp(65)],
    })
    .step({
      name: "Easy Long Run",
      duration: Duration.km(15),
      targets: [Target.ftp(70), Target.bpm(145)],
      notes: "Maintain steady aerobic pace",
      intervalName: "Main Set",
    })
    .cooldown({
      duration: Duration.minutes(5),
      targets: [Target.ftp(60)],
    })
    .build(),
};

export const SAMPLE_OUTDOOR_RUN_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    EASY_AEROBIC_RUN,
    INTERVAL_RUN,
    LONG_RUN,
    FARTLEK_RUN,
    SYSTEM_TEMPO_RUN,
    SYSTEM_THRESHOLD_INTERVALS_RUN,
    SYSTEM_LONG_EASY_RUN,
  ];
