/**
 * V2 Activity Plan Samples
 * Demonstrates the new simplified flat structure
 */

import { createPlan, Duration, Target } from "../schemas/activity_payload";
import type { ActivityPlanStructureV2 } from "../schemas/activity_plan_v2";

// ==============================
// BIKE WORKOUTS V2
// ==============================

export const SWEET_SPOT_WORKOUT_V2: ActivityPlanStructureV2 = createPlan()
  .warmup({
    duration: Duration.minutes(10),
    targets: [Target.ftp(60)],
    notes: "Easy spin to warm up",
  })
  .step({
    name: "Build",
    duration: Duration.minutes(5),
    targets: [Target.ftp(75)],
    notes: "Gradually increase intensity",
  })
  .interval({
    repeat: 3,
    segmentName: "Sweet Spot",
    steps: [
      {
        name: "Sweet Spot",
        duration: Duration.minutes(10),
        targets: [Target.ftp(90), Target.bpm(155)],
        notes: "Steady effort in sweet spot zone",
      },
      {
        name: "Recovery",
        duration: Duration.minutes(5),
        targets: [Target.ftp(55)],
        notes: "Easy recovery spin",
      },
    ],
  })
  .cooldown({
    duration: Duration.minutes(10),
    targets: [Target.ftp(50)],
    notes: "Easy spin to cool down",
  })
  .build();

export const VO2_MAX_WORKOUT_V2: ActivityPlanStructureV2 = createPlan()
  .warmup({
    duration: Duration.minutes(15),
    targets: [Target.ftp(65)],
  })
  .interval({
    repeat: 5,
    segmentName: "VO2 Max",
    steps: [
      {
        name: "Hard",
        duration: Duration.minutes(3),
        targets: [Target.ftp(120), Target.bpm(180)],
        notes: "Maximum sustainable effort",
      },
      {
        name: "Recovery",
        duration: Duration.minutes(3),
        targets: [Target.ftp(50)],
        notes: "Full recovery",
      },
    ],
  })
  .cooldown({
    duration: Duration.minutes(10),
    targets: [Target.ftp(55)],
  })
  .build();

// ==============================
// RUN WORKOUTS V2
// ==============================

export const TEMPO_RUN_V2: ActivityPlanStructureV2 = createPlan()
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
  .build();

