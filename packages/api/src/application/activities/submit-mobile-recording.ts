import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  type CompletedActivitySegmentSet,
  completedActivitySegmentSetSchema,
} from "@repo/core/activity-segments";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { parseActivityFile } from "@repo/core/server/activity-files";
import { safeDecodeFitFile } from "@repo/core/server/fit-sdk-parser";
import { activities, activityPlans, activityRoutes, profiles } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { MobileRecordingSubmissionInput } from "../../contracts/recording-submission";
import type { getRequiredDb } from "../../db";
import { createDrizzleActivityIngestionRepository } from "../../infrastructure/repositories";
import { createContentAccessPermissions } from "../../permissions/content-access";
import type { ActivityArtifactStorage } from "../activity-file-ingestion/artifact-storage";
import {
  completeActivityIngestionCleanup,
  deferActivityIngestionCleanup,
  failActivityIngestion,
} from "../activity-file-ingestion/direct-activity-ingestion";
import { finalizeActivityArtifactIngestion } from "../activity-file-ingestion/finalize-activity-artifact-ingestion";
import {
  loadAcceptedArtifactForClaim,
  MobileRecordingUploadError,
  mobileRecordingOperationId,
  prepareMobileRecordingArtifact,
  retryMobileRecordingStagingCleanup,
} from "../activity-file-ingestion/mobile-recording-upload";
import { recordingSessionActivityId, submitActivity } from "./submit-activity";

type DbClient = ReturnType<typeof getRequiredDb>;
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

export type MobileRecordingSubmissionFailureCode =
  | "artifact_invalid"
  | "conflict"
  | "forbidden"
  | "manifest_invalid"
  | "submission_failed";

export class MobileRecordingSubmissionError extends Error {
  constructor(
    readonly code: MobileRecordingSubmissionFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MobileRecordingSubmissionError";
  }
}

function aggregateSegmentTiming(segmentSet: CompletedActivitySegmentSet) {
  const timings = segmentSet.segments.map((segment) => segment.summary.timing);
  const complete = timings.every((timing) => timing.timingCoverage === "complete");
  return {
    activeMs: complete
      ? timings.reduce(
          (sum, timing) => sum + ("activeMs" in timing ? (timing.activeMs ?? 0) : 0),
          0,
        )
      : null,
    movingMs: complete
      ? timings.reduce(
          (sum, timing) => sum + ("movingMs" in timing ? (timing.movingMs ?? 0) : 0),
          0,
        )
      : null,
    timingCoverage: complete ? ("complete" as const) : ("partial" as const),
  };
}

function segmentSetFromExecutionManifest(input: MobileRecordingSubmissionInput) {
  const parentStartMs = new Date(input.startedAt).getTime();
  const elapsedMs =
    input.sessionTiming?.elapsedMs ?? new Date(input.finishedAt).getTime() - parentStartMs;
  const grouped = new Map<string, (typeof input.executionManifest.occurrences)[number][]>();
  for (const occurrence of input.executionManifest.occurrences) {
    const entries = grouped.get(occurrence.segmentId) ?? [];
    entries.push(occurrence);
    grouped.set(occurrence.segmentId, entries);
  }
  const segments = [...grouped.values()].map((occurrences, ordinal) => {
    const first = occurrences[0];
    const last = occurrences.at(-1);
    if (!first || !last) throw new Error("Execution manifest segment group must not be empty");
    const classifiedOccurrences = occurrences.flatMap((occurrence) =>
      occurrence.completion
        ? [
            {
              occurrenceId: occurrence.occurrenceId,
              globalOrdinal: occurrence.globalOrdinal,
              completion: occurrence.completion,
            },
          ]
        : [],
    );
    const base = {
      id: first.segmentId,
      ordinal,
      role: first.role,
      startOffsetMs:
        first.timingEvidence?.startOffsetMs ?? new Date(first.startedAt).getTime() - parentStartMs,
      endOffsetMs:
        last.timingEvidence?.endOffsetMs ?? new Date(last.completedAt).getTime() - parentStartMs,
      summary: {
        version: 1 as const,
        normalizedPowerResult: unavailableNormalizedPowerResult,
        timing: input.sessionTiming
          ? {
              timingCoverage: "partial" as const,
              activeMs: Math.round(
                occurrences.reduce((sum, item) => sum + item.activeSeconds, 0) * 1_000,
              ),
            }
          : {
              timingCoverage: "complete" as const,
              activeMs: Math.round(
                occurrences.reduce((sum, item) => sum + item.activeSeconds, 0) * 1_000,
              ),
              movingMs: Math.round(
                occurrences.reduce((sum, item) => sum + item.movingSeconds, 0) * 1_000,
              ),
            },
        distanceMeters: occurrences.reduce((sum, item) => sum + item.distanceMeters, 0),
        ...(classifiedOccurrences.length > 0
          ? {
              recordingExecution: {
                version: 1 as const,
                source: "recording_execution_manifest" as const,
                coverage:
                  classifiedOccurrences.length === occurrences.length
                    ? ("complete" as const)
                    : ("partial" as const),
                occurrenceCount: occurrences.length,
                occurrences: classifiedOccurrences,
              },
            }
          : {}),
      },
    };
    if (first.role === "activity") {
      return { ...base, role: "activity" as const, activity_category: first.activity_category };
    }
    return { ...base, role: first.role };
  });
  return completedActivitySegmentSetSchema.parse({ version: 1, elapsedMs, segments });
}

