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
import {
  profileMetrics,
  publicProfileMetricsRowSchema,
  publicProfileMetricTypeSchema,
} from "@repo/db";
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
  .strict()
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

const listProfileMetricsInputSchema = z
  .object({
    metric_type: publicProfileMetricTypeSchema.optional(),
    start_date: z.date().optional(),
    end_date: z.date().optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .strict();

const getProfileMetricAtDateInputSchema = z
  .object({
    metric_type: publicProfileMetricTypeSchema,
    date: z.date(),
  })
  .strict();

const getProfileMetricByIdInputSchema = z.object({ id: z.string().uuid() }).strict();

const deleteProfileMetricInputSchema = z.object({ id: z.string().uuid() }).strict();

const strictUpdateProfileMetricInputSchema = updateProfileMetricInputSchema.strict();

const profileMetricRowArraySchema = z.array(publicProfileMetricsRowSchema);
const profileMetricListOutputSchema = z
  .object({
    items: profileMetricRowArraySchema,
    total: z.number().int().nonnegative(),
  })
  .strict();
const deleteProfileMetricOutputSchema = z.object({ success: z.literal(true) }).strict();

function parseProfileMetricRow(row: unknown) {
  return publicProfileMetricsRowSchema.parse(row);
}

function parseNullableProfileMetricRow(row: unknown) {
  return row ? parseProfileMetricRow(row) : null;
}

export const profileMetricsRouter = createTRPCRouter({
  /**
   * List all profile metric logs for current user.
   * Supports filtering by metric type and date range.
   */
  list: protectedProcedure.input(listProfileMetricsInputSchema).query(async ({ ctx, input }) => {
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

    return profileMetricListOutputSchema.parse({
      items: profileMetricRowArraySchema.parse(data ?? []),
      total: data.length,
    });
  }),

  /**
   * Get profile metric at a specific date.
   *
   * Returns the most recent metric at or before the specified date.
   * Used for weight-adjusted TSS calculations at activity date.
   */
  getAtDate: protectedProcedure
    .input(getProfileMetricAtDateInputSchema)
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

      return parseNullableProfileMetricRow(data);
    }),

  /**
   * Get specific metric by ID.
   */
  getById: protectedProcedure
    .input(getProfileMetricByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [data] = await db
        .select()
        .from(profileMetrics)
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        )
        .limit(1);

      return parseNullableProfileMetricRow(data);
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
          value: input.value,
          unit: input.unit,
          reference_activity_id: input.reference_activity_id || null,
          notes: input.notes || null,
          created_at: new Date(),
          updated_at: new Date(),
          recorded_at: new Date(input.recorded_at || new Date().toISOString()),
        })
        .returning();

      return parseProfileMetricRow(data);
    }),

  /**
   * Update existing profile metric log.
   */
  update: protectedProcedure
    .input(strictUpdateProfileMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [data] = await db
        .update(profileMetrics)
        .set({
          value: input.value,
          unit: input.unit,
          notes: input.notes,
          recorded_at: input.recorded_at ? new Date(input.recorded_at) : undefined,
          updated_at: new Date(),
        })
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        )
        .returning();

      return data ? parseProfileMetricRow(data) : data;
    }),

  /**
   * Hard delete a metric.
   */
  delete: protectedProcedure
    .input(deleteProfileMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      await db
        .delete(profileMetrics)
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        );

      return deleteProfileMetricOutputSchema.parse({ success: true });
    }),
});
