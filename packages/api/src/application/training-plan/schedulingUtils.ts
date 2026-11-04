import {
  addDaysDateOnlyUtc,
  diffDateOnlyUtcDays,
  materializePlanToEvents,
  type templateApplyInputSchema,
} from "@repo/core";
import type { z } from "zod";

export type TrainingPlanApplicationMode = z.infer<
  typeof templateApplyInputSchema
>["application_mode"];

type MaterializedPlanSession = ReturnType<typeof materializePlanToEvents>[number];

export type MaterializedApplication = {
  appliedPlanStartDate: string;
  applicationMode: TrainingPlanApplicationMode;
  includedFromDate: string | null;
  materializedSessions: MaterializedPlanSession[];
  skippedSessions: number;
  targetDate: string | null;
};

function maxDateOnlyUtc(left: string, right: string): string {
  return left >= right ? left : right;
}

export function materializeAppliedTrainingPlan(input: {
  applicationMode: TrainingPlanApplicationMode;
  planningTimezone: string;
  startDate?: string;
  targetDate?: string;
  structure: Record<string, unknown>;
  todayDate: string;
}): MaterializedApplication {
  let appliedPlanStartDate = input.startDate;

  if (!appliedPlanStartDate && input.targetDate) {
    const dummyStart = "2000-01-01";
    const dummySessions = materializePlanToEvents(
      input.structure,
      dummyStart,
      input.planningTimezone,
    );
    let maxOffsetDays = 0;
    for (const session of dummySessions) {
      const offset = diffDateOnlyUtcDays(dummyStart, session.scheduled_date);
      if (offset > maxOffsetDays) {
        maxOffsetDays = offset;
      }
    }
    appliedPlanStartDate = addDaysDateOnlyUtc(input.targetDate, -maxOffsetDays);
  }

  if (!appliedPlanStartDate) {
    appliedPlanStartDate = input.todayDate;
  }

  const allMaterializedSessions = materializePlanToEvents(
    input.structure,
    appliedPlanStartDate,
    input.planningTimezone,
  );
  const includedFromDate =
    input.applicationMode === "remaining"
      ? maxDateOnlyUtc(appliedPlanStartDate, input.todayDate)
      : null;
  const materializedSessions = includedFromDate
    ? allMaterializedSessions.filter((session) => session.scheduled_date >= includedFromDate)
    : allMaterializedSessions;

  return {
    appliedPlanStartDate,
    applicationMode: input.applicationMode,
    includedFromDate,
    materializedSessions,
    skippedSessions: allMaterializedSessions.length - materializedSessions.length,
    targetDate: input.targetDate ?? null,
  };
}
