import {
  activityDerivedMetricsSchema,
  activityDetailDisplaySchema,
  activityDisplayModelSchema,
  activityListDerivedSummarySchema,
  activityObservationQuantificationBundleSchema,
  contentVisibilitySchema,
  executableIntegrationProviderIdSchema,
  ianaTimezoneSchema,
} from "@repo/core";
import { commonLoadAggregateSchema } from "@repo/core/load";
import {
  activityEfforts,
  publicActivitiesRowSchema,
  publicActivityCategorySchema,
  publicActivityEffortsRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { activityCompositionModeSchema } from "../application/activities/activity-discovery";
import {
  deleteActivityForProfile,
  updateActivityForProfile,
} from "../application/activities/activity-mutations";
import {
  getActivityByIdForViewer,
  listActivitiesForProfile,
} from "../application/activities/activity-reads";
import {
  DailyCommonLoadActivityLimitExceededError,
  getDailyCommonLoadObservations,
} from "../application/activities/daily-common-load-observations";
import {
  getImportedSourcesForOwnedActivity,
  ImportedSourceNotFoundError,
  ImportedSourceResolutionError,
  keepImportedSourceSeparateForProfile,
  resolveImportedSourceForProfile,
} from "../application/activities/imported-source-management";
import {
  getPublicActivityEffortProfile,
  publicActivityEffortProfileResponseSchema,
} from "../application/activities/public-effort-profile";
import {
  recordSessionRpe,
  SessionRpeEvidenceConflictError,
  SessionRpeEvidenceNotFoundError,
} from "../application/activities/record-session-rpe";
import {
  MobileRecordingSubmissionError,
  submitMobileRecording,
} from "../application/activities/submit-mobile-recording";
import { MobileRecordingUploadError } from "../application/activity-file-ingestion/mobile-recording-upload";
import {
  CompletedActivityProviderNotFoundError,
  getCompletedActivityProviderEligibility,
  sendCompletedActivityToProvider,
} from "../application/integrations";
import { recordingSummarySubmissionInputSchema } from "../contracts/recording-submission";
import { getRequiredDb } from "../db";
import { getActivityArtifactStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { indexCursorSchema } from "../utils/index-cursor";

const isoDatetimeSchema = z.string().datetime({ offset: true });

const activityTimestampSchema = z.coerce.date();

const activityRowSchema = publicActivitiesRowSchema
  .omit({
    athlete_state_common_load: true,
    athlete_state_activity_category: true,
    athlete_state_evidence_confidence: true,
    athlete_state_capability_distance_meters: true,
    athlete_state_capability_duration_minutes: true,
    athlete_state_input_version: true,
    athlete_state_computed_at: true,
    performance_target_snapshot: true,
    canonical_evidence_tier: true,
  })
  .extend({
    created_at: activityTimestampSchema,
    updated_at: activityTimestampSchema,
    started_at: activityTimestampSchema,
    finished_at: activityTimestampSchema,
    content_visibility: contentVisibilitySchema,
  })
  .strict();

const activitySegmentLoadSchema = activityListDerivedSummarySchema
  .extend({
    segment_id: z.string().uuid(),
    activity_category: publicActivityCategorySchema,
    observationQuantification: activityObservationQuantificationBundleSchema,
  })
  .strict();

const activityQuantifiedMetricsSchema = activityDerivedMetricsSchema
  .extend({
    computed_as_of: isoDatetimeSchema,
    observationQuantification: activityObservationQuantificationBundleSchema,
  })
  .strict();

const activityDerivedResponseSchema = z
  .object({
    detail: activityDetailDisplaySchema,
    analysis: z
      .object({
        derived: activityQuantifiedMetricsSchema,
        segmentLoads: activitySegmentLoadSchema.array(),
      })
      .strict(),
    importedSources: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            provider: z.string().min(1),
            resolutionStatus: z.enum(["confirmed", "review"]),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

const listPaginatedInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(25),
    cursor: indexCursorSchema.optional(),
    importRunId: z.string().uuid().optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    activity_category: publicActivityCategorySchema.optional(),
    composition_mode: activityCompositionModeSchema.default("include_multisport"),
    search: z.string().trim().max(80).optional(),
    date_from: isoDatetimeSchema.optional(),
    date_to: isoDatetimeSchema.optional(),
    sort_by: z.enum(["date", "distance", "duration", "common_load"]).default("date"),
    sort_order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

const dailyCommonLoadObservationsInputSchema = z
  .object({
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    timezone: ianaTimezoneSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const start = Date.parse(`${input.start_date}T00:00:00.000Z`);
    const end = Date.parse(`${input.end_date}T00:00:00.000Z`);
    if (end < start) {
      context.addIssue({
        code: "custom",
        message: "end_date must be on or after start_date",
        path: ["end_date"],
      });
    } else if ((end - start) / 86_400_000 + 1 > 365) {
      context.addIssue({
        code: "custom",
        message: "Date range must not exceed 365 inclusive days",
        path: ["end_date"],
      });
    }
  });

const dailyCommonLoadObservationsOutputSchema = z
  .object({
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    timezone: ianaTimezoneSchema,
    timezone_role: z.literal("viewer_projection"),
    canonical_history_eligible: z.literal(false),
    day_policy: z.literal("activity_started_at_in_viewer_timezone"),
    observations: z.array(
      z
        .object({
          date: z.iso.date(),
          aggregate: commonLoadAggregateSchema,
        })
        .strict(),
    ),
  })
  .strict();

const getByIdInputSchema = z.object({ id: z.string().uuid() }).strict();
const getEffortProfileInputSchema = z
  .object({ id: z.string().uuid(), viewerId: z.string().uuid() })
  .strict();

const updateInputSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().optional(),
    notes: z.string().nullable().optional(),
    content_visibility: contentVisibilitySchema.optional(),
  })
  .strict();

const deleteInputSchema = z.object({ id: z.string().uuid() }).strict();

const resolveImportedSourceInputSchema = z
  .object({
    action: z.enum(["confirm_same", "move", "ignore"]),
    sourceReferenceId: z.string().uuid(),
    targetActivityId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === "move" && !input.targetActivityId) {
      context.addIssue({
        code: "custom",
        message: "targetActivityId is required when moving an imported source",
        path: ["targetActivityId"],
      });
    }
    if (input.action !== "move" && input.targetActivityId) {
      context.addIssue({
        code: "custom",
        message: "targetActivityId is only valid when moving an imported source",
        path: ["targetActivityId"],
      });
    }
  });

const resolveImportedSourceOutputSchema = z
  .object({
    activityId: z.string().uuid().nullable(),
    resolutionStatus: z.enum(["confirmed", "ignored"]),
  })
  .strict();
const keepImportedSourceSeparateOutputSchema = z
  .object({ jobId: z.string().uuid(), queued: z.boolean() })
  .strict();
const sendCompletedActivityOutputSchema = z
  .object({
    jobId: z.string().uuid().nullable(),
    provider: z.string().min(1),
    status: z.enum([
      "queued",
      "completed",
      "reconnect_required",
      "unsupported_evidence",
      "not_connected",
      "unavailable",
      "dispatch_uncertain",
      "failed",
    ]),
  })
  .strict();
const completedActivityProviderEligibilitySchema = z.array(
  z
    .object({
      jobId: z.string().uuid().nullable(),
      provider: z.string().min(1),
      reason: z.string().nullable(),
      status: z.enum([
        "ready",
        "reconnect_required",
        "unsupported_evidence",
        "not_connected",
        "unavailable",
        "queued",
        "running",
        "completed",
        "dispatch_uncertain",
        "failed",
      ]),
    })
    .strict(),
);

const recordSessionRpeInputSchema = z
  .object({
    activity_id: z.string().uuid(),
    operation_id: z.string().uuid(),
    rpe: z.number().int().min(1).max(10),
    scale: z.literal("borg_cr10").default("borg_cr10"),
    scale_version: z.literal("1").default("1"),
    source: z.enum(["user", "manual"]).default("user"),
    correction_of_id: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.correction_of_id && input.source !== "manual") {
      context.addIssue({
        code: "custom",
        message: "Corrections must be recorded as manual evidence",
        path: ["source"],
      });
    }
  });

