/**
 * Wahoo Activity Importer
 * Processes webhook events and imports completed activities from Wahoo
 */

import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WahooWorkoutSummary } from "./client";
import { fromActivityType, type ActivityType } from "./activity-type-utils";

// Wahoo workout type mapping to GradientPeak activity categories
const WAHOO_WORKOUT_TYPE_MAP: Record<number, ActivityType> = {
  0: "bike", // BIKING OUTDOOR
  1: "run", // RUNNING OUTDOOR
  2: "other", // FITNESS EQUIPMENT (not 1:1 with a single GP category)
  5: "run", // TREADMILL RUNNING
  12: "bike", // INDOOR BIKING
  25: "swim", // LAP SWIMMING
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

      // 3. Find linked planned activity event (if any)
      // Note: This queries synced_events which links events to external workouts
      // The external_id column stores the Wahoo workout ID
      const linkedWorkoutId = summary.workout_id ?? summary.workout?.id ?? null;

      const { data: syncedActivity } = linkedWorkoutId
        ? await (this.supabase as any)
            .from("synced_events")
            .select("event_id")
            .eq("provider", "wahoo")
            .eq("external_id", linkedWorkoutId.toString())
            .eq("profile_id", integration.profile_id)
            .single()
        : { data: null };

      // 4. Fetch the workout to get activity type
      // Note: In a real implementation, you'd fetch this from Wahoo API
      // For now, we'll infer from the workout_type_id in the summary
      const activityType = this.inferActivityType(summary);
      const { category } = fromActivityType(activityType);

      const fitFile = await this.downloadAndStoreFitFile(
        summary.file?.url,
        integration.profile_id,
        summary.id,
      );

      // 5. Calculate start time from duration
      const startedAt = this.calculateStartTime(summary);

      // 6. Map Wahoo metrics to GradientPeak schema
      const finishedAt = new Date(
        new Date(startedAt).getTime() +
          (summary.duration_total_accum || 0) * 1000,
      ).toISOString();

      // 4a. If we have an event_id, get the associated activity_plan_id
      let activityPlanId: string | null = null;
      if (syncedActivity?.event_id) {
        const { data: plannedActivity } = await this.supabase
          .from("events")
          .select("activity_plan_id")
          .eq("id", syncedActivity.event_id)
          .eq("event_type", "planned_activity")
          .eq("profile_id", integration.profile_id)
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
        type: category,
        name: `${category} Activity`,

        // Core metrics
        distance_meters: toInteger(summary.distance_accum),
        duration_seconds: toInteger(summary.duration_total_accum),
        moving_seconds: toInteger(summary.duration_active_accum),

        // Additional metrics mapped to concrete DB columns
        elevation_gain_meters: toInteger(summary.ascent_accum),
        calories: toInteger(summary.calories_accum),
        avg_power: toNullableNumber(summary.power_avg),
        normalized_power: toNullableNumber(summary.power_bike_np_last),
        training_stress_score: toNullableNumber(summary.power_bike_tss_last),
        avg_heart_rate: toNullableInteger(summary.heart_rate_avg),
        avg_cadence: toNullableInteger(summary.cadence_avg),
        avg_speed_mps: toNullableNumber(summary.speed_avg),
        fit_file_path: fitFile?.path ?? null,
        fit_file_size: fitFile?.size ?? null,
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
    const workoutTypeId = summary.workout?.workout_type_id;
    if (
      workoutTypeId !== undefined &&
      WAHOO_WORKOUT_TYPE_MAP[workoutTypeId] !== undefined
    ) {
      return WAHOO_WORKOUT_TYPE_MAP[workoutTypeId]!;
    }

    // Hard-cutover rule: only map explicit 1:1 workout_type_id values.
    // Ambiguous or unknown activities (yoga, hiking, walking, skiing, etc.)
    // are imported as "other".
    return "other";
  }

  private async downloadAndStoreFitFile(
    url: string | undefined,
    profileId: string,
    workoutSummaryId: number,
  ): Promise<{ path: string; size: number } | null> {
    if (!url) {
      return null;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(
          `Failed to download Wahoo FIT file for summary ${workoutSummaryId}: ${response.status}`,
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const fitPath = `${profileId}/wahoo-${workoutSummaryId}.fit`;

      const { error: uploadError } = await this.supabase.storage
        .from("fit-files")
        .upload(fitPath, bytes, {
          contentType: "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        console.warn(
          `Failed to store Wahoo FIT file for summary ${workoutSummaryId}: ${uploadError.message}`,
        );
        return null;
      }

      return { path: fitPath, size: bytes.byteLength };
    } catch (error) {
      console.warn(
        `Failed to fetch/store Wahoo FIT file for summary ${workoutSummaryId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Calculate start time by subtracting total duration from current time
   * Note: This is an approximation. Ideally, the webhook would include
   * the actual start time, or we'd fetch it from the workout details
   */
  private calculateStartTime(summary: WahooWorkoutSummary): string {
    if (summary.started_at) {
      return summary.started_at;
    }

    const now = new Date();
    const startTime = new Date(
      now.getTime() - toNumber(summary.duration_total_accum) * 1000,
    );
    return startTime.toISOString();
  }
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: number | string | null | undefined): number {
  return Math.round(toNumber(value));
}

function toNullableInteger(
  value: number | string | null | undefined,
): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

/**
 * Create an activity importer instance
 */
export function createActivityImporter(
  supabase: SupabaseClient<Database>,
): WahooActivityImporter {
  return new WahooActivityImporter(supabase);
}
