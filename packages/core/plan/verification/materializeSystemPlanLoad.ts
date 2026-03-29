import {
  estimateFromRoute,
  estimateFromStructure,
  estimateFromTemplate,
} from "../../estimation/strategies";
import { SYSTEM_TEMPLATES, type SystemTemplate } from "../../samples";
import type { SystemTrainingPlanTemplate } from "../../samples/training-plans";
import { materializePlanToEvents } from "../materializePlanToEvents";

export interface MaterializeSystemPlanLoadEstimationContext {
  ftp?: number | null;
  thresholdHr?: number | null;
  weightKg?: number | null;
  thresholdPaceSecondsPerKm?: number | null;
  fitnessState?: {
    ctl: number;
    atl: number;
    tsb: number;
  };
}

export interface MaterializeSystemPlanLoadInput {
  systemPlan: Pick<
    SystemTrainingPlanTemplate,
    "id" | "name" | "structure" | "sessions_per_week_target"
  >;
  startDate: string;
  activityTemplates?: ReadonlyArray<SystemTemplate>;
  estimationContext?: MaterializeSystemPlanLoadEstimationContext;
}

export type MaterializedSystemPlanEstimationSource =
  | "rest_day"
  | "missing"
  | "structure"
  | "route"
  | "template";

export interface MaterializedSystemPlanLoadSession {
  scheduled_date: string;
  starts_at: string;
  ends_at: string;
  title: string;
  event_type: "planned" | "rest_day";
  all_day: true;
  activity_plan_id: string | null;
  resolved_activity_template_id: string | null;
  activity_category: SystemTemplate["activity_category"] | null;
  estimated_tss: number;
  estimated_duration_seconds: number;
  estimation_source: MaterializedSystemPlanEstimationSource;
  estimation_confidence: "high" | "medium" | "low" | null;
}

export interface MaterializeSystemPlanLoadResult {
  system_plan_id: string;
  system_plan_name: string;
  sessions_per_week_target: number;
  sessions: MaterializedSystemPlanLoadSession[];
  unresolved_activity_plan_ids: string[];
  total_estimated_tss: number;
  total_estimated_duration_seconds: number;
  total_planned_sessions: number;
  total_rest_days: number;
}

function hasIntervals(template: SystemTemplate): boolean {
  return Array.isArray(template.structure?.intervals)
    ? template.structure.intervals.length > 0
    : false;
}

function hasRoute(template: SystemTemplate): template is SystemTemplate & {
  route: {
    distanceMeters: number;
    totalAscent: number;
    totalDescent: number;
    averageGrade?: number;
  };
} {
  const route = (template as { route?: unknown }).route;
  return Boolean(route && typeof route === "object");
}

function buildTemplateLookup(
  templates: ReadonlyArray<SystemTemplate>,
): Map<string, SystemTemplate> {
  return new Map(templates.map((template) => [template.id, template]));
}

function estimateTemplateLoad(
  template: SystemTemplate,
  input: MaterializeSystemPlanLoadInput,
): {
  estimated_tss: number;
  estimated_duration_seconds: number;
  estimation_source: Exclude<MaterializedSystemPlanEstimationSource, "rest_day" | "missing">;
  estimation_confidence: "high" | "medium" | "low";
} {
  const context = {
    profile: {},
    activityCategory: template.activity_category,
    structure: template.structure,
    fitnessState: input.estimationContext?.fitnessState,
    ftp: input.estimationContext?.ftp,
    thresholdHr: input.estimationContext?.thresholdHr,
    weightKg: input.estimationContext?.weightKg,
    thresholdPaceSecondsPerKm: input.estimationContext?.thresholdPaceSecondsPerKm,
  };

  const estimation = hasIntervals(template)
    ? estimateFromStructure(context as Parameters<typeof estimateFromStructure>[0])
    : hasRoute(template)
      ? estimateFromRoute({
          ...context,
          route: template.route,
        } as Parameters<typeof estimateFromRoute>[0])
      : estimateFromTemplate(context as Parameters<typeof estimateFromTemplate>[0]);

  return {
    estimated_tss: estimation.tss,
    estimated_duration_seconds: estimation.duration,
    estimation_source: hasIntervals(template)
      ? "structure"
      : hasRoute(template)
        ? "route"
        : "template",
    estimation_confidence: estimation.confidence,
  };
}

/**
 * Materializes a system training plan and resolves deterministic load estimates for linked activity plans.
 *
 * This adapter intentionally stays small: it reuses the existing plan materializer and
 * activity estimation strategies, then returns a normalized session list that later helpers
 * can aggregate, compare, and validate.
 *
 * @param input - System plan, start date override, template registry, and optional estimation context
 * @returns Materialized sessions plus deterministic aggregate totals and unresolved template IDs
 */
export function materializeSystemPlanLoad(
  input: MaterializeSystemPlanLoadInput,
): MaterializeSystemPlanLoadResult {
  const materializedEvents = materializePlanToEvents(input.systemPlan.structure, input.startDate);
  const templateLookup = buildTemplateLookup(input.activityTemplates ?? SYSTEM_TEMPLATES);
  const unresolvedActivityPlanIds = new Set<string>();

  const sessions = materializedEvents.map<MaterializedSystemPlanLoadSession>((event) => {
    if (event.event_type === "rest_day") {
      return {
        ...event,
        resolved_activity_template_id: null,
        activity_category: null,
        estimated_tss: 0,
        estimated_duration_seconds: 0,
        estimation_source: "rest_day",
        estimation_confidence: null,
      };
    }

    if (!event.activity_plan_id) {
      return {
        ...event,
        resolved_activity_template_id: null,
        activity_category: null,
        estimated_tss: 0,
        estimated_duration_seconds: 0,
        estimation_source: "missing",
        estimation_confidence: null,
      };
    }

    const template = templateLookup.get(event.activity_plan_id);
    if (!template) {
      unresolvedActivityPlanIds.add(event.activity_plan_id);
      return {
        ...event,
        resolved_activity_template_id: null,
        activity_category: null,
        estimated_tss: 0,
        estimated_duration_seconds: 0,
        estimation_source: "missing",
        estimation_confidence: null,
      };
    }

    const estimation = estimateTemplateLoad(template, input);

    return {
      ...event,
      resolved_activity_template_id: template.id,
      activity_category: template.activity_category,
      ...estimation,
    };
  });

  return {
    system_plan_id: input.systemPlan.id,
    system_plan_name: input.systemPlan.name,
    sessions_per_week_target: input.systemPlan.sessions_per_week_target,
    sessions,
    unresolved_activity_plan_ids: Array.from(unresolvedActivityPlanIds).sort(),
    total_estimated_tss: sessions.reduce((sum, session) => sum + session.estimated_tss, 0),
    total_estimated_duration_seconds: sessions.reduce(
      (sum, session) => sum + session.estimated_duration_seconds,
      0,
    ),
    total_planned_sessions: sessions.filter((session) => session.event_type === "planned").length,
    total_rest_days: sessions.filter((session) => session.event_type === "rest_day").length,
  };
}
