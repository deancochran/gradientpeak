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
          planned_activity_id, route_id
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
          metrics->avg_power as avg_power,
          metrics->avg_hr as avg_hr,
          metrics->tss as tss
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

  // Upload trainer control events for an activity
  uploadTrainerEvents: protectedProcedure
    .input(
      z.object({
        activityId: z.string().uuid(),
        events: z.array(
          z.object({
            timestamp: z.number(),
            controlType: z.enum(["power_target", "simulation", "resistance"]),
            targetValue: z.number(),
            actualValue: z.number().optional(),
            success: z.boolean(),
            errorMessage: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log(
        `[tRPC] Uploading ${input.events.length} trainer control events`,
      );

      // Verify activity belongs to user
      const { data: activity } = await ctx.supabase
        .from("activities")
        .select("id, profile_id")
        .eq("id", input.activityId)
        .single();

      if (!activity || activity.profile_id !== ctx.session.user.id) {
        throw new Error("Activity not found or access denied");
      }

      // Batch insert control events
      const { data, error } = await ctx.supabase
        .from("trainer_control_events")
        .insert(
          input.events.map((e) => ({
            activity_id: input.activityId,
            timestamp: new Date(e.timestamp).toISOString(),
            control_type: e.controlType,
            target_value: e.targetValue,
            actual_value: e.actualValue,
            success: e.success,
            error_message: e.errorMessage,
          })),
        );

      if (error) {
        console.error("[tRPC] Failed to upload trainer events:", error);
        throw new Error("Failed to save trainer control events");
      }

      console.log("[tRPC] Successfully uploaded trainer control events");
      return { success: true, count: input.events.length };
    }),

  // Get control adherence analysis for an activity
  getControlAdherence: protectedProcedure
    .input(
      z.object({
        activityId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify activity belongs to user
      const { data: activity } = await ctx.supabase
        .from("activities")
        .select("id, profile_id, trainer_controlled, control_mode")
        .eq("id", input.activityId)
        .single();

      if (!activity || activity.profile_id !== ctx.session.user.id) {
        throw new Error("Activity not found or access denied");
      }

      if (!activity.trainer_controlled) {
        return {
          hasControlData: false,
          adherencePercent: 0,
          events: [],
        };
      }

      // Fetch control events
      const { data: events } = await ctx.supabase
        .from("trainer_control_events")
        .select("*")
        .eq("activity_id", input.activityId)
        .order("timestamp", { ascending: true });

      if (!events || events.length === 0) {
        return {
          hasControlData: false,
          adherencePercent: 0,
          events: [],
        };
      }

      // Calculate adherence statistics
      const successfulEvents = events.filter((e) => e.success);
      const eventsWithActual = events.filter((e) => e.actual_value != null);

      let avgDeviation = 0;
      let adherencePercent = 100;

      if (eventsWithActual.length > 0) {
        const deviations = eventsWithActual.map((e) =>
          Math.abs(e.target_value - (e.actual_value || 0)),
        );
        avgDeviation =
          deviations.reduce((a, b) => a + b, 0) / deviations.length;

        // Calculate adherence percentage
        const avgTarget =
          eventsWithActual.reduce((a, e) => a + e.target_value, 0) /
          eventsWithActual.length;
        adherencePercent = Math.max(0, 100 - (avgDeviation / avgTarget) * 100);
      }

      return {
        hasControlData: true,
        controlMode: activity.control_mode,
        totalEvents: events.length,
        successfulEvents: successfulEvents.length,
        avgDeviation,
        adherencePercent: Math.round(adherencePercent * 100) / 100,
        events: events.map((e) => ({
          timestamp: e.timestamp,
          controlType: e.control_type,
          targetValue: e.target_value,
          actualValue: e.actual_value,
          success: e.success,
        })),
      };
    }),
});
