import { randomUUID } from "node:crypto";
import { ActivityUploadSchema, analyzeActivityDerivedMetrics } from "@repo/core";
import {
  activities,
  activityPlans,
  events,
  likes,
  publicActivitiesRowSchema,
  publicActivityCategorySchema,
  publicActivityPlansRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createActivityAnalysisStore } from "../infrastructure/repositories";
import {
  buildActivityDerivedSummaryMap,
  mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse,
  resolveActivityContextAsOf,
} from "../lib/activity-analysis";
import { createTRPCRouter, protectedProcedure } from "../trpc";

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

const activityListItemSchema = activityRowSchema
  .extend({
    has_liked: z.boolean(),
    derived: z.unknown().nullable(),
  })
  .strict();

const activityWithPlanSchema = activityRowSchema
  .extend({
    activity_plans: activityPlanReferenceSchema.nullable(),
  })
  .strict();

const activityDerivedResponseSchema = z
  .object({
    activity: activityWithPlanSchema,
    has_liked: z.boolean(),
    derived: z.unknown(),
  })
  .strict();

const activityListResponseSchema = activityListItemSchema.array();

const listInputSchema = z
  .object({
    date_from: isoDatetimeSchema,
    date_to: isoDatetimeSchema,
  })
  .strict();

const listPaginatedInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
    activity_category: publicActivityCategorySchema.optional(),
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

const totalRowSchema = z.object({ total: z.union([z.number(), z.string()]) }).strict();

const likeRowSchema = z.object({ entity_id: z.string().uuid() }).strict();

const insertedActivityIdRowSchema = z.object({ id: z.string().uuid() }).strict();

function parseActivityRow(value: unknown) {
  return activityRowSchema.parse(value);
}

