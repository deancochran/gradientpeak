import type { ActivityPlanMetricsLike } from "@repo/core/activity-plan";

export {
  type ActivityPlanAuthoritativeMetrics as ActivityPlanMetricFields,
  getAuthoritativeActivityPlanMetrics,
} from "@repo/core/activity-plan";

export type ActivityPlanRouteFields = {
  distance?: number | null;
  ascent?: number | null;
  descent?: number | null;
};

type ActivityPlanWithRouteLike = ActivityPlanMetricsLike & {
  route?: ActivityPlanRouteFields | null;
};

export function getActivityPlanRoute(plan: ActivityPlanWithRouteLike | null | undefined) {
  return {
    distance: plan?.route?.distance,
    ascent: plan?.route?.ascent,
    descent: plan?.route?.descent,
  };
}
