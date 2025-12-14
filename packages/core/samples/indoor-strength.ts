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
  estimated_tss: 50,
  estimated_duration: 2700, // 45 minutes
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
  estimated_tss: 60,
  estimated_duration: 3000, // 50 minutes
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
  version: "2.0",
  name: "Full Body Circuit",
  description: "High-intensity full body circuit training",
  estimated_tss: 65,
  estimated_duration: 2400, // 40 minutes
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
  version: "2.0",
  name: "Core and Stability",
  description: "Focused core strength and stability training",
  estimated_tss: 35,
  estimated_duration: 1800, // 30 minutes
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
  version: "2.0",
  name: "Functional Movement",
  description: "Movement patterns for daily life and sport performance",
  estimated_tss: 45,
  estimated_duration: 2100, // 35 minutes
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

export const SAMPLE_INDOOR_STRENGTH_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    UPPER_BODY_STRENGTH,
    LOWER_BODY_STRENGTH,
    FULL_BODY_CIRCUIT,
    CORE_STABILITY,
    FUNCTIONAL_MOVEMENT,
  ];
