import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

/**
 * Check if a user has access to view an activity
 * Returns true if: user owns the activity, OR activity is public, OR user follows the owner
 */
async function checkActivityAccess(
  supabase: any,
  activityId: string,
  userId: string,
): Promise<boolean> {
  // Get the activity
  const { data: activity, error } = await supabase
    .from("activities")
    .select("profile_id, is_private")
    .eq("id", activityId)
    .single();

  if (error || !activity) {
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
  const { data: followData } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", userId)
    .eq("following_id", activity.profile_id)
    .eq("status", "accepted")
    .maybeSingle();

  return !!followData;
}

async function checkPlanAccess(
  supabase: any,
  planId: string,
  planType: "training_plan" | "activity_plan",
  userId: string,
): Promise<boolean> {
  const table =
    planType === "training_plan" ? "training_plans" : "activity_plans";

  const { data: plan, error } = await supabase
    .from(table)
    .select("profile_id, is_system_template, template_visibility")
    .eq("id", planId)
    .single();

  if (error || !plan) {
    return false;
  }

  if (plan.profile_id === userId) {
    return true;
  }

  if (plan.is_system_template) {
    return true;
  }

  if (plan.template_visibility === "public") {
    return true;
  }

  return false;
}

export const socialRouter = createTRPCRouter({
  followUser: protectedProcedure
    .input(z.object({ target_user_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Can't follow yourself
      if (ctx.session.user.id === input.target_user_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot follow yourself",
        });
      }

      // Check if target profile is public
      const { data: targetProfile, error: profileError } = await (
        ctx.supabase as any
      )
        .from("profiles")
        .select("is_public")
        .eq("id", input.target_user_id)
        .single();

      if (profileError || !targetProfile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target user not found",
        });
      }

      // Check if there's already a follow relationship
      const { data: existingFollow } = await (ctx.supabase as any)
        .from("follows")
        .select("id, status")
        .eq("follower_id", ctx.session.user.id)
        .eq("following_id", input.target_user_id)
        .maybeSingle();

      if (existingFollow) {
        // Already following - return success
        if (existingFollow.status === "accepted") {
          return { ...existingFollow, already_following: true };
        }

        // Already have a pending request - return success without creating duplicate notification
        if (existingFollow.status === "pending") {
          return { ...existingFollow, already_pending: true };
        }
      }

      // Determine initial status based on target's privacy
      const status = targetProfile.is_public ? "accepted" : "pending";

      const { data, error } = await (ctx.supabase as any)
        .from("follows")
        .insert({
          follower_id: ctx.session.user.id,
          following_id: input.target_user_id,
          status,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Create notification for follow request ONLY if target profile is private
      // and we just created a pending request
      if (status === "pending") {
        // Check if a notification already exists to prevent duplicates
        const { data: existingNotif } = await (ctx.supabase as any)
          .from("notifications")
          .select("id")
          .eq("user_id", input.target_user_id)
          .eq("actor_id", ctx.session.user.id)
          .eq("type", "follow_request")
          .maybeSingle();

        // Only create notification if one doesn't exist
        if (!existingNotif) {
          const { error: notifError } = await (ctx.supabase as any)
            .from("notifications")
            .insert({
              user_id: input.target_user_id,
              actor_id: ctx.session.user.id,
              type: "follow_request",
            });

          if (notifError) {
            console.error(
              "Failed to create follow request notification:",
              notifError,
            );
          }
        }
      }

      return data;
    }),

  unfollowUser: protectedProcedure
    .input(z.object({ target_user_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await (ctx.supabase as any)
        .from("follows")
        .delete()
        .eq("follower_id", ctx.session.user.id)
        .eq("following_id", input.target_user_id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    }),

  acceptFollowRequest: protectedProcedure
    .input(z.object({ follower_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // First check if there's ANY follow relationship (pending or accepted)
      const { data: existingFollow } = await (ctx.supabase as any)
        .from("follows")
        .select("*")
        .eq("follower_id", input.follower_id)
        .eq("following_id", ctx.session.user.id)
        .maybeSingle();

      // If no follow record exists, this is an orphan notification - clean it up
      if (!existingFollow) {
        // Delete any orphan follow_request notifications from this user
        const { error: deleteNotifError } = await (ctx.supabase as any)
          .from("notifications")
          .delete()
          .eq("user_id", ctx.session.user.id)
          .eq("actor_id", input.follower_id)
          .eq("type", "follow_request");

        if (deleteNotifError) {
          console.error(
            "Failed to delete orphan notification:",
            deleteNotifError,
          );
        }

        return {
          success: true,
          message: "No pending request found - notification cleaned up",
        };
      }

      // If already accepted, just return success (handle stale notifications)
      if (existingFollow.status === "accepted") {
        // Clean up any orphan follow_request notifications
        await (ctx.supabase as any)
          .from("notifications")
          .delete()
          .eq("user_id", ctx.session.user.id)
          .eq("actor_id", input.follower_id)
          .eq("type", "follow_request");

        return { success: true, message: "Already following" };
      }

      // Accept the follow request
      const { error } = await (ctx.supabase as any)
        .from("follows")
        .update({ status: "accepted" })
        .eq("follower_id", input.follower_id)
        .eq("following_id", ctx.session.user.id)
        .eq("status", "pending");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Clean up the follow_request notification
      await (ctx.supabase as any)
        .from("notifications")
        .delete()
        .eq("user_id", ctx.session.user.id)
        .eq("actor_id", input.follower_id)
        .eq("type", "follow_request");

      // Create notification for the follower that their request was accepted
      const { error: notifError } = await (ctx.supabase as any)
        .from("notifications")
        .insert({
          user_id: input.follower_id,
          actor_id: ctx.session.user.id,
          type: "new_follower",
        });

      if (notifError) {
        console.error(
          "Failed to create follow accepted notification:",
          notifError,
        );
      }

      return { success: true };
    }),

  rejectFollowRequest: protectedProcedure
    .input(z.object({ follower_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // First check if there's ANY follow relationship (pending or accepted)
      const { data: existingFollow } = await (ctx.supabase as any)
        .from("follows")
        .select("*")
        .eq("follower_id", input.follower_id)
        .eq("following_id", ctx.session.user.id)
        .maybeSingle();

      // If no follow record exists, this is an orphan notification - just clean it up
      if (!existingFollow) {
        // Delete any orphan follow_request notifications from this user
        const { error: deleteNotifError } = await (ctx.supabase as any)
          .from("notifications")
          .delete()
          .eq("user_id", ctx.session.user.id)
          .eq("actor_id", input.follower_id)
          .eq("type", "follow_request");

        if (deleteNotifError) {
          console.error(
            "Failed to delete orphan notification:",
            deleteNotifError,
          );
        }

        return {
          success: true,
          message: "No pending request found - notification cleaned up",
        };
      }

      // If already accepted or not pending, just return success and clean up notification
      if (existingFollow.status !== "pending") {
        // Clean up any orphan follow_request notifications
        await (ctx.supabase as any)
          .from("notifications")
          .delete()
          .eq("user_id", ctx.session.user.id)
          .eq("actor_id", input.follower_id)
          .eq("type", "follow_request");

        return { success: true, message: "Follow request already processed" };
      }

      // Delete the follow request
      const { error } = await (ctx.supabase as any)
        .from("follows")
        .delete()
        .eq("follower_id", input.follower_id)
        .eq("following_id", ctx.session.user.id)
        .eq("status", "pending");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Clean up the follow_request notification
      await (ctx.supabase as any)
        .from("notifications")
        .delete()
        .eq("user_id", ctx.session.user.id)
        .eq("actor_id", input.follower_id)
        .eq("type", "follow_request");

      return { success: true };
    }),

  toggleLike: protectedProcedure
    .input(
      z.object({
        entity_id: z.string().uuid(),
        entity_type: z.enum([
          "activity",
          "training_plan",
          "activity_plan",
          "route",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // For activities, check if user has access to view the activity
      if (input.entity_type === "activity") {
        const hasAccess = await checkActivityAccess(
          ctx.supabase,
          input.entity_id,
          userId,
        );

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to like this activity",
          });
        }
      }

      // For training_plan and activity_plan, check access
      if (
        input.entity_type === "training_plan" ||
        input.entity_type === "activity_plan"
      ) {
        const hasAccess = await checkPlanAccess(
          ctx.supabase,
          input.entity_id,
          input.entity_type,
          userId,
        );

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You don't have permission to like this ${input.entity_type}`,
          });
        }
      }

      // Check if already liked
      const { data: existingLike, error: checkError } = await (
        ctx.supabase as any
      )
        .from("likes")
        .select("id")
        .eq("profile_id", ctx.session.user.id)
        .eq("entity_id", input.entity_id)
        .eq("entity_type", input.entity_type)
        .maybeSingle();

      if (checkError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: checkError.message,
        });
      }

      if (existingLike) {
        // Unlike
        const { error: deleteError } = await (ctx.supabase as any)
          .from("likes")
          .delete()
          .eq("id", existingLike.id);

        if (deleteError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: deleteError.message,
          });
        }
        return { liked: false };
      } else {
        // Like
        const { error: insertError } = await (ctx.supabase as any)
          .from("likes")
          .insert({
            profile_id: ctx.session.user.id,
            entity_id: input.entity_id,
            entity_type: input.entity_type,
          });

        if (insertError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: insertError.message,
          });
        }
        return { liked: true };
      }
    }),

  getFollowers: protectedProcedure
    .input(
      z.object({
        user_id: z.string().uuid(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const currentUserId = ctx.session.user.id;

        // Query follows table where following_id = input.user_id AND status = 'accepted'
        // Join with profiles to get follower details
        const { data: follows, error } = await (ctx.supabase as any)
          .from("follows")
          .select(
            `
            follower:profiles!follows_follower_id_fkey(
              id,
              username,
              avatar_url,
              is_public
            )
          `,
          )
          .eq("following_id", input.user_id)
          .eq("status", "accepted")
          .range(input.offset, input.offset + input.limit - 1);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Extract the follower profiles from the joined data
        const followers =
          follows
            ?.map((f: any) => f.follower)
            ?.filter((p: any) => p !== null) ?? [];

        // Get total count for pagination
        const { count } = await (ctx.supabase as any)
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", input.user_id)
          .eq("status", "accepted");

        // If viewing own profile, all followers are already "accepted" (following)
        // If viewing another user's profile, check relationship status for each
        let usersWithRelationship = followers;
        if (currentUserId !== input.user_id) {
          // Get all relationship statuses for these followers in one query
          const followerIds = followers.map((f: any) => f.id);
          if (followerIds.length > 0) {
            const { data: relationships } = await (ctx.supabase as any)
              .from("follows")
              .select("follower_id, status")
              .eq("following_id", currentUserId)
              .in("follower_id", followerIds);

            const statusMap = new Map(
              (relationships || []).map((r: any) => [r.follower_id, r.status]),
            );

            usersWithRelationship = followers.map((f: any) => ({
              ...f,
              follow_status: statusMap.get(f.id) || null,
            }));
          }
        } else {
          // For own profile, mark all as "accepted" since we're following them back
          usersWithRelationship = followers.map((f: any) => ({
            ...f,
            follow_status: "accepted",
          }));
        }

        return {
          users: usersWithRelationship,
          total: count ?? 0,
          hasMore: input.offset + input.limit < (count ?? 0),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch followers",
        });
      }
    }),

  getFollowing: protectedProcedure
    .input(
      z.object({
        user_id: z.string().uuid(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const currentUserId = ctx.session.user.id;

        // Query follows table where follower_id = input.user_id AND status = 'accepted'
        // Join with profiles to get following details
        const { data: follows, error } = await (ctx.supabase as any)
          .from("follows")
          .select(
            `
            following:profiles!follows_following_id_fkey(
              id,
              username,
              avatar_url,
              is_public
            )
          `,
          )
          .eq("follower_id", input.user_id)
          .eq("status", "accepted")
          .range(input.offset, input.offset + input.limit - 1);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Extract the following profiles from the joined data
        const following =
          follows
            ?.map((f: any) => f.following)
            ?.filter((p: any) => p !== null) ?? [];

        // Get total count for pagination
        const { count } = await (ctx.supabase as any)
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", input.user_id)
          .eq("status", "accepted");

        // If viewing own profile, all following are already "accepted"
        // If viewing another user's profile, check relationship status for each
        let usersWithRelationship = following;
        if (currentUserId !== input.user_id) {
          // Get all relationship statuses for these following users in one query
          const followingIds = following.map((f: any) => f.id);
          if (followingIds.length > 0) {
            const { data: relationships } = await (ctx.supabase as any)
              .from("follows")
              .select("following_id, status")
              .eq("follower_id", currentUserId)
              .in("following_id", followingIds);

            const statusMap = new Map(
              (relationships || []).map((r: any) => [r.following_id, r.status]),
            );

            usersWithRelationship = following.map((f: any) => ({
              ...f,
              follow_status: statusMap.get(f.id) || null,
            }));
          }
        } else {
          // For own profile, mark all as "accepted" since we follow them
          usersWithRelationship = following.map((f: any) => ({
            ...f,
            follow_status: "accepted",
          }));
        }

        return {
          users: usersWithRelationship,
          total: count ?? 0,
          hasMore: input.offset + input.limit < (count ?? 0),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch following",
        });
      }
    }),

  // ------------------------------
  // Search users by username
  // ------------------------------
  searchUsers: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { query, limit, offset } = input;
        const userId = ctx.session.user.id;

        // Build base query - exclude current user
        let queryBuilder = (ctx.supabase as any)
          .from("profiles")
          .select("id, username, avatar_url, is_public")
          .neq("id", userId)
          .order("username", { ascending: true })
          .range(offset, offset + limit - 1);

        let countBuilder = (ctx.supabase as any)
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .neq("id", userId);

        // Apply search filter only if query is provided and non-empty
        if (query && query.trim()) {
          const searchPattern = `%${query.trim()}%`;
          queryBuilder = queryBuilder.ilike("username", searchPattern);
          countBuilder = countBuilder.ilike("username", searchPattern);
        }

        const { data: users, error } = await queryBuilder;

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Get total count for pagination
        const { count } = await countBuilder;

        return {
          users: users ?? [],
          total: count ?? 0,
          hasMore: offset + limit < (count ?? 0),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to search users",
        });
      }
    }),

  // ============================================================================
  // COMMENTS
  // ============================================================================

  /**
   * Add a comment to an entity (activity, training_plan, activity_plan, route)
   */
  addComment: protectedProcedure
    .input(
      z.object({
        entity_id: z.string().uuid(),
        entity_type: z.enum([
          "activity",
          "training_plan",
          "activity_plan",
          "route",
        ]),
        content: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // For activities, check if user has access to view the activity
      if (input.entity_type === "activity") {
        const hasAccess = await checkActivityAccess(
          ctx.supabase,
          input.entity_id,
          userId,
        );

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to comment on this activity",
          });
        }
      }

      // For training_plan and activity_plan, check access
      if (
        input.entity_type === "training_plan" ||
        input.entity_type === "activity_plan"
      ) {
        const hasAccess = await checkPlanAccess(
          ctx.supabase,
          input.entity_id,
          input.entity_type,
          userId,
        );

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You don't have permission to comment on this ${input.entity_type}`,
          });
        }
      }

      const { data, error } = await (ctx.supabase as any)
        .from("comments")
        .insert({
          profile_id: userId,
          entity_id: input.entity_id,
          entity_type: input.entity_type,
          content: input.content.trim(),
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),

  /**
   * Delete a comment (only the comment author can delete)
   */
  deleteComment: protectedProcedure
    .input(z.object({ comment_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // First check if the comment exists and belongs to the user
      const { data: existingComment, error: fetchError } = await (
        ctx.supabase as any
      )
        .from("comments")
        .select("profile_id")
        .eq("id", input.comment_id)
        .single();

      if (fetchError || !existingComment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found",
        });
      }

      // Check if the user is the author
      if (existingComment.profile_id !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own comments",
        });
      }

      const { error: deleteError } = await (ctx.supabase as any)
        .from("comments")
        .delete()
        .eq("id", input.comment_id);

      if (deleteError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: deleteError.message,
        });
      }

      return { success: true };
    }),

  /**
   * Get comments for an entity
   */
  getComments: protectedProcedure
    .input(
      z.object({
        entity_id: z.string().uuid(),
        entity_type: z.enum([
          "activity",
          "training_plan",
          "activity_plan",
          "route",
        ]),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // For activities, check if user has access to view the activity
      if (input.entity_type === "activity") {
        const hasAccess = await checkActivityAccess(
          ctx.supabase,
          input.entity_id,
          userId,
        );

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "You don't have permission to view comments on this activity",
          });
        }
      }

      // For training_plan and activity_plan, check access
      if (
        input.entity_type === "training_plan" ||
        input.entity_type === "activity_plan"
      ) {
        const hasAccess = await checkPlanAccess(
          ctx.supabase,
          input.entity_id,
          input.entity_type,
          userId,
        );

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You don't have permission to view comments on this ${input.entity_type}`,
          });
        }
      }

      const { data: comments, error } = await (ctx.supabase as any)
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
        .eq("entity_id", input.entity_id)
        .eq("entity_type", input.entity_type)
        .order("created_at", { ascending: true })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Get total count
      const { count } = await (ctx.supabase as any)
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("entity_id", input.entity_id)
        .eq("entity_type", input.entity_type);

      return {
        comments:
          comments?.map((c: any) => ({
            id: c.id,
            content: c.content,
            created_at: c.created_at,
            profile: c.profile,
          })) || [],
        total: count ?? 0,
        hasMore: input.offset + input.limit < (count ?? 0),
      };
    }),
});
