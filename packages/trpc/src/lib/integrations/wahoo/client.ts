/**
 * Wahoo API Client
 * Handles communication with Wahoo's API for plans and workouts
 */

import type { ActivityType } from "./activity-type-utils";

const WAHOO_API_BASE = "https://api.wahooligan.com";

export interface WahooClientConfig {
  accessToken: string;
  refreshToken?: string;
}

export interface WahooPlanData {
  structure: Record<string, any>;
  name: string;
  description: string;
  activityType: ActivityType;
  externalId: string; // Your planned_activity_id or activity_plan_id
}

export interface WahooWorkoutData {
  planId: number;
  name: string;
  scheduledDate: string; // ISO date string
  externalId: string; // Your planned_activity_id
  routeId?: number; // Optional route_id to attach to workout
}

export interface WahooRouteData {
  file: string; // Base64 encoded GPX file
  filename: string;
  externalId: string;
  providerUpdatedAt: string;
  name: string;
  description?: string;
  workoutTypeFamilyId: number;
  startLat: number;
  startLng: number;
  distance: number; // meters
  ascent: number; // meters
  descent?: number; // meters
}

export interface WahooApiError extends Error {
  status?: number;
  code?: string;
}

// Wahoo API Response Types (based on official API documentation)

export interface WahooUser {
  id: number;
  email: string;
  first: string;
  last: string;
  height: number; // meters
  weight: number; // kilograms
  birth: string; // YYYY-MM-DD
  gender: number; // 0=Male, 1=Female, 2=Other, 3=Prefer not to say
  created_at: string;
  updated_at: string;
}

export interface WahooPlan {
  id: number;
  name: string;
  description: string;
  external_id: string;
  file: {
    url: string;
  };
  provider_updated_at: string;
  workout_type_family_id: number;
  workout_type_location_id: number;
  deleted: boolean;
}

export interface WahooWorkout {
  id: number;
  name: string;
  starts: string; // ISO8601
  minutes: number;
  workout_type_id: number;
  plan_id: number;
  plan_ids: number[];
  workout_token: string;
  created_at: string;
  updated_at: string;
}

export interface WahooWorkoutSummary {
  id: number;
  workout_id: number;
  ascent_accum: number;
  cadence_avg: number;
  calories_accum: number;
  distance_accum: number;
  duration_active_accum: number;
  duration_total_accum: number;
  heart_rate_avg: number;
  power_avg: number;
  power_bike_np_last: number;
  power_bike_tss_last: number;
  speed_avg: number;
  work_accum: number;
  file: {
    url: string;
  };
  fitness_app_id: number;
  manual: boolean;
  edited: boolean;
}

export interface WahooRoute {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  file: {
    url: string;
  };
  workout_type_family_id: number;
  external_id: string;
  provider_updated_at: string;
  deleted: boolean;
  start_lat: number;
  start_lng: number;
  distance: number;
  ascent: number;
  descent: number;
  updated_at: string;
  created_at: string;
}

// Re-export supportsRoutes from activity-type-utils for backwards compatibility
export { supportsRoutes } from "./activity-type-utils";

export class WahooClient {
  private accessToken: string;
  private refreshToken?: string;

