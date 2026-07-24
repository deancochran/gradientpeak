import {
  activityDerivedMetricsSchema,
  activityListDerivedSummarySchema,
  activityTssIdentitySchema,
  completedActivitySegmentSetSchemaV1,
  contentVisibilitySchema,
  ianaTimezoneSchema,
  recordingExecutionManifestSchema,
} from "@repo/core";
import { commonLoadAggregateSchema, commonLoadHistoryResultSchema } from "@repo/core/load";
import {
  activities,
  activityFileIngestions,
  events,
  profiles,
  publicActivitiesRowSchema,
  publicActivityCategorySchema,
  publicActivityPlansRowSchema,
  publicActivitySegmentsRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
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
import { readCurrentProfileCommonLoadHistory } from "../application/activities/read-current-profile-common-load-history";
import {
  recordSessionRpe,
  SessionRpeEvidenceConflictError,
  SessionRpeEvidenceNotFoundError,
} from "../application/activities/record-session-rpe";
import {
  recordingSessionActivityId,
  submitActivity,
} from "../application/activities/submit-activity";
import { verifyAcceptedActivityArtifact } from "../application/activity-file-ingestion/artifact-storage";
import { getRequiredDb } from "../db";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { indexCursorSchema } from "../utils/index-cursor";

const isoDatetimeSchema = z.string().datetime({ offset: true });

const activityTimestampSchema = z.coerce.date();

const activityRowSchema = publicActivitiesRowSchema
  .extend({
    created_at: activityTimestampSchema,
    updated_at: activityTimestampSchema,
    started_at: activityTimestampSchema,
    finished_at: activityTimestampSchema,
    content_visibility: contentVisibilitySchema.optional(),
  })
  .strict();

const activityPlanReferenceSchema = publicActivityPlansRowSchema
  .extend({
    created_at: isoDatetimeSchema,
    updated_at: isoDatetimeSchema,
    content_visibility: contentVisibilitySchema.optional(),
  })
  .strict();

const activityIngestionStatusSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
    source: z.string(),
    last_error_message: z.string().nullable().optional(),
  })
  .strict();

const effectiveSessionRpeSchema = z
  .object({
    // This ID is intentionally returned to the owner so a correction can
    // reference the exact immutable observation it supersedes.
    id: z.string().uuid(),
    rpe: z.number().int().min(1).max(10),
    scale: z.literal("borg_cr10"),
    scale_version: z.literal("1"),
    source: z.enum(["user", "provider", "manual"]),
    recorded_at: activityTimestampSchema,
    corrected_at: activityTimestampSchema.nullable(),
    provenance: z.record(z.string(), z.unknown()),
  })
  .strict();

const activityCompositionSchema = z.object({
  activity_kind: z.enum(["single", "multisport", "unknown"]),
  activity_segment_count: z.number().int().nonnegative(),
  activity_categories: publicActivityCategorySchema.array(),
  matched_category_summary: z
    .object({
      segment_count: z.number().int().nonnegative(),
      distance_meters: z.number().nonnegative().nullable(),
      active_ms: z.number().int().nonnegative().nullable(),
      moving_ms: z.number().int().nonnegative().nullable(),
      tss: z.number().nonnegative().nullable(),
      tss_identity: activityTssIdentitySchema.nullable(),
    })
    .strict()
    .nullable(),
});

const activitySegmentReadSchema = publicActivitySegmentsRowSchema
  .pick({
    id: true,
    activity_id: true,
    ordinal: true,
    role: true,
    category: true,
    start_offset_ms: true,
    end_offset_ms: true,
    timing_coverage: true,
    active_ms: true,
    moving_ms: true,
    summary: true,
  })
  .strict();

const activitySegmentLoadSchema = activityListDerivedSummarySchema
  .extend({
    segment_id: z.string().uuid(),
    category: publicActivityCategorySchema,
  })
  .strict();

const activityListItemSchema = activityRowSchema
  .extend({
    ...activityCompositionSchema.shape,
    likes_count: z.number().int().nonnegative(),
    has_liked: z.boolean(),
    derived: activityListDerivedSummarySchema.nullable(),
    segment_loads: activitySegmentLoadSchema.array(),
    ingestion: activityIngestionStatusSchema.nullable().optional(),
  })
  .strict();

