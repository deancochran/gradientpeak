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
  snapshotStructure: Record<string, unknown>;
  targetDate: string | null;
};

function maxDateOnlyUtc(left: string, right: string): string {
  return left >= right ? left : right;
}

function buildTrainingPlanSnapshotStructure(input: {
  applicationMode: TrainingPlanApplicationMode;
  appliedPlanStartDate: string;
  includedFromDate: string | null;
  structure: Record<string, unknown>;
  targetDate: string | null;
}) {
  return {
    ...input.structure,
    start_date: input.appliedPlanStartDate,
    _application: {
      applied_start_date: input.appliedPlanStartDate,
      application_mode: input.applicationMode,
      included_from_date: input.includedFromDate,
      target_date: input.targetDate,
    },
  } satisfies Record<string, unknown>;
}

export function materializeAppliedTrainingPlan(input: {
  applicationMode: TrainingPlanApplicationMode;
  startDate?: string;
  targetDate?: string;
  structure: Record<string, unknown>;
  todayDate: string;
}): MaterializedApplication {
  let appliedPlanStartDate = input.startDate;

  if (!appliedPlanStartDate && input.targetDate) {
    const dummyStart = "2000-01-01";
    const dummySessions = materializePlanToEvents(input.structure, dummyStart);
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

  const materializationStructure = {
    ...input.structure,
    start_date: appliedPlanStartDate,
  } satisfies Record<string, unknown>;
  const allMaterializedSessions = materializePlanToEvents(
    materializationStructure,
    appliedPlanStartDate,
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
    snapshotStructure: buildTrainingPlanSnapshotStructure({
      applicationMode: input.applicationMode,
      appliedPlanStartDate,
      includedFromDate,
      structure: input.structure,
      targetDate: input.targetDate ?? null,
    }),
    targetDate: input.targetDate ?? null,
  };
}
