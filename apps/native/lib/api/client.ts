import { apiConfig } from "../config/api";
import { supabase } from "../supabase";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

export interface Activity {
  id: string;
  name: string;
  sport: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  distance?: number;
  elevationGain?: number;
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  maxPower?: number;
  avgCadence?: number;
  tss?: number;
  notes?: string;
  syncStatus: "local_only" | "syncing" | "synced" | "sync_failed";
  localStoragePath?: string;
  cloudStoragePath?: string;
}

export interface Profile {
  id: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  heightCm?: number;
  weightKg?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  ftpWatts?: number;
  vo2Max?: number;
  preferredUnits?: "metric" | "imperial";
  trainingZonePreference?: "heart_rate" | "power" | "pace";
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

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = apiConfig.get().baseUrl;
    if (apiConfig.shouldLog()) {
      console.log("🌐 API Client initialized with base URL:", this.baseUrl);
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.access_token) {
        throw new Error("No valid session found");
      }

      return {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      };
    } catch (error) {
      console.error("❌ Failed to get auth headers:", error);
      throw new Error("Authentication required");
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    try {
      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}/api/mobile${endpoint}`;

      if (apiConfig.shouldLog()) {
        console.log("🌐 API Request:", options.method || "GET", url);
      }

      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("❌ Failed to parse API response:", responseText);
        throw new Error("Invalid response format");
      }

      if (!response.ok) {
        console.error("❌ API Error:", response.status, data);
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
          details: data.details,
        };
      }

      console.log("✅ API Success:", options.method || "GET", endpoint);

      return {
        success: true,
        data: data.data || data,
      };
    } catch (error) {
      console.error("❌ API Request failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  // Authentication endpoints
  async verifyAuth(): Promise<ApiResponse<{ valid: boolean; user: any }>> {
    return this.request("/auth/verify");
  }

  async refreshToken(refreshToken: string): Promise<ApiResponse<any>> {
    return this.request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  // Activity endpoints
  async getActivities(params?: {
    limit?: number;
    offset?: number;
    sport?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<{ activities: Activity[]; pagination: any }>> {
    const searchParams = new URLSearchParams();

    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.sport) searchParams.set("sport", params.sport);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);

    const query = searchParams.toString();
    return this.request(`/activities${query ? `?${query}` : ""}`);
  }

  async getActivity(id: string): Promise<ApiResponse<Activity>> {
    return this.request(`/activities/${id}`);
  }

  async createActivity(
    activity: Omit<Activity, "syncStatus">,
  ): Promise<ApiResponse<Activity>> {
    return this.request("/activities", {
      method: "POST",
      body: JSON.stringify(activity),
    });
  }

  async updateActivity(
    id: string,
    updates: Partial<Activity>,
  ): Promise<ApiResponse<Activity>> {
    return this.request(`/activities/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteActivity(
    id: string,
  ): Promise<ApiResponse<{ success: boolean; id: string }>> {
    return this.request(`/activities/${id}`, {
      method: "DELETE",
    });
  }

  // Sync endpoints
  async syncActivity(activityData: {
    activityId: string;
    startedAt: string;
    liveMetrics: any;
    filePath?: string;
  }): Promise<ApiResponse<any>> {
    return this.request("/activities/sync", {
      method: "POST",
      body: JSON.stringify(activityData),
    });
  }

  async bulkSyncActivities(
    activities: Array<{
      activityId: string;
      startedAt: string;
      liveMetrics: any;
      filePath?: string;
    }>,
  ): Promise<ApiResponse<any>> {
    return this.request("/activities/sync?bulk=true", {
      method: "POST",
      body: JSON.stringify({ activities }),
    });
  }

  async getSyncStatus(): Promise<ApiResponse<SyncStatus>> {
    return this.request("/sync/status");
  }

  async resolveConflict(conflict: {
    activityId: string;
    resolution: "use_local" | "use_remote" | "merge" | "skip";
    mergeData?: any;
  }): Promise<ApiResponse<any>> {
    return this.request("/sync/conflicts", {
      method: "POST",
      body: JSON.stringify(conflict),
    });
  }

  async getConflicts(): Promise<
    ApiResponse<{ conflicts: any[]; hasConflicts: boolean }>
  > {
    return this.request("/sync/conflicts");
  }

  // Profile endpoints
  async getProfile(): Promise<ApiResponse<Profile>> {
    return this.request("/profile");
  }

  async updateProfile(
    updates: Partial<Profile>,
  ): Promise<ApiResponse<Profile>> {
    return this.request("/profile", {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  // Training zones endpoints
  async getTrainingZones(): Promise<
    ApiResponse<{
      heartRateZones: any;
      powerZones: any;
      profile: any;
    }>
  > {
    return this.request("/profile/zones");
  }

  async updateTrainingZones(zones: {
    maxHeartRate?: number;
    restingHeartRate?: number;
    ftpWatts?: number;
    zoneCalculationMethod?: string;
  }): Promise<ApiResponse<any>> {
    return this.request("/profile/zones", {
      method: "PUT",
      body: JSON.stringify(zones),
    });
  }

  async recalculateZones(params: {
    type: "heart_rate" | "power" | "both";
    maxHeartRate?: number;
    restingHeartRate?: number;
    ftpWatts?: number;
  }): Promise<ApiResponse<any>> {
    return this.request("/profile/zones", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // Analytics endpoints
  async getProfileStats(period: number = 30): Promise<ApiResponse<any>> {
    return this.request(`/profile/stats?period=${period}`);
  }

  async getTrainingLoadAnalysis(params?: {
    period?: number;
    projection?: number;
    includeProjection?: boolean;
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();

    if (params?.period) searchParams.set("period", params.period.toString());
    if (params?.projection)
      searchParams.set("projection", params.projection.toString());
    if (params?.includeProjection)
      searchParams.set("includeProjection", "true");

    const query = searchParams.toString();
    return this.request(`/analytics/training-load${query ? `?${query}` : ""}`);
  }

  async getPerformanceTrends(params?: {
    period?: number;
    sport?: string;
    metric?: string;
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();

    if (params?.period) searchParams.set("period", params.period.toString());
    if (params?.sport) searchParams.set("sport", params.sport);
    if (params?.metric) searchParams.set("metric", params.metric);

    const query = searchParams.toString();
    return this.request(
      `/analytics/performance-trends${query ? `?${query}` : ""}`,
    );
  }
}

export const apiClient = new ApiClient();
export default apiClient;
