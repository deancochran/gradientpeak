import {
  ALL_SAMPLE_PLANS,
  deriveSystemActivityTemplateActivityCategory,
  SYSTEM_TEMPLATES,
} from "../../../samples";
import type {
  LinkedSystemActivityTemplateFixture,
  SystemPlanFixtureCatalogEntry,
  SystemPlanMappingFixture,
  VerificationAuditMetadata,
} from "../types";
import type { AthleteScenarioFixtureId } from "./athlete-scenarios";

function collectStringField(node: unknown, fieldName: string): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectStringField(item, fieldName));
  }

  if (!node || typeof node !== "object") {
    return [];
  }

  const record = node as Record<string, unknown>;
  const directValue = typeof record[fieldName] === "string" ? [record[fieldName] as string] : [];

  return [
    ...directValue,
    ...Object.values(record).flatMap((value) => collectStringField(value, fieldName)),
  ];
}

function collectFieldValues(node: unknown, fieldName: string): unknown[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectFieldValues(item, fieldName));
  }

  if (!node || typeof node !== "object") {
    return [];
  }

  const record = node as Record<string, unknown>;
  const directValue = fieldName in record ? [record[fieldName]] : [];

  return [
    ...directValue,
    ...Object.values(record).flatMap((value) => collectFieldValues(value, fieldName)),
  ];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseDeclaredCycleWeeks(planName: string): number | null {
  const match = /\((\d+)\s+weeks\)/i.exec(planName);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
}

function buildAuditMetadata(input: {
  fixturePrecision: VerificationAuditMetadata["fixture_precision"];
  exactFields: string[];
  auditFields?: string[];
  limitations?: string[];
}): VerificationAuditMetadata {
  return {
    fixture_precision: input.fixturePrecision,
    exact_fields: input.exactFields,
    audit_fields: input.auditFields ?? [],
    limitations: input.limitations ?? [],
  };
}

const systemTemplateById = new Map(SYSTEM_TEMPLATES.map((template) => [template.id, template]));

function resolveLinkedActivityTemplates(
  structure: Record<string, unknown>,
): LinkedSystemActivityTemplateFixture[] {
  const linkedActivityPlanIds = uniqueStrings(collectStringField(structure, "activity_plan_id"));

  return linkedActivityPlanIds.map((id) => {
    const template = systemTemplateById.get(id);

    if (!template) {
      throw new Error(
        `Verification fixture linkage failed to resolve system activity template ${id}`,
      );
    }

    return {
      id,
      name: template.name,
      activity_category: deriveSystemActivityTemplateActivityCategory(template.structure),
      source_activity_plan_id: id,
      normalized_from_legacy_id: false,
    };
  });
}

function buildSystemPlanCatalogEntry(
  plan: (typeof ALL_SAMPLE_PLANS)[number],
): SystemPlanFixtureCatalogEntry {
  const linkedActivityTemplates = resolveLinkedActivityTemplates(plan.structure);
  const dominantActivityCategories = uniqueStrings(
    linkedActivityTemplates.map((linkedActivity) => linkedActivity.activity_category),
  );
  const declaredCycleWeeks = parseDeclaredCycleWeeks(plan.name);
  const offsetDays = collectFieldValues(plan.structure, "offset_days")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const materializedSessionWeeks =
    offsetDays.length > 0 ? Math.floor(Math.max(...offsetDays) / 7) + 1 : 0;

  const limitations: string[] = [];
  const auditFields: string[] = [];

  if (declaredCycleWeeks !== null && declaredCycleWeeks !== materializedSessionWeeks) {
    limitations.push(
      `Declared ${declaredCycleWeeks}-week label currently materializes ${materializedSessionWeeks} weeks of dated sessions from sample structure.`,
    );
    auditFields.push("declared_cycle_weeks", "materialized_session_weeks");
  }

  if (dominantActivityCategories.length > 1) {
    limitations.push(
      "Mixed-activity_category linkage exists, but current heuristic goal targets remain primarily single-activity-category oriented.",
    );
    auditFields.push("dominant_activity_categories");
  }

  return {
    plan_id: plan.id,
    plan_name: plan.name,
    sessions_per_week_target: plan.sessions_per_week_target,
    duration_hours: plan.duration_hours,
    declared_cycle_weeks: declaredCycleWeeks,
    materialized_session_weeks: materializedSessionWeeks,
    linked_activity_templates: linkedActivityTemplates,
    dominant_activity_categories: dominantActivityCategories,
    audit: buildAuditMetadata({
      fixturePrecision: limitations.length > 0 ? "audit-first" : "exact",
      exactFields: [
        "plan_id",
        "plan_name",
        "sessions_per_week_target",
        "duration_hours",
        "linked_activity_templates",
      ],
      auditFields,
      limitations,
    }),
  };
}

/**
 * Full catalog of current curated system training plans with normalized linked
 * activity template resolution.
 */
export const SYSTEM_PLAN_FIXTURE_CATALOG: readonly SystemPlanFixtureCatalogEntry[] =
  ALL_SAMPLE_PLANS.map((plan) => buildSystemPlanCatalogEntry(plan));

export const SYSTEM_PLAN_MAPPING_FIXTURES: readonly SystemPlanMappingFixture[] = [];

export const SYSTEM_PLAN_MAPPING_FIXTURES_BY_SCENARIO = SYSTEM_PLAN_MAPPING_FIXTURES.reduce(
  (accumulator, fixture) => {
    const existing = accumulator[fixture.scenario_id] ?? [];
    accumulator[fixture.scenario_id] = [...existing, fixture];
    return accumulator;
  },
  {} as Partial<Record<AthleteScenarioFixtureId, SystemPlanMappingFixture[]>>,
);

export const SYSTEM_PLAN_MAPPING_GAPS = [
  {
    plan_id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913005",
    plan_name: "Sprint Triathlon Base (10 weeks)",
    reason:
      "Catalogued with exact linked template IDs, but left unmapped for now because the current heuristic goal-target fixture layer is still single-activity-category first.",
  },
] as const;
