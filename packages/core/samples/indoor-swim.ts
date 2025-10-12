import type { RecordingServiceActivityPlan } from "../schemas";

/**
 * Easy Swim - Indoor Pool
 * Total distance: ~2000m
 * Estimated TSS: ~40
 */
export const EASY_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Easy Swim",
  description:
    "Comfortable continuous swim focusing on technique and aerobic base",
  activity_type: "indoor_swim",
  estimated_tss: 40,
  estimated_duration: 2700,
  structure: {
    steps: [
      {
        name: "Easy Warm-up",
        description: "Gentle warm-up to prepare for main swim",
        type: "step",
        duration: { type: "distance", value: 400, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes:
          "Mix of easy freestyle and backstroke, focus on feel for the water",
      },
      {
        name: "Steady Swim",
        description: "Continuous swimming at comfortable pace",
        type: "step",
        duration: { type: "distance", value: 1400, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes:
          "Maintain steady rhythm, focus on stroke technique and breathing pattern",
      },
      {
        name: "Easy Cool-down",
        description: "Easy swimming to finish",
        type: "step",
        duration: { type: "distance", value: 200, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Mix of strokes, very relaxed pace",
      },
    ],
  },
};

/**
 * Sprint Intervals - Indoor Pool
 * Total distance: ~2500m
 * Estimated TSS: ~75
 */
export const SPRINT_INTERVALS_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Sprint Intervals",
  description: "High-intensity sprint intervals for speed development",
  activity_type: "indoor_swim",
  estimated_tss: 75,
  estimated_duration: 3000,
  structure: {
    steps: [
      {
        name: "Progressive Warm-up",
        description: "Build intensity gradually",
        type: "step",
        duration: { type: "distance", value: 500, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Start easy, include some faster swimming in final 100m",
      },
      {
        type: "repetition",
        repeat: 8,
        steps: [
          {
            name: "Sprint",
            description: "All-out sprint effort",
            type: "step",
            duration: { type: "distance", value: 25, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 95 }],
            notes: "Maximum effort sprint",
          },
          {
            name: "Recovery",
            description: "Easy swimming recovery",
            type: "step",
            duration: { type: "distance", value: 50, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Very easy swimming or backstroke to recover",
          },
        ],
      },
      {
        type: "repetition",
        repeat: 6,
        steps: [
          {
            name: "Longer Sprint",
            description: "Sustained sprint effort",
            type: "step",
            duration: { type: "distance", value: 50, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 90 }],
            notes: "Fast but controlled effort",
          },
          {
            name: "Active Recovery",
            description: "Easy recovery swim",
            type: "step",
            duration: { type: "distance", value: 100, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Easy backstroke or freestyle",
          },
        ],
      },
      {
        name: "Cool-down",
        description: "Easy swimming to finish",
        type: "step",
        duration: { type: "distance", value: 400, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very easy mixed strokes",
      },
    ],
  },
};

/**
 * Threshold Set - Indoor Pool
 * Total distance: ~3000m
 * Estimated TSS: ~80
 */
export const THRESHOLD_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Threshold Set",
  description: "Sustained threshold efforts for lactate tolerance",
  activity_type: "indoor_swim",
  estimated_tss: 80,
  estimated_duration: 3600,
  structure: {
    steps: [
      {
        name: "Warm-up",
        description: "Progressive warm-up with technique focus",
        type: "step",
        duration: { type: "distance", value: 600, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Include drill work and build swimming to prepare for threshold",
      },
      {
        type: "repetition",
        repeat: 4,
        steps: [
          {
            name: "Threshold Interval",
            description: "Sustained threshold effort",
            type: "step",
            duration: { type: "distance", value: 400, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 85 }],
            notes:
              "Steady hard effort - should feel comfortably hard but sustainable",
          },
          {
            name: "Recovery",
            description: "Easy swimming between intervals",
            type: "step",
            duration: { type: "distance", value: 100, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 65 }],
            notes: "Easy backstroke or freestyle to recover",
          },
        ],
      },
      {
        name: "Cool-down",
        description: "Easy swimming and stretching",
        type: "step",
        duration: { type: "distance", value: 400, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very easy mixed strokes, include some floating/stretching",
      },
    ],
  },
};

/**
 * Technique Focus - Indoor Pool
 * Total distance: ~1800m
 * Estimated TSS: ~30
 */
export const TECHNIQUE_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Technique Focus",
  description: "Technical swimming session focusing on stroke mechanics",
  activity_type: "indoor_swim",
  estimated_tss: 30,
  estimated_duration: 2400,
  structure: {
    steps: [
      {
        name: "Easy Warm-up",
        description: "Gentle swimming to prepare",
        type: "step",
        duration: { type: "distance", value: 300, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Easy freestyle and backstroke, focus on feel",
      },
      {
        type: "repetition",
        repeat: 3,
        steps: [
          {
            name: "Freestyle Drills",
            description: "Technical freestyle drills",
            type: "step",
            duration: { type: "distance", value: 200, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 65 }],
            notes: "Catch-up, fingertip drag, single-arm swimming",
          },
          {
            name: "Build Swimming",
            description: "Progressive build in speed",
            type: "step",
            duration: { type: "distance", value: 150, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 75 }],
            notes: "Start easy, build speed while maintaining technique",
          },
          {
            name: "Easy Recovery",
            description: "Easy swimming between sets",
            type: "step",
            duration: { type: "distance", value: 100, unit: "meters" },
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Backstroke or easy freestyle",
          },
        ],
      },
      {
        name: "Mixed Strokes",
        description: "Practice different strokes",
        type: "step",
        duration: { type: "distance", value: 300, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Include backstroke, breaststroke, and freestyle",
      },
      {
        name: "Cool-down",
        description: "Easy swimming to finish",
        type: "step",
        duration: { type: "distance", value: 200, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very easy mixed swimming",
      },
    ],
  },
};

/**
 * Endurance Set - Indoor Pool
 * Total distance: ~3500m
 * Estimated TSS: ~60
 */
export const ENDURANCE_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Endurance Set",
  description: "Long aerobic swim for endurance base building",
  activity_type: "indoor_swim",
  estimated_tss: 60,
  estimated_duration: 4500,
  structure: {
    steps: [
      {
        name: "Extended Warm-up",
        description: "Longer warm-up for endurance session",
        type: "step",
        duration: { type: "distance", value: 600, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Start very easy, include some drill work and building",
      },
      {
        name: "Endurance Block 1",
        description: "First sustained aerobic block",
        type: "step",
        duration: { type: "distance", value: 1200, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 72 }],
        notes: "Steady aerobic pace - should feel sustainable and controlled",
      },
      {
        name: "Easy Recovery",
        description: "Brief recovery between blocks",
        type: "step",
        duration: { type: "distance", value: 200, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Easy backstroke or very easy freestyle",
      },
      {
        name: "Endurance Block 2",
        description: "Second sustained aerobic block",
        type: "step",
        duration: { type: "distance", value: 1200, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 75 }],
        notes: "Slightly higher intensity than first block - still aerobic",
      },
      {
        name: "Variable Pace",
        description: "Mixed intensities to finish",
        type: "step",
        duration: { type: "distance", value: 200, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Vary pace every 50m - keep it interesting",
      },
      {
        name: "Cool-down",
        description: "Easy swimming to finish",
        type: "step",
        duration: { type: "distance", value: 100, unit: "meters" },
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very easy mixed strokes and floating",
      },
    ],
  },
};

export const SAMPLE_INDOOR_SWIM_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    EASY_SWIM,
    SPRINT_INTERVALS_SWIM,
    THRESHOLD_SWIM,
    TECHNIQUE_SWIM,
    ENDURANCE_SWIM,
  ];
