import type { ActivityPrescriptionQuantificationBundle, AthletePlanningContext } from "@repo/core";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";
import { type ActivityPlanFitSummary, scoreActivityPlanFit } from "./activity-plan-fit";
import type { UseTrainingPlanCreationServiceOptions } from "./service-types";
import type { TrainingPlanBuilderSession } from "./types";

export type ActivityPlanPickerSort = NonNullable<
  UseTrainingPlanCreationServiceOptions["activityPlanPicker"]
>["sort"];

export type ActivityPlanPickerItem = {
  id: string;
  name: string;
  created_at?: string | null | undefined;
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null | undefined;
  activity_category?: string | null | undefined;
  structure?: unknown | undefined;
};

export type ActivityPlanPickerPage<TItem extends ActivityPlanPickerItem = ActivityPlanPickerItem> =
  {
    items: TItem[];
  };

export type ActivityPlanPickerState<TItem extends ActivityPlanPickerItem = ActivityPlanPickerItem> =
  {
    activityPlanItems: TItem[];
    activityPlanFitById: Map<string, ActivityPlanFitSummary>;
    activityPlanEstimateById: Map<string, never>;
  };

export function deriveActivityPlanPickerState<TItem extends ActivityPlanPickerItem>({
  pages,
  athleteContext,
  selectedSessionId,
  sessions,
  sort = "newest",
}: {
  pages?: ActivityPlanPickerPage<TItem>[] | null;
  athleteContext?: AthletePlanningContext | null;
  selectedSessionId?: string | null;
  sessions: TrainingPlanBuilderSession[];
  sort?: ActivityPlanPickerSort;
}): ActivityPlanPickerState<TItem> {
  const items = pages?.flatMap((page) => page.items) ?? [];
  const selectedSession = selectedSessionId
    ? sessions.find((session) => session.localId === selectedSessionId)
    : null;
  const fitById = new Map(
    items.flatMap((item) => {
      const fit = scoreActivityPlanFit({
        demand: selectedSession?.demand,
        estimatedCommonLoad: getActivityPlanQuantitySummary(item).commonLoad,
        estimatedDurationSeconds: getActivityPlanQuantitySummary(item).durationSeconds,
      });
      return fit ? [[item.id, fit] as const] : [];
    }),
  );
  // Candidate estimates are resolver-owned; the picker only ranks static fit.
  const estimateById = new Map<string, never>();

  const sortedItems = [...items].sort((left, right) => {
    if (selectedSession?.demand) {
      const fitDiff = (fitById.get(right.id)?.score ?? 0) - (fitById.get(left.id)?.score ?? 0);
      if (fitDiff !== 0) {
        return fitDiff;
      }
    }

    if (sort === "name") {
      return left.name.localeCompare(right.name);
    }

    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  });

  return {
    activityPlanItems: sortedItems,
    activityPlanFitById: fitById,
    activityPlanEstimateById: estimateById,
  };
}
