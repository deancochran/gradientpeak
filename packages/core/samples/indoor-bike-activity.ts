import type { PlannedActivityStructure } from "../schemas/planned_activity";
import { ActivityTypeId } from "../types/activity-types";

/**
 * Sample Indoor Bike Trainer Activities for Development Testing
 *
 * These activities provide realistic examples for testing schema navigation,
 * compliance scoring, and UI components during development.
 */

/**
 * Beginner Indoor Bike Activity - Sweet Spot Intervals
 * Total time: 60 minutes
 * Estimated TSS: ~75
 */
export const SAMPLE_SWEET_SPOT_WORKOUT: PlannedActivityStructure = {
  version: "1.0",
  name: "Sweet Spot Intervals",
  description:
    "60-minute indoor trainer activity focusing on sweet spot power development",
  modality: "endurance",
  loadType: "power",
  environment: "indoor",
  steps: [
    // Warm-up phase
    {
      name: "Easy Warm-up",
      description: "Start easy and gradually increase effort",
      intensityClass: "WarmUp",
      duration: {
        type: "time",
        value: 600, // 10 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 50,
        max: 65,
        target: 55,
      },
      notes: "Focus on smooth pedaling and getting the legs moving",
    },

    // Build phase
    {
      name: "Build to Threshold",
      description: "Gradual build to near threshold",
      intensityClass: "WarmUp",
      duration: {
        type: "time",
        value: 300, // 5 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 75,
        max: 90,
        target: 85,
      },
      notes: "Steady progressive increase in effort",
    },

    // Recovery before main set
    {
      name: "Recovery",
      description: "Easy spinning before main intervals",
      intensityClass: "Rest",
      duration: {
        type: "time",
        value: 180, // 3 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 50,
        max: 60,
        target: 55,
      },
      notes: "Keep legs moving, prepare for main set",
    },

    // Main interval set - 4x8min Sweet Spot
    {
      repeat: 4,
      steps: [
        {
          name: "Sweet Spot Interval",
          description: "Sustained sweet spot effort",
          intensityClass: "Active",
          duration: {
            type: "time",
            value: 480, // 8 minutes
            unit: "seconds",
          },
          target: {
            type: "%FTP",
            min: 84,
            max: 97,
            target: 90,
          },
          notes: "Hold steady power in sweet spot zone (88-94% FTP)",
        },
        {
          name: "Recovery",
          description: "Easy recovery between intervals",
          intensityClass: "Rest",
          duration: {
            type: "time",
            value: 180, // 3 minutes
            unit: "seconds",
          },
          target: {
            type: "%FTP",
            min: 50,
            max: 65,
            target: 55,
          },
          notes: "Active recovery, keep pedaling easy",
        },
      ],
    },

    // Cool-down phase
    {
      name: "Cool-down",
      description: "Gradual cool-down to finish",
      intensityClass: "CoolDown",
      duration: {
        type: "time",
        value: 600, // 10 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 45,
        max: 60,
        target: 50,
      },
      notes: "Easy spinning to flush the legs",
    },
  ],
  notes:
    "Focus on maintaining steady power output during intervals. Use cadence of 85-95 RPM throughout.",
};

/**
 * Advanced Indoor Bike Activity - VO2 Max Intervals
 * Total time: 75 minutes
 * Estimated TSS: ~95
 */
