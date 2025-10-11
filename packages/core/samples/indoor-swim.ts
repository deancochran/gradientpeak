import type { RecordingServiceActivityPlan } from "../schemas";

/**
 * Easy Swim - Indoor Pool
 * Total time: 45 minutes
 * Estimated TSS: ~40
 */
export const EASY_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Easy Swim",
  description: "Comfortable continuous swim focusing on technique and aerobic base",
  activity_type: "indoor_swim",
  estimated_tss: 40,
  estimated_duration: 2700, // 45 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Easy Warm-up",
        description: "Gentle warm-up to prepare for main swim",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Mix of easy freestyle and backstroke, focus on feel for the water",
      },

      // Main swim
      {
        name: "Steady Swim",
        description: "Continuous swimming at comfortable pace",
        type: "step",
        duration: { type: "time", value: 1800, unit: "seconds" }, // 30 min
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Maintain steady rhythm, focus on stroke technique and breathing pattern",
      },

      // Cool-down
      {
        name: "Easy Cool-down",
        description: "Easy swimming to finish",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Mix of strokes, very relaxed pace",
      },
    ],
  },
};

/**
 * Sprint Intervals - Indoor Pool
 * Total time: 50 minutes
 * Estimated TSS: ~75
 */
export const SPRINT_INTERVALS_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Sprint Intervals",
  description: "High-intensity sprint intervals for speed development",
  activity_type: "indoor_swim",
  estimated_tss: 75,
  estimated_duration: 3000, // 50 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Progressive Warm-up",
        description: "Build intensity gradually",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Start easy, include some faster swimming in final 5 minutes",
      },

      // Sprint set
      {
        type: "repetition",
        repeat: 8,
        steps: [
          {
            name: "Sprint",
            description: "All-out sprint effort",
            type: "step",
            duration: { type: "time", value: 30, unit: "seconds" }, // 30 sec
            targets: [{ type: "%ThresholdHR", intensity: 95 }],
            notes: "Maximum effort sprint - about 25 yards/meters",
          },
          {
            name: "Recovery",
            description: "Easy swimming recovery",
            type: "step",
            duration: { type: "time", value: 90, unit: "seconds" }, // 1.5 min
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Very easy swimming or backstroke to recover",
          },
        ],
      },

      // Second sprint set
      {
        type: "repetition",
        repeat: 6,
        steps: [
          {
            name: "Longer Sprint",
            description: "Sustained sprint effort",
            type: "step",
            duration: { type: "time", value: 60, unit: "seconds" }, // 1 min
            targets: [{ type: "%ThresholdHR", intensity: 90 }],
            notes: "Fast but controlled - about 50 yards/meters",
          },
          {
            name: "Active Recovery",
            description: "Easy recovery swim",
            type: "step",
            duration: { type: "time", value: 120, unit: "seconds" }, // 2 min
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Easy backstroke or freestyle",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy swimming to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very easy mixed strokes",
      },
    ],
  },
};

/**
 * Threshold Set - Indoor Pool
 * Total time: 60 minutes
 * Estimated TSS: ~80
 */
export const THRESHOLD_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Threshold Set",
  description: "Sustained threshold efforts for lactate tolerance",
  activity_type: "indoor_swim",
  estimated_tss: 80,
  estimated_duration: 3600, // 60 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Warm-up",
        description: "Progressive warm-up with technique focus",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Include drill work and build swimming to prepare for threshold",
      },

      // Main threshold set
      {
        type: "repetition",
        repeat: 4,
        steps: [
          {
            name: "Threshold Interval",
            description: "Sustained threshold effort",
            type: "step",
            duration: { type: "time", value: 480, unit: "seconds" }, // 8 min
            targets: [{ type: "%ThresholdHR", intensity: 85 }],
            notes: "Steady hard effort - should feel comfortably hard but sustainable",
          },
          {
            name: "Recovery",
            description: "Easy swimming between intervals",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 65 }],
            notes: "Easy backstroke or freestyle to recover",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy swimming and stretching",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very easy mixed strokes, include some floating/stretching",
      },
    ],
  },
};

/**
 * Technique Focus - Indoor Pool
 * Total time: 40 minutes
 * Estimated TSS: ~30
 */
export const TECHNIQUE_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Technique Focus",
  description: "Technical swimming session focusing on stroke mechanics",
  activity_type: "indoor_swim",
  estimated_tss: 30,
  estimated_duration: 2400, // 40 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Easy Warm-up",
        description: "Gentle swimming to prepare",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Easy freestyle and backstroke, focus on feel",
      },

      // Drill sets
      {
        type: "repetition",
        repeat: 3,
        steps: [
          {
            name: "Freestyle Drills",
            description: "Technical freestyle drills",
            type: "step",
            duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
            targets: [{ type: "%ThresholdHR", intensity: 65 }],
            notes: "Catch-up drill, fingertip drag, single arm swimming",
          },
          {
            name: "Build Swimming",
            description: "Progressive build in speed",
            type: "step",
            duration: { type: "time", value: 240, unit: "seconds" }, // 4 min
            targets: [{ type: "%ThresholdHR", intensity: 75 }],
            notes: "Start easy and gradually build speed while maintaining technique",
          },
          {
            name: "Easy Recovery",
            description: "Easy swimming between sets",
            type: "step",
            duration: { type: "time", value: 120, unit: "seconds" }, // 2 min
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Backstroke or easy freestyle",
          },
        ],
      },

      // Stroke variety
      {
        name: "Mixed Strokes",
        description: "Practice different strokes",
        type: "step",
        duration: { type: "time", value: 480, unit: "seconds" }, // 8 min
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Include backstroke, breaststroke, and freestyle - focus on technique",
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy swimming to finish",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very easy mixed swimming",
      },
    ],
  },
};

/**
 * Endurance Set - Indoor Pool
 * Total time: 75 minutes
 * Estimated TSS: ~60
 */
export const ENDURANCE_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Endurance Set",
  description: "Long aerobic swim for endurance base building",
  activity_type: "indoor_swim",
  estimated_tss: 60,
  estimated_duration: 4500, // 75 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Extended Warm-up",
        description: "Longer warm-up for endurance session",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Start very easy, include some drill work and building",
      },

      // Main endurance block 1
      {
        name: "Endurance Block 1",
        description: "First sustained aerobic block",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%ThresholdHR", intensity: 72 }],
        notes: "Steady aerobic pace - should feel sustainable and controlled",
      },

      // Brief recovery
      {
        name: "Easy Recovery",
        description: "Brief recovery between blocks",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Easy backstroke or very easy freestyle",
      },

      // Main endurance block 2
      {
        name: "Endurance Block 2",
        description: "Second sustained aerobic block",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%ThresholdHR", intensity: 75 }],
        notes: "Slightly higher intensity than first block - still aerobic",
      },

      // Mixed pace finish
      {
        name: "Variable Pace",
        description: "Mixed intensities to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Vary pace every few minutes - keep it interesting",
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy swimming to finish",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very easy mixed strokes and floating",
      },
    ],
  },
};

export const SAMPLE_INDOOR_SWIM_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  EASY_SWIM,
  SPRINT_INTERVALS_SWIM,
  THRESHOLD_SWIM,
  TECHNIQUE_SWIM,
  ENDURANCE_SWIM,
];