async function loadDefaultContentVisibility(db: DbClient, profileId: string) {
  const [profile] = await db
    .select({ defaultContentVisibility: profiles.default_content_visibility })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return profile?.defaultContentVisibility ?? "private";
}

async function resolveRecordingActivityPlanId(
  db: DbClient,
  input: { activityPlanId: string | null | undefined; profileId: string },
) {
  if (!input.activityPlanId) return null;

  const [plan] = await db
    .select({
      id: activityPlans.id,
      contentVisibility: activityPlans.content_visibility,
      isSystem: activityPlans.is_system_template,
      ownerProfileId: activityPlans.profile_id,
      structure: activityPlans.structure,
    })
    .from(activityPlans)
    .where(eq(activityPlans.id, input.activityPlanId))
    .limit(1);
  if (!plan) {
    throw new MobileRecordingSubmissionError(
      "forbidden",
      "Activity plan is not available for mobile recording",
    );
  }
  if (plan.ownerProfileId !== input.profileId) {
    throw new MobileRecordingSubmissionError(
      "forbidden",
      "Activity plan is not available for mobile recording",
    );
  }

  const access = await createContentAccessPermissions(db).canReadForRow({
    actorProfileId: input.profileId,
    resource: { type: "activity_plan", id: plan.id },
    row: {
      ownerProfileId: plan.ownerProfileId,
      isPublic: plan.contentVisibility === "public",
      visibility: plan.contentVisibility,
      isSystem: plan.isSystem,
    },
  });
  if (!access.allowed) {
    throw new MobileRecordingSubmissionError(
      "forbidden",
      "Activity plan is not available for mobile recording",
    );
  }

  if (!activityPlanStructureSchema.safeParse(plan.structure).success) {
    throw new MobileRecordingSubmissionError(
      "forbidden",
      "Activity plan is not available for mobile recording",
    );
  }

  return plan.id;
}

async function resolveRecordingRouteId(
  db: DbClient,
  input: { profileId: string; routeId: string | null | undefined },
) {
  if (!input.routeId) return null;
  const [route] = await db
    .select({ id: activityRoutes.id })
    .from(activityRoutes)
    .where(
      and(
        eq(activityRoutes.id, input.routeId),
        eq(activityRoutes.profile_id, input.profileId),
        eq(activityRoutes.storage_state, "ready"),
      ),
    )
    .limit(1);
  if (!route) {
    throw new MobileRecordingSubmissionError("forbidden", "Route is not available for recording");
  }
  return route.id;
}

async function loadAcceptedSubmission(
  db: DbClient,
  input: { profileId: string; replayIdentity: string },
) {
  const ingestion = await createDrizzleActivityIngestionRepository(db).getOwnedByOperation({
    profileId: input.profileId,
    operationId: mobileRecordingOperationId(input.replayIdentity),
  });
  if (!ingestion || ingestion.status !== "succeeded") return null;
  if (ingestion.source !== "mobile_recording" || !ingestion.activityId) {
    throw new MobileRecordingSubmissionError(
      "submission_failed",
      "Recording activity is missing its accepted ingestion",
    );
  }
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, ingestion.activityId), eq(activities.profile_id, input.profileId)),
  });
  if (!activity) {
    throw new MobileRecordingSubmissionError(
      "submission_failed",
      "Recording ingestion is missing its accepted activity",
    );
  }
  const acceptedArtifact = await loadAcceptedArtifactForClaim(db, ingestion);
  if (!acceptedArtifact) {
    throw new MobileRecordingSubmissionError(
      "submission_failed",
      "Recording ingestion is missing its accepted artifact",
    );
  }
  return { activity, ingestion, acceptedArtifact };
}

function submissionReplayIdentity(submission: MobileRecordingSubmissionInput) {
  return submission.recordingSessionId;
}

