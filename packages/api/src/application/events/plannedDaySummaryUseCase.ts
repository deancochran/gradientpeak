import {
  activityPlanStructureSchemaV3,
  type PlannedDaySummaryEvent,
  summarizePlannedDay,
} from "@repo/core";
import type { EventReadRepository, PlannedDaySummaryActivityPlanRecord } from "../../repositories";

export const MAX_PLANNED_DAY_SUMMARY_EVENTS = 1_000;

export class PlannedDaySummaryLimitExceededError extends Error {
  constructor() {
    super("Too many planned events to summarize this day");
    this.name = "PlannedDaySummaryLimitExceededError";
  }
}

export type PlannedDaySummaryEstimatedPlan = PlannedDaySummaryActivityPlanRecord & {
  authoritative_metrics: {
    estimated_duration: number | null;
    estimated_tss: number | null;
  };
};

export type PlannedDaySummaryResult = {
  source: {
    complete: true;
    eventCount: number;
    unavailableEstimateCount: number;
    unavailablePlanCount: number;
    unlinkedPlanCount: number;
  };
  summary: ReturnType<typeof summarizePlannedDay>;
};

function unavailableActivityCategory(): PlannedDaySummaryEvent["activityCategory"] {
  return null;
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

  const classifiedEvents = events.map((event) => {
    const plan = event.activity_plan;
    return {
      event,
      plan,
      parsed: plan ? activityPlanStructureSchemaV3.safeParse(plan.structure) : null,
    };
  });
  const availablePlans = classifiedEvents.flatMap(({ parsed, plan }) =>
    plan && parsed?.success ? [plan] : [],
  );
  const estimates = await input.deriveMetrics(availablePlans);
  const estimatesByPlanId = new Map(estimates.map((plan) => [plan.id, plan]));

  let unavailablePlanCount = 0;
  let unlinkedPlanCount = 0;
  let unavailableEstimateCount = 0;
  const summaryEvents: PlannedDaySummaryEvent[] = classifiedEvents.map(
    ({ event, parsed, plan }) => {
      if (!plan) {
        if (event.activity_plan_id) unavailablePlanCount += 1;
        else unlinkedPlanCount += 1;
        unavailableEstimateCount += 1;
        return {
          activityCategory: unavailableActivityCategory(),
          estimatedDurationSeconds: null,
          estimatedTss: null,
        };
      }

      if (!parsed?.success) {
        // The repository normally turns invalid joined plans into unavailable,
        // but fail closed if an alternate implementation returns one.
        unavailablePlanCount += 1;
        unavailableEstimateCount += 1;
        return {
          activityCategory: unavailableActivityCategory(),
          estimatedDurationSeconds: null,
          estimatedTss: null,
        };
      }

      const estimate = estimatesByPlanId.get(plan.id);
      const estimatedDurationSeconds = estimate?.authoritative_metrics.estimated_duration ?? null;
      const estimatedTss = estimate?.authoritative_metrics.estimated_tss ?? null;
      if (estimatedDurationSeconds === null || estimatedTss === null) unavailableEstimateCount += 1;
      const activitySegment = parsed.data.segments.find((segment) => segment.role === "activity");
      return {
        activityCategory: activitySegment?.activity_category ?? unavailableActivityCategory(),
        estimatedDurationSeconds,
        estimatedTss,
      };
    },
  );

  return {
    summary: summarizePlannedDay(summaryEvents),
    source: {
      complete: true,
      eventCount: events.length,
      unavailableEstimateCount,
      unavailablePlanCount,
      unlinkedPlanCount,
    },
  };
}
