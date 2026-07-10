import { randomUUID } from "node:crypto";
import {
  ActivityUploadSchema,
  activityDerivedMetricsSchema,
  activityListDerivedSummarySchema,
} from "@repo/core";
import {
  activities,
  activitySummaries,
  eventScheduleLinks,
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
  mergeActivitySummary,
} from "../application/activities/activity-reads";
import { createActivityFileIngestion } from "../application/activity-file-ingestion/ingestion-state";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { indexCursorSchema } from "../utils/index-cursor";
import { markProfileAnalysisDirty } from "../utils/profile-estimation-state";

const isoDatetimeSchema = z.string().datetime({ offset: true });

// TSS is computed from activity context, so the DB cannot order by it exactly.
// Bound the recency candidate window to avoid unbounded full-history reads.
const _tssSortMaxCandidates = 500;

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
    has_liked: z.boolean(),
    derived: activityListDerivedSummarySchema.nullable(),
    ingestion: activityIngestionStatusSchema.nullable().optional(),
  })
  .strict();

const activityWithPlanSchema = activityRowSchema
  .extend({
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

const insertedActivityIdRowSchema = z.object({ id: z.string().uuid() }).strict();

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
        .select({ activity_plan_id: eventScheduleLinks.activity_plan_id })
        .from(events)
        .leftJoin(eventScheduleLinks, eq(events.id, eventScheduleLinks.event_id))
        .where(
          and(
            eq(events.id, input.eventId),
            eq(events.profile_id, ctx.session.user.id),
            eq(events.event_type, "planned_activity"),
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

    const createdActivityId = await db.transaction(async (tx) => {
      const now = new Date();
      const [activity] = await tx
        .insert(activities)
        .values({
          id: randomUUID(),
          profile_id: input.profile_id,
          activity_plan_id: linkedActivityPlanId,
          name: input.name,
          notes: input.notes ?? null,
          type: input.type,
          started_at: new Date(input.startedAt),
          finished_at: new Date(input.finishedAt),
          is_private: false,
          created_at: now,
          updated_at: now,
        })
        .returning({ id: activities.id });

      if (!activity) {
        throw new Error("Failed to create activity");
      }

      await tx.insert(activitySummaries).values({
        activity_id: activity.id,
        profile_id: input.profile_id,
        duration_seconds,
        moving_seconds: input.movingSeconds,
        distance_meters: input.distanceMeters,
        normalized_power: input.metrics.normalized_power ?? null,
        created_at: now,
        updated_at: now,
      });

      return insertedActivityIdRowSchema.parse(activity).id;
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

    const summary = await db.query.activitySummaries.findFirst({
      where: and(
        eq(activitySummaries.activity_id, createdActivityId),
        eq(activitySummaries.profile_id, ctx.session.user.id),
      ),
    });

    const data = parseActivityRow(mergeActivitySummary(createdActivity, summary ?? null));
    await markProfileAnalysisDirty(db, {
      profileId: ctx.session.user.id,
      kinds: ["fitness"],
      dirtySince: data.started_at,
    });

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

      const created = await db.transaction(async (tx) => {
        const now = new Date();
        const [activity] = await tx
          .insert(activities)
          .values({
            id: randomUUID(),
            profile_id: input.profileId,
            activity_plan_id: input.activityPlanId ?? null,
            name: input.name,
            notes: input.notes ?? null,
            type: input.activityType,
            started_at: new Date(input.startedAt),
            finished_at: new Date(input.finishedAt),
            is_private: input.is_private ?? true,
            created_at: now,
            updated_at: now,
          })
          .returning();

        if (!activity) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create activity",
          });
        }

        const summary = {
          activity_id: activity.id,
          profile_id: input.profileId,
          duration_seconds: input.durationSeconds,
          moving_seconds: input.movingSeconds,
          distance_meters: input.distanceMeters,
          elevation_gain_meters: null,
          elevation_loss_meters: null,
          calories: input.calories ?? null,
          avg_heart_rate: null,
          max_heart_rate: null,
          avg_power: null,
          max_power: null,
          normalized_power: null,
          avg_cadence: null,
          max_cadence: null,
          avg_speed_mps: null,
          max_speed_mps: null,
          normalized_speed_mps: null,
          normalized_graded_speed_mps: null,
          avg_temperature: null,
          avg_swolf: null,
          efficiency_factor: null,
          aerobic_decoupling: null,
          pool_length: null,
          total_strokes: null,
          created_at: now,
          updated_at: now,
        };

        await tx.insert(activitySummaries).values(summary);

        const ingestion = await createActivityFileIngestion(tx, {
          activityId: activity.id,
          profileId: input.profileId,
          source: input.source,
          filePath: null,
          fileSize: input.localFileMetadata?.fileSize ?? null,
          fileType: input.localFileMetadata?.fileType ?? null,
          now,
        });

        return {
          activity,
          summary,
          ingestion,
        };
      });

      const data = parseActivityRow(
        mergeActivitySummary(
          created.activity,
          created.summary as typeof activitySummaries.$inferSelect,
        ),
      );

      await markProfileAnalysisDirty(db, {
        profileId: ctx.session.user.id,
        kinds: ["fitness"],
        dirtySince: data.started_at,
      });

      return {
        ...data,
        ingestion: {
          id: created.ingestion.id,
          status: created.ingestion.status,
          source: created.ingestion.source,
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
