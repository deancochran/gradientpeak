import {
  ActivityUploadSchema,
  activityDerivedMetricsSchema,
  activityListDerivedSummarySchema,
} from "@repo/core";
import {
  activities,
  events,
  publicActivitiesRowSchema,
  publicActivityCategorySchema,
  publicActivityPlansRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  deleteActivityForProfile,
  updateActivityForProfile,
} from "../application/activities/activity-mutations";
import {
  getActivityByIdForViewer,
  listActivitiesForProfile,
} from "../application/activities/activity-reads";
import { submitActivity } from "../application/activities/submit-activity";
import { createActivityFileIngestion } from "../application/activity-file-ingestion/ingestion-state";
import { getRequiredDb } from "../db";
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
  })
  .strict();

const activityPlanReferenceSchema = publicActivityPlansRowSchema
  .extend({
    created_at: isoDatetimeSchema,
    updated_at: isoDatetimeSchema,
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

const activityListItemSchema = activityRowSchema
  .extend({
    likes_count: z.number().int().nonnegative(),
    has_liked: z.boolean(),
    derived: activityListDerivedSummarySchema.nullable(),
    ingestion: activityIngestionStatusSchema.nullable().optional(),
  })
  .strict();

const activityWithPlanSchema = activityRowSchema
  .extend({
    likes_count: z.number().int().nonnegative(),
    activity_plans: activityPlanReferenceSchema.nullable(),
    ingestion: activityIngestionStatusSchema.nullable().optional(),
  })
  .strict();

const activityDerivedResponseSchema = z
  .object({
    activity: activityWithPlanSchema,
    has_liked: z.boolean(),
    derived: activityDerivedMetricsSchema,
  })
  .strict();

const listPaginatedInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(25),
    cursor: indexCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    activity_category: publicActivityCategorySchema.optional(),
    search: z.string().trim().max(80).optional(),
    date_from: isoDatetimeSchema.optional(),
    date_to: isoDatetimeSchema.optional(),
    sort_by: z.enum(["date", "distance", "duration", "tss"]).default("date"),
    sort_order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

const createInputSchema = ActivityUploadSchema.extend({
  profile_id: z.string().uuid(),
  eventId: z.string().uuid().optional().nullable(),
  startedAt: isoDatetimeSchema,
  finishedAt: isoDatetimeSchema,
})
  .strict()
  .refine((data) => new Date(data.finishedAt) > new Date(data.startedAt), {
    message: "finishedAt must be after startedAt",
    path: ["finishedAt"],
  });

const createFromRecordingSummaryInputSchema = z
  .object({
    profileId: z.string().uuid(),
    name: z.string().trim().min(1),
    notes: z.string().nullable().optional(),
    is_private: z.boolean().optional(),
    activityType: publicActivityCategorySchema,
    startedAt: isoDatetimeSchema,
    finishedAt: isoDatetimeSchema,
    durationSeconds: z.number().int().positive(),
    movingSeconds: z.number().int().nonnegative(),
    distanceMeters: z.number().int().nonnegative(),
    calories: z.number().int().nonnegative().nullable().optional(),
    activityPlanId: z.string().uuid().nullable().optional(),
    localFileMetadata: z
      .object({
        fileType: z.string().trim().min(1).nullable().optional(),
        fileSize: z.number().int().nonnegative().nullable().optional(),
        filePath: z.string().trim().min(1).nullable().optional(),
      })
      .strict()
      .optional(),
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
  })
  .strict();

const deleteInputSchema = z.object({ id: z.string().uuid() }).strict();

const _totalRowSchema = z.object({ total: z.union([z.number(), z.string()]) }).strict();

const _likeRowSchema = z.object({ entity_id: z.string().uuid() }).strict();

function parseActivityRow(value: unknown) {
  return activityRowSchema.parse(value);
}

function _parseActivityRows(value: unknown[]) {
  return activityRowSchema.array().parse(value);
}

export const activitiesRouter = createTRPCRouter({
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
    const duration_seconds =
      (new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime()) / 1000;

    if (duration_seconds <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Activity duration must be positive.",
      });
    }

    if (input.profile_id !== ctx.session.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot create activities for other profiles",
      });
    }

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

    const { id: createdActivityId } = await submitActivity(db, {
      profileId: input.profile_id,
      activityPlanId: linkedActivityPlanId,
      name: input.name,
      notes: input.notes ?? null,
      activityType: input.type,
      isPrivate: false,
      startedAt: new Date(input.startedAt),
      finishedAt: new Date(input.finishedAt),
      durationSeconds: duration_seconds,
      movingSeconds: input.movingSeconds,
      distanceMeters: input.distanceMeters,
      calories: null,
      elevationGainMeters: null,
      avgHeartRate: null,
      maxHeartRate: null,
      avgPower: null,
      maxPower: null,
      normalizedPower: input.metrics.normalized_power ?? null,
      avgCadence: null,
      maxCadence: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      normalizedSpeedMps: null,
      normalizedGradedSpeedMps: null,
      efficiencyFactor: null,
      aerobicDecoupling: null,
      avgTemperature: null,
      deviceManufacturer: null,
      deviceProduct: null,
      laps: null,
      mapBounds: null,
      polyline: null,
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

      const created = await submitActivity(db, {
        profileId: input.profileId,
        activityPlanId: input.activityPlanId ?? null,
        name: input.name,
        notes: input.notes ?? null,
        activityType: input.activityType,
        isPrivate: input.is_private ?? true,
        startedAt: new Date(input.startedAt),
        finishedAt: new Date(input.finishedAt),
        durationSeconds: input.durationSeconds,
        movingSeconds: input.movingSeconds,
        distanceMeters: input.distanceMeters,
        calories: input.calories ?? null,
        elevationGainMeters: null,
        avgHeartRate: null,
        maxHeartRate: null,
        avgPower: null,
        maxPower: null,
        normalizedPower: null,
        avgCadence: null,
        maxCadence: null,
        avgSpeedMps: null,
        maxSpeedMps: null,
        normalizedSpeedMps: null,
        normalizedGradedSpeedMps: null,
        efficiencyFactor: null,
        aerobicDecoupling: null,
        avgTemperature: null,
        deviceManufacturer: null,
        deviceProduct: null,
        laps: null,
        mapBounds: null,
        polyline: null,
        composition: {
          persist: async (tx, { activityId, now }) =>
            createActivityFileIngestion(tx, {
              activityId,
              profileId: input.profileId,
              source: input.source,
              filePath: null,
              fileSize: input.localFileMetadata?.fileSize ?? null,
              fileType: input.localFileMetadata?.fileType ?? null,
              now,
            }),
        },
      });

      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, created.id),
      });
      if (!activity || !created.compositionResult)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load created activity",
        });
      const ingestion = created.compositionResult as Awaited<
        ReturnType<typeof createActivityFileIngestion>
      >;

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

  // Hard delete activity - permanently removes the record
  // Activity streams are automatically deleted via cascade
  delete: protectedProcedure.input(deleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    return deleteActivityForProfile({
      db,
      activityId: input.id,
      profileId: ctx.session.user.id,
    });
  }),
});
