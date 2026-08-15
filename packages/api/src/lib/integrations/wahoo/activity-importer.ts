/**
 * Wahoo Activity Importer
 * Processes webhook events and imports completed activities from Wahoo
 */

import { createHash } from "node:crypto";
import type { StandardActivity } from "@repo/core";
import { ActivityFileParseError, parseActivityFile } from "@repo/core/server/activity-files";
import {
  ActivityArtifactLifecycleRetryableError,
  ActivityArtifactPersistenceError,
  ActivityAthleteStateEvidenceError,
  ActivityCalibrationEvidenceError,
  ActivityFileIngestionPersistenceError,
  ActivityMaterialEvidenceMarkerError,
  ActivityParentPersistenceError,
  ActivitySegmentPersistenceError,
  ActivitySourceReferenceError,
  type ActivitySubmissionTransaction,
  ActivitySubmissionValidationError,
  MATERIALIZER_VERSION,
  UnsupportedPersistedActivityVersionError,
} from "../../../application/activities/submit-activity";
import { ActivityAnalysisValidationError } from "../../../application/activity-file-ingestion/analyze-parsed-activity-file";
import { ImportedActivityAnalysisError } from "../../../application/activity-file-ingestion/submit-imported-activity-artifact";
import { logger } from "../../logger";
import {
  buildImportedActivityCreateInput,
  type ImportedActivityCreateInput,
  resolveImportedActivityRequiredMetrics,
} from "../../provider-sync/imported-activity";
import type { WahooStagingCleanupReservation } from "../../provider-sync/wahoo-staging-cleanup";
import type { WahooActivityType } from "./activity-type-utils";
import type { WahooWorkoutSummary } from "./client";

