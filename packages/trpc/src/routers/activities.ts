import { ActivityUploadSchema } from "@repo/core";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  calculateAge,
  estimateFTPFromWeight,
  estimateMaxHR,
  estimateLTHR,
} from "@repo/core";

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
        tss: "training_stress_score", // Now individual column
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
      ActivityUploadSchema.extend({
        profile_id: z.string(),
      }).refine(
        (data) => new Date(data.finishedAt) > new Date(data.startedAt),
        {
          message: "finishedAt must be after startedAt",
          path: ["finishedAt"],
        },
      ),
    )
    .mutation(async ({ input, ctx }) => {
      const duration_seconds =
        (new Date(input.finishedAt).getTime() -
          new Date(input.startedAt).getTime()) /
        1000;

      if (duration_seconds <= 0) {
        throw new Error("Activity duration must be positive.");
      }

      const newActivity = {
        profile_id: input.profile_id,
        name: input.name,
        notes: input.notes,
        type: input.type,
        location: input.location,
        started_at: input.startedAt,
        finished_at: input.finishedAt,
        duration_seconds,
        moving_seconds: input.movingSeconds,
        distance_meters: input.distanceMeters,
        activity_plan_id: input.plannedActivityId,
        // Metrics - will be updated later
        training_stress_score: input.metrics.tss,
        intensity_factor: input.metrics.if,
        normalized_power: input.metrics.normalized_power,
        // Note: hr and power zones need to be mapped to individual columns
      };

      const { data, error } = await ctx.supabase
        .from("activities")
        .insert(newActivity)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),

  getById: protectedProcedure
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
            activity_plans (*)
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
        intensity_factor: z.number().optional(),
        training_stress_score: z.number().optional(),
        normalized_power: z.number().optional(),
        name: z.string().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const { data, error } = await ctx.supabase
        .from("activities")
        .update(updates)
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),

  // Hard delete activity - permanently removes the record
  // Activity streams are automatically deleted via cascade
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get FIT file path before deletion
      const { data: activity, error: fetchError } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (fetchError || !activity) {
        throw new Error(
          "Activity not found or you do not have permission to delete it.",
        );
      }

      // If there's an associated FIT file, delete it from storage
      if (activity.fit_file_path) {
        const { error: storageError } = await ctx.supabase.storage
          .from("fit-files")
          .remove([activity.fit_file_path]);

        if (storageError) {
          // Log the error but still attempt to delete the activity record
          console.error(
            `Failed to delete FIT file '${activity.fit_file_path}':`,
            storageError.message,
          );
          // Optionally, you could throw an error here to prevent deletion if the file can't be removed
          // For now, we'll proceed to delete the activity record anyway
        }
      }

      // Hard delete: remove the record (activity_streams cascade deleted automatically)
      const { error } = await ctx.supabase
        .from("activities")
        .delete()
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id);

      if (error) throw new Error(error.message);

      return { success: true, deletedActivityId: input.id };
    }),
});
