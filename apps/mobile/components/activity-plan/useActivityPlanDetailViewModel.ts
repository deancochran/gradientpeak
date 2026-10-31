import {
  type ActivityPlanDetail,
  type ActivityPlanStep,
  type ActivityPlanSummary,
  activityPlanDetailSchema,
  activityPlanStructureSchema,
  activityPlanSummarySchema,
  compileActivityPlan,
} from "@repo/core";
import { useMemo } from "react";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";

type ActivityPlanProjection = ActivityPlanSummary | ActivityPlanDetail;

type PlannedActivityLike = {
  activityPlanSummary?: ActivityPlanSummary | null;
};

type ProfileLike = {
  id?: string | null;
};

interface UseActivityPlanDetailViewModelParams {
  activityPlanParam?: string;
  fetchedPlan: ActivityPlanDetail | null | undefined;
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
  const activityPlan = useMemo<ActivityPlanProjection | null>(() => {
    if (plannedActivity?.activityPlanSummary) return plannedActivity.activityPlanSummary;
    if (fetchedPlan) return fetchedPlan;
    const serializedPlan = template ?? activityPlanParam;
    if (serializedPlan) {
      try {
        const candidate: unknown = JSON.parse(serializedPlan);
        const detail = activityPlanDetailSchema.safeParse(candidate);
        if (detail.success) return detail.data;
        const summary = activityPlanSummarySchema.safeParse(candidate);
        if (summary.success) return summary.data;
      } catch (error) {
        console.error("Failed to parse activity plan projection:", error);
      }
    }
    return null;
  }, [activityPlanParam, fetchedPlan, plannedActivity, template]);

  const structure = useMemo(() => {
    const parsed = activityPlanStructureSchema.safeParse(activityPlan?.structure);
    return parsed.success ? parsed.data : null;
  }, [activityPlan?.structure]);
  const steps: ActivityPlanStep[] = useMemo(() => {
    const flatSteps: ActivityPlanStep[] = [];
    for (const item of structure?.items ?? []) {
      if (item.type === "step") flatSteps.push(item);
      else for (let i = 0; i < item.count; i++) flatSteps.push(...item.steps);
    }
    return flatSteps;
  }, [structure]);

  const compiled = useMemo(() => (structure ? compileActivityPlan(structure) : null), [structure]);

  const quantitySummary = getActivityPlanQuantitySummary(activityPlan);
  const estimatedDurationSeconds = quantitySummary.durationSeconds;
  const estimatedDurationMinutes = estimatedDurationSeconds
    ? Math.round(estimatedDurationSeconds / 60)
    : null;
  const durationMinutes = estimatedDurationMinutes;
  const isOwnedByUser = Boolean(activityPlan?.capabilities.canEdit && profile?.id);
  const detailBadges = activityPlan
    ? [
        compiled?.activity_category || activityPlan.activityCategory || "Other",
        isScheduled ? "Scheduled" : isOwnedByUser ? "My plan" : "Template",
      ]
    : [];

  return {
    activityPlan,
    detailBadges,
    isOwnedByUser,
    steps,
    durationLabel: durationMinutes === null ? "—" : formatDuration(durationMinutes * 60),
    durationMinutes,
  };
}
