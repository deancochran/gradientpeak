import { type ActivityPlanStructure, activityPlanStructureSchema } from "../../activity-plan";
import type { ActivityPlanDurationEstimate } from "../../duration";
import type { AthletePerformanceTargetFacts } from "../../performance-model";
import {
  ALL_SAMPLE_PLANS,
  SYSTEM_TEMPLATES,
  type SystemTemplate,
  type SystemTrainingPlanTemplate,
} from "../../samples";
import {
  type ActivityPlanPlanningEstimate,
  createUnavailableActivityPlanPlanningEstimate,
  estimateActivityPlanForTrainingContext,
} from "../activity-plan-planning-estimate";
import { type MaterializedPlanEvent, materializePlanToEvents } from "../materializePlanToEvents";
import {
  SYSTEM_PLAN_VERIFICATION_AS_OF,
  SYSTEM_PLAN_VERIFICATION_PERFORMANCE_TARGETS,
} from "./fixtures/planning-performance-targets";

const PLAN_NAME_WEEK_PATTERN = /\((\d+)\s+weeks?\)/i;

function getPlanStartDate(plan: SystemTrainingPlanTemplate): string {
  return "start_date" in plan.structure && typeof plan.structure.start_date === "string"
    ? plan.structure.start_date
    : "1970-01-01";
}

function dateOnlyToUtcMs(dateOnly: string): number {
  return Date.parse(`${dateOnly}T00:00:00.000Z`);
}

function diffDays(startDate: string, endDate: string): number {
  return Math.round(
    (dateOnlyToUtcMs(endDate) - dateOnlyToUtcMs(startDate)) / (24 * 60 * 60 * 1000),
  );
}

/**
 * Resolves template duration through the shared estimator. Without calibration,
 * exact and bounded repetition evidence remain available while distance/open
 * prescriptions fail closed.
 */
export function calculateSystemTemplateDurationSeconds(template: SystemTemplate): number | null {
  return estimateSystemTemplateDuration(template).valueSeconds;
}

export type SystemPlanDurationEstimationContext = {
  performanceTargets: AthletePerformanceTargetFacts;
  asOf: string;
};

const DEFAULT_SYSTEM_PLAN_QUANTIFICATION_CONTEXT: SystemPlanDurationEstimationContext = {
  performanceTargets: SYSTEM_PLAN_VERIFICATION_PERFORMANCE_TARGETS,
  asOf: SYSTEM_PLAN_VERIFICATION_AS_OF,
};

export function quantifySystemTemplate(
  template: SystemTemplate,
  context: SystemPlanDurationEstimationContext = DEFAULT_SYSTEM_PLAN_QUANTIFICATION_CONTEXT,
): ActivityPlanPlanningEstimate {
  return estimateActivityPlanForTrainingContext({
    structure: validateSystemTemplateActivityPlan(template),
    performanceTargets: context.performanceTargets,
    asOf: context.asOf,
    stage: "template",
    planId: template.id,
  });
}

/** Restores provenance-bearing system-template duration evidence without legacy Load materialization. */
export function estimateSystemTemplateDuration(
  template: SystemTemplate,
  context?: SystemPlanDurationEstimationContext,
): ActivityPlanDurationEstimate {
  return quantifySystemTemplate(template, context ?? DEFAULT_SYSTEM_PLAN_QUANTIFICATION_CONTEXT)
    .durationEstimate;
}

/** Strictly validates an authored system-template V3 document. */
export function validateSystemTemplateActivityPlan(
  template: SystemTemplate,
): ActivityPlanStructure {
  return activityPlanStructureSchema.parse(template.structure);
}

/**
 * Builds an ID-indexed lookup for canonical system activity templates.
 */
export function buildSystemTemplateIndex(
  templates: readonly SystemTemplate[] = SYSTEM_TEMPLATES,
): Map<string, SystemTemplate> {
  return new Map(templates.map((template) => [template.id, template]));
}

/**
 * Extracts the advertised week count from a training-plan name, if present.
 */
export function extractAdvertisedWeekCount(planName: string): number | null {
  const match = planName.match(PLAN_NAME_WEEK_PATTERN);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
}

function getMaterializedWeekCount(
  startDate: string,
  events: readonly MaterializedPlanEvent[],
): number {
  if (events.length === 0) {
    return 0;
  }

  const lastEvent = events.at(-1);
  if (!lastEvent) return 0;
  return Math.floor(diffDays(startDate, lastEvent.scheduled_date) / 7) + 1;
}

function roundHours(value: number): number {
  return Number(value.toFixed(2));
}

function sumResolvedDurationHours(values: ReadonlyArray<number | null>): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return roundHours(total);
}

export interface SystemTrainingPlanAudit {
  planId: string;
  planName: string;
  startDate: string;
  declaredDurationHours: number;
  advertisedWeekCount: number | null;
  materializedWeekCount: number;
  materializedEvents: MaterializedPlanEvent[];
  linkedTemplateIds: string[];
  missingTemplateIds: string[];
  sessionDurationEvidence: Array<{
    scheduledDate: string;
    activityPlanId: string;
    durationEstimate: ActivityPlanDurationEstimate;
    prescriptionQuantification: ActivityPlanPlanningEstimate["prescriptionQuantification"];
  }>;
  weeklyResolvedDurationHours: Array<number | null>;
  totalResolvedDurationHours: number | null;
  meanWeeklyResolvedDurationHours: number | null;
}

