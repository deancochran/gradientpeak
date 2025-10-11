import type { RecordingServiceActivityPlan } from "../schemas";

/**
 * Upper Body Strength - Indoor
 * Total time: 45 minutes
 * Estimated TSS: ~50
 */
export const UPPER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Upper Body Strength",
  description: "Comprehensive upper body strength training session",
  activity_type: "indoor_strength",
  estimated_tss: 50,
  estimated_duration: 2700, // 45 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Dynamic Warm-up",
        description: "Prepare muscles and joints for lifting",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Arm circles, shoulder rolls, light movement to warm up",
      },

      // Main strength block
      {
        type: "repetition",
        repeat: 3,
        steps: [
          {
            name: "Push-ups",
            description: "Chest and tricep development",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 75 }],
            notes: "3 sets of 10-15 reps with 60 seconds rest between sets",
          },
          {
            name: "Pull-ups/Rows",
            description: "Back and bicep development",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 75 }],
            notes: "3 sets of 8-12 reps, use assistance or weight as needed",
          },
          {
            name: "Shoulder Press",
            description: "Shoulder and core stability",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "3 sets of 10-12 reps with dumbbells or resistance bands",
          },
        ],
      },

      // Cool-down and stretch
      {
        name: "Cool-down Stretch",
        description: "Static stretching for recovery",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 50 }],
        notes: "Focus on chest, shoulders, and back stretches",
      },
    ],
  },
};

/**
 * Lower Body Strength - Indoor
 * Total time: 50 minutes
 * Estimated TSS: ~60
 */
export const LOWER_BODY_STRENGTH: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Lower Body Strength",
  description: "Comprehensive lower body strength and power training",
  activity_type: "indoor_strength",
  estimated_tss: 60,
  estimated_duration: 3000, // 50 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Dynamic Warm-up",
        description: "Prepare legs and hips for training",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Leg swings, hip circles, bodyweight squats, lunges",
      },

      // Main strength circuits
      {
        type: "repetition",
        repeat: 4,
        steps: [
          {
            name: "Squats",
            description: "Quad and glute development",
            type: "step",
            duration: { type: "time", value: 240, unit: "seconds" }, // 4 min
            targets: [{ type: "%ThresholdHR", intensity: 80 }],
            notes: "3 sets of 12-15 reps, focus on depth and control",
          },
          {
            name: "Deadlifts",
            description: "Posterior chain strength",
            type: "step",
            duration: { type: "time", value: 240, unit: "seconds" }, // 4 min
            targets: [{ type: "%ThresholdHR", intensity: 80 }],
            notes: "3 sets of 10-12 reps, maintain neutral spine",
          },
          {
            name: "Single-leg Work",
            description: "Unilateral strength and stability",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 75 }],
            notes: "Lunges or single-leg RDLs, 8-10 reps each leg",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down Stretch",
        description: "Hip and leg flexibility",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 50 }],
        notes: "Focus on hip flexors, hamstrings, and calves",
      },
    ],
  },
};

/**
 * Full Body Circuit - Indoor
 * Total time: 40 minutes
 * Estimated TSS: ~65
 */
export const FULL_BODY_CIRCUIT: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Full Body Circuit",
  description: "High-intensity full body circuit training",
  activity_type: "indoor_strength",
  estimated_tss: 65,
  estimated_duration: 2400, // 40 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Movement Prep",
        description: "Full body activation",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Dynamic movements to prepare entire body",
      },

      // High-intensity circuits
      {
        type: "repetition",
        repeat: 5,
        steps: [
          {
            name: "Circuit Round",
            description: "Multi-exercise circuit",
            type: "step",
            duration: { type: "time", value: 360, unit: "seconds" }, // 6 min
            targets: [{ type: "%ThresholdHR", intensity: 85 }],
            notes: "Burpees, mountain climbers, squat jumps, push-ups - 45s work, 15s rest",
          },
          {
            name: "Active Recovery",
            description: "Low-intensity movement",
            type: "step",
            duration: { type: "time", value: 120, unit: "seconds" }, // 2 min
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Light movement, breathing exercises",
          },
        ],
      },

      // Cool-down
      {
        name: "Recovery Stretch",
        description: "Full body stretching",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 50 }],
        notes: "Static stretches for all major muscle groups",
      },
    ],
  },
};

/**
 * Core and Stability - Indoor
 * Total time: 30 minutes
 * Estimated TSS: ~35
 */
export const CORE_STABILITY: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Core and Stability",
  description: "Focused core strength and stability training",
  activity_type: "indoor_strength",
  estimated_tss: 35,
  estimated_duration: 1800, // 30 minutes
  structure: {
    steps: [
      // Activation
      {
        name: "Core Activation",
        description: "Prepare core for training",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Breathing exercises, gentle core engagement",
      },

      // Main core work
      {
        type: "repetition",
        repeat: 3,
        steps: [
          {
            name: "Plank Variations",
            description: "Static core stability",
            type: "step",
            duration: { type: "time", value: 240, unit: "seconds" }, // 4 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "Front plank, side planks, plank variations - 30-60s holds",
          },
          {
            name: "Dynamic Core",
            description: "Movement-based core work",
            type: "step",
            duration: { type: "time", value: 240, unit: "seconds" }, // 4 min
            targets: [{ type: "%ThresholdHR", intensity: 75 }],
            notes: "Dead bugs, bird dogs, bicycle crunches, leg raises",
          },
          {
            name: "Recovery",
            description: "Brief recovery between rounds",
            type: "step",
            duration: { type: "time", value: 60, unit: "seconds" }, // 1 min
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Light movement and breathing",
          },
        ],
      },

      // Flexibility finish
      {
        name: "Hip and Spine Mobility",
        description: "Restore movement patterns",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 50 }],
        notes: "Cat-cow, hip circles, spinal twists",
      },
    ],
  },
};

/**
 * Functional Movement - Indoor
 * Total time: 35 minutes
 * Estimated TSS: ~45
 */
export const FUNCTIONAL_MOVEMENT: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Functional Movement",
  description: "Movement patterns for daily life and sport performance",
  activity_type: "indoor_strength",
  estimated_tss: 45,
  estimated_duration: 2100, // 35 minutes
  structure: {
    steps: [
      // Movement prep
      {
        name: "Movement Preparation",
        description: "Prepare joints and muscles",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Joint mobility, activation exercises",
      },

      // Functional patterns
      {
        type: "repetition",
        repeat: 4,
        steps: [
          {
            name: "Squat Patterns",
            description: "Functional squatting movements",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "Goblet squats, squat to press, jump squats",
          },
          {
            name: "Hinge Patterns",
            description: "Hip hinge movement patterns",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "Kettlebell swings, Romanian deadlifts, good mornings",
          },
          {
            name: "Push/Pull Patterns",
            description: "Upper body functional movements",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 70 }],
            notes: "Push-ups, rows, carries, throws",
          },
          {
            name: "Transition",
            description: "Movement between exercises",
            type: "step",
            duration: { type: "time", value: 60, unit: "seconds" }, // 1 min
            targets: [{ type: "%ThresholdHR", intensity: 60 }],
            notes: "Light movement, setup for next round",
          },
        ],
      },

      // Integration and cool-down
      {
        name: "Movement Integration",
        description: "Combine patterns and cool down",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Complex movements, stretching, relaxation",
      },
    ],
  },
};

export const SAMPLE_INDOOR_STRENGTH_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  UPPER_BODY_STRENGTH,
  LOWER_BODY_STRENGTH,
  FULL_BODY_CIRCUIT,
  CORE_STABILITY,
  FUNCTIONAL_MOVEMENT,
];
