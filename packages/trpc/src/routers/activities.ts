import { publicActivitiesInsertSchema } from "@repo/supabase";
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
        .select(
          `
          id, name, type, location,
          started_at, finished_at,
          duration_seconds, moving_seconds, distance_meters,
          training_stress_score, intensity_factor, normalized_power,
          hr_zone_1_seconds, hr_zone_2_seconds, hr_zone_3_seconds, hr_zone_4_seconds, hr_zone_5_seconds,
          power_zone_1_seconds, power_zone_2_seconds, power_zone_3_seconds, power_zone_4_seconds, power_zone_5_seconds, power_zone_6_seconds, power_zone_7_seconds,
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
          started_at, duration_seconds, moving_seconds, distance_meters,
          training_stress_score, activity_plan_id, profile_id
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
        .select()
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
      // Verify ownership before deletion
      const { data: activity, error: fetchError } = await ctx.supabase
        .from("activities")
        .select("id, profile_id, name")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (fetchError || !activity) {
        throw new Error("Activity not found");
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
