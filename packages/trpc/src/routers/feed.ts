import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
  training_stress_score: number | null;
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
}

const feedItemSchema = z.object({
  cursor: z.string().nullish(),
  limit: z.number().min(1).max(50).default(20),
});

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
  getFeed: protectedProcedure
    .input(feedItemSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input.limit ?? 20;
      const cursor = input.cursor;

      try {
        // First, get IDs of users the current user follows
        const { data: followingData, error: followingError } = await (
          ctx.supabase as any
        )
          .from("follows")
          .select("following_id")
          .eq("follower_id", userId)
          .eq("status", "accepted");

        if (followingError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: followingError.message,
          });
        }

        // Get the IDs of followed users + own ID
        const followedUserIds = (followingData || []).map(
          (f: any) => f.following_id,
        );
        const allRelevantUserIds = [...followedUserIds, userId];

        // Build the query for activities
        let query = (ctx.supabase as any)
          .from("activities")
          .select(
            `
            id,
            profile_id,
            name,
            type,
            started_at,
            finished_at,
            distance_meters,
            duration_seconds,
            moving_seconds,
            avg_heart_rate,
            max_heart_rate,
            avg_power,
            avg_cadence,
            training_stress_score,
            elevation_gain_meters,
            calories,
            polyline,
            likes_count,
            comments_count,
            is_private,
            created_at,
            profile:profiles!activities_profile_id_fkey(
              id,
              username,
              avatar_url
            )
          `,
          )
          .in("profile_id", allRelevantUserIds)
          .eq("is_private", false)
          .order("started_at", { ascending: false })
          .limit(limit + 1); // Fetch one extra to determine if there are more

        // Apply cursor if provided
        if (cursor) {
          const cursorDate = new Date(cursor);
          query = query.lt("started_at", cursorDate.toISOString());
        }

        const { data: activities, error: activitiesError } = await query;

        if (activitiesError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: activitiesError.message,
          });
        }

        // Get user's likes for these activities
        const activityIds = (activities || []).map((a: any) => a.id);
        let userLikes: string[] = [];

        if (activityIds.length > 0) {
          const { data: likesData } = await (ctx.supabase as any)
            .from("likes")
            .select("entity_id")
            .eq("profile_id", userId)
            .eq("entity_type", "activity")
            .in("entity_id", activityIds);

          userLikes = (likesData || []).map((l: any) => l.entity_id);
        }

        // Transform the data
        let feedItems: FeedActivity[] = (activities || []).map((a: any) => ({
          id: a.id,
          profile_id: a.profile_id,
          name: a.name,
          type: a.type,
          started_at: a.started_at,
          finished_at: a.finished_at,
          distance_meters: a.distance_meters,
          duration_seconds: a.duration_seconds,
          moving_seconds: a.moving_seconds,
          avg_heart_rate: a.avg_heart_rate,
          max_heart_rate: a.max_heart_rate,
          avg_power: a.avg_power,
          avg_cadence: a.avg_cadence,
          training_stress_score: a.training_stress_score,
          elevation_gain_meters: a.elevation_gain_meters,
          calories: a.calories,
          polyline: a.polyline,
          likes_count: a.likes_count || 0,
          comments_count: a.comments_count || 0,
          is_private: a.is_private,
          created_at: a.created_at,
          profile: a.profile
            ? {
                id: a.profile.id,
                username: a.profile.username,
                avatar_url: a.profile.avatar_url,
              }
            : undefined,
          has_liked: userLikes.includes(a.id),
        }));

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

      try {
        // First, get the activity to check authorization
        const { data: activity, error: activityError } = await (
          ctx.supabase as any
        )
          .from("activities")
          .select("profile_id, is_private")
          .eq("id", input.activityId)
          .single();

        if (activityError || !activity) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activity not found",
          });
        }

        // Check authorization: owner, public, or following
        const isActivityOwner = activity.profile_id === userId;

        if (!isActivityOwner && !activity.is_private) {
          // Activity is public - allow access
        } else if (!isActivityOwner && activity.is_private) {
          // Activity is private - check if user follows the owner
          const { data: followData } = await (ctx.supabase as any)
            .from("follows")
            .select("follower_id")
            .eq("follower_id", userId)
            .eq("following_id", activity.profile_id)
            .eq("status", "accepted")
            .maybeSingle();

          if (!followData) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You don't have permission to view this activity",
            });
          }
        }

        // Get the full activity data after authorization passes
        const { data: fullActivity, error } = await (ctx.supabase as any)
          .from("activities")
          .select(
            `
            id,
            profile_id,
            name,
            type,
            notes,
            started_at,
            finished_at,
            distance_meters,
            duration_seconds,
            moving_seconds,
            avg_heart_rate,
            max_heart_rate,
            avg_power,
            max_power,
            avg_cadence,
            max_cadence,
            training_stress_score,
            intensity_factor,
            normalized_power,
            elevation_gain_meters,
            elevation_loss_meters,
            calories,
            polyline,
            map_bounds,
            likes_count,
            comments_count,
            is_private,
            created_at,
            profile:profiles!activities_profile_id_fkey(
              id,
              username,
              avatar_url
            )
          `,
          )
          .eq("id", input.activityId)
          .single();

        if (error) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activity not found",
          });
        }

        // Check if user has liked this activity
        const { data: likeData } = await (ctx.supabase as any)
          .from("likes")
          .select("id")
          .eq("profile_id", userId)
          .eq("entity_id", input.activityId)
          .eq("entity_type", "activity")
          .maybeSingle();

        // Get comments for this activity
        const { data: commentsData } = await (ctx.supabase as any)
          .from("comments")
          .select(
            `
            id,
            content,
            created_at,
            profile:profiles(
              id,
              username,
              avatar_url
            )
          `,
          )
          .eq("entity_id", input.activityId)
          .eq("entity_type", "activity")
          .order("created_at", { ascending: true });

        return {
          ...fullActivity,
          has_liked: !!likeData,
          comments: (commentsData || []).map((c: any) => ({
            id: c.id,
            content: c.content,
            created_at: c.created_at,
            profile: c.profile,
          })),
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
