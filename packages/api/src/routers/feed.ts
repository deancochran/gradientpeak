import { type PublicActivitiesRow, type PublicCommentsRow, schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createActivityAnalysisStore } from "../infrastructure/repositories";
import { buildActivityDerivedSummaryMap } from "../lib/activity-analysis";
import { createTRPCRouter, protectedProcedure } from "../trpc";

/**
 * Feed Item Types
 *
 * The feed contains completed activities from:
 * - The current user's own activities
 * - Users that the current user follows
 */
export interface FeedActivity {
  id: string;
  profile_id: string;
  name: string;
  type: string;
  started_at: string;
  finished_at: string;
  distance_meters: number;
  duration_seconds: number;
  moving_seconds: number;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_power: number | null;
  avg_cadence: number | null;
  elevation_gain_meters: number | null;
  calories: number | null;
  polyline: string | null;
  likes_count: number;
  comments_count: number;
  is_private: boolean;
  created_at: string;

  // Joined profile data
  profile?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };

  // User's like status for this activity
  has_liked: boolean;
  derived?: {
    tss: number | null;
    intensity_factor: number | null;
    computed_as_of: string;
  } | null;
}

const feedItemSchema = z.object({
  cursor: z.string().nullish(),
  limit: z.number().min(1).max(50).default(20),
});

type FeedActivityRow = Pick<
  PublicActivitiesRow,
  | "id"
  | "profile_id"
  | "name"
  | "type"
  | "distance_meters"
  | "duration_seconds"
  | "moving_seconds"
  | "avg_heart_rate"
  | "max_heart_rate"
  | "avg_power"
  | "avg_cadence"
  | "elevation_gain_meters"
  | "calories"
  | "polyline"
  | "likes_count"
  | "is_private"
> & {
  started_at: PublicActivitiesRow["started_at"] | string;
  finished_at: PublicActivitiesRow["finished_at"] | string;
  created_at: PublicActivitiesRow["created_at"] | string;
  profile_username: string | null;
  profile_avatar_url: string | null;
};

type FeedActivityDetailRow = FeedActivityRow &
  Pick<
    PublicActivitiesRow,
    | "notes"
    | "max_power"
    | "max_cadence"
    | "normalized_power"
    | "elevation_loss_meters"
    | "map_bounds"
  > & {
    viewer_follows_owner: boolean;
  };

type CommentCountRow = {
  entity_id: string;
  comments_count: number;
};

type ActivityCommentRow = Pick<PublicCommentsRow, "id" | "content" | "profile_id"> & {
  created_at: PublicCommentsRow["created_at"] | string;
  profile_username: string | null;
  profile_avatar_url: string | null;
};

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
  return {
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
  };
}

