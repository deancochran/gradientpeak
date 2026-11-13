import {
  activityLapRecordListSchema,
  contentVisibilitySchema,
  recordingExecutionManifestSchema,
  recordingPlanExecutionSnapshotSchema,
} from "@repo/core";
import {
  MAX_ACTIVITY_FILE_SIZE_BYTES,
  supportedActivityFileExtensionSchema,
} from "@repo/core/activity-files";
import { realRecordingExecutionSchema } from "@repo/core/recording/execution-evidence";
import {
  primaryRecordingGuidancePlan,
  primaryRecordingGuidanceRoute,
  recordingGuidanceTimelineSchema,
} from "@repo/core/recording/guidance";
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
    poolLengthMeters: z.number().positive().nullable().optional(),
  })
  .strict()
  .default({ distanceMeters: 0 });

const recordingSummarySubmissionBaseShape = {
  execution: realRecordingExecutionSchema.optional(),
  profileId: z.string().uuid(),
  name: z.string().trim().min(1),
  notes: z.string().nullable().optional(),
  content_visibility: contentVisibilitySchema.optional(),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  activityPlanId: z.string().uuid().nullable().optional(),
  planExecution: recordingPlanExecutionSnapshotSchema.optional(),
  guidance: recordingGuidanceTimelineSchema.optional(),
  routeId: z.string().uuid().nullable().optional(),
  executionManifest: recordingExecutionManifestSchema,
  laps: activityLapRecordListSchema.optional(),
  sessionTiming: z
    .object({
      source: z.literal("manual_timer"),
      coverage: z.literal("partial"),
      elapsedMs: z.number().int().positive(),
      activeMs: z.number().int().nonnegative(),
    })
    .strict()
    .refine((timing) => timing.activeMs <= timing.elapsedMs, {
      message: "Manual active time must not exceed elapsed time",
    })
    .optional(),
  summary: recordingSummarySchema,
  source: z.literal("mobile_recording").default("mobile_recording"),
} satisfies z.ZodRawShape;

const uploadedRecordingSummarySubmissionSchema = z
  .object({
    ...recordingSummarySubmissionBaseShape,
    recordingSessionId: z.string().trim().min(1).max(200),
    uploadedArtifact: recordingUploadedArtifactSchema,
  })
  .strict();

/** API-owned session-bound recording submission input. */
export const recordingSummarySubmissionInputSchema = z
  .object(uploadedRecordingSummarySubmissionSchema.shape)
  .strict()
  .refine((value) => new Date(value.finishedAt) > new Date(value.startedAt), {
    message: "finishedAt must be after startedAt",
    path: ["finishedAt"],
  })
  .refine(
    (value) => !value.planExecution || value.activityPlanId === value.planExecution.activityPlanId,
    {
      message: "planExecution must match activityPlanId",
      path: ["planExecution", "activityPlanId"],
    },
  )
  .superRefine((value, context) => {
    if (!value.guidance) return;
    const primary = primaryRecordingGuidancePlan(value.guidance);
    const primaryRoute = primaryRecordingGuidanceRoute(value.guidance);
    const last = value.guidance.revisions.at(-1);
    if (
      !value.sessionTiming ||
      !last ||
      last.elapsedMs > value.sessionTiming.elapsedMs ||
      last.activeMs > value.sessionTiming.activeMs ||
      (primary?.activityPlanId ?? null) !== (value.activityPlanId ?? null) ||
      primaryRoute !== (value.routeId ?? null) ||
      JSON.stringify(primary ?? undefined) !== JSON.stringify(value.planExecution) ||
      value.guidance.revisions[0]?.timestamp !== value.startedAt ||
      value.guidance.revisions.some(
        (revision) =>
          Date.parse(revision.timestamp) < Date.parse(value.startedAt) ||
          Date.parse(revision.timestamp) > Date.parse(value.finishedAt) ||
          (primary &&
            revision.plan &&
            revision.plan.structure.activity_category !== primary.structure.activity_category),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["guidance"],
        message:
          "Guidance must retain its primary prescription and remain within the recording boundary.",
      });
    }
  });

export const beginMobileRecordingUploadInputSchema = z
  .object({
    execution: realRecordingExecutionSchema.optional(),
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
