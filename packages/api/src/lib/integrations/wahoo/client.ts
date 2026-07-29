/**
 * Wahoo API Client
 * Handles communication with Wahoo's API for Wahoo plan and workout resources
 */

import { logger } from "../../logger";
import type { WahooActivityType } from "./activity-type-utils";
import { WahooAuthorizationResetRequiredError, WahooReconnectRequiredError } from "./credentials";
import { isWahooTokenLimitRejection } from "./oauth-errors";

const WAHOO_API_BASE = "https://api.wahooligan.com";
const WAHOO_DISCONNECT_TIMEOUT_MS = 5_000;

export interface WahooClientConfig {
  accessToken: string;
  refreshToken?: string;
}

export interface WahooPlanData {
  structure: unknown;
  name: string;
  description: string;
  activityType: WahooActivityType;
  externalId: string; // Your activity_plan_id (from activity_plans table)
}

export interface WahooWorkoutData {
  planId?: number;
  name: string;
  scheduledDate: string; // ISO date string
  externalId: string; // Your event_id (from events table)
  routeId?: number; // Optional route_id to attach to the Wahoo workout resource
  workoutTypeId: number; // Required: Wahoo workout type ID
  durationMinutes: number; // Required: Duration in minutes
}

export interface WahooRouteData {
  file: string; // Data URI containing the encoded route file
  filename: string;
  externalId: string;
  providerUpdatedAt: string;
  name: string;
  description?: string | null;
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
  plan_id: number | null;
  plan_ids: number[];
  workout_token: string;
  workout_summary?: WahooWorkoutSummary | null;
  created_at: string;
  updated_at: string;
}

export type WahooWorkoutTokenLookup = {
  complete: boolean;
  workout: WahooWorkout | null;
};

export interface WahooWorkoutSummary {
  id: number;
  workout_id?: number;
  started_at?: string;
  created_at?: string;
  updated_at?: string;
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
  workout?: {
    id: number;
    name?: string;
    workout_type_id?: number;
  };
  fitness_app_id: number;
  manual: boolean;
  edited: boolean;
}

function isValidWahooWorkout(value: unknown): value is WahooWorkout {
  if (!value || typeof value !== "object") return false;
  const workout = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(workout.id) &&
    typeof workout.name === "string" &&
    typeof workout.starts === "string" &&
    Number.isFinite(workout.minutes) &&
    Number.isSafeInteger(workout.workout_type_id) &&
    typeof workout.workout_token === "string" &&
    typeof workout.created_at === "string" &&
    typeof workout.updated_at === "string"
  );
}

function isValidWahooPlan(value: unknown): value is WahooPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(plan.id) &&
    typeof plan.name === "string" &&
    typeof plan.external_id === "string" &&
    typeof plan.provider_updated_at === "string" &&
    typeof plan.deleted === "boolean"
  );
}

export type WahooWorkoutSummaryListInput = {
  endDate: string;
  page?: number;
  perPage?: number;
  startDate: string;
};

export interface WahooPowerZones {
  ftp?: number | null;
  critical_power?: number | null;
  zones?: unknown;
  updated_at?: string | null;
}

export interface WahooTokenRefreshResult {
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
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

function isValidWahooRoute(value: unknown): value is WahooRoute {
  if (!value || typeof value !== "object") return false;
  const route = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(route.id) &&
    typeof route.name === "string" &&
    typeof route.external_id === "string" &&
    typeof route.provider_updated_at === "string" &&
    typeof route.deleted === "boolean" &&
    Number.isFinite(route.start_lat) &&
    Number.isFinite(route.start_lng) &&
    Number.isFinite(route.distance) &&
    Number.isFinite(route.ascent) &&
    typeof route.updated_at === "string" &&
    typeof route.created_at === "string"
  );
}

