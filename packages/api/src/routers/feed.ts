import { publicActivitiesRowSchema, schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createActivityAnalysisStore } from "../infrastructure/repositories";
import { buildActivityDerivedSummaryMap } from "../lib/activity-analysis";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const timestampSchema = z.union([z.date(), z.string()]);
const nullableNumericSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}, z.number().nullable());

const feedDerivedSchema = z
  .object({
    tss: z.number().nullable(),
    intensity_factor: z.number().nullable(),
    computed_as_of: z.string(),
  })
  .nullable();

const feedIngestionSchema = z
  .object({
    status: z.string().nullable(),
    last_error_message: z.string().nullable(),
  })
  .nullable();

const feedProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const feedItemSchema = z.object({
  cursor: z.string().nullish(),
  limit: z.number().min(1).max(50).default(20),
});

const feedActivityRowSchema = publicActivitiesRowSchema
  .pick({
    id: true,
    profile_id: true,
    name: true,
    type: true,
    distance_meters: true,
    duration_seconds: true,
    moving_seconds: true,
    avg_heart_rate: true,
    max_heart_rate: true,
    avg_power: true,
    avg_cadence: true,
    elevation_gain_meters: true,
    calories: true,
    polyline: true,
    activity_file_path: true,
    likes_count: true,
    is_private: true,
  })
  .extend({
    started_at: timestampSchema,
    finished_at: timestampSchema,
    created_at: timestampSchema,
    profile_username: z.string().nullable(),
    profile_avatar_url: z.string().nullable(),
    elevation_gain_meters: nullableNumericSchema,
    max_power: nullableNumericSchema.optional(),
    avg_speed_mps: nullableNumericSchema.optional(),
    max_speed_mps: nullableNumericSchema.optional(),
    normalized_power: nullableNumericSchema.optional(),
    normalized_speed_mps: nullableNumericSchema.optional(),
    normalized_graded_speed_mps: nullableNumericSchema.optional(),
    ingestion_status: z.string().nullable().optional(),
    ingestion_last_error_message: z.string().nullable().optional(),
  });

const commentCountRowSchema = z.object({
  entity_id: z.string().uuid(),
  comments_count: z.coerce.number().int().nonnegative(),
});

const feedActivityDtoSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  started_at: z.string(),
  finished_at: z.string(),
  distance_meters: z.number(),
  duration_seconds: z.number(),
  moving_seconds: z.number(),
  avg_heart_rate: z.number().nullable(),
  max_heart_rate: z.number().nullable(),
  avg_power: z.number().nullable(),
  avg_cadence: z.number().nullable(),
  elevation_gain_meters: z.number().nullable(),
  calories: z.number().nullable(),
  polyline: z.string().nullable(),
  activity_file_path: z.string().nullable(),
  likes_count: z.number(),
  comments_count: z.number().int().nonnegative(),
  is_private: z.boolean(),
  created_at: z.string(),
  profile: feedProfileSchema,
  has_liked: z.boolean(),
  derived: feedDerivedSchema,
  ingestion: feedIngestionSchema.optional(),
});

