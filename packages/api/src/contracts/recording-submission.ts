import { contentVisibilitySchema, recordingExecutionManifestSchema } from "@repo/core";
import {
  MAX_ACTIVITY_FILE_SIZE_BYTES,
  supportedActivityFileExtensionSchema,
} from "@repo/core/activity-files";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const mobileRecordingArtifactFormatSchema = supportedActivityFileExtensionSchema;

export const recordingAcceptedArtifactSchema = z
  .object({
    sha256: sha256Schema,
    byteSize: z.number().int().positive().max(MAX_ACTIVITY_FILE_SIZE_BYTES),
    bucket: z.string().trim().min(1),
    path: z.string().regex(/^artifacts\/sha256\/[0-9a-f-]+\/[0-9a-f]{64}$/),
    mediaType: z.string().trim().min(1),
    format: mobileRecordingArtifactFormatSchema,
    originalName: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const recordingUploadedArtifactSchema = z
  .object({ ingestionId: z.string().uuid() })
  .strict();

const recordingSummarySchema = z
  .object({
    distanceMeters: z.number().int().nonnegative().default(0),
    calories: z.number().int().nonnegative().nullable().optional(),
    elevationGainMeters: z.number().nonnegative().nullable().optional(),
    avgTemperature: z.number().finite().nullable().optional(),
    poolLength: z.number().positive().nullable().optional(),
  })
  .strict()
  .default({ distanceMeters: 0 });

const recordingSummarySubmissionBaseShape = {
  profileId: z.string().uuid(),
  name: z.string().trim().min(1),
  notes: z.string().nullable().optional(),
  content_visibility: contentVisibilitySchema.optional(),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  activityPlanId: z.string().uuid().nullable().optional(),
  executionManifest: recordingExecutionManifestSchema,
  summary: recordingSummarySchema,
  source: z.literal("mobile_recording").default("mobile_recording"),
} satisfies z.ZodRawShape;

const acceptedRecordingSummarySubmissionSchema = z
  .object({
    ...recordingSummarySubmissionBaseShape,
    recordingSessionId: z.string().trim().min(1).max(200),
    artifactSource: z.literal("acceptedArtifact"),
    acceptedArtifact: recordingAcceptedArtifactSchema,
  })
  .strict();

const uploadedRecordingSummarySubmissionSchema = z
  .object({
    ...recordingSummarySubmissionBaseShape,
    recordingSessionId: z.string().trim().min(1).max(200),
    artifactSource: z.literal("uploadedArtifact"),
    uploadedArtifact: recordingUploadedArtifactSchema,
  })
  .strict();

/** API-owned session-bound recording submission input. */
export const recordingSummarySubmissionInputSchema = z
  .union([acceptedRecordingSummarySubmissionSchema, uploadedRecordingSummarySubmissionSchema])
  .refine((value) => new Date(value.finishedAt) > new Date(value.startedAt), {
    message: "finishedAt must be after startedAt",
    path: ["finishedAt"],
  });

export const beginMobileRecordingUploadInputSchema = z
  .object({
    recordingSessionId: z.string().trim().min(1).max(200),
    byteSize: z.number().int().positive().max(MAX_ACTIVITY_FILE_SIZE_BYTES),
    sha256: sha256Schema,
    format: mobileRecordingArtifactFormatSchema,
  })
  .strict();

const mobileRecordingUploadClaimSchema = z
  .object({
    ingestionId: z.string().uuid(),
    activityId: z.string().uuid(),
    byteSize: z.number().int().positive().max(MAX_ACTIVITY_FILE_SIZE_BYTES),
    sha256: sha256Schema,
    format: mobileRecordingArtifactFormatSchema,
    mediaType: z.string().trim().min(1),
  })
  .strict();

export const beginMobileRecordingUploadOutputSchema = z.discriminatedUnion("status", [
  mobileRecordingUploadClaimSchema
    .extend({
      status: z.literal("upload"),
      signedUrl: z.string().url(),
      token: z.string().min(1),
    })
    .strict(),
  mobileRecordingUploadClaimSchema
    .extend({
      status: z.literal("ready"),
      acceptedArtifact: recordingAcceptedArtifactSchema,
    })
    .strict(),
]);

export type BeginMobileRecordingUploadInput = z.input<typeof beginMobileRecordingUploadInputSchema>;
export type BeginMobileRecordingUploadOutput = z.output<
  typeof beginMobileRecordingUploadOutputSchema
>;
export type MobileRecordingSubmissionRequest = z.input<
  typeof recordingSummarySubmissionInputSchema
>;
export type MobileRecordingSubmissionInput = z.output<typeof recordingSummarySubmissionInputSchema>;
export type RecordingAcceptedArtifact = z.output<typeof recordingAcceptedArtifactSchema>;
export type RecordingUploadedArtifact = z.output<typeof recordingUploadedArtifactSchema>;