const fitPositionFieldNames = new Set([
  "positionLat",
  "positionLong",
  "startPositionLat",
  "startPositionLong",
  "endPositionLat",
  "endPositionLong",
  "necLat",
  "necLong",
  "swcLat",
  "swcLong",
  "destinationLat",
  "destinationLong",
]);

function rawArtifactContainsPosition(input: { bytes: Uint8Array; format: "fit" | "gpx" | "tcx" }) {
  if (input.format === "fit") {
    const decoded = safeDecodeFitFile(Buffer.from(input.bytes));
    return Object.values(decoded.messages ?? {}).some((messages) =>
      messages.some((message) =>
        Object.entries(message).some(
          ([field, value]) =>
            fitPositionFieldNames.has(field) && value !== undefined && value !== null,
        ),
      ),
    );
  }

  const xml = new TextDecoder().decode(input.bytes);
  return (
    /\b(?:lat|lon)\s*=/iu.test(xml) ||
    /<(?:[\w.-]+:)?(?:LatitudeDegrees|LongitudeDegrees)\b/iu.test(xml)
  );
}

function assertMobileRecordingArtifactHasNoPosition(input: {
  bytes: Uint8Array;
  format: "fit" | "gpx" | "tcx";
}) {
  let parsed: ReturnType<typeof parseActivityFile>;
  try {
    parsed = parseActivityFile({ data: input.bytes, fileType: input.format });
  } catch (error) {
    throw new MobileRecordingSubmissionError("artifact_invalid", "Recording artifact is invalid", {
      cause: error,
    });
  }

  if (
    rawArtifactContainsPosition(input) ||
    parsed.records.some(
      (record) => record.positionLat !== undefined || record.positionLong !== undefined,
    )
  ) {
    throw new MobileRecordingSubmissionError(
      "artifact_invalid",
      "Live recording artifacts cannot contain location data",
    );
  }
}

function assertReplayMatches(
  input: MobileRecordingSubmissionInput,
  accepted: Awaited<ReturnType<typeof loadAcceptedSubmission>>,
) {
  if (!accepted) return;
  if (accepted.ingestion.id !== input.uploadedArtifact.ingestionId) {
    throw new MobileRecordingSubmissionError(
      "conflict",
      "Recording session is already bound to another upload claim",
    );
  }
}

/**
 * Owns deterministic recording submission, artifact promotion, the canonical
 * activity transaction, and replay-safe cleanup. Storage work stays outside
 * the transaction; the ingestion identity is checked in the final commit.
 */
