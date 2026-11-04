import type { ActivityPlanTrainingIntent } from "../activity-plan";
import { getExactDurationSeconds } from "../duration";
import { REFERENCE_ASSESSMENT_ACTIVITIES } from "./assessment-activities";
import { EXPANDED_ENDURANCE_BIKE_ACTIVITIES } from "./endurance-expansion-bike";
import { EXPANDED_ENDURANCE_OTHER_ACTIVITIES } from "./endurance-expansion-other";
import { EXPANDED_ENDURANCE_RUN_ACTIVITIES } from "./endurance-expansion-run";
import { EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES } from "./endurance-expansion-strength";
import { EXPANDED_ENDURANCE_SWIM_ACTIVITIES } from "./endurance-expansion-swim";
import { ICONIC_ENDURANCE_ACTIVITIES } from "./iconic-endurance";
import {
  SAMPLE_INDOOR_TRAINER_ACTIVITIES,
  SYSTEM_FTP_INTERVALS_WORKOUT,
  SYSTEM_SWEET_SPOT_WORKOUT,
  SYSTEM_VO2_MAX_WORKOUT,
} from "./indoor-bike-activity";
import { SAMPLE_INDOOR_STRENGTH_ACTIVITIES } from "./indoor-strength";
import { SAMPLE_INDOOR_SWIM_ACTIVITIES } from "./indoor-swim";
import {
  SAMPLE_TREADMILL_ACTIVITIES,
  THRESHOLD_RUN_WORKOUT_1,
  THRESHOLD_RUN_WORKOUT_2,
} from "./indoor-treadmill";
import { SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES } from "./multisport";
import {
  OTHER_RACE_SIMULATION,
  OTHER_THRESHOLD_ROW,
  SAMPLE_OTHER_ACTIVITIES,
} from "./other-activity";
import {
  GROUP_RIDE_SIMULATION,
  SAMPLE_OUTDOOR_BIKE_ACTIVITIES,
  SYSTEM_PROGRESSIVE_LONG_ENDURANCE_RIDE,
} from "./outdoor-bike";
import {
  FARTLEK_RUN,
  SAMPLE_OUTDOOR_RUN_ACTIVITIES,
  SYSTEM_MARATHON_PACE_LONG_RUN,
} from "./outdoor-run";
import { normalizeSystemActivityTemplateId } from "./template-ids";
import type { SystemActivityPlanTemplate as RecordingServiceActivityPlan } from "./types";
import { deriveSystemActivityTemplateActivityCategory } from "./types";

export type SystemActivityTemplateExecutionContext = "indoor" | "outdoor";

export type SystemActivityTemplateArchetype =
  | "easy_recovery"
  | "aerobic_endurance"
  | "steady_moderate"
  | "tempo"
  | "threshold"
  | "sweet_spot"
  | "vo2_speed"
  | "race_pace"
  | "long_endurance"
  | "climbing_muscular_endurance"
  | "anaerobic_power"
  | "swim_technique"
  | "swim_endurance"
  | "strength_support"
  | "general_aerobic"
  | "mixed_support";

export type SystemActivityTemplateTrainingIntent = ActivityPlanTrainingIntent;

export type SystemActivityTemplateIntensityFamily =
  | "recovery"
  | "endurance"
  | "moderate"
  | "tempo"
  | "threshold"
  | "high_intensity"
  | "race_specific"
  | "support";

export type SystemActivityTemplateProgressionLevel =
  | "conservative"
  | "foundation"
  | "progressive"
  | "advanced"
  | "race_specific"
  | "support";

export type SystemActivityTemplateRecoveryCostBand = "low" | "moderate" | "high";

export interface SystemActivityTemplateSourceMetadata {
  source_file: string;
  execution_context: SystemActivityTemplateExecutionContext;
}

