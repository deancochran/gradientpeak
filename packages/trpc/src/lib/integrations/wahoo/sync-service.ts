/**
 * Wahoo Sync Service
 * Orchestrates syncing planned activities to Wahoo
 */

import type { ActivityPlanStructureV2 } from "@repo/core";
import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toActivityType, toWahooWorkoutTypeId } from "./activity-type-utils";
import { createWahooClient, supportsRoutes } from "./client";
import {
  calculateWorkoutDuration,
  convertToWahooPlan,
  isActivityTypeSupportedByWahoo,
  validateWahooCompatibility,
} from "./plan-converter";
import {
  extractStartCoordinates,
  getWorkoutTypeFamilyForRoute,
  prepareGPXForWahoo,
  validateRouteForWahoo,
  type RouteFileData,
} from "./route-converter";

type SyncAction = "created" | "updated" | "recreated" | "no_change";

export interface SyncResult {
  success: boolean;
  action: SyncAction;
  workoutId?: string;
  warnings?: string[];
  error?: string;
}

export class WahooSyncService {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Sync a planned activity to Wahoo
   * Handles both new syncs and updates to existing syncs
   */
  async syncPlannedActivity(
    plannedActivityId: string,
    profileId: string,
  ): Promise<SyncResult> {
    try {
      // 1. Fetch planned activity with all related data
      const { data: planned, error: plannedError } = await this.supabase
        .from("planned_activities")
        .select(
          `
          id,
          scheduled_date,
          activity_plan:activity_plans (
            id,
            name,
            description,
            activity_category,
            activity_location,
            structure,
            updated_at,
            route_id
          )
        `,
        )
        .eq("id", plannedActivityId)
        .eq("profile_id", profileId)
        .single();

      if (plannedError || !planned) {
        return {
          success: false,
          action: "no_change",
          error: "Planned activity not found",
        };
      }

      // 2. Fetch user's profile for FTP and threshold HR
      const { data: profile } = await this.supabase
        .from("profiles")
        .select("ftp, threshold_hr")
        .eq("id", profileId)
        .single();

      // 3. Fetch Wahoo integration
      const { data: integration, error: integrationError } = await this.supabase
        .from("integrations")
        .select("access_token, refresh_token")
        .eq("profile_id", profileId)
        .eq("provider", "wahoo")
        .single();

      if (integrationError || !integration) {
        return {
          success: false,
          action: "no_change",
          error:
            "Wahoo integration not found. Please connect your Wahoo account.",
        };
      }

      // 4. Convert activity category + location to activity type
      if (!planned.activity_plan) {
        return {
          success: false,
          action: "no_change",
          error: "Activity plan not found for this planned activity.",
        };
      }

      const activityType = toActivityType(
        planned.activity_plan.activity_category,
        planned.activity_plan.activity_location,
      );

      if (!isActivityTypeSupportedByWahoo(activityType)) {
        return {
          success: false,
          action: "no_change",
          error: `Activity type '${activityType}' is not supported by Wahoo. Only cycling (outdoor_bike, indoor_bike_trainer) and running (outdoor_run, indoor_treadmill) activities can be synced to Wahoo.`,
        };
      }

      // 4b. Fetch route data if route_id is present
      let routeData: RouteFileData | null = null;
      let gpxContent: string | null = null;
      const routeId = planned.activity_plan.route_id;

      if (routeId) {
        const { data: route, error: routeError } = await this.supabase
          .from("activity_routes")
          .select(
            `
            id,
            name,
            description,
            file_path,
            total_distance,
            total_ascent,
            total_descent,
            activity_category
          `,
          )
          .eq("id", routeId)
          .eq("profile_id", profileId)
          .single();

        if (!routeError && route) {
          // Load GPX file from storage
          const { data: fileData, error: storageError } =
            await this.supabase.storage
              .from("routes")
              .download(route.file_path);

          if (!storageError && fileData) {
            try {
              gpxContent = await fileData.text();

              // Extract start coordinates from GPX
              const startCoords = extractStartCoordinates(gpxContent);

              routeData = {
                filePath: route.file_path,
                name: route.name,
                description: route.description ?? undefined,
                activityType: toActivityType(
                  route.activity_category,
                  "outdoor",
                ),
                totalDistance: route.total_distance,
                totalAscent: route.total_ascent ?? undefined,
                totalDescent: route.total_descent ?? undefined,
                startLat: startCoords?.latitude,
                startLng: startCoords?.longitude,
              };
            } catch (error) {
              console.warn("Failed to load route file:", error);
              // Continue without route
            }
          }
        }
      }

      // 5. Check if already synced
      const { data: existingSync } = await this.supabase
        .from("synced_planned_activities")
        .select("id, external_id, updated_at")
        .eq("planned_activity_id", plannedActivityId)
        .eq("provider", "wahoo")
        .single();

      const wahooClient = createWahooClient({
        accessToken: integration.access_token,
        refreshToken: integration.refresh_token || undefined,
      });

      // 6. Validate compatibility
      const structure = planned.activity_plan
        .structure as ActivityPlanStructureV2;
      const validation = validateWahooCompatibility(structure);

      if (!validation.compatible) {
        return {
          success: false,
          action: "no_change",
          error: "Workout structure is not compatible with Wahoo",
          warnings: validation.warnings,
        };
      }

      // 7. Determine sync action
      if (!existingSync) {
        // New sync - create plan and workout
        return await this.createNewSync(
          planned,
          structure,
          profile,
          wahooClient,
          profileId,
          activityType,
          validation.warnings,
          routeData,
          gpxContent,
        );
      } else {
        // Update existing sync
        return await this.updateExistingSync(
          planned,
          existingSync,
          structure,
          profile,
          wahooClient,
          profileId,
          activityType,
          validation.warnings,
        );
      }
    } catch (error) {
      console.error("Wahoo sync error:", error);
      return {
        success: false,
        action: "no_change",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during sync",
      };
    }
  }

