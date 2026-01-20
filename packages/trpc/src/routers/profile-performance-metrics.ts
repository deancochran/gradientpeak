/**
 * Profile Performance Metrics Router
 *
 * Handles temporal performance metrics (FTP, LTHR, threshold pace, etc.)
 * Critical for TSS/IF calculations - provides metric values at activity dates.
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import {
  createPerformanceMetricInputSchema,
  updatePerformanceMetricInputSchema,
  performanceMetricCategorySchema,
  performanceMetricTypeSchema,
} from '@repo/core/schemas/performance-metrics';

export const profilePerformanceMetricsRouter = createTRPCRouter({
  /**
   * List all performance metric logs for current user.
   * Supports filtering by category, type, and pagination.
   */
  list: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema.optional(),
        type: performanceMetricTypeSchema.optional(),
        exclude_inactive: z.boolean().default(true), // Filter out [INACTIVE] metrics
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;
      const profileId = session.user.id;

      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*', { count: 'exact' })
        .eq('profile_id', profileId)
        .order('recorded_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.category) {
        query = query.eq('category', input.category);
      }

      if (input.type) {
        query = query.eq('type', input.type);
      }

      // TODO: Once is_active column exists, use: query.eq('is_active', true)
      // For now, filter in memory
      const { data: allData, error, count } = await query;

      if (error) throw new Error(error.message);

      const data = input.exclude_inactive
        ? allData?.filter(item => !item.notes?.startsWith('[INACTIVE]'))
        : allData;


      return {
        items: data || [],
        total: data?.length || 0,
      };
    }),

  /**
   * Get performance metric at a specific date.
   *
   * CRITICAL FOR TSS CALCULATION - This returns the FTP/LTHR/pace that was
   * valid at the activity date, enabling correct historical TSS calculations.
   *
   * Example: Activity recorded on Jan 15 with FTP of 250W on Jan 1 and 260W on Jan 20
   * → Returns 250W (most recent metric at or before Jan 15)
   */
  getAtDate: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        duration_seconds: z.number().int().positive().optional(),
        date: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;
      const profileId = session.user.id;

      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', profileId)
        .eq('category', input.category)
        .eq('type', input.type)
        .lte('recorded_at', input.date.toISOString())
        .order('recorded_at', { ascending: false })
        .limit(10); // Get more to filter out inactive ones

      if (input.duration_seconds) {
        query = query.eq('duration_seconds', input.duration_seconds);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      // Filter out inactive metrics (marked with [INACTIVE] in notes)
      const activeMetrics = data?.filter(item => !item.notes?.startsWith('[INACTIVE]'));
      return activeMetrics?.[0] || null;
    }),

  /**
   * Get all metrics in a date range.
   * Useful for trend analysis and metric history visualization.
   */
  getForDateRange: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema.optional(),
        type: performanceMetricTypeSchema.optional(),
        start_date: z.date(),
        end_date: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;
      const profileId = session.user.id;

      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', profileId)
        .gte('recorded_at', input.start_date.toISOString())
        .lte('recorded_at', input.end_date.toISOString())
        .order('recorded_at', { ascending: false });

      if (input.category) query = query.eq('category', input.category);
      if (input.type) query = query.eq('type', input.type);

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      // Filter out inactive metrics
      const activeMetrics = data?.filter(item => !item.notes?.startsWith('[INACTIVE]'));
      return activeMetrics || [];
    }),

  /**
   * Get specific metric by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('id', input.id)
        .eq('profile_id', session.user.id)
        .single();

      if (error) throw new Error(error.message);

      return data;
    }),

  /**
   * Create new performance metric log.
   * Can be manually entered or auto-detected from activity test efforts.
   */
  create: protectedProcedure
    .input(createPerformanceMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      // Ensure profileId matches authenticated user
      if (input.profile_id !== session.user.id) {
        throw new Error('Unauthorized: Cannot create metrics for other profiles');
      }

      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .insert({
          profile_id: input.profile_id,
          category: input.category,
          type: input.type,
          value: input.value,
          unit: input.unit,
          duration_seconds: input.duration_seconds || null,
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
   * Update existing performance metric log.
   */
  update: protectedProcedure
    .input(updatePerformanceMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .update({
          value: input.value,
          unit: input.unit,
          notes: input.notes || null,
          recorded_at: input.recorded_at,
        })
        .eq('id', input.id)
        .eq('profile_id', session.user.id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      return data;
    }),

  /**
   * Deactivate a metric (soft delete via notes).
   * Marks metric as inactive in notes field for historical reference.
   * TODO: Add is_active column to database schema for proper soft delete.
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      // For now, mark as inactive via notes
      // TODO: Add is_active column to table
      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .update({ notes: '[INACTIVE] ' + ((await supabase.from('profile_performance_metric_logs').select('notes').eq('id', input.id).single()).data?.notes || '') })
        .eq('id', input.id)
        .eq('profile_id', session.user.id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      return data;
    }),

  /**
   * Hard delete a metric.
   * Use sparingly - prefer deactivate for data integrity.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      const { error } = await supabase
        .from('profile_performance_metric_logs')
        .delete()
        .eq('id', input.id)
        .eq('profile_id', session.user.id);

      if (error) throw new Error(error.message);

      return { success: true };
    }),
});