export interface SystemActivityTemplateTaxonomyMetadata
  extends SystemActivityTemplateSourceMetadata {
  session_archetype: SystemActivityTemplateArchetype;
  training_intent: SystemActivityTemplateTrainingIntent;
  intensity_family: SystemActivityTemplateIntensityFamily;
  progression_level: SystemActivityTemplateProgressionLevel;
  recovery_cost_band: SystemActivityTemplateRecoveryCostBand;
}

export type SystemActivityTemplateTaxonomyOverride = Partial<
  Omit<SystemActivityTemplateTaxonomyMetadata, "source_file" | "execution_context">
>;

export const SYSTEM_ACTIVITY_TEMPLATE_TAXONOMY_STRATEGY = "hybrid-derived-plus-sidecar" as const;

function toNormalizedTemplateId(template: RecordingServiceActivityPlan): string {
  if (!template.id) {
    throw new Error(
      `System activity template ${template.name ?? "template"} must declare an RFC 4122 UUID`,
    );
  }

  return normalizeSystemActivityTemplateId({
    id: template.id,
    activityCategory: deriveSystemActivityTemplateActivityCategory(template.structure),
    name: template.name ?? "template",
  });
}

function estimateTemplateDurationSeconds(template: RecordingServiceActivityPlan): number | null {
  let totalSeconds = 0;
  for (const item of template.structure.items) {
    let itemSeconds = 0;
    for (const step of item.type === "step" ? [item] : item.steps) {
      const stepSeconds = getExactDurationSeconds(step.duration);
      if (stepSeconds === null) return null;
      itemSeconds += stepSeconds;
    }
    totalSeconds += itemSeconds * (item.type === "repeat" ? item.count : 1);
  }
  return totalSeconds;
}

function includesAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function deriveRunArchetype(name: string): SystemActivityTemplateArchetype {
  if (includesAny(name, ["recovery", "shakeout"])) {
    return "easy_recovery";
  }
  if (includesAny(name, ["long"])) {
    return "long_endurance";
  }
  if (includesAny(name, ["tempo"])) {
    return "tempo";
  }
  if (includesAny(name, ["threshold"])) {
    return "threshold";
  }
  if (includesAny(name, ["5k pace", "race pace", "time trial", "yasso", "mile repeat"])) {
    return "race_pace";
  }
  if (includesAny(name, ["anaerobic", "sprint", "stride", "neuromuscular", "speed skill"])) {
    return "anaerobic_power";
  }
  if (
    includesAny(name, ["vo2", "fartlek", "hill", "interval", "track", "repeat", "ladder", "stride"])
  ) {
    return "vo2_speed";
  }
  if (includesAny(name, ["aerobic", "endurance"])) {
    return "aerobic_endurance";
  }

  return "steady_moderate";
}

function deriveBikeArchetype(name: string): SystemActivityTemplateArchetype {
  if (includesAny(name, ["recovery"])) {
    return "easy_recovery";
  }
  if (includesAny(name, ["long"])) {
    return "long_endurance";
  }
  if (includesAny(name, ["sweet spot"])) {
    return "sweet_spot";
  }
  if (includesAny(name, ["ftp", "threshold"])) {
    return "threshold";
  }
  if (includesAny(name, ["climbing"])) {
    return "climbing_muscular_endurance";
  }
  if (includesAny(name, ["vo2", "sprint", "group ride"])) {
    return "anaerobic_power";
  }
  if (includesAny(name, ["tempo"])) {
    return "steady_moderate";
  }

  return "aerobic_endurance";
}

function deriveOtherArchetype(
  template: RecordingServiceActivityPlan,
  name: string,
): SystemActivityTemplateArchetype {
  const activity_category = deriveSystemActivityTemplateActivityCategory(template.structure);
  if (activity_category === "strength") {
    return "strength_support";
  }
  if (activity_category === "swim") {
    return includesAny(name, ["technique", "drill"]) ? "swim_technique" : "swim_endurance";
  }
  if (includesAny(name, ["mobility", "walk", "recovery"])) {
    return "mixed_support";
  }
  if (includesAny(name, ["threshold"])) {
    return "threshold";
  }
  if (includesAny(name, ["long", "endurance"])) {
    return "long_endurance";
  }

  return "general_aerobic";
}

