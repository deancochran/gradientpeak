import type { CanonicalActivityCategory } from "../schemas/activity-category";
import {
  createVersionedSystemContentDefinition,
  type VersionedSystemContentDefinition,
} from "./content-identity";
import { EXPANDED_ENDURANCE_BIKE_ACTIVITIES } from "./endurance-expansion-bike";
import { EXPANDED_ENDURANCE_OTHER_ACTIVITIES } from "./endurance-expansion-other";
import { EXPANDED_ENDURANCE_RUN_ACTIVITIES } from "./endurance-expansion-run";
import { EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES } from "./endurance-expansion-strength";
import { EXPANDED_ENDURANCE_SWIM_ACTIVITIES } from "./endurance-expansion-swim";
import { ICONIC_ENDURANCE_ACTIVITIES } from "./iconic-endurance";
import { SAMPLE_INDOOR_TRAINER_ACTIVITIES } from "./indoor-bike-activity";
import { SAMPLE_INDOOR_STRENGTH_ACTIVITIES } from "./indoor-strength";
import { SAMPLE_INDOOR_SWIM_ACTIVITIES } from "./indoor-swim";
import { SAMPLE_TREADMILL_ACTIVITIES } from "./indoor-treadmill";
import { SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES } from "./multisport";
import { SAMPLE_OTHER_ACTIVITIES } from "./other-activity";
import { SAMPLE_OUTDOOR_BIKE_ACTIVITIES } from "./outdoor-bike";
import { SAMPLE_OUTDOOR_RUN_ACTIVITIES } from "./outdoor-run";
import { classifySystemActivityTemplate } from "./system-activity-template-taxonomy";
import { normalizeSystemActivityTemplateId } from "./template-ids";
import { ALL_SAMPLE_PLANS } from "./training-plans";
import {
  deriveSystemActivityTemplateActivityCategory,
  type SystemActivityPlanTemplate,
} from "./types";

export * from "./activity-plan-portfolio";
export * from "./content-identity";
export * from "./endurance-expansion-bike";
export * from "./endurance-expansion-other";
export * from "./endurance-expansion-run";
export * from "./endurance-expansion-strength";
export * from "./endurance-expansion-swim";
export * from "./iconic-endurance";
// Export individual activity category modules
export * from "./indoor-bike-activity";
export * from "./indoor-strength";
export * from "./indoor-swim";
export * from "./indoor-treadmill";
export * from "./multisport";
export * from "./other-activity";
export * from "./outdoor-bike";
export * from "./outdoor-run";
export * from "./system-activity-template-taxonomy";
export * from "./system-routes";
// Export training plan samples
export * from "./training-plans";
export * from "./types";

// Combined sample activities array with all activity categories
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

  // Indoor swimming (6 activities)
  ...SAMPLE_INDOOR_SWIM_ACTIVITIES,

  // Other activities (7 activities)
  ...SAMPLE_OTHER_ACTIVITIES,
];

// Activity-category-specific collections for easier filtering
export const SAMPLE_ACTIVITIES_BY_TYPE = {
  indoor_bike_trainer: SAMPLE_INDOOR_TRAINER_ACTIVITIES,
  indoor_treadmill: SAMPLE_TREADMILL_ACTIVITIES,
  outdoor_run: SAMPLE_OUTDOOR_RUN_ACTIVITIES,
  outdoor_bike: SAMPLE_OUTDOOR_BIKE_ACTIVITIES,
  indoor_strength: SAMPLE_INDOOR_STRENGTH_ACTIVITIES,
  indoor_swim: SAMPLE_INDOOR_SWIM_ACTIVITIES,
  other: SAMPLE_OTHER_ACTIVITIES,
} as const;

// Helper function to get sample activities by activity_category and GPS intent
export function getSampleActivitiesByCategory(
  activity_category: "run" | "bike" | "swim" | "strength" | "other",
  gpsRecordingEnabled: boolean,
) {
  if (activity_category === "run") {
    return gpsRecordingEnabled
      ? SAMPLE_ACTIVITIES_BY_TYPE.outdoor_run
      : SAMPLE_ACTIVITIES_BY_TYPE.indoor_treadmill;
  }

  if (activity_category === "bike") {
    return gpsRecordingEnabled
      ? SAMPLE_ACTIVITIES_BY_TYPE.outdoor_bike
      : SAMPLE_ACTIVITIES_BY_TYPE.indoor_bike_trainer;
  }

  if (activity_category === "swim") return SAMPLE_ACTIVITIES_BY_TYPE.indoor_swim;
  if (activity_category === "strength") return SAMPLE_ACTIVITIES_BY_TYPE.indoor_strength;
  if (activity_category === "other") return SAMPLE_ACTIVITIES_BY_TYPE.other;
  return [];
}

