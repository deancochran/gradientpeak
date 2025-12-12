import {
  publicActivitiesInsertSchema,
  publicActivityStreamsInsertSchema,
} from "@repo/supabase";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const activitiesRouter = createTRPCRouter({
  // List activities by date range (legacy - for trends/analytics)
  list: protectedProcedure
    .input(
      z.object({
        date_from: z.string(),
        date_to: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.date_from)
        .lte("started_at", input.date_to)
        .order("started_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    }),

  // Paginated list of activities with filters
  listPaginated: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        activity_category: z
          .enum(["run", "bike", "swim", "strength", "other"])
          .optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        sort_by: z
          .enum(["date", "distance", "duration", "tss"])
          .default("date"),
        sort_order: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("activities")
        .select("*", { count: "exact" })
        .eq("profile_id", ctx.session.user.id);

      // Apply filters
      if (input.activity_category) {
        query = query.eq("activity_category", input.activity_category);
      }
      if (input.date_from) {
        query = query.gte("started_at", input.date_from);
      }
      if (input.date_to) {
        query = query.lte("started_at", input.date_to);
      }

      // Apply sorting
      const sortColumn = {
        date: "started_at",
        distance: "distance",
        duration: "elapsed_time",
        tss: "training_stress_score",
      }[input.sort_by];

      query = query.order(sortColumn, {
        ascending: input.sort_order === "asc",
      });

      // Apply pagination
      query = query.range(input.offset, input.offset + input.limit - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      return {
        items: data || [],
        total: count || 0,
        hasMore: (count || 0) > input.offset + input.limit,
      };
    }),

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

  // Update activity (e.g., to set intensity_factor and TSS after calculation)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        intensity_factor: z.number().int().min(0).max(200).optional(),
        training_stress_score: z.number().int().min(0).optional(),
        normalized_power: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const { data, error } = await ctx.supabase
        .from("activities")
        .update(updates)
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),
});