function buildUuidInList(values: string[]) {
  return sql.join(
    values.map((value) => sql`${value}::uuid`),
    sql`, `,
  );
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
      const cursorFilter = cursor ? sql`and a.started_at < ${new Date(cursor)}` : sql``;

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
          a.avg_cadence,
          a.elevation_gain_meters,
          a.calories,
          a.polyline,
          a.likes_count,
          a.is_private,
          a.created_at,
          p.username as profile_username,
          p.avatar_url as profile_avatar_url
        from activities a
        left join profiles p on p.id = a.profile_id
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
        order by a.started_at desc
        limit ${limit + 1}
      `);

      const activities = activitiesResult.rows as FeedActivityRow[];

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
        const commentRows = await db.execute(sql<CommentCountRow>`
          select c.entity_id, count(*)::int as comments_count
          from comments c
          where c.entity_type = 'activity'
            and c.entity_id in (${buildUuidInList(activityIds)})
          group by c.entity_id
        `);

        for (const comment of commentRows.rows as CommentCountRow[]) {
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
          nextCursor = nextItem.started_at;
        }
        feedItems = feedItems.slice(0, limit);
      }

      return {
        items: feedItems,
        nextCursor,
        hasMore: nextCursor !== null,
      };
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

  /**
   * getActivity - Get a single activity for the feed detail view
   *
   * Authorization:
   * - User must own the activity, OR
   * - Activity must be public, OR
   * - User must follow the activity owner (accepted follow)
   */
  getActivity: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const db = getRequiredDb(ctx);

      try {
        const activityResult = await db.execute(sql<FeedActivityDetailRow>`
          select
            a.id,
            a.profile_id,
            a.name,
            a.type,
            a.notes,
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
            a.max_cadence,
            a.normalized_power,
            a.elevation_gain_meters,
            a.elevation_loss_meters,
            a.calories,
            a.polyline,
            a.map_bounds,
            a.likes_count,
            a.is_private,
            a.created_at,
            p.username as profile_username,
            p.avatar_url as profile_avatar_url,
            exists (
              select 1
              from follows f
              where f.follower_id = ${userId}::uuid
                and f.following_id = a.profile_id
                and f.status = 'accepted'
            ) as viewer_follows_owner
          from activities a
          left join profiles p on p.id = a.profile_id
          where a.id = ${input.activityId}::uuid
          limit 1
        `);

        const activity = (activityResult.rows as FeedActivityDetailRow[])[0];

        if (!activity) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activity not found",
          });
        }

        const isActivityOwner = activity.profile_id === userId;

        if (activity.is_private && !isActivityOwner && !activity.viewer_follows_owner) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view this activity",
          });
        }

        const [likeRows, commentsResult] = await Promise.all([
          db
            .select({ id: schema.likes.id })
            .from(schema.likes)
            .where(
              and(
                eq(schema.likes.profile_id, userId),
                eq(schema.likes.entity_id, input.activityId),
                eq(schema.likes.entity_type, "activity"),
              ),
            )
            .limit(1),
          db.execute(sql<ActivityCommentRow>`
            select
              c.id,
              c.content,
              c.created_at,
              p.id as profile_id,
              p.username as profile_username,
              p.avatar_url as profile_avatar_url
            from comments c
            left join profiles p on p.id = c.profile_id
            where c.entity_id = ${input.activityId}::uuid
              and c.entity_type = 'activity'
            order by c.created_at asc
          `),
        ]);

        const comments = (commentsResult.rows as ActivityCommentRow[]).map((comment) => ({
          id: comment.id,
          content: comment.content,
          created_at: toIsoString(comment.created_at),
          profile: comment.profile_id
            ? {
                id: comment.profile_id,
                username: comment.profile_username,
                avatar_url: comment.profile_avatar_url,
              }
            : null,
        }));

        return {
          id: activity.id,
          profile_id: activity.profile_id,
          name: activity.name,
          type: activity.type,
          notes: activity.notes,
          started_at: toIsoString(activity.started_at),
          finished_at: toIsoString(activity.finished_at),
          distance_meters: activity.distance_meters,
          duration_seconds: activity.duration_seconds,
          moving_seconds: activity.moving_seconds,
          avg_heart_rate: activity.avg_heart_rate,
          max_heart_rate: activity.max_heart_rate,
          avg_power: activity.avg_power,
          max_power: activity.max_power,
          avg_cadence: activity.avg_cadence,
          max_cadence: activity.max_cadence,
          normalized_power: activity.normalized_power,
          elevation_gain_meters: activity.elevation_gain_meters,
          elevation_loss_meters: activity.elevation_loss_meters,
          calories: activity.calories,
          polyline: activity.polyline,
          map_bounds: activity.map_bounds,
          likes_count: activity.likes_count ?? 0,
          is_private: activity.is_private,
          created_at: toIsoString(activity.created_at),
          profile: {
            id: activity.profile_id,
            username: activity.profile_username,
            avatar_url: activity.profile_avatar_url,
          },
          has_liked: likeRows.length > 0,
          comments_count: comments.length,
          comments,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch activity",
        });
      }
    }),
});