interface WahooRepository {
  findImportedActivityByProviderExternalId(input: {
    externalId: string;
    profileId: string;
    provider: "wahoo";
  }): Promise<{
    activityId: string;
    profileId: string;
    activityFilePath: string | null;
    activityFileSize: number | null;
    artifactId: string | null;
    artifactSha256: string | null;
    providerRevision: string | null;
    analysisReady: boolean;
    materializerVersion: string | null;
    segmentsRevision: number;
    timingCoverage: "complete" | "partial" | "unavailable";
    hasSwimSegment: boolean;
  } | null>;
  enrichImportedActivitySourceReference(input: {
    activityId: string;
    artifactSha256: string;
    externalId: string;
    importRunId?: string;
    integrationGeneration: number;
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
  ): Promise<{ integrationGeneration: number; integrationId: string; profileId: string } | null>;
  getEventActivityPlanId(input: { eventId: string; profileId: string }): Promise<string | null>;
}

const EXPECTED_PROVIDER_UNIQUE_CONSTRAINTS = new Set([
  "activity_source_references_provider_unique",
]);

const RECOGNIZED_ACTIVITY_PERSISTENCE_CONSTRAINTS = new Set([
  "activities_active_ms_check",
  "activities_distance_meters_check",
  "activities_elapsed_ms_check",
  "activities_laps_array_check",
  "activities_laps_count_check",
  "activities_laps_size_check",
  "activities_moving_ms_check",
  "activities_moving_time_check",
  "activities_segments_revision_check",
  "activities_timing_coverage_values_check",
  "activity_efforts_bike_power_max_check",
  "activity_efforts_distance_meters_bounds_check",
  "activity_efforts_duration_seconds_bounds_check",
  "activity_efforts_heart_rate_bounds_check",
  "activity_efforts_run_speed_bounds_check",
  "activity_efforts_supported_combination_check",
  "activity_efforts_swim_speed_bounds_check",
  "activity_efforts_unit_compatibility_check",
  "activity_efforts_value_finite_positive_check",
  "activity_segments_offset_check",
  "activity_segments_role_category_check",
  "activity_segments_timing_check",
  "activity_segments_timing_coverage_values_check",
  "activity_source_references_artifact_unique",
  "activity_source_references_provider_unique",
]);

const SAFE_ERROR_NAMES = new Set([
  "AbortError",
  "ActivityArtifactLifecycleRetryableError",
  "ActivityArtifactPersistenceError",
  "ActivityAthleteStateEvidenceError",
  "ActivityCalibrationEvidenceError",
  "ActivityMaterialEvidenceMarkerError",
  "ActivityFileIngestionPersistenceError",
  "ActivityFileParseError",
  "ActivityParentPersistenceError",
  "ActivitySegmentPersistenceError",
  "ActivityAnalysisValidationError",
  "ActivitySubmissionValidationError",
  "ActivitySourceReferenceError",
  "DrizzleQueryError",
  "Error",
  "ImportedActivityAnalysisError",
  "PostgresError",
  "TRPCError",
  "UnsupportedPersistedActivityVersionError",
  "ZodError",
]);

const LIMITED_ACTIVITY_PERSISTENCE_ERROR_CODES = new Set<WahooActivityImportErrorCode>([
  "activity_laps_invalid",
  "activity_segments_invalid",
]);

const MAX_ACTIVITY_FILE_BYTES = 50 * 1024 * 1024;
const ACTIVITY_FILE_DOWNLOAD_TIMEOUT_MS = 15_000;
const DEFAULT_ACTIVITY_FILE_HOSTS = ["*.wahooligan.com"];

type WahooActivityImportStage =
  | "resolve_integration"
  | "deduplicate"
  | "resolve_link"
  | "load_artifact"
  | "parse_artifact"
  | "build_activity"
  | "persist_activity";

export type WahooActivityImportErrorCode =
  | "activity_analysis_initial_segments_invalid"
  | "activity_analysis_failed"
  | "activity_analysis_persisted_segments_invalid"
  | "activity_analysis_segments_invalid"
  | "activity_artifact_lifecycle_pending"
  | "activity_artifact_persistence_failed"
  | "activity_athlete_state_evidence_invalid"
  | "activity_calibration_evidence_invalid"
  | "activity_effort_segment_mismatch"
  | "activity_effort_reconciliation_invalid"
  | "activity_import_failed"
  | "activity_ingestion_conflict"
  | "activity_ingestion_persistence_failed"
  | "activity_material_evidence_marker_failed"
  | "activity_parent_persistence_failed"
  | "activity_laps_invalid"
  | "activity_performance_snapshot_invalid"
  | "activity_persistence_invariant_failed"
  | "activity_persistence_failed"
  | "activity_segments_invalid"
  | "activity_segment_persistence_failed"
  | "activity_source_reference_failed"
  | "activity_validation_failed"
  | "invalid_started_at"
  | "missing_started_at"
  | "unsupported_persisted_version";

export class WahooActivityCanonicalIdentityMismatchError extends Error {
  constructor() {
    super("activity_canonical_identity_mismatch");
    this.name = "WahooActivityCanonicalIdentityMismatchError";
  }
}

function classifyWahooPersistenceError(error: unknown): WahooActivityImportErrorCode {
  let candidate: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 5 && candidate && !seen.has(candidate); depth += 1) {
    seen.add(candidate);
    if (candidate instanceof ActivityArtifactLifecycleRetryableError) {
      return "activity_artifact_lifecycle_pending";
    }
    if (candidate instanceof ActivityArtifactPersistenceError) {
      return "activity_artifact_persistence_failed";
    }
    if (candidate instanceof ActivityAthleteStateEvidenceError) {
      return "activity_athlete_state_evidence_invalid";
    }
    if (candidate instanceof ActivityCalibrationEvidenceError) {
      return candidate.code;
    }
    if (candidate instanceof ActivityMaterialEvidenceMarkerError) {
      return "activity_material_evidence_marker_failed";
    }
    if (candidate instanceof ActivityFileIngestionPersistenceError) {
      return "activity_ingestion_persistence_failed";
    }
    if (candidate instanceof ActivityParentPersistenceError) {
      return "activity_parent_persistence_failed";
    }
    if (candidate instanceof ActivitySegmentPersistenceError) {
      return "activity_segment_persistence_failed";
    }
    if (candidate instanceof ActivityAnalysisValidationError) return candidate.code;
    if (
      candidate instanceof ImportedActivityAnalysisError &&
      candidate.code === "activity_laps_invalid"
    ) {
      return candidate.code;
    }
    if (candidate instanceof ActivitySubmissionValidationError) return candidate.code;
    if (candidate instanceof ActivitySourceReferenceError)
      return "activity_source_reference_failed";
    if (candidate instanceof Error && candidate.name === "ZodError") {
      return "activity_validation_failed";
    }
    candidate =
      typeof candidate === "object" && "cause" in candidate
        ? (candidate as { cause?: unknown }).cause
        : undefined;
  }
  return "activity_persistence_failed";
}