function parseActivityRows(value: unknown[]) {
  return activityRowSchema.array().parse(value);
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Check if a user has access to view an activity
 * Returns true if: user owns the activity, OR activity is public, OR user follows the owner
 */
async function checkActivityAccess(
  db: ReturnType<typeof getRequiredDb>,
  activityId: string,
  userId: string,
): Promise<boolean> {
  const activity = await db.query.activities.findFirst({
    columns: {
      profile_id: true,
      is_private: true,
    },
    where: eq(activities.id, activityId),
  });

  if (!activity) {
    return false;
  }

  // User owns the activity
  if (activity.profile_id === userId) {
    return true;
  }

  // Activity is public - allow access
  if (!activity.is_private) {
    return true;
  }

  // Activity is private - check if user follows the owner
  const followResult = await db.execute(sql<{ has_access: boolean }>`
    select exists(
      select 1
      from follows
      where follower_id = ${userId}::uuid
        and following_id = ${activity.profile_id}::uuid
        and status = 'accepted'
    ) as has_access
  `);

  return Boolean(followResult.rows[0]?.has_access);
}

export const activitiesRouter = createTRPCRouter({
  // List activities by date range (legacy - for trends/analytics)
  list: protectedProcedure
    .input(listInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const data = parseActivityRows(
        await db
          .select()
          .from(activities)
          .where(
          and(
            eq(activities.profile_id, ctx.session.user.id),
            gte(activities.started_at, new Date(input.date_from)),
            lte(activities.started_at, new Date(input.date_to)),
          ),
        )
        .orderBy(desc(activities.started_at)),
      );

      const derivedMap = await buildActivityDerivedSummaryMap({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: data || [],
      });

      const activityIds = data.map((activity) => activity.id);
      const likeRows = activityIds.length
        ? await db
            .select({ entity_id: likes.entity_id })
            .from(likes)
            .where(
              and(
                eq(likes.profile_id, ctx.session.user.id),
                eq(likes.entity_type, "activity"),
                inArray(likes.entity_id, activityIds),
              ),
            )
        : [];

      const parsedLikeRows = likeRowSchema.array().parse(likeRows);

      const userLikes = new Set(parsedLikeRows.map((row) => row.entity_id));

      return activityListResponseSchema.parse(
        data.map((activity) =>
          mapActivityToListDerivedResponse({
            activity,
            has_liked: userLikes.has(activity.id),
            derived: derivedMap.get(activity.id) ?? null,
          }),
        ),
      );
    }),

  // Paginated list of activities with filters
  listPaginated: protectedProcedure
    .input(listPaginatedInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const conditions = [eq(activities.profile_id, ctx.session.user.id)];

      if (input.activity_category) {
        conditions.push(eq(activities.type, input.activity_category));
      }

      if (input.date_from) {
        conditions.push(gte(activities.started_at, new Date(input.date_from)));
      }

      if (input.date_to) {
        conditions.push(lte(activities.started_at, new Date(input.date_to)));
      }

      const whereClause = and(...conditions);

      const totalPromise = db.select({ total: count() }).from(activities).where(whereClause);

      const dataPromise =
        input.sort_by === "tss"
          ? db.select().from(activities).where(whereClause).orderBy(desc(activities.started_at))
          : input.sort_by === "distance"
            ? db
                .select()
                .from(activities)
                .where(whereClause)
                .orderBy(
                  input.sort_order === "asc"
                    ? activities.distance_meters
                    : desc(activities.distance_meters),
                )
                .limit(input.limit)
                .offset(input.offset)
            : input.sort_by === "duration"
              ? db
                  .select()
                  .from(activities)
                  .where(whereClause)
                  .orderBy(
                    input.sort_order === "asc"
                      ? activities.duration_seconds
                      : desc(activities.duration_seconds),
                  )
                  .limit(input.limit)
                  .offset(input.offset)
              : db
                  .select()
                  .from(activities)
                  .where(whereClause)
                  .orderBy(
                    input.sort_order === "asc"
                      ? activities.started_at
                      : desc(activities.started_at),
                  )
                  .limit(input.limit)
                  .offset(input.offset);

      const [totalRows, rawData] = await Promise.all([totalPromise, dataPromise]);
      const total = Number(totalRowSchema.parse(totalRows[0] ?? { total: 0 }).total);
      const data = parseActivityRows(rawData);

      const derivedMap = await buildActivityDerivedSummaryMap({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: data || [],
      });

      const activityIds = data.map((activity) => activity.id);
      const likeRows = activityIds.length
        ? await db
            .select({ entity_id: likes.entity_id })
            .from(likes)
            .where(
              and(
                eq(likes.profile_id, ctx.session.user.id),
                eq(likes.entity_type, "activity"),
                inArray(likes.entity_id, activityIds),
              ),
            )
        : [];

      const parsedLikeRows = likeRowSchema.array().parse(likeRows);

      const userLikes = new Set(parsedLikeRows.map((row) => row.entity_id));

      let items = data.map((activity) =>
        mapActivityToListDerivedResponse({
          activity,
          has_liked: userLikes.has(activity.id),
          derived: derivedMap.get(activity.id) ?? null,
        }),
      );

      if (input.sort_by === "tss") {
        items = items
          .sort((a: any, b: any) => {
            const left = a.derived?.tss ?? Number.NEGATIVE_INFINITY;
            const right = b.derived?.tss ?? Number.NEGATIVE_INFINITY;
            return input.sort_order === "asc" ? left - right : right - left;
          })
          .slice(input.offset, input.offset + input.limit);
      }

      return z
        .object({
          items: activityListItemSchema.array(),
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
        })
        .strict()
        .parse({
          items,
          total,
          hasMore: total > input.offset + input.limit,
        });
    }),

  // Simplified: Just create the activity first
  create: protectedProcedure
    .input(createInputSchema)
    .mutation(async ({ input, ctx }) => {
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
        const linkedEvent = await db.query.events.findFirst({
          columns: { activity_plan_id: true },
          where: and(
            eq(events.id, input.eventId),
            eq(events.profile_id, ctx.session.user.id),
            eq(events.event_type, "planned_activity"),
          ),
        });

        if (!linkedEvent) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Linked event not found.",
          });
        }

        linkedActivityPlanId = linkedEvent.activity_plan_id;
      }

      const insertResult = await db.execute(sql`
        insert into activities (
          id,
          profile_id,
          activity_plan_id,
          name,
          notes,
          type,
          started_at,
          finished_at,
          duration_seconds,
          moving_seconds,
          distance_meters,
          normalized_power,
          is_private,
          created_at,
          updated_at
        ) values (
          ${randomUUID()}::uuid,
          ${input.profile_id}::uuid,
          ${linkedActivityPlanId}::uuid,
          ${input.name},
          ${input.notes ?? null},
          ${input.type},
          ${new Date(input.startedAt)},
          ${new Date(input.finishedAt)},
          ${duration_seconds},
          ${input.movingSeconds},
          ${input.distanceMeters},
          ${input.metrics.normalized_power ?? null},
          ${false},
          now(),
          now()
        )
        returning id
      `);

      const createdActivityId = insertedActivityIdRowSchema.parse(insertResult.rows[0]).id;

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

  getById: protectedProcedure
    .input(getByIdInputSchema)
    .query(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);
      const userId = ctx.session.user.id;

      // Check authorization
      const hasAccess = await checkActivityAccess(db, input.id, userId);

      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to view this activity",
        });
      }

      const [activityRecord, likeData] = await Promise.all([
        db
          .select({
            activity: activities,
            activityPlan: activityPlans,
          })
          .from(activities)
          .leftJoin(activityPlans, eq(activities.activity_plan_id, activityPlans.id))
          .where(eq(activities.id, input.id))
          .limit(1),
        db.query.likes.findFirst({
          columns: { id: true },
          where: and(
            eq(likes.profile_id, userId),
            eq(likes.entity_type, "activity"),
            eq(likes.entity_id, input.id),
          ),
        }),
      ]);

      const row = activityRecord[0];

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
      }

      const parsedActivity = parseActivityRow(row.activity);

      const data = activityWithPlanSchema.parse({
        ...parsedActivity,
        activity_plans: row.activityPlan
          ? {
              ...row.activityPlan,
              idx: row.activityPlan.idx ?? 0,
              created_at: toIsoString(row.activityPlan.created_at),
              updated_at: toIsoString(row.activityPlan.updated_at),
            }
          : null,
      });

      const context = await resolveActivityContextAsOf({
        store: createActivityAnalysisStore(db),
        profileId: data.profile_id,
        activityTimestamp: data.finished_at,
      });

      const derived = analyzeActivityDerivedMetrics({
        activity: {
          id: data.id,
          type: data.type,
          started_at: data.started_at.toISOString(),
          finished_at: data.finished_at.toISOString(),
          duration_seconds: data.duration_seconds,
          moving_seconds: data.moving_seconds,
          distance_meters: data.distance_meters,
          avg_heart_rate: data.avg_heart_rate,
          max_heart_rate: data.max_heart_rate,
          avg_power: data.avg_power,
          max_power: data.max_power,
          avg_speed_mps: data.avg_speed_mps,
          max_speed_mps: data.max_speed_mps,
          normalized_power: data.normalized_power,
          normalized_speed_mps: data.normalized_speed_mps,
          normalized_graded_speed_mps: data.normalized_graded_speed_mps,
        },
        context,
      });

      return activityDerivedResponseSchema.parse(
        mapActivityToDerivedResponse({
          activity: data,
          has_liked: !!likeData,
          derived,
        }),
      );
    }),

  // Update activity (e.g., to set metrics after calculation)
  update: protectedProcedure
    .input(updateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const { id, ...updates } = input;

      const [data] = await db
        .update(activities)
        .set({
          ...updates,
          updated_at: new Date(),
        })
        .where(and(eq(activities.id, id), eq(activities.profile_id, ctx.session.user.id)))
        .returning();

      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
      }

      return parseActivityRow(data);
    }),

  // Hard delete activity - permanently removes the record
  // Activity streams are automatically deleted via cascade
  delete: protectedProcedure
    .input(deleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const activity = await db.query.activities.findFirst({
        where: and(eq(activities.id, input.id), eq(activities.profile_id, ctx.session.user.id)),
      });

      if (!activity) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity not found or you do not have permission to delete it.",
        });
      }

      await db
        .delete(activities)
        .where(and(eq(activities.id, input.id), eq(activities.profile_id, ctx.session.user.id)));

      return { success: true, deletedActivityId: input.id };
    }),
});
