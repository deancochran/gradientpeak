import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  type CompletedActivitySegmentSet,
  completedActivitySegmentSetSchema,
} from "@repo/core/activity-segments";
import { activities, activityFileIngestions, activityPlans, profiles } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type {
  MobileRecordingSubmissionInput,
  RecordingAcceptedArtifact,
} from "../../contracts/recording-submission";
import type { getRequiredDb } from "../../db";
import { createContentAccessPermissions } from "../../permissions/content-access";
import {
  type ActivityArtifactStorage,
  verifyAcceptedActivityArtifact,
} from "../activity-file-ingestion/artifact-storage";
import {
  loadAcceptedArtifactForClaim,
  MobileRecordingUploadError,
  markPreparedMobileRecordingArtifactFailed,
  mobileRecordingOperationKey,
  prepareMobileRecordingArtifact,
  retryMobileRecordingStagingCleanup,
} from "../activity-file-ingestion/mobile-recording-upload";
import {
  type ActivityArtifactSubmission,
  recordingSessionActivityId,
  submitActivity,
} from "./submit-activity";

type DbClient = ReturnType<typeof getRequiredDb>;

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
  const elapsedMs = new Date(input.finishedAt).getTime() - parentStartMs;
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
    const base = {
      id: first.segmentId,
      ordinal,
      role: first.role,
      startOffsetMs: new Date(first.startedAt).getTime() - parentStartMs,
      endOffsetMs: new Date(last.completedAt).getTime() - parentStartMs,
      summary: {
        version: 1 as const,
        timing: {
          timingCoverage: "complete" as const,
          activeMs: Math.round(
            occurrences.reduce((sum, item) => sum + item.activeSeconds, 0) * 1_000,
          ),
          movingMs: Math.round(
            occurrences.reduce((sum, item) => sum + item.movingSeconds, 0) * 1_000,
          ),
        },
        distanceMeters: occurrences.reduce((sum, item) => sum + item.distanceMeters, 0),
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

async function loadAcceptedSubmission(
  db: DbClient,
  input: { profileId: string; replayIdentity: string },
) {
  const activityId = recordingSessionActivityId(input.profileId, input.replayIdentity);
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.profile_id, input.profileId)),
  });
  if (!activity) return null;

  const ingestion = await db.query.activityFileIngestions.findFirst({
    where: and(
      eq(activityFileIngestions.activity_id, activityId),
      eq(activityFileIngestions.profile_id, input.profileId),
      eq(activityFileIngestions.source, "mobile_recording"),
      eq(activityFileIngestions.operation_key, mobileRecordingOperationKey(input.replayIdentity)),
      eq(activityFileIngestions.status, "ready"),
    ),
  });
  if (!ingestion) {
    throw new MobileRecordingSubmissionError(
      "submission_failed",
      "Recording activity is missing its accepted ingestion",
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

function assertReplayMatches(
  input: MobileRecordingSubmissionInput,
  accepted: Awaited<ReturnType<typeof loadAcceptedSubmission>>,
) {
  if (!accepted) return;
  if (input.artifactSource === "uploadedArtifact") {
    if (accepted.ingestion.id !== input.uploadedArtifact.ingestionId) {
      throw new MobileRecordingSubmissionError(
        "conflict",
        "Recording session is already bound to another upload claim",
      );
    }
    return;
  }
  if (
    accepted.acceptedArtifact.sha256 !== input.acceptedArtifact.sha256 ||
    accepted.acceptedArtifact.byteSize !== input.acceptedArtifact.byteSize ||
    accepted.acceptedArtifact.path !== input.acceptedArtifact.path
  ) {
    throw new MobileRecordingSubmissionError(
      "conflict",
      "Recording session is already bound to another accepted artifact",
    );
  }
}

function toActivityArtifactSubmission(
  artifact: RecordingAcceptedArtifact,
): ActivityArtifactSubmission {
  const { originalName, ...required } = artifact;
  return originalName === undefined ? required : { ...required, originalName };
}

async function verifyCompatibilityArtifact(
  storage: ActivityArtifactStorage,
  profileId: string,
  artifact: RecordingAcceptedArtifact,
) {
  try {
    return await verifyAcceptedActivityArtifact(storage, {
      profileId,
      ...toActivityArtifactSubmission(artifact),
    });
  } catch (error) {
    throw new MobileRecordingSubmissionError(
      "artifact_invalid",
      "Accepted recording artifact could not be verified",
      { cause: error },
    );
  }
}

/**
 * Owns deterministic recording submission, claim promotion, the canonical
 * activity transaction, and replay-safe cleanup. Storage work stays outside
 * the transaction; the claim token fences the final relational commit.
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

  let prepared: Awaited<ReturnType<typeof prepareMobileRecordingArtifact>> | null = null;
  let acceptedArtifact: ActivityArtifactSubmission;
  if (submission.artifactSource === "uploadedArtifact") {
    prepared = await prepareMobileRecordingArtifact(db, storage, {
      profileId: submission.profileId,
      recordingSessionId: submission.recordingSessionId,
      ingestionId: submission.uploadedArtifact.ingestionId,
    });
    acceptedArtifact = toActivityArtifactSubmission(prepared.artifact);
  } else {
    acceptedArtifact = await verifyCompatibilityArtifact(
      storage,
      submission.profileId,
      submission.acceptedArtifact,
    );
  }
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
  const operationKey = mobileRecordingOperationKey(replayIdentity);

  try {
    await submitActivity(db, {
      requestedActivityId: activityId,
      profileId: submission.profileId,
      activityPlanId: resolvedActivityPlanId,
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
      normalizedGradedSpeedMps: null,
      efficiencyFactor: null,
      aerobicDecoupling: null,
      avgTemperature: submission.summary.avgTemperature ?? null,
      poolLengthMeters: submission.summary.poolLengthMeters ?? null,
      deviceManufacturer: null,
      deviceProduct: null,
      laps: null,
      mapBounds: null,
      polyline: null,
      analysis: {
        efforts: [],
        detectedLTHR: null,
        activityCompletedAt: new Date(submission.finishedAt),
        ingestion: {
          source: submission.source,
          operationKey,
          artifact: acceptedArtifact,
          fileType: acceptedArtifact.format,
          ...(prepared?.status === "claimed"
            ? {
                ingestionId: prepared.ingestion.id,
                claimToken: prepared.claimToken,
                stagingCleanupPending: true,
              }
            : {}),
        },
      },
    });
  } catch (error) {
    const accepted = await loadAcceptedSubmission(db, replayInput);
    if (accepted) {
      assertReplayMatches(submission, accepted);
      return accepted;
    }
    if (prepared?.status === "claimed" && submission.artifactSource === "uploadedArtifact") {
      await markPreparedMobileRecordingArtifactFailed(db, {
        profileId: submission.profileId,
        recordingSessionId: submission.recordingSessionId,
        ingestionId: prepared.ingestion.id,
        claimToken: prepared.claimToken,
        error,
      });
    }
    if (error instanceof MobileRecordingUploadError) throw error;
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