function isUnsupportedActivityAnalysisError(error: unknown): boolean {
  let candidate: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 5 && candidate && !seen.has(candidate); depth += 1) {
    seen.add(candidate);
    if (candidate instanceof ActivityAnalysisValidationError) return true;
    if (candidate instanceof Error && candidate.name === "ZodError") return true;
    candidate =
      typeof candidate === "object" && "cause" in candidate
        ? (candidate as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

function safeWahooImportErrorDetails(
  error: unknown,
  applicationCode: WahooActivityImportErrorCode,
) {
  let candidate: unknown = error;
  let errorClass = "unknown";
  let postgresCode: string | undefined;
  let postgresConstraint: string | undefined;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 5 && candidate && !seen.has(candidate); depth += 1) {
    seen.add(candidate);
    if (candidate instanceof Error && errorClass === "unknown") {
      errorClass = SAFE_ERROR_NAMES.has(candidate.name) ? candidate.name : "unknown";
    }
    if (typeof candidate !== "object") break;
    const record = candidate as { cause?: unknown; code?: unknown; constraint?: unknown };
    if (
      postgresCode === undefined &&
      typeof record.code === "string" &&
      /^[0-9A-Z]{5}$/.test(record.code)
    ) {
      postgresCode = record.code;
    }
    if (
      postgresConstraint === undefined &&
      typeof record.constraint === "string" &&
      RECOGNIZED_ACTIVITY_PERSISTENCE_CONSTRAINTS.has(record.constraint)
    ) {
      postgresConstraint = record.constraint;
    }
    candidate = record.cause;
  }
  return {
    application_code: applicationCode,
    error_class: errorClass,
    ...(postgresCode === undefined ? {} : { postgres_code: postgresCode }),
    ...(postgresConstraint === undefined ? {} : { postgres_constraint: postgresConstraint }),
  };
}

const WAHOO_ACTIVITY_IMPORT_FAILURE_MESSAGES = {
  resolve_integration: "Wahoo activity import failed while resolving the integration",
  deduplicate: "Wahoo activity import failed during deduplication",
  resolve_link: "Wahoo activity import failed while resolving planned activity linkage",
  load_artifact: "Wahoo activity import failed while loading the activity artifact",
  parse_artifact: "Wahoo activity import failed while parsing the activity artifact",
  build_activity: "Wahoo activity import failed while building the activity record",
  persist_activity: "Wahoo activity import failed while persisting the activity",
} as const satisfies Record<WahooActivityImportStage, string>;

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

function activityFileSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function providerRevision(summary: WahooWorkoutSummary): string | null {
  const value = summary.updated_at ?? summary.created_at ?? null;
  if (value === null) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Wahoo activity revision is invalid");
  return new Date(timestamp).toISOString();
}

function isExactRedelivery(input: {
  existing: {
    activityFileSize: number | null;
    analysisReady: boolean;
    artifactSha256: string | null;
    providerRevision: string | null;
  };
  incomingFileSize: number;
  incomingSha256: string;
  incomingProviderRevision: string | null;
}): boolean {
  return (
    input.existing.analysisReady &&
    input.existing.providerRevision === input.incomingProviderRevision &&
    input.existing.artifactSha256 === input.incomingSha256 &&
    input.existing.activityFileSize === input.incomingFileSize
  );
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
  26: "swim", // OPEN WATER SWIMMING
};

export interface ImportResult {
  success: boolean;
  activityId?: string;
  error?: string;
  errorCode?: WahooActivityImportErrorCode;
  failureReason?:
    | "missing_started_at"
    | "invalid_started_at"
    | "unsupported_activity_file"
    | "unsupported_persisted_version";
  skipped?: boolean;
  reason?: string;
}

export function getWahooActivityStartedAtFailureReason(
  value: unknown,
): "missing_started_at" | "invalid_started_at" | null {
  if (value === undefined || value === null || value === "") return "missing_started_at";
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? null
    : "invalid_started_at";
}

export interface WahooActivityImportFileStorage {
  uploadActivityFile(input: {
    bytes: Uint8Array;
    contentType: string;
    path: string;
  }): Promise<void>;
  readActivityFile?(path: string): Promise<{ bytes: Uint8Array; size: number } | null>;
  removeOwnedActivityFile?(path: string): Promise<{ cleanupPending: boolean; removed: boolean }>;
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
        options: {
          artifactSha256: string;
          beforePersist: (tx: ActivitySubmissionTransaction) => Promise<void>;
          importRunId?: string;
          deferAthleteStateRefresh?: boolean;
          deferPerformanceCalibration?: boolean;
        },
      ): Promise<{ id: string; noOp?: boolean }>;
      generationGuard(
        tx: ActivitySubmissionTransaction,
        expected: { integrationGeneration: number; integrationId: string; profileId: string },
      ): Promise<void>;
      stagingCleanup: WahooStagingCleanupReservation;
    },
  ) {}

  /**
   * Import a completed Wahoo workout summary from a Wahoo webhook
   * @param wahooUserId - Wahoo user ID from webhook
   * @param summary - Wahoo workout summary from the webhook payload
   */
  async importWorkoutSummary(
    wahooUserId: number,
    summary: WahooWorkoutSummary,
    options: {
      integrationGeneration: number;
      integrationId: string;
      signal?: AbortSignal;
      importRunId?: string;
      deferAthleteStateRefresh?: boolean;
      deferPerformanceCalibration?: boolean;
    },
  ): Promise<ImportResult> {
    let ownedStagePath: string | null = null;
    let completed = false;
    let stage: WahooActivityImportStage = "resolve_integration";
    try {
      options.signal?.throwIfAborted();
      const startedAtFailureReason = getWahooActivityStartedAtFailureReason(summary.started_at);
      if (startedAtFailureReason) {
        logger.warn("Wahoo activity import rejected", {
          operation: "validate_summary",
          outcome: startedAtFailureReason,
          provider: "wahoo",
        });
        return {
          success: false,
          error:
            startedAtFailureReason === "missing_started_at"
              ? "Wahoo workout summary is missing its start time"
              : "Wahoo workout summary has an invalid start time",
          errorCode: startedAtFailureReason,
          failureReason: startedAtFailureReason,
        };
      }
      // 1. Find user by external_id
      const integration = await this.deps.repository.findWahooIntegrationByExternalId(
        wahooUserId.toString(),
      );

      if (!integration) {
        logger.warn("Wahoo activity import skipped", {
          operation: "resolve_integration",
          outcome: "missing",
          provider: "wahoo",
        });
        return {
          success: false,
          error: "Wahoo integration is unavailable",
        };
      }
      if (
        integration.integrationId !== options.integrationId ||
        integration.integrationGeneration !== options.integrationGeneration
      ) {
        return { success: false, error: "Wahoo integration generation is inactive" };
      }
      const incomingProviderRevision = providerRevision(summary);
      const beforePersist = (tx: ActivitySubmissionTransaction) =>
        this.deps.generationGuard(tx, {
          integrationGeneration: options.integrationGeneration,
          integrationId: options.integrationId,
          profileId: integration.profileId,
        });
      const assertGenerationActive = async () => {
        const current = await this.deps.repository.findWahooIntegrationByExternalId(
          wahooUserId.toString(),
        );
        if (
          !current ||
          current.integrationId !== options.integrationId ||
          current.integrationGeneration !== options.integrationGeneration ||
          current.profileId !== integration.profileId
        ) {
          throw new Error("integration_generation_inactive");
        }
      };

      // 2. Check for duplicate provider resource before file download or parsing.
      stage = "deduplicate";
      const existingImport = await this.deps.repository.findImportedActivityByProviderExternalId({
        externalId: summary.id.toString(),
        profileId: integration.profileId,
        provider: "wahoo",
      });
      if (existingImport) {
        if (existingImport.profileId !== integration.profileId) {
          return {
            success: false,
            error: "Provider activity identity is owned by another profile",
          };
        }

        if (existingImport.materializerVersion !== MATERIALIZER_VERSION) {
          return {
            success: false,
            error: "Wahoo activity has a non-current materializer version",
            errorCode: "unsupported_persisted_version",
            failureReason: "unsupported_persisted_version",
          };
        }
      }
      const repairCandidate = existingImport;
      if (repairCandidate && repairCandidate.profileId !== integration.profileId) {
        return {
          success: false,
          error: "Provider activity identity is owned by another profile",
        };
      }
      // 3. Find linked planned activity event (if any)
      // Note: This queries integration_resource_links to map external Wahoo workout resources to planned events
      // The external_id column stores the Wahoo workout ID
      stage = "resolve_link";
      const linkedWorkoutId = summary.workout_id ?? summary.workout?.id ?? null;
      const linkedEventId = linkedWorkoutId
        ? await this.deps.repository.findLinkedPlannedEventId({
            profileId: integration.profileId,
            externalWorkoutId: linkedWorkoutId.toString(),
          })
        : null;

      options.signal?.throwIfAborted();
      // The signal is only a latency optimization. The generation fence is the
      // authority immediately before the first external effect.
      stage = "load_artifact";
      await assertGenerationActive();
      const storedActivityFile =
        repairCandidate?.analysisReady === false &&
        repairCandidate.activityFilePath &&
        this.deps.activityFileStorage.readActivityFile
          ? await this.deps.activityFileStorage.readActivityFile(repairCandidate.activityFilePath)
          : null;
      const activityFile = storedActivityFile
        ? {
            bytes: storedActivityFile.bytes,
            path: repairCandidate?.activityFilePath ?? "",
            sha256: activityFileSha256(storedActivityFile.bytes),
            size: storedActivityFile.size,
          }
        : await this.downloadAndStoreActivityFile(
            summary.file?.url,
            integration.profileId,
            summary.id,
            options.integrationId,
            options.integrationGeneration,
            options.signal,
            assertGenerationActive,
            (path) => {
              ownedStagePath = path;
            },
          );

      if (!activityFile) {
        return {
          success: false,
          error: "Wahoo activity file could not be imported",
        };
      }

      if (
        repairCandidate &&
        isExactRedelivery({
          existing: repairCandidate,
          incomingFileSize: activityFile.size,
          incomingSha256: activityFile.sha256,
          incomingProviderRevision,
        })
      ) {
        await this.deps.repository.enrichImportedActivitySourceReference({
          activityId: repairCandidate.activityId,
          artifactSha256: activityFile.sha256,
          externalId: summary.id.toString(),
          ...(options.importRunId ? { importRunId: options.importRunId } : {}),
          integrationGeneration: options.integrationGeneration,
          integrationId: integration.integrationId,
          profileId: integration.profileId,
          provider: "wahoo",
          providerUpdatedAt: incomingProviderRevision,
        });
        logger.info("Wahoo activity import skipped", {
          operation: "import_activity",
          outcome: "exact_redelivery",
          provider: "wahoo",
        });
        return {
          success: true,
          skipped: true,
          reason: "Activity already imported",
          activityId: repairCandidate.activityId,
        };
      }

      // Do not parse or promote a staged object once its integration was
      // disconnected while the upload was in flight.
      await assertGenerationActive();
      stage = "parse_artifact";
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
      stage = "build_activity";
      const resolvedMetrics = resolveImportedActivityRequiredMetrics({
        fileDistanceMeters: parsedActivity.summary.totalDistance,
        fileDurationSeconds: parsedActivity.summary.totalTime,
        providerDistanceMeters: summary.distance_accum,
        providerDurationSeconds: summary.duration_total_accum,
      });
      const parsedActivityForAnalysis: StandardActivity = {
        ...parsedActivity,
        summary: {
          ...parsedActivity.summary,
          totalDistance: resolvedMetrics.distanceMeters,
          totalTime: resolvedMetrics.durationSeconds,
        },
      };
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
          providerActiveDurationSeconds: summary.duration_active_accum,
          normalizedPower: summary.power_bike_np_last,
          providerUpdatedAt: incomingProviderRevision,
          startedAt: this.calculateStartTime(summary),
        },
        integrationId: integration.integrationId,
        integrationGeneration: options.integrationGeneration,
        profileId: integration.profileId,
        provider: "wahoo" as const,
        parsedActivity: parsedActivityForAnalysis,
        title: `${resolvedCategory} Activity`,
        type: resolvedCategory,
      });

      // 7. Create activity
      let newActivity: { id: string; noOp?: boolean };
      stage = "persist_activity";
      try {
        options.signal?.throwIfAborted();
        newActivity = await this.deps.submitActivity(activity, parsedActivityForAnalysis, {
          artifactSha256: activityFile.sha256,
          beforePersist,
          ...(options.importRunId ? { importRunId: options.importRunId } : {}),
          ...(options.deferAthleteStateRefresh ? { deferAthleteStateRefresh: true } : {}),
          ...(options.deferPerformanceCalibration ? { deferPerformanceCalibration: true } : {}),
        });
        if (repairCandidate) {
          if (newActivity.id !== repairCandidate.activityId) {
            throw new WahooActivityCanonicalIdentityMismatchError();
          }
        }
      } catch (insertError) {
        if (
          insertError instanceof ImportedActivityAnalysisError &&
          (insertError.code === "activity_laps_invalid" ||
            isUnsupportedActivityAnalysisError(insertError))
        ) {
          logger.warn("Wahoo activity import skipped", {
            operation: "analyze_activity",
            outcome: "unsupported_activity_file",
            provider: "wahoo",
            ...safeWahooImportErrorDetails(insertError, "activity_analysis_failed"),
          });
          return {
            success: true,
            skipped: true,
            reason: "Activity file semantics are unsupported",
            failureReason: "unsupported_activity_file",
          };
        }
        if (insertError instanceof WahooActivityCanonicalIdentityMismatchError) {
          logger.warn("Wahoo activity import skipped", {
            operation: "reconcile_canonical_identity",
            outcome: "canonical_identity_mismatch",
            provider: "wahoo",
          });
          return {
            success: true,
            skipped: true,
            reason: "Provider activity resolves to an existing canonical activity",
          };
        }
        if (insertError instanceof UnsupportedPersistedActivityVersionError) {
          return {
            success: false,
            error: "Wahoo activity has non-current persisted versions",
            errorCode: "unsupported_persisted_version",
            failureReason: "unsupported_persisted_version",
          };
        }
        if (!isExpectedProviderUniqueViolation(insertError)) {
          const errorCode = classifyWahooPersistenceError(insertError);
          if (LIMITED_ACTIVITY_PERSISTENCE_ERROR_CODES.has(errorCode)) {
            logger.warn("Wahoo activity import skipped", {
              operation: "persist_activity",
              outcome: "unsupported_activity_invariant",
              provider: "wahoo",
              ...safeWahooImportErrorDetails(insertError, errorCode),
            });
            return {
              success: true,
              skipped: true,
              reason: "Activity persistence semantics are unsupported",
            };
          }
          logger.warn(WAHOO_ACTIVITY_IMPORT_FAILURE_MESSAGES.persist_activity, {
            operation: "persist_activity",
            outcome: "unexpected_error",
            provider: "wahoo",
            ...safeWahooImportErrorDetails(insertError, errorCode),
          });
          return {
            success: false,
            error: "Wahoo activity persistence failed",
            errorCode,
          };
        }
        // The provider/external-id constraint is the race-safe idempotency authority.
        // A concurrent importer may have committed after our preflight lookup.
        const concurrentImport =
          await this.deps.repository.findImportedActivityByProviderExternalId({
            externalId: summary.id.toString(),
            profileId: integration.profileId,
            provider: "wahoo",
          });
        if (concurrentImport?.profileId === integration.profileId) {
          if (
            isExactRedelivery({
              existing: concurrentImport,
              incomingFileSize: activityFile.size,
              incomingSha256: activityFile.sha256,
              incomingProviderRevision,
            })
          ) {
            options.signal?.throwIfAborted();
            await this.deps.repository.enrichImportedActivitySourceReference({
              activityId: concurrentImport.activityId,
              artifactSha256: activityFile.sha256,
              externalId: summary.id.toString(),
              ...(options.importRunId ? { importRunId: options.importRunId } : {}),
              integrationGeneration: options.integrationGeneration,
              integrationId: integration.integrationId,
              profileId: integration.profileId,
              provider: "wahoo",
              providerUpdatedAt: incomingProviderRevision,
            });
            return {
              success: true,
              skipped: true,
              reason: "Activity already imported",
              activityId: concurrentImport.activityId,
            };
          }
          logger.warn(WAHOO_ACTIVITY_IMPORT_FAILURE_MESSAGES.persist_activity, {
            operation: "persist_activity",
            outcome: "concurrent_revision_requires_retry",
            provider: "wahoo",
          });
          return {
            success: false,
            error: "Wahoo activity persistence failed",
            errorCode: "activity_persistence_failed",
          };
        }
        if (concurrentImport) {
          return {
            success: false,
            error: "Provider activity identity is owned by another profile",
          };
        }
        logger.warn(WAHOO_ACTIVITY_IMPORT_FAILURE_MESSAGES.persist_activity, {
          operation: "persist_activity",
          outcome: "unexpected_error",
          provider: "wahoo",
          ...safeWahooImportErrorDetails(insertError, classifyWahooPersistenceError(insertError)),
        });
        return {
          success: false,
          error: "Wahoo activity persistence failed",
          errorCode: classifyWahooPersistenceError(insertError),
        };
      }

      logger.info("Wahoo activity import completed", {
        operation: "import_activity",
        outcome: "success",
        provider: "wahoo",
      });

      if (newActivity.noOp) {
        return {
          success: true,
          skipped: true,
          reason: "Canonical activity evidence was unchanged",
          activityId: newActivity.id,
        };
      }

      completed = true;

      return {
        success: true,
        activityId: newActivity.id,
      };
    } catch (error) {
      logger.warn(WAHOO_ACTIVITY_IMPORT_FAILURE_MESSAGES[stage], {
        operation: "import_activity",
        outcome: "unexpected_error",
        provider: "wahoo",
        ...safeWahooImportErrorDetails(error, "activity_import_failed"),
      });
      if (stage === "parse_artifact" && error instanceof ActivityFileParseError) {
        return {
          success: true,
          skipped: true,
          reason: "Activity artifact format is unsupported",
          failureReason: "unsupported_activity_file",
        };
      }
      return {
        success: false,
        error: "Wahoo activity import failed",
        errorCode: "activity_import_failed",
      };
    } finally {
      if (!completed && ownedStagePath && this.deps.activityFileStorage.removeOwnedActivityFile) {
        try {
          await this.deps.activityFileStorage.removeOwnedActivityFile(ownedStagePath);
        } catch {
          // The runtime adapter records bounded cleanup authority; never put a
          // storage path or provider identifier in diagnostics.
          logger.warn("Wahoo staged artifact cleanup pending", {
            operation: "cleanup_staged_file",
            outcome: "cleanup_pending",
            provider: "wahoo",
          });
        }
      }
    }
  }

  /**
   * Infer the Wahoo activity type from a Wahoo workout summary
   * In production, this should fetch Wahoo workout details from the Wahoo API
   * to get the actual workout_type_id
   */
  private inferActivityType(summary: WahooWorkoutSummary): WahooActivityType {
    const workoutTypeId = summary.workout?.workout_type_id;
    const mappedActivityType =
      workoutTypeId === undefined ? undefined : WAHOO_WORKOUT_TYPE_MAP[workoutTypeId];
    if (mappedActivityType !== undefined) return mappedActivityType;

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
      if (error instanceof ActivityFileParseError) throw error;
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
    integrationId: string,
    integrationGeneration: number,
    signal?: AbortSignal,
    assertGenerationActive?: () => Promise<void>,
    onStageOwned?: (path: string) => void,
  ): Promise<{ bytes: Uint8Array; path: string; sha256: string; size: number } | null> {
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
        logger.warn("Wahoo activity file rejected", {
          operation: "download_file",
          outcome: "rejected",
          provider: "wahoo",
        });
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
        await assertGenerationActive?.();
        const response = await fetch(activityFileUrl, {
          redirect: "manual",
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
          logger.warn("Wahoo activity file rejected", {
            operation: "download_file",
            outcome: "redirect",
            provider: "wahoo",
          });
          return null;
        }
        if (!response.ok) {
          logger.warn("Wahoo activity file download failed", {
            operation: "download_file",
            outcome: "failure",
            provider: "wahoo",
            status: response.status,
          });
          return null;
        }
        bytes = await readBoundedBody(response);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
      const stagingReservation = await this.deps.stagingCleanup.reserve({
        integrationGeneration,
        integrationId,
        profileId,
        summaryId: workoutSummaryId,
      });
      // Upload outcomes can be uncertain; claim ownership before the call so a
      // failed import makes an immediate best-effort removal attempt. The
      // delayed durable cleanup job remains the recovery authority.
      onStageOwned?.(stagingReservation.path);

      try {
        signal?.throwIfAborted();
        await assertGenerationActive?.();
      } catch (error) {
        await stagingReservation.recordOutcome("not_started");
        throw error;
      }
      try {
        await this.deps.activityFileStorage.uploadActivityFile({
          bytes,
          contentType: "application/octet-stream",
          path: stagingReservation.path,
        });
      } catch {
        logger.warn("Wahoo activity file storage failed", {
          operation: "store_file",
          outcome: "failure",
          provider: "wahoo",
        });
        return null;
      }
      if (!(await stagingReservation.recordOutcome("committed"))) {
        logger.warn("Wahoo activity file outcome is uncertain", {
          operation: "store_file",
          outcome: "uncertain",
          provider: "wahoo",
        });
        return null;
      }

      return {
        bytes,
        path: stagingReservation.path,
        sha256: activityFileSha256(bytes),
        size: bytes.byteLength,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      logger.warn("Wahoo activity file processing failed", {
        operation: "download_file",
        outcome: "failure",
        provider: "wahoo",
      });
      return null;
    }
  }

  private calculateStartTime(summary: WahooWorkoutSummary): string {
    if (!summary.started_at) throw new Error("Wahoo workout summary is missing its start time");
    return summary.started_at;
  }
}

export function createWahooImportActivityFileStorage(
  storageClient: Pick<WahooActivityImportFileStorage, "uploadActivityFile"> &
    Partial<Pick<WahooActivityImportFileStorage, "readActivityFile" | "removeOwnedActivityFile">>,
): WahooActivityImportFileStorage {
  return storageClient;
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
    options: {
      artifactSha256: string;
      beforePersist: (tx: ActivitySubmissionTransaction) => Promise<void>;
      importRunId?: string;
      deferAthleteStateRefresh?: boolean;
      deferPerformanceCalibration?: boolean;
    },
  ): Promise<{ id: string }>;
  generationGuard(
    tx: ActivitySubmissionTransaction,
    expected: { integrationGeneration: number; integrationId: string; profileId: string },
  ): Promise<void>;
  stagingCleanup: WahooStagingCleanupReservation;
}) {
  return new WahooActivityImporter(deps);
}
