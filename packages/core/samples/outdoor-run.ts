import type { RecordingServiceActivityPlan } from "../schemas";

/**
 * Easy Aerobic Run - Outdoor
 * Total time: 45 minutes
 * Estimated TSS: ~35
 */
export const EASY_AEROBIC_RUN: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Easy Aerobic Run",
  description: "Comfortable outdoor run focusing on aerobic base building",
  activity_type: "outdoor_run",
  estimated_tss: 35,
  estimated_duration: 2700, // 45 minutes
  structure: {
    steps: [
      {
        name: "Easy Run",
        description: "Maintain conversational pace throughout",
        type: "step",
        duration: { type: "time", value: 2700, unit: "seconds" }, // 45 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Should feel comfortable and easy - you should be able to hold a conversation",
      },
    ],
  },
};

/**
 * Tempo Run - Outdoor
 * Total time: 60 minutes
 * Estimated TSS: ~75
 */
export const TEMPO_RUN: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Tempo Run",
  description: "Sustained tempo effort with warm-up and cool-down",
  activity_type: "outdoor_run",
  estimated_tss: 75,
  estimated_duration: 3600, // 60 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Warm-up Jog",
        description: "Easy pace to prepare for tempo effort",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Gradually increase pace to prepare for tempo",
      },

      // Main tempo block
      {
        name: "Tempo Block",
        description: "Comfortably hard sustained effort",
        type: "step",
        duration: { type: "time", value: 1800, unit: "seconds" }, // 30 min
        targets: [{ type: "%ThresholdHR", intensity: 85 }],
        notes: "Steady, controlled effort - should feel comfortably hard",
      },

      // Cool-down
      {
        name: "Cool-down Jog",
        description: "Easy pace to finish",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Relax and gradually bring heart rate down",
      },
    ],
  },
};

/**
 * Interval Training - Outdoor
 * Total time: 55 minutes
 * Estimated TSS: ~85
 */
export const INTERVAL_RUN: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "5K Pace Intervals",
  description: "High-intensity intervals at 5K race pace",
  activity_type: "outdoor_run",
  estimated_tss: 85,
  estimated_duration: 3300, // 55 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Warm-up",
        description: "Progressive warm-up",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Start easy and gradually build pace",
      },

      // Interval block
      {
        type: "repetition",
        repeat: 6,
        steps: [
          {
            name: "5K Pace Interval",
            description: "Hard effort at 5K race pace",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 95 }],
            notes: "Run at your 5K race pace - this should feel hard",
          },
          {
            name: "Recovery Jog",
            description: "Easy recovery between intervals",
            type: "step",
            duration: { type: "time", value: 120, unit: "seconds" }, // 2 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "Active recovery - keep moving but very easy",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy jog to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Easy pace to bring heart rate down",
      },
    ],
  },
};

/**
 * Long Run - Outdoor
 * Total time: 90 minutes
 * Estimated TSS: ~65
 */
export const LONG_RUN: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Long Steady Run",
  description: "Extended aerobic run for endurance building",
  activity_type: "outdoor_run",
  estimated_tss: 65,
  estimated_duration: 5400, // 90 minutes
  structure: {
    steps: [
      // Initial easy phase
      {
        name: "Easy Start",
        description: "Start conservatively",
        type: "step",
        duration: { type: "time", value: 1800, unit: "seconds" }, // 30 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Start easy and settle into rhythm",
      },

      // Middle steady phase
      {
        name: "Steady Middle",
        description: "Increase to steady aerobic pace",
        type: "step",
        duration: { type: "time", value: 3000, unit: "seconds" }, // 50 min
        targets: [{ type: "%ThresholdHR", intensity: 75 }],
        notes: "Maintain steady, comfortable effort",
      },

      // Final easy phase
      {
        name: "Easy Finish",
        description: "Ease off for final portion",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Relax and finish strong but controlled",
      },
    ],
  },
};

/**
 * Fartlek Run - Outdoor
 * Total time: 50 minutes
 * Estimated TSS: ~70
 */
export const FARTLEK_RUN: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Fartlek Training",
  description: "Unstructured speed play with varied intensities",
  activity_type: "outdoor_run",
  estimated_tss: 70,
  estimated_duration: 3000, // 50 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Warm-up",
        description: "Easy warm-up jog",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Start easy and prepare for varied efforts",
      },

      // Fartlek main set
      {
        type: "repetition",
        repeat: 8,
        steps: [
          {
            name: "Hard Surge",
            description: "Pick up pace to hard effort",
            type: "step",
            duration: { type: "time", value: 90, unit: "seconds" }, // 1.5 min
            targets: [{ type: "%ThresholdHR", intensity: 90 }],
            notes: "Surge to hard effort - use terrain and feel",
          },
          {
            name: "Easy Recovery",
            description: "Float back to easy pace",
            type: "step",
            duration: { type: "time", value: 150, unit: "seconds" }, // 2.5 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "Relax and recover between surges",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy jog to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Easy pace to bring heart rate down",
      },
    ],
  },
};

export const SAMPLE_OUTDOOR_RUN_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  EASY_AEROBIC_RUN,
  TEMPO_RUN,
  INTERVAL_RUN,
  LONG_RUN,
  FARTLEK_RUN,
];
