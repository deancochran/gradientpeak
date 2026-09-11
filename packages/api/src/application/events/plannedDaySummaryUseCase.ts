import {
  type ActivityPrescriptionQuantificationBundle,
  activityPlanDocumentSchema,
  bindPrescriptionQuantificationToScheduledEvent,
  type CanonicalActivityCategory,
  type CommonLoadAggregate,
  createUnavailableActivityPlanPlanningEstimate,
  resolveActivityPlanVariant,
  summarizePlannedDay,
} from "@repo/core";
import type {
  EventReadRepository,
  PlannedDaySummaryActivityPlanRecord,
  PlannedDaySummaryEventRecord,
} from "../../repositories";

export const MAX_PLANNED_DAY_SUMMARY_EVENTS = 1_000;

export class PlannedDaySummaryLimitExceededError extends Error {
  constructor() {
    super("Too many planned events to summarize this day");
    this.name = "PlannedDaySummaryLimitExceededError";
  }
}

export type PlannedDaySummaryEstimatedPlan = PlannedDaySummaryActivityPlanRecord & {
  prescriptionQuantification: ActivityPrescriptionQuantificationBundle;
};

export type PlannedDaySummaryResult = {
  source: {
    complete: true;
    eventCount: number;
    unavailableEstimateCount: number;
    unavailablePlanCount: number;
    unlinkedPlanCount: number;
  };
  summary: {
    eventCount: number;
    activity_categories: CanonicalActivityCategory[];
    totalDurationSeconds: number | null;
    prescriptionQuantification: ActivityPrescriptionQuantificationBundle;
    commonLoad: CommonLoadAggregate;
  };
};

export function getAvailablePlannedDaySummaryPlans(
  events: PlannedDaySummaryEventRecord[],
): PlannedDaySummaryActivityPlanRecord[] {
  return events.flatMap((event) => {
    const plan = event.activity_plan;
    return plan && activityPlanDocumentSchema.safeParse(plan.structure).success ? [plan] : [];
  });
}

function resolveDefaultStructure(plan: PlannedDaySummaryActivityPlanRecord) {
  const document = activityPlanDocumentSchema.safeParse(plan.structure);
  if (!document.success) return null;
  return resolveActivityPlanVariant(document.data).structure;
}

function unavailableEventQuantification(input: {
  activityCategory?: CanonicalActivityCategory;
  date: string;
  eventId: string;
  planId?: string;
}): ActivityPrescriptionQuantificationBundle {
  return createUnavailableActivityPlanPlanningEstimate({
    asOf: `${input.date}T00:00:00.000Z`,
    stage: "scheduled",
    planId: input.planId,
    scheduledEventId: input.eventId,
    activityCategory: input.activityCategory,
    reason: "source_missing",
  }).prescriptionQuantification;
}

export function summarizePlannedDayEvents(input: {
  date: string;
  estimates: PlannedDaySummaryEstimatedPlan[];
  events: PlannedDaySummaryEventRecord[];
}): PlannedDaySummaryResult {
  const { events } = input;
  const classifiedEvents = events.map((event) => {
    const plan = event.activity_plan;
    return {
      event,
      plan,
      structure: plan ? resolveDefaultStructure(plan) : null,
    };
  });
  const estimatesByPlanId = new Map(input.estimates.map((plan) => [plan.id, plan]));

  let unavailablePlanCount = 0;
  let unlinkedPlanCount = 0;
  let unavailableEstimateCount = 0;
  const prescriptionQuantifications: ActivityPrescriptionQuantificationBundle[] = [];
  for (const { event, plan, structure } of classifiedEvents) {
    if (!plan) {
      if (event.activity_plan_id) unavailablePlanCount += 1;
      else unlinkedPlanCount += 1;
      unavailableEstimateCount += 1;
      prescriptionQuantifications.push(
        unavailableEventQuantification({
          date: input.date,
          eventId: event.id,
          ...(event.activity_plan_id === null ? {} : { planId: event.activity_plan_id }),
        }),
      );
      continue;
    }

    if (!structure) {
      // The repository normally turns invalid joined plans into unavailable,
      // but fail closed if an alternate implementation returns one.
      unavailablePlanCount += 1;
      unavailableEstimateCount += 1;
      prescriptionQuantifications.push(
        unavailableEventQuantification({
          date: input.date,
          eventId: event.id,
          planId: plan.id,
        }),
      );
      continue;
    }

    const estimate = estimatesByPlanId.get(plan.id);
    let eventQuantification: ActivityPrescriptionQuantificationBundle;
    try {
      eventQuantification = estimate
        ? bindPrescriptionQuantificationToScheduledEvent({
            prescriptionQuantification: estimate.prescriptionQuantification,
            eventId: event.id,
          })
        : unavailableEventQuantification({
            date: input.date,
            eventId: event.id,
            planId: plan.id,
            activityCategory: structure.activity_category,
          });
    } catch {
      eventQuantification = unavailableEventQuantification({
        date: input.date,
        eventId: event.id,
        planId: plan.id,
        activityCategory: structure.activity_category,
      });
    }
    const eventAggregate = eventQuantification.summary;
    if (
      eventAggregate.duration.elapsed.status === "unavailable" ||
      eventAggregate.commonLoad.status === "unavailable"
    ) {
      unavailableEstimateCount += 1;
    }
    prescriptionQuantifications.push(eventQuantification);
  }
  const plannedDay = summarizePlannedDay(
    prescriptionQuantifications.map((prescriptionQuantification) => ({
      prescriptionQuantification,
    })),
  );
  const prescriptionQuantification = plannedDay.prescriptionQuantification;
  return {
    summary: {
      eventCount: events.length,
      activity_categories: plannedDay.activity_categories,
      totalDurationSeconds: plannedDay.totalDurationSeconds,
      prescriptionQuantification,
      commonLoad: prescriptionQuantification.summary.commonLoad,
    },
    source: {
      complete: true,
      eventCount: events.length,
      unavailableEstimateCount,
      unavailablePlanCount,
      unlinkedPlanCount,
    },
  };
}

export async function plannedDaySummaryUseCase(input: {
  date: string;
  deriveMetrics: (
    plans: PlannedDaySummaryActivityPlanRecord[],
  ) => Promise<PlannedDaySummaryEstimatedPlan[]>;
  profileId: string;
  repository: Pick<EventReadRepository, "listOwnedPlannedEventsForDay">;
}): Promise<PlannedDaySummaryResult> {
  const events = await input.repository.listOwnedPlannedEventsForDay({
    date: input.date,
    limit: MAX_PLANNED_DAY_SUMMARY_EVENTS + 1,
    profileId: input.profileId,
  });

  if (events.length > MAX_PLANNED_DAY_SUMMARY_EVENTS) {
    throw new PlannedDaySummaryLimitExceededError();
  }

  const estimates = await input.deriveMetrics(getAvailablePlannedDaySummaryPlans(events));
  return summarizePlannedDayEvents({ date: input.date, estimates, events });
}
