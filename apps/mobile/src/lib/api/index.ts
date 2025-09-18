/**
 * Simplified API Layer using TanStack Query
 * Eliminates most of the manual API client code
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";

// Simple config
const config = {
  baseUrl: (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  ),
  enableLogging: process.env.EXPO_PUBLIC_ENABLE_API_LOGGING === "true",
};

// Basic types
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

// Simple fetch wrapper with auth
const apiFetch = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Authentication required");
  }

  const url = `${config.baseUrl}/api/mobile${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  if (config.enableLogging) {
    console.log("🌐", options.method || "GET", endpoint);
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    // Let TanStack Query handle retries on 401
    if (response.status === 401) {
      await supabase.auth.refreshSession();
    }

    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.data || result;
};

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
  sport?: string;
  startDate?: string;
  endDate?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.activities.filtered(params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) searchParams.set(key, value.toString());
        });
      }
      const query = searchParams.toString();
      return apiFetch<{ activities: SelectActivity[]; pagination: any }>(
        `/activities${query ? `?${query}` : ""}`,
      );
    },
  });
};

export const useActivity = (id: string) => {
  return useQuery({
    queryKey: queryKeys.activities.detail(id),
    queryFn: () => apiFetch<SelectActivity>(`/activities/${id}`),
    enabled: !!id,
  });
};

export const useCreateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activity: Omit<SelectActivity, "syncStatus">) =>
      apiFetch<SelectActivity>("/activities", {
        method: "POST",
        body: JSON.stringify(activity),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
    },
  });
};

export const useUpdateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<SelectActivity>;
    }) =>
      apiFetch<SelectActivity>(`/activities/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
      queryClient.setQueryData(queryKeys.activities.detail(variables.id), data);
    },
  });
};

export const useDeleteActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean; id: string }>(`/activities/${id}`, {
        method: "DELETE",
      }),
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
    }) =>
      apiFetch("/activities/sync", {
        method: "POST",
        body: JSON.stringify(activityData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
    },
  });
};

export const useBulkSyncActivities = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      activities: Array<{
        activityId: string;
        startedAt: string;
        liveMetrics: unknown;
        filePath?: string;
      }>,
    ) =>
      apiFetch("/activities/sync?bulk=true", {
        method: "POST",
        body: JSON.stringify({ activities }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
    },
  });
};

export const useSyncStatus = () => {
  return useQuery({
    queryKey: queryKeys.sync.status,
    queryFn: () => apiFetch<SyncStatus>("/sync/status"),
    refetchInterval: 30000, // Auto-refresh every 30s
  });
};

export const useSyncConflicts = () => {
  return useQuery({
    queryKey: queryKeys.sync.conflicts,
    queryFn: () =>
      apiFetch<{ conflicts: unknown[]; hasConflicts: boolean }>(
        "/sync/conflicts",
      ),
  });
};

export const useResolveConflict = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conflict: {
      activityId: string;
      resolution: "use_local" | "use_remote" | "merge" | "skip";
      mergeData?: unknown;
    }) =>
      apiFetch("/sync/conflicts", {
        method: "POST",
        body: JSON.stringify(conflict),
      }),
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
    queryFn: () => apiFetch<SelectProfile>("/profile"),
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<SelectProfile>) =>
      apiFetch<SelectProfile>("/profile", {
        method: "PUT",
        body: JSON.stringify(updates),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.profile.base, data);
    },
  });
};

export const useTrainingZones = () => {
  return useQuery({
    queryKey: queryKeys.profile.zones,
    queryFn: () =>
      apiFetch<{
        heartRateZones: unknown;
        powerZones: unknown;
        profile: unknown;
      }>("/profile/zones"),
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
    }) =>
      apiFetch("/profile/zones", {
        method: "PUT",
        body: JSON.stringify(zones),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.zones });
    },
  });
};

export const useRecalculateZones = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      type: "heart_rate" | "power" | "both";
      maxHeartRate?: number;
      restingHeartRate?: number;
      ftpWatts?: number;
    }) =>
      apiFetch("/profile/zones", {
        method: "POST",
        body: JSON.stringify(params),
      }),
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
    queryFn: () => apiFetch(`/profile/stats?period=${period}`),
  });
};

export const useTrainingLoadAnalysis = (params?: {
  period?: number;
  projection?: number;
  includeProjection?: boolean;
}) => {
  return useQuery({
    queryKey: queryKeys.analytics.trainingLoad(params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) searchParams.set(key, value.toString());
        });
      }
      const query = searchParams.toString();
      return apiFetch(`/analytics/training-load${query ? `?${query}` : ""}`);
    },
  });
};

export const usePerformanceTrends = (params?: {
  period?: number;
  sport?: string;
  metric?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.analytics.performanceTrends(params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) searchParams.set(key, value.toString());
        });
      }
      const query = searchParams.toString();
      return apiFetch(
        `/analytics/performance-trends${query ? `?${query}` : ""}`,
      );
    },
  });
};
