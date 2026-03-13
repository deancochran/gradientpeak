import {
  ALL_SAMPLE_PLANS,
  SYSTEM_TEMPLATES,
  type SystemTemplate,
  type SystemTrainingPlanTemplate,
} from "../../samples";
import { getDurationSeconds } from "../../schemas/duration_helpers";
import {
  materializePlanToEvents,
  type MaterializedPlanEvent,
} from "../materializePlanToEvents";

const PLAN_NAME_WEEK_PATTERN = /\((\d+)\s+weeks?\)/i;

function getPlanStartDate(plan: SystemTrainingPlanTemplate): string {
  const structure = plan.structure as Record<string, unknown>;
  return typeof structure.start_date === "string"
    ? structure.start_date
    : "1970-01-01";
}

function dateOnlyToUtcMs(dateOnly: string): number {
  return Date.parse(`${dateOnly}T00:00:00.000Z`);
}

function diffDays(startDate: string, endDate: string): number {
  return Math.round(
    (dateOnlyToUtcMs(endDate) - dateOnlyToUtcMs(startDate)) /
      (24 * 60 * 60 * 1000),
  );
}

function getPaceSecondsPerKm(
  activityCategory: SystemTemplate["activity_category"],
): number {
  switch (activityCategory) {
    case "swim":
      return 1200;
    case "run":
      return 300;
    case "bike":
      return 180;
    default:
      return 300;
  }
}

/**
 * Calculates a deterministic duration estimate for a system activity template.
 */
export function calculateSystemTemplateDurationSeconds(
  template: SystemTemplate,
): number {
  const paceSecondsPerKm = getPaceSecondsPerKm(
    template.activity_category ?? "other",
  );

  return template.structure.intervals.reduce((planTotal, interval) => {
    const intervalDuration = interval.steps.reduce((intervalTotal, step) => {
      return (
        intervalTotal +
        getDurationSeconds(step.duration, {
          paceSecondsPerKm,
        })
      );
    }, 0);

    return planTotal + intervalDuration * interval.repetitions;
  }, 0);
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

  const lastEvent = events[events.length - 1]!;
  return Math.floor(diffDays(startDate, lastEvent.scheduled_date) / 7) + 1;
}

function roundHours(value: number): number {
  return Number(value.toFixed(2));
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
  weeklyResolvedDurationHours: number[];
  totalResolvedDurationHours: number;
  meanWeeklyResolvedDurationHours: number;
}

/**
 * Audits a system training plan against the in-code activity-template registry.
 */
export function buildSystemTrainingPlanAudit(
  plan: SystemTrainingPlanTemplate,
  templateIndex: ReadonlyMap<
    string,
    SystemTemplate
  > = buildSystemTemplateIndex(),
): SystemTrainingPlanAudit {
  const startDate = getPlanStartDate(plan);
  const materializedEvents = materializePlanToEvents(plan.structure, startDate);
  const linkedTemplateIds = Array.from(
    new Set(
      materializedEvents
        .map((event) => event.activity_plan_id)
        .filter(
          (activityPlanId): activityPlanId is string => activityPlanId !== null,
        ),
    ),
  );

  const missingTemplateIds = linkedTemplateIds.filter(
    (activityPlanId) => !templateIndex.has(activityPlanId),
  );

  const weeklyResolvedDurationSeconds = new Map<number, number>();

  for (const event of materializedEvents) {
    if (event.event_type !== "planned" || event.activity_plan_id === null) {
      continue;
    }

    const template = templateIndex.get(event.activity_plan_id);
    if (!template) {
      continue;
    }

    const weekIndex = Math.floor(diffDays(startDate, event.scheduled_date) / 7);
    const currentSeconds = weeklyResolvedDurationSeconds.get(weekIndex) ?? 0;
    weeklyResolvedDurationSeconds.set(
      weekIndex,
      currentSeconds + calculateSystemTemplateDurationSeconds(template),
    );
  }

  const weeklyResolvedDurationHours = Array.from(
    { length: getMaterializedWeekCount(startDate, materializedEvents) },
    (_, weekIndex) =>
      roundHours((weeklyResolvedDurationSeconds.get(weekIndex) ?? 0) / 3600),
  );

  const totalResolvedDurationHours = roundHours(
    weeklyResolvedDurationHours.reduce((sum, weekHours) => sum + weekHours, 0),
  );
  const meanWeeklyResolvedDurationHours = roundHours(
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
    materializedWeekCount: getMaterializedWeekCount(
      startDate,
      materializedEvents,
    ),
    materializedEvents,
    linkedTemplateIds,
    missingTemplateIds,
    weeklyResolvedDurationHours,
    totalResolvedDurationHours,
    meanWeeklyResolvedDurationHours,
  };
}

export function assertSystemTrainingPlanTemplateLinksResolved(
  plan: SystemTrainingPlanTemplate,
  templateIndex: ReadonlyMap<
    string,
    SystemTemplate
  > = buildSystemTemplateIndex(),
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
export function buildAllSystemTrainingPlanAudits(): SystemTrainingPlanAudit[] {
  const templateIndex = buildSystemTemplateIndex();
  return ALL_SAMPLE_PLANS.map((plan) =>
    buildSystemTrainingPlanAudit(plan, templateIndex),
  );
}

/**
 * Extracts seeded system training-plan IDs from the curated SQL migration.
 */
export function extractSeededSystemTrainingPlanIds(
  migrationSql: string,
): string[] {
  return Array.from(
    migrationSql.matchAll(
      /'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'\s*,\s*null\s*,\s*true/gi,
    ),
    (match) => match[1] ?? "",
  );
}

/**
 * Indicates whether the curated SQL migration currently seeds session linkage IDs.
 */
export function migrationSeedsLinkedActivityPlanIds(
  migrationSql: string,
): boolean {
  return /activity_plan_id/i.test(migrationSql);
}
