import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Easy Aerobic Run - Outdoor
 * Total time: 45 minutes
 * Estimated TSS: ~35
 */
export const EASY_AEROBIC_RUN: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Easy Aerobic Run",
  description: "Comfortable outdoor run focusing on aerobic base building",
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
  version: "2.0",
  name: "5K Pace Intervals",
  description: "High-intensity intervals at 5K race pace",
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
  version: "2.0",
  name: "Long Steady Run",
  description: "Extended aerobic run for endurance building",
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
  version: "2.0",
  name: "Fartlek Training",
  description: "Unstructured speed play with varied intensities",
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

export const SAMPLE_OUTDOOR_RUN_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [EASY_AEROBIC_RUN, TEMPO_RUN, INTERVAL_RUN, LONG_RUN, FARTLEK_RUN];