const sessionRpeEvidenceOutputSchema = z
  .object({
    id: z.string().uuid(),
    activity_id: z.string().uuid(),
    recorded_at: activityTimestampSchema,
    corrected_at: activityTimestampSchema.nullable(),
    rpe: z.number().int().min(1).max(10),
    scale: z.literal("borg_cr10"),
    scale_version: z.literal("1"),
    source: z.enum(["user", "provider", "manual"]),
    operation_id: z.string().uuid(),
    correction_of_id: z.string().uuid().nullable(),
    provenance: z.record(z.string(), z.unknown()),
  })
  .strict();

function sessionRpeEvidenceResponse(evidence: Awaited<ReturnType<typeof recordSessionRpe>>) {
  return sessionRpeEvidenceOutputSchema.parse({
    id: evidence.id,
    activity_id: evidence.activityId,
    recorded_at: evidence.recordedAt,
    corrected_at: evidence.correctedAt,
    rpe: evidence.rpe,
    scale: evidence.scale,
    scale_version: evidence.scaleVersion,
    source: evidence.source,
    operation_id: evidence.operationId,
    correction_of_id: evidence.correctionOfId,
    provenance: evidence.provenance,
  });
}

const _totalRowSchema = z.object({ total: z.union([z.number(), z.string()]) }).strict();

