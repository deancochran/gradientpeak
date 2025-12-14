import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Easy Swim - Indoor Pool
 * Total distance: ~2000m
 * Estimated TSS: ~40
 */
export const EASY_SWIM: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Easy Swim",
  description:
    "Comfortable continuous swim focusing on technique and aerobic base",
  estimated_tss: 40,
  estimated_duration: 2700,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      duration: Duration.meters(400),
      targets: [Target.thresholdHR(60)],
      notes:
        "Mix of easy freestyle and backstroke, focus on feel for the water",
    })
    .step({
      name: "Steady Swim",
      duration: Duration.meters(1400),
      targets: [Target.thresholdHR(70)],
      notes:
        "Maintain steady rhythm, focus on stroke technique and breathing pattern",
    })
    .step({
      name: "Easy Cool-down",
      duration: Duration.meters(200),
      targets: [Target.thresholdHR(60)],
      notes: "Mix of strokes, very relaxed pace",
    })
    .build(),
};

/**
 * Sprint Intervals - Indoor Pool
 * Total distance: ~2500m
 * Estimated TSS: ~75
 */
export const SPRINT_INTERVALS_SWIM: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Sprint Intervals",
  description: "High-intensity sprint intervals for speed development",
  estimated_tss: 75,
  estimated_duration: 3000,
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      duration: Duration.meters(500),
      targets: [Target.thresholdHR(65)],
      notes: "Start easy, include some faster swimming in final 100m",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Sprint",
          duration: Duration.meters(25),
          targets: [Target.thresholdHR(95)],
          notes: "Maximum effort sprint",
        },
        {
          name: "Recovery",
          duration: Duration.meters(50),
          targets: [Target.thresholdHR(60)],
          notes: "Very easy swimming or backstroke to recover",
        },
      ],
    })
    .interval({
      repeat: 6,
      steps: [
        {
          name: "Longer Sprint",
          duration: Duration.meters(50),
          targets: [Target.thresholdHR(90)],
          notes: "Fast but controlled effort",
        },
        {
          name: "Active Recovery",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(60)],
          notes: "Easy backstroke or freestyle",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.meters(400),
      targets: [Target.thresholdHR(55)],
      notes: "Very easy mixed strokes",
    })
    .build(),
};

/**
 * Threshold Set - Indoor Pool
 * Total distance: ~3000m
 * Estimated TSS: ~80
 */
export const THRESHOLD_SWIM: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Threshold Set",
  description: "Sustained threshold efforts for lactate tolerance",
  estimated_tss: 80,
  estimated_duration: 3600,
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.meters(600),
      targets: [Target.thresholdHR(65)],
      notes: "Include drill work and build swimming to prepare for threshold",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Threshold Interval",
          duration: Duration.meters(400),
          targets: [Target.thresholdHR(85)],
          notes:
            "Steady hard effort - should feel comfortably hard but sustainable",
        },
        {
          name: "Recovery",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(65)],
          notes: "Easy backstroke or freestyle to recover",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.meters(400),
      targets: [Target.thresholdHR(55)],
      notes: "Very easy mixed strokes, include some floating/stretching",
    })
    .build(),
};

/**
 * Technique Focus - Indoor Pool
 * Total distance: ~1800m
 * Estimated TSS: ~30
 */
export const TECHNIQUE_SWIM: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Technique Focus",
  description: "Technical swimming session focusing on stroke mechanics",
  estimated_tss: 30,
  estimated_duration: 2400,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      duration: Duration.meters(300),
      targets: [Target.thresholdHR(60)],
      notes: "Easy freestyle and backstroke, focus on feel",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Freestyle Drills",
          duration: Duration.meters(200),
          targets: [Target.thresholdHR(65)],
          notes: "Catch-up, fingertip drag, single-arm swimming",
        },
        {
          name: "Build Swimming",
          duration: Duration.meters(150),
          targets: [Target.thresholdHR(75)],
          notes: "Start easy, build speed while maintaining technique",
        },
        {
          name: "Easy Recovery",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(60)],
          notes: "Backstroke or easy freestyle",
        },
      ],
    })
    .step({
      name: "Mixed Strokes",
      duration: Duration.meters(300),
      targets: [Target.thresholdHR(70)],
      notes: "Include backstroke, breaststroke, and freestyle",
    })
    .step({
      name: "Cool-down",
      duration: Duration.meters(200),
      targets: [Target.thresholdHR(55)],
      notes: "Very easy mixed swimming",
    })
    .build(),
};

/**
 * Endurance Set - Indoor Pool
 * Total distance: ~3500m
 * Estimated TSS: ~60
 */
export const ENDURANCE_SWIM: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Endurance Set",
  description: "Long aerobic swim for endurance base building",
  estimated_tss: 60,
  estimated_duration: 4500,
  structure: createPlan()
    .step({
      name: "Extended Warm-up",
      duration: Duration.meters(600),
      targets: [Target.thresholdHR(60)],
      notes: "Start very easy, include some drill work and building",
    })
    .step({
      name: "Endurance Block 1",
      duration: Duration.meters(1200),
      targets: [Target.thresholdHR(72)],
      notes: "Steady aerobic pace - should feel sustainable and controlled",
    })
    .step({
      name: "Easy Recovery",
      duration: Duration.meters(200),
      targets: [Target.thresholdHR(60)],
      notes: "Easy backstroke or very easy freestyle",
    })
    .step({
      name: "Endurance Block 2",
      duration: Duration.meters(1200),
      targets: [Target.thresholdHR(75)],
      notes: "Slightly higher intensity than first block - still aerobic",
    })
    .step({
      name: "Variable Pace",
      duration: Duration.meters(200),
      targets: [Target.thresholdHR(70)],
      notes: "Vary pace every 50m - keep it interesting",
    })
    .step({
      name: "Cool-down",
      duration: Duration.meters(100),
      targets: [Target.thresholdHR(55)],
      notes: "Very easy mixed strokes and floating",
    })
    .build(),
};

export const SAMPLE_INDOOR_SWIM_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    EASY_SWIM,
    SPRINT_INTERVALS_SWIM,
    THRESHOLD_SWIM,
    TECHNIQUE_SWIM,
    ENDURANCE_SWIM,
  ];
