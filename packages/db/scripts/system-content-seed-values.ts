import type {
  ALL_SAMPLE_PLANS,
  SystemActivityTemplateDefinition,
  VersionedSystemContentDefinition,
} from "@repo/core";
import { initializeActivityPlanDocument } from "@repo/core/activity-plan";
import { canonicalTrainingPlanStructureSchema } from "@repo/core/schemas";
import { structureHash } from "./canonical-json";

export type SystemTrainingPlanDefinition = VersionedSystemContentDefinition<
  (typeof ALL_SAMPLE_PLANS)[number]
>;

export function persistedTrainingPlanStructure(template: (typeof ALL_SAMPLE_PLANS)[number]) {
  const { id: _id, ...structure } = template.structure;
  return canonicalTrainingPlanStructureSchema.parse({
    ...structure,
    sessions: structure.sessions.map((session) => ({
      ...session,
      activity_plan_variant_id: session.activity_plan_id,
    })),
  });
}

export function materializeSystemActivityTemplateSeedValues(
  definition: SystemActivityTemplateDefinition,
) {
  const template = definition.content;
  if (!template.id) throw new Error(`System activity template ${definition.key} is missing an ID`);
  const structure = initializeActivityPlanDocument({
    activityPlanId: template.id,
    structure: template.structure,
  });
  return {
    id: template.id,
    profile_id: null,
    is_system_template: true,
    content_visibility: "public" as const,
    system_content_key: definition.key,
    system_content_version: definition.version,
    system_content_hash: definition.contentHash,
    name: template.name,
    description: template.description,
    structure,
    structure_hash: structureHash(structure),
    gps_recording_enabled: template.gps_recording_enabled ?? true,
    notes: template.notes ?? null,
  };
}

export function materializeSystemTrainingPlanSeedValues(definition: SystemTrainingPlanDefinition) {
  const template = definition.content;
  if (!template.id) throw new Error(`System training plan ${definition.key} is missing an ID`);
  const structure = persistedTrainingPlanStructure(template);
  return {
    id: template.id,
    profile_id: null,
    is_system_template: true,
    content_visibility: "public" as const,
    system_content_key: definition.key,
    system_content_version: definition.version,
    system_content_hash: definition.contentHash,
    name: template.name,
    description: template.description ?? null,
    structure,
    structure_hash: structureHash(structure),
    sessions_per_week_target: template.sessions_per_week_target,
    duration_hours: template.duration_hours ?? null,
  };
}
