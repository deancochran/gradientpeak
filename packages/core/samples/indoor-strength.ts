import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilderFactory } from "./activity-plan-builder";
import type { SystemActivityPlanTemplate as RecordingServiceActivityPlan } from "./types";

const createPlan = createSystemActivityPlanBuilderFactory("strength", [
  "Dynamic Warm-up:1:Dynamic Warm-up|Interval 2:3:Push-ups:Pull-ups/Rows:Shoulder Press|Cool-down Stretch:1:Cool-down Stretch",
  "Dynamic Warm-up:1:Dynamic Warm-up|Interval 2:4:Squats:Deadlifts:Single-leg Work|Cool-down Stretch:1:Cool-down Stretch",
  "Movement Prep:1:Movement Prep|Interval 2:5:Circuit Round:Active Recovery|Recovery Stretch:1:Recovery Stretch",
  "Core Activation:1:Core Activation|Interval 2:3:Plank Variations:Dynamic Core:Recovery|Hip and Spine Mobility:1:Hip and Spine Mobility",
  "Movement Preparation:1:Movement Preparation|Interval 2:4:Squat Patterns:Hinge Patterns:Push/Pull Patterns:Transition|Movement Integration:1:Movement Integration",
  "Warmup:1:Warmup|Bench Press:3:Bench Press:Rest|Rows:3:Bent Over Rows:Rest|Overhead Press:3:Overhead Press:Rest|Cooldown:1:Cooldown",
  "Warmup:1:Warmup|Squats:4:Back Squats:Rest|Deadlifts:3:Romanian Deadlifts:Rest|Lunges:3:Walking Lunges:Rest|Cooldown:1:Cooldown",
]);

/**
 * Upper Body Strength - Indoor
 * Total time: 45 minutes
 * Estimated Common Load: ~50
 */
export const UPPER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  name: "Upper Body Strength",
  description: "Comprehensive upper body strength training session",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Dynamic Warm-up",
      purpose: "warmup",
      duration: Duration.minutes(10),
      targets: [Target.rpe(3)],
      notes: "Arm circles, shoulder rolls, light movement to warm up",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Push-ups",
          purpose: "work",
          duration: Duration.minutes(3),
          targets: [Target.rpe(7)],
          notes: "3 sets of 10-15 reps with 60 seconds rest between sets",
        },
        {
          name: "Pull-ups/Rows",
          purpose: "work",
          duration: Duration.minutes(3),
          targets: [Target.rpe(7)],
          notes: "3 sets of 8-12 reps, use assistance or weight as needed",
        },
        {
          name: "Shoulder Press",
          purpose: "work",
          duration: Duration.minutes(3),
          targets: [Target.rpe(6)],
          notes: "3 sets of 10-12 reps with dumbbells or resistance bands",
        },
      ],
    })
    .step({
      name: "Cool-down Stretch",
      purpose: "cooldown",
      duration: Duration.minutes(10),
      targets: [Target.rpe(2)],
      notes: "Focus on chest, shoulders, and back stretches",
    })
    .build(),
};

/**
 * Lower Body Strength - Indoor
 * Total time: 50 minutes
 * Estimated Common Load: ~60
 */
export const LOWER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  name: "Lower Body Strength",
  description: "Comprehensive lower body strength and power training",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Dynamic Warm-up",
      purpose: "warmup",
      duration: Duration.minutes(10),
      targets: [Target.rpe(3)],
      notes: "Leg swings, hip circles, bodyweight squats, lunges",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Squats",
          purpose: "work",
          duration: Duration.minutes(4),
          targets: [Target.rpe(7)],
          notes: "3 sets of 12-15 reps, focus on depth and control",
        },
        {
          name: "Deadlifts",
          purpose: "work",
          duration: Duration.minutes(4),
          targets: [Target.rpe(8)],
          notes: "3 sets of 10-12 reps, maintain neutral spine",
        },
        {
          name: "Single-leg Work",
          purpose: "work",
          duration: Duration.minutes(3),
          targets: [Target.rpe(7)],
          notes: "Lunges or single-leg RDLs, 8-10 reps each leg",
        },
      ],
    })
    .step({
      name: "Cool-down Stretch",
      purpose: "cooldown",
      duration: Duration.minutes(10),
      targets: [Target.rpe(2)],
      notes: "Focus on hip flexors, hamstrings, and calves",
    })
    .build(),
};

