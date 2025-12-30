import type { RecordingServiceActivityPlan } from "../schemas";
import { SAMPLE_DEV_ACTIVITIES } from "./dev";
import { SAMPLE_INDOOR_TRAINER_ACTIVITIES } from "./indoor-bike-activity";
import { SAMPLE_INDOOR_STRENGTH_ACTIVITIES } from "./indoor-strength";
import { SAMPLE_INDOOR_SWIM_ACTIVITIES } from "./indoor-swim";
import { SAMPLE_TREADMILL_ACTIVITIES } from "./indoor-treadmill";
import { SAMPLE_OTHER_ACTIVITIES } from "./other-activity";
import { SAMPLE_OUTDOOR_BIKE_ACTIVITIES } from "./outdoor-bike";
import { SAMPLE_OUTDOOR_RUN_ACTIVITIES } from "./outdoor-run";

// Export individual activity type modules
export * from "./dev";
export * from "./indoor-bike-activity";
export * from "./indoor-strength";
export * from "./indoor-swim";
export * from "./indoor-treadmill";
export * from "./other-activity";
export * from "./outdoor-bike";
export * from "./outdoor-run";

// Combined sample activities array with all activity types
export const SAMPLE_ACTIVITIES = [
  // Indoor bike trainer (6 activities)
  ...SAMPLE_INDOOR_TRAINER_ACTIVITIES,

  // Indoor treadmill (5 activities)
  ...SAMPLE_TREADMILL_ACTIVITIES,

  // Outdoor running (5 activities)
  ...SAMPLE_OUTDOOR_RUN_ACTIVITIES,

  // Outdoor cycling (5 activities)
  ...SAMPLE_OUTDOOR_BIKE_ACTIVITIES,

  // Indoor strength training (5 activities)
  ...SAMPLE_INDOOR_STRENGTH_ACTIVITIES,

  // Indoor swimming (5 activities)
  ...SAMPLE_INDOOR_SWIM_ACTIVITIES,

  // Other activities (5 activities)
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
  dev: SAMPLE_DEV_ACTIVITIES,
} as const;

// Helper function to get sample activities by type (legacy)
export function getSampleActivitiesByType(
  activityType: keyof typeof SAMPLE_ACTIVITIES_BY_TYPE,
) {
  return SAMPLE_ACTIVITIES_BY_TYPE[activityType] || [];
}

// Helper function to get sample activities by category and location
export function getSampleActivitiesByCategory(
  category: "run" | "bike" | "swim" | "strength" | "other" | "dev",
  location: "indoor" | "outdoor",
) {
  const key = `${location}_${category}` as const;

  // Map to the actual keys in SAMPLE_ACTIVITIES_BY_TYPE
  const mappings: Record<string, keyof typeof SAMPLE_ACTIVITIES_BY_TYPE> = {
    outdoor_run: "outdoor_run",
    outdoor_bike: "outdoor_bike",
    indoor_run: "indoor_treadmill",
    indoor_bike: "indoor_bike_trainer",
    indoor_strength: "indoor_strength",
    indoor_swim: "indoor_swim",
    outdoor_other: "other",
    indoor_other: "other",
    outdoor_dev: "dev",
    indoor_dev: "dev",
  };

  const mappedKey = mappings[key];
  return mappedKey ? SAMPLE_ACTIVITIES_BY_TYPE[mappedKey] || [] : [];
}

// Total count of sample activities: 36 activities across 7 activity types
export const TOTAL_SAMPLE_ACTIVITIES = SAMPLE_ACTIVITIES.length;

// ============================================================================
// SYSTEM TEMPLATE REGISTRY
// ============================================================================

export type SystemTemplate = RecordingServiceActivityPlan & { id: string };

/**
 * Helper to map raw sample plans to SystemTemplate
 */
function mapToTemplate(plan: RecordingServiceActivityPlan): SystemTemplate {
  if (!plan.id) {
    throw new Error(`System template "${plan.name}" must have an ID`);
  }
  return plan as SystemTemplate;
}

// Convert samples to templates with appropriate tags
const indoorBikeTemplates = SAMPLE_INDOOR_TRAINER_ACTIVITIES.filter(
  (p) => !p.name.includes("Schema Test"),
).map(mapToTemplate);

const treadmillTemplates = SAMPLE_TREADMILL_ACTIVITIES.map(mapToTemplate);

const outdoorRunTemplates = SAMPLE_OUTDOOR_RUN_ACTIVITIES.map(mapToTemplate);

const outdoorBikeTemplates = SAMPLE_OUTDOOR_BIKE_ACTIVITIES.map(mapToTemplate);

const strengthTemplates = SAMPLE_INDOOR_STRENGTH_ACTIVITIES.map(mapToTemplate);

const swimTemplates = SAMPLE_INDOOR_SWIM_ACTIVITIES.map(mapToTemplate);

const otherTemplates = SAMPLE_OTHER_ACTIVITIES.map(mapToTemplate);

/**
 * All system templates that should be uploaded to the database.
 * Add new templates here and they'll automatically be included in the seed script.
 */
export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  ...indoorBikeTemplates,
  ...treadmillTemplates,
  ...outdoorRunTemplates,
  ...outdoorBikeTemplates,
  ...strengthTemplates,
  ...swimTemplates,
  ...otherTemplates,
];

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(
  category: SystemTemplate["activity_category"],
): SystemTemplate[] {
  return SYSTEM_TEMPLATES.filter((t) => t.activity_category === category);
}

/**
 * Get template by name
 */
export function getTemplateByName(name: string): SystemTemplate | undefined {
  return SYSTEM_TEMPLATES.find((t) => t.name === name);
}