/**
 * Audits a system training plan against the in-code activity-template registry.
 */
export function buildSystemTrainingPlanAudit(
  plan: SystemTrainingPlanTemplate,
  templateIndex: ReadonlyMap<string, SystemTemplate> = buildSystemTemplateIndex(),
  durationContext?: SystemPlanDurationEstimationContext,
): SystemTrainingPlanAudit {
  const quantificationContext = durationContext ?? DEFAULT_SYSTEM_PLAN_QUANTIFICATION_CONTEXT;
  const startDate = getPlanStartDate(plan);
  const materializedEvents = materializePlanToEvents(plan.structure, startDate, "UTC");
  const linkedTemplateIds = Array.from(
    new Set(
      materializedEvents
        .map((event) => event.activity_plan_id)
        .filter((activityPlanId): activityPlanId is string => activityPlanId !== null),
    ),
  );

  const missingTemplateIds = linkedTemplateIds.filter(
    (activityPlanId) => !templateIndex.has(activityPlanId),
  );

  const weeklyResolvedDurationSeconds = new Map<number, number | null>();
  const sessionDurationEvidence: SystemTrainingPlanAudit["sessionDurationEvidence"] = [];

  for (const event of materializedEvents) {
    if (event.event_type !== "planned" || event.activity_plan_id === null) {
      continue;
    }

    const weekIndex = Math.floor(diffDays(startDate, event.scheduled_date) / 7);
    const existingSeconds = weeklyResolvedDurationSeconds.get(weekIndex);
    const currentSeconds = existingSeconds === undefined ? 0 : existingSeconds;
    const template = templateIndex.get(event.activity_plan_id);
    if (!template) {
      const unavailable = createUnavailableActivityPlanPlanningEstimate({
        asOf: quantificationContext.asOf,
        stage: "template",
        planId: event.activity_plan_id,
        reason: "source_missing",
      });
      sessionDurationEvidence.push({
        scheduledDate: event.scheduled_date,
        activityPlanId: event.activity_plan_id,
        durationEstimate: unavailable.durationEstimate,
        prescriptionQuantification: unavailable.prescriptionQuantification,
      });
      weeklyResolvedDurationSeconds.set(weekIndex, null);
      continue;
    }

    const quantified = quantifySystemTemplate(template, quantificationContext);
    const duration = quantified.durationEstimate;
    sessionDurationEvidence.push({
      scheduledDate: event.scheduled_date,
      activityPlanId: event.activity_plan_id,
      durationEstimate: duration,
      prescriptionQuantification: quantified.prescriptionQuantification,
    });
    const templateSeconds = duration.valueSeconds;
    weeklyResolvedDurationSeconds.set(
      weekIndex,
      currentSeconds === null || templateSeconds === null ? null : currentSeconds + templateSeconds,
    );
  }

  const weeklyResolvedDurationHours = Array.from(
    { length: getMaterializedWeekCount(startDate, materializedEvents) },
    (_, weekIndex) => {
      const resolvedSeconds = weeklyResolvedDurationSeconds.get(weekIndex);
      const seconds = resolvedSeconds === undefined ? 0 : resolvedSeconds;
      return seconds === null ? null : roundHours(seconds / 3600);
    },
  );

  const totalResolvedDurationHours = sumResolvedDurationHours(weeklyResolvedDurationHours);
  const meanWeeklyResolvedDurationHours =
    totalResolvedDurationHours === null
      ? null
      : roundHours(
          weeklyResolvedDurationHours.length === 0
            ? 0
            : totalResolvedDurationHours / weeklyResolvedDurationHours.length,
        );

  return {
    planId: plan.id,
    planName: plan.name,
    startDate,
    declaredDurationHours: plan.duration_hours,
    advertisedWeekCount: extractAdvertisedWeekCount(plan.name),
    materializedWeekCount: getMaterializedWeekCount(startDate, materializedEvents),
    materializedEvents,
    linkedTemplateIds,
    missingTemplateIds,
    sessionDurationEvidence,
    weeklyResolvedDurationHours,
    totalResolvedDurationHours,
    meanWeeklyResolvedDurationHours,
  };
}

export function assertSystemTrainingPlanTemplateLinksResolved(
  plan: SystemTrainingPlanTemplate,
  templateIndex: ReadonlyMap<string, SystemTemplate> = buildSystemTemplateIndex(),
): SystemTrainingPlanAudit {
  const audit = buildSystemTrainingPlanAudit(plan, templateIndex);

  if (audit.missingTemplateIds.length > 0) {
    throw new Error(
      `System training plan ${plan.name} has unresolved activity templates: ${audit.missingTemplateIds.join(", ")}`,
    );
  }

  return audit;
}

/**
 * Returns audits for the full in-code system training-plan registry.
 */
export function buildAllSystemTrainingPlanAudits(
  durationContext?: SystemPlanDurationEstimationContext,
): SystemTrainingPlanAudit[] {
  const templateIndex = buildSystemTemplateIndex();
  return ALL_SAMPLE_PLANS.map((plan) =>
    buildSystemTrainingPlanAudit(plan, templateIndex, durationContext),
  );
}
