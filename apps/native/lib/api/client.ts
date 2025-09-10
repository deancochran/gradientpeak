import type { SelectActivity, SelectProfile } from "@repo/drizzle/schemas";
import { apiConfig } from "../config/api";
import { supabase } from "../supabase";

// Request/Response interceptor types
interface RequestInterceptor {
  (
    config: RequestInit & { url: string },
  ): Promise<RequestInit & { url: string }>;
}

interface ResponseInterceptor {
  onFulfilled?: (response: Response) => Response | Promise<Response>;
  onRejected?: (error: unknown) => unknown;
}

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

class ApiClient {
  private baseUrl: string;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor() {
    this.baseUrl = apiConfig.get().baseUrl;
    this.setupDefaultInterceptors();
    if (apiConfig.shouldLog()) {
      console.log("🌐 API Client initialized with base URL:", this.baseUrl);
    }
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Setup default interceptors for auth token refresh and error handling
   */
  private setupDefaultInterceptors(): void {
    // Request interceptor for auth token validation
    this.addRequestInterceptor(async (config) => {
      try {
        // Check if token is expired and refresh if needed
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error && error.message?.includes("JWT expired")) {
          console.log("🔄 Refreshing expired auth token...");
          await supabase.auth.refreshSession();
        }

        return config;
      } catch (error) {
        console.warn("⚠️ Auth interceptor warning:", error);
        return config; // Continue with request even if refresh fails
      }
    });

    // Response interceptor for automatic retry on auth failures
    this.addResponseInterceptor({
      onRejected: async (error) => {
        if (error.status === 401) {
          console.log("🔄 401 error detected, attempting token refresh...");
          try {
            await supabase.auth.refreshSession();
            // Return the error to let the caller handle retry
            return Promise.reject({ ...error, shouldRetry: true });
          } catch (refreshError) {
            console.error("❌ Token refresh failed:", refreshError);
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      },
    });
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
    retryCount: number = 0,
  ): Promise<ApiResponse<T>> {
    const maxRetries = apiConfig.getRetryConfig().attempts;

    try {
      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}/api/mobile${endpoint}`;
      let config: RequestInit & { url: string } = {
        ...options,
        url,
        headers: {
          ...headers,
          ...options.headers,
        } as Record<string, string>,
      };

      // Apply request interceptors
      for (const interceptor of this.requestInterceptors) {
        config = await interceptor(config);
      }

      if (apiConfig.shouldLog()) {
        console.log("🌐 API Request:", options.method || "GET", config.url);
      }

      let response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body,
        cache: config.cache,
        credentials: config.credentials,
        integrity: config.integrity,
        keepalive: config.keepalive,
        mode: config.mode,
        redirect: config.redirect,
        referrer: config.referrer,
        referrerPolicy: config.referrerPolicy,
        signal: config.signal,
      });

      // Apply response interceptors (fulfilled)
      for (const interceptor of this.responseInterceptors) {
        if (interceptor.onFulfilled) {
          response = await interceptor.onFulfilled(response);
        }
      }

      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        console.error("❌ Failed to parse API response:", responseText);
        throw new Error("Invalid response format");
      }

      if (!response.ok) {
        const error = {
          status: response.status,
          message: data.error || `HTTP ${response.status}`,
          details: data.details,
        };

        // Apply response interceptors (rejected)
        let interceptorHandledError = error;
        for (const interceptor of this.responseInterceptors) {
          if (interceptor.onRejected) {
            try {
              interceptorHandledError = await interceptor.onRejected(error);
            } catch (interceptorError: unknown) {
              // If interceptor suggests retry and we haven't exceeded max retries
              if (
                (interceptorError as { shouldRetry?: boolean }).shouldRetry &&
                retryCount < maxRetries &&
                response.status === 401
              ) {
                console.log(
                  `🔄 Retrying request (attempt ${retryCount + 1}/${maxRetries})`,
                );
                await this.sleep(apiConfig.getRetryConfig().delay);
                return this.request(endpoint, options, retryCount + 1);
              }
            }
          }
        }

        console.error("❌ API Error:", response.status, data);
        return {
          success: false,
          error: interceptorHandledError.message,
          details: interceptorHandledError.details,
        };
      }

      console.log("✅ API Success:", options.method || "GET", endpoint);

      return {
        success: true,
        data: data.data || data,
      };
    } catch (error) {
      console.error("❌ API Request failed:", error);

      // Retry on network errors (but not auth errors)
      if (retryCount < maxRetries && this.isRetryableError(error)) {
        console.log(
          `🔄 Retrying request due to network error (attempt ${retryCount + 1}/${maxRetries})`,
        );
        await this.sleep(apiConfig.getRetryConfig().delay * (retryCount + 1));
        return this.request(endpoint, options, retryCount + 1);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  /**
   * Check if error is retryable (network issues, not auth/validation errors)
   */
  private isRetryableError(error: unknown): boolean {
    if (!error) return false;

    // Network-related errors that should be retried
    const retryableMessages = [
      "network request failed",
      "fetch failed",
      "timeout",
      "connection refused",
      "network error",
    ];

    const errorMessage = (error.message || error.toString()).toLowerCase();
    return retryableMessages.some((msg) => errorMessage.includes(msg));
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Authentication endpoints
  async verifyAuth(): Promise<ApiResponse<{ valid: boolean; user: unknown }>> {
    return this.request("/auth/verify");
  }

  async refreshToken(refreshToken: string): Promise<ApiResponse<unknown>> {
    return this.request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  // SelectActivity endpoints
  async getActivities(params?: {
    limit?: number;
    offset?: number;
    sport?: string;
    startDate?: string;
    endDate?: string;
  ): Promise<ApiResponse<{ activities: SelectActivity[]; pagination: unknown }>> {
    const searchParams = new URLSearchParams();

    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.sport) searchParams.set("sport", params.sport);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);

    const query = searchParams.toString();
    return this.request(`/activities${query ? `?${query}` : ""}`);
  }

  async getActivity(id: string): Promise<ApiResponse<SelectActivity>> {
    return this.request(`/activities/${id}`);
  }

  async createActivity(
    activity: Omit<SelectActivity, "syncStatus">,
  ): Promise<ApiResponse<SelectActivity>> {
    return this.request("/activities", {
      method: "POST",
      body: JSON.stringify(activity),
    });
  }

  async updateActivity(
    id: string,
    updates: Partial<SelectActivity>,
  ): Promise<ApiResponse<SelectActivity>> {
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
    liveMetrics: unknown;
    filePath?: string;
  }): Promise<ApiResponse<unknown>> {
    return this.request("/activities/sync", {
      method: "POST",
      body: JSON.stringify(activityData),
    });
  }

  async bulkSyncActivities(
    activities: Array<{
      activityId: string;
      startedAt: string;
      liveMetrics: unknown;
      filePath?: string;
    }>,
  ): Promise<ApiResponse<unknown>> {
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
    mergeData?: unknown;
  }): Promise<ApiResponse<unknown>> {
    return this.request("/sync/conflicts", {
      method: "POST",
      body: JSON.stringify(conflict),
    });
  }

  async getConflicts(): Promise<
    ApiResponse<{ conflicts: unknown[]; hasConflicts: boolean }>
  > {
    return this.request("/sync/conflicts");
  }

  // Profile endpoints
  async getProfile(): Promise<ApiResponse<SelectProfile>> {
    return this.request("/profile");
  }

  async updateProfile(
    updates: Partial<SelectProfile>,
  ): Promise<ApiResponse<SelectProfile>> {
    return this.request("/profile", {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  // Training zones endpoints
  async getTrainingZones(): Promise<
    ApiResponse<{
      heartRateZones: unknown;
      powerZones: unknown;
      profile: unknown;
    }>
  > {
    return this.request("/profile/zones");
  }

  async updateTrainingZones(zones: {
    maxHeartRate?: number;
    restingHeartRate?: number;
    ftpWatts?: number;
    zoneCalculationMethod?: string;
  }): Promise<ApiResponse<unknown>> {
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
  }): Promise<ApiResponse<unknown>> {
    return this.request("/profile/zones", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // Analytics endpoints
  async getProfileStats(period: number = 30): Promise<ApiResponse<unknown>> {
    return this.request(`/profile/stats?period=${period}`);
  }

  async getTrainingLoadAnalysis(params?: {
    period?: number;
    projection?: number;
    includeProjection?: boolean;
  }): Promise<ApiResponse<unknown>> {
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
  }): Promise<ApiResponse<unknown>> {
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