export const SAMPLE_VO2_MAX_WORKOUT: PlannedActivityStructure = {
  version: "1.0",
  name: "VO2 Max Development",
  description: "75-minute activity with challenging VO2 max intervals",
  modality: "endurance",
  loadType: "power",
  environment: "indoor",
  steps: [
    // Extended warm-up
    {
      name: "Progressive Warm-up",
      description: "Extended warm-up for high-intensity session",
      intensityClass: "WarmUp",
      duration: {
        type: "time",
        value: 900, // 15 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 50,
        max: 70,
        target: 60,
      },
      notes: "Start easy and build gradually. Include some leg openers.",
    },

    // Activation efforts
    {
      repeat: 3,
      steps: [
        {
          name: "Activation Effort",
          description: "Short effort to activate high-end systems",
          intensityClass: "Active",
          duration: {
            type: "time",
            value: 30, // 30 seconds
            unit: "seconds",
          },
          target: {
            type: "%FTP",
            min: 110,
            max: 130,
            target: 120,
          },
          notes: "Hard but controlled effort",
        },
        {
          name: "Recovery",
          description: "Full recovery between efforts",
          intensityClass: "Rest",
          duration: {
            type: "time",
            value: 150, // 2.5 minutes
            unit: "seconds",
          },
          target: {
            type: "%FTP",
            min: 50,
            max: 60,
            target: 55,
          },
          notes: "Complete recovery before next effort",
        },
      ],
    },

    // Pre-main set recovery
    {
      name: "Preparation",
      description: "Prepare for main VO2 max set",
      intensityClass: "Rest",
      duration: {
        type: "time",
        value: 300, // 5 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 50,
        max: 60,
        target: 55,
      },
      notes: "Mental preparation for the main set",
    },

    // Main VO2 Max set - 5x5min @ 108% FTP
    {
      repeat: 5,
      steps: [
        {
          name: "VO2 Max Interval",
          description: "High-intensity VO2 max effort",
          intensityClass: "Active",
          duration: {
            type: "time",
            value: 300, // 5 minutes
            unit: "seconds",
          },
          target: {
            type: "%FTP",
            min: 105,
            max: 115,
            target: 110,
          },
          notes:
            "Sustained effort at VO2 max power. Focus on smooth breathing.",
        },
        {
          name: "Recovery",
          description: "Active recovery between VO2 intervals",
          intensityClass: "Rest",
          duration: {
            type: "time",
            value: 240, // 4 minutes
            unit: "seconds",
          },
          target: {
            type: "%FTP",
            min: 50,
            max: 65,
            target: 55,
          },
          notes: "Active recovery. Heart rate should come down significantly.",
        },
      ],
    },

    // Extended cool-down
    {
      name: "Cool-down",
      description: "Extended cool-down after hard efforts",
      intensityClass: "CoolDown",
      duration: {
        type: "time",
        value: 900, // 15 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 45,
        max: 55,
        target: 50,
      },
      notes: "Take time to cool down properly after intense efforts",
    },
  ],
  notes:
    "This is a challenging activity. Ensure you're well-fueled and hydrated. Maintain cadence of 90-100 RPM during intervals.",
};

/**
 * Recovery Indoor Bike Activity
 * Total time: 45 minutes
 * Estimated TSS: ~25
 */
export const SAMPLE_RECOVERY_WORKOUT: PlannedActivityStructure = {
  version: "1.0",
  name: "Active Recovery Ride",
  description: "45-minute easy recovery ride to promote blood flow",
  modality: "endurance",
  loadType: "hr",
  environment: "indoor",
  steps: [
    {
      name: "Easy Warm-up",
      description: "Very easy start",
      intensityClass: "WarmUp",
      duration: {
        type: "time",
        value: 300, // 5 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 40,
        max: 50,
        target: 45,
      },
      notes: "Start very easy, just getting the legs moving",
    },

    {
      name: "Steady Recovery Effort",
      description: "Main recovery effort",
      intensityClass: "Active",
      duration: {
        type: "time",
        value: 2100, // 35 minutes
        unit: "seconds",
      },
      target: {
        type: "%MaxHR",
        min: 60,
        max: 70,
        target: 65,
      },
      notes:
        "Comfortable conversational effort. Should feel refreshing, not tiring.",
    },

    {
      name: "Easy Cool-down",
      description: "Gentle finish",
      intensityClass: "CoolDown",
      duration: {
        type: "time",
        value: 300, // 5 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 40,
        max: 50,
        target: 45,
      },
      notes: "End as easy as you started",
    },
  ],
  notes:
    "Perfect for recovery days. Focus on smooth pedaling and feeling relaxed.",
};