export const INTERVAL_RUN_V2: ActivityPlanStructureV2 = createPlan()
  .warmup({
    duration: Duration.minutes(15),
    targets: [Target.ftp(65)],
  })
  .interval({
    repeat: 6,
    segmentName: "Intervals",
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
  .build();

// ==============================
// STRENGTH WORKOUTS V2
// ==============================

export const UPPER_BODY_STRENGTH_V2: ActivityPlanStructureV2 = createPlan()
  .warmup({
    duration: Duration.minutes(5),
    notes: "Dynamic stretching and mobility",
  })
  .interval({
    repeat: 3,
    segmentName: "Bench Press",
    steps: [
      {
        name: "Bench Press",
        duration: Duration.reps(8),
        targets: [Target.rpe(8)],
        notes: "Heavy weight",
      },
      {
        name: "Rest",
        duration: Duration.seconds(90),
      },
    ],
  })
  .interval({
    repeat: 3,
    segmentName: "Rows",
    steps: [
      {
        name: "Bent Over Rows",
        duration: Duration.reps(10),
        targets: [Target.rpe(7)],
      },
      {
        name: "Rest",
        duration: Duration.seconds(90),
      },
    ],
  })
  .interval({
    repeat: 3,
    segmentName: "Overhead Press",
    steps: [
      {
        name: "Overhead Press",
        duration: Duration.reps(8),
        targets: [Target.rpe(8)],
      },
      {
        name: "Rest",
        duration: Duration.seconds(90),
      },
    ],
  })
  .cooldown({
    duration: Duration.minutes(5),
    notes: "Static stretching",
  })
  .build();

export const LOWER_BODY_STRENGTH_V2: ActivityPlanStructureV2 = createPlan()
  .warmup({
    duration: Duration.minutes(5),
    notes: "Dynamic leg swings and mobility",
  })
  .interval({
    repeat: 4,
    segmentName: "Squats",
    steps: [
      {
        name: "Back Squats",
        duration: Duration.reps(5),
        targets: [Target.rpe(9)],
        notes: "Heavy weight, focus on form",
      },
      {
        name: "Rest",
        duration: Duration.minutes(3),
        notes: "Full recovery",
      },
    ],
  })
  .interval({
    repeat: 3,
    segmentName: "Deadlifts",
    steps: [
      {
        name: "Romanian Deadlifts",
        duration: Duration.reps(8),
        targets: [Target.rpe(8)],
      },
      {
        name: "Rest",
        duration: Duration.minutes(2),
      },
    ],
  })
  .interval({
    repeat: 3,
    segmentName: "Lunges",
    steps: [
      {
        name: "Walking Lunges",
        duration: Duration.reps(12),
        targets: [Target.rpe(7)],
        notes: "Each leg",
      },
      {
        name: "Rest",
        duration: Duration.seconds(90),
      },
    ],
  })
  .cooldown({
    duration: Duration.minutes(5),
    notes: "Foam rolling and stretching",
  })
  .build();

// ==============================
// ENDURANCE WORKOUTS V2
// ==============================

export const LONG_ENDURANCE_RIDE_V2: ActivityPlanStructureV2 = createPlan()
  .warmup({
    duration: Duration.minutes(15),
    targets: [Target.ftp(60)],
  })
  .step({
    name: "Zone 2 Endurance",
    duration: Duration.hours(2),
    targets: [Target.ftp(70), Target.bpm(140)],
    notes: "Keep it conversational",
    segmentName: "Main Set",
  })
  .cooldown({
    duration: Duration.minutes(10),
    targets: [Target.ftp(55)],
  })
  .build();

export const LONG_RUN_V2: ActivityPlanStructureV2 = createPlan()
  .warmup({
    duration: Duration.minutes(10),
    targets: [Target.ftp(65)],
  })
  .step({
    name: "Easy Long Run",
    duration: Duration.km(15),
    targets: [Target.ftp(70), Target.bpm(145)],
    notes: "Maintain steady aerobic pace",
    segmentName: "Main Set",
  })
  .cooldown({
    duration: Duration.minutes(5),
    targets: [Target.ftp(60)],
  })
  .build();

// ==============================
// THRESHOLD WORKOUTS V2
// ==============================

export const THRESHOLD_INTERVALS_V2: ActivityPlanStructureV2 = createPlan()
  .warmup({
    duration: Duration.minutes(15),
    targets: [Target.ftp(65)],
  })
  .interval({
    repeat: 4,
    segmentName: "Threshold",
    steps: [
      {
        name: "Threshold",
        duration: Duration.minutes(8),
        targets: [Target.ftp(95), Target.thresholdHR(100)],
        notes: "At threshold - max sustainable for 1 hour",
      },
      {
        name: "Recovery",
        duration: Duration.minutes(4),
        targets: [Target.ftp(55)],
      },
    ],
  })
  .cooldown({
    duration: Duration.minutes(10),
    targets: [Target.ftp(60)],
  })
  .build();

// ==============================
// EXPORT ALL V2 SAMPLES
// ==============================

export const V2_SAMPLE_WORKOUTS = {
  bike: {
    sweetSpot: SWEET_SPOT_WORKOUT_V2,
    vo2Max: VO2_MAX_WORKOUT_V2,
    threshold: THRESHOLD_INTERVALS_V2,
    endurance: LONG_ENDURANCE_RIDE_V2,
  },
  run: {
    tempo: TEMPO_RUN_V2,
    intervals: INTERVAL_RUN_V2,
    long: LONG_RUN_V2,
  },
  strength: {
    upperBody: UPPER_BODY_STRENGTH_V2,
    lowerBody: LOWER_BODY_STRENGTH_V2,
  },
};
