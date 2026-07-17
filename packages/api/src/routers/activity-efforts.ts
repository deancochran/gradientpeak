import { randomUUID } from "node:crypto";
import {
  createActivityEffortInputSchema,
  MANUAL_ACTIVITY_EFFORT_METHOD,
  MANUAL_ACTIVITY_EFFORT_PROVENANCE,
  normalizeActivityEffortUpdate,
  updateActivityEffortInputSchema,
} from "@repo/core/athlete-inputs";
import { activityEfforts, activitySegments, publicActivityEffortsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { listOwnedActivityEfforts } from "../application/activity-efforts/listOwnedActivityEfforts";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const activityEffortRowSchema = publicActivityEffortsRowSchema;

const getForProfileOutputSchema = z.array(activityEffortRowSchema);
const getActivityEffortByIdInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const deleteActivityEffortInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const deleteActivityEffortOutputSchema = z
  .object({
    success: z.literal(true),
    deletedId: z.string().uuid(),
  })
  .strict();

const observationFieldNames = [
  "activity_id",
  "segment_id",
  "activity_category",
  "duration_seconds",
  "effort_type",
  "recorded_at",
  "start_offset",
  "value",
] as const;

async function validateActivityEffortSegment(input: {
  db: ReturnType<typeof getRequiredDb>;
  profileId: string;
  effort: {
    activity_id?: string | null;
    segment_id?: string | null;
    activity_category: string;
    duration_seconds: number;
    start_offset?: number | null;
  };
}) {
  if (input.effort.activity_id == null && input.effort.segment_id == null) return;
  if (
    input.effort.activity_id == null ||
    input.effort.segment_id == null ||
    input.effort.start_offset == null
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Activity-backed efforts require activity_id, segment_id, and start_offset",
    });
  }
  const rows = await input.db
    .select({
      category: activitySegments.category,
      role: activitySegments.role,
      start_offset_ms: activitySegments.start_offset_ms,
      end_offset_ms: activitySegments.end_offset_ms,
    })
    .from(activitySegments)
    .where(
      and(
        eq(activitySegments.id, input.effort.segment_id),
        eq(activitySegments.activity_id, input.effort.activity_id),
        eq(activitySegments.profile_id, input.profileId),
      ),
    )
    .limit(2);
  if (rows.length !== 1 || rows[0]?.role !== "activity") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Effort must reference exactly one owned activity segment",
    });
  }
  const segment = rows[0];
  if (segment.category !== input.effort.activity_category) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Effort category must match its activity segment",
    });
  }
  const effortStartMs = input.effort.start_offset * 1_000;
  const effortEndMs = effortStartMs + input.effort.duration_seconds * 1_000;
  if (effortStartMs < segment.start_offset_ms || effortEndMs > segment.end_offset_ms) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Effort range must remain within its referenced activity segment",
    });
  }
}