function getWahooRouteFormData(routeData: WahooRouteData, includeExternalId: boolean): string {
  const formData = new URLSearchParams();
  formData.append("route[file]", routeData.file);
  formData.append("route[filename]", routeData.filename);
  if (includeExternalId) formData.append("route[external_id]", routeData.externalId);
  formData.append("route[provider_updated_at]", routeData.providerUpdatedAt);
  formData.append("route[name]", routeData.name);
  if (routeData.description !== undefined) {
    formData.append("route[description]", routeData.description ?? "");
  }
  formData.append("route[workout_type_family_id]", routeData.workoutTypeFamilyId.toString());
  formData.append("route[start_lat]", routeData.startLat.toString());
  formData.append("route[start_lng]", routeData.startLng.toString());
  formData.append("route[distance]", routeData.distance.toString());
  formData.append("route[ascent]", routeData.ascent.toString());
  if (routeData.descent !== undefined) {
    formData.append("route[descent]", routeData.descent.toString());
  }
  return formData.toString();
}

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
  async createPlan(planData: WahooPlanData, signal?: AbortSignal): Promise<WahooPlan> {
    // Convert plan structure to Wahoo's format (will be done by converter)
    const planJson = planData.structure;

    const formData = new FormData();
    formData.append(
      "plan[file]",
      new Blob([JSON.stringify(planJson)], { type: "application/json" }),
      "plan.json",
    );
    formData.append("plan[external_id]", planData.externalId);
    formData.append("plan[provider_updated_at]", new Date().toISOString());

    const response = await this.makeRequest<WahooPlan>("/v1/plans", {
      method: "POST",
      body: formData,
      ...(signal ? { signal } : {}),
    });

    if (!isValidWahooPlan(response)) throw new Error("Invalid Wahoo plan response");
    return response;
  }

  async getPlans(externalId?: string, signal?: AbortSignal): Promise<WahooPlan[]> {
    const params = externalId ? `?external_id=${encodeURIComponent(externalId)}` : "";
    const plans = await this.makeRequest<unknown>(`/v1/plans${params}`, {
      method: "GET",
      ...(signal ? { signal } : {}),
    });
    if (!Array.isArray(plans) || plans.some((plan) => !isValidWahooPlan(plan))) {
      throw new Error("Invalid Wahoo plans response");
    }
    return plans;
  }

  async deletePlan(planId: string | number, signal?: AbortSignal): Promise<{ success: boolean }> {
    await this.makeRequest(`/v1/plans/${planId}`, {
      method: "DELETE",
      ...(signal ? { signal } : {}),
    });

    return { success: true };
  }

  /**
   * Create a Wahoo workout calendar entry that references a plan
   * Store the returned workout_id - this is what you track
   * @returns Full WahooWorkout object (with id, name, starts, etc.)
   */
  async createWorkout(workoutData: WahooWorkoutData, signal?: AbortSignal): Promise<WahooWorkout> {
    const workout: {
      external_id: string;
      minutes: number;
      name: string;
      plan_id?: number;
      route_id?: number;
      starts: string;
      workout_token: string;
      workout_type_id: number;
    } = {
      name: workoutData.name,
      starts: workoutData.scheduledDate,
      external_id: workoutData.externalId,
      workout_token: workoutData.externalId,
      workout_type_id: workoutData.workoutTypeId,
      minutes: workoutData.durationMinutes,
    };

    if (workoutData.planId !== undefined) {
      workout.plan_id = workoutData.planId;
    }

    if (workoutData.routeId !== undefined) {
      workout.route_id = workoutData.routeId;
    }

    logger.info("Wahoo API request", { operation: "create_workout", provider: "wahoo" });

    const response = await this.makeRequest<WahooWorkout>("/v1/workouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workout }),
      ...(signal ? { signal } : {}),
    });

    logger.info("Wahoo API request completed", {
      operation: "create_workout",
      outcome: "success",
      provider: "wahoo",
    });

    if (!isValidWahooWorkout(response)) throw new Error("Invalid Wahoo workout response");
    return response;
  }

  /**
   * Update a Wahoo workout calendar entry (metadata only: name, date)
   * Use this when the user changes its name or scheduled date
   */
  async updateWorkout(
    workoutId: string,
    updates: {
      name?: string;
      scheduledDate?: string;
      planId?: number;
    },
    signal?: AbortSignal,
  ): Promise<{ success: boolean }> {
    const workout: { name?: string; plan_id?: number; starts?: string } = {};

    if (updates.name) workout.name = updates.name;
    if (updates.scheduledDate) workout.starts = updates.scheduledDate;
    if (updates.planId !== undefined) workout.plan_id = updates.planId;

    await this.makeRequest(`/v1/workouts/${workoutId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workout }),
      ...(signal ? { signal } : {}),
    });

    return { success: true };
  }

  /**
   * Delete a Wahoo workout calendar entry
   * Note: This does NOT delete the plan from the library
   */
  async deleteWorkout(workoutId: string, signal?: AbortSignal): Promise<{ success: boolean }> {
    await this.makeRequest(`/v1/workouts/${workoutId}`, {
      method: "DELETE",
      ...(signal ? { signal } : {}),
    });

    return { success: true };
  }

  /**
   * Get Wahoo workout details (for debugging/verification)
   */
  async getWorkout(workoutId: string, signal?: AbortSignal): Promise<WahooWorkout> {
    const workout = await this.makeRequest<unknown>(`/v1/workouts/${workoutId}`, {
      method: "GET",
      ...(signal ? { signal } : {}),
    });
    if (!isValidWahooWorkout(workout)) throw new Error("Invalid Wahoo workout response");
    return workout;
  }

  /**
   * Wahoo has no token filter or idempotent planned-activity resource create. Scan a deliberately
   * bounded page set and make incompleteness explicit so callers never create
   * after an inconclusive reconciliation read.
   */
  async findWorkoutByToken(input: {
    token: string;
    signal?: AbortSignal;
    maxPages?: number;
    perPage?: number;
  }): Promise<WahooWorkoutTokenLookup> {
    const maxPages = Math.min(Math.max(1, Math.floor(input.maxPages ?? 4)), 10);
    const perPage = Math.min(Math.max(1, Math.floor(input.perPage ?? 50)), 100);
    let matchedWorkout: WahooWorkout | null = null;
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await this.makeRequest<{
        page?: unknown;
        total?: unknown;
        workouts?: unknown;
      }>(`/v1/workouts?page=${page}&per_page=${perPage}`, {
        method: "GET",
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (
        !Array.isArray(response.workouts) ||
        !Number.isSafeInteger(response.page) ||
        !Number.isSafeInteger(response.total) ||
        response.page !== page ||
        (response.total as number) < 0
      ) {
        throw new Error("Invalid Wahoo workouts response");
      }
      for (const workout of response.workouts) {
        if (!isValidWahooWorkout(workout)) throw new Error("Invalid Wahoo workout response");
        if (workout.workout_token !== input.token) continue;
        if (matchedWorkout && matchedWorkout.id !== workout.id) {
          throw new Error(
            "Multiple Wahoo planned-activity resources matched the planned activity token",
          );
        }
        matchedWorkout = workout;
      }
      if (page * perPage >= (response.total as number)) {
        return { complete: true, workout: matchedWorkout };
      }
    }
    return { complete: false, workout: matchedWorkout };
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
   * Fetch Wahoo power zones for onboarding FTP enrichment.
   */
  async getPowerZones(): Promise<WahooPowerZones> {
    return await this.makeRequest<WahooPowerZones>("/v1/power_zones", {
      method: "GET",
    });
  }

  /**
   * Fetch a completed Wahoo workout summary (for webhook processing)
   */
  async getWorkoutSummary(workoutSummaryId: string): Promise<WahooWorkoutSummary> {
    return await this.makeRequest<WahooWorkoutSummary>(
      `/v1/workouts/${workoutSummaryId}/workout_summary`,
      {
        method: "GET",
      },
    );
  }

  /**
   * Fetch completed Wahoo workout summaries for a bounded history window.
   */
  async listWorkoutSummaries(input: WahooWorkoutSummaryListInput): Promise<{
    page: number;
    reachedStartBoundary: boolean;
    sourceCount: number;
    summaries: WahooWorkoutSummary[];
    total: number | null;
  }> {
    const params = new URLSearchParams({
      page: String(input.page ?? 1),
      per_page: String(input.perPage ?? 30),
    });
    const response = await this.makeRequest<{
      page?: unknown;
      total?: unknown;
      workouts?: unknown;
    }>(`/v1/workouts?${params.toString()}`, {
      method: "GET",
    });

    const start = new Date(input.startDate).getTime();
    const end = new Date(input.endDate).getTime();

    if (!Array.isArray(response.workouts)) throw new Error("Invalid Wahoo workouts response");
    if (
      typeof response.page !== "number" ||
      !Number.isSafeInteger(response.page) ||
      response.page < 1
    ) {
      throw new Error("Invalid Wahoo workouts page response");
    }
    if (
      typeof response.total !== "number" ||
      !Number.isSafeInteger(response.total) ||
      response.total < 0
    ) {
      throw new Error("Invalid Wahoo workouts total response");
    }
    const page = response.page;
    const total = response.total;
    const workouts = response.workouts as WahooWorkout[];
    const rawStarts = workouts.map((workout) => Date.parse(workout.starts));
    if (rawStarts.some((starts) => !Number.isFinite(starts))) {
      throw new Error("Invalid Wahoo workout starts response");
    }
    const reachedStartBoundary = rawStarts.some((starts) => starts < start);
    const summaries = workouts
      .filter((workout) => {
        const starts = new Date(workout.starts).getTime();
        return Number.isFinite(starts) && starts >= start && starts <= end;
      })
      .flatMap((workout) => {
        if (!workout.workout_summary) return [];
        return [
          {
            ...workout.workout_summary,
            started_at: workout.starts,
            workout_id: workout.id,
            workout: {
              id: workout.id,
              name: workout.name,
              workout_type_id: workout.workout_type_id,
            },
          },
        ];
      });
    return { page, reachedStartBoundary, sourceCount: workouts.length, summaries, total };
  }

  /**
   * Create a route in Wahoo's library
   * Routes contain GPS data and can be attached to Wahoo workout resources
   */
  async createRoute(routeData: WahooRouteData, signal?: AbortSignal): Promise<WahooRoute> {
    const response = await this.makeRequest<unknown>("/v1/routes", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: getWahooRouteFormData(routeData, true),
      ...(signal ? { signal } : {}),
    });
    if (!isValidWahooRoute(response)) throw new Error("Wahoo route response was invalid");
    return response;
  }

  async updateRoute(
    routeId: string,
    routeData: WahooRouteData,
    signal?: AbortSignal,
  ): Promise<WahooRoute> {
    const response = await this.makeRequest<unknown>(`/v1/routes/${routeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: getWahooRouteFormData(routeData, false),
      ...(signal ? { signal } : {}),
    });
    if (!isValidWahooRoute(response)) throw new Error("Wahoo route response was invalid");
    return response;
  }

  /**
   * Get a route by ID
   */
  async getRoute(routeId: string, signal?: AbortSignal): Promise<WahooRoute> {
    const response = await this.makeRequest<unknown>(`/v1/routes/${routeId}`, {
      method: "GET",
      ...(signal ? { signal } : {}),
    });
    if (!isValidWahooRoute(response)) throw new Error("Wahoo route response was invalid");
    return response;
  }

  /**
   * Get all routes, optionally filtered by external_id
   */
  async getRoutes(externalId?: string, signal?: AbortSignal): Promise<WahooRoute[]> {
    const params = externalId ? `?external_id=${encodeURIComponent(externalId)}` : "";
    const response = await this.makeRequest<unknown>(`/v1/routes${params}`, {
      method: "GET",
      ...(signal ? { signal } : {}),
    });
    if (!Array.isArray(response) || !response.every(isValidWahooRoute)) {
      throw new Error("Wahoo route list response was invalid");
    }
    return response;
  }

  /**
   * Delete a route from Wahoo's library
   */
  async deleteRoute(routeId: string, signal?: AbortSignal): Promise<{ success: boolean }> {
    await this.makeRequest(`/v1/routes/${routeId}`, {
      method: "DELETE",
      ...(signal ? { signal } : {}),
    });

    return { success: true };
  }

  /** Revoke the bearer grant. Wahoo documents this as DELETE /v1/permissions. */
  async disconnect(): Promise<{ success: boolean }> {
    await this.makeRequest("/v1/permissions", {
      method: "DELETE",
      signal: AbortSignal.timeout(WAHOO_DISCONNECT_TIMEOUT_MS),
    });
    return { success: true };
  }

  /**
   * Make authenticated request to Wahoo API with error handling
   */
  private async makeRequest<T = unknown>(endpoint: string, options: RequestInit): Promise<T> {
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
        return { success: true } as T;
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
  private async handleErrorResponse(response: Response): Promise<WahooApiError> {
    let errorCode = `HTTP_${response.status}`;

    try {
      const errorData = (await response.json()) as { code?: unknown };
      if (typeof errorData.code === "string") {
        errorCode = errorData.code;
      }
    } catch {
      // Response wasn't JSON; retain the status-based details.
    }

    if (response.status === 401) {
      return new WahooReconnectRequiredError();
    }

    const errorMessage = `Wahoo API error: ${response.status} ${response.statusText}`;
    const error: WahooApiError = new Error(errorMessage);
    error.status = response.status;
    error.code = errorCode;

    logger.warn("Wahoo API request failed", {
      operation: "request",
      outcome: "failure",
      provider: "wahoo",
      status: response.status,
    });

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
        const delay = 2 ** i * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error("Max retries exceeded");
  }
}