/**
 * Full Body Circuit - Indoor
 * Total time: 40 minutes
 * Estimated Common Load: ~65
 */
export const FULL_BODY_CIRCUIT: RecordingServiceActivityPlan = {
  id: "aaaa1111-2222-4333-8444-555555555555",
  name: "Full Body Circuit",
  description: "High-intensity full body circuit training",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Movement Prep",
      purpose: "warmup",
      duration: Duration.minutes(5),
      targets: [Target.rpe(4)],
      notes: "Dynamic movements to prepare entire body",
    })
    .interval({
      repeat: 5,
      steps: [
        {
          name: "Circuit Round",
          purpose: "work",
          duration: Duration.minutes(6),
          targets: [Target.rpe(8)],
          notes: "Burpees, mountain climbers, squat jumps, push-ups - 45s work, 15s rest",
        },
        {
          name: "Active Recovery",
          purpose: "recovery",
          duration: Duration.minutes(2),
          targets: [Target.rpe(3)],
          notes: "Light movement, breathing exercises",
        },
      ],
    })
    .step({
      name: "Recovery Stretch",
      purpose: "cooldown",
      duration: Duration.minutes(5),
      targets: [Target.rpe(2)],
      notes: "Static stretches for all major muscle groups",
    })
    .build(),
};

/**
 * Core and Stability - Indoor
 * Total time: 30 minutes
 * Estimated Common Load: ~35
 */
export const CORE_STABILITY: RecordingServiceActivityPlan = {
  id: "aaaa2222-3333-4444-9555-666666666666",
  name: "Core and Stability",
  description: "Focused core strength and stability training",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Core Activation",
      purpose: "warmup",
      duration: Duration.minutes(5),
      targets: [Target.rpe(2)],
      notes: "Breathing exercises, gentle core engagement",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Plank Variations",
          purpose: "work",
          duration: Duration.minutes(4),
          targets: [Target.rpe(5)],
          notes: "Front plank, side planks, plank variations - 30-60s holds",
        },
        {
          name: "Dynamic Core",
          purpose: "work",
          duration: Duration.minutes(4),
          targets: [Target.rpe(6)],
          notes: "Dead bugs, bird dogs, bicycle crunches, leg raises",
        },
        {
          name: "Recovery",
          purpose: "recovery",
          duration: Duration.minutes(1),
          targets: [Target.rpe(2)],
          notes: "Light movement and breathing",
        },
      ],
    })
    .step({
      name: "Hip and Spine Mobility",
      purpose: "cooldown",
      duration: Duration.minutes(5),
      targets: [Target.rpe(1)],
      notes: "Cat-cow, hip circles, spinal twists",
    })
    .build(),
};

/**
 * Functional Movement - Indoor
 * Total time: 35 minutes
 * Estimated Common Load: ~45
 */
export const FUNCTIONAL_MOVEMENT: RecordingServiceActivityPlan = {
  id: "aaaa3333-4444-4555-a666-777777777777",
  name: "Functional Movement",
  description: "Movement patterns for daily life and activity performance",
  gps_recording_enabled: false,
  structure: createPlan()
    .step({
      name: "Movement Preparation",
      purpose: "warmup",
      duration: Duration.minutes(5),
      targets: [Target.rpe(3)],
      notes: "Joint mobility, activation exercises",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Squat Patterns",
          purpose: "work",
          duration: Duration.minutes(3),
          targets: [Target.rpe(5)],
          notes: "Goblet squats, squat to press, jump squats",
        },
        {
          name: "Hinge Patterns",
          purpose: "work",
          duration: Duration.minutes(3),
          targets: [Target.rpe(5)],
          notes: "Kettlebell swings, Romanian deadlifts, good mornings",
        },
        {
          name: "Push/Pull Patterns",
          purpose: "work",
          duration: Duration.minutes(3),
          targets: [Target.rpe(5)],
          notes: "Push-ups, rows, carries, throws",
        },
        {
          name: "Transition",
          purpose: "recovery",
          duration: Duration.minutes(1),
          targets: [Target.rpe(3)],
          notes: "Light movement, setup for next round",
        },
      ],
    })
    .step({
      name: "Movement Integration",
      purpose: "cooldown",
      duration: Duration.minutes(5),
      targets: [Target.rpe(2)],
      notes: "Complex movements, stretching, relaxation",
    })
    .build(),
};

