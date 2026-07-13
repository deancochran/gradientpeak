/**
 * Profile Metrics Router
 *
 * Handles biometric metrics (weight, sleep, HRV, resting HR, etc.)
 * Used for weight-adjusted TSS calculations and recovery tracking.
 */

import { randomUUID } from "node:crypto";
import {
  getProfileMetricDefinition,
  isProfileMetricValueWithinRange,
  normalizeProfileMetricCreate,
  normalizeProfileMetricUpdate,
  profileMetricCreatePayloadSchema,
  profileMetricTypeSchema,
  updateProfileMetricInputSchema,
} from "@repo/core/athlete-inputs";
import { profileMetrics, publicProfileMetricsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { listProfileMetricHistory } from "../application/profile-metrics/listProfileMetricHistory";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { indexCursorSchema } from "../utils/index-cursor";
import { isClearedProfileOverride } from "../utils/profile-override-observations";

const createProfileMetricInputSchema = profileMetricCreatePayloadSchema
  .extend({ profile_id: z.string().uuid("Invalid profile ID") })
  .superRefine((data, ctx) => {
    if (isProfileMetricValueWithinRange(data.metric_type, data.value)) return;
    const definition = getProfileMetricDefinition(data.metric_type);
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${definition.label} must be between ${definition.min} and ${definition.max} ${definition.unit}`,
      path: ["value"],
    });
  });

const listProfileMetricsInputSchema = z
  .object({
    metric_type: profileMetricTypeSchema.optional(),
    start_date: z.date().optional(),
    end_date: z.date().optional(),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: indexCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const getProfileMetricAtDateInputSchema = z
  .object({
    metric_type: profileMetricTypeSchema,
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
    hasMore: z.boolean(),
    nextCursor: z.string().optional(),
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
    const history = await listProfileMetricHistory(db, ctx.session.user.id, input);

    return profileMetricListOutputSchema.parse({
      items: profileMetricRowArraySchema.parse(history.items),
      total: history.total,
      hasMore: history.hasMore,
      nextCursor: history.nextCursor,
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

      return parseNullableProfileMetricRow(data && !isClearedProfileOverride(data) ? data : null);
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

      const { profile_id: _profileId, ...metricInput } = input;
      const normalizedMetric = normalizeProfileMetricCreate(metricInput);

      const [data] = await db
        .insert(profileMetrics)
        .values({
          id: randomUUID(),
          profile_id: input.profile_id,
          metric_type: normalizedMetric.metric_type,
          value: normalizedMetric.value,
          unit: normalizedMetric.unit,
          reference_activity_id: normalizedMetric.reference_activity_id || null,
          notes: normalizedMetric.notes || null,
          created_at: new Date(),
          updated_at: new Date(),
          recorded_at: new Date(normalizedMetric.recorded_at || new Date().toISOString()),
        })
        .returning();

      if (!data) {
        throw new Error("Failed to create profile metric");
      }

      return parseProfileMetricRow(data);
    }),

  /**
   * Update existing profile metric log.
   */
  update: protectedProcedure
    .input(strictUpdateProfileMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const [existing] = await db
        .select({
          metric_type: profileMetrics.metric_type,
          recorded_at: profileMetrics.recorded_at,
        })
        .from(profileMetrics)
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        )
        .limit(1);

      if (!existing) {
        return null;
      }

      const normalizedPatch = (() => {
        try {
          return normalizeProfileMetricUpdate(existing, input);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Invalid profile metric update",
          });
        }
      })();

      const [data] = await db
        .update(profileMetrics)
        .set({
          value: normalizedPatch.value,
          unit: normalizedPatch.unit,
          notes: normalizedPatch.notes,
          recorded_at: normalizedPatch.recorded_at
            ? new Date(normalizedPatch.recorded_at)
            : undefined,
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
