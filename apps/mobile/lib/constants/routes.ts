/**
 * Centralized route constants for the application
 * Use these constants instead of hardcoded strings to avoid typos and ensure consistency
 */

export const ROUTES = {
  // Plan Tab Routes
  PLAN: {
    INDEX: "/(internal)/(tabs)/plan" as const,
    CREATE: "/(internal)/(tabs)/plan/create_activity_plan" as const,
    LIBRARY: "/(internal)/(tabs)/plan/library" as const,
    SCHEDULED: "/(internal)/(tabs)/plan/planned_activities" as const,
    SCHEDULE_ACTIVITY: "/(internal)/(tabs)/plan/create_planned_activity" as const,

    // Training Plan Routes
    TRAINING_PLAN: {
      INDEX: "/(internal)/(tabs)/plan/training-plan" as const,
      CALENDAR: "/(internal)/(tabs)/plan/training-plan/calendar" as const,
      CREATE: "/(internal)/(tabs)/plan/training-plan/create" as const,
      SETTINGS: "/(internal)/(tabs)/plan/training-plan/settings" as const,
    },

    // Dynamic Routes (use with params)
    PLAN_DETAIL: (planId: string) => `/(internal)/(tabs)/plan/${planId}` as const,
    ACTIVITY_DETAIL: (activityId: string) =>
      `/(internal)/(tabs)/plan/planned_activities/${activityId}` as const,
  },

  // Other Tab Routes
  TRENDS: "/(internal)/(tabs)/trends" as const,
  PROFILE: "/(internal)/(tabs)/profile" as const,

  // Activity Recording
  RECORD: "/(internal)/record" as const,
  FOLLOW_ALONG: "/(internal)/follow-along" as const,
} as const;

/**
 * Helper function to build route with params
 * @example
 * buildRoute(ROUTES.PLAN.SCHEDULE_ACTIVITY, { planId: '123' })
 * // Returns: { pathname: '/plan/schedule', params: { planId: '123' } }
 */
export function buildRoute<T extends Record<string, any>>(
  pathname: string,
  params?: T
): { pathname: string; params?: T } {
  return params ? { pathname, params } : { pathname };
}

/**
 * Type-safe route builder for plan details
 */
export function buildPlanRoute(planId: string, action?: 'view' | 'edit' | 'schedule') {
  const pathname = ROUTES.PLAN.PLAN_DETAIL(planId);
  return action ? { pathname, params: { action } } : { pathname };
}

/**
 * Type-safe route builder for activity details
 */
export function buildActivityRoute(activityId: string, action?: 'view' | 'reschedule' | 'delete') {
  const pathname = ROUTES.PLAN.ACTIVITY_DETAIL(activityId);
  return action ? { pathname, params: { action } } : { pathname };
}
