/**
 * Wahoo Sync Service
 * Orchestrates syncing planned activities to Wahoo
 */

import type { ActivityPlanStructure } from "@repo/core";
import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createWahooClient } from "./client";
import {
  convertToWahooPlan,
  validateWahooCompatibility,
} from "./plan-converter";

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
            activity_type,
            structure,
            updated_at
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

      // 4. Check if activity type is supported by Wahoo
      const activityType = planned.activity_plan.activity_type;
      if (!isActivityTypeSupportedByWahoo(activityType)) {
        return {
          success: false,
          action: "no_change",
          error: `Activity type '${activityType}' is not supported by Wahoo. Only cycling (outdoor_bike, indoor_bike_trainer) and running (outdoor_run, indoor_treadmill) activities can be synced to Wahoo.`,
        };
      }

      // 5. Check if already synced
      const { data: existingSync } = await this.supabase
        .from("synced_planned_activities")
        .select("id, external_workout_id, updated_at")
        .eq("planned_activity_id", plannedActivityId)
        .eq("provider", "wahoo")
        .single();

      const wahooClient = createWahooClient({
        accessToken: integration.access_token,
        refreshToken: integration.refresh_token || undefined,
      });

      // 6. Validate compatibility
      const structure = planned.activity_plan
        .structure as ActivityPlanStructure;
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
          validation.warnings,
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
    structure: ActivityPlanStructure,
    profile: any,
    wahooClient: any,
    profileId: string,
    warnings?: string[],
  ): Promise<SyncResult> {
    // Convert to Wahoo format
    const wahooPlan = convertToWahooPlan(structure, {
      activityType: planned.activity_plan.activity_type,
      name: planned.activity_plan.name,
      description: planned.activity_plan.description,
      ftp: profile?.ftp || undefined,
      threshold_hr: profile?.threshold_hr || undefined,
    });

    // Create plan in Wahoo's library
    const plan = await wahooClient.createPlan({
      structure: wahooPlan,
      name: planned.activity_plan.name,
      description: planned.activity_plan.description,
      activityType: planned.activity_plan.activity_type,
      externalId: planned.activity_plan.id,
    });

    // Create workout on Wahoo's calendar
    const workout = await wahooClient.createWorkout({
      planId: plan.id,
      name: planned.activity_plan.name,
      scheduledDate: new Date(planned.scheduled_date).toISOString(),
      externalId: planned.id,
    });

    // Store sync record (only workout_id, not plan_id)
    await this.supabase.from("synced_planned_activities").insert({
      profile_id: profileId,
      planned_activity_id: planned.id,
      provider: "wahoo",
      external_workout_id: workout.id.toString(),
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
    structure: ActivityPlanStructure,
    profile: any,
    wahooClient: any,
    profileId: string,
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
      await wahooClient.updateWorkout(existingSync.external_workout_id, {
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
        workoutId: existingSync.external_workout_id,
        warnings,
      };
    } else {
      // Structure changed - need to recreate
      // Convert to Wahoo format
      const wahooPlan = convertToWahooPlan(structure, {
        activityType: planned.activity_plan.activity_type,
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
        activityType: planned.activity_plan.activity_type,
        externalId: planned.activity_plan.id,
      });

      // Create new workout
      const workout = await wahooClient.createWorkout({
        planId: plan.id,
        name: planned.activity_plan.name,
        scheduledDate: new Date(planned.scheduled_date).toISOString(),
        externalId: planned.id,
      });

      // Delete old workout
      try {
        await wahooClient.deleteWorkout(existingSync.external_workout_id);
      } catch (error) {
        // Log but don't fail if old workout can't be deleted
        console.warn("Failed to delete old Wahoo workout:", error);
      }

      // Update sync record with new workout ID
      await this.supabase
        .from("synced_planned_activities")
        .update({
          external_workout_id: workout.id.toString(),
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
        .select("id, external_workout_id")
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
        await wahooClient.deleteWorkout(sync.external_workout_id);
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
