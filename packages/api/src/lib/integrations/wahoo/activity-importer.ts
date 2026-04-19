/**
 * Wahoo Activity Importer
 * Processes webhook events and imports completed activities from Wahoo
 */

import { type ActivityType, fromActivityType } from "./activity-type-utils";
import type { WahooWorkoutSummary } from "./client";

interface WahooRepository {
  createImportedActivity(input: {
    activityPlanId: string | null;
    avgCadence: number | null;
    avgHeartRate: number | null;
    avgPower: number | null;
    avgSpeedMps: number | null;
    calories: number | null;
    distanceMeters: number;
    durationSeconds: number;
    elevationGainMeters: number | null;
    externalId: string;
    finishedAt: string;
    fitFilePath: string | null;
    fitFileSize: number | null;
    movingSeconds: number;
    name: string;
    normalizedPower: number | null;
    profileId: string;
    provider: "wahoo";
    startedAt: string;
    type: string;
  }): Promise<{ id: string }>;
  findImportedActivityByExternalId(externalId: string): Promise<{ id: string } | null>;
  findLinkedPlannedEventId(input: {
    externalWorkoutId: string;
    profileId: string;
  }): Promise<string | null>;
  findWahooIntegrationByExternalId(externalId: string): Promise<{ profileId: string } | null>;
  getEventActivityPlanId(input: { eventId: string; profileId: string }): Promise<string | null>;
}

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

export interface WahooActivityImportFitFileStorage {
  uploadFitFile(input: { bytes: Uint8Array; contentType: string; path: string }): Promise<void>;
}

export class WahooActivityImporter {
  constructor(
    private readonly deps: {
      fitFileStorage: WahooActivityImportFitFileStorage;
      repository: WahooRepository;
    },
  ) {}

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
      const integration = await this.deps.repository.findWahooIntegrationByExternalId(
        wahooUserId.toString(),
      );

      if (!integration) {
        console.error(`No integration found for Wahoo user ${wahooUserId}`);
        return {
          success: false,
          error: `No integration found for Wahoo user ${wahooUserId}`,
        };
      }

      // 2. Check for duplicate (unique constraint on provider + external_id)
      const existing = await this.deps.repository.findImportedActivityByExternalId(
        summary.id.toString(),
      );

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
      // Note: This queries integration_resource_links to map external workouts back to planned events
      // The external_id column stores the Wahoo workout ID
      const linkedWorkoutId = summary.workout_id ?? summary.workout?.id ?? null;
      const linkedEventId = linkedWorkoutId
        ? await this.deps.repository.findLinkedPlannedEventId({
            profileId: integration.profileId,
            externalWorkoutId: linkedWorkoutId.toString(),
          })
        : null;

      // 4. Fetch the workout to get activity type
      // Note: In a real implementation, you'd fetch this from Wahoo API
      // For now, we'll infer from the workout_type_id in the summary
      const activityType = this.inferActivityType(summary);
      const { category } = fromActivityType(activityType);

      const fitFile = await this.downloadAndStoreFitFile(
        summary.file?.url,
        integration.profileId,
        summary.id,
      );

      // 5. Calculate start time from duration
      const startedAt = this.calculateStartTime(summary);

      // 6. Map Wahoo metrics to GradientPeak schema
      const finishedAt = new Date(
        new Date(startedAt).getTime() + (summary.duration_total_accum || 0) * 1000,
      ).toISOString();

      // 4a. If we have an event_id, get the associated activity_plan_id
      let activityPlanId: string | null = null;
      if (linkedEventId) {
        activityPlanId =
          (await this.deps.repository.getEventActivityPlanId({
            eventId: linkedEventId,
            profileId: integration.profileId,
          })) ?? null;
      }

      const activity = {
        profileId: integration.profileId,
        provider: "wahoo" as const,
        externalId: summary.id.toString(),
        activityPlanId,

        // Timestamps
        startedAt,
        finishedAt,

        // Activity type (new schema)
        type: category,
        name: `${category} Activity`,

        // Core metrics
        distanceMeters: toInteger(summary.distance_accum),
        durationSeconds: toInteger(summary.duration_total_accum),
        movingSeconds: toInteger(summary.duration_active_accum),

        // Additional metrics mapped to concrete DB columns
        elevationGainMeters: toInteger(summary.ascent_accum),
        calories: toInteger(summary.calories_accum),
        avgPower: toNullableNumber(summary.power_avg),
        normalizedPower: toNullableNumber(summary.power_bike_np_last),
        avgHeartRate: toNullableInteger(summary.heart_rate_avg),
        avgCadence: toNullableInteger(summary.cadence_avg),
        avgSpeedMps: toNullableNumber(summary.speed_avg),
        fitFilePath: fitFile?.path ?? null,
        fitFileSize: fitFile?.size ?? null,
      };

      // 7. Create activity
      let newActivity;
      try {
        newActivity = await this.deps.repository.createImportedActivity(activity);
      } catch (insertError) {
        console.error("Failed to import Wahoo activity:", insertError);
        return {
          success: false,
          error: `Database error: ${insertError instanceof Error ? insertError.message : String(insertError)}`,
        };
      }

      console.log(
        `Successfully imported Wahoo activity ${summary.id} as ${newActivity.id} for user ${integration.profileId}`,
      );

      return {
        success: true,
        activityId: newActivity.id,
      };
    } catch (error) {
      console.error("Error importing Wahoo activity:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error during import",
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
    if (workoutTypeId !== undefined && WAHOO_WORKOUT_TYPE_MAP[workoutTypeId] !== undefined) {
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

      try {
        await this.deps.fitFileStorage.uploadFitFile({
          bytes,
          contentType: "application/octet-stream",
          path: fitPath,
        });
      } catch (uploadError) {
        console.warn(
          `Failed to store Wahoo FIT file for summary ${workoutSummaryId}: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`,
        );
        return null;
      }

      return { path: fitPath, size: bytes.byteLength };
    } catch (error) {
      console.warn(`Failed to fetch/store Wahoo FIT file for summary ${workoutSummaryId}`, error);
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
    const startTime = new Date(now.getTime() - toNumber(summary.duration_total_accum) * 1000);
    return startTime.toISOString();
  }
}

export function createWahooImportFitFileStorage(
  storageClient: Pick<WahooActivityImportFitFileStorage, "uploadFitFile">,
): WahooActivityImportFitFileStorage {
  return storageClient;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: number | string | null | undefined): number {
  return Math.round(toNumber(value));
}

function toNullableInteger(value: number | string | null | undefined): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

export function createActivityImporter(deps: {
  fitFileStorage: WahooActivityImportFitFileStorage;
  repository: WahooRepository;
}) {
  return new WahooActivityImporter(deps);
}