  /**
   * Create a new sync (first time syncing this planned activity)
   */
  private async createNewSync(
    planned: any,
    structure: ActivityPlanStructureV2,
    profile: any,
    wahooClient: any,
    profileId: string,
    activityType: string,
    warnings?: string[],
    routeData?: RouteFileData | null,
    gpxContent?: string | null,
  ): Promise<SyncResult> {
    // Sync route first if present
    let wahooRouteId: number | undefined;
    if (routeData && gpxContent && supportsRoutes(activityType as any)) {
      try {
        // Validate route for Wahoo
        const validation = validateRouteForWahoo(routeData);
        if (!validation.valid) {
          return {
            success: false,
            action: "no_change",
            error: `Route validation failed: ${validation.errors.join(", ")}`,
            warnings: validation.warnings,
          };
        }

        // Check if we have start coordinates
        if (!routeData.startLat || !routeData.startLng) {
          return {
            success: false,
            action: "no_change",
            error: "Route has no starting coordinates",
          };
        }

        // Prepare GPX file for Wahoo (base64 encode)
        const base64Gpx = prepareGPXForWahoo(gpxContent);

        // Create route in Wahoo
        const wahooRoute = await wahooClient.createRoute({
          file: base64Gpx,
          filename: `${routeData.name}.gpx`,
          externalId: routeData.filePath,
          providerUpdatedAt: new Date().toISOString(),
          name: routeData.name,
          description: routeData.description,
          workoutTypeFamilyId: getWorkoutTypeFamilyForRoute(
            routeData.activityType,
          ),
          startLat: routeData.startLat,
          startLng: routeData.startLng,
          distance: routeData.totalDistance,
          ascent: routeData.totalAscent || 0,
          descent: routeData.totalDescent || 0,
        });

        wahooRouteId = wahooRoute.id;
        warnings = [...(warnings || []), ...validation.warnings];
      } catch (error) {
        console.error("Failed to sync route to Wahoo:", error);
        // Continue without route - workout can still be created
        warnings = [
          ...(warnings || []),
          "Route sync failed, workout created without route",
        ];
      }
    }

    // Convert to Wahoo format
    const wahooPlan = convertToWahooPlan(structure, {
      activityType: activityType as any,
      name: planned.activity_plan.name,
      description: planned.activity_plan.description,
      ftp: profile?.ftp || undefined,
      threshold_hr: profile?.threshold_hr || undefined,
    });

    // Create plan in Wahoo's library
    console.log(
      `[Wahoo Sync] Creating plan for "${planned.activity_plan.name}"`,
    );
    const plan = await wahooClient.createPlan({
      structure: wahooPlan,
      name: planned.activity_plan.name,
      description: planned.activity_plan.description,
      activityType: activityType as any,
      externalId: planned.activity_plan.id,
    });
    console.log(`[Wahoo Sync] Plan created with ID: ${plan.id}`);

    // Get workout type ID and duration
    const workoutTypeId = toWahooWorkoutTypeId(activityType as any);
    if (workoutTypeId === null) {
      return {
        success: false,
        action: "no_change",
        error: `Unable to map activity type '${activityType}' to Wahoo workout type`,
      };
    }

    const durationSeconds = calculateWorkoutDuration(structure);
    const durationMinutes = Math.ceil(durationSeconds / 60);

    const scheduledDate = new Date(planned.scheduled_date);
    const today = new Date();
    const daysUntilWorkout = Math.ceil(
      (scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    console.log(`[Wahoo Sync] Workout details:`, {
      name: planned.activity_plan.name,
      scheduledDate: scheduledDate.toISOString(),
      daysUntilWorkout,
      workoutTypeId,
      durationMinutes,
      planId: plan.id,
      routeId: wahooRouteId,
    });

    // Warn if workout is outside Wahoo's 6-day window
    if (daysUntilWorkout > 6) {
      console.warn(
        `[Wahoo Sync] WARNING: Workout scheduled ${daysUntilWorkout} days from now. Wahoo only displays workouts scheduled within 6 days on devices.`,
      );
      warnings = [
        ...(warnings || []),
        `Workout scheduled ${daysUntilWorkout} days from now. It will only appear on your device when within 6 days of the scheduled date.`,
      ];
    }

    // Create workout on Wahoo's calendar with optional route
    const workout = await wahooClient.createWorkout({
      planId: plan.id,
      name: planned.activity_plan.name,
      scheduledDate: scheduledDate.toISOString(),
      externalId: planned.id,
      routeId: wahooRouteId,
      workoutTypeId: workoutTypeId,
      durationMinutes: durationMinutes,
    });

    console.log(
      `[Wahoo Sync] Workout created successfully with ID: ${workout.id}`,
    );

    // Store sync record (only workout_id, not plan_id)
    await this.supabase.from("synced_planned_activities").insert({
      profile_id: profileId,
      planned_activity_id: planned.id, // This is correct - links to planned_activities table
      provider: "wahoo",
      external_id: workout.id.toString(),
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return {
      success: true,
      action: "created",
      workoutId: workout.id.toString(),
      warnings,
    };
  }

  /**
   * Update an existing sync
   * Determines if metadata only changed or if structure changed
   */
  private async updateExistingSync(
    planned: any,
    existingSync: any,
    structure: ActivityPlanStructureV2,
    profile: any,
    wahooClient: any,
    profileId: string,
    activityType: string,
    warnings?: string[],
  ): Promise<SyncResult> {
    // Determine what changed by comparing timestamps or hashing structure
    const activityPlanUpdatedAt = new Date(
      planned.activity_plan.updated_at,
    ).getTime();
    const syncUpdatedAt = new Date(existingSync.updated_at).getTime();
    const structureChanged = activityPlanUpdatedAt > syncUpdatedAt;

    if (!structureChanged) {
      // Only metadata might have changed (name or date)
      // Update the workout
      await wahooClient.updateWorkout(existingSync.external_id, {
        name: planned.activity_plan.name,
        scheduledDate: new Date(planned.scheduled_date).toISOString(),
      });

      // Update sync record timestamp
      await this.supabase
        .from("synced_planned_activities")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existingSync.id);

      return {
        success: true,
        action: "updated",
        workoutId: existingSync.external_id,
        warnings,
      };
    } else {
      // Structure changed - need to recreate
      // Convert to Wahoo format
      const wahooPlan = convertToWahooPlan(structure, {
        activityType: activityType as any,
        name: planned.activity_plan.name,
        description: planned.activity_plan.description,
        ftp: profile?.ftp || undefined,
        threshold_hr: profile?.threshold_hr || undefined,
      });

      // Create new plan
      const plan = await wahooClient.createPlan({
        structure: wahooPlan,
        name: planned.activity_plan.name,
        description: planned.activity_plan.description,
        activityType: activityType as any,
        externalId: planned.activity_plan.id,
      });

      // Get workout type ID and duration
      const workoutTypeId = toWahooWorkoutTypeId(activityType as any);
      if (workoutTypeId === null) {
        return {
          success: false,
          action: "no_change",
          error: `Unable to map activity type '${activityType}' to Wahoo workout type`,
        };
      }

      const durationSeconds = calculateWorkoutDuration(structure);
      const durationMinutes = Math.ceil(durationSeconds / 60);

      // Create new workout
      const workout = await wahooClient.createWorkout({
        planId: plan.id,
        name: planned.activity_plan.name,
        scheduledDate: new Date(planned.scheduled_date).toISOString(),
        externalId: planned.id,
        workoutTypeId: workoutTypeId,
        durationMinutes: durationMinutes,
      });

      // Delete old workout
      try {
        await wahooClient.deleteWorkout(existingSync.external_id);
      } catch (error) {
        // Log but don't fail if old workout can't be deleted
        console.warn("Failed to delete old Wahoo workout:", error);
      }

      // Update sync record with new workout ID
      await this.supabase
        .from("synced_planned_activities")
        .update({
          external_id: workout.id.toString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSync.id);

      return {
        success: true,
        action: "recreated",
        workoutId: workout.id.toString(),
        warnings,
      };
    }
  }

  /**
   * Remove sync - delete workout from Wahoo and remove sync record
   */
  async unsyncPlannedActivity(
    plannedActivityId: string,
    profileId: string,
  ): Promise<SyncResult> {
    try {
      // 1. Fetch sync record
      const { data: sync, error: syncError } = await this.supabase
        .from("synced_planned_activities")
        .select("id, external_id")
        .eq("planned_activity_id", plannedActivityId)
        .eq("provider", "wahoo")
        .eq("profile_id", profileId)
        .single();

      if (syncError || !sync) {
        return {
          success: false,
          action: "no_change",
          error: "Sync record not found",
        };
      }

      // 2. Fetch Wahoo integration
      const { data: integration, error: integrationError } = await this.supabase
        .from("integrations")
        .select("access_token, refresh_token")
        .eq("profile_id", profileId)
        .eq("provider", "wahoo")
        .single();

      if (integrationError || !integration) {
        return {
          success: false,
          action: "no_change",
          error: "Wahoo integration not found",
        };
      }

      // 3. Delete workout from Wahoo
      const wahooClient = createWahooClient({
        accessToken: integration.access_token,
        refreshToken: integration.refresh_token || undefined,
      });

      try {
        await wahooClient.deleteWorkout(sync.external_id);
      } catch (error) {
        console.warn("Failed to delete Wahoo workout:", error);
        // Continue to delete sync record even if Wahoo delete fails
      }

      // 4. Delete sync record
      await this.supabase
        .from("synced_planned_activities")
        .delete()
        .eq("id", sync.id);

      return {
        success: true,
        action: "updated",
      };
    } catch (error) {
      console.error("Wahoo unsync error:", error);
      return {
        success: false,
        action: "no_change",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during unsync",
      };
    }
  }

  /**
   * Get sync status for a planned activity
   */
  async getSyncStatus(
    plannedActivityId: string,
    profileId: string,
  ): Promise<any> {
    const { data } = await this.supabase
      .from("synced_planned_activities")
      .select("*")
      .eq("planned_activity_id", plannedActivityId)
      .eq("provider", "wahoo")
      .eq("profile_id", profileId)
      .single();

    return data;
  }

  /**
   * Get all syncs for a planned activity (all providers)
   */
  async getAllSyncs(
    plannedActivityId: string,
    profileId: string,
  ): Promise<any[]> {
    const { data } = await this.supabase
      .from("synced_planned_activities")
      .select("*")
      .eq("planned_activity_id", plannedActivityId)
      .eq("profile_id", profileId);

    return data || [];
  }
}
