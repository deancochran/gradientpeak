import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import superjson from "superjson";

/**
 * Creates a configured QueryClient optimized for mobile React Native apps.
 *
 * Configuration focuses on:
 * - Aggressive caching to reduce network requests
 * - Smart retry logic with exponential backoff
 * - Mobile-specific refetch policies
 * - Proper garbage collection to prevent memory leaks
 *
 * @returns Configured QueryClient instance
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache data for 5 minutes before considering it stale
        // This reduces unnecessary refetches for slowly-changing data
        staleTime: 5 * 60 * 1000, // 5 minutes

        // Keep unused data in cache for 10 minutes before garbage collection
        // Longer than staleTime to allow quick navigation back to cached screens
        gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)

        // Retry failed queries up to 3 times with exponential backoff
        // Mobile networks can be flaky, so retries are important
        retry: 3,

        // Exponential backoff: 1s, 2s, 4s (capped at 30s)
        // Gives temporary network issues time to resolve
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

        // Don't refetch on window focus for mobile apps
        // Mobile apps don't have traditional "window focus" behavior
        // and this can cause excessive refetches when switching apps
        refetchOnWindowFocus: false,

        // Do refetch when network reconnects
        // Essential for mobile apps that go offline frequently
        refetchOnReconnect: true,

        // Only run queries when online
        // Prevents unnecessary retry attempts when device is offline
        networkMode: "online",

        // Don't refetch on component mount if data is fresh
        // Reduces unnecessary network requests during navigation
        refetchOnMount: false,

        // Throw errors to error boundaries instead of returning error state
        // This ensures our ErrorBoundary components catch query errors
        throwOnError: false,

        // Enable structural sharing to optimize re-renders
        // When new data is deeply equal to old data, React won't re-render
        structuralSharing: true,
      },

      mutations: {
        // Retry mutations once in case of network issues
        // But not too many times since mutations have side effects
        retry: 1,

        // Shorter retry delay for mutations (1 second)
        retryDelay: 1000,

        // Only attempt mutations when online
        networkMode: "online",

        // Throw errors to error boundaries
        throwOnError: false,
      },

      dehydrate: {
        // Don't serialize data for now (could be enabled for SSR)
        // serializeData: superjson.serialize,

        // Include pending queries in dehydration
        // Useful for server-side rendering and prefetching
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",

        // Don't redact errors in production
        // Next.js handles error redaction automatically
        shouldRedactErrors: () => false,
      },

      hydrate: {
        // Deserialize data using superjson for complex types
        deserializeData: superjson.deserialize,
      },
    },
  });
}

/**
 * Query key factory for consistent query key generation.
 * Use these to ensure query keys are consistent across the app.
 *
 * @example
 * const { data } = trpc.activities.list.useQuery(
 *   { limit: 10 },
 *   { queryKey: queryKeys.activities.list({ limit: 10 }) }
 * );
 */
export const queryKeys = {
  // Activity-related query keys
  activities: {
    all: ["activities"] as const,
    lists: () => [...queryKeys.activities.all, "list"] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.activities.lists(), filters] as const,
    details: () => [...queryKeys.activities.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.activities.details(), id] as const,
  },

  // Training plan query keys
  trainingPlans: {
    all: ["trainingPlans"] as const,
    lists: () => [...queryKeys.trainingPlans.all, "list"] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.trainingPlans.lists(), filters] as const,
    details: () => [...queryKeys.trainingPlans.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.trainingPlans.details(), id] as const,
    status: () => [...queryKeys.trainingPlans.all, "status"] as const,
    weeklySummary: (planId: string) =>
      [...queryKeys.trainingPlans.all, "weeklySummary", planId] as const,
    curve: (planId: string, type: "actual" | "ideal") =>
      [...queryKeys.trainingPlans.all, "curve", planId, type] as const,
  },

  // Planned activities query keys
  plannedActivities: {
    all: ["plannedActivities"] as const,
    lists: () => [...queryKeys.plannedActivities.all, "list"] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.plannedActivities.lists(), filters] as const,
    details: () => [...queryKeys.plannedActivities.all, "detail"] as const,
    detail: (id: string) =>
      [...queryKeys.plannedActivities.details(), id] as const,
    weekCount: () => [...queryKeys.plannedActivities.all, "weekCount"] as const,
  },

  // Profile query keys
  profile: {
    all: ["profile"] as const,
    current: () => [...queryKeys.profile.all, "current"] as const,
  },

  // Home dashboard query keys
  home: {
    all: ["home"] as const,
    dashboard: (filters?: Record<string, unknown>) =>
      [...queryKeys.home.all, "dashboard", filters] as const,
  },

  // Trends query keys
  trends: {
    all: () => ["trends"] as const,
  },
} as const;

/**
 * Helper function to invalidate specific queries after mutations.
 * Use this in mutation onSuccess callbacks for granular cache invalidation.
 *
 * @example
 * const mutation = trpc.activities.create.useMutation({
 *   onSuccess: () => {
 *     invalidateQueries(queryClient, queryKeys.activities.all);
 *   }
 * });
 */
export function invalidateQueries(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
) {
  return queryClient.invalidateQueries({ queryKey });
}

/**
 * Helper function to optimistically update query data.
 * Use this in mutation onMutate callbacks for instant UI updates.
 *
 * @example
 * const mutation = trpc.activities.update.useMutation({
 *   onMutate: async (variables) => {
 *     await updateQueryData(
 *       queryClient,
 *       queryKeys.activities.detail(variables.id),
 *       (old) => ({ ...old, ...variables })
 *     );
 *   }
 * });
 */
export function updateQueryData<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (old: T | undefined) => T,
) {
  return queryClient.setQueryData<T>(queryKey, updater);
}
