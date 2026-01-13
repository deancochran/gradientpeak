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
        .select(
          `
          id, name, type, location,
          started_at, finished_at,
          duration_seconds, moving_seconds, distance_meters,
          metrics, hr_zone_seconds, power_zone_seconds,
          activity_plan_id
        `,
        )
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
        .select(
          `
          id, name, type, location,
          started_at, duration_seconds, distance_meters,
          metrics
        `,
          { count: "exact" },
        )
        .eq("profile_id", ctx.session.user.id);

      // Apply filters
      if (input.activity_category) {
        query = query.eq("type", input.activity_category); // Updated column name
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
        distance: "distance_meters", // Updated column name
        duration: "duration_seconds", // Updated column name
        tss: "metrics->tss", // Now in JSONB
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
          z.object({
            type: z.union([
              z.literal("heartrate"),
              z.literal("power"),
              z.literal("speed"),
              z.literal("cadence"),
              z.literal("distance"),
              z.literal("latlng"),
              z.literal("moving"),
              z.literal("altitude"),
              z.literal("elevation"),
              z.literal("temperature"),
              z.literal("gradient"),
              z.literal("heading"),
            ]),
            data_type: z.union([
              z.literal("float"),
              z.literal("latlng"),
              z.literal("boolean"),
            ]),
            compressed_values: z.string(),
            compressed_timestamps: z.string(),
            sample_count: z.number(),
            original_size: z.number(),
            min_value: z.number().nullable().optional(),
            max_value: z.number().nullable().optional(),
            avg_value: z.number().nullable().optional(),
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
        activity: z.object({
          profile_id: z.string(),
          name: z.string(),
          type: z.string(),
          started_at: z.string(),
          finished_at: z.string(),
          duration_seconds: z.number().optional(),
          moving_seconds: z.number().optional(),
          distance_meters: z.number().optional(),
          location: z.string().nullable().optional(),
          metrics: z.any().optional(),
          hr_zone_seconds: z.array(z.number()).nullable().optional(),
          power_zone_seconds: z.array(z.number()).nullable().optional(),
          profile_snapshot: z.any().nullable().optional(),
          activity_plan_id: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          is_private: z.boolean().optional(),
          external_id: z.string().nullable().optional(),
          provider: z
            .union([
              z.literal("strava"),
              z.literal("wahoo"),
              z.literal("trainingpeaks"),
              z.literal("garmin"),
              z.literal("zwift"),
            ])
            .nullable()
            .optional(),
          avg_target_adherence: z.number().nullable().optional(),
        }),
        activity_streams: z.array(
          z.object({
            type: z.union([
              z.literal("heartrate"),
              z.literal("power"),
              z.literal("speed"),
              z.literal("cadence"),
              z.literal("distance"),
              z.literal("latlng"),
              z.literal("moving"),
              z.literal("altitude"),
              z.literal("elevation"),
              z.literal("temperature"),
              z.literal("gradient"),
              z.literal("heading"),
            ]),
            data_type: z.union([
              z.literal("float"),
              z.literal("latlng"),
              z.literal("boolean"),
            ]),
            compressed_values: z.string(),
            compressed_timestamps: z.string(),
            sample_count: z.number(),
            original_size: z.number(),
            min_value: z.number().nullable().optional(),
            max_value: z.number().nullable().optional(),
            avg_value: z.number().nullable().optional(),
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

      return activity;
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
            ),
            activity_plans (
              id,
              name,
              structure
            )
          `,
        )
        .eq("id", input.id)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Activity not found");

      return data;
    }),

  // Update activity (e.g., to set metrics after calculation)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        metrics: z
          .object({
            if: z.number().optional(),
            tss: z.number().optional(),
            normalized_power: z.number().optional(),
          })
          .optional(),
        name: z.string().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, metrics, ...otherUpdates } = input;

      // Build the update object
      const updates: Record<string, unknown> = { ...otherUpdates };

      // If metrics are provided, merge them with existing metrics
      if (metrics && Object.keys(metrics).length > 0) {
        // First get the current activity to merge metrics
        const { data: currentActivity, error: fetchError } = await ctx.supabase
          .from("activities")
          .select("metrics")
          .eq("id", id)
          .eq("profile_id", ctx.session.user.id)
          .single();

        if (fetchError) throw new Error(fetchError.message);

        // Merge new metrics with existing
        const existingMetrics =
          (currentActivity?.metrics as Record<string, unknown>) || {};
        updates.metrics = { ...existingMetrics, ...metrics };
      }

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
