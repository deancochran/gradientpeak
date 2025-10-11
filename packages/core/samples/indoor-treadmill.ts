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

/**
 * Speed Intervals - Indoor Treadmill
 * Total time: 40 minutes
 * Estimated TSS: ~65
 */
export const SPEED_INTERVALS_WORKOUT: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Speed Intervals",
  description: "High-intensity speed intervals for VO2 max development",
  activity_type: "indoor_treadmill",
  estimated_tss: 65,
  estimated_duration: 2400, // 40 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Progressive Warm-up",
        description: "Build intensity gradually",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Include some strides in final 5 minutes to prepare for speed",
      },

      // Speed intervals
      {
        type: "repetition",
        repeat: 6,
        steps: [
          {
            name: "Speed Interval",
            description: "High-intensity running",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 92 }],
            notes: "Fast pace - should feel hard but controlled",
          },
          {
            name: "Recovery Jog",
            description: "Easy recovery between intervals",
            type: "step",
            duration: { type: "time", value: 120, unit: "seconds" }, // 2 min
            targets: [{ type: "%ThresholdHR", intensity: 65 }],
            notes: "Light jog to recover",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy jog to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Easy pace to bring heart rate down",
      },
    ],
  },
};

/**
 * Easy Recovery Run - Indoor Treadmill
 * Total time: 30 minutes
 * Estimated TSS: ~25
 */
export const EASY_RECOVERY_RUN: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Easy Recovery Run",
  description: "Low-intensity recovery run for active recovery",
  activity_type: "indoor_treadmill",
  estimated_tss: 25,
  estimated_duration: 1800, // 30 minutes
  structure: {
    steps: [
      // Easy continuous run
      {
        name: "Easy Recovery Run",
        description: "Maintain very comfortable pace throughout",
        type: "step",
        duration: { type: "time", value: 1800, unit: "seconds" }, // 30 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Very easy pace - should feel relaxed and restorative",
      },
    ],
  },
};

/**
 * Hill Intervals - Indoor Treadmill
 * Total time: 45 minutes
 * Estimated TSS: ~70
 */
export const HILL_INTERVALS_WORKOUT: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Hill Intervals",
  description: "Incline-based intervals for strength and power development",
  activity_type: "indoor_treadmill",
  estimated_tss: 70,
  estimated_duration: 2700, // 45 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Flat Warm-up",
        description: "Easy warm-up on flat grade",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Start on 0% grade, gradually increase pace",
      },

      // Hill intervals
      {
        type: "repetition",
        repeat: 8,
        steps: [
          {
            name: "Hill Climb",
            description: "Hard effort up hill",
            type: "step",
            duration: { type: "time", value: 120, unit: "seconds" }, // 2 min
            targets: [{ type: "%ThresholdHR", intensity: 88 }],
            notes: "Increase incline to 6-8%, maintain strong effort uphill",
          },
          {
            name: "Recovery Descent",
            description: "Easy recovery on flat",
            type: "step",
            duration: { type: "time", value: 90, unit: "seconds" }, // 1.5 min
            targets: [{ type: "%ThresholdHR", intensity: 65 }],
            notes: "Return to 0% grade, easy jog to recover",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy jog on flat to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Flat grade, easy pace to cool down",
      },
    ],
  },
};

export const SAMPLE_TREADMILL_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    THRESHOLD_RUN_WORKOUT_1,
    THRESHOLD_RUN_WORKOUT_2,
    SPEED_INTERVALS_WORKOUT,
    EASY_RECOVERY_RUN,
    HILL_INTERVALS_WORKOUT,
  ];
