import {
  type ActivityPlanIntervalStep,
  activityPlanStructureSchemaV3,
  compileActivityPlanV3,
  decodePolyline,
} from "@repo/core";
import { useMemo } from "react";
import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";

type ActivityPlanLike = {
  categories?: readonly string[];
  primary_category?: string | null;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_distance?: number | null;
  } | null;
  route?: {
    distance?: number | null;
    ascent?: number | null;
    descent?: number | null;
  } | null;
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

type RouteLike = {
  polyline?: string | null;
};

interface UseActivityPlanDetailViewModelParams {
  activityPlanParam?: string;
  fetchedPlan: ActivityPlanLike | null | undefined;
  formatDuration: (seconds: number) => string;
  isScheduled: boolean;
  plannedActivity: PlannedActivityLike | null | undefined;
  profile: ProfileLike | null | undefined;
  route: RouteLike | null | undefined;
  template?: string;
}

export function useActivityPlanDetailViewModel({
  activityPlanParam,
  fetchedPlan,
  formatDuration,
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

  const structure = useMemo(() => {
    const parsed = activityPlanStructureSchemaV3.safeParse(activityPlan?.structure);
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

  const compiled = useMemo(
    () => (structure ? compileActivityPlanV3(structure) : null),
    [structure],
  );

  const authoritativeMetrics = getAuthoritativeActivityPlanMetrics(activityPlan);
  const estimatedDurationSeconds = authoritativeMetrics.estimated_duration ?? null;
  const estimatedDurationMinutes = estimatedDurationSeconds
    ? Math.round(estimatedDurationSeconds / 60)
    : null;
  const durationMinutes =
    estimatedDurationMinutes ?? Math.round((compiled?.explicitTimedDurationSeconds ?? 0) / 60);
  const tss = authoritativeMetrics.estimated_tss ?? null;
  const intensityFactor = authoritativeMetrics.intensity_factor ?? null;
  const isOwnedByUser = activityPlan?.profile_id === profile?.id;
  const detailBadges = activityPlan
    ? [
        compiled?.categories.join(" → ") ||
          activityPlan.categories?.join(" → ") ||
          activityPlan.primary_category ||
          "Other",
        isScheduled ? "Scheduled" : isOwnedByUser ? "My plan" : "Template",
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
    intensityFactor,
    isOwnedByUser,
    routePreview,
    steps,
    tss,
    durationLabel: formatDuration(durationMinutes * 60),
    durationMinutes,
  };
}
