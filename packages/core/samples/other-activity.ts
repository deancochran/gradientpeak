import type { RecordingServiceActivityPlan } from "../schemas";

/**
 * Yoga Flow - Other Activity
 * Total time: 60 minutes
 * Estimated TSS: ~30
 */
export const YOGA_FLOW: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Yoga Flow",
  description: "Gentle yoga flow for flexibility and mindfulness",
  activity_type: "other",
  estimated_tss: 30,
  estimated_duration: 3600, // 60 minutes
  structure: {
    steps: [
      // Centering and warm-up
      {
        name: "Centering & Breath",
        description: "Establish breath and presence",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 50 }],
        notes: "Focus on breathing, gentle movements to center yourself",
      },

      // Sun salutations
      {
        name: "Sun Salutations",
        description: "Dynamic flowing sequences",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "5-8 rounds of sun salutation A and B, link breath with movement",
      },

      // Standing poses
      {
        name: "Standing Poses",
        description: "Strength and balance poses",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Warrior poses, triangle, tree pose - hold for 5-8 breaths each",
      },

      // Floor sequence
      {
        name: "Floor Sequence",
        description: "Seated and supine poses",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 45 }],
        notes: "Hip openers, twists, gentle backbends",
      },

      // Savasana
      {
        name: "Relaxation",
        description: "Final relaxation and meditation",
        type: "step",
        duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
        targets: [{ type: "%ThresholdHR", intensity: 40 }],
        notes: "Complete stillness, body scan, deep relaxation",
      },
    ],
  },
};

/**
 * Rock Climbing - Other Activity
 * Total time: 90 minutes
 * Estimated TSS: ~70
 */
export const ROCK_CLIMBING_SESSION: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Rock Climbing Session",
  description: "Indoor/outdoor rock climbing session with warm-up and cool-down",
  activity_type: "other",
  estimated_tss: 70,
  estimated_duration: 5400, // 90 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Dynamic Warm-up",
        description: "Prepare joints and muscles for climbing",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Arm circles, finger/wrist mobility, easy traversing or easy routes",
      },

      // Easy climbing
      {
        name: "Easy Routes",
        description: "Warm-up climbing on easier grades",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Climb 3-5 easy routes to get movement patterns flowing",
      },

      // Main climbing session
      {
        type: "repetition",
        repeat: 8,
        steps: [
          {
            name: "Challenging Route",
            description: "Work on challenging routes near your limit",
            type: "step",
            duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
            targets: [{ type: "%ThresholdHR", intensity: 80 }],
            notes: "Project routes, work specific moves, push your grade",
          },
          {
            name: "Rest & Recovery",
            description: "Rest between challenging attempts",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%ThresholdHR", intensity: 55 }],
            notes: "Complete rest, hydrate, chalk up, visualize next attempt",
          },
        ],
      },

      // Endurance climbing
      {
        name: "Volume Climbing",
        description: "Higher volume on moderate grades",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Climb continuously on moderate routes for endurance",
      },

      // Cool-down
      {
        name: "Cool-down & Stretch",
        description: "Easy climbing and stretching",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 50 }],
        notes: "Easy traversing, forearm stretches, shoulder mobility",
      },
    ],
  },
};

/**
 * Hiking Adventure - Other Activity
 * Total time: 120 minutes
 * Estimated TSS: ~60
 */
export const HIKING_ADVENTURE: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Hiking Adventure",
  description: "Moderate-intensity hiking with varied terrain",
  activity_type: "other",
  estimated_tss: 60,
  estimated_duration: 7200, // 120 minutes
  structure: {
    steps: [
      // Initial approach
      {
        name: "Trail Approach",
        description: "Start with gentle terrain",
        type: "step",
        duration: { type: "time", value: 1800, unit: "seconds" }, // 30 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Steady pace on relatively flat or gently rolling terrain",
      },

      // Climbing section
      {
        name: "Uphill Section",
        description: "Sustained climbing on trail",
        type: "step",
        duration: { type: "time", value: 2400, unit: "seconds" }, // 40 min
        targets: [{ type: "%ThresholdHR", intensity: 75 }],
        notes: "Steady uphill hiking, adjust pace to maintain breathing rhythm",
      },

      // Summit/viewpoint
      {
        name: "Summit Break",
        description: "Rest and enjoy the view",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 50 }],
        notes: "Hydrate, fuel, take photos, enjoy the accomplishment",
      },

      // Descent
      {
        name: "Trail Descent",
        description: "Controlled descent back to trailhead",
        type: "step",
        duration: { type: "time", value: 2400, unit: "seconds" }, // 40 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Control pace on downhill, focus on foot placement and knee impact",
      },
    ],
  },
};

/**
 * CrossFit WOD - Other Activity
 * Total time: 45 minutes
 * Estimated TSS: ~80
 */
export const CROSSFIT_WOD: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "CrossFit WOD",
  description: "High-intensity CrossFit workout of the day",
  activity_type: "other",
  estimated_tss: 80,
  estimated_duration: 2700, // 45 minutes
  structure: {
    steps: [
      // General warm-up
      {
        name: "General Warm-up",
        description: "Dynamic movement preparation",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
        notes: "Row/bike, dynamic stretching, movement prep",
      },

      // Specific warm-up
      {
        name: "Specific Warm-up",
        description: "Practice movements from the WOD",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Practice WOD movements at light weight/modified versions",
      },

      // Main WOD
      {
        name: "Main WOD",
        description: "High-intensity workout",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 88 }],
        notes: "AMRAP, EMOM, or time-based workout - push hard but maintain form",
      },

      // Cool-down
      {
        name: "Cool-down & Mobility",
        description: "Recovery and flexibility work",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 50 }],
        notes: "Easy movement, static stretching, foam rolling",
      },
    ],
  },
};

/**
 * Walking Recovery - Other Activity
 * Total time: 45 minutes
 * Estimated TSS: ~20
 */
export const WALKING_RECOVERY: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Recovery Walk",
  description: "Gentle walking session for active recovery",
  activity_type: "other",
  estimated_tss: 20,
  estimated_duration: 2700, // 45 minutes
  structure: {
    steps: [
      // Easy start
      {
        name: "Easy Start",
        description: "Begin with gentle pace",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Very comfortable walking pace, focus on posture and breathing",
      },

      // Steady middle
      {
        name: "Steady Walk",
        description: "Maintain comfortable rhythm",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
        notes: "Slightly brisker pace but still conversational",
      },

      // Easy finish
      {
        name: "Easy Finish",
        description: "Wind down with gentle pace",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%ThresholdHR", intensity: 55 }],
        notes: "Return to gentle pace, enjoy the surroundings",
      },
    ],
  },
};

export const SAMPLE_OTHER_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  YOGA_FLOW,
  ROCK_CLIMBING_SESSION,
  HIKING_ADVENTURE,
  CROSSFIT_WOD,
  WALKING_RECOVERY,
];
