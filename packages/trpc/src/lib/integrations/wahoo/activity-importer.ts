/**
 * Wahoo Activity Importer
 * Processes webhook events and imports completed activities from Wahoo
 */

import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WahooWorkoutSummary } from "./client";
import { fromActivityType, type ActivityType } from "./activity-type-utils";

// Wahoo workout type mapping to GradientPeak legacy activity types
const WAHOO_WORKOUT_TYPE_MAP: Record<number, ActivityType> = {
  0: "outdoor_bike", // BIKING OUTDOOR
  1: "outdoor_run", // RUNNING OUTDOOR
  2: "indoor_strength", // FITNESS EQUIPMENT
  5: "indoor_treadmill", // TREADMILL RUNNING
  12: "indoor_bike_trainer", // INDOOR BIKING
  25: "indoor_swim", // LAP SWIMMING
};

export interface ImportResult {
  success: boolean;
  activityId?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export class WahooActivityImporter {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Import a completed workout summary from Wahoo webhook
   * @param wahooUserId - Wahoo user ID from webhook
   * @param summary - Workout summary from webhook payload
   */
  async importWorkoutSummary(
    wahooUserId: number,
    summary: WahooWorkoutSummary,
  ): Promise<ImportResult> {
    try {
      // 1. Find user by external_id
      const { data: integration, error: integrationError } = await this.supabase
        .from("integrations")
        .select("profile_id")
        .eq("provider", "wahoo")
        .eq("external_id", wahooUserId.toString())
        .single();

      if (integrationError || !integration) {
        console.error(
          `No integration found for Wahoo user ${wahooUserId}`,
          integrationError,
        );
        return {
          success: false,
          error: `No integration found for Wahoo user ${wahooUserId}`,
        };
      }

      // 2. Check for duplicate (unique constraint on provider + external_id)
      const { data: existing } = await this.supabase
        .from("activities")
        .select("id")
        .eq("provider", "wahoo")
        .eq("external_id", summary.id.toString())
        .single();

      if (existing) {
        console.log(`Activity ${summary.id} already imported, skipping`);
        return {
          success: true,
          skipped: true,
          reason: "Activity already imported",
          activityId: existing.id,
        };
      }

      // 3. Find linked planned activity (if any)
      // Note: This queries synced_planned_activities which links planned_activities to external workouts
      const { data: syncedActivity } = await this.supabase
        .from("synced_planned_activities")
        .select("planned_activity_id")
        .eq("provider", "wahoo")
        .eq("external_workout_id", summary.workout_id.toString())
        .eq("profile_id", integration.profile_id)
        .single();

      // 4. Fetch the workout to get activity type
      // Note: In a real implementation, you'd fetch this from Wahoo API
      // For now, we'll infer from the workout_type_id in the summary
      const activityType = this.inferActivityType(summary);
      const { category, location } = fromActivityType(activityType);

      // 5. Calculate start time from duration
      const startedAt = this.calculateStartTime(summary);

      // 6. Map Wahoo metrics to GradientPeak schema
      const finishedAt = new Date(
        new Date(startedAt).getTime() +
          (summary.duration_total_accum || 0) * 1000,
      ).toISOString();

      // 4a. If we have a planned_activity_id, get the associated activity_plan_id
      let activityPlanId: string | null = null;
      if (syncedActivity?.planned_activity_id) {
        const { data: plannedActivity } = await this.supabase
          .from("planned_activities")
          .select("activity_plan_id")
          .eq("id", syncedActivity.planned_activity_id)
          .single();

        activityPlanId = plannedActivity?.activity_plan_id || null;
      }

      const activity = {
        profile_id: integration.profile_id,
        provider: "wahoo" as const,
        external_id: summary.id.toString(),
        activity_plan_id: activityPlanId, // Use activity_plan_id instead of planned_activity_id

        // Timestamps
        started_at: startedAt,
        finished_at: finishedAt,

        // Activity type (new schema)
        type: activityType,
        name: `${category} Activity`,

        // Core metrics
        distance_meters: summary.distance_accum || 0,
        duration_seconds: summary.duration_total_accum || 0,
        moving_seconds: summary.duration_active_accum || 0,

        // Additional metrics in metrics field
        metrics: {
          total_ascent: summary.ascent_accum || 0,
          total_descent: 0, // Wahoo doesn't provide descent
          calories: summary.calories_accum || 0,
          avg_power: summary.power_avg || null,
          normalized_power: summary.power_bike_np_last || null,
          training_stress_score: summary.power_bike_tss_last || null,
          avg_hr: summary.heart_rate_avg || null,
          avg_cadence: summary.cadence_avg || null,
          avg_speed: summary.speed_avg ? summary.speed_avg * 3.6 : null,
          work: summary.work_accum ? summary.work_accum / 1000 : null,
        },
      };

      // 7. Create activity
      const { data: newActivity, error: insertError } = await this.supabase
        .from("activities")
        .insert(activity)
        .select("id")
        .single();

      if (insertError) {
        console.error("Failed to import Wahoo activity:", insertError);
        return {
          success: false,
          error: `Database error: ${insertError.message}`,
        };
      }

      console.log(
        `Successfully imported Wahoo activity ${summary.id} as ${newActivity.id} for user ${integration.profile_id}`,
      );

      return {
        success: true,
        activityId: newActivity.id,
      };
    } catch (error) {
      console.error("Error importing Wahoo activity:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error during import",
      };
    }
  }

  /**
   * Infer activity type from workout summary
   * In production, this should fetch the workout details from Wahoo API
   * to get the actual workout_type_id
   */
  private inferActivityType(summary: WahooWorkoutSummary): ActivityType {
    // Check if it's a cycling workout (has power data)
    if (summary.power_avg > 0 || summary.power_bike_np_last > 0) {
      return "indoor_bike_trainer";
    }

    // Check if it's a running workout (has cadence but no power)
    if (summary.cadence_avg > 0) {
      return "indoor_treadmill";
    }

    // Default to indoor bike
    return "indoor_bike_trainer";
  }

  /**
   * Calculate start time by subtracting total duration from current time
   * Note: This is an approximation. Ideally, the webhook would include
   * the actual start time, or we'd fetch it from the workout details
   */
  private calculateStartTime(summary: WahooWorkoutSummary): string {
    const now = new Date();
    const startTime = new Date(
      now.getTime() - summary.duration_total_accum * 1000,
    );
    return startTime.toISOString();
  }

  /**
   * Map Wahoo workout type ID to GradientPeak activity type
   */
  private mapWorkoutType(workoutTypeId: number): ActivityType {
    return WAHOO_WORKOUT_TYPE_MAP[workoutTypeId] || "indoor_bike_trainer";
  }
}

/**
 * Create an activity importer instance
 */
export function createActivityImporter(
  supabase: SupabaseClient<Database>,
): WahooActivityImporter {
  return new WahooActivityImporter(supabase);
}
