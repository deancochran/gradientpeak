/**
 * Profile Metrics Router
 *
 * Handles biometric metrics (weight, sleep, HRV, resting HR, etc.)
 * Used for weight-adjusted TSS calculations and recovery tracking.
 */

import { randomUUID } from "node:crypto";
import {
  isProfileMetricValueWithinBusinessRange,
  profileMetricNotesSchema,
  profileMetricRecordedAtSchema,
  updateProfileMetricInputSchema,
} from "@repo/core/schemas/profile-metrics";
import { profileMetrics, publicProfileMetricTypeSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const createProfileMetricInputSchema = z
  .object({
    metric_type: publicProfileMetricTypeSchema,
    notes: profileMetricNotesSchema,
    profile_id: z.string().uuid("Invalid profile ID"),
    recorded_at: profileMetricRecordedAtSchema,
    reference_activity_id: z.string().uuid("Invalid activity ID").nullable().optional(),
    unit: z.string().min(1, "Unit is required"),
    value: z.number(),
  })
  .superRefine((data, ctx) => {
    if (isProfileMetricValueWithinBusinessRange(data.metric_type, data.value)) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Value out of valid range for metric type",
      path: ["value"],
    });
  });

export const profileMetricsRouter = createTRPCRouter({
  /**
   * List all profile metric logs for current user.
   * Supports filtering by metric type and date range.
   */
  list: protectedProcedure
    .input(
      z.object({
        metric_type: publicProfileMetricTypeSchema.optional(),
        start_date: z.date().optional(),
        end_date: z.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const conditions = [eq(profileMetrics.profile_id, ctx.session.user.id)];

      if (input.metric_type) conditions.push(eq(profileMetrics.metric_type, input.metric_type));
      if (input.start_date) conditions.push(gte(profileMetrics.recorded_at, input.start_date));
      if (input.end_date) conditions.push(lte(profileMetrics.recorded_at, input.end_date));

      const data = await db
        .select()
        .from(profileMetrics)
        .where(and(...conditions))
        .orderBy(desc(profileMetrics.recorded_at))
        .limit(input.limit)
        .offset(input.offset);

      return {
        items: data || [],
        total: data.length,
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
        metric_type: publicProfileMetricTypeSchema,
        date: z.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [data] = await db
        .select()
        .from(profileMetrics)
        .where(
          and(
            eq(profileMetrics.profile_id, ctx.session.user.id),
            eq(profileMetrics.metric_type, input.metric_type),
            lte(profileMetrics.recorded_at, input.date),
          ),
        )
        .orderBy(desc(profileMetrics.recorded_at))
        .limit(1);

      return data || null;
    }),

  /**
   * Get specific metric by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [data] = await db
        .select()
        .from(profileMetrics)
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        )
        .limit(1);

      return data ?? null;
    }),

  /**
   * Create new profile metric log.
   */
  create: protectedProcedure
    .input(createProfileMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      if (input.profile_id !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot create metrics for other profiles",
        });
      }

      const [data] = await db
        .insert(profileMetrics)
        .values({
          id: randomUUID(),
          profile_id: input.profile_id,
          metric_type: input.metric_type,
          value: String(input.value),
          unit: input.unit,
          reference_activity_id: input.reference_activity_id || null,
          notes: input.notes || null,
          created_at: new Date(),
          recorded_at: new Date(input.recorded_at || new Date().toISOString()),
        })
        .returning();

      return data;
    }),

  /**
   * Update existing profile metric log.
   */
  update: protectedProcedure
    .input(updateProfileMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [data] = await db
        .update(profileMetrics)
        .set({
          value: input.value !== undefined ? String(input.value) : undefined,
          unit: input.unit,
          notes: input.notes,
          recorded_at: input.recorded_at ? new Date(input.recorded_at) : undefined,
        })
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        )
        .returning();

      return data;
    }),

  /**
   * Hard delete a metric.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      await db
        .delete(profileMetrics)
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        );

      return { success: true };
    }),
});