const _likeRowSchema = z.object({ entity_id: z.string().uuid() }).strict();

function parseActivityRow(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return activityRowSchema.parse(value);
  }
  const {
    athlete_state_common_load: _athleteStateCommonLoad,
    athlete_state_activity_category: _athleteStateActivityCategory,
    athlete_state_evidence_confidence: _athleteStateEvidenceConfidence,
    athlete_state_capability_distance_meters: _athleteStateCapabilityDistanceMeters,
    athlete_state_capability_duration_minutes: _athleteStateCapabilityDurationMinutes,
    athlete_state_input_version: _athleteStateInputVersion,
    athlete_state_computed_at: _athleteStateComputedAt,
    performance_target_snapshot: _performanceTargetSnapshot,
    canonical_evidence_tier: _canonicalEvidenceTier,
    ...publicFields
  } = value as Record<string, unknown>;
  return activityRowSchema.parse(publicFields);
}

function _parseActivityRows(value: unknown[]) {
  return activityRowSchema.array().parse(value);
}

export const activitiesRouter = createTRPCRouter({
  dailyCommonLoadObservations: protectedProcedure
    .input(dailyCommonLoadObservationsInputSchema)
    .output(dailyCommonLoadObservationsOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getDailyCommonLoadObservations({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          range: input,
        });
      } catch (error) {
        if (error instanceof DailyCommonLoadActivityLimitExceededError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  // Paginated list of activities with filters
  listPaginated: protectedProcedure
    .input(listPaginatedInputSchema)
    .query(async ({ ctx, input }) => {
      const result = await listActivitiesForProfile({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        input,
      });

      return z
        .object({
          items: activityDisplayModelSchema.array(),
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursor: z.string().optional(),
        })
        .strict()
        .parse(result);
    }),

  createFromRecordingSummary: protectedProcedure
    .input(recordingSummarySubmissionInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await submitMobileRecording(
          getRequiredDb(ctx),
          getActivityArtifactStorageService(),
          {
            actorProfileId: ctx.session.user.id,
            submission: input,
          },
        );
        return {
          ...parseActivityRow(result.activity),
          ingestion: {
            id: result.ingestion.id,
            status: result.ingestion.status,
            source: result.ingestion.source,
          },
        };
      } catch (error) {
        if (error instanceof MobileRecordingSubmissionError) {
          const code =
            error.code === "forbidden"
              ? "FORBIDDEN"
              : error.code === "conflict"
                ? "CONFLICT"
                : error.code === "artifact_invalid" || error.code === "manifest_invalid"
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR";
          throw new TRPCError({ code, message: error.message, cause: error });
        }
        if (error instanceof MobileRecordingUploadError) {
          const code =
            error.code === "claim_not_found"
              ? "NOT_FOUND"
              : error.code === "claim_conflict" || error.code === "claim_lost"
                ? "CONFLICT"
                : error.code === "claim_invalid" || error.code === "expected_artifact_mismatch"
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR";
          throw new TRPCError({ code, message: error.message, cause: error });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Recording activity submission failed",
          cause: error,
        });
      }
    }),

  getById: protectedProcedure.input(getByIdInputSchema).query(async ({ input, ctx }) => {
    const db = getRequiredDb(ctx);
    const response = await getActivityByIdForViewer({
      db,
      activityId: input.id,
      viewerId: ctx.session.user.id,
    });
    const isOwner = response.detail.summary.owner.id === ctx.session.user.id;
    return activityDerivedResponseSchema.parse({
      ...response,
      ...(isOwner
        ? {
            importedSources: await getImportedSourcesForOwnedActivity({
              activityId: input.id,
              db,
              profileId: ctx.session.user.id,
            }),
          }
        : {}),
    });
  }),

  getEffortProfile: protectedProcedure
    .input(getEffortProfileInputSchema)
    .output(publicActivityEffortProfileResponseSchema)
    .query(({ input, ctx }) => {
      if (input.viewerId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Viewer identity mismatch" });
      }
      return getPublicActivityEffortProfile({
        db: getRequiredDb(ctx),
        artifactStorage: getActivityArtifactStorageService(),
        activityId: input.id,
        viewerId: ctx.session.user.id,
      });
    }),

  getCompletedActivityProviderEligibility: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }).strict())
    .output(completedActivityProviderEligibilitySchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getCompletedActivityProviderEligibility({
          ...input,
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
        });
      } catch (error) {
        if (error instanceof CompletedActivityProviderNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),

  getEfforts: protectedProcedure
    .input(getByIdInputSchema)
    .output(publicActivityEffortsRowSchema.array())
    .query(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);
      const activityView = await getActivityByIdForViewer({
        db,
        activityId: input.id,
        viewerId: ctx.session.user.id,
      });
      const rows = await db
        .select()
        .from(activityEfforts)
        .where(
          and(
            eq(activityEfforts.activity_id, input.id),
            eq(activityEfforts.profile_id, activityView.detail.summary.owner.id),
          ),
        )
        .orderBy(desc(activityEfforts.recorded_at), desc(activityEfforts.duration_seconds));
      return publicActivityEffortsRowSchema.array().parse(rows);
    }),

  // Update activity (e.g., to set metrics after calculation)
  update: protectedProcedure.input(updateInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const data = await updateActivityForProfile({
      db,
      input,
      profileId: ctx.session.user.id,
    });

    return parseActivityRow(data);
  }),

  recordSessionRpe: protectedProcedure
    .input(recordSessionRpeInputSchema)
    .output(sessionRpeEvidenceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return sessionRpeEvidenceResponse(
          await recordSessionRpe(getRequiredDb(ctx), {
            activityId: input.activity_id,
            operationId: input.operation_id,
            profileId: ctx.session.user.id,
            rpe: input.rpe,
            scale: input.scale,
            scaleVersion: input.scale_version,
            source: input.source,
            ...(input.correction_of_id ? { correctionOfId: input.correction_of_id } : {}),
          }),
        );
      } catch (error) {
        if (error instanceof SessionRpeEvidenceNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof SessionRpeEvidenceConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
    }),

  resolveImportedSource: protectedProcedure
    .input(resolveImportedSourceInputSchema)
    .output(resolveImportedSourceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await resolveImportedSourceForProfile({
          ...input,
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
        });
      } catch (error) {
        if (error instanceof ImportedSourceNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof ImportedSourceResolutionError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  keepImportedSourceSeparate: protectedProcedure
    .input(z.object({ sourceReferenceId: z.string().uuid() }).strict())
    .output(keepImportedSourceSeparateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await keepImportedSourceSeparateForProfile({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          sourceReferenceId: input.sourceReferenceId,
        });
      } catch (error) {
        if (error instanceof ImportedSourceNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof ImportedSourceResolutionError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  sendCompletedActivityToProvider: protectedProcedure
    .input(
      z
        .object({
          activityId: z.string().uuid(),
          provider: executableIntegrationProviderIdSchema,
        })
        .strict(),
    )
    .output(sendCompletedActivityOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendCompletedActivityToProvider({
          ...input,
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
        });
      } catch (error) {
        if (error instanceof CompletedActivityProviderNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),

  // Hard delete activity - permanently removes the record
  // Activity streams are automatically deleted via cascade
  delete: protectedProcedure.input(deleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    return deleteActivityForProfile({
      db,
      artifactStorage: getActivityArtifactStorageService(),
      activityId: input.id,
      profileId: ctx.session.user.id,
    });
  }),
});