export async function submitMobileRecording(
  db: DbClient,
  storage: ActivityArtifactStorage,
  input: { actorProfileId: string; submission: MobileRecordingSubmissionInput },
) {
  const { submission } = input;
  if (submission.profileId !== input.actorProfileId) {
    throw new MobileRecordingSubmissionError(
      "forbidden",
      "Cannot create activities for other profiles",
    );
  }

  const replayIdentity = submissionReplayIdentity(submission);
  const replayInput = { profileId: submission.profileId, replayIdentity };
  const replay = await loadAcceptedSubmission(db, replayInput);
  if (replay) {
    assertReplayMatches(submission, replay);
    await retryMobileRecordingStagingCleanup(db, storage, {
      profileId: submission.profileId,
      ingestion: replay.ingestion,
    });
    return replay;
  }
  const resolvedActivityPlanId = await resolveRecordingActivityPlanId(db, {
    activityPlanId: submission.activityPlanId,
    profileId: submission.profileId,
  });
  const resolvedRouteId = await resolveRecordingRouteId(db, {
    profileId: submission.profileId,
    routeId: submission.routeId,
  });
  let segmentSet: CompletedActivitySegmentSet;
  try {
    segmentSet = segmentSetFromExecutionManifest(submission);
  } catch (error) {
    throw new MobileRecordingSubmissionError(
      "manifest_invalid",
      "Invalid recording execution manifest",
      { cause: error },
    );
  }
  if (!segmentSet.segments.some((segment) => segment.role === "activity")) {
    throw new MobileRecordingSubmissionError("manifest_invalid", "An activity segment is required");
  }

  const contentVisibility =
    submission.content_visibility ?? (await loadDefaultContentVisibility(db, submission.profileId));
  const timing = aggregateSegmentTiming(segmentSet);

  const prepared = await prepareMobileRecordingArtifact(db, storage, {
    profileId: submission.profileId,
    recordingSessionId: submission.recordingSessionId,
    ingestionId: submission.uploadedArtifact.ingestionId,
  });
  if (prepared?.status === "ready") {
    const accepted = await loadAcceptedSubmission(db, replayInput);
    if (!accepted) {
      throw new MobileRecordingSubmissionError(
        "submission_failed",
        "Ready recording upload claim is missing its activity",
      );
    }
    assertReplayMatches(submission, accepted);
    await retryMobileRecordingStagingCleanup(db, storage, {
      profileId: submission.profileId,
      ingestion: accepted.ingestion,
    });
    return accepted;
  }
  const activityId = recordingSessionActivityId(submission.profileId, replayIdentity);
  const operationId = mobileRecordingOperationId(replayIdentity);

  try {
    if (prepared.status !== "processing") {
      throw new MobileRecordingSubmissionError(
        "submission_failed",
        "Recording upload claim could not be finalized",
      );
    }
    await finalizeActivityArtifactIngestion(db, {
      profileId: submission.profileId,
      storage,
      bucket: prepared.staging.bucket,
      stagingPath: prepared.staging.path,
      bytes: prepared.staging.bytes,
      format: prepared.staging.format,
      mediaType: prepared.staging.mediaType,
      ...(prepared.ingestion.expectedSha256
        ? { expectedSha256: prepared.ingestion.expectedSha256 }
        : {}),
      parse: () =>
        assertMobileRecordingArtifactHasNoPosition({
          bytes: prepared.staging.bytes,
          format: prepared.staging.format,
        }),
      onFailure: async (stage) => {
        await failActivityIngestion(db, {
          profileId: submission.profileId,
          ingestionId: prepared.ingestion.id,
          failureCode:
            stage === "hash"
              ? "hash_mismatch"
              : stage === "promotion"
                ? "promotion_failed"
                : stage === "parse"
                  ? "invalid_activity"
                  : "internal",
          retryable: stage === "promotion" || stage === "persistence",
        });
      },
      onCleanup: async ({ cleaned }) => {
        if (cleaned) {
          await completeActivityIngestionCleanup(db, {
            profileId: submission.profileId,
            ingestionId: prepared.ingestion.id,
          });
        } else {
          await deferActivityIngestionCleanup(db, {
            profileId: submission.profileId,
            ingestionId: prepared.ingestion.id,
          });
        }
      },
      submit: async ({ artifact }) =>
        submitActivity(db, {
          requestedActivityId: activityId,
          profileId: submission.profileId,
          activityPlanId: resolvedActivityPlanId,
          routeId: resolvedRouteId,
          name: submission.name,
          notes: submission.notes ?? null,
          contentVisibility,
          startedAt: new Date(submission.startedAt),
          finishedAt: new Date(submission.finishedAt),
          elapsedMs: segmentSet.elapsedMs,
          activeMs: timing.activeMs,
          movingMs: timing.movingMs,
          timingCoverage: timing.timingCoverage,
          segmentSet,
          distanceMeters: submission.summary.distanceMeters,
          calories: submission.summary.calories ?? null,
          elevationGainMeters: submission.summary.elevationGainMeters ?? null,
          avgHeartRate: null,
          maxHeartRate: null,
          avgPower: null,
          maxPower: null,
          avgCadence: null,
          maxCadence: null,
          avgSpeedMps: null,
          maxSpeedMps: null,
          normalizedSpeedMps: null,
          avgTemperature: submission.summary.avgTemperature ?? null,
          poolLengthMeters: submission.summary.poolLengthMeters ?? null,
          deviceManufacturer: null,
          deviceProduct: null,
          laps: submission.laps ?? [],
          mapBounds: null,
          polyline: null,
          analysis: {
            efforts: [],
            detectedLTHR: null,
            ingestion: {
              source: submission.source,
              operationId,
              artifact: {
                sha256: artifact.sha256,
                byteSize: artifact.byteSize,
                bucket: artifact.bucket,
                path: artifact.path,
                mediaType: artifact.mediaType,
                format: artifact.format,
                originalName: null,
              },
              fileType: artifact.format,
              ingestionId: prepared.ingestion.id,
              stagingCleanupPending: true,
            },
          },
        }),
    });
  } catch (error) {
    const accepted = await loadAcceptedSubmission(db, replayInput);
    if (accepted) {
      assertReplayMatches(submission, accepted);
      return accepted;
    }
    if (
      error instanceof MobileRecordingUploadError ||
      error instanceof MobileRecordingSubmissionError
    ) {
      throw error;
    }
    throw new MobileRecordingSubmissionError(
      "submission_failed",
      "Recording activity could not be committed",
      { cause: error },
    );
  }

  const accepted = await loadAcceptedSubmission(db, replayInput);
  if (!accepted) {
    throw new MobileRecordingSubmissionError(
      "submission_failed",
      "Committed recording activity could not be loaded",
    );
  }
  await retryMobileRecordingStagingCleanup(db, storage, {
    profileId: submission.profileId,
    ingestion: accepted.ingestion,
  });
  return accepted;
}