export async function refreshWahooAccessToken(
  refreshToken: string,
): Promise<WahooTokenRefreshResult> {
  const clientId = process.env.WAHOO_CLIENT_ID;
  const clientSecret = process.env.WAHOO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Wahoo OAuth configuration is incomplete");

  const response = await fetch(`${WAHOO_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    let errorCode = `HTTP_${response.status}`;
    let errorDescription: string | undefined;
    try {
      const errorData = (await response.json()) as {
        error?: unknown;
        error_description?: unknown;
      };
      if (typeof errorData.error === "string") errorCode = errorData.error;
      if (typeof errorData.error_description === "string") {
        errorDescription = errorData.error_description;
      }
    } catch {
      // Retain status-based details without exposing the response body.
    }

    if (isWahooTokenLimitRejection(errorCode, errorDescription)) {
      throw new WahooAuthorizationResetRequiredError();
    }

    if (response.status === 401 || errorCode.toLowerCase() === "invalid_grant") {
      throw new WahooReconnectRequiredError();
    }

    const error: WahooApiError = new Error(
      `Wahoo token refresh failed: ${response.status} ${response.statusText}`,
    );
    error.status = response.status;
    error.code = errorCode;
    throw error;
  }

  const data = (await response.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };

  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("Wahoo token refresh response did not include an access token");
  }

  const expiresIn =
    typeof data.expires_in === "number"
      ? data.expires_in
      : typeof data.expires_in === "string" && /^\d+$/.test(data.expires_in)
        ? Number(data.expires_in)
        : null;

  return {
    accessToken: data.access_token,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : refreshToken,
  };
}

/**
 * Wahoo revokes the previous access token only after the refreshed token completes an
 * authenticated API request; refreshing alone or downloading a CDN file does not count.
 */
export async function activateWahooAccessToken(accessToken: string): Promise<void> {
  await new WahooClient({ accessToken }).getUserProfile();
}

/**
 * Create a Wahoo client instance
 */
export function createWahooClient(config: WahooClientConfig): WahooClient {
  return new WahooClient(config);
}
