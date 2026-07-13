import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  type FeedActivity,
  feedActivityDetailDtoSchema,
  feedResponseSchema,
  getFeedActivityForViewer,
  getFeedForViewer,
} from "../application/feed/readFeed";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const feedItemSchema = z.object({
  cursor: z.string().nullish(),
  limit: z.number().min(1).max(50).default(20),
});

export type { FeedActivity };

export const feedRouter = createTRPCRouter({
  getFeed: protectedProcedure
    .input(feedItemSchema)
    .output(feedResponseSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getFeedForViewer({
          db: getRequiredDb(ctx),
          viewerId: ctx.session.user.id,
          input: { cursor: input.cursor, limit: input.limit },
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch feed" });
      }
    }),

  getActivity: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }))
    .output(feedActivityDetailDtoSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getFeedActivityForViewer({
          db: getRequiredDb(ctx),
          viewerId: ctx.session.user.id,
          activityId: input.activityId,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch activity",
        });
      }
    }),
});
