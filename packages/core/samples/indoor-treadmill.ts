import type { RecordingServiceActivityPlan } from "../schemas";

/**
 * Threshold Run - Indoor Treadmill
 * Total time: 50 minutes
 * Estimated TSS: ~60
 */
export const THRESHOLD_RUN_WORKOUT_1: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Threshold Run Development 1",
  description:
    "Indoor treadmill session focusing on threshold heart rate intervals",
  activity_type: "indoor_treadmill",
  estimated_tss: 60,
  estimated_duration: 3000, // 50 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Progressive Warm-up",
        description: "Gradually raise heart rate for threshold work",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Easy pace jogging to prepare legs and lungs",
      },

      // Interval repetition
      {
        type: "repetition",
        repeat: 4,
        steps: [
          {
            name: "Threshold Interval",
            description: "Maintain threshold HR pace",
            type: "step",
            duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
            targets: [{ type: "%ThresholdHR", intensity: 85 }],
            notes: "Steady effort at high intensity",
          },
          {
            name: "Active Recovery",
            description: "Recover at light jog",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "Easy jog or walk to bring HR down",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy jogging to finish session",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Relaxed pace to flush lactate",
      },
    ],
  },
};

/**
 * Threshold Run - Indoor Treadmill
 * Total time: 60 minutes
 * Estimated TSS: ~70
 */
export const THRESHOLD_RUN_WORKOUT_2: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Threshold Run Development 2",
  description:
    "Longer indoor treadmill threshold session with progressive intervals",
  activity_type: "indoor_treadmill",
  estimated_tss: 70,
  estimated_duration: 3600, // 60 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Warm-up Jog",
        description: "Easy jogging to get heart rate up",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Gradually increase speed to prep for intervals",
      },

      // Progressive intervals
      {
        type: "repetition",
        repeat: 3,
        steps: [
          {
            name: "Long Threshold Interval",
            description: "Sustain near-threshold HR",
            type: "step",
            duration: { type: "time", value: 480, unit: "seconds" }, // 8 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "Maintain pace comfortably hard",
          },
          {
            name: "Recovery Jog",
            description: "Light jog to recover",
            type: "step",
            duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Keep HR below 70% threshold",
          },
        ],
      },

      // Final push
      {
        name: "Short Threshold Push",
        description: "Increase intensity for last segment",
        type: "step",
        duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
        targets: [{ type: "%ThresholdHR", intensity: 80 }],
        notes: "Push pace for short duration",
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy jogging to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Relaxed pace to normalize heart rate",
      },
    ],
  },
};

export const SAMPLE_TREADMILL_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [THRESHOLD_RUN_WORKOUT_1, THRESHOLD_RUN_WORKOUT_2];
