/**
 * Centralized route constants for the application
 * Use these constants instead of hardcoded strings to avoid typos and ensure consistency
 */

export const ROUTES = {
  // Plan Tab Routes
  PLAN: {
    INDEX: "/plan" as const,
    CREATE: "/plan/create_activity_plan" as const,
    LIBRARY: "/plan/library" as const,
    SCHEDULED: "/plan/planned_activities" as const,
    SCHEDULE_ACTIVITY: "/plan/create_planned_activity" as const,

    // Training Plan Routes
    TRAINING_PLAN: {
      INDEX: "/plan/training-plan" as const,
      CALENDAR: "/plan/training-plan/calendar" as const,
      CREATE: "/plan/training-plan/create" as const,
      SETTINGS: "/plan/training-plan/settings" as const,
    },

    // Create Activity Plan Routes
    CREATE_ACTIVITY_PLAN: {
      INDEX: "/plan/create_activity_plan" as const,
      STRUCTURE: "/plan/create_activity_plan/structure" as const,
      REPEAT: "/plan/create_activity_plan/structure/repeat" as const,
    },

    // Dynamic Routes (use with params)
    PLAN_DETAIL: (planId: string) => `/plan/${planId}` as const,
    ACTIVITY_DETAIL: (activityId: string) =>
      `/plan/planned_activities/${activityId}` as const,
  },

  // Other Tab Routes
  TRENDS: "/trends" as const,
  PROFILE: "/profile" as const,

  // Activity Recording
  RECORD: "/record" as const,
  FOLLOW_ALONG: "/follow-along" as const,
} as const;

/**
 * Helper function to build route with params
 * @example
 * buildRoute(ROUTES.PLAN.SCHEDULE_ACTIVITY, { planId: '123' })
 * // Returns: { pathname: '/plan/schedule', params: { planId: '123' } }
 */
export function buildRoute<T extends Record<string, any>>(
  pathname: string,
  params?: T,
): { pathname: string; params?: T } {
  return params ? { pathname, params } : { pathname };
}

/**
 * Type-safe route builder for plan details
 */
export function buildPlanRoute(
  planId: string,
  action?: "view" | "edit" | "schedule",
) {
  const pathname = ROUTES.PLAN.PLAN_DETAIL(planId);
  return action ? { pathname, params: { action } } : { pathname };
}

/**
 * Type-safe route builder for activity details
 */
export function buildActivityRoute(
  activityId: string,
  action?: "view" | "reschedule" | "delete",
) {
  const pathname = ROUTES.PLAN.ACTIVITY_DETAIL(activityId);
  return action ? { pathname, params: { action } } : { pathname };
}
