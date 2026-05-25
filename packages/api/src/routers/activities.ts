import { randomUUID } from "node:crypto";
import {
  ActivityUploadSchema,
  activityDerivedMetricsSchema,
  activityListDerivedSummarySchema,
  analyzeActivityDerivedMetrics,
} from "@repo/core";
import {
  activities,
  activityFileIngestions,
  activityGeometry,
  activityImports,
  activityLaps,
  activityPlans,
  activitySummaries,
  eventScheduleLinks,
  events,
  likes,
  publicActivitiesRowSchema,
  publicActivityCategorySchema,
  publicActivityPlansRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createActivityFileIngestion } from "../application/activity-file-ingestion/ingestion-state";
import { getRequiredDb } from "../db";
import { createActivityAnalysisStore } from "../infrastructure/repositories";
import {
  buildActivityDerivedSummaryMap,
  mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse,
  resolveActivityContextAsOf,
} from "../lib/activity-analysis";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildIndexPageInfo, indexCursorSchema, parseIndexCursor } from "../utils/index-cursor";
import { markProfileAnalysisDirty } from "../utils/profile-estimation-state";

const isoDatetimeSchema = z.string().datetime({ offset: true });

// TSS is computed from activity context, so the DB cannot order by it exactly.
// Bound the recency candidate window to avoid unbounded full-history reads.
const tssSortMaxCandidates = 500;

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

const activityListResponseSchema = activityListItemSchema.array();