// Total count of sample activities: 39 activities across 7 activity categories
export const TOTAL_SAMPLE_ACTIVITIES = SAMPLE_ACTIVITIES.length;

// ============================================================================
// SYSTEM TEMPLATE REGISTRY
// ============================================================================

export type SystemTemplate = SystemActivityPlanTemplate & {
  id: string;
  training_intent: NonNullable<SystemActivityPlanTemplate["training_intent"]>;
  adaptation: NonNullable<SystemActivityPlanTemplate["adaptation"]> | null;
};

/**
 * Helper to map raw sample plans to SystemTemplate
 */
function mapToTemplate(plan: SystemActivityPlanTemplate): SystemTemplate {
  if (!plan.id) {
    throw new Error(`System activity template ${plan.name} must declare an RFC 4122 UUID`);
  }

  const normalizedId = normalizeSystemActivityTemplateId({
    id: plan.id,
    activityCategory: deriveSystemActivityTemplateActivityCategory(plan.structure),
    name: plan.name ?? "template",
  });
  const metadata = classifySystemActivityTemplate(plan);
  const trainingIntent = plan.training_intent ?? metadata.training_intent;

  return {
    ...plan,
    id: normalizedId,
    training_intent: trainingIntent,
    adaptation: plan.adaptation ?? null,
  };
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
const multisportComponentTemplates = SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES.map(mapToTemplate);
const expandedEnduranceBikeTemplates = EXPANDED_ENDURANCE_BIKE_ACTIVITIES.map(mapToTemplate);
const expandedEnduranceRunTemplates = EXPANDED_ENDURANCE_RUN_ACTIVITIES.map(mapToTemplate);
const expandedEnduranceSwimTemplates = EXPANDED_ENDURANCE_SWIM_ACTIVITIES.map(mapToTemplate);
const expandedEnduranceOtherTemplates = EXPANDED_ENDURANCE_OTHER_ACTIVITIES.map(mapToTemplate);
const expandedEnduranceStrengthTemplates =
  EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES.map(mapToTemplate);
const iconicEnduranceTemplates = ICONIC_ENDURANCE_ACTIVITIES.map(mapToTemplate);

/**
 * All system templates that should be uploaded to the database.
 * Add new templates here and they'll automatically be included in the seed script.
 */
export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  ...indoorBikeTemplates,
  ...treadmillTemplates,
  ...outdoorRunTemplates,
  ...outdoorBikeTemplates,
  ...expandedEnduranceBikeTemplates,
  ...expandedEnduranceRunTemplates,
  ...expandedEnduranceSwimTemplates,
  ...expandedEnduranceStrengthTemplates,
  ...expandedEnduranceOtherTemplates,
  ...iconicEnduranceTemplates,
  ...strengthTemplates,
  ...swimTemplates,
  ...otherTemplates,
  ...multisportComponentTemplates,
];

export type SystemActivityTemplateDefinition = VersionedSystemContentDefinition<SystemTemplate>;

export async function getSystemActivityTemplateDefinitions(): Promise<
  SystemActivityTemplateDefinition[]
> {
  return Promise.all(
    SYSTEM_TEMPLATES.map((content) =>
      createVersionedSystemContentDefinition({
        key: `activity-plan:${content.id}`,
        content,
      }),
    ),
  );
}

export async function getSystemTrainingPlanDefinitions() {
  return Promise.all(
    ALL_SAMPLE_PLANS.map((content) =>
      createVersionedSystemContentDefinition({
        key: `training-plan:${content.id}`,
        content,
      }),
    ),
  );
}

/**
 * Get templates filtered by activity_category
 */
export function getTemplatesByCategory(
  activity_category: CanonicalActivityCategory,
): SystemTemplate[] {
  return SYSTEM_TEMPLATES.filter(
    (template) =>
      deriveSystemActivityTemplateActivityCategory(template.structure) === activity_category,
  );
}

/**
 * Get template by name
 */
export function getTemplateByName(name: string): SystemTemplate | undefined {
  return SYSTEM_TEMPLATES.find((t) => t.name === name);
}

// ============================================================================
// TRAINING PLAN SYSTEM TEMPLATES
// ============================================================================

/**
 * Total count of sample training plans
 */
export const TOTAL_SAMPLE_TRAINING_PLANS = ALL_SAMPLE_PLANS.length;
