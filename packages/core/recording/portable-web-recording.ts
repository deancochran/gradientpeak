import { z } from "zod";

import { recordingSessionSnapshotSchema } from "../schemas/recording-session";

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
  })
  .strict();

export const portableWebRecordingArtifactSchema = z
  .object({
    schemaVersion: z.literal(PORTABLE_WEB_RECORDING_SCHEMA_VERSION),
    ownerId: z.string().min(1),
    recordingSessionId: z.string().min(1).max(200),
    segmentId: z.string().uuid(),
    snapshot: recordingSessionSnapshotSchema,
    startedAt: isoTimestampSchema,
    finishedAt: isoTimestampSchema,
    elapsedMs: z.number().int().positive(),
    movingMs: z.number().int().nonnegative(),
    fileName: z.string().trim().min(1).max(200),
    fileText: z.string().min(1).max(1_000_000),
    sha256: sha256Schema,
    review: portableWebRecordingReviewSchema,
    // v1 artifacts written before Session RPE submission existed omitted this
    // field. Default it while parsing so IndexedDB recovery remains compatible.
    sessionRpeOperationId: z.string().uuid().nullable().default(null),
  })
  .strict()
  .superRefine((artifact, context) => {
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
    if (Date.parse(artifact.finishedAt) - Date.parse(artifact.startedAt) !== artifact.elapsedMs) {
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
