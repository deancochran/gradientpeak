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
 * Estimated Common Load: ~40
 */

/**
 * Sprint Intervals - Indoor Pool
 * Total distance: ~2500m
 * Estimated Common Load: ~75
 */
export const SPRINT_INTERVALS_SWIM: RecordingServiceActivityPlan = {
  id: "4a7b8c9d-0e1f-4a3b-8c5d-6e7f8a9b0c1d",
  name: "Sprint Intervals",
  description: "High-intensity sprint intervals for speed development",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      duration: Duration.meters(500),
      targets: [Target.thresholdHR(65)],
      notes:
        "Swim 400 m easy freestyle, then build the final 100 m freestyle to prepare for speed.",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Sprint",
          duration: Duration.meters(25),
          targets: [Target.thresholdHR(95)],
          notes: "Swim fast freestyle with a quick catch and clean body line.",
        },
        {
          name: "Recovery",
          duration: Duration.meters(50),
          targets: [Target.thresholdHR(60)],
          notes: "Swim very easy backstroke or freestyle to recover.",
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
          notes: "Swim fast freestyle with a controlled catch and stroke length.",
        },
        {
          name: "Active Recovery",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(60)],
          notes: "Swim easy backstroke or freestyle.",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.meters(400),
      targets: [Target.thresholdHR(55)],
      notes: "Swim very easy backstroke, breaststroke, or freestyle.",
    })
    .build(),
};

/**
 * Threshold Set - Indoor Pool
 * Total distance: ~3000m
 * Estimated Common Load: ~80
 */
export const THRESHOLD_SWIM: RecordingServiceActivityPlan = {
  id: "5b8c9d0e-1f2a-4b4c-9d6e-7f8a9b0c1d2e",
  name: "Threshold Set",
  description: "Sustained threshold efforts for lactate tolerance",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.meters(600),
      targets: [Target.thresholdHR(65)],
      notes:
        "Swim 300 m easy freestyle, then use catch-up drill for 4×50 m before building the final 100 m freestyle.",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Threshold Interval",
          duration: Duration.meters(400),
          targets: [Target.thresholdHR(85)],
          notes: "Swim freestyle at a steady, sustainable threshold effort with a firm catch.",
        },
        {
          name: "Recovery",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(65)],
          notes: "Swim easy backstroke or freestyle to recover.",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.meters(400),
      targets: [Target.thresholdHR(55)],
      notes: "Swim very easy backstroke, breaststroke, or freestyle; float at the wall if needed.",
    })
    .build(),
};

/**
 * Technique Focus - Indoor Pool
 * Total distance: ~1800m
 * Estimated Common Load: ~30
 */
export const TECHNIQUE_SWIM: RecordingServiceActivityPlan = {
  id: "6c9d0e1f-2a3b-4c5d-ae7f-8a9b0c1d2e3f",
  name: "Technique Focus",
  description: "Technical swimming session focusing on stroke mechanics",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Easy Warm-up",
      duration: Duration.meters(300),
      targets: [Target.thresholdHR(60)],
      notes: "Swim easy freestyle and backstroke, focusing on feel for the water.",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Freestyle Drills",
          duration: Duration.meters(200),
          targets: [Target.thresholdHR(65)],
          notes: "Swim catch-up, fingertip-drag, and single-arm freestyle drills.",
        },
        {
          name: "Build Swimming",
          duration: Duration.meters(150),
          targets: [Target.thresholdHR(75)],
          notes: "Swim freestyle from easy to strong, building speed while maintaining technique.",
        },
        {
          name: "Easy Recovery",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(60)],
          notes: "Swim easy backstroke or freestyle.",
        },
      ],
    })
    .step({
      name: "Mixed Strokes",
      duration: Duration.meters(300),
      targets: [Target.thresholdHR(70)],
      notes: "Swim backstroke, breaststroke, and freestyle with relaxed transitions.",
    })
    .step({
      name: "Cool-down",
      duration: Duration.meters(200),
      targets: [Target.thresholdHR(55)],
      notes: "Swim very easy backstroke, breaststroke, or freestyle.",
    })
    .build(),
};

/**
 * Endurance Set - Indoor Pool
 * Total distance: ~3500m
 * Estimated Common Load: ~60
 */
export const ENDURANCE_SWIM: RecordingServiceActivityPlan = {
  id: "7d0e1f2a-3b4c-4d6e-bf8a-9b0c1d2e3f4a",
  name: "Endurance Set",
  description: "Long aerobic swim for endurance base building",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Extended Warm-up",
      duration: Duration.meters(600),
      targets: [Target.thresholdHR(60)],
      notes:
        "Swim 300 m easy freestyle, use catch-up drill for 4×50 m, then build the final 100 m freestyle.",
    })
    .step({
      name: "Endurance Block 1",
      duration: Duration.meters(1200),
      targets: [Target.thresholdHR(70)],
      notes:
        "Swim freestyle at a steady aerobic effort with controlled breathing and stroke length.",
    })
    .step({
      name: "Easy Recovery",
      duration: Duration.meters(200),
      targets: [Target.thresholdHR(60)],
      notes: "Swim easy backstroke or very easy freestyle.",
    })
    .step({
      name: "Endurance Block 2",
      duration: Duration.meters(1200),
      targets: [Target.thresholdHR(75)],
      notes: "Swim freestyle slightly stronger than Block 1 while keeping the effort aerobic.",
    })
    .step({
      name: "Variable Pace",
      duration: Duration.meters(200),
      targets: [Target.thresholdHR(70)],
      notes:
        "Swim 4×50 m freestyle, descending each 50 m from easy to strong while preserving stroke length.",
    })
    .step({
      name: "Cool-down",
      duration: Duration.meters(100),
      targets: [Target.thresholdHR(55)],
      notes: "Swim very easy backstroke, breaststroke, or freestyle; float at the wall if needed.",
    })
    .build(),
};

export const SAMPLE_INDOOR_SWIM_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  SPRINT_INTERVALS_SWIM,
  THRESHOLD_SWIM,
  TECHNIQUE_SWIM,
  ENDURANCE_SWIM,
];
