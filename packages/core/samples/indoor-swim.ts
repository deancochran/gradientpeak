import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilderFactory } from "./activity-plan-builder";
import type { SystemActivityPlanTemplate as RecordingServiceActivityPlan } from "./types";

const createPlan = createSystemActivityPlanBuilderFactory("swim", [
  "Easy Warm-up:1:Easy Warm-up|Steady Swim:1:Steady Swim|Easy Cool-down:1:Easy Cool-down",
  "Progressive Warm-up:1:Progressive Warm-up|Interval 2:8:Sprint:Recovery|Interval 3:6:Longer Sprint:Active Recovery|Cool-down:1:Cool-down",
  "Warm-up:1:Warm-up|Interval 2:4:Threshold Interval:Recovery|Cool-down:1:Cool-down",
  "Easy Warm-up:1:Easy Warm-up|Interval 2:3:Freestyle Drills:Build Swimming:Easy Recovery|Mixed Strokes:1:Mixed Strokes|Cool-down:1:Cool-down",
  "Extended Warm-up:1:Extended Warm-up|Endurance Block 1:1:Endurance Block 1|Easy Recovery:1:Easy Recovery|Endurance Block 2:1:Endurance Block 2|Variable Pace:1:Variable Pace|Cool-down:1:Cool-down",
  "Easy Warm-up:1:Easy Warm-up|Interval 2:8:Drill/Swim|Interval 3:6:Zone 3:Rest|Interval 4:4:Threshold:Easy|Easy Cool-down:1:Easy Cool-down",
]);

/**
 * Easy Swim - Indoor Pool
 * Total distance: ~2000m
 * Estimated TSS: ~40
 */
export const EASY_SWIM: RecordingServiceActivityPlan = {
  id: "3f6a7b8c-9d0e-1f2a-3b4c-5d6e7f8a9b0c",
  version: "3.0",
  name: "Easy Swim",
  description: "Comfortable continuous swim focusing on technique and aerobic base",
  activity_category: "swim",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      duration: Duration.meters(400),
      targets: [Target.thresholdHR(60)],
      notes: "Mix of easy freestyle and backstroke, focus on feel for the water",
    })
    .step({
      name: "Steady Swim",
      duration: Duration.meters(1400),
      targets: [Target.thresholdHR(70)],
      notes: "Maintain steady rhythm, focus on stroke technique and breathing pattern",
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
  id: "4a7b8c9d-0e1f-2a3b-4c5d-6e7f8a9b0c1d",
  version: "3.0",
  name: "Sprint Intervals",
  description: "High-intensity sprint intervals for speed development",
  activity_category: "swim",
  gps_recording_enabled: false,
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
  id: "5b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
  version: "3.0",
  name: "Threshold Set",
  description: "Sustained threshold efforts for lactate tolerance",
  activity_category: "swim",
  gps_recording_enabled: false,
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
          notes: "Steady hard effort - should feel comfortably hard but sustainable",
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
  id: "6c9d0e1f-2a3b-4c5d-6e7f-8a9b0c1d2e3f",
  version: "3.0",
  name: "Technique Focus",
  description: "Technical swimming session focusing on stroke mechanics",
  activity_category: "swim",
  gps_recording_enabled: false,
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
  id: "7d0e1f2a-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
  version: "3.0",
  name: "Endurance Set",
  description: "Long aerobic swim for endurance base building",
  activity_category: "swim",
  gps_recording_enabled: false,
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

/**
 * Option 1 (My favorite – 4,400 m) - Indoor Pool
 * Total distance: 4400m
 */
export const OPTION_1_FAVORITE_SWIM: RecordingServiceActivityPlan = {
  id: "8d5e1b64-9b22-4f74-a5e2-5cf05d85cc50",
  version: "3.0",
  name: "Option 1 (My favorite – 4,400 m)",
  description: "A 4,400 m swim with Zone 3 endurance work and alternating threshold efforts.",
  activity_category: "swim",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      duration: Duration.meters(400),
      targets: [Target.thresholdHR(60)],
      notes: "400 m easy swimming to settle into the session.",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Drill/Swim",
          duration: Duration.meters(50),
          targets: [Target.thresholdHR(65)],
          notes: "Alternate drill and swim repetitions for 400 m total.",
        },
      ],
    })
    .interval({
      repeat: 6,
      steps: [
        {
          name: "Zone 3",
          duration: Duration.meters(400),
          targets: [Target.thresholdHR(75)],
          notes: "Controlled Zone 3 swimming.",
        },
        {
          name: "Rest",
          duration: Duration.seconds(30),
          targets: [Target.thresholdHR(55)],
          notes: "30 seconds rest.",
        },
      ],
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Threshold",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(85)],
          notes: "Threshold effort.",
        },
        {
          name: "Easy",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(60)],
          notes: "Easy swimming recovery.",
        },
      ],
    })
    .step({
      name: "Easy Cool-down",
      duration: Duration.meters(400),
      targets: [Target.thresholdHR(55)],
      notes: "400 m easy swimming to finish.",
    })
    .build(),
};

export const SAMPLE_INDOOR_SWIM_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  EASY_SWIM,
  SPRINT_INTERVALS_SWIM,
  THRESHOLD_SWIM,
  TECHNIQUE_SWIM,
  ENDURANCE_SWIM,
  OPTION_1_FAVORITE_SWIM,
];
