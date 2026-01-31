/**
 * Profile Metrics Router
 *
 * Handles biometric metrics (weight, sleep, HRV, resting HR, etc.)
 * Used for weight-adjusted TSS calculations and recovery tracking.
 */

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  createProfileMetricInputSchema,
  updateProfileMetricInputSchema,
  profileMetricTypeSchema,
} from "@repo/core/schemas/profile-metrics";

export const profileMetricsRouter = createTRPCRouter({
  /**
   * List all profile metric logs for current user.
   * Supports filtering by metric type and date range.
   */
  list: protectedProcedure
    .input(
      z.object({
        metric_type: profileMetricTypeSchema.optional(),
        start_date: z.date().optional(),
        end_date: z.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      let query = supabase
        .from("profile_metrics")
        .select("*", { count: "exact" })
        .eq("profile_id", session.user.id)
        .order("recorded_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.metric_type) {
        query = query.eq("metric_type", input.metric_type);
      }

      if (input.start_date) {
        query = query.gte("recorded_at", input.start_date.toISOString());
      }

      if (input.end_date) {
        query = query.lte("recorded_at", input.end_date.toISOString());
      }

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      return {
        items: data || [],
        total: count || 0,
      };
    }),

  /**
   * Get profile metric at a specific date.
   *
   * Returns the most recent metric at or before the specified date.
   * Used for weight-adjusted TSS calculations at activity date.
   */
  getAtDate: protectedProcedure
    .input(
      z.object({
        metric_type: profileMetricTypeSchema,
        date: z.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      // Find closest metric at or before date
      const { data, error } = await supabase
        .from("profile_metrics")
        .select("*")
        .eq("profile_id", session.user.id)
        .eq("metric_type", input.metric_type)
        .lte("recorded_at", input.date.toISOString())
        .order("recorded_at", { ascending: false })
        .limit(1);

      if (error) throw new Error(error.message);

      return data?.[0] || null;
    }),

  /**
   * Get specific metric by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      const { data, error } = await supabase
        .from("profile_metrics")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", session.user.id)
        .single();

      if (error) throw new Error(error.message);

      return data;
    }),

  /**
   * Create new profile metric log.
   */
  create: protectedProcedure
    .input(createProfileMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      if (input.profile_id !== session.user.id) {
        throw new Error(
          "Unauthorized: Cannot create metrics for other profiles",
        );
      }

      const { data, error } = await supabase
        .from("profile_metrics")
        .insert({
          profile_id: input.profile_id,
          metric_type: input.metric_type,
          value: input.value,
          unit: input.unit,
          reference_activity_id: input.reference_activity_id || null,
          notes: input.notes || null,
          recorded_at: input.recorded_at || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return data;
    }),

  /**
   * Update existing profile metric log.
   */
  update: protectedProcedure
    .input(updateProfileMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      const { data, error } = await supabase
        .from("profile_metrics")
        .update({
          value: input.value,
          unit: input.unit,
          notes: input.notes,
          recorded_at: input.recorded_at,
        })
        .eq("id", input.id)
        .eq("profile_id", session.user.id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      return data;
    }),

  /**
   * Hard delete a metric.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      const { error } = await supabase
        .from("profile_metrics")
        .delete()
        .eq("id", input.id)
        .eq("profile_id", session.user.id);

      if (error) throw new Error(error.message);

      return { success: true };
    }),
});
