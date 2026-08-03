import {
  type ActivityPlanIntervalStep,
  type ActivityPrescriptionQuantificationBundle,
  activityPlanStructureSchema,
  compileActivityPlan,
} from "@repo/core";
import { useMemo } from "react";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";

type ActivityPlanLike = {
  activity_category?: string | null;
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
  profile_id?: string | null;
  structure?: unknown;
  [key: string]: unknown;
};

type PlannedActivityLike = {
  activity_plan?: ActivityPlanLike | null;
};

type ProfileLike = {
  id?: string | null;
};

interface UseActivityPlanDetailViewModelParams {
  activityPlanParam?: string;
  fetchedPlan: ActivityPlanLike | null | undefined;
  formatDuration: (seconds: number) => string;
  isScheduled: boolean;
  plannedActivity: PlannedActivityLike | null | undefined;
  profile: ProfileLike | null | undefined;
  template?: string;
}

export function useActivityPlanDetailViewModel({
  activityPlanParam,
  fetchedPlan,
  formatDuration,
  isScheduled,
  plannedActivity,
  profile,
  template,
}: UseActivityPlanDetailViewModelParams) {
  const activityPlan = useMemo(() => {
    if (plannedActivity?.activity_plan) return plannedActivity.activity_plan;
    if (fetchedPlan) return fetchedPlan;
    if (template) {
      try {
        return JSON.parse(template);
      } catch (error) {
        console.error("Failed to parse template:", error);
      }
    }
    if (activityPlanParam) {
      try {
        return JSON.parse(activityPlanParam);
      } catch (error) {
        console.error("Failed to parse activityPlan:", error);
      }
    }
    return null;
  }, [activityPlanParam, fetchedPlan, plannedActivity, template]);

  const structure = useMemo(() => {
    const parsed = activityPlanStructureSchema.safeParse(activityPlan?.structure);
    return parsed.success ? parsed.data : null;
  }, [activityPlan?.structure]);
  const steps: ActivityPlanIntervalStep[] = useMemo(() => {
    const flatSteps: ActivityPlanIntervalStep[] = [];
    for (const segment of structure?.segments ?? []) {
      if (segment.role !== "activity") continue;
      for (const interval of segment.intervals) {
        for (let i = 0; i < interval.repetitions; i++) flatSteps.push(...interval.steps);
      }
    }
    return flatSteps;
  }, [structure]);

  const compiled = useMemo(() => (structure ? compileActivityPlan(structure) : null), [structure]);

  const quantitySummary = getActivityPlanQuantitySummary(activityPlan);
  const estimatedDurationSeconds = quantitySummary.durationSeconds;
  const estimatedDurationMinutes = estimatedDurationSeconds
    ? Math.round(estimatedDurationSeconds / 60)
    : null;
  const durationMinutes =
    estimatedDurationMinutes ?? Math.round((compiled?.explicitTimedDurationSeconds ?? 0) / 60);
  const isOwnedByUser = activityPlan?.profile_id === profile?.id;
  const detailBadges = activityPlan
    ? [
        compiled?.activity_category || activityPlan.activity_category || "Other",
        isScheduled ? "Scheduled" : isOwnedByUser ? "My plan" : "Template",
      ]
    : [];

  return {
    activityPlan,
    detailBadges,
    isOwnedByUser,
    steps,
    durationLabel: formatDuration(durationMinutes * 60),
    durationMinutes,
  };
}
