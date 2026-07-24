/**
 * Profile Metrics Router
 *
 * Handles biometric metrics (weight, sleep, HRV, resting HR, etc.)
 * Used for weight-adjusted TSS calculations and recovery tracking.
 */

import { randomUUID } from "node:crypto";
import {
  getProfileMetricDefinition,
  isActivityDerivedThresholdMetricType,
  isProfileMetricValueWithinRange,
  normalizeProfileMetricCreate,
  normalizeProfileMetricUpdate,
  profileMetricCreatePayloadSchema,
  profileMetricTypeSchema,
  updateProfileMetricInputSchema,
} from "@repo/core/athlete-inputs";
import { activities, profileMetrics, publicProfileMetricsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
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

const MANUAL_PROFILE_METRIC_METHOD = "manual_entry";
const MANUAL_PROFILE_METRIC_PROVENANCE = {
  observation_type: "observed",
  trusted: true,
  entered_by: "athlete",
} as const;

function parseProfileMetricRow(row: unknown) {
  return publicProfileMetricsRowSchema.parse(row);
}

function parseNullableProfileMetricRow(row: unknown) {
  return row ? parseProfileMetricRow(row) : null;
}

function assertUserWritableMetric(metricType: z.infer<typeof profileMetricTypeSchema>): void {
  if (!isActivityDerivedThresholdMetricType(metricType)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "Training thresholds are calculated from trusted activity evidence and cannot be edited.",
  });
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
      assertUserWritableMetric(normalizedMetric.metric_type);

      return db.transaction(async (tx) => {
        if (normalizedMetric.reference_activity_id) {
          const [ownedActivity] = await tx
            .select({ id: activities.id })
            .from(activities)
            .where(
              and(
                eq(activities.id, normalizedMetric.reference_activity_id),
                eq(activities.profile_id, ctx.session.user.id),
              ),
            )
            .limit(1)
            .for("update");

          if (!ownedActivity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Referenced activity is unavailable",
            });
          }
        }

        const [data] = await tx
          .insert(profileMetrics)
          .values({
            id: randomUUID(),
            profile_id: input.profile_id,
            metric_type: normalizedMetric.metric_type,
            value: normalizedMetric.value,
            unit: normalizedMetric.unit,
            reference_activity_id: normalizedMetric.reference_activity_id || null,
            notes: normalizedMetric.notes || null,
            source: "manual",
            method: MANUAL_PROFILE_METRIC_METHOD,
            provenance: MANUAL_PROFILE_METRIC_PROVENANCE,
            created_at: new Date(),
            updated_at: new Date(),
            recorded_at: new Date(normalizedMetric.recorded_at || new Date().toISOString()),
          })
          .returning();

        if (!data) {
          throw new Error("Failed to create profile metric");
        }

        return parseProfileMetricRow(data);
      });
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
          value: profileMetrics.value,
          notes: profileMetrics.notes,
          recorded_at: profileMetrics.recorded_at,
          source: profileMetrics.source,
        })
        .from(profileMetrics)
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        )
        .limit(1);

      if (!existing) {
        return null;
      }
      assertUserWritableMetric(existing.metric_type);

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

      const now = new Date();
      if (existing.source !== "manual") {
        const [data] = await db
          .insert(profileMetrics)
          .values({
            id: randomUUID(),
            profile_id: ctx.session.user.id,
            metric_type: existing.metric_type,
            value: normalizedPatch.value ?? existing.value,
            unit: normalizedPatch.unit,
            notes: normalizedPatch.notes === undefined ? existing.notes : normalizedPatch.notes,
            recorded_at: normalizedPatch.recorded_at
              ? new Date(normalizedPatch.recorded_at)
              : existing.recorded_at,
            reference_activity_id: null,
            source: "manual",
            method: MANUAL_PROFILE_METRIC_METHOD,
            provenance: MANUAL_PROFILE_METRIC_PROVENANCE,
            created_at: now,
            updated_at: now,
          })
          .returning();

        if (!data) throw new Error("Failed to create manual profile metric override");
        return parseProfileMetricRow(data);
      }

      const [data] = await db
        .update(profileMetrics)
        .set({
          value: normalizedPatch.value,
          unit: normalizedPatch.unit,
          notes: normalizedPatch.notes,
          source: "manual",
          method: MANUAL_PROFILE_METRIC_METHOD,
          provenance: MANUAL_PROFILE_METRIC_PROVENANCE,
          recorded_at: normalizedPatch.recorded_at
            ? new Date(normalizedPatch.recorded_at)
            : undefined,
          updated_at: now,
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
      const [existing] = await db
        .select({ source: profileMetrics.source, metric_type: profileMetrics.metric_type })
        .from(profileMetrics)
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        )
        .limit(1);

      if (existing && existing.source !== "manual") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only manual profile metric observations can be deleted",
        });
      }

      if (existing) assertUserWritableMetric(existing.metric_type);

      if (!existing) return deleteProfileMetricOutputSchema.parse({ success: true });

      await db
        .delete(profileMetrics)
        .where(
          and(eq(profileMetrics.id, input.id), eq(profileMetrics.profile_id, ctx.session.user.id)),
        );

      return deleteProfileMetricOutputSchema.parse({ success: true });
    }),
});
