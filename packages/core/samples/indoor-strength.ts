import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Upper Body Strength - Indoor
 * Total time: 45 minutes
 * Estimated TSS: ~50
 */
export const UPPER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Upper Body Strength",
  description: "Comprehensive upper body strength training session",
  activity_category: "strength",
  activity_location: "indoor",
  structure: createPlan()
    .step({
      name: "Dynamic Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Arm circles, shoulder rolls, light movement to warm up",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Push-ups",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(75)],
          notes: "3 sets of 10-15 reps with 60 seconds rest between sets",
        },
        {
          name: "Pull-ups/Rows",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(75)],
          notes: "3 sets of 8-12 reps, use assistance or weight as needed",
        },
        {
          name: "Shoulder Press",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(70)],
          notes: "3 sets of 10-12 reps with dumbbells or resistance bands",
        },
      ],
    })
    .step({
      name: "Cool-down Stretch",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(50)],
      notes: "Focus on chest, shoulders, and back stretches",
    })
    .build(),
};

/**
 * Lower Body Strength - Indoor
 * Total time: 50 minutes
 * Estimated TSS: ~60
 */
export const LOWER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Lower Body Strength",
  description: "Comprehensive lower body strength and power training",
  activity_category: "strength",
  activity_location: "indoor",
  structure: createPlan()
    .step({
      name: "Dynamic Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Leg swings, hip circles, bodyweight squats, lunges",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Squats",
          duration: Duration.minutes(4),
          targets: [Target.thresholdHR(80)],
          notes: "3 sets of 12-15 reps, focus on depth and control",
        },
        {
          name: "Deadlifts",
          duration: Duration.minutes(4),
          targets: [Target.thresholdHR(80)],
          notes: "3 sets of 10-12 reps, maintain neutral spine",
        },
        {
          name: "Single-leg Work",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(75)],
          notes: "Lunges or single-leg RDLs, 8-10 reps each leg",
        },
      ],
    })
    .step({
      name: "Cool-down Stretch",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(50)],
      notes: "Focus on hip flexors, hamstrings, and calves",
    })
    .build(),
};

/**
 * Full Body Circuit - Indoor
 * Total time: 40 minutes
 * Estimated TSS: ~65
 */
export const FULL_BODY_CIRCUIT: RecordingServiceActivityPlan = {
  id: "aaaa1111-2222-3333-4444-555555555555",
  version: "2.0",
  name: "Full Body Circuit",
  description: "High-intensity full body circuit training",
  activity_category: "strength",
  activity_location: "indoor",
  structure: createPlan()
    .step({
      name: "Movement Prep",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(65)],
      notes: "Dynamic movements to prepare entire body",
    })
    .interval({
      repeat: 5,
      steps: [
        {
          name: "Circuit Round",
          duration: Duration.minutes(6),
          targets: [Target.thresholdHR(85)],
          notes:
            "Burpees, mountain climbers, squat jumps, push-ups - 45s work, 15s rest",
        },
        {
          name: "Active Recovery",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(60)],
          notes: "Light movement, breathing exercises",
        },
      ],
    })
    .step({
      name: "Recovery Stretch",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(50)],
      notes: "Static stretches for all major muscle groups",
    })
    .build(),
};

/**
 * Core and Stability - Indoor
 * Total time: 30 minutes
 * Estimated TSS: ~35
 */
export const CORE_STABILITY: RecordingServiceActivityPlan = {
  id: "aaaa2222-3333-4444-5555-666666666666",
  version: "2.0",
  name: "Core and Stability",
  description: "Focused core strength and stability training",
  activity_category: "strength",
  activity_location: "indoor",
  structure: createPlan()
    .step({
      name: "Core Activation",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(55)],
      notes: "Breathing exercises, gentle core engagement",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Plank Variations",
          duration: Duration.minutes(4),
          targets: [Target.thresholdHR(70)],
          notes: "Front plank, side planks, plank variations - 30-60s holds",
        },
        {
          name: "Dynamic Core",
          duration: Duration.minutes(4),
          targets: [Target.thresholdHR(75)],
          notes: "Dead bugs, bird dogs, bicycle crunches, leg raises",
        },
        {
          name: "Recovery",
          duration: Duration.minutes(1),
          targets: [Target.thresholdHR(60)],
          notes: "Light movement and breathing",
        },
      ],
    })
    .step({
      name: "Hip and Spine Mobility",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(50)],
      notes: "Cat-cow, hip circles, spinal twists",
    })
    .build(),
};

/**
 * Functional Movement - Indoor
 * Total time: 35 minutes
 * Estimated TSS: ~45
 */
export const FUNCTIONAL_MOVEMENT: RecordingServiceActivityPlan = {
  id: "aaaa3333-4444-5555-6666-777777777777",
  version: "2.0",
  name: "Functional Movement",
  description: "Movement patterns for daily life and sport performance",
  activity_category: "strength",
  activity_location: "indoor",
  structure: createPlan()
    .step({
      name: "Movement Preparation",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(60)],
      notes: "Joint mobility, activation exercises",
    })
    .interval({
      repeat: 4,
      steps: [
        {
          name: "Squat Patterns",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(70)],
          notes: "Goblet squats, squat to press, jump squats",
        },
        {
          name: "Hinge Patterns",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(70)],
          notes: "Kettlebell swings, Romanian deadlifts, good mornings",
        },
        {
          name: "Push/Pull Patterns",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(70)],
          notes: "Push-ups, rows, carries, throws",
        },
        {
          name: "Transition",
          duration: Duration.minutes(1),
          targets: [Target.thresholdHR(60)],
          notes: "Light movement, setup for next round",
        },
      ],
    })
    .step({
      name: "Movement Integration",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(55)],
      notes: "Complex movements, stretching, relaxation",
    })
    .build(),
};

export const SYSTEM_UPPER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  id: "e9f5a8b7-2c6d-1e0f-5a4b-6c3d9e8f7a0b",
  version: "2.0",
  name: "Upper Body Strength",
  description:
    "Bench press, rows, and overhead press - Complete upper body workout",
  activity_category: "strength",
  activity_location: "indoor",
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(5),
      notes: "Dynamic stretching and mobility",
    })
    .interval({
      repeat: 3,
      name: "Bench Press",
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
      name: "Rows",
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
      name: "Overhead Press",
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
    .build(),
};

export const SYSTEM_LOWER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  id: "f0a6b9c8-3d7e-2f1a-6b5c-7d4e0f9a8b1c",
  version: "2.0",
  name: "Lower Body Strength",
  description: "Squats, deadlifts, and lunges - Complete lower body workout",
  activity_category: "strength",
  activity_location: "indoor",
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(5),
      notes: "Dynamic leg swings and mobility",
    })
    .interval({
      repeat: 4,
      name: "Squats",
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
      name: "Deadlifts",
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
      name: "Lunges",
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
    .build(),
};

export const SAMPLE_INDOOR_STRENGTH_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    FULL_BODY_CIRCUIT,
    CORE_STABILITY,
    FUNCTIONAL_MOVEMENT,
    SYSTEM_UPPER_BODY_STRENGTH,
    SYSTEM_LOWER_BODY_STRENGTH,
  ];