function deriveTemplateArchetype(
  template: RecordingServiceActivityPlan,
): SystemActivityTemplateArchetype {
  const name = template.name.toLowerCase();

  const activity_category = deriveSystemActivityTemplateActivityCategory(template.structure);
  if (activity_category === "run") {
    return deriveRunArchetype(name);
  }
  if (activity_category === "bike") {
    return deriveBikeArchetype(name);
  }

  return deriveOtherArchetype(template, name);
}

function deriveIntensityFamily(
  archetype: SystemActivityTemplateArchetype,
): SystemActivityTemplateIntensityFamily {
  switch (archetype) {
    case "easy_recovery":
      return "recovery";
    case "aerobic_endurance":
    case "long_endurance":
    case "swim_endurance":
    case "general_aerobic":
      return "endurance";
    case "steady_moderate":
    case "climbing_muscular_endurance":
      return "moderate";
    case "tempo":
    case "sweet_spot":
      return "tempo";
    case "threshold":
      return "threshold";
    case "race_pace":
      return "race_specific";
    case "vo2_speed":
    case "anaerobic_power":
      return "high_intensity";
    case "swim_technique":
    case "strength_support":
    case "mixed_support":
      return "support";
  }
}

function deriveTrainingIntent(
  archetype: SystemActivityTemplateArchetype,
): SystemActivityTemplateTrainingIntent {
  switch (archetype) {
    case "easy_recovery":
      return "recovery";
    case "aerobic_endurance":
    case "swim_endurance":
    case "general_aerobic":
      return "aerobic_base";
    case "steady_moderate":
    case "long_endurance":
      return "durable_endurance";
    case "tempo":
    case "threshold":
    case "sweet_spot":
      return "threshold_development";
    case "race_pace":
      return "race_specific";
    case "vo2_speed":
      return "vo2max";
    case "climbing_muscular_endurance":
      return "muscular_endurance";
    case "anaerobic_power":
      return "speed_skill";
    case "swim_technique":
      return "technique";
    case "strength_support":
      return "strength_support";
    case "mixed_support":
      return "general_maintenance";
  }
}

function deriveProgressionLevel(input: {
  template: RecordingServiceActivityPlan;
  archetype: SystemActivityTemplateArchetype;
  durationSeconds: number | null;
}): SystemActivityTemplateProgressionLevel {
  const name = input.template.name.toLowerCase();

  if (includesAny(name, ["race pace", "time trial", "primer"])) {
    return "race_specific";
  }
  if (
    input.archetype === "strength_support" ||
    input.archetype === "swim_technique" ||
    input.archetype === "mixed_support"
  ) {
    return "support";
  }
  if (includesAny(name, ["recovery", "easy"])) {
    return "conservative";
  }
  if (includesAny(name, ["development 2", "advanced"])) {
    return "advanced";
  }
  if (
    includesAny(name, ["development 1", "progressive", "long"]) ||
    (input.durationSeconds !== null && input.durationSeconds >= 7200)
  ) {
    return "progressive";
  }

  return "foundation";
}

function deriveRecoveryCostBand(input: {
  archetype: SystemActivityTemplateArchetype;
  intensityFamily: SystemActivityTemplateIntensityFamily;
  durationSeconds: number | null;
}): SystemActivityTemplateRecoveryCostBand {
  if (input.intensityFamily === "support" || input.intensityFamily === "recovery") {
    return "low";
  }

  if (
    input.intensityFamily === "high_intensity" ||
    input.intensityFamily === "race_specific" ||
    (input.durationSeconds !== null && input.durationSeconds >= 7200)
  ) {
    return "high";
  }

  return "moderate";
}

