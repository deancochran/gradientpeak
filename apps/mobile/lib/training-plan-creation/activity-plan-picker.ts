import {
  type ActivityPlanPlanningEstimate,
  type AthletePlanningContext,
  estimatePlanningActivityPlanForAthlete,
} from "@repo/core";
import { type ActivityPlanFitSummary, scoreActivityPlanFit } from "./activity-plan-fit";
import type { UseTrainingPlanCreationServiceOptions } from "./service-types";
import type { TrainingPlanBuilderSession } from "./types";

export type ActivityPlanPickerSort = NonNullable<
  UseTrainingPlanCreationServiceOptions["activityPlanPicker"]
>["sort"];

export type ActivityPlanPickerItem = {
  id: string;
  name: string;
  created_at?: string | null;
  authoritative_metrics?: {
    estimated_tss?: number | null;
    estimated_duration?: number | null;
    intensity_factor?: number | null;
  } | null;
  activity_category?: string | null;
  structure?: unknown;
};

export type ActivityPlanPickerPage<TItem extends ActivityPlanPickerItem = ActivityPlanPickerItem> =
  {
    items: TItem[];
  };

export type ActivityPlanPickerState<TItem extends ActivityPlanPickerItem = ActivityPlanPickerItem> =
  {
    activityPlanItems: TItem[];
    activityPlanFitById: Map<string, ActivityPlanFitSummary>;
    activityPlanEstimateById: Map<string, ActivityPlanPlanningEstimate>;
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
        intent: selectedSession?.intent,
        estimatedTss: item.authoritative_metrics?.estimated_tss ?? null,
        estimatedDurationSeconds: item.authoritative_metrics?.estimated_duration ?? null,
      });
      return fit ? [[item.id, fit] as const] : [];
    }),
  );
  const estimateById = new Map(
    athleteContext
      ? items.map(
          (item) =>
            [
              item.id,
              estimatePlanningActivityPlanForAthlete({ activityPlan: item, athleteContext }),
            ] as const,
        )
      : [],
  );

  const sortedItems = [...items].sort((left, right) => {
    if (selectedSession?.intent) {
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
