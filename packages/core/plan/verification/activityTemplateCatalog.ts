import type { ActivityPlanStructureV2 } from "../../schemas/activity_plan_v2";
import { SYSTEM_TEMPLATES, type SystemTemplate } from "../../samples";
import {
  classifySystemActivityTemplate,
  type SystemActivityTemplateArchetype,
  type SystemActivityTemplateExecutionContext,
  type SystemActivityTemplateIntensityFamily,
  type SystemActivityTemplateProgressionLevel,
  type SystemActivityTemplateRecoveryCostBand,
  type SystemActivityTemplateTrainingIntent,
} from "../../samples/system-activity-template-taxonomy";
import { calculateSystemTemplateDurationSeconds } from "./systemPlanAudit";

export type SystemActivityTemplateDurationBand =
  | "short"
  | "medium"
  | "long"
  | "extra-long";

export type SystemActivityTemplateLoadBand =
  | "low"
  | "moderate"
  | "high"
  | "very-high";

export interface NormalizedSystemActivityTemplateCatalogEntry {
  template_id: string;
  template_name: string;
  sport: SystemTemplate["activity_category"];
  source_file: string;
  execution_context: SystemActivityTemplateExecutionContext;
  session_archetype: SystemActivityTemplateArchetype;
  training_intent: SystemActivityTemplateTrainingIntent;
  intensity_family: SystemActivityTemplateIntensityFamily;
  progression_level: SystemActivityTemplateProgressionLevel;
  duration_seconds: number;
  duration_band: SystemActivityTemplateDurationBand;
  load_band: SystemActivityTemplateLoadBand;
  recovery_cost_band: SystemActivityTemplateRecoveryCostBand;
  normalized_structure: unknown;
  structure_signature: string;
  primary_work_signature: string;
  duplicate_name_count: number;
}

function mapStepTargetSignature(target: {
  type: string;
  intensity: number;
}): string {
  return `${target.type}:${Math.round(target.intensity * 10) / 10}`;
}

function serializeDuration(duration: {
  type: string;
  seconds?: number;
  meters?: number;
  count?: number;
}): string {
  switch (duration.type) {
    case "time":
      return `time:${duration.seconds ?? 0}`;
    case "distance":
      return `distance:${duration.meters ?? 0}`;
    case "repetitions":
      return `repetitions:${duration.count ?? 0}`;
    default:
      return duration.type;
  }
}

function collectWorkSteps(structure: ActivityPlanStructureV2): Array<{
  interval_name: string;
  repetitions: number;
  step_name: string;
  duration: string;
  targets: string[];
}> {
  const allSteps = structure.intervals.flatMap((interval) =>
    interval.steps.map((step) => ({
      interval_name: interval.name.toLowerCase(),
      repetitions: interval.repetitions,
      step_name: step.name.toLowerCase(),
      duration: serializeDuration(step.duration),
      targets: (step.targets ?? []).map(mapStepTargetSignature).sort(),
    })),
  );
  const workSteps = allSteps.filter((step) => {
    const stepName = `${step.interval_name} ${step.step_name}`;
    return !/(warm|cool|recover|easy reset|float recovery)/i.test(stepName);
  });

  return workSteps.length > 0 ? workSteps : allSteps;
}

export function normalizeActivityTemplateStructureForAudit(
  structure: ActivityPlanStructureV2,
): unknown {
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((value) => rewrite(value));
    }
    if (!node || typeof node !== "object") {
      return node;
    }

    const record = node as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (key === "id") {
        continue;
      }
      output[key] = rewrite(value);
    }

    return output;
  };

  return rewrite(structure);
}

function buildPrimaryWorkSignature(structure: ActivityPlanStructureV2): string {
  return JSON.stringify(collectWorkSteps(structure));
}

function deriveDurationBand(
  sport: SystemTemplate["activity_category"],
  durationSeconds: number,
): SystemActivityTemplateDurationBand {
  const mediumThreshold = sport === "bike" ? 3600 : 2700;
  const longThreshold = sport === "bike" ? 7200 : 5400;
  const extraLongThreshold = sport === "bike" ? 10800 : 7200;

  if (durationSeconds >= extraLongThreshold) {
    return "extra-long";
  }
  if (durationSeconds >= longThreshold) {
    return "long";
  }
  if (durationSeconds >= mediumThreshold) {
    return "medium";
  }

  return "short";
}

function deriveLoadBand(input: {
  intensityFamily: SystemActivityTemplateIntensityFamily;
  durationBand: SystemActivityTemplateDurationBand;
  recoveryCostBand: SystemActivityTemplateRecoveryCostBand;
}): SystemActivityTemplateLoadBand {
  if (
    input.intensityFamily === "recovery" ||
    (input.intensityFamily === "support" && input.recoveryCostBand === "low")
  ) {
    return "low";
  }
  if (
    input.intensityFamily === "high_intensity" ||
    input.intensityFamily === "race_specific"
  ) {
    return input.durationBand === "long" || input.durationBand === "extra-long"
      ? "very-high"
      : "high";
  }
  if (
    input.intensityFamily === "threshold" ||
    input.intensityFamily === "tempo" ||
    input.recoveryCostBand === "high"
  ) {
    return "high";
  }
  if (
    input.durationBand === "long" ||
    input.durationBand === "extra-long" ||
    input.intensityFamily === "moderate"
  ) {
    return "moderate";
  }

  return "low";
}

export function buildSystemActivityTemplateCatalog(
  templates: readonly SystemTemplate[] = SYSTEM_TEMPLATES,
): NormalizedSystemActivityTemplateCatalogEntry[] {
  const duplicateNameCounts = new Map<string, number>();

  for (const template of templates) {
    duplicateNameCounts.set(
      template.name,
      (duplicateNameCounts.get(template.name) ?? 0) + 1,
    );
  }

  return [...templates]
    .map((template) => {
      const taxonomy = classifySystemActivityTemplate(template);
      const durationSeconds = calculateSystemTemplateDurationSeconds(template);
      const durationBand = deriveDurationBand(
        template.activity_category,
        durationSeconds,
      );
      const normalizedStructure = normalizeActivityTemplateStructureForAudit(
        template.structure,
      );

      return {
        template_id: template.id,
        template_name: template.name,
        sport: template.activity_category,
        source_file: taxonomy.source_file,
        execution_context: taxonomy.execution_context,
        session_archetype: taxonomy.session_archetype,
        training_intent: taxonomy.training_intent,
        intensity_family: taxonomy.intensity_family,
        progression_level: taxonomy.progression_level,
        duration_seconds: durationSeconds,
        duration_band: durationBand,
        load_band: deriveLoadBand({
          intensityFamily: taxonomy.intensity_family,
          durationBand,
          recoveryCostBand: taxonomy.recovery_cost_band,
        }),
        recovery_cost_band: taxonomy.recovery_cost_band,
        normalized_structure: normalizedStructure,
        structure_signature: JSON.stringify(normalizedStructure),
        primary_work_signature: buildPrimaryWorkSignature(template.structure),
        duplicate_name_count: duplicateNameCounts.get(template.name) ?? 1,
      } satisfies NormalizedSystemActivityTemplateCatalogEntry;
    })
    .sort((left, right) => left.template_id.localeCompare(right.template_id));
}