const SYSTEM_TEMPLATE_SOURCE_GROUPS = [
  {
    source_file: "assessment-activities.ts",
    execution_context: "indoor" as const,
    templates: REFERENCE_ASSESSMENT_ACTIVITIES,
  },
  {
    source_file: "endurance-expansion-bike.ts",
    execution_context: "indoor" as const,
    templates: EXPANDED_ENDURANCE_BIKE_ACTIVITIES,
  },
  {
    source_file: "endurance-expansion-run.ts",
    execution_context: "outdoor" as const,
    templates: EXPANDED_ENDURANCE_RUN_ACTIVITIES,
  },
  {
    source_file: "endurance-expansion-swim.ts",
    execution_context: "indoor" as const,
    templates: EXPANDED_ENDURANCE_SWIM_ACTIVITIES,
  },
  {
    source_file: "endurance-expansion-strength.ts",
    execution_context: "indoor" as const,
    templates: EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES,
  },
  {
    source_file: "endurance-expansion-other.ts",
    execution_context: "indoor" as const,
    templates: EXPANDED_ENDURANCE_OTHER_ACTIVITIES,
  },
  {
    source_file: "iconic-endurance.ts",
    execution_context: "outdoor" as const,
    templates: ICONIC_ENDURANCE_ACTIVITIES,
  },
  {
    source_file: "indoor-bike-activity.ts",
    execution_context: "indoor" as const,
    templates: SAMPLE_INDOOR_TRAINER_ACTIVITIES.filter(
      (template) => !template.name.includes("Schema Test"),
    ),
  },
  {
    source_file: "indoor-treadmill.ts",
    execution_context: "indoor" as const,
    templates: SAMPLE_TREADMILL_ACTIVITIES,
  },
  {
    source_file: "outdoor-run.ts",
    execution_context: "outdoor" as const,
    templates: SAMPLE_OUTDOOR_RUN_ACTIVITIES,
  },
  {
    source_file: "outdoor-bike.ts",
    execution_context: "outdoor" as const,
    templates: SAMPLE_OUTDOOR_BIKE_ACTIVITIES,
  },
  {
    source_file: "indoor-strength.ts",
    execution_context: "indoor" as const,
    templates: SAMPLE_INDOOR_STRENGTH_ACTIVITIES,
  },
  {
    source_file: "indoor-swim.ts",
    execution_context: "indoor" as const,
    templates: SAMPLE_INDOOR_SWIM_ACTIVITIES,
  },
  {
    source_file: "other-activity.ts",
    execution_context: "outdoor" as const,
    templates: SAMPLE_OTHER_ACTIVITIES.filter((template) => template !== OTHER_THRESHOLD_ROW),
  },
  {
    source_file: "other-activity.ts",
    execution_context: "indoor" as const,
    templates: [OTHER_THRESHOLD_ROW],
  },
  {
    source_file: "multisport.ts",
    execution_context: "outdoor" as const,
    templates: SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES,
  },
] as const;

export const SYSTEM_ACTIVITY_TEMPLATE_SOURCE_INDEX = new Map<
  string,
  SystemActivityTemplateSourceMetadata
>(
  SYSTEM_TEMPLATE_SOURCE_GROUPS.flatMap((group) =>
    group.templates.map((template) => [
      toNormalizedTemplateId(template),
      {
        source_file: group.source_file,
        execution_context: group.execution_context,
      },
    ]),
  ),
);

export const SYSTEM_ACTIVITY_TEMPLATE_TAXONOMY_OVERRIDES: Readonly<
  Record<string, SystemActivityTemplateTaxonomyOverride>
