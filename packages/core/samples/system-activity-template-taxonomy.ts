import type { RecordingServiceActivityPlan } from "../schemas";
import { getDurationSeconds } from "../schemas/duration_helpers";
import {
  SAMPLE_INDOOR_TRAINER_ACTIVITIES,
  SAMPLE_RECOVERY_WORKOUT,
  SYSTEM_FTP_INTERVALS_WORKOUT,
  SYSTEM_SWEET_SPOT_WORKOUT,
  SYSTEM_VO2_MAX_WORKOUT,
} from "./indoor-bike-activity";
import { SAMPLE_INDOOR_STRENGTH_ACTIVITIES } from "./indoor-strength";
import { SAMPLE_INDOOR_SWIM_ACTIVITIES } from "./indoor-swim";
import {
  EASY_RECOVERY_RUN,
  SAMPLE_TREADMILL_ACTIVITIES,
  THRESHOLD_RUN_WORKOUT_1,
  THRESHOLD_RUN_WORKOUT_2,
} from "./indoor-treadmill";
import { SAMPLE_OTHER_ACTIVITIES } from "./other-activity";
import {
  GROUP_RIDE_SIMULATION,
  SAMPLE_OUTDOOR_BIKE_ACTIVITIES,
  SYSTEM_LONG_ENDURANCE_RIDE,
  SYSTEM_PROGRESSIVE_LONG_ENDURANCE_RIDE,
} from "./outdoor-bike";
import {
  EASY_AEROBIC_RUN,
  FARTLEK_RUN,
  SAMPLE_OUTDOOR_RUN_ACTIVITIES,
  SYSTEM_LONG_EASY_RUN,
  SYSTEM_MARATHON_PACE_LONG_RUN,
} from "./outdoor-run";
import { normalizeSystemActivityTemplateId } from "./template-ids";

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

export type SystemActivityTemplateTrainingIntent =
  | "recovery"
  | "aerobic_base"
  | "durable_endurance"
  | "threshold_development"
  | "race_specific"
  | "vo2max"
  | "muscular_endurance"
  | "speed_skill"
  | "technique"
  | "strength_support"
  | "general_maintenance";

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

export type SystemActivityTemplateRecoveryCostBand =
  | "low"
  | "moderate"
  | "high";

export interface SystemActivityTemplateSourceMetadata {
  source_file: string;
  execution_context: SystemActivityTemplateExecutionContext;
}

export interface SystemActivityTemplateTaxonomyMetadata extends SystemActivityTemplateSourceMetadata {
  session_archetype: SystemActivityTemplateArchetype;
  training_intent: SystemActivityTemplateTrainingIntent;
  intensity_family: SystemActivityTemplateIntensityFamily;
  progression_level: SystemActivityTemplateProgressionLevel;
  recovery_cost_band: SystemActivityTemplateRecoveryCostBand;
}

export type SystemActivityTemplateTaxonomyOverride = Partial<
  Omit<
    SystemActivityTemplateTaxonomyMetadata,
    "source_file" | "execution_context"
  >
>;

export const SYSTEM_ACTIVITY_TEMPLATE_TAXONOMY_STRATEGY =
  "hybrid-derived-plus-sidecar" as const;

function toNormalizedTemplateId(
  template: RecordingServiceActivityPlan,
): string {
  return normalizeSystemActivityTemplateId({
    id: template.id ?? undefined,
    activityCategory: template.activity_category ?? "other",
    name: template.name ?? "template",
  });
}

