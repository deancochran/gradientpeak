/**
 * Wahoo Activity Importer
 * Processes webhook events and imports completed activities from Wahoo
 */

import type { StandardActivity } from "@repo/core";
import { parseActivityFile } from "@repo/core/server/activity-files";
import {
  buildImportedActivityCreateInput,
  type ImportedActivityCreateInput,
} from "../../provider-sync/imported-activity";
import type { WahooActivityType } from "./activity-type-utils";
import type { WahooWorkoutSummary } from "./client";

interface WahooRepository {
  findImportedActivityLinkByExternalId(input: {
    externalId: string;
    integrationId: string;
  }): Promise<{
    activityId: string;
    linkId: string;
    profileId: string;
    activityFilePath: string | null;
    activityFileSize: number | null;
    analysisReady: boolean;
  } | null>;
  findImportedActivityByProviderExternalId(input: {
    externalId: string;
    provider: "wahoo";
  }): Promise<{
    activityId: string;
    profileId: string;
    activityFilePath: string | null;
    activityFileSize: number | null;
    analysisReady: boolean;
  } | null>;
  createImportedActivityResourceLink(input: {
    activityId: string;
    externalId: string;
    integrationId: string;
    profileId: string;
    provider: "wahoo";
    providerUpdatedAt: string | null;
  }): Promise<void>;
  findLinkedPlannedEventId(input: {
    externalWorkoutId: string;
    profileId: string;
  }): Promise<string | null>;
  findWahooIntegrationByExternalId(
    externalId: string,
  ): Promise<{ integrationId: string; profileId: string } | null>;
  getEventActivityPlanId(input: { eventId: string; profileId: string }): Promise<string | null>;
}

const EXPECTED_PROVIDER_UNIQUE_CONSTRAINTS = new Set([
  "idx_activities_provider_external_unique",
  "integration_resource_links_external_unique",
]);

const MAX_ACTIVITY_FILE_BYTES = 50 * 1024 * 1024;
const ACTIVITY_FILE_DOWNLOAD_TIMEOUT_MS = 15_000;
const DEFAULT_ACTIVITY_FILE_HOSTS = ["*.wahooligan.com"];

function isAllowedActivityFileHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return allowedHosts.some((configuredHost) => {
    const normalizedHost = configuredHost.trim().toLowerCase().replace(/\.$/, "");
    if (normalizedHost.startsWith("*.")) {
      const suffix = normalizedHost.slice(1);
      return normalizedHostname.endsWith(suffix) && normalizedHostname.length > suffix.length;
    }
    return normalizedHostname === normalizedHost;
  });
}

function validateActivityFileUrl(url: string, allowedHosts: readonly string[]): URL | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443") ||
      !isAllowedActivityFileHost(parsed.hostname, allowedHosts)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseContentLength(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw new Error("Invalid Wahoo activity file Content-Length");
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size > MAX_ACTIVITY_FILE_BYTES) {
    throw new Error("Wahoo activity file exceeds the 50 MiB limit");
  }
  return size;
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  parseContentLength(response);
  if (!response.body) throw new Error("Wahoo activity file response has no body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ACTIVITY_FILE_BYTES) {
        throw new Error("Wahoo activity file exceeds the 50 MiB limit");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isExpectedProviderUniqueViolation(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 3 && candidate && typeof candidate === "object"; depth += 1) {
    const record = candidate as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (record.code === "23505" && typeof record.constraint === "string") {
      return EXPECTED_PROVIDER_UNIQUE_CONSTRAINTS.has(record.constraint);
    }
    candidate = record.cause;
  }
  return false;
}