> = {
  [toNormalizedTemplateId(THRESHOLD_RUN_WORKOUT_1)]: {
    session_archetype: "threshold",
    training_intent: "threshold_development",
  },
  [toNormalizedTemplateId(THRESHOLD_RUN_WORKOUT_2)]: {
    session_archetype: "threshold",
    training_intent: "threshold_development",
    progression_level: "advanced",
  },
  [toNormalizedTemplateId(FARTLEK_RUN)]: {
    session_archetype: "vo2_speed",
    training_intent: "speed_skill",
    intensity_family: "high_intensity",
  },
  [toNormalizedTemplateId(SYSTEM_MARATHON_PACE_LONG_RUN)]: {
    session_archetype: "long_endurance",
    training_intent: "race_specific",
    intensity_family: "race_specific",
    progression_level: "race_specific",
    recovery_cost_band: "high",
  },
  [toNormalizedTemplateId(OTHER_RACE_SIMULATION)]: {
    session_archetype: "race_pace",
    training_intent: "race_specific",
    intensity_family: "race_specific",
    progression_level: "race_specific",
    recovery_cost_band: "high",
  },
  [toNormalizedTemplateId(SYSTEM_SWEET_SPOT_WORKOUT)]: {
    session_archetype: "sweet_spot",
    training_intent: "threshold_development",
    intensity_family: "tempo",
  },
  [toNormalizedTemplateId(SYSTEM_FTP_INTERVALS_WORKOUT)]: {
    session_archetype: "threshold",
    training_intent: "threshold_development",
    intensity_family: "threshold",
  },
  [toNormalizedTemplateId(SYSTEM_VO2_MAX_WORKOUT)]: {
    session_archetype: "anaerobic_power",
    training_intent: "vo2max",
    intensity_family: "high_intensity",
    progression_level: "advanced",
  },
  [toNormalizedTemplateId(GROUP_RIDE_SIMULATION)]: {
    session_archetype: "anaerobic_power",
    training_intent: "speed_skill",
    intensity_family: "high_intensity",
    progression_level: "advanced",
    recovery_cost_band: "high",
  },
  [toNormalizedTemplateId(SYSTEM_PROGRESSIVE_LONG_ENDURANCE_RIDE)]: {
    session_archetype: "long_endurance",
    training_intent: "durable_endurance",
    intensity_family: "moderate",
    progression_level: "advanced",
    recovery_cost_band: "high",
  },
};

export function getSystemActivityTemplateSourceMetadata(
  template: RecordingServiceActivityPlan,
): SystemActivityTemplateSourceMetadata {
  const metadata = SYSTEM_ACTIVITY_TEMPLATE_SOURCE_INDEX.get(toNormalizedTemplateId(template));

  if (!metadata) {
    throw new Error(`Missing system activity-template source metadata for ${template.name}`);
  }

  return metadata;
}

export function classifySystemActivityTemplate(
  template: RecordingServiceActivityPlan,
): SystemActivityTemplateTaxonomyMetadata {
  const normalizedTemplateId = toNormalizedTemplateId(template);
  const sourceMetadata = getSystemActivityTemplateSourceMetadata(template);
  const sessionArchetype = deriveTemplateArchetype(template);
  const intensityFamily = deriveIntensityFamily(sessionArchetype);
  const trainingIntent = deriveTrainingIntent(sessionArchetype);
  const durationSeconds = estimateTemplateDurationSeconds(template);
  const progressionLevel = deriveProgressionLevel({
    template,
    archetype: sessionArchetype,
    durationSeconds,
  });
  const recoveryCostBand = deriveRecoveryCostBand({
    archetype: sessionArchetype,
    intensityFamily,
    durationSeconds,
  });
  const overrides = SYSTEM_ACTIVITY_TEMPLATE_TAXONOMY_OVERRIDES[normalizedTemplateId] ?? {};

  return {
    ...sourceMetadata,
    session_archetype: overrides.session_archetype ?? sessionArchetype,
    training_intent: overrides.training_intent ?? trainingIntent,
    intensity_family: overrides.intensity_family ?? intensityFamily,
    progression_level: overrides.progression_level ?? progressionLevel,
    recovery_cost_band: overrides.recovery_cost_band ?? recoveryCostBand,
  };
}

export function getSystemActivityTemplateTaxonomyOverride(
  normalizedTemplateId: string,
): SystemActivityTemplateTaxonomyOverride | undefined {
  return SYSTEM_ACTIVITY_TEMPLATE_TAXONOMY_OVERRIDES[normalizedTemplateId];
}
