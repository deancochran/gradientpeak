import {
  ALL_SAMPLE_PLANS,
  type SystemTrainingPlanTemplate,
} from "../../samples";
import { materializePlanToEvents } from "../materializePlanToEvents";
import { buildSystemActivityTemplateCatalog } from "./activityTemplateCatalog";
import {
  COVERAGE_STATUS_THRESHOLD,
  getSystemTrainingPlanGateScope,
  type SystemTrainingPlanGateScope,
} from "./systemActivityTemplateVerificationConfig";

export interface TrainingPlanTemplateDependencyPlanUsage {
  plan_id: string;
  plan_name: string;
  gate_scope: SystemTrainingPlanGateScope;
  reuse_count: number;
}

export interface TrainingPlanTemplateDependencyEntry {
  template_id: string;
  template_name: string;
  dependent_plans: TrainingPlanTemplateDependencyPlanUsage[];
  reuse_count: number;
}

export interface TrainingPlanTemplateVarietyAnalysis {
  plan_id: string;
  plan_name: string;
  gate_scope: SystemTrainingPlanGateScope;
  total_linked_sessions: number;
  unique_template_ids: string[];
  unique_template_count: number;
  dominant_template_id: string | null;
  dominant_template_reuse_count: number;
  dominant_template_share: number;
  unresolved_template_ids: string[];
  weak_variety: boolean;
  over_reuse: boolean;
}

function getPlanStartDate(plan: SystemTrainingPlanTemplate): string {
  const structure = plan.structure as Record<string, unknown>;
  return typeof structure.start_date === "string"
    ? structure.start_date
    : "1970-01-01";
}

function collectResolvedTemplateIds(
  plan: SystemTrainingPlanTemplate,
): string[] {
  return materializePlanToEvents(plan.structure, getPlanStartDate(plan))
    .filter((event) => event.event_type === "planned")
    .flatMap((event) =>
      event.activity_plan_id ? [event.activity_plan_id] : [],
    );
}

export function buildTrainingPlanTemplateDependencyMap(
  plans: readonly SystemTrainingPlanTemplate[] = ALL_SAMPLE_PLANS,
): TrainingPlanTemplateDependencyEntry[] {
  const catalog = buildSystemActivityTemplateCatalog();
  const templateNameById = new Map(
    catalog.map((entry) => [entry.template_id, entry.template_name]),
  );
  const dependencyMap = new Map<
    string,
    {
      template_name: string;
      dependent_plans: TrainingPlanTemplateDependencyPlanUsage[];
    }
  >();

  for (const plan of plans) {
    const counts = new Map<string, number>();

    for (const templateId of collectResolvedTemplateIds(plan)) {
      counts.set(templateId, (counts.get(templateId) ?? 0) + 1);
    }

    for (const [templateId, reuseCount] of counts) {
      const dependency = dependencyMap.get(templateId) ?? {
        template_name: templateNameById.get(templateId) ?? templateId,
        dependent_plans: [],
      };

      dependency.dependent_plans.push({
        plan_id: plan.id,
        plan_name: plan.name,
        gate_scope: getSystemTrainingPlanGateScope(plan.name),
        reuse_count: reuseCount,
      });

      dependencyMap.set(templateId, dependency);
    }
  }

  return Array.from(dependencyMap.entries())
    .map(([templateId, dependency]) => ({
      template_id: templateId,
      template_name: dependency.template_name,
      dependent_plans: dependency.dependent_plans.sort((left, right) =>
        left.plan_name.localeCompare(right.plan_name),
      ),
      reuse_count: dependency.dependent_plans.reduce(
        (total, planUsage) => total + planUsage.reuse_count,
        0,
      ),
    }))
    .sort((left, right) => left.template_id.localeCompare(right.template_id));
}

export function analyzeTrainingPlanTemplateVariety(
  plans: readonly SystemTrainingPlanTemplate[] = ALL_SAMPLE_PLANS,
): TrainingPlanTemplateVarietyAnalysis[] {
  const catalogTemplateIds = new Set(
    buildSystemActivityTemplateCatalog().map((entry) => entry.template_id),
  );

  return plans
    .map((plan) => {
      const linkedTemplateIds = collectResolvedTemplateIds(plan);
      const reuseCounts = new Map<string, number>();

      for (const templateId of linkedTemplateIds) {
        reuseCounts.set(templateId, (reuseCounts.get(templateId) ?? 0) + 1);
      }

      const sortedReuseCounts = Array.from(reuseCounts.entries()).sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      );
      const dominant = sortedReuseCounts[0];
      const unresolvedTemplateIds = Array.from(reuseCounts.keys())
        .filter((templateId) => !catalogTemplateIds.has(templateId))
        .sort();

      return {
        plan_id: plan.id,
        plan_name: plan.name,
        gate_scope: getSystemTrainingPlanGateScope(plan.name),
        total_linked_sessions: linkedTemplateIds.length,
        unique_template_ids: Array.from(reuseCounts.keys()).sort(),
        unique_template_count: reuseCounts.size,
        dominant_template_id: dominant?.[0] ?? null,
        dominant_template_reuse_count: dominant?.[1] ?? 0,
        dominant_template_share:
          linkedTemplateIds.length === 0
            ? 0
            : Number(
                ((dominant?.[1] ?? 0) / linkedTemplateIds.length).toFixed(4),
              ),
        unresolved_template_ids: unresolvedTemplateIds,
        weak_variety:
          reuseCounts.size <
          COVERAGE_STATUS_THRESHOLD.weakVarietyUniqueTemplateMinimum,
        over_reuse:
          linkedTemplateIds.length > 0 &&
          (dominant?.[1] ?? 0) / linkedTemplateIds.length >
            COVERAGE_STATUS_THRESHOLD.overReuseShareMaximum,
      } satisfies TrainingPlanTemplateVarietyAnalysis;
    })
    .sort((left, right) => left.plan_name.localeCompare(right.plan_name));
}
