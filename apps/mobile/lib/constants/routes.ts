/**
 * Centralized route constants for the application
 * Use these constants instead of hardcoded strings to avoid typos and ensure consistency
 *
 * NOTE: All standard routes now use flat structure with descriptive names
 */

export const ROUTES = {
  // Plan Tab Routes
  PLAN: {
    INDEX: "/plan" as const,
    CREATE: "/create-activity-plan" as const,
    LIBRARY: "/plan-library" as const,
    SCHEDULED: "/scheduled-activities-list" as const,

    // Training Plan Routes
    TRAINING_PLAN: {
      INDEX: "/training-plan" as const,
      CREATE: "/training-plan-create" as const,
      METHOD_SELECTOR: "/training-plan-method-selector" as const,
      WIZARD: "/training-plan-wizard" as const,
      REVIEW: "/training-plan-review" as const,
      SETTINGS: "/training-plan-settings" as const,
      LIST: "/training-plans-list" as const,
      ADJUST: "/training-plan-adjust" as const,
    },

    // Create Activity Plan Routes
    CREATE_ACTIVITY_PLAN: {
      INDEX: "/create-activity-plan" as const,
      STRUCTURE: "/create-activity-plan-structure" as const,
      REPEAT: "/create-activity-plan-repeat" as const,
    },

    // Dynamic Routes (use with params)
    PLAN_DETAIL: (planId: string) => `/plan/${planId}` as const,
    ACTIVITY_DETAIL: (activityId: string) =>
      `/scheduled-activity-detail?id=${activityId}` as const,
  },

  // Activities Routes
  ACTIVITIES: {
    LIST: "/activities-list" as const,
    DETAIL: (activityId: string) =>
      `/activity-detail?id=${activityId}` as const,
  },

  // Routes Routes
  ROUTES: {
    LIST: "/routes-list" as const,
    DETAIL: (routeId: string) => `/route-detail?id=${routeId}` as const,
    UPLOAD: "/route-upload" as const,
  },

  // Other Tab Routes
  DISCOVER: "/(internal)/(tabs)/discover" as const,
  LIBRARY: "/(internal)/(tabs)/library" as const,

  // Settings & Profile
  SETTINGS: "/settings" as const,
  PROFILE: "/profile" as const,
  PROFILE_EDIT: "/profile-edit" as const,
  INTEGRATIONS: "/integrations" as const,
  NOTIFICATIONS: "/notifications" as const,
  PERMISSIONS: "/permissions" as const,

  // Activity Recording
  RECORD: "/record" as const,

  // Workout Management
  WORKOUTS_REORDER: "/workouts-reorder" as const,
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