function estimateTemplateDurationSeconds(
  template: RecordingServiceActivityPlan,
): number {
  const paceSecondsPerKm =
    template.activity_category === "bike"
      ? 180
      : template.activity_category === "run"
        ? 300
        : template.activity_category === "swim"
          ? 1200
          : 300;

  return template.structure.intervals.reduce((planTotal, interval) => {
    const intervalDuration = interval.steps.reduce((stepTotal, step) => {
      return (
        stepTotal +
        getDurationSeconds(step.duration, {
          paceSecondsPerKm,
        })
      );
    }, 0);

    return planTotal + intervalDuration * interval.repetitions;
  }, 0);
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
  if (includesAny(name, ["5k pace", "race pace", "time trial"])) {
    return "race_pace";
  }
  if (includesAny(name, ["speed", "vo2", "fartlek", "hill", "interval"])) {
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
  if (template.activity_category === "strength") {
    return "strength_support";
  }
  if (template.activity_category === "swim") {
    return includesAny(name, ["technique", "drill"])
      ? "swim_technique"
      : "swim_endurance";
  }
  if (includesAny(name, ["mobility", "walk", "recovery"])) {
    return "mixed_support";
  }

  return "general_aerobic";
}

function deriveTemplateArchetype(
  template: RecordingServiceActivityPlan,
): SystemActivityTemplateArchetype {
  const name = template.name.toLowerCase();

  if (template.activity_category === "run") {
    return deriveRunArchetype(name);
  }
  if (template.activity_category === "bike") {
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
  durationSeconds: number;
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
    input.durationSeconds >= 7200
  ) {
    return "progressive";
  }

  return "foundation";
}

function deriveRecoveryCostBand(input: {
  archetype: SystemActivityTemplateArchetype;
  intensityFamily: SystemActivityTemplateIntensityFamily;
  durationSeconds: number;
}): SystemActivityTemplateRecoveryCostBand {
  if (
    input.intensityFamily === "support" ||
    input.intensityFamily === "recovery"
  ) {
    return "low";
  }

  if (
    input.intensityFamily === "high_intensity" ||
    input.intensityFamily === "race_specific" ||
    input.durationSeconds >= 7200
  ) {
    return "high";
  }

  return "moderate";
}

const SYSTEM_TEMPLATE_SOURCE_GROUPS = [
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
    templates: SAMPLE_OTHER_ACTIVITIES,
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
  [toNormalizedTemplateId(EASY_AEROBIC_RUN)]: {
    session_archetype: "aerobic_endurance",
    training_intent: "aerobic_base",
    intensity_family: "endurance",
    progression_level: "foundation",
    recovery_cost_band: "low",
  },
  [toNormalizedTemplateId(EASY_RECOVERY_RUN)]: {
    session_archetype: "easy_recovery",
    training_intent: "recovery",
    intensity_family: "recovery",
    progression_level: "conservative",
    recovery_cost_band: "low",
  },
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
  [toNormalizedTemplateId(SYSTEM_LONG_EASY_RUN)]: {
    session_archetype: "long_endurance",
    training_intent: "durable_endurance",
    intensity_family: "endurance",
  },
  [toNormalizedTemplateId(SYSTEM_MARATHON_PACE_LONG_RUN)]: {
    session_archetype: "long_endurance",
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
  [toNormalizedTemplateId(SYSTEM_LONG_ENDURANCE_RIDE)]: {
    session_archetype: "long_endurance",
    training_intent: "durable_endurance",
    intensity_family: "endurance",
  },
  [toNormalizedTemplateId(SYSTEM_PROGRESSIVE_LONG_ENDURANCE_RIDE)]: {
    session_archetype: "long_endurance",
    training_intent: "durable_endurance",
    intensity_family: "moderate",
    progression_level: "advanced",
    recovery_cost_band: "high",
  },
  [toNormalizedTemplateId(SAMPLE_RECOVERY_WORKOUT)]: {
    session_archetype: "easy_recovery",
    training_intent: "recovery",
    intensity_family: "recovery",
    progression_level: "conservative",
    recovery_cost_band: "low",
  },
};

export function getSystemActivityTemplateSourceMetadata(
  template: RecordingServiceActivityPlan,
): SystemActivityTemplateSourceMetadata {
  const metadata = SYSTEM_ACTIVITY_TEMPLATE_SOURCE_INDEX.get(
    toNormalizedTemplateId(template),
  );

  if (!metadata) {
    throw new Error(
      `Missing system activity-template source metadata for ${template.name}`,
    );
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
  const overrides =
    SYSTEM_ACTIVITY_TEMPLATE_TAXONOMY_OVERRIDES[normalizedTemplateId] ?? {};

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
