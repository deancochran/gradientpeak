import {
  buildEstimationContext,
  decodePolyline,
  estimateActivity,
  type IntervalStepV2,
} from "@repo/core";
import { useMemo } from "react";
import { getDurationMs } from "@/lib/utils/durationConversion";

type ActivityPlanLike = {
  activity_category: string;
  estimated_tss?: number | null;
  profile_id?: string | null;
  structure?: unknown;
  [key: string]: unknown;
};

type PlannedActivityLike = {
  activity_plan?: ActivityPlanLike | null;
};

type ProfileLike = Parameters<typeof buildEstimationContext>[0]["userProfile"] & {
  id?: string | null;
};

type RouteLike = {
  polyline?: string | null;
};

interface UseActivityPlanDetailViewModelParams {
  activityPlanParam?: string;
  fetchedPlan: ActivityPlanLike | null | undefined;
  formatDuration: (seconds: number) => string;
  isPublic: boolean;
  isScheduled: boolean;
  plannedActivity: PlannedActivityLike | null | undefined;
  profile: ProfileLike | null | undefined;
  route: RouteLike | null | undefined;
  template?: string;
}

function getIntervals(structure: unknown): Array<{ repetitions: number; steps: IntervalStepV2[] }> {
  if (!structure || typeof structure !== "object") return [];
  const maybeIntervals = (structure as { intervals?: unknown }).intervals;
  return Array.isArray(maybeIntervals)
    ? (maybeIntervals as Array<{ repetitions: number; steps: IntervalStepV2[] }>)
    : [];
}

export function useActivityPlanDetailViewModel({
  activityPlanParam,
  fetchedPlan,
  formatDuration,
  isPublic,
  isScheduled,
  plannedActivity,
  profile,
  route,
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

  const estimates = useMemo(() => {
    if (!activityPlan) return null;
    try {
      const context = buildEstimationContext({ userProfile: profile || {}, activityPlan });
      return estimateActivity(context);
    } catch (error) {
      console.error("Estimation error:", error);
      return null;
    }
  }, [activityPlan, profile]);

  const steps: IntervalStepV2[] = useMemo(() => {
    const intervals = getIntervals(activityPlan?.structure);
    if (intervals.length === 0) return [];
    const flatSteps: IntervalStepV2[] = [];
    for (const interval of intervals) {
      for (let i = 0; i < interval.repetitions; i++) {
        for (const step of interval.steps) flatSteps.push(step);
      }
    }
    return flatSteps;
  }, [activityPlan?.structure]);

  const totalDuration = useMemo(
    () => steps.reduce((total, step) => total + getDurationMs(step.duration), 0),
    [steps],
  );

  const durationMinutes = estimates
    ? Math.round(estimates.duration / 60)
    : Math.round(totalDuration / 60000);
  const tss = estimates ? Math.round(estimates.tss) : activityPlan?.estimated_tss;
  const intensityFactor = estimates?.intensityFactor;
  const isOwnedByUser = activityPlan?.profile_id === profile?.id;
  const visibilityLabel = isOwnedByUser ? (isPublic ? "Public" : "Private") : "Read only";
  const detailBadges = activityPlan
    ? [
        activityPlan.activity_category,
        isScheduled ? "Scheduled" : isOwnedByUser ? "My plan" : "Template",
        visibilityLabel,
      ]
    : [];

  const routeCoordinates = route?.polyline ? decodePolyline(route.polyline) : null;
  const routePreview = routeCoordinates?.length
    ? {
        coordinates: routeCoordinates,
        initialRegion: {
          latitude: routeCoordinates[Math.floor(routeCoordinates.length / 2)].latitude,
          longitude: routeCoordinates[Math.floor(routeCoordinates.length / 2)].longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
      }
    : null;

  return {
    activityPlan,
    detailBadges,
    estimates,
    intensityFactor,
    isOwnedByUser,
    routePreview,
    steps,
    tss,
    visibilityLabel,
    durationLabel: formatDuration(durationMinutes * 60),
    durationMinutes,
  };
}