  constructor(config: WahooClientConfig) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
  }

  /**
   * Create a plan in Wahoo's library
   * Plans are immutable templates - create once and use immediately
   */
  async createPlan(planData: WahooPlanData): Promise<WahooPlan> {
    // Convert plan structure to Wahoo's format (will be done by converter)
    const planJson = planData.structure;
    const base64Plan = Buffer.from(JSON.stringify(planJson)).toString("base64");

    const formData = new URLSearchParams();
    formData.append("plan[file]", base64Plan);
    formData.append("plan[filename]", "plan.json");
    formData.append("plan[external_id]", planData.externalId);
    formData.append("plan[provider_updated_at]", new Date().toISOString());

    const response = await this.makeRequest<WahooPlan>("/v1/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    return response;
  }

  /**
   * Create a workout (calendar entry) that references a plan
   * Store the returned workout_id - this is what you track
   * @returns Full WahooWorkout object (with id, name, starts, etc.)
   */
  async createWorkout(workoutData: WahooWorkoutData): Promise<WahooWorkout> {
    const body: any = {
      workout: {
        plan_id: workoutData.planId,
        name: workoutData.name,
        starts: workoutData.scheduledDate,
        external_id: workoutData.externalId,
      },
    };

    // Add route_id if provided
    if (workoutData.routeId) {
      body.workout.route_id = workoutData.routeId;
    }

    const response = await this.makeRequest<WahooWorkout>("/v1/workouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return response;
  }

  /**
   * Update a workout (metadata only: name, date)
   * Use this when user changes workout name or scheduled date
   */
  async updateWorkout(
    workoutId: string,
    updates: {
      name?: string;
      scheduledDate?: string;
      planId?: number;
    },
  ): Promise<{ success: boolean }> {
    const body: Record<string, any> = { workout: {} };

    if (updates.name) body.workout.name = updates.name;
    if (updates.scheduledDate) body.workout.starts = updates.scheduledDate;
    if (updates.planId) body.workout.plan_id = updates.planId;

    await this.makeRequest(`/v1/workouts/${workoutId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return { success: true };
  }

  /**
   * Delete a workout from Wahoo's calendar
   * Note: This does NOT delete the plan from the library
   */
  async deleteWorkout(workoutId: string): Promise<{ success: boolean }> {
    await this.makeRequest(`/v1/workouts/${workoutId}`, {
      method: "DELETE",
    });

    return { success: true };
  }

  /**
   * Get workout details (for debugging/verification)
   */
  async getWorkout(workoutId: string): Promise<WahooWorkout> {
    return await this.makeRequest<WahooWorkout>(`/v1/workouts/${workoutId}`, {
      method: "GET",
    });
  }

  /**
   * Fetch user profile (to get external_user_id during OAuth)
   */
  async getUserProfile(): Promise<WahooUser> {
    return await this.makeRequest<WahooUser>("/v1/user", {
      method: "GET",
    });
  }

  /**
   * Fetch completed workout summary (for webhook processing)
   */
  async getWorkoutSummary(
    workoutSummaryId: string,
  ): Promise<WahooWorkoutSummary> {
    return await this.makeRequest<WahooWorkoutSummary>(
      `/v1/workout_summaries/${workoutSummaryId}`,
      {
        method: "GET",
      },
    );
  }

  /**
   * Create a route in Wahoo's library
   * Routes contain GPS data and can be attached to workouts
   */
  async createRoute(routeData: WahooRouteData): Promise<WahooRoute> {
    const formData = new URLSearchParams();
    formData.append("route[file]", routeData.file);
    formData.append("route[filename]", routeData.filename);
    formData.append("route[external_id]", routeData.externalId);
    formData.append("route[provider_updated_at]", routeData.providerUpdatedAt);
    formData.append("route[name]", routeData.name);
    if (routeData.description) {
      formData.append("route[description]", routeData.description);
    }
    formData.append(
      "route[workout_type_family_id]",
      routeData.workoutTypeFamilyId.toString(),
    );
    formData.append("route[start_lat]", routeData.startLat.toString());
    formData.append("route[start_lng]", routeData.startLng.toString());
    formData.append("route[distance]", routeData.distance.toString());
    formData.append("route[ascent]", routeData.ascent.toString());
    if (routeData.descent !== undefined) {
      formData.append("route[descent]", routeData.descent.toString());
    }

    const response = await this.makeRequest<WahooRoute>("/v1/routes", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    return response;
  }

  /**
   * Get a route by ID
   */
  async getRoute(routeId: string): Promise<WahooRoute> {
    return await this.makeRequest<WahooRoute>(`/v1/routes/${routeId}`, {
      method: "GET",
    });
  }

  /**
   * Get all routes, optionally filtered by external_id
   */
  async getRoutes(externalId?: string): Promise<WahooRoute[]> {
    const params = externalId
      ? `?external_id=${encodeURIComponent(externalId)}`
      : "";
    return await this.makeRequest<WahooRoute[]>(`/v1/routes${params}`, {
      method: "GET",
    });
  }

  /**
   * Delete a route from Wahoo's library
   */
  async deleteRoute(routeId: string): Promise<{ success: boolean }> {
    await this.makeRequest(`/v1/routes/${routeId}`, {
      method: "DELETE",
    });

    return { success: true };
  }

  /**
   * Make authenticated request to Wahoo API with error handling
   */
  private async makeRequest<T = any>(
    endpoint: string,
    options: RequestInit,
  ): Promise<T> {
    const url = `${WAHOO_API_BASE}${endpoint}`;

    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle different response types
      if (!response.ok) {
        const error = await this.handleErrorResponse(response);
        throw error;
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return { success: true };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        throw error; // Re-throw our custom errors
      }
      // Network or other errors
      const apiError: WahooApiError = new Error(
        `Wahoo API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw apiError;
    }
  }

  /**
   * Handle API error responses
   */
  private async handleErrorResponse(
    response: Response,
  ): Promise<WahooApiError> {
    let errorMessage = `Wahoo API error: ${response.status} ${response.statusText}`;
    let errorCode = `HTTP_${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
      if (errorData.error_description) {
        errorMessage += `: ${errorData.error_description}`;
      }
      if (errorData.code) {
        errorCode = errorData.code;
      }
    } catch {
      // Response wasn't JSON, use default message
    }

    const error: WahooApiError = new Error(errorMessage);
    error.status = response.status;
    error.code = errorCode;

    return error;
  }

  /**
   * Retry logic with exponential backoff
   */
  static async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        const wahooError = error as WahooApiError;

        // Don't retry on client errors (4xx) except 429
        if (
          wahooError.status &&
          wahooError.status >= 400 &&
          wahooError.status < 500 &&
          wahooError.status !== 429
        ) {
          throw error;
        }

        // Last attempt, throw error
        if (i === maxRetries - 1) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, i) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error("Max retries exceeded");
  }
}

/**
 * Create a Wahoo client instance
 */
export function createWahooClient(config: WahooClientConfig): WahooClient {
  return new WahooClient(config);
}