/**
 * Sprint Power Development Activity
 * Total time: 50 minutes
 * Estimated TSS: ~55
 */
export const SAMPLE_SPRINT_WORKOUT: PlannedActivityStructure = {
  version: "1.0",
  name: "Sprint Power Development",
  description:
    "Short activity focusing on neuromuscular power and sprint development",
  modality: "endurance",
  loadType: "power",
  environment: "indoor",
  steps: [
    // Warm-up
    {
      name: "Progressive Warm-up",
      description: "Build up gradually for sprint work",
      intensityClass: "WarmUp",
      duration: {
        type: "time",
        value: 900, // 15 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 50,
        max: 75,
        target: 60,
      },
      notes: "Include some higher cadence work to prepare for sprints",
    },

    // Sprint openers
    {
      repeat: 3,
      steps: [
        {
          name: "Sprint Opener",
          description: "Short sprint to open up the legs",
          intensityClass: "Active",
          duration: {
            type: "time",
            value: 10, // 10 seconds
            unit: "seconds",
          },
          target: {
            type: "watts",
            min: 400,
            max: 800,
            target: 600,
          },
          notes: "All-out sprint from moderate speed",
        },
        {
          name: "Recovery",
          description: "Full recovery between openers",
          intensityClass: "Rest",
          duration: {
            type: "time",
            value: 230, // 3 min 50 sec
            unit: "seconds",
          },
          target: {
            type: "%FTP",
            min: 50,
            max: 60,
            target: 55,
          },
          notes: "Complete recovery",
        },
      ],
    },

    // Main sprint set
    {
      repeat: 6,
      steps: [
        {
          name: "Max Sprint",
          description: "Maximum sprint effort",
          intensityClass: "Active",
          duration: {
            type: "time",
            value: 15, // 15 seconds
            unit: "seconds",
          },
          target: {
            type: "watts",
            min: 500,
            max: 1000,
            target: 750,
          },
          notes: "All-out sprint - maximum power output",
        },
        {
          name: "Recovery",
          description: "Full recovery between sprints",
          intensityClass: "Rest",
          duration: {
            type: "time",
            value: 345, // 5 min 45 sec
            unit: "seconds",
          },
          target: {
            type: "%FTP",
            min: 45,
            max: 60,
            target: 50,
          },
          notes: "Complete recovery is essential for quality",
        },
      ],
    },

    // Cool-down
    {
      name: "Cool-down",
      description: "Easy spinning to finish",
      intensityClass: "CoolDown",
      duration: {
        type: "time",
        value: 600, // 10 minutes
        unit: "seconds",
      },
      target: {
        type: "%FTP",
        min: 45,
        max: 55,
        target: 50,
      },
      notes: "Easy spinning to flush lactate",
    },
  ],
  notes:
    "Focus on maximum power output during sprints. Build up gradually and maintain good form.",
};

/**
 * Get all sample activities for testing
 */
export const SAMPLE_WORKOUTS = {
  sweetSpot: SAMPLE_SWEET_SPOT_WORKOUT,
  vo2Max: SAMPLE_VO2_MAX_WORKOUT,
  recovery: SAMPLE_RECOVERY_WORKOUT,
  sprint: SAMPLE_SPRINT_WORKOUT,
} as const;

/**
 * Get activity by name
 */
export function getSampleActivity(
  name: keyof typeof SAMPLE_WORKOUTS,
): PlannedActivityStructure {
  return SAMPLE_WORKOUTS[name];
}

/**
 * Get all sample activity names
 */
export function getSampleActivityNames(): string[] {
  return Object.keys(SAMPLE_WORKOUTS);
}

/**
 * Get sample activities for a specific activity type
 */
export function getSampleActivitysForActivityType(
  activityType: ActivityTypeId,
): PlannedActivityStructure[] {
  // For now, all samples are indoor cycling
  if (activityType === ActivityTypeId.INDOOR_CYCLING) {
    return Object.values(SAMPLE_WORKOUTS);
  }
  return [];
}
