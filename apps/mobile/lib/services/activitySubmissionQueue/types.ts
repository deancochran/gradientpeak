import type { RecordingActivityCategory } from "@repo/core";

export type ActivitySubmissionQueueJobStatus =
  | "draft"
  | "creating_activity"
  | "queued"
  | "uploading"
  | "processing"
  | "complete"
  | "failed";

export type ActivitySubmissionQueueDraft = {
  profileId: string;
  startedAt: string;
  finishedAt: string;
  name: string;
  activityType: RecordingActivityCategory;
  durationSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  calories?: number | null;
  notes?: string | null;
  is_private?: boolean;
  activityPlanId?: string | null;
};

export type ActivitySubmissionQueueJob = {
  id: string;
  artifactId: string;
  sessionId?: string | null;
  localActivityFilePath: string;
  localActivityFileSize?: number | null;
  streamArtifactPaths: string[];
  draft: ActivitySubmissionQueueDraft;
  activityId?: string;
  ingestionId?: string;
  remoteFilePath?: string;
  status: ActivitySubmissionQueueJobStatus;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

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
  ) => Promise<UploadToSignedUrlResult | void>;
  markUploadedAndProcess: (
    input: MarkUploadedAndProcessInput,
  ) => Promise<MarkUploadedAndProcessResult | void>;
  onJobUpdated?: (job: ActivitySubmissionQueueJob) => Promise<void> | void;
  now?: () => string;
};
