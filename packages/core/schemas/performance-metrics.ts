/**
 * Performance Metrics Schemas
 *
 * Extends SupaZod-generated schemas with custom validation for performance metrics.
 * These schemas handle multi-dimensional performance capabilities (power, pace, heart rate)
 * with duration support for temporal metric lookups.
 */

import { z } from 'zod';
import {
  publicPerformanceMetricTypeSchema,
  publicActivityCategorySchema,
  publicProfilePerformanceMetricLogsRowSchema,
  publicProfilePerformanceMetricLogsInsertSchema,
  publicProfilePerformanceMetricLogsUpdateSchema,
} from '@repo/supabase';

// Re-export base enums from SupaZod
export const performanceMetricTypeSchema = publicPerformanceMetricTypeSchema;
export const performanceMetricCategorySchema = publicActivityCategorySchema;

// Re-export base schemas from SupaZod
export const performanceMetricLogSchema = publicProfilePerformanceMetricLogsRowSchema;

/**
 * Input schema for creating a new performance metric log.
 * Extends SupaZod insert schema with additional validation.
 */
export const createPerformanceMetricInputSchema = publicProfilePerformanceMetricLogsInsertSchema
  .omit({
    id: true,
    idx: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    // Profile ID required
    profile_id: z.string().uuid('Invalid profile ID'),

    // Category required
    category: performanceMetricCategorySchema,

    // Type required
    type: performanceMetricTypeSchema,

    // Value must be positive
    value: z.number().positive('Value must be positive'),

    // Unit required
    unit: z.string().min(1, 'Unit is required'),

    // Duration must be positive if provided
    duration_seconds: z.number().int().positive('Duration must be positive integer').nullable().optional(),

    // Optional fields with validation
    reference_activity_id: z.string().uuid('Invalid activity ID').nullable().optional(),
    notes: z.string().max(1000, 'Notes must be less than 1000 characters').nullable().optional(),
    recorded_at: z.string().datetime('Invalid datetime').optional(),
  });

/**
 * Schema for updating an existing performance metric log.
 * All fields optional except ID.
 */
export const updatePerformanceMetricInputSchema = z.object({
  id: z.string().uuid('Invalid metric ID'),
  value: z.number().positive('Value must be positive').optional(),
  unit: z.string().min(1, 'Unit is required').optional(),
  duration_seconds: z.number().int().positive('Duration must be positive integer').nullable().optional(),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').nullable().optional(),
  recorded_at: z.string().datetime('Invalid datetime').optional(),
});

/**
 * Schema for querying performance metrics at a specific date.
 * Used for temporal metric lookups.
 */
export const getPerformanceMetricAtDateInputSchema = z.object({
  profile_id: z.string().uuid('Invalid profile ID'),
  category: performanceMetricCategorySchema,
  type: performanceMetricTypeSchema,
  duration_seconds: z.number().int().positive('Duration must be positive integer').nullable().optional(),
  date: z.date(),
});

/**
 * Schema for querying performance metrics in a date range.
 */
export const getPerformanceMetricsInRangeInputSchema = z.object({
  profile_id: z.string().uuid('Invalid profile ID'),
  category: performanceMetricCategorySchema.optional(),
  type: performanceMetricTypeSchema.optional(),
  start_date: z.date(),
  end_date: z.date(),
}).refine((data) => data.end_date >= data.start_date, {
  message: 'End date must be after or equal to start date',
  path: ['end_date'],
});

/**
 * Helper schema for metric source tracking.
 */
export const metricSourceSchema = z.enum(['manual', 'test', 'estimated', 'imported']);

// Infer TypeScript types from schemas
export type PerformanceMetricType = z.infer<typeof performanceMetricTypeSchema>;
export type PerformanceMetricCategory = z.infer<typeof performanceMetricCategorySchema>;
export type PerformanceMetricLog = z.infer<typeof performanceMetricLogSchema>;
export type CreatePerformanceMetricInput = z.infer<typeof createPerformanceMetricInputSchema>;
export type UpdatePerformanceMetricInput = z.infer<typeof updatePerformanceMetricInputSchema>;
export type GetPerformanceMetricAtDateInput = z.infer<typeof getPerformanceMetricAtDateInputSchema>;
export type GetPerformanceMetricsInRangeInput = z.infer<typeof getPerformanceMetricsInRangeInputSchema>;
export type MetricSource = z.infer<typeof metricSourceSchema>;

/**
 * Standard units for each metric type.
 */
export const METRIC_UNITS: Record<PerformanceMetricType, string> = {
  power: 'watts',
  pace: 'sec/km',
  speed: 'm/s',
  heart_rate: 'bpm',
};

/**
 * Standard durations for performance metrics (in seconds).
 */
export const STANDARD_DURATIONS = {
  FTP: 3600, // 1 hour
  LTHR: 3600, // 1 hour
  VO2MAX_POWER: 300, // 5 minutes
  ANAEROBIC_POWER: 60, // 1 minute
  SPRINT_POWER: 5, // 5 seconds
  THRESHOLD_PACE: 3600, // 1 hour
  FIVE_K_PACE: 1200, // 20 minutes (approximate)
  TEN_K_PACE: 2400, // 40 minutes (approximate)
} as const;
