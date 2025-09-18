import { publicActivityStreamsInsertSchema } from "@repo/supabase";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// API-specific schemas
const activityStreamBatchCreateSchema = z.object({
  activity_id: z.string().uuid(),
  streams: z.array(
    publicActivityStreamsInsertSchema.omit({ activity_id: true }),
  ),
});

export const activityStreamsRouter = createTRPCRouter({
  getForActivity: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        // First verify the activity belongs to the user
        const { data: activity, error: activityError } = await ctx.supabase
          .from("activities")
          .select("id")
          .eq("id", input.activityId)
          .eq("profile_id", ctx.session.user.id)
          .single();

        if (activityError || !activity) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activity not found",
          });
        }

        const { data: streams, error } = await ctx.supabase
          .from("activity_streams")
          .select("*")
          .eq("activity_id", input.activityId)
          .order("type", { ascending: true })
          .order("chunk_index", { ascending: true });

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return streams || [];
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch activity streams",
        });
      }
    }),

  batchCreate: protectedProcedure
    .input(activityStreamBatchCreateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // First verify the activity belongs to the user
        const { data: activity, error: activityError } = await ctx.supabase
          .from("activities")
          .select("id")
          .eq("id", input.activity_id)
          .eq("profile_id", ctx.session.user.id)
          .single();

        if (activityError || !activity) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activity not found",
          });
        }

        const streamsToInsert = input.streams.map((stream) => ({
          ...stream,
          activity_id: input.activity_id,
        }));

        const { data: streams, error } = await ctx.supabase
          .from("activity_streams")
          .insert(streamsToInsert)
          .select();

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return {
          created: streams?.length || 0,
          streams: streams || [],
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create activity streams",
        });
      }
    }),
});