export const activityEffortsRouter = createTRPCRouter({
  getForProfile: protectedProcedure.output(getForProfileOutputSchema).query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);
    const efforts = await listOwnedActivityEfforts(db, ctx.session.user.id);

    return getForProfileOutputSchema.parse(efforts);
  }),

  getById: protectedProcedure
    .input(getActivityEffortByIdInputSchema)
    .output(activityEffortRowSchema.nullable())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const [row] = await db
        .select()
        .from(activityEfforts)
        .where(
          and(
            eq(activityEfforts.id, input.id),
            eq(activityEfforts.profile_id, ctx.session.user.id),
          ),
        )
        .limit(1);

      return row ? activityEffortRowSchema.parse(row) : null;
    }),

  create: protectedProcedure
    .input(createActivityEffortInputSchema)
    .output(activityEffortRowSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);

      await validateActivityEffortSegment({
        db,
        profileId: ctx.session.user.id,
        effort: input,
      });

      const [data] = await db
        .insert(activityEfforts)
        .values({
          id: randomUUID(),
          ...input,
          created_at: new Date(),
          profile_id: ctx.session.user.id,
          recorded_at: new Date(input.recorded_at),
          source: "manual",
          method: MANUAL_ACTIVITY_EFFORT_METHOD,
          provenance: MANUAL_ACTIVITY_EFFORT_PROVENANCE,
        })
        .returning();

      if (!data) {
        throw new Error("Failed to create activity effort");
      }

      return activityEffortRowSchema.parse(data);
    }),

  update: protectedProcedure
    .input(updateActivityEffortInputSchema)
    .output(activityEffortRowSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);
      const { id, ...patch } = input;
      const [existing] = await db
        .select({
          activity_category: activityEfforts.activity_category,
          activity_id: activityEfforts.activity_id,
          segment_id: activityEfforts.segment_id,
          duration_seconds: activityEfforts.duration_seconds,
          effort_type: activityEfforts.effort_type,
          method: activityEfforts.method,
          provenance: activityEfforts.provenance,
          recorded_at: activityEfforts.recorded_at,
          source: activityEfforts.source,
          start_offset: activityEfforts.start_offset,
          value: activityEfforts.value,
        })
        .from(activityEfforts)
        .where(and(eq(activityEfforts.id, id), eq(activityEfforts.profile_id, ctx.session.user.id)))
        .limit(1);

      if (!existing) return null;

      const normalizedPatch = (() => {
        try {
          return normalizeActivityEffortUpdate(existing, input);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Invalid activity effort update",
          });
        }
      })();
      const effectiveEffort = createActivityEffortInputSchema.parse({
        activity_id: input.activity_id === undefined ? existing.activity_id : input.activity_id,
        segment_id: input.segment_id === undefined ? existing.segment_id : input.segment_id,
        activity_category: input.activity_category ?? existing.activity_category,
        duration_seconds: input.duration_seconds ?? existing.duration_seconds,
        effort_type: input.effort_type ?? existing.effort_type,
        recorded_at:
          input.recorded_at ??
          (existing.recorded_at instanceof Date
            ? existing.recorded_at.toISOString()
            : new Date(existing.recorded_at).toISOString()),
        start_offset: input.start_offset === undefined ? existing.start_offset : input.start_offset,
        value: input.value ?? existing.value,
      });
      await validateActivityEffortSegment({
        db,
        profileId: ctx.session.user.id,
        effort: effectiveEffort,
      });

      const changesObservation = observationFieldNames.some(
        (fieldName) => input[fieldName] !== undefined,
      );
      const resetsTrustedProvenance = changesObservation && existing.source !== "manual";

      if (resetsTrustedProvenance) {
        const manualOverride = createActivityEffortInputSchema.parse({
          activity_id: input.activity_id === undefined ? existing.activity_id : input.activity_id,
          segment_id: input.segment_id === undefined ? existing.segment_id : input.segment_id,
          activity_category: input.activity_category ?? existing.activity_category,
          duration_seconds: input.duration_seconds ?? existing.duration_seconds,
          effort_type: input.effort_type ?? existing.effort_type,
          recorded_at:
            input.recorded_at ??
            (existing.recorded_at instanceof Date
              ? existing.recorded_at.toISOString()
              : new Date(existing.recorded_at).toISOString()),
          start_offset:
            input.start_offset === undefined ? existing.start_offset : input.start_offset,
          value: input.value ?? existing.value,
        });
        const [manualRow] = await db
          .insert(activityEfforts)
          .values({
            id: randomUUID(),
            ...manualOverride,
            created_at: new Date(),
            profile_id: ctx.session.user.id,
            recorded_at: new Date(manualOverride.recorded_at),
            source: "manual",
            method: MANUAL_ACTIVITY_EFFORT_METHOD,
            provenance: MANUAL_ACTIVITY_EFFORT_PROVENANCE,
          })
          .returning();
        return manualRow ? activityEffortRowSchema.parse(manualRow) : null;
      }

      const [data] = await db
        .update(activityEfforts)
        .set({
          ...patch,
          ...normalizedPatch,
          recorded_at: normalizedPatch.recorded_at
            ? new Date(normalizedPatch.recorded_at)
            : undefined,
          updated_at: new Date(),
        })
        .where(and(eq(activityEfforts.id, id), eq(activityEfforts.profile_id, ctx.session.user.id)))
        .returning();

      return data ? activityEffortRowSchema.parse(data) : null;
    }),

  delete: protectedProcedure
    .input(deleteActivityEffortInputSchema)
    .output(deleteActivityEffortOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);
      const [existing] = await db
        .select({ source: activityEfforts.source })
        .from(activityEfforts)
        .where(
          and(
            eq(activityEfforts.id, input.id),
            eq(activityEfforts.profile_id, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (existing && existing.source !== "manual") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Imported and calculated effort evidence cannot be deleted",
        });
      }
      await db
        .delete(activityEfforts)
        .where(
          and(
            eq(activityEfforts.id, input.id),
            eq(activityEfforts.profile_id, ctx.session.user.id),
          ),
        );

      return deleteActivityEffortOutputSchema.parse({
        success: true,
        deletedId: input.id,
      });
    }),
});