const listInputSchema = z
  .object({
    date_from: isoDatetimeSchema,
    date_to: isoDatetimeSchema,
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

function mergeActivitySummary<T extends typeof activities.$inferSelect>(
  activity: T,
  summary: typeof activitySummaries.$inferSelect | null,
): T {
  if (!summary) return activity;

  return {
    ...activity,
    duration_seconds: summary.duration_seconds,
    moving_seconds: summary.moving_seconds,
    distance_meters: summary.distance_meters,
    elevation_gain_meters: summary.elevation_gain_meters,
    elevation_loss_meters: summary.elevation_loss_meters,
    calories: summary.calories,
    avg_heart_rate: summary.avg_heart_rate,
    max_heart_rate: summary.max_heart_rate,
    avg_power: summary.avg_power,
    max_power: summary.max_power,
    normalized_power: summary.normalized_power,
    avg_cadence: summary.avg_cadence,
    max_cadence: summary.max_cadence,
    avg_speed_mps: summary.avg_speed_mps,
    max_speed_mps: summary.max_speed_mps,
    normalized_speed_mps: summary.normalized_speed_mps,
    normalized_graded_speed_mps: summary.normalized_graded_speed_mps,
    avg_temperature: summary.avg_temperature,
    avg_swolf: summary.avg_swolf,
    efficiency_factor: summary.efficiency_factor,
    aerobic_decoupling: summary.aerobic_decoupling,
    pool_length: summary.pool_length,
    total_strokes: summary.total_strokes,
  };
}

function mergeActivitySplitTables<T extends typeof activities.$inferSelect>(
  activity: T,
  split: {
    geometry?: typeof activityGeometry.$inferSelect | null;
    import?: typeof activityImports.$inferSelect | null;
    laps?: unknown[];
    summary?: typeof activitySummaries.$inferSelect | null;
  },
): T {
  const merged = mergeActivitySummary(activity, split.summary ?? null);
  const legacyMerged = merged as typeof merged & Record<string, unknown>;
  const importRow = split.import ?? null;
  const geometry = split.geometry ?? null;

  return {
    ...merged,
    provider: importRow?.provider ?? legacyMerged["provider"],
    external_id: importRow?.external_id ?? legacyMerged["external_id"],
    device_manufacturer: importRow?.device_manufacturer ?? legacyMerged["device_manufacturer"],
    device_product: importRow?.device_product ?? legacyMerged["device_product"],
    activity_file_path: importRow?.activity_file_path ?? legacyMerged["activity_file_path"],
    activity_file_size: importRow?.activity_file_size ?? legacyMerged["activity_file_size"],
    import_source: importRow?.import_source ?? legacyMerged["import_source"],
    import_file_type: importRow?.import_file_type ?? legacyMerged["import_file_type"],
    import_original_file_name:
      importRow?.import_original_file_name ?? legacyMerged["import_original_file_name"],
    polyline: geometry?.polyline ?? legacyMerged["polyline"],
    map_bounds: geometry?.map_bounds ?? legacyMerged["map_bounds"],
    laps: split.laps ?? legacyMerged["laps"],
  };
}

function normalizeActivityRows(rawRows: unknown[]): Array<typeof activities.$inferSelect> {
  return rawRows.map((row) => {
    if (row && typeof row === "object" && "activity" in row) {
      return (row as { activity: typeof activities.$inferSelect }).activity;
    }

    return row as typeof activities.$inferSelect;
  });
}

async function loadActivityListSplitMaps(
  db: ReturnType<typeof getRequiredDb>,
  profileId: string,
  activityIds: string[],
) {
  if (activityIds.length === 0) {
    return {
      summaries: new Map<string, typeof activitySummaries.$inferSelect>(),
      imports: new Map<string, typeof activityImports.$inferSelect>(),
      geometries: new Map<string, typeof activityGeometry.$inferSelect>(),
    };
  }

  const [summaryRows, importRows, geometryRows] = await Promise.all([
    db
      .select()
      .from(activitySummaries)
      .where(
        and(
          eq(activitySummaries.profile_id, profileId),
          inArray(activitySummaries.activity_id, activityIds),
        ),
      ),
    db
      .select()
      .from(activityImports)
      .where(
        and(
          eq(activityImports.profile_id, profileId),
          inArray(activityImports.activity_id, activityIds),
        ),
      ),
    db
      .select()
      .from(activityGeometry)
      .where(
        and(
          eq(activityGeometry.profile_id, profileId),
          inArray(activityGeometry.activity_id, activityIds),
        ),
      ),
  ]);

  return {
    summaries: new Map(
      Array.isArray(summaryRows) ? summaryRows.map((row) => [row.activity_id, row]) : [],
    ),
    imports: new Map(
      Array.isArray(importRows) ? importRows.map((row) => [row.activity_id, row]) : [],
    ),
    geometries: new Map(
      Array.isArray(geometryRows) ? geometryRows.map((row) => [row.activity_id, row]) : [],
    ),
  };
}

function mergeActivityListSplits(
  activity: typeof activities.$inferSelect,
  splitMaps: Awaited<ReturnType<typeof loadActivityListSplitMaps>>,
) {
  return mergeActivitySplitTables(activity, {
    geometry: splitMaps.geometries.get(activity.id) ?? null,
    import: splitMaps.imports.get(activity.id) ?? null,
    summary: splitMaps.summaries.get(activity.id) ?? null,
  });
}

/**
 * Check if a user has access to view an activity
 * Returns true if: user owns the activity, OR activity is public.
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

  return false;
}

export const activitiesRouter = createTRPCRouter({
  // List activities by date range (legacy - for trends/analytics)
  list: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const rawRows = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.profile_id, ctx.session.user.id),
          gte(activities.started_at, new Date(input.date_from)),
          lte(activities.started_at, new Date(input.date_to)),
        ),
      )
      .orderBy(desc(activities.started_at));

    const splitMaps = await loadActivityListSplitMaps(
      db,
      ctx.session.user.id,
      rawRows.map((activity) => activity.id),
    );

    const data = parseActivityRows(
      rawRows.map((activity) => mergeActivityListSplits(activity, splitMaps)),
    );

    const derivedMap = await buildActivityDerivedSummaryMap({
      store: createActivityAnalysisStore(db),
      profileId: ctx.session.user.id,
      activities: (data || []) as any,
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
      const offset = parseIndexCursor(input.cursor);
      const conditions = [eq(activities.profile_id, ctx.session.user.id)];

      if (input.activity_category) {
        conditions.push(eq(activities.type, input.activity_category));
      }

      if (input.search) {
        const pattern = `%${input.search}%`;
        const searchCondition = or(
          ilike(activities.name, pattern),
          ilike(activities.notes, pattern),
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      if (input.date_from) {
        conditions.push(gte(activities.started_at, new Date(input.date_from)));
      }

      if (input.date_to) {
        conditions.push(lte(activities.started_at, new Date(input.date_to)));
      }

      const whereClause = and(...conditions);

      const totalPromise = db.select({ total: count() }).from(activities).where(whereClause);
      const distanceSortExpression = sql<number>`${activitySummaries.distance_meters}`;
      const durationSortExpression = sql<number>`${activitySummaries.duration_seconds}`;
      const tssCandidateLimit = Math.min(
        Math.max(offset + input.limit, input.limit),
        tssSortMaxCandidates,
      );

      const dataPromise =
        input.sort_by === "tss"
          ? db
              .select()
              .from(activities)
              .where(whereClause)
              .orderBy(desc(activities.started_at))
              .limit(tssCandidateLimit)
          : input.sort_by === "distance"
            ? db
                .select({ activity: activities })
                .from(activities)
                .leftJoin(activitySummaries, eq(activities.id, activitySummaries.activity_id))
                .where(whereClause)
                .orderBy(
                  input.sort_order === "asc"
                    ? distanceSortExpression
                    : desc(distanceSortExpression),
                )
                .limit(input.limit)
                .offset(offset)
            : input.sort_by === "duration"
              ? db
                  .select({ activity: activities })
                  .from(activities)
                  .leftJoin(activitySummaries, eq(activities.id, activitySummaries.activity_id))
                  .where(whereClause)
                  .orderBy(
                    input.sort_order === "asc"
                      ? durationSortExpression
                      : desc(durationSortExpression),
                  )
                  .limit(input.limit)
                  .offset(offset)
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
                  .offset(offset);

      const [totalRows, rawData] = await Promise.all([totalPromise, dataPromise]);
      const total = Number(totalRowSchema.parse(totalRows[0] ?? { total: 0 }).total);
      const activityRows = normalizeActivityRows(rawData as unknown[]);
      const splitMaps = await loadActivityListSplitMaps(
        db,
        ctx.session.user.id,
        activityRows.map((activity) => activity.id),
      );
      const data = parseActivityRows(
        activityRows.map((activity) => mergeActivityListSplits(activity, splitMaps)),
      );

      const derivedMap = await buildActivityDerivedSummaryMap({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: (data || []) as any,
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
          .slice(offset, offset + input.limit);
      }

      const pageInfo = buildIndexPageInfo({
        offset,
        limit: input.limit,
        total,
      });

      return z
        .object({
          items: activityListItemSchema.array(),
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursor: z.string().optional(),
        })
        .strict()
        .parse({
          items,
          total,
          ...pageInfo,
        });
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

    const [activityRecord, likeData, ingestion] = await Promise.all([
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
      db.query.activityFileIngestions?.findFirst({
        columns: {
          id: true,
          status: true,
          source: true,
          last_error_message: true,
        },
        where: and(
          eq(activityFileIngestions.activity_id, input.id),
          eq(activityFileIngestions.profile_id, userId),
        ),
        orderBy: desc(activityFileIngestions.updated_at),
      }) ?? Promise.resolve(undefined),
    ]);

    const row = activityRecord[0];

    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Activity not found",
      });
    }

    const lapRows = await db
      .select({ payload: activityLaps.payload })
      .from(activityLaps)
      .where(
        and(
          eq(activityLaps.activity_id, input.id),
          eq(activityLaps.profile_id, row.activity.profile_id),
        ),
      )
      .orderBy(activityLaps.lap_index);
    const splitQueries = db.query as typeof db.query & {
      activityGeometry?: {
        findFirst: (args: unknown) => Promise<typeof activityGeometry.$inferSelect | undefined>;
      };
      activityImports?: {
        findFirst: (args: unknown) => Promise<typeof activityImports.$inferSelect | undefined>;
      };
      activitySummaries?: {
        findFirst: (args: unknown) => Promise<typeof activitySummaries.$inferSelect | undefined>;
      };
    };

    const [summary, importRow, geometry] = await Promise.all([
      splitQueries.activitySummaries?.findFirst({
        where: and(
          eq(activitySummaries.activity_id, input.id),
          eq(activitySummaries.profile_id, row.activity.profile_id),
        ),
      }) ?? Promise.resolve(undefined),
      splitQueries.activityImports?.findFirst({
        where: and(
          eq(activityImports.activity_id, input.id),
          eq(activityImports.profile_id, row.activity.profile_id),
        ),
      }) ?? Promise.resolve(undefined),
      splitQueries.activityGeometry?.findFirst({
        where: and(
          eq(activityGeometry.activity_id, input.id),
          eq(activityGeometry.profile_id, row.activity.profile_id),
        ),
      }) ?? Promise.resolve(undefined),
    ]);
    const lapPayloads = lapRows
      .map((lap) => lap.payload)
      .filter((payload) => payload !== undefined);
    const hasSplitActivityRecord = Boolean(
      summary ?? importRow ?? geometry ?? lapPayloads.length > 0,
    );

    const splitActivityValues: Parameters<typeof mergeActivitySplitTables>[1] = {};
    if (geometry !== undefined) splitActivityValues.geometry = geometry;
    if (importRow !== undefined) splitActivityValues.import = importRow;
    if (summary !== undefined) splitActivityValues.summary = summary;
    if (hasSplitActivityRecord) splitActivityValues.laps = lapPayloads;

    const parsedActivity = parseActivityRow(
      mergeActivitySplitTables(row.activity, splitActivityValues),
    );

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
      ingestion: ingestion ?? null,
    });

    const context = await resolveActivityContextAsOf({
      store: createActivityAnalysisStore(db),
      profileId: data.profile_id,
      activityTimestamp: data.finished_at,
    });

    const activityForAnalysis = data as typeof data & Record<string, number | null>;
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: data.id,
        type: data.type,
        started_at: data.started_at.toISOString(),
        finished_at: data.finished_at.toISOString(),
        duration_seconds: activityForAnalysis["duration_seconds"] ?? 0,
        moving_seconds: activityForAnalysis["moving_seconds"] ?? 0,
        distance_meters: activityForAnalysis["distance_meters"] ?? 0,
        avg_heart_rate: activityForAnalysis["avg_heart_rate"],
        max_heart_rate: activityForAnalysis["max_heart_rate"],
        avg_power: activityForAnalysis["avg_power"],
        max_power: activityForAnalysis["max_power"],
        avg_speed_mps: activityForAnalysis["avg_speed_mps"],
        max_speed_mps: activityForAnalysis["max_speed_mps"],
        normalized_power: activityForAnalysis["normalized_power"],
        normalized_speed_mps: activityForAnalysis["normalized_speed_mps"],
        normalized_graded_speed_mps: activityForAnalysis["normalized_graded_speed_mps"],
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
  update: protectedProcedure.input(updateInputSchema).mutation(async ({ ctx, input }) => {
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
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Activity not found",
      });
    }

    if (input.normalized_power !== undefined) {
      await markProfileAnalysisDirty(db, {
        profileId: ctx.session.user.id,
        kinds: ["fitness"],
        dirtySince: data.started_at,
      });
    }

    return parseActivityRow(data);
  }),

  // Hard delete activity - permanently removes the record
  // Activity streams are automatically deleted via cascade
  delete: protectedProcedure.input(deleteInputSchema).mutation(async ({ ctx, input }) => {
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

    await markProfileAnalysisDirty(db, {
      profileId: ctx.session.user.id,
      kinds: ["performance", "fitness"],
      dirtySince: activity.started_at,
    });

    return { success: true, deletedActivityId: input.id };
  }),
});
