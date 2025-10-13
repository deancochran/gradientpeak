import {
  publicActivitiesInsertSchema,
  publicActivityStreamsInsertSchema,
} from "@repo/supabase";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const activitiesRouter = createTRPCRouter({
  // Simplified: Just create the activity first
  create: protectedProcedure
    .input(
      publicActivitiesInsertSchema.omit({
        id: true,
        idx: true,
        created_at: true,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await ctx.supabase
        .from("activities")
        .insert(input)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),

  // Then create streams for that activity
  createStreams: protectedProcedure
    .input(
      z.object({
        activity_id: z.string().uuid(),
        streams: z.array(
          publicActivityStreamsInsertSchema.omit({
            activity_id: true,
            id: true,
            idx: true,
            created_at: true,
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const streamsWithActivityId = input.streams.map((stream) => ({
        ...stream,
        activity_id: input.activity_id,
      }));

      const { data, error } = await ctx.supabase
        .from("activity_streams")
        .insert(streamsWithActivityId)
        .select();

      if (error) throw new Error(error.message);
      return data;
    }),

  // Combined mutation that handles both in sequence with proper error handling
  createWithStreams: protectedProcedure
    .input(
      z.object({
        activity: publicActivitiesInsertSchema.omit({
          id: true,
          idx: true,
          created_at: true,
        }),
        activity_streams: z.array(
          publicActivityStreamsInsertSchema.omit({
            activity_id: true,
            id: true,
            idx: true,
            created_at: true,
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // First create the activity
      const { data: activity, error: activityError } = await ctx.supabase
        .from("activities")
        .insert(input.activity)
        .select()
        .single();

      if (activityError) {
        throw new Error(`Failed to create activity: ${activityError.message}`);
      }

      // Then create the streams if there are any
      let streams = null;
      if (input.activity_streams.length > 0) {
        const streamsWithActivityId = input.activity_streams.map((stream) => ({
          ...stream,
          activity_id: activity.id,
        }));

        const { data: streamsData, error: streamsError } = await ctx.supabase
          .from("activity_streams")
          .insert(streamsWithActivityId)
          .select();

        if (streamsError) {
          // Clean up the created activity on stream failure
          await ctx.supabase.from("activities").delete().eq("id", activity.id);
          throw new Error(`Failed to create streams: ${streamsError.message}`);
        }
        streams = streamsData;
      }

      return {
        activity,
        streams,
      };
    }),

  getActivityWithStreams: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { data, error } = await ctx.supabase
        .from("activities")
        .select(
          `
            *,
            activity_streams (
              id,
              type,
              data_type,
              original_size,
              compressed_values,
              compressed_timestamps,
              sample_count,
              min_value,
              max_value,
              avg_value,
              created_at
            )
          `,
        )
        .eq("id", input.id)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Activity not found");

      return data;
    }),
});