// Wahoo workout type mapping to GradientPeak activity categories
const WAHOO_WORKOUT_TYPE_MAP: Record<number, WahooActivityType> = {
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
  readActivityFile?(path: string): Promise<{ bytes: Uint8Array; size: number } | null>;
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
      allowedActivityFileHosts?: readonly string[];
      repository: WahooRepository;
      submitActivity(
        input: ImportedActivityCreateInput,
        parsedActivity: StandardActivity,
      ): Promise<{ id: string }>;
      enrichActivity?(
        activityId: string,
        input: ImportedActivityCreateInput,
        parsedActivity: StandardActivity,
      ): Promise<{ id: string }>;
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
    options: { signal?: AbortSignal } = {},
  ): Promise<ImportResult> {
    try {
      options.signal?.throwIfAborted();
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

      if (existing?.analysisReady) {
        console.log(`Activity ${summary.id} already imported, skipping`);
        return {
          success: true,
          skipped: true,
          reason: "Activity already imported",
          activityId: existing.activityId,
        };
      }

      const existingImport = await this.deps.repository.findImportedActivityByProviderExternalId({
        externalId: summary.id.toString(),
        provider: "wahoo",
      });

      if (existingImport) {
        if (existingImport.profileId !== integration.profileId) {
          return {
            success: false,
            error: "Provider activity identity is owned by another profile",
          };
        }

        if (existingImport.analysisReady) {
          options.signal?.throwIfAborted();
          await this.deps.repository.createImportedActivityResourceLink({
            activityId: existingImport.activityId,
            externalId: summary.id.toString(),
            integrationId: integration.integrationId,
            profileId: integration.profileId,
            provider: "wahoo",
            providerUpdatedAt: summary.updated_at ?? summary.created_at ?? null,
          });

          console.log(`Activity ${summary.id} already imported, skipping`);
          return {
            success: true,
            skipped: true,
            reason: "Activity already imported",
            activityId: existingImport.activityId,
          };
        }
      }

      const repairCandidate =
        existingImport ??
        (existing
          ? {
              activityId: existing.activityId,
              profileId: existing.profileId,
              activityFilePath: existing.activityFilePath,
              activityFileSize: existing.activityFileSize,
              analysisReady: existing.analysisReady,
            }
          : null);
      if (repairCandidate && repairCandidate.profileId !== integration.profileId) {
        return {
          success: false,
          error: "Provider activity identity is owned by another profile",
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

      options.signal?.throwIfAborted();
      const storedActivityFile =
        repairCandidate?.activityFilePath && this.deps.activityFileStorage.readActivityFile
          ? await this.deps.activityFileStorage.readActivityFile(repairCandidate.activityFilePath)
          : null;
      const activityFile = storedActivityFile
        ? {
            bytes: storedActivityFile.bytes,
            path: repairCandidate?.activityFilePath ?? "",
            size: storedActivityFile.size,
          }
        : await this.downloadAndStoreActivityFile(
            summary.file?.url,
            integration.profileId,
            summary.id,
            options.signal,
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
      let newActivity: { id: string };
      try {
        options.signal?.throwIfAborted();
        if (repairCandidate) {
          if (!this.deps.enrichActivity) {
            throw new Error("Provider activity analysis repair is not configured");
          }
          newActivity = await this.deps.enrichActivity(
            repairCandidate.activityId,
            activity,
            parsedActivity,
          );
          await this.deps.repository.createImportedActivityResourceLink({
            activityId: repairCandidate.activityId,
            externalId: summary.id.toString(),
            integrationId: integration.integrationId,
            profileId: integration.profileId,
            provider: "wahoo",
            providerUpdatedAt: summary.updated_at ?? summary.created_at ?? null,
          });
        } else {
          newActivity = await this.deps.submitActivity(activity, parsedActivity);
        }
      } catch (insertError) {
        if (!isExpectedProviderUniqueViolation(insertError)) {
          console.error("Failed to import Wahoo activity:", insertError);
          return {
            success: false,
            error: `Database error: ${insertError instanceof Error ? insertError.message : String(insertError)}`,
          };
        }
        // The provider/external-id constraint is the race-safe idempotency authority.
        // A concurrent importer may have committed after our preflight lookup.
        const concurrentImport =
          await this.deps.repository.findImportedActivityByProviderExternalId({
            externalId: summary.id.toString(),
            provider: "wahoo",
          });
        if (concurrentImport?.profileId === integration.profileId) {
          if (!concurrentImport.analysisReady) {
            if (!this.deps.enrichActivity) {
              throw new Error("Provider activity analysis repair is not configured");
            }
            const repaired = await this.deps.enrichActivity(
              concurrentImport.activityId,
              activity,
              parsedActivity,
            );
            await this.deps.repository.createImportedActivityResourceLink({
              activityId: concurrentImport.activityId,
              externalId: summary.id.toString(),
              integrationId: integration.integrationId,
              profileId: integration.profileId,
              provider: "wahoo",
              providerUpdatedAt: summary.updated_at ?? summary.created_at ?? null,
            });
            return { success: true, activityId: repaired.id };
          }
          options.signal?.throwIfAborted();
          await this.deps.repository.createImportedActivityResourceLink({
            activityId: concurrentImport.activityId,
            externalId: summary.id.toString(),
            integrationId: integration.integrationId,
            profileId: integration.profileId,
            provider: "wahoo",
            providerUpdatedAt: summary.updated_at ?? summary.created_at ?? null,
          });
          return {
            success: true,
            skipped: true,
            reason: "Activity already imported",
            activityId: concurrentImport.activityId,
          };
        }
        if (concurrentImport) {
          return {
            success: false,
            error: "Provider activity identity is owned by another profile",
          };
        }
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
  private inferActivityType(summary: WahooWorkoutSummary): WahooActivityType {
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
  ): StandardActivity {
    const parser = this.deps.activityFileParser ?? defaultActivityFileParser;
    try {
      return parser({ bytes, fileName: path });
    } catch (error) {
      throw new Error(`Failed to parse Wahoo FIT file for summary ${workoutSummaryId}`, {
        cause: error,
      });
    }
  }

  private resolveActivityType(
    summary: WahooWorkoutSummary,
    parsedActivity: StandardActivity | null,
  ): WahooActivityType {
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
    signal?: AbortSignal,
  ): Promise<{ bytes: Uint8Array; path: string; size: number } | null> {
    if (!url) {
      return null;
    }

    try {
      signal?.throwIfAborted();
      const activityFileUrl = validateActivityFileUrl(url, [
        ...DEFAULT_ACTIVITY_FILE_HOSTS,
        ...(this.deps.allowedActivityFileHosts ?? []),
      ]);
      if (!activityFileUrl) {
        console.warn(`Rejected unsafe Wahoo activity file URL for summary ${workoutSummaryId}`);
        return null;
      }

      const controller = new AbortController();
      const abortFromCaller = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abortFromCaller, { once: true });
      const timeout = setTimeout(
        () => controller.abort(new Error("Download timed out")),
        ACTIVITY_FILE_DOWNLOAD_TIMEOUT_MS,
      );
      let bytes: Uint8Array;
      try {
        const response = await fetch(activityFileUrl, {
          redirect: "manual",
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
          console.warn(`Rejected redirected Wahoo activity file for summary ${workoutSummaryId}`);
          return null;
        }
        if (!response.ok) {
          console.warn(
            `Failed to download Wahoo activity file for summary ${workoutSummaryId}: ${response.status}`,
          );
          return null;
        }
        bytes = await readBoundedBody(response);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
      const activityFilePath = `activities/${profileId}/providers/wahoo/${workoutSummaryId}.fit`;

      try {
        signal?.throwIfAborted();
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
      if (signal?.aborted) throw error;
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
  storageClient: Pick<WahooActivityImportFileStorage, "uploadActivityFile"> &
    Partial<Pick<WahooActivityImportFileStorage, "readActivityFile">>,
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
  allowedActivityFileHosts?: readonly string[];
  repository: WahooRepository;
  submitActivity(
    input: ImportedActivityCreateInput,
    parsedActivity: StandardActivity,
  ): Promise<{ id: string }>;
  enrichActivity?(
    activityId: string,
    input: ImportedActivityCreateInput,
    parsedActivity: StandardActivity,
  ): Promise<{ id: string }>;
}) {
  return new WahooActivityImporter(deps);
}
