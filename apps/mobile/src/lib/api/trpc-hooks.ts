/**
 * tRPC-based API Layer for Mobile App
 * Replaces the REST API client with type-safe tRPC calls
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../trpc";

// Query keys for cache management
export const queryKeys = {
  activities: {
    all: ["activities"] as const,
    filtered: (params: any) => ["activities", "filtered", params] as const,
    detail: (id: string) => ["activities", "detail", id] as const,
  },
  profile: {
    base: ["profile"] as const,
    stats: (period: number) => ["profile", "stats", period] as const,
    zones: ["profile", "zones"] as const,
  },
  sync: {
    status: ["sync", "status"] as const,
    conflicts: ["sync", "conflicts"] as const,
  },
  analytics: {
    trainingLoad: (params: any) =>
      ["analytics", "training-load", params] as const,
    performanceTrends: (params: any) =>
      ["analytics", "performance-trends", params] as const,
  },
} as const;

// ============================================================================
// ACTIVITY HOOKS
// ============================================================================

export const useActivities = (params?: {
  limit?: number;
  offset?: number;
  activity_type?: string;
  date_range?: {
    start: string;
    end: string;
  };
}) => {
  return useQuery({
    queryKey: queryKeys.activities.filtered(params),
    queryFn: () => trpc.activities.list.query(params || {}),
  });
};

export const useActivity = (id: string) => {
  return useQuery({
    queryKey: queryKeys.activities.detail(id),
    queryFn: () => trpc.activities.get.query({ id }),
    enabled: !!id,
  });
};

export const useCreateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activity: any) => trpc.activities.create.mutate(activity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
    },
  });
};

export const useUpdateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      trpc.activities.update.mutate({ id, data }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
      queryClient.setQueryData(queryKeys.activities.detail(variables.id), data);
    },
  });
};

export const useDeleteActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trpc.activities.delete.mutate({ id }),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
      queryClient.removeQueries({ queryKey: queryKeys.activities.detail(id) });
    },
  });
};

// ============================================================================
// SYNC HOOKS
// ============================================================================

export const useSyncActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activityData: {
      activityId: string;
      startedAt: string;
      liveMetrics: unknown;
      filePath?: string;
    }) => trpc.activities.sync.mutate(activityData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
    },
  });
};

export const useBulkSyncActivities = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activities: Array<{
      activityId: string;
      startedAt: string;
      liveMetrics: unknown;
      filePath?: string;
    }>) => trpc.activities.bulkSync.mutate({ activities }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
    },
  });
};

export const useSyncStatus = () => {
  return useQuery({
    queryKey: queryKeys.sync.status,
    queryFn: () => trpc.sync.status.query(),
    refetchInterval: 30000, // Auto-refresh every 30s
  });
};

export const useSyncConflicts = () => {
  return useQuery({
    queryKey: queryKeys.sync.conflicts,
    queryFn: () => trpc.sync.conflicts.query(),
  });
};

export const useResolveConflict = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conflict: {
      activityId: string;
      resolution: "use_local" | "use_remote" | "merge" | "skip";
      mergeData?: unknown;
    }) => trpc.sync.resolveConflict.mutate(conflict),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.conflicts });
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
    },
  });
};

// ============================================================================
// PROFILE HOOKS
// ============================================================================

export const useProfile = () => {
  return useQuery({
    queryKey: queryKeys.profile.base,
    queryFn: () => trpc.profiles.get.query(),
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: any) => trpc.profiles.update.mutate(updates),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.profile.base, data);
    },
  });
};

export const useTrainingZones = () => {
  return useQuery({
    queryKey: queryKeys.profile.zones,
    queryFn: () => trpc.profiles.getZones.query(),
  });
};

export const useUpdateTrainingZones = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (zones: {
      maxHeartRate?: number;
      restingHeartRate?: number;
      ftpWatts?: number;
      zoneCalculationMethod?: string;
    }) => trpc.profiles.updateZones.mutate(zones),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.zones });
    },
  });
};

// ============================================================================
// ANALYTICS HOOKS
// ============================================================================

export const useProfileStats = (period: number = 30) => {
  return useQuery({
    queryKey: queryKeys.profile.stats(period),
    queryFn: () => trpc.profiles.getStats.query({ period }),
  });
};

export const useTrainingLoadAnalysis = (params?: {
  period?: number;
  projection?: number;
  includeProjection?: boolean;
}) => {
  return useQuery({
    queryKey: queryKeys.analytics.trainingLoad(params),
    queryFn: () => trpc.analytics.trainingLoad.query(params || {}),
  });
};

export const usePerformanceTrends = (params?: {
  period?: number;
  sport?: string;
  metric?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.analytics.performanceTrends(params),
    queryFn: () => trpc.analytics.performanceTrends.query(params || {}),
  });
};

// Re-export types for backward compatibility
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

export interface SyncStatus {
  syncHealth: {
    total: number;
    synced: number;
    pending: number;
    inProgress: number;
    failed: number;
    syncPercentage: number;
  };
  pendingActivities: Array<{
    id: string;
    name: string;
    sport: string;
    startedAt: string;
    syncStatus: string;
    syncError?: string;
    hasLocalFile: boolean;
  }>;
  recommendations: Array<{
    type: "info" | "warning" | "success";
    message: string;
    action: string;
  }>;
  lastChecked: string;
}
