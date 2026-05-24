/**
 * Wahoo Activity Importer
 * Processes webhook events and imports completed activities from Wahoo
 */

import { parseActivityFile, type StandardActivity } from "@repo/core";
import {
  buildImportedActivityCreateInput,
  type ImportedActivityCreateInput,
} from "../../provider-sync/imported-activity";
import type { ActivityType } from "./activity-type-utils";
import type { WahooWorkoutSummary } from "./client";

interface WahooRepository {
  createImportedActivity(input: ImportedActivityCreateInput): Promise<{ id: string }>;
  findImportedActivityLinkByExternalId(input: {
    externalId: string;
    integrationId: string;
  }): Promise<{ activityId: string; linkId: string } | null>;
  findLinkedPlannedEventId(input: {
    externalWorkoutId: string;
    profileId: string;
  }): Promise<string | null>;
  findWahooIntegrationByExternalId(
    externalId: string,
  ): Promise<{ integrationId: string; profileId: string } | null>;
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

export interface WahooActivityImportFileStorage {
  uploadActivityFile(input: {
    bytes: Uint8Array;
    contentType: string;
    path: string;
  }): Promise<void>;
}

export type WahooActivityFileParser = (input: {
  bytes: Uint8Array;
  fileName: string;
}) => StandardActivity;

export class WahooActivityImporter {
  constructor(
    private readonly deps: {
      activityFileStorage: WahooActivityImportFileStorage;
      activityFileParser?: WahooActivityFileParser;
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

      // 2. Check for duplicate provider resource before file download or parsing.
      const existing = await this.deps.repository.findImportedActivityLinkByExternalId({
        externalId: summary.id.toString(),
        integrationId: integration.integrationId,
      });

      if (existing) {
        console.log(`Activity ${summary.id} already imported, skipping`);
        return {
          success: true,
          skipped: true,
          reason: "Activity already imported",
          activityId: existing.activityId,
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

      const activityFile = await this.downloadAndStoreActivityFile(
        summary.file?.url,
        integration.profileId,
        summary.id,
      );

      if (!activityFile) {
        return {
          success: false,
          error: `Failed to fetch/store Wahoo FIT file for summary ${summary.id}`,
        };
      }

      const parsedActivity = this.parseActivityFile(
        activityFile.bytes,
        activityFile.path,
        summary.id,
      );

      // 4a. If we have an event_id, get the associated activity_plan_id
      let activityPlanId: string | null = null;
      if (linkedEventId) {
        activityPlanId =
          (await this.deps.repository.getEventActivityPlanId({
            eventId: linkedEventId,
            profileId: integration.profileId,
          })) ?? null;
      }

      const resolvedCategory = this.resolveActivityType(summary, parsedActivity);
      const activity = buildImportedActivityCreateInput({
        activityFile: {
          path: activityFile.path,
          size: activityFile.size,
        },
        activityPlanId,
        externalId: summary.id.toString(),
        fallback: {
          avgCadence: summary.cadence_avg,
          avgHeartRate: summary.heart_rate_avg,
          avgPower: summary.power_avg,
          avgSpeedMps: summary.speed_avg,
          calories: summary.calories_accum,
          distanceMeters: summary.distance_accum,
          durationSeconds: summary.duration_total_accum,
          elevationGainMeters: summary.ascent_accum,
          movingSeconds: summary.duration_active_accum,
          normalizedPower: summary.power_bike_np_last,
          providerUpdatedAt: summary.updated_at ?? summary.created_at ?? null,
          startedAt: this.calculateStartTime(summary),
        },
        integrationId: integration.integrationId,
        profileId: integration.profileId,
        provider: "wahoo" as const,
        parsedActivity,
        title: `${resolvedCategory} Activity`,
        type: resolvedCategory,
      });

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

  private parseActivityFile(
    bytes: Uint8Array,
    path: string,
    workoutSummaryId: number,
  ): StandardActivity | null {
    try {
      const parser = this.deps.activityFileParser ?? defaultActivityFileParser;
      return parser({ bytes, fileName: path });
    } catch (error) {
      console.warn(
        `Failed to parse Wahoo FIT file for summary ${workoutSummaryId}; falling back to summary metadata`,
        error,
      );
      return null;
    }
  }

  private resolveActivityType(
    summary: WahooWorkoutSummary,
    parsedActivity: StandardActivity | null,
  ): ActivityType {
    const fitType = parsedActivity?.metadata.type.toLowerCase();
    if (fitType) {
      if (fitType.includes("cycling") || fitType.includes("bike")) return "bike";
      if (fitType.includes("running") || fitType.includes("run")) return "run";
      if (fitType.includes("swimming") || fitType.includes("swim")) return "swim";
    }

    return this.inferActivityType(summary);
  }

  private async downloadAndStoreActivityFile(
    url: string | undefined,
    profileId: string,
    workoutSummaryId: number,
  ): Promise<{ bytes: Uint8Array; path: string; size: number } | null> {
    if (!url) {
      return null;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(
          `Failed to download Wahoo activity file for summary ${workoutSummaryId}: ${response.status}`,
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const activityFilePath = `activities/${profileId}/providers/wahoo/${workoutSummaryId}.fit`;

      try {
        await this.deps.activityFileStorage.uploadActivityFile({
          bytes,
          contentType: "application/octet-stream",
          path: activityFilePath,
        });
      } catch (uploadError) {
        console.warn(
          `Failed to store Wahoo activity file for summary ${workoutSummaryId}: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`,
        );
        return null;
      }

      return { bytes, path: activityFilePath, size: bytes.byteLength };
    } catch (error) {
      console.warn(
        `Failed to fetch/store Wahoo activity file for summary ${workoutSummaryId}`,
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
    const startTime = new Date(now.getTime() - toNumber(summary.duration_total_accum) * 1000);
    return startTime.toISOString();
  }
}

export function createWahooImportActivityFileStorage(
  storageClient: Pick<WahooActivityImportFileStorage, "uploadActivityFile">,
): WahooActivityImportFileStorage {
  return storageClient;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultActivityFileParser(input: {
  bytes: Uint8Array;
  fileName: string;
}): StandardActivity {
  return parseActivityFile({ data: input.bytes, fileName: input.fileName, fileType: "fit" });
}

export function createActivityImporter(deps: {
  activityFileStorage: WahooActivityImportFileStorage;
  activityFileParser?: WahooActivityFileParser;
  repository: WahooRepository;
}) {
  return new WahooActivityImporter(deps);
}
