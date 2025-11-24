/**
 * Wahoo Activity Importer
 * Processes webhook events and imports completed activities from Wahoo
 */

import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WahooWorkoutSummary } from "./client";

// Wahoo workout type mapping to GradientPeak activity types
const WAHOO_WORKOUT_TYPE_MAP: Record<number, string> = {
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
      const { data: integration, error: integrationError } =
        await this.supabase
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

      // 5. Calculate start time from duration
      const startedAt = this.calculateStartTime(summary);

      // 6. Map Wahoo metrics to GradientPeak schema
      const activity = {
        profile_id: integration.profile_id,
        provider: "wahoo" as const,
        external_id: summary.id.toString(),
        planned_activity_id: syncedActivity?.planned_activity_id || null,

        // Timestamps
        started_at: startedAt,

        // Activity type
        activity_type: activityType,

        // Core metrics
        distance: summary.distance_accum || 0,
        moving_time: summary.duration_active_accum || 0,
        elapsed_time: summary.duration_total_accum || 0,
        total_ascent: summary.ascent_accum || 0,
        total_descent: 0, // Wahoo doesn't provide descent
        calories: summary.calories_accum || 0,

        // Power metrics
        avg_power: summary.power_avg || null,
        normalized_power: summary.power_bike_np_last || null,
        training_stress_score: summary.power_bike_tss_last || null,

        // Heart rate
        avg_hr: summary.heart_rate_avg || null,

        // Cadence
        avg_cadence: summary.cadence_avg || null,

        // Speed (convert m/s to km/h)
        avg_speed: summary.speed_avg ? summary.speed_avg * 3.6 : null,

        // Work (convert joules to kilojoules)
        work: summary.work_accum ? summary.work_accum / 1000 : null,

        // Metadata
        manual: summary.manual || false,
        name: null, // Will be set by default in database
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
  private inferActivityType(summary: WahooWorkoutSummary): string {
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
  private mapWorkoutType(workoutTypeId: number): string {
    return (
      WAHOO_WORKOUT_TYPE_MAP[workoutTypeId] || "indoor_bike_trainer"
    );
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
