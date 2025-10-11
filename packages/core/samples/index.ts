import { SAMPLE_INDOOR_TRAINER_ACTIVITIES } from "./indoor-bike-activity";
import { SAMPLE_INDOOR_STRENGTH_ACTIVITIES } from "./indoor-strength";
import { SAMPLE_INDOOR_SWIM_ACTIVITIES } from "./indoor-swim";
import { SAMPLE_TREADMILL_ACTIVITIES } from "./indoor-treadmill";
import { SAMPLE_OTHER_ACTIVITIES } from "./other-activity";
import { SAMPLE_OUTDOOR_BIKE_ACTIVITIES } from "./outdoor-bike";
import { SAMPLE_OUTDOOR_RUN_ACTIVITIES } from "./outdoor-run";

// Export individual activity type modules
export * from "./indoor-bike-activity";
export * from "./indoor-strength";
export * from "./indoor-swim";
export * from "./indoor-treadmill";
export * from "./other-activity";
export * from "./outdoor-bike";
export * from "./outdoor-run";

// Combined sample activities array with all activity types
export const SAMPLE_ACTIVITIES = [
  // Indoor bike trainer (6 workouts)
  ...SAMPLE_INDOOR_TRAINER_ACTIVITIES,

  // Indoor treadmill (5 workouts)
  ...SAMPLE_TREADMILL_ACTIVITIES,

  // Outdoor running (5 workouts)
  ...SAMPLE_OUTDOOR_RUN_ACTIVITIES,

  // Outdoor cycling (5 workouts)
  ...SAMPLE_OUTDOOR_BIKE_ACTIVITIES,

  // Indoor strength training (5 workouts)
  ...SAMPLE_INDOOR_STRENGTH_ACTIVITIES,

  // Indoor swimming (5 workouts)
  ...SAMPLE_INDOOR_SWIM_ACTIVITIES,

  // Other activities (5 workouts)
  ...SAMPLE_OTHER_ACTIVITIES,
];

// Activity type specific collections for easier filtering
export const SAMPLE_ACTIVITIES_BY_TYPE = {
  indoor_bike_trainer: SAMPLE_INDOOR_TRAINER_ACTIVITIES,
  indoor_treadmill: SAMPLE_TREADMILL_ACTIVITIES,
  outdoor_run: SAMPLE_OUTDOOR_RUN_ACTIVITIES,
  outdoor_bike: SAMPLE_OUTDOOR_BIKE_ACTIVITIES,
  indoor_strength: SAMPLE_INDOOR_STRENGTH_ACTIVITIES,
  indoor_swim: SAMPLE_INDOOR_SWIM_ACTIVITIES,
  other: SAMPLE_OTHER_ACTIVITIES,
} as const;

// Helper function to get sample activities by type
export function getSampleActivitiesByType(
  activityType: keyof typeof SAMPLE_ACTIVITIES_BY_TYPE,
) {
  return SAMPLE_ACTIVITIES_BY_TYPE[activityType] || [];
}

// Total count of sample activities: 36 workouts across 7 activity types
export const TOTAL_SAMPLE_ACTIVITIES = SAMPLE_ACTIVITIES.length;