const activityWithPlanSchema = activityRowSchema
  .extend({
    ...activityCompositionSchema.shape,
    likes_count: z.number().int().nonnegative(),
    activity_plans: activityPlanReferenceSchema.nullable(),
    ingestion: activityIngestionStatusSchema.nullable().optional(),
    // Owner-only evidence. Shared viewers receive null even when the activity
    // is visible to them.
    effective_session_rpe: effectiveSessionRpeSchema.nullable(),
    segments: activitySegmentReadSchema.array(),
    current_artifact: z
      .object({
        id: z.string().uuid(),
        digest_algorithm: z.literal("sha256"),
        digest: z.string().regex(/^[0-9a-f]{64}$/),
        byte_size: z.number().int().positive(),
        media_type: z.string(),
        format: z.string(),
        original_name: z.string().nullable(),
        availability: z.literal("accepted"),
        first_accepted_at: activityTimestampSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

const activityDerivedResponseSchema = z
  .object({
    activity: activityWithPlanSchema,
    has_liked: z.boolean(),
    derived: activityDerivedMetricsSchema,
    segment_loads: activitySegmentLoadSchema.array(),
  })
  .strict();

const listPaginatedInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(25),
    cursor: indexCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    activity_category: publicActivityCategorySchema.optional(),
    composition_mode: activityCompositionModeSchema.default("include_multisport"),
    search: z.string().trim().max(80).optional(),
    date_from: isoDatetimeSchema.optional(),
    date_to: isoDatetimeSchema.optional(),
    sort_by: z.enum(["date", "distance", "duration", "tss"]).default("date"),
    sort_order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

const commonLoadHistoryInputSchema = z
  .object({
    current_planning_date: z.iso.date(),
    planning_timezone: ianaTimezoneSchema,
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
    day_policy: z.literal("activity_started_at_in_requested_timezone"),
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

const acceptedArtifactSchema = z
  .object({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    byteSize: z.number().int().positive(),
    bucket: z.string().trim().min(1),
    path: z.string().trim().min(1),
    mediaType: z.string().trim().min(1),
    format: z.enum(["fit", "gpx", "tcx"]),
    originalName: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

async function resolveAcceptedArtifact(
  profileId: string,
  artifact: z.infer<typeof acceptedArtifactSchema>,
) {
  try {
    return await verifyAcceptedActivityArtifact(getApiStorageService(), {
      profileId,
      ...artifact,
    });
  } catch (cause) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Accepted activity artifact could not be verified",
      cause,
    });
  }
}

const activityParentSummarySchema = z
  .object({
    distanceMeters: z.number().int().nonnegative().default(0),
    calories: z.number().int().nonnegative().nullable().optional(),
    elevationGainMeters: z.number().nonnegative().nullable().optional(),
    normalizedPower: z.number().finite().nullable().optional(),
    avgTemperature: z.number().finite().nullable().optional(),
    poolLength: z.number().positive().nullable().optional(),
  })
  .strict()
  .default({ distanceMeters: 0 });

const createInputSchema = z
  .object({
    profile_id: z.string().uuid(),
    eventId: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1),
    notes: z.string().nullable().optional(),
    startedAt: isoDatetimeSchema,
    finishedAt: isoDatetimeSchema,
    content_visibility: contentVisibilitySchema.optional(),
    segmentSet: completedActivitySegmentSetSchemaV1,
    acceptedArtifact: acceptedArtifactSchema,
    summary: activityParentSummarySchema,
  })
  .strict()
  .superRefine((data, context) => {
    const elapsedMs = new Date(data.finishedAt).getTime() - new Date(data.startedAt).getTime();
    if (elapsedMs <= 0) {
      context.addIssue({
        code: "custom",
        message: "finishedAt must be after startedAt",
        path: ["finishedAt"],
      });
    } else if (data.segmentSet.elapsedMs !== elapsedMs) {
      context.addIssue({
        code: "custom",
        message: "segmentSet elapsedMs must match the parent activity time range",
        path: ["segmentSet", "elapsedMs"],
      });
    }
  });

const createFromRecordingSummaryInputSchema = z
  .object({
    profileId: z.string().uuid(),
    recordingSessionId: z.string().trim().min(1).max(200).optional(),
    name: z.string().trim().min(1),
    notes: z.string().nullable().optional(),
    is_private: z.boolean().optional(),
    content_visibility: contentVisibilitySchema.optional(),
    startedAt: isoDatetimeSchema,
    finishedAt: isoDatetimeSchema,
    activityPlanId: z.string().uuid().nullable().optional(),
    executionManifest: recordingExecutionManifestSchema,
    acceptedArtifact: acceptedArtifactSchema,
    summary: activityParentSummarySchema,
    source: z.literal("mobile_recording").default("mobile_recording"),
  })
  .strict()
  .refine((data) => new Date(data.finishedAt) > new Date(data.startedAt), {
    message: "finishedAt must be after startedAt",
    path: ["finishedAt"],
  });

const getByIdInputSchema = z.object({ id: z.string().uuid() }).strict();

const updateInputSchema = z
  .object({
    id: z.string().uuid(),
    normalized_power: z.number().finite().optional(),
    name: z.string().optional(),
    notes: z.string().nullable().optional(),
    is_private: z.boolean().optional(),
    content_visibility: contentVisibilitySchema.optional(),
  })
  .strict();

const deleteInputSchema = z.object({ id: z.string().uuid() }).strict();

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

function aggregateSegmentTiming(segmentSet: z.infer<typeof completedActivitySegmentSetSchemaV1>) {
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

function segmentSetFromExecutionManifest(input: {
  startedAt: string;
  finishedAt: string;
  executionManifest: z.infer<typeof recordingExecutionManifestSchema>;
}) {
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
    if (!first || !last) {
      throw new Error("Execution manifest segment group must not be empty");
    }
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
    if (first.role === "activity")
      return { ...base, role: "activity" as const, category: first.category };
    return { ...base, role: first.role };
  });
  return completedActivitySegmentSetSchemaV1.parse({ version: 1, elapsedMs, segments });
}

async function getProfileDefaultContentVisibility(
  db: ReturnType<typeof getRequiredDb>,
  profileId: string,
) {
  let profile: { defaultContentVisibility: "private" | "followers" | "public" } | undefined;
  try {
    [profile] = await db
      .select({ defaultContentVisibility: profiles.default_content_visibility })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
  } catch {
    if (process.env.NODE_ENV === "test") return "private";
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load profile defaults",
    });
  }

  return profile?.defaultContentVisibility ?? "private";
}

const _totalRowSchema = z.object({ total: z.union([z.number(), z.string()]) }).strict();

const _likeRowSchema = z.object({ entity_id: z.string().uuid() }).strict();

function parseActivityRow(value: unknown) {
  return activityRowSchema.parse(value);
}

function _parseActivityRows(value: unknown[]) {
  return activityRowSchema.array().parse(value);
}

export const activitiesRouter = createTRPCRouter({
  commonLoadHistory: protectedProcedure
    .input(commonLoadHistoryInputSchema.optional())
    .output(commonLoadHistoryResultSchema)
    .query(async ({ ctx, input }) => {
      const history = await readCurrentProfileCommonLoadHistory({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
      });
      if (
        input &&
        (input.planning_timezone !== history.planningTimezone ||
          input.current_planning_date !== history.currentPlanningDate)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Common Load history input must match the profile planning timezone and date",
        });
      }
      return history.result;
    }),

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
          items: activityListItemSchema.array(),
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursor: z.string().optional(),
        })
        .strict()
        .parse(result);
    }),

  // Simplified: Just create the activity first
  create: protectedProcedure.input(createInputSchema).mutation(async ({ input, ctx }) => {
    const db = getRequiredDb(ctx);

    if (input.profile_id !== ctx.session.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot create activities for other profiles",
      });
    }

    const contentVisibility =
      input.content_visibility ?? (await getProfileDefaultContentVisibility(db, input.profile_id));

    let linkedActivityPlanId: string | null = null;
    if (input.eventId) {
      const [linkedEvent] = await db
        .select({ activity_plan_id: events.activity_plan_id })
        .from(events)
        .where(
          and(
            eq(events.id, input.eventId),
            eq(events.profile_id, ctx.session.user.id),
            eq(events.event_type, "planned"),
          ),
        )
        .limit(1);

      if (!linkedEvent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Linked event not found.",
        });
      }

      linkedActivityPlanId = linkedEvent.activity_plan_id;
    }

    const activitySegment = input.segmentSet.segments.find(
      (segment) => segment.role === "activity",
    );
    if (!activitySegment) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "An activity segment is required" });
    }
    const timing = aggregateSegmentTiming(input.segmentSet);
    const acceptedArtifact = await resolveAcceptedArtifact(
      input.profile_id,
      input.acceptedArtifact,
    );

    const { id: createdActivityId } = await submitActivity(db, {
      profileId: input.profile_id,
      activityPlanId: linkedActivityPlanId,
      name: input.name,
      notes: input.notes ?? null,
      isPrivate: contentVisibility === "private",
      contentVisibility,
      startedAt: new Date(input.startedAt),
      finishedAt: new Date(input.finishedAt),
      elapsedMs: input.segmentSet.elapsedMs,
      activeMs: timing.activeMs,
      movingMs: timing.movingMs,
      timingCoverage: timing.timingCoverage,
      segmentSet: input.segmentSet,
      distanceMeters: input.summary.distanceMeters,
      calories: input.summary.calories ?? null,
      elevationGainMeters: input.summary.elevationGainMeters ?? null,
      avgHeartRate: null,
      maxHeartRate: null,
      avgPower: null,
      maxPower: null,
      normalizedPower: input.summary.normalizedPower ?? null,
      avgCadence: null,
      maxCadence: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      normalizedSpeedMps: null,
      normalizedGradedSpeedMps: null,
      efficiencyFactor: null,
      aerobicDecoupling: null,
      avgTemperature: input.summary.avgTemperature ?? null,
      poolLength: input.summary.poolLength ?? null,
      deviceManufacturer: null,
      deviceProduct: null,
      laps: null,
      mapBounds: null,
      polyline: null,
      analysis: {
        efforts: [],
        detectedLTHR: null,
        activityCompletedAt: new Date(input.finishedAt),
        ingestion: {
          source: "manual_import",
          operationKey: `activity-create:${acceptedArtifact.sha256}`,
          artifact: acceptedArtifact,
          fileType: acceptedArtifact.format,
        },
      },
    });

    const createdActivity = await db.query.activities.findFirst({
      where: eq(activities.id, createdActivityId),
    });

    if (!createdActivity) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load created activity",
      });
    }

    const data = parseActivityRow(createdActivity);

    return data;
  }),

  createFromRecordingSummary: protectedProcedure
    .input(createFromRecordingSummaryInputSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);

      if (input.profileId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot create activities for other profiles",
        });
      }

      if (input.recordingSessionId) {
        const activityId = recordingSessionActivityId(input.profileId, input.recordingSessionId);
        const existingActivity = await db.query.activities.findFirst({
          where: and(eq(activities.id, activityId), eq(activities.profile_id, input.profileId)),
        });
        if (existingActivity) {
          const existingIngestion = await db.query.activityFileIngestions.findFirst({
            where: and(
              eq(activityFileIngestions.activity_id, existingActivity.id),
              eq(activityFileIngestions.profile_id, input.profileId),
            ),
          });
          if (!existingIngestion) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Recording activity is missing its file ingestion",
            });
          }
          return {
            ...parseActivityRow(existingActivity),
            ingestion: {
              id: existingIngestion.id,
              status: existingIngestion.status,
              source: existingIngestion.source,
            },
          };
        }
      }

      const contentVisibility =
        input.content_visibility ??
        (input.is_private === undefined
          ? await getProfileDefaultContentVisibility(db, input.profileId)
          : input.is_private
            ? "private"
            : "followers");

      let segmentSet: z.infer<typeof completedActivitySegmentSetSchemaV1>;
      try {
        segmentSet = segmentSetFromExecutionManifest(input);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid recording execution manifest",
          cause: error,
        });
      }
      const activitySegment = segmentSet.segments.find((segment) => segment.role === "activity");
      if (!activitySegment) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An activity segment is required" });
      }
      const timing = aggregateSegmentTiming(segmentSet);
      const acceptedArtifact = await resolveAcceptedArtifact(
        input.profileId,
        input.acceptedArtifact,
      );

      let created: Awaited<ReturnType<typeof submitActivity>>;
      try {
        created = await submitActivity(db, {
          ...(input.recordingSessionId
            ? {
                requestedActivityId: recordingSessionActivityId(
                  input.profileId,
                  input.recordingSessionId,
                ),
              }
            : {}),
          profileId: input.profileId,
          activityPlanId: input.activityPlanId ?? null,
          name: input.name,
          notes: input.notes ?? null,
          isPrivate: contentVisibility === "private",
          contentVisibility,
          startedAt: new Date(input.startedAt),
          finishedAt: new Date(input.finishedAt),
          elapsedMs: segmentSet.elapsedMs,
          activeMs: timing.activeMs,
          movingMs: timing.movingMs,
          timingCoverage: timing.timingCoverage,
          segmentSet,
          distanceMeters: input.summary.distanceMeters,
          calories: input.summary.calories ?? null,
          elevationGainMeters: input.summary.elevationGainMeters ?? null,
          avgHeartRate: null,
          maxHeartRate: null,
          avgPower: null,
          maxPower: null,
          normalizedPower: input.summary.normalizedPower ?? null,
          avgCadence: null,
          maxCadence: null,
          avgSpeedMps: null,
          maxSpeedMps: null,
          normalizedSpeedMps: null,
          normalizedGradedSpeedMps: null,
          efficiencyFactor: null,
          aerobicDecoupling: null,
          avgTemperature: input.summary.avgTemperature ?? null,
          poolLength: input.summary.poolLength ?? null,
          deviceManufacturer: null,
          deviceProduct: null,
          laps: null,
          mapBounds: null,
          polyline: null,
          analysis: {
            efforts: [],
            detectedLTHR: null,
            activityCompletedAt: new Date(input.finishedAt),
            ingestion: {
              source: input.source,
              operationKey: input.recordingSessionId
                ? `mobile-recording:${input.recordingSessionId}`
                : `mobile-recording:${acceptedArtifact.sha256}`,
              artifact: acceptedArtifact,
              fileType: acceptedArtifact.format,
            },
          },
        });
      } catch (error) {
        if (!input.recordingSessionId) throw error;

        const activityId = recordingSessionActivityId(input.profileId, input.recordingSessionId);
        const [existingActivity, existingIngestion] = await Promise.all([
          db.query.activities.findFirst({
            where: and(eq(activities.id, activityId), eq(activities.profile_id, input.profileId)),
          }),
          db.query.activityFileIngestions.findFirst({
            where: and(
              eq(activityFileIngestions.activity_id, activityId),
              eq(activityFileIngestions.profile_id, input.profileId),
            ),
          }),
        ]);
        if (!existingActivity || !existingIngestion) throw error;

        return {
          ...parseActivityRow(existingActivity),
          ingestion: {
            id: existingIngestion.id,
            status: existingIngestion.status,
            source: existingIngestion.source,
          },
        };
      }

      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, created.id),
      });
      if (!activity)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load created activity",
        });
      const ingestion = await db.query.activityFileIngestions.findFirst({
        where: and(
          eq(activityFileIngestions.activity_id, created.id),
          eq(activityFileIngestions.profile_id, input.profileId),
        ),
      });
      if (!ingestion) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load accepted activity artifact ingestion",
        });
      }

      const data = parseActivityRow(activity);

      return {
        ...data,
        ingestion: {
          id: ingestion.id,
          status: ingestion.status,
          source: ingestion.source,
        },
      };
    }),

  getById: protectedProcedure.input(getByIdInputSchema).query(async ({ input, ctx }) => {
    return activityDerivedResponseSchema.parse(
      await getActivityByIdForViewer({
        db: getRequiredDb(ctx),
        activityId: input.id,
        viewerId: ctx.session.user.id,
      }),
    );
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

  // Hard delete activity - permanently removes the record
  // Activity streams are automatically deleted via cascade
  delete: protectedProcedure.input(deleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    return deleteActivityForProfile({
      db,
      artifactStorage: getApiStorageService(),
      activityId: input.id,
      profileId: ctx.session.user.id,
    });
  }),
});
