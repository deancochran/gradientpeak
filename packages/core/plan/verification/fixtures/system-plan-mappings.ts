import { ALL_SAMPLE_PLANS, SYSTEM_TEMPLATES } from "../../../samples";
import { normalizeLinkedActivityPlanId } from "../../../samples/template-ids";
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
  const linkedActivityPlanIds = uniqueStrings(
    collectStringField(structure, "activity_plan_id").map((id) =>
      normalizeLinkedActivityPlanId(id),
    ),
  );

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
      activity_category: template.activity_category ?? "other",
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
    linkedActivityTemplates.map((template) => template.activity_category),
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
      "Mixed-sport linkage exists, but current heuristic goal targets remain primarily single-sport oriented.",
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

const catalogById = new Map(SYSTEM_PLAN_FIXTURE_CATALOG.map((entry) => [entry.plan_id, entry]));

function requireCatalogEntry(planId: string): SystemPlanFixtureCatalogEntry {
  const entry = catalogById.get(planId);

  if (!entry) {
    throw new Error(`Verification fixture plan catalog missing entry ${planId}`);
  }

  return entry;
}

function createMappingFixture(input: {
  id: string;
  scenarioId: AthleteScenarioFixtureId;
  planId: string;
  toleranceClass: SystemPlanMappingFixture["tolerance_class"];
  expectedSessionEmphasis: string[];
  semanticLimitations?: string[];
}): SystemPlanMappingFixture {
  const plan = requireCatalogEntry(input.planId);
  const limitations = [...plan.audit.limitations, ...(input.semanticLimitations ?? [])];

  return {
    id: input.id,
    scenario_id: input.scenarioId,
    plan_id: input.planId,
    tolerance_class: input.toleranceClass,
    expected_session_emphasis: input.expectedSessionEmphasis,
    audit: buildAuditMetadata({
      fixturePrecision: limitations.length > 0 ? "audit-first" : "exact",
      exactFields: [
        "scenario_id",
        "plan_id",
        "tolerance_class",
        "expected_session_emphasis",
        "resolved_linked_activity_templates",
      ],
      auditFields:
        limitations.length > 0 ? ["scenario_to_plan_semantic_fit", ...plan.audit.audit_fields] : [],
      limitations,
    }),
  };
}

export const SYSTEM_PLAN_MAPPING_FIXTURES: readonly SystemPlanMappingFixture[] = [
  createMappingFixture({
    id: "beginner_no_history_5k__5k_speed_block",
    scenarioId: "beginner_no_history_5k",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913003",
    toleranceClass: "moderate",
    expectedSessionEmphasis: ["easy_run", "vo2_intervals", "race_pace"],
  }),
  createMappingFixture({
    id: "exact_5k_speed_block__5k_speed_block",
    scenarioId: "exact_5k_speed_block",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913003",
    toleranceClass: "tight",
    expectedSessionEmphasis: ["easy_run", "vo2_intervals", "race_pace"],
  }),
  createMappingFixture({
    id: "recreational_sparse_10k__half_marathon_build",
    scenarioId: "recreational_sparse_10k",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913002",
    toleranceClass: "moderate",
    expectedSessionEmphasis: ["aerobic_run", "threshold_intervals", "long_run"],
    semanticLimitations: [
      "Current system plan set has no dedicated 10K template, so the half-marathon build acts as the nearest audited run-build proxy.",
    ],
  }),
  createMappingFixture({
    id: "intermediate_rich_half__half_marathon_build",
    scenarioId: "intermediate_rich_half",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913002",
    toleranceClass: "tight",
    expectedSessionEmphasis: ["aerobic_run", "threshold_intervals", "long_run"],
  }),
  createMappingFixture({
    id: "advanced_marathon_build__marathon_foundation",
    scenarioId: "advanced_marathon_build",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913001",
    toleranceClass: "tight",
    expectedSessionEmphasis: ["easy_run", "tempo_run", "long_run"],
  }),
  createMappingFixture({
    id: "boundary_feasible_bike__cycling_endurance_builder",
    scenarioId: "boundary_feasible_bike",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913004",
    toleranceClass: "tight",
    expectedSessionEmphasis: ["endurance_ride", "sweet_spot_ride", "long_ride"],
  }),
  createMappingFixture({
    id: "low_availability_high_ambition__cycling_endurance_builder",
    scenarioId: "low_availability_high_ambition",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913004",
    toleranceClass: "moderate",
    expectedSessionEmphasis: ["endurance_ride", "sweet_spot_ride", "long_ride"],
  }),
  createMappingFixture({
    id: "infeasible_stretch_goal__marathon_foundation",
    scenarioId: "infeasible_stretch_goal",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913001",
    toleranceClass: "flexible",
    expectedSessionEmphasis: ["easy_run", "tempo_run", "long_run"],
    semanticLimitations: [
      "Scenario intentionally models an infeasible target, so alignment focuses on safety-bounded deviation rather than direct target seeking.",
    ],
  }),
  createMappingFixture({
    id: "masters_conservative_profile__general_fitness_maintenance",
    scenarioId: "masters_conservative_profile",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913006",
    toleranceClass: "moderate",
    expectedSessionEmphasis: ["aerobic_session", "strength_support", "long_easy_session"],
    semanticLimitations: [
      "General Fitness Maintenance is the current strength-supporting proxy; it is not a race-specific masters run plan.",
    ],
  }),
  createMappingFixture({
    id: "b_race_before_a_race__half_marathon_build",
    scenarioId: "b_race_before_a_race",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913002",
    toleranceClass: "moderate",
    expectedSessionEmphasis: ["aerobic_run", "threshold_intervals", "long_run"],
    semanticLimitations: [
      "Current system plans are single-goal templates, so B-race taper behavior remains an audited heuristic-fit check rather than a template-native feature.",
    ],
  }),
  createMappingFixture({
    id: "two_close_a_goals__half_marathon_build",
    scenarioId: "two_close_a_goals",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913002",
    toleranceClass: "moderate",
    expectedSessionEmphasis: ["aerobic_run", "threshold_intervals", "long_run"],
    semanticLimitations: [
      "Current system plans do not encode dual-A-goal sequencing, so sustained-peak behavior is audited through weekly load shape instead of explicit template semantics.",
    ],
  }),
  createMappingFixture({
    id: "same_day_a_b_priority__5k_speed_block",
    scenarioId: "same_day_a_b_priority",
    planId: "6a6f5a93-b8f3-4fca-9d4f-56a55b913003",
    toleranceClass: "moderate",
    expectedSessionEmphasis: ["easy_run", "vo2_intervals", "race_pace"],
    semanticLimitations: [
      "Same-day priority conflicts are expressed by the scenario heuristic input, not by explicit priority metadata inside the current system plan template.",
    ],
  }),
] as const;

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
      "Catalogued with exact linked template IDs, but left unmapped for now because the current heuristic goal-target fixture layer is still single-sport first.",
  },
] as const;