export const SYSTEM_UPPER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  id: "e9f5a8b7-2c6d-4e0f-9a4b-6c3d9e8f7a0b",
  name: "Upper Body Strength",
  description: "Bench press, rows, and overhead press - Complete upper body activity",
  gps_recording_enabled: false,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(5),
      targets: [Target.rpe(3)],
      notes: "Dynamic stretching and mobility",
    })
    .interval({
      repeat: 3,
      name: "Bench Press",
      steps: [
        {
          name: "Bench Press",
          purpose: "work",
          duration: Duration.reps(8),
          targets: [Target.rpe(8)],
          notes: "Heavy weight",
        },
        {
          name: "Rest",
          purpose: "recovery",
          duration: Duration.seconds(90),
          targets: [Target.rpe(2)],
        },
      ],
    })
    .interval({
      repeat: 3,
      name: "Rows",
      steps: [
        {
          name: "Bent Over Rows",
          purpose: "work",
          duration: Duration.reps(10),
          targets: [Target.rpe(7)],
        },
        {
          name: "Rest",
          purpose: "recovery",
          duration: Duration.seconds(90),
          targets: [Target.rpe(2)],
        },
      ],
    })
    .interval({
      repeat: 3,
      name: "Overhead Press",
      steps: [
        {
          name: "Overhead Press",
          purpose: "work",
          duration: Duration.reps(8),
          targets: [Target.rpe(8)],
        },
        {
          name: "Rest",
          purpose: "recovery",
          duration: Duration.seconds(90),
          targets: [Target.rpe(2)],
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(5),
      targets: [Target.rpe(1)],
      notes: "Static stretching",
    })
    .build(),
};

export const SYSTEM_LOWER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  id: "f0a6b9c8-3d7e-4f1a-ab5c-7d4e0f9a8b1c",
  name: "Lower Body Strength",
  description: "Squats, deadlifts, and lunges - Complete lower body activity",
  gps_recording_enabled: false,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(5),
      targets: [Target.rpe(3)],
      notes: "Dynamic leg swings and mobility",
    })
    .interval({
      repeat: 4,
      name: "Squats",
      steps: [
        {
          name: "Back Squats",
          purpose: "work",
          duration: Duration.reps(5),
          targets: [Target.rpe(9)],
          notes: "Heavy weight, focus on form",
        },
        {
          name: "Rest",
          purpose: "recovery",
          duration: Duration.minutes(3),
          targets: [Target.rpe(2)],
          notes: "Full recovery",
        },
      ],
    })
    .interval({
      repeat: 3,
      name: "Deadlifts",
      steps: [
        {
          name: "Romanian Deadlifts",
          purpose: "work",
          duration: Duration.reps(8),
          targets: [Target.rpe(8)],
        },
        {
          name: "Rest",
          purpose: "recovery",
          duration: Duration.minutes(2),
          targets: [Target.rpe(2)],
        },
      ],
    })
    .interval({
      repeat: 3,
      name: "Lunges",
      steps: [
        {
          name: "Walking Lunges",
          purpose: "work",
          duration: Duration.reps(12),
          targets: [Target.rpe(7)],
          notes: "Each leg",
        },
        {
          name: "Rest",
          purpose: "recovery",
          duration: Duration.seconds(90),
          targets: [Target.rpe(2)],
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(5),
      targets: [Target.rpe(1)],
      notes: "Foam rolling and stretching",
    })
    .build(),
};

export const SAMPLE_INDOOR_STRENGTH_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  FULL_BODY_CIRCUIT,
  CORE_STABILITY,
  FUNCTIONAL_MOVEMENT,
  SYSTEM_UPPER_BODY_STRENGTH,
  SYSTEM_LOWER_BODY_STRENGTH,
];
