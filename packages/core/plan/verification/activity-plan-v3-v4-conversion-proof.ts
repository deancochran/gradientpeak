/**
 * Phase 2 catalog evidence. The V3 parser and resolver used to create the
 * generated fixed source live only in the isolated conversion harness; this
 * module deliberately depends on the active V5 contract alone.
 */
import { activityPlanStructureSchema } from "../../activity-plan";
import { stringifyCanonicalJson } from "../../athlete-intelligence/canonical-json";
import {
  FIXED_SYSTEM_ACTIVITY_TEMPLATE_COUNT,
  fixedActivityPlanStructureForTemplate,
  SYSTEM_TEMPLATES,
  type SystemTemplate,
} from "../../samples";

function executableStructureWithoutIdentifiers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(executableStructureWithoutIdentifiers);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "id")
      .map(([key, nested]) => [key, executableStructureWithoutIdentifiers(nested)]),
  );
}

export type FixedSystemTemplateConversionInventory = {
  template_id: string;
  activity_category: SystemTemplate["structure"]["activity_category"];
  item_count: number;
  expanded_step_occurrences: number;
  outcome: "converted";
};

/**
 * Gives catalog verification a deterministic, V5-only record of every
 * materialized source template. Invalid generated source fails immediately;
 * no compatibility fallback or resolver is available at runtime.
 */
export function inventoryFixedSystemTemplateConversion(
  templates: readonly SystemTemplate[] = SYSTEM_TEMPLATES,
): FixedSystemTemplateConversionInventory[] {
  return templates
    .map((template) => {
      const structure = activityPlanStructureSchema.parse(template.structure);
      return {
        template_id: template.id,
        activity_category: structure.activity_category,
        item_count: structure.items.length,
        expanded_step_occurrences: structure.items.reduce(
          (total, item) => total + (item.type === "repeat" ? item.count * item.steps.length : 1),
          0,
        ),
        outcome: "converted" as const,
      };
    })
    .sort((left, right) => left.template_id.localeCompare(right.template_id));
}

export function verifyFixedSystemTemplateMaterialization(
  templates: readonly SystemTemplate[] = SYSTEM_TEMPLATES,
): FixedSystemTemplateConversionInventory[] {
  const inventory = inventoryFixedSystemTemplateConversion(templates);
  if (templates === SYSTEM_TEMPLATES && inventory.length !== FIXED_SYSTEM_ACTIVITY_TEMPLATE_COUNT) {
    throw new Error(
      `Fixed V5 source count ${FIXED_SYSTEM_ACTIVITY_TEMPLATE_COUNT} does not match catalog count ${inventory.length}.`,
    );
  }
  return inventory;
}

/** Proves each active builder result, including quantities and text, is frozen V5 content. */
export function assertFixedSystemTemplateMaterializationParity(
  templates: readonly SystemTemplate[] = SYSTEM_TEMPLATES,
): void {
  const drift = templates.flatMap((template) => {
    const generated = activityPlanStructureSchema.parse(template.structure);
    const frozen = fixedActivityPlanStructureForTemplate(template.id);
    return stringifyCanonicalJson(executableStructureWithoutIdentifiers(generated)) ===
      stringifyCanonicalJson(executableStructureWithoutIdentifiers(frozen))
      ? []
      : [template.id];
  });
  if (drift.length > 0)
    throw new Error(`Fixed V5 materialization drift for template IDs: ${drift.join(", ")}`);
}
