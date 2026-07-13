import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addContentComment,
  deleteOwnedComment,
  readContentComments,
  toggleContentLike,
} from "../application/social/contentEngagement";
import {
  acceptFollowRequest,
  followUser,
  rejectFollowRequest,
  unfollowUser,
} from "../application/social/followMutations";
import { searchSocialUsers } from "../application/social/searchUsers";
import { readSocialGraph } from "../application/social/socialGraph";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { indexCursorSchema } from "../utils/index-cursor";

const likeEntityTypeSchema = z.enum(["activity", "training_plan", "activity_plan", "route"]);
const commentEntityTypeSchema = z.enum([
  "activity",
  "training_plan",
  "activity_plan",
  "route",
  "event",
]);
const socialGraphInputSchema = z
  .object({
    user_id: z.string().uuid(),
    limit: z.number().min(1).max(50).default(20),
    cursor: indexCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

export const socialRouter = createTRPCRouter({
  followUser: protectedProcedure
    .input(z.object({ target_user_id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) =>
      followUser({
        db: getRequiredDb(ctx),
        viewerId: ctx.session.user.id,
        targetUserId: input.target_user_id,
      }),
    ),

  unfollowUser: protectedProcedure
    .input(z.object({ target_user_id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) =>
      unfollowUser(getRequiredDb(ctx), ctx.session.user.id, input.target_user_id),
    ),

  acceptFollowRequest: protectedProcedure
    .input(z.object({ follower_id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) =>
      acceptFollowRequest(getRequiredDb(ctx), ctx.session.user.id, input.follower_id),
    ),

  rejectFollowRequest: protectedProcedure
    .input(z.object({ follower_id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) =>
      rejectFollowRequest(getRequiredDb(ctx), ctx.session.user.id, input.follower_id),
    ),

  toggleLike: protectedProcedure
    .input(z.object({ entity_id: z.string().uuid(), entity_type: likeEntityTypeSchema }).strict())
    .mutation(({ ctx, input }) =>
      toggleContentLike({
        db: getRequiredDb(ctx),
        viewerId: ctx.session.user.id,
        entityId: input.entity_id,
        entityType: input.entity_type,
      }),
    ),

  getFollowers: protectedProcedure.input(socialGraphInputSchema).query(async ({ ctx, input }) => {
    try {
      return await readSocialGraph({
        db: getRequiredDb(ctx),
        viewerId: ctx.session.user.id,
        targetUserId: input.user_id,
        direction: "followers",
        limit: input.limit,
        cursor: input.cursor,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch followers" });
    }
  }),

  getFollowing: protectedProcedure.input(socialGraphInputSchema).query(async ({ ctx, input }) => {
    try {
      return await readSocialGraph({
        db: getRequiredDb(ctx),
        viewerId: ctx.session.user.id,
        targetUserId: input.user_id,
        direction: "following",
        limit: input.limit,
        cursor: input.cursor,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch following" });
    }
  }),

  searchUsers: protectedProcedure
    .input(
      z
        .object({
          query: z.string().optional(),
          limit: z.number().min(1).max(50).default(20),
          cursor: indexCursorSchema.optional(),
          offset: z.number().min(0).default(0),
          direction: z.enum(["forward", "backward"]).optional(),
          sort_by: z.enum(["newest", "oldest", "username_asc", "username_desc"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await searchSocialUsers({
          db: getRequiredDb(ctx),
          viewerId: ctx.session.user.id,
          input,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to search users" });
      }
    }),

  addComment: protectedProcedure
    .input(
      z
        .object({
          entity_id: z.string().uuid(),
          entity_type: commentEntityTypeSchema,
          content: z.string().min(1).max(1000),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      addContentComment({ db: getRequiredDb(ctx), viewerId: ctx.session.user.id, input }),
    ),

  deleteComment: protectedProcedure
    .input(z.object({ comment_id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) =>
      deleteOwnedComment(getRequiredDb(ctx), ctx.session.user.id, input.comment_id),
    ),

  getComments: protectedProcedure
    .input(
      z
        .object({
          entity_id: z.string().uuid(),
          entity_type: commentEntityTypeSchema,
          limit: z.number().min(1).max(100).default(20),
          cursor: indexCursorSchema.optional(),
          direction: z.enum(["forward", "backward"]).optional(),
        })
        .strict(),
    )
    .query(({ ctx, input }) =>
      readContentComments({ db: getRequiredDb(ctx), viewerId: ctx.session.user.id, input }),
    ),
});