const feedResponseSchema = z.object({
  items: z.array(feedActivityDtoSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type FeedActivity = z.infer<typeof feedActivityDtoSchema>;
type FeedActivityRow = z.infer<typeof feedActivityRowSchema>;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapFeedActivity(
  activity: FeedActivityRow,
  options: {
    commentCounts: Map<string, number>;
    derivedMap: Map<string, FeedActivity["derived"]>;
    likedActivityIds: Set<string>;
  },
): FeedActivity {
  return feedActivityDtoSchema.parse({
    id: activity.id,
    profile_id: activity.profile_id,
    name: activity.name,
    type: activity.type,
    started_at: toIsoString(activity.started_at),
    finished_at: toIsoString(activity.finished_at),
    distance_meters: activity.distance_meters,
    duration_seconds: activity.duration_seconds,
    moving_seconds: activity.moving_seconds,
    avg_heart_rate: activity.avg_heart_rate,
    max_heart_rate: activity.max_heart_rate,
    avg_power: activity.avg_power,
    avg_cadence: activity.avg_cadence,
    elevation_gain_meters: activity.elevation_gain_meters,
    calories: activity.calories,
    polyline: activity.polyline,
    activity_file_path: activity.activity_file_path,
    likes_count: activity.likes_count ?? 0,
    comments_count: options.commentCounts.get(activity.id) ?? 0,
    is_private: activity.is_private,
    created_at: toIsoString(activity.created_at),
    profile: {
      id: activity.profile_id,
      username: activity.profile_username,
      avatar_url: activity.profile_avatar_url,
    },
    has_liked: options.likedActivityIds.has(activity.id),
    derived: options.derivedMap.get(activity.id) ?? null,
    ingestion: activity.ingestion_status
      ? {
          status: activity.ingestion_status,
          last_error_message: activity.ingestion_last_error_message ?? null,
        }
      : null,
  });
}

function buildUuidInList(values: string[]) {
  return sql.join(
    values.map((value) => sql`${value}::uuid`),
    sql`, `,
  );
}

function encodeFeedCursor(activity: Pick<FeedActivity, "id" | "started_at">) {
  return `${activity.started_at}|${activity.id}`;
}

function decodeFeedCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return null;
  }

  const [startedAt, id] = cursor.split("|");
  const startedAtDate = startedAt ? new Date(startedAt) : null;

  if (!startedAtDate || Number.isNaN(startedAtDate.getTime())) {
    return null;
  }

  return {
    id: id && z.string().uuid().safeParse(id).success ? id : null,
    startedAt: startedAtDate,
  };
}

export const feedRouter = createTRPCRouter({
  /**
   * getFeed - Get paginated activity feed
   *
   * Returns completed activities from:
   * - Current user's own activities (not private)
   * - Activities from users the current user follows (not private)
   *
   * Sorted by started_at DESC (newest first)
   */
  getFeed: protectedProcedure.input(feedItemSchema).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const db = getRequiredDb(ctx);
    const limit = input.limit ?? 20;
    const cursor = input.cursor;

    try {
      const decodedCursor = decodeFeedCursor(cursor);
      const cursorFilter = decodedCursor
        ? decodedCursor.id
          ? sql`and (a.started_at < ${decodedCursor.startedAt} or (a.started_at = ${decodedCursor.startedAt} and a.id < ${decodedCursor.id}::uuid))`
          : sql`and a.started_at < ${decodedCursor.startedAt}`
        : sql``;

      const activitiesResult = await db.execute(sql<FeedActivityRow>`
        select
          a.id,
          a.profile_id,
          a.name,
          a.type,
          a.started_at,
          a.finished_at,
          a.distance_meters,
          a.duration_seconds,
          a.moving_seconds,
          a.avg_heart_rate,
          a.max_heart_rate,
          a.avg_power,
          a.max_power,
          a.avg_cadence,
          a.avg_speed_mps,
          a.max_speed_mps,
          a.normalized_power,
          a.normalized_speed_mps,
          a.normalized_graded_speed_mps,
          a.elevation_gain_meters,
          a.calories,
          a.polyline,
          a.activity_file_path,
          a.likes_count,
          a.is_private,
          a.created_at,
          p.username as profile_username,
          p.avatar_url as profile_avatar_url,
          afi.status as ingestion_status,
          afi.last_error_message as ingestion_last_error_message
        from activities a
        left join profiles p on p.id = a.profile_id
        left join lateral (
          select status, last_error_message
          from activity_file_ingestions
          where activity_id = a.id and profile_id = a.profile_id
          order by updated_at desc
          limit 1
        ) afi on true
        where a.is_private = false
          and (
            a.profile_id = ${userId}::uuid
            or exists (
              select 1
              from follows f
              where f.follower_id = ${userId}::uuid
                and f.following_id = a.profile_id
                and f.status = 'accepted'
            )
          )
          ${cursorFilter}
        order by a.started_at desc, a.id desc
        limit ${limit + 1}
      `);

      const activities = z.array(feedActivityRowSchema).parse(activitiesResult.rows);

      // Get user's likes for these activities
      const activityIds = activities.map((activity) => activity.id);
      let likedActivityIds = new Set<string>();

      if (activityIds.length > 0) {
        const likesRows = await db
          .select({ entity_id: schema.likes.entity_id })
          .from(schema.likes)
          .where(
            and(
              eq(schema.likes.profile_id, userId),
              eq(schema.likes.entity_type, "activity"),
              inArray(schema.likes.entity_id, activityIds),
            ),
          );

        likedActivityIds = new Set(likesRows.map((row) => row.entity_id));
      }

      const commentCounts = new Map<string, number>();

      if (activityIds.length > 0) {
        const commentRows = await db.execute(sql`
          select c.entity_id, count(*)::int as comments_count
          from comments c
          where c.entity_type = 'activity'
            and c.entity_id in (${buildUuidInList(activityIds)})
          group by c.entity_id
        `);

        for (const comment of z.array(commentCountRowSchema).parse(commentRows.rows)) {
          commentCounts.set(comment.entity_id, comment.comments_count);
        }
      }

      const derivedMap = await buildActivityDerivedSummaryMap({
        store: createActivityAnalysisStore(db),
        profileId: userId,
        activities: activities as any,
      });

      let feedItems = activities.map((activity) =>
        mapFeedActivity(activity, {
          commentCounts,
          derivedMap,
          likedActivityIds,
        }),
      );

      // Determine if there are more items
      let nextCursor: string | null = null;
      if (feedItems.length > limit) {
        const nextItem = feedItems[limit - 1];
        if (nextItem) {
          nextCursor = encodeFeedCursor(nextItem);
        }
        feedItems = feedItems.slice(0, limit);
      }

      return feedResponseSchema.parse({
        items: feedItems,
        nextCursor,
        hasMore: nextCursor !== null,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch feed",
      });
    }
  }),
});
