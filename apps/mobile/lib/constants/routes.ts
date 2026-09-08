/**
 * Centralized route constants for the application
 * Use these constants instead of hardcoded strings to avoid typos and ensure consistency
 *
 * NOTE: All standard routes now use flat structure with descriptive names
 */

export const ROUTES = {
  // Plan Tab Routes
  PLAN: {
    INDEX: "/(internal)/(tabs)/plan" as const,
    OVERVIEW: {
      pathname: "/(internal)/(tabs)/plan",
      params: { view: "overview" },
    } as const,
    ANALYSIS: (params: {
      anchorDate: string;
      goalId: string;
      metric: "threshold" | "load" | "fitness" | "fatigue" | "form";
      range: "6w" | "3m" | "6m" | "1y";
      view: "progress" | "training";
    }) => ({ pathname: "/plan-analysis", params }) as const,
    CALENDAR: {
      pathname: "/(internal)/(tabs)/plan",
      params: { view: "calendar" },
    } as const,
    CREATE: "/create-activity-plan" as const,
    PLANNING_LEDGER: (params: { anchorDate: string; period: "day" | "week" }) =>
      ({ pathname: "/planning-ledger", params }) as const,
    AGENDA_CREATE: (date: string) => ({ pathname: "/agenda-create", params: { date } }) as const,
    EVENT_CREATE: (date: string) =>
      ({ pathname: "/event-detail", params: { mode: "create", date } }) as const,

    // Training Plan Routes
    TRAINING_PLAN: {
      LIST: "/training-plans-list" as const,
      DETAIL: (planId: string) => `/training-plan-detail?id=${planId}` as const,
      CREATE: "/training-plan-create" as const,
      EDIT: "/training-plan-edit" as const,
    },
    TRAINING_PREFERENCES: "/training-preferences" as const,

    // Create Activity Plan Routes
    CREATE_ACTIVITY_PLAN: {
      INDEX: "/create-activity-plan" as const,
    },
    ACTIVITY_PLAN_LIST: "/activity-plans-list" as const,

    // Dynamic Routes (use with params)
    PLAN_DETAIL: (planId: string) => `/activity-plan-detail?id=${planId}` as const,
    ACTIVITY_DETAIL: (activityId: string) => `/event-detail?id=${activityId}` as const,
    EVENT_DETAIL: (eventId: string) => `/event-detail?id=${eventId}` as const,
    EVENT_UPDATE: (eventId: string) => `/event-detail-update?id=${eventId}` as const,
    GOAL_DETAIL: (goalId: string) => `/goal-detail?id=${goalId}` as const,
  },

  // Activities Routes
  ACTIVITIES: {
    LIST: "/activities-list" as const,
    IMPORT: "/activity-import" as const,
    DETAIL: (activityId: string) => `/activity-detail?id=${activityId}` as const,
  },

  THRESHOLDS: {
    OVERVIEW: "/thresholds" as const,
  },

  GOALS: {
    LIST: "/goals-list" as const,
    CREATE: "/goal-create" as const,
    DETAIL: (goalId: string) => `/goal-detail?id=${goalId}` as const,
    EDIT: (goalId: string) => `/goal-edit?id=${goalId}` as const,
  },

  // Routes Routes
  ROUTES: {
    LIST: "/routes-list" as const,
    DETAIL: (routeId: string) => `/route-detail?id=${routeId}` as const,
    EDIT: (routeId: string) => `/route-edit?id=${routeId}` as const,
    UPLOAD: "/route-upload" as const,
  },

  // Other Tab Routes
  SEARCH: "/(internal)/(tabs)/discover" as const,
  DISCOVER: "/(internal)/(tabs)/discover" as const,
  COMMUNITY: "/(internal)/(tabs)/groups" as const,
  MY_GROUPS: "/my-groups" as const,
  CALENDAR: {
    pathname: "/(internal)/(tabs)/plan",
    params: { view: "calendar" },
  } as const,

  // Profile
  ME: "/me" as const,
  PROFILE_TAB: "/me" as const,
  INBOX: "/inbox" as const,
  USER_DETAIL: (userId: string) => `/user/${userId}` as const,
  PROFILE_EDIT: "/profile-edit" as const,
  INTEGRATIONS: "/integrations" as const,
  NOTIFICATIONS: "/notifications" as const,
  MESSAGES: "/messages" as const,
  MESSAGE_NEW: "/messages/new" as const,

  // Activity Recording
  RECORD: "/record" as const,
} as const;

/**
 * Helper function to build route with params
 * @example
 * buildRoute(ROUTES.PLAN.SCHEDULE_ACTIVITY, { planId: '123' })
 * // Returns: { pathname: '/plan/schedule', params: { planId: '123' } }
 */
export function buildRoute<T extends Record<string, unknown>>(
  pathname: string,
  params?: T,
): { pathname: string; params?: T } {
  return params ? { pathname, params } : { pathname };
}

/**
 * Type-safe route builder for plan details
 */
export function buildPlanRoute(planId: string, action?: "view" | "edit" | "schedule") {
  return action
    ? { pathname: "/activity-plan-detail", params: { planId, action } }
    : { pathname: "/activity-plan-detail", params: { planId } };
}

/**
 * Type-safe route builder for activity details
 */
export function buildActivityRoute(activityId: string, action?: "view" | "reschedule" | "delete") {
  const pathname = ROUTES.PLAN.ACTIVITY_DETAIL(activityId);
  return action ? { pathname, params: { action } } : { pathname };
}
