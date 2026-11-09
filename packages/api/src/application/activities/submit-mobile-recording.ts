import { createHash } from "node:crypto";
import {
  activityPlanStructureSchema,
  compileActivityPlan,
  getCanonicalActivityPlanStructureHashInput,
} from "@repo/core/activity-plan";
import {
  type CompletedActivitySegmentSet,
  completedActivitySegmentSetSchema,
} from "@repo/core/activity-segments";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { plannedSessionActivityPlanId } from "@repo/core/calendar";
import {
  recordingGuidanceFromTcx,
  recordingGuidanceWasModified,
} from "@repo/core/recording/guidance";
import { parseActivityFile } from "@repo/core/server/activity-files";
import { safeDecodeFitFile } from "@repo/core/server/fit-sdk-parser";
import { activities, activityPlans, activityRoutes, profiles } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { MobileRecordingSubmissionInput } from "../../contracts/recording-submission";
import type { DrizzleTransactionClient, getRequiredDb } from "../../db";
import {
  createDrizzleActivityIngestionRepository,
  createDrizzlePlannedSessionRepository,
} from "../../infrastructure/repositories";
import { createContentAccessPermissions } from "../../permissions/content-access";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { analyzeAcceptedRecordingArtifactStreams } from "../activity-file-ingestion/analyze-parsed-activity-file";
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
import {
  activityPlanCanonicalStructureHash,
  activityPlanStructureHash,
} from "../activity-plans/structure-hash";
import {
  ManualCompletionReconciliationConflictError,
  reconcileManualPlannedSessionCompletion,
} from "../calendar/reconcile-manual-planned-session-completion";
import { activityArtifactId, recordingSessionActivityId, submitActivity } from "./submit-activity";

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
  const grouped: (typeof input.executionManifest.occurrences)[] = [];
  for (const occurrence of input.executionManifest.occurrences) {
    const entries = grouped.at(-1);
    // Execution evidence identifies prescribed steps, not recorded source legs.
    // A mobile FIT recording has one session unless its observed role/category
    // changes; splitting equal-category steps fabricates multisport legs.
    if (
      entries &&
      entries[0]?.role === occurrence.role &&
      entries[0]?.activity_category === occurrence.activity_category
    )
      entries.push(occurrence);
    else grouped.push([occurrence]);
  }
  // The manifest (and durable artifact journal) includes instantaneous control
  // events. Timeline rows represent elapsed ranges, so no-work groups need no row.
  const timedGroups = grouped.filter((occurrences) => {
    const first = occurrences[0];
    const last = occurrences.at(-1);
    if (!first || !last) throw new Error("Execution manifest segment group must not be empty");
    const start =
      first.timingEvidence?.startOffsetMs ?? Date.parse(first.startedAt) - parentStartMs;
    const end = last.timingEvidence?.endOffsetMs ?? Date.parse(last.completedAt) - parentStartMs;
    if (start !== end) return true;
    if (
      start < 0 ||
      end > elapsedMs ||
      occurrences.some(
        (entry) =>
          entry.activeSeconds !== 0 ||
          entry.movingSeconds !== 0 ||
          entry.distanceMeters !== 0 ||
          (entry.timingEvidence?.startOffsetMs ?? Date.parse(entry.startedAt) - parentStartMs) !==
            start ||
          (entry.timingEvidence?.endOffsetMs ?? Date.parse(entry.completedAt) - parentStartMs) !==
            end,
      )
    ) {
      throw new Error(
        "Zero-duration execution evidence cannot contain recorded work or exceed the session.",
      );
    }
    return false;
  });
  const timelineGroups: (typeof input.executionManifest.occurrences)[] = [];
  for (const group of timedGroups) {
    const previous = timelineGroups.at(-1);
    const last = previous?.at(-1);
    const first = group[0];
    // Removing a no-work activity can make two real rest ranges adjacent. The
    // timeline has one continuous rest range; its distinct occurrence evidence remains.
    if (
      previous &&
      last?.role === "rest" &&
      first?.role === "rest" &&
      (last.timingEvidence?.endOffsetMs ?? Date.parse(last.completedAt) - parentStartMs) ===
        (first.timingEvidence?.startOffsetMs ?? Date.parse(first.startedAt) - parentStartMs)
    ) {
      previous.push(...group);
    } else {
      timelineGroups.push(group);
    }
  }
  const segments = timelineGroups.map((occurrences, ordinal) => {
    const first = occurrences[0];
    const last = occurrences.at(-1);
    if (!first || !last) throw new Error("Execution manifest segment group must not be empty");
    const latest = new Map(occurrences.map((occurrence) => [occurrence.occurrenceId, occurrence]));
    const classifiedOccurrences = [...latest.values()]
      .sort((left, right) => left.globalOrdinal - right.globalOrdinal)
      .flatMap((occurrence) =>
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
    // Completed segments are chronological artifact ranges, not prescription
    // containers. V5 occurrence IDs are not database UUIDs, so derive a stable
    // recording-owned segment ID while retaining the exact occurrence evidence
    // in recordingExecution below.
    const id = recordingSegmentVisitId(input, first.occurrenceId, ordinal);
    const base = {
      id,
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

function recordingPauseRangesBySegment(
  input: MobileRecordingSubmissionInput,
  segmentSet: CompletedActivitySegmentSet,
) {
  const events = input.executionManifest.occurrences
    .flatMap((occurrence) => occurrence.timerEvents)
    .map((event) => ({
      ...event,
      offsetMs: Date.parse(event.timestamp) - Date.parse(input.startedAt),
    }))
    .filter((event) => Number.isFinite(event.offsetMs))
    .sort((left, right) => left.offsetMs - right.offsetMs);
  const ranges: Array<{ startOffsetMs: number; endOffsetMs: number }> = [];
  let pausedAt: number | null = null;
  for (const event of events) {
    if (event.type === "pause") pausedAt ??= event.offsetMs;
    if (event.type === "resume" && pausedAt !== null && event.offsetMs > pausedAt) {
      ranges.push({ startOffsetMs: pausedAt, endOffsetMs: event.offsetMs });
      pausedAt = null;
    }
  }
  return new Map(
    segmentSet.segments.map((segment) => [
      segment.id,
      ranges.flatMap((range) => {
        const startOffsetMs = Math.max(range.startOffsetMs, segment.startOffsetMs);
        const endOffsetMs = Math.min(range.endOffsetMs, segment.endOffsetMs);
        return startOffsetMs < endOffsetMs ? [{ startOffsetMs, endOffsetMs }] : [];
      }),
    ]),
  );
}

function recordingSegmentVisitId(
  input: MobileRecordingSubmissionInput,
  segmentId: string,
  ordinal: number,
): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        "recording-segment-visit",
        input.profileId,
        input.recordingSessionId,
        segmentId,
        ordinal,
      ]),
    )
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
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

function assertDeclaredPrescriptionHashes(submission: MobileRecordingSubmissionInput): void {
  const execution = submission.planExecution;
  if (!execution) return;
  if (activityPlanCanonicalStructureHash(execution.structure) !== execution.structureHash) {
    throw new MobileRecordingSubmissionError(
      "manifest_invalid",
      "Recording prescription structure hash does not match its V3 structure",
    );
  }
  const prescription = execution.plannedSession?.prescription;
  if (
    prescription &&
    activityPlanStructureHash(prescription.resolutionManifest.resolved_structure) !==
      prescription.resolutionManifest.resolved_structure_hash
  ) {
    throw new MobileRecordingSubmissionError(
      "manifest_invalid",
      "Planned-session prescription structure hash does not match its V3 structure",
    );
  }
}

function sameCanonicalStructure(left: unknown, right: unknown): boolean {
  return (
    getCanonicalActivityPlanStructureHashInput(left) ===
    getCanonicalActivityPlanStructureHashInput(right)
  );
}

async function verifyScheduledRecordingProvenance(input: {
  repository: PlannedSessionRepositoryPort;
  submission: MobileRecordingSubmissionInput;
  activityId: string;
  linkedAt: Date;
  allowLink: boolean;
  validateOnly?: boolean;
  reconciliationOperationId?: string;
  tx?: DrizzleTransactionClient;
}): Promise<void> {
  const execution = input.submission.planExecution;
  const submittedSession = execution?.plannedSession;
  if (!execution || !submittedSession) return;
  const authoritative = await input.repository.getOwned({
    profileId: input.submission.profileId,
    sessionId: submittedSession.id,
  });
  if (!authoritative) {
    throw new MobileRecordingSubmissionError(
      "forbidden",
      "Planned-session recording provenance is unavailable",
    );
  }

  const submitted = submittedSession.prescription;
  const fieldsMatch =
    stringifyCanonicalJson(submittedSession.source) ===
      stringifyCanonicalJson(authoritative.source) &&
    execution.activityPlanId === plannedSessionActivityPlanId(authoritative) &&
    input.submission.activityPlanId === execution.activityPlanId &&
    execution.activityPlanId === submitted.resolutionManifest.activity_plan_id &&
    execution.activityPlanRevision === submitted.resolutionManifest.activity_plan_revision &&
    execution.structureHash === submitted.resolutionManifest.resolved_structure_hash &&
    sameCanonicalStructure(execution.structure, submitted.resolutionManifest.resolved_structure) &&
    sameCanonicalStructure(submitted.resolutionManifest.resolved_structure, execution.structure) &&
    activityPlanStructureHash(execution.structure) === execution.structureHash;
  if (!fieldsMatch) {
    throw new MobileRecordingSubmissionError(
      "conflict",
      "Recording provenance does not match its planned-session association",
    );
  }
  if (input.validateOnly) return;
  const outcome = scheduledRecordingOutcome(input.submission);

  if (authoritative.lifecycle.status === "completed") {
    const exactReplay =
      authoritative.lifecycle.completion.state === "linked" &&
      authoritative.lifecycle.completion.activityId === input.activityId &&
      authoritative.sessionRevision >= submittedSession.sessionRevision + 1;
    if (exactReplay) return;
    if (
      authoritative.lifecycle.completion.state === "linked" &&
      input.allowLink &&
      input.tx &&
      input.reconciliationOperationId
    ) {
      try {
        const reconciled = await reconcileManualPlannedSessionCompletion({
          tx: input.tx,
          profileId: input.submission.profileId,
          sessionId: submittedSession.id,
          expectedRevision: authoritative.sessionRevision,
          activityId: input.activityId,
          operationId: input.reconciliationOperationId,
          reconciledAt: input.linkedAt,
          outcome,
        });
        if (
          reconciled.session.lifecycle.status === "completed" &&
          reconciled.session.lifecycle.completion.state === "linked" &&
          reconciled.session.lifecycle.completion.outcome === outcome
        )
          return;
      } catch (error) {
        if (!(error instanceof ManualCompletionReconciliationConflictError)) throw error;
        // A trusted recording may only replace the bounded manual placeholder.
      }
    }
    throw new MobileRecordingSubmissionError(
      "conflict",
      "Planned session is already completed by another activity",
    );
  }
  if (
    authoritative.lifecycle.status !== "scheduled" ||
    authoritative.sessionRevision !== submittedSession.sessionRevision ||
    !input.allowLink
  ) {
    throw new MobileRecordingSubmissionError(
      "conflict",
      "Planned session changed after recording launch",
    );
  }

  const linked = await input.repository.mutateOwned({
    action: "link_completion",
    profileId: input.submission.profileId,
    sessionId: submittedSession.id,
    expectedRevision: submittedSession.sessionRevision,
    activityId: input.activityId,
    outcome,
    linkedAt: input.linkedAt.toISOString(),
  });
  if (
    linked.status !== "updated" ||
    linked.session.lifecycle.status !== "completed" ||
    linked.session.lifecycle.completion.state !== "linked" ||
    linked.session.lifecycle.completion.activityId !== input.activityId ||
    linked.session.lifecycle.completion.outcome !== outcome
  ) {
    throw new MobileRecordingSubmissionError(
      "conflict",
      "Planned-session completion could not be linked atomically",
    );
  }
}

function scheduledRecordingOutcome(submission: MobileRecordingSubmissionInput): "full" | "partial" {
  if (recordingGuidanceWasModified(submission.guidance)) return "partial";
  const execution = submission.planExecution;
  if (!execution) return "partial";
  // Legacy mobile results record skip, advance, and early finish identically.
  // Neither ID coverage nor measured duration can recover their terminal intent.
  // Preserve the historical calendar policy for wholly unclassified legacy
  // payloads (including queued artifacts), WITHOUT synthesizing step evidence.
  // Explicit null is unfinished evidence, not legacy absence. Web timer payloads
  // and mixed recovered legacy/new results always use the conservative path below.
  if (
    submission.sessionTiming === undefined &&
    submission.executionManifest.occurrences.length > 0 &&
    submission.executionManifest.occurrences.every((entry) => entry.completion === undefined)
  )
    return "full";
  const prescribed = compileActivityPlan(execution.structure).occurrences;
  // A later unclassified visit supersedes an earlier completion just as a later
  // skip does. Session-local continuation cannot complete a prescribed step.
  const latest = new Map(
    submission.executionManifest.occurrences.map((entry) => [entry.occurrenceId, entry]),
  );
  return prescribed.length > 0 &&
    prescribed.every((occurrence) => {
      const final = latest.get(occurrence.occurrenceId);
      return (
        final?.completion?.status === "completed" &&
        final.stepId === occurrence.stepId &&
        final.repeatId === occurrence.repeatId &&
        final.repeatIteration === occurrence.repeatIteration &&
        final.role === occurrence.role &&
        final.activity_category === occurrence.activity_category
      );
    })
    ? "full"
    : "partial";
}

async function verifyAcceptedScheduledRecording(
  db: DbClient,
  submission: MobileRecordingSubmissionInput,
  activityId: string,
): Promise<void> {
  if (!submission.planExecution?.plannedSession) return;
  await verifyScheduledRecordingProvenance({
    repository: createDrizzlePlannedSessionRepository(db),
    submission,
    activityId,
    linkedAt: new Date(),
    allowLink: false,
  });
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
  assertDeclaredPrescriptionHashes(submission);

  const replayIdentity = submissionReplayIdentity(submission);
  const replayInput = { profileId: submission.profileId, replayIdentity };
  const replay = await loadAcceptedSubmission(db, replayInput);
  if (replay) {
    assertReplayMatches(submission, replay);
    await verifyAcceptedScheduledRecording(db, submission, replay.activity.id);
    await retryMobileRecordingStagingCleanup(db, storage, {
      profileId: submission.profileId,
      ingestion: replay.ingestion,
    });
    return replay;
  }
  const scheduledPrescription = submission.planExecution?.plannedSession?.prescription;
  if (submission.planExecution?.scheduledEventId && !scheduledPrescription) {
    throw new MobileRecordingSubmissionError(
      "manifest_invalid",
      "Scheduled recording identifiers require an immutable planned-session snapshot",
    );
  }
  // A scheduled execution has already captured its plan at launch. The durable
  // planned-session reference (validated during composition) authorizes this
  // activity-plan association without re-reading a mutable plan at submission.
  const resolvedActivityPlanId = scheduledPrescription
    ? (submission.planExecution?.activityPlanId ?? null)
    : await resolveRecordingActivityPlanId(db, {
        activityPlanId: submission.activityPlanId,
        profileId: submission.profileId,
      });
  if (submission.planExecution?.plannedSession) {
    await verifyScheduledRecordingProvenance({
      repository: createDrizzlePlannedSessionRepository(db),
      submission,
      activityId: recordingSessionActivityId(submission.profileId, replayIdentity),
      linkedAt: new Date(),
      allowLink: false,
      validateOnly: true,
    });
  }
  const resolvedRouteId = await resolveRecordingRouteId(db, {
    profileId: submission.profileId,
    routeId: submission.routeId,
  });
  if (submission.guidance) {
    const planIds = new Set<string>();
    const routeIds = new Set<string>();
    for (const revision of submission.guidance.revisions) {
      if (revision.plan) {
        assertDeclaredPrescriptionHashes({ ...submission, planExecution: revision.plan });
        planIds.add(revision.plan.activityPlanId);
      }
      if (revision.routeId) routeIds.add(revision.routeId);
    }
    for (const activityPlanId of planIds) {
      await resolveRecordingActivityPlanId(db, { profileId: submission.profileId, activityPlanId });
    }
    for (const routeId of routeIds) {
      await resolveRecordingRouteId(db, { profileId: submission.profileId, routeId });
    }
  }
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
    await verifyAcceptedScheduledRecording(db, submission, accepted.activity.id);
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
      parse: () => {
        const recorded =
          prepared.staging.format === "tcx"
            ? recordingGuidanceFromTcx(new TextDecoder().decode(prepared.staging.bytes))
            : undefined;
        if (recorded || submission.guidance) {
          // TCX is JSON-serialized, whereas SuperJSON retains explicitly undefined
          // optional fields. Compare the validated JSON representations, not the
          // transport-specific presence of optional undefined properties.
          if (
            stringifyCanonicalJson(JSON.parse(JSON.stringify(recorded ?? null))) !==
            stringifyCanonicalJson(JSON.parse(JSON.stringify(submission.guidance ?? null)))
          ) {
            throw new MobileRecordingSubmissionError(
              "manifest_invalid",
              "Guidance metadata must match the accepted recording artifact.",
            );
          }
        }
        assertMobileRecordingArtifactHasNoPosition({
          bytes: prepared.staging.bytes,
          format: prepared.staging.format,
        });
        try {
          return parseActivityFile({
            data: prepared.staging.bytes,
            fileType: prepared.staging.format,
          });
        } catch (error) {
          throw new MobileRecordingSubmissionError(
            "artifact_invalid",
            "Recording artifact is invalid",
            { cause: error },
          );
        }
      },
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
      submit: async ({ artifact, parsedData }) => {
        const acceptedArtifactId = activityArtifactId(
          submission.profileId,
          artifact.sha256,
          artifact.byteSize,
        );
        // Execution boundaries remain recorder-owned, but derived sensor evidence
        // must be bound to the immutable accepted artifact before reconciliation.
        const acceptedSegments = completedActivitySegmentSetSchema.parse({
          ...segmentSet,
          segments: segmentSet.segments.map((segment) => ({
            ...segment,
            source: {
              kind: "artifact",
              artifactId: acceptedArtifactId,
              source: { standard: artifact.format, format: artifact.format },
            },
          })),
        });
        const analysis = analyzeAcceptedRecordingArtifactStreams({
          activityId,
          profileId: submission.profileId,
          startedAt: new Date(submission.startedAt),
          segmentSet: acceptedSegments,
          records: parsedData.records,
          artifactId: acceptedArtifactId,
          pauseRangesBySegment: recordingPauseRangesBySegment(submission, segmentSet),
        });
        return submitActivity(db, {
          requestedActivityId: activityId,
          profileId: submission.profileId,
          activityPlanId: resolvedActivityPlanId,
          routeId: resolvedRouteId,
          name: submission.name,
          nameStrategy: "provided",
          notes: submission.notes ?? null,
          contentVisibility,
          startedAt: new Date(submission.startedAt),
          finishedAt: new Date(submission.finishedAt),
          elapsedMs: segmentSet.elapsedMs,
          // The aggregate persistence contract requires paired active/moving evidence.
          // Known manual active time remains in each segment's partial timing summary.
          activeMs: timing.activeMs,
          movingMs: timing.movingMs,
          timingCoverage: timing.timingCoverage,
          segmentSet: analysis.segmentSet,
          // A TCX lap total can be manually entered and this no-GPS recording
          // flow has no accepted cumulative-distance stream contract. Preserve
          // the explicit manual-distance provenance rather than mislabeling a
          // parsed total as measured sensor evidence.
          distanceMeters: submission.summary.distanceMeters,
          calories: submission.summary.calories ?? null,
          elevationGainMeters: submission.summary.elevationGainMeters ?? null,
          avgHeartRate: analysis.summary.avgHeartRate,
          maxHeartRate: analysis.summary.maxHeartRate,
          avgPower: analysis.summary.avgPower,
          maxPower: analysis.summary.maxPower,
          avgCadence: analysis.summary.avgCadence,
          maxCadence: analysis.summary.maxCadence,
          avgSpeedMps: analysis.summary.avgSpeedMps,
          maxSpeedMps: analysis.summary.maxSpeedMps,
          normalizedSpeedMps: analysis.summary.normalizedSpeedMps,
          avgTemperature: submission.summary.avgTemperature ?? null,
          poolLengthMeters: submission.summary.poolLengthMeters ?? null,
          deviceManufacturer: null,
          deviceProduct: null,
          laps: submission.laps ?? [],
          mapBounds: null,
          polyline: null,
          ...(submission.planExecution?.plannedSession
            ? {
                composition: {
                  persist: (tx, { activityId: acceptedActivityId, now }) =>
                    verifyScheduledRecordingProvenance({
                      repository: createDrizzlePlannedSessionRepository(tx),
                      tx,
                      submission,
                      activityId: acceptedActivityId,
                      linkedAt: now,
                      allowLink: true,
                      reconciliationOperationId: operationId,
                    }),
                },
              }
            : {}),
          analysis: {
            efforts: analysis.efforts,
            detectedLTHR: analysis.detectedLTHR,
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
        });
      },
    });
  } catch (error) {
    const accepted = await loadAcceptedSubmission(db, replayInput);
    if (accepted) {
      assertReplayMatches(submission, accepted);
      await verifyAcceptedScheduledRecording(db, submission, accepted.activity.id);
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
  await verifyAcceptedScheduledRecording(db, submission, accepted.activity.id);
  await retryMobileRecordingStagingCleanup(db, storage, {
    profileId: submission.profileId,
    ingestion: accepted.ingestion,
  });
  return accepted;
}
