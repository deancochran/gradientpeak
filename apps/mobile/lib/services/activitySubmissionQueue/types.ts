import {
  canonicalSportSchema,
  contentVisibilitySchema,
  recordingExecutionManifestSchema,
} from "@repo/core";
import { z } from "zod";

export type ActivitySubmissionQueueJobStatus =
  | "draft"
  | "creating_activity"
  | "queued"
  | "uploading"
  | "processing"
  | "complete"
  | "failed";
const activitySubmissionQueueJobStatusSchema = z.enum([
  "draft",
  "creating_activity",
  "queued",
  "uploading",
  "processing",
  "complete",
  "failed",
]);

export const activitySubmissionQueueDraftSchema = z
  .object({
    recordingSessionId: z.string().min(1).optional(),
    profileId: z.string().min(1),
    startedAt: z.string().min(1),
    finishedAt: z.string().min(1),
    name: z.string().min(1),
    activityType: canonicalSportSchema,
    durationSeconds: z.number().int().nonnegative(),
    movingSeconds: z.number().int().nonnegative(),
    distanceMeters: z.number().nonnegative(),
    calories: z.number().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
    content_visibility: contentVisibilitySchema.optional(),
    is_private: z.boolean().optional(),
    activityPlanId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type ActivitySubmissionQueueDraft = z.infer<typeof activitySubmissionQueueDraftSchema>;

export const activitySubmissionQueueJobSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: z.string().min(1),
    artifactId: z.string().min(1),
    sessionId: z.string().min(1).nullable().optional(),
    localActivityFilePath: z.string().min(1),
    localActivityFileSize: z.number().nonnegative().nullable().optional(),
    streamArtifactPaths: z.array(z.string().min(1)),
    executionManifest: recordingExecutionManifestSchema,
    draft: activitySubmissionQueueDraftSchema,
    activityId: z.string().min(1).optional(),
    ingestionId: z.string().min(1).optional(),
    remoteFilePath: z.string().min(1).optional(),
    status: activitySubmissionQueueJobStatusSchema,
    attempts: z.number().int().nonnegative(),
    lastError: z.string().nullable().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
export type ActivitySubmissionQueueJob = z.infer<typeof activitySubmissionQueueJobSchema>;

export type CreateFromRecordingSummaryInput = ActivitySubmissionQueueDraft & {
  localFileMetadata?: {
    fileType?: string | null;
    fileSize?: number | null;
    filePath?: string | null;
  };
  source: "mobile_recording";
};

export type CreateFromRecordingSummaryResult = {
  id: string;
  ingestion?: {
    id: string;
    status?: string;
    source?: string;
  };
};

export type GetSignedUploadUrlInput = {
  fileName: string;
  fileSize?: number;
};

export type GetSignedUploadUrlResult = {
  signedUrl: string;
  filePath: string;
};

export type UploadToSignedUrlResult = {
  success: boolean;
  error?: string;
};

export type MarkUploadedAndProcessInput = {
  ingestionId: string;
  activityId: string;
  activityFilePath: string;
  fileSize?: number;
  fileType?: "fit" | "gpx" | "tcx";
};

export type MarkUploadedAndProcessResult = {
  success: boolean;
};

export type ActivitySubmissionQueueRunnerDeps = {
  createFromRecordingSummary: (
    input: CreateFromRecordingSummaryInput,
  ) => Promise<CreateFromRecordingSummaryResult>;
  getSignedUploadUrl: (input: GetSignedUploadUrlInput) => Promise<GetSignedUploadUrlResult>;
  uploadToSignedUrl: (
    localPath: string,
    signedUrl: string,
  ) => Promise<UploadToSignedUrlResult | undefined>;
  markUploadedAndProcess: (
    input: MarkUploadedAndProcessInput,
  ) => Promise<MarkUploadedAndProcessResult | undefined>;
  onJobUpdated?: (job: ActivitySubmissionQueueJob) => Promise<void> | void;
  now?: () => string;
};
