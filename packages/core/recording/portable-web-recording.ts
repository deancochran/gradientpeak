import { z } from "zod";
import { realRecordingExecutionSchema } from "./execution-evidence";
import { measuredJournalWithinBounds, measuredRecordingJournalSchema } from "./measured-journal";

import {
  portableWebPlanExecutionStateSchema,
  portableWebRecordingSessionSnapshotSchema,
  recordingGuidanceTimelineSchema,
} from "./portable-timer-draft";

export const PORTABLE_WEB_RECORDING_SCHEMA_VERSION = 1;

const isoTimestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const portableWebRecordingReviewSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(4_000).nullable(),
    perceivedEffort: z.number().int().min(1).max(10).nullable(),
    distanceMeters: z.number().finite().nonnegative(),
    calories: z.number().finite().nonnegative().nullable(),
    distanceEnteredManually: z.boolean().optional(),
    caloriesEnteredManually: z.boolean().optional(),
  })
  .strict();

export const portableWebRecordingArtifactSchema = z
  .object({
    schemaVersion: z.literal(PORTABLE_WEB_RECORDING_SCHEMA_VERSION),
    execution: realRecordingExecutionSchema.optional(),
    ownerId: z.string().min(1),
    recordingSessionId: z.string().min(1).max(200),
    segmentId: z.string().uuid(),
    snapshot: portableWebRecordingSessionSnapshotSchema,
    startedAt: isoTimestampSchema,
    finishedAt: isoTimestampSchema,
    elapsedMs: z.number().int().positive(),
    movingMs: z.number().int().nonnegative(),
    excludedElapsedMs: z.number().int().nonnegative().optional(),
    planExecution: portableWebPlanExecutionStateSchema.optional(),
    guidance: recordingGuidanceTimelineSchema.optional(),
    measuredJournal: measuredRecordingJournalSchema.optional(),
    fileName: z.string().trim().min(1).max(200),
    fileText: z.string().min(1).max(24_000_000),
    sha256: sha256Schema,
    review: portableWebRecordingReviewSchema,
    sessionRpeOperationId: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((artifact, context) => {
    const initial = artifact.guidance?.revisions[0];
    const last = artifact.guidance?.revisions.at(-1);
    if (
      artifact.guidance &&
      (!initial ||
        !last ||
        last.elapsedMs > artifact.elapsedMs ||
        last.activeMs > artifact.movingMs ||
        initial.timestamp !== artifact.snapshot.identity.startedAt ||
        initial.routeId !== artifact.snapshot.activity.routeId ||
        JSON.stringify(initial.plan) !== JSON.stringify(artifact.snapshot.planExecution ?? null) ||
        artifact.guidance.revisions.some(
          (revision) =>
            revision.plan &&
            revision.plan.structure.activity_category !==
              artifact.snapshot.activity.activity_category,
        ))
    ) {
      context.addIssue({
        code: "custom",
        path: ["guidance"],
        message: "Guidance must retain its immutable session identity and bounded timing.",
      });
    }
    if (
      artifact.measuredJournal &&
      !measuredJournalWithinBounds(
        artifact.measuredJournal,
        artifact.startedAt,
        artifact.finishedAt,
        true,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["measuredJournal"],
        message: "Finalized measured evidence must have closed in-session capture windows.",
      });
    }
    if (artifact.recordingSessionId !== artifact.snapshot.identity.sessionId) {
      context.addIssue({
        code: "custom",
        path: ["recordingSessionId"],
        message: "Artifact identity must match the locked session snapshot.",
      });
    }
    if (artifact.startedAt !== artifact.snapshot.identity.startedAt) {
      context.addIssue({
        code: "custom",
        path: ["startedAt"],
        message: "Artifact start must match the locked session snapshot.",
      });
    }
    if (artifact.movingMs > artifact.elapsedMs) {
      context.addIssue({
        code: "custom",
        path: ["movingMs"],
        message: "Moving time must not exceed elapsed time.",
      });
    }
    if (
      Date.parse(artifact.finishedAt) -
        Date.parse(artifact.startedAt) -
        (artifact.excludedElapsedMs ?? 0) !==
      artifact.elapsedMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["elapsedMs"],
        message: "Elapsed time must match the artifact timestamps.",
      });
    }
  });

export const portableWebRecordingSubmissionJobSchema = z
  .object({
    schemaVersion: z.literal(PORTABLE_WEB_RECORDING_SCHEMA_VERSION),
    id: z.string().min(1).max(200),
    artifact: portableWebRecordingArtifactSchema,
    status: z.enum(["queued", "submitting", "retry_wait", "review_required", "submitted"]),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: isoTimestampSchema.nullable(),
    lastError: z.string().min(1).max(200).nullable(),
    activityId: z.string().min(1).nullable(),
    ingestionId: z.string().min(1).nullable().default(null),
    updatedAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((job, context) => {
    if (job.id !== job.artifact.recordingSessionId) {
      context.addIssue({
        code: "custom",
        path: ["id"],
        message: "Submission job identity must match its recording session.",
      });
    }
    if (job.status === "submitted" && !job.activityId) {
      context.addIssue({
        code: "custom",
        path: ["activityId"],
        message: "A submitted job must retain the accepted activity identity.",
      });
    }
    if (job.status === "review_required" && !job.activityId) {
      context.addIssue({
        code: "custom",
        path: ["activityId"],
        message: "A review-required job must retain the saved activity identity.",
      });
    }
  });

export type PortableWebRecordingReview = z.infer<typeof portableWebRecordingReviewSchema>;
export type PortableWebRecordingArtifact = z.infer<typeof portableWebRecordingArtifactSchema>;
export type PortableWebRecordingSubmissionJob = z.infer<
  typeof portableWebRecordingSubmissionJobSchema
>;
