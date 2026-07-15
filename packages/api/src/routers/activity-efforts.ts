import { randomUUID } from "node:crypto";
import {
  createActivityEffortInputSchema,
  MANUAL_ACTIVITY_EFFORT_METHOD,
  MANUAL_ACTIVITY_EFFORT_PROVENANCE,
  normalizeActivityEffortUpdate,
  updateActivityEffortInputSchema,
} from "@repo/core/athlete-inputs";
import { activityEfforts, publicActivityEffortsRowSchema } from "@repo/db";
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
  "activity_category",
  "duration_seconds",
  "effort_type",
  "recorded_at",
  "start_offset",
  "value",
] as const;

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

      const changesObservation = observationFieldNames.some(
        (fieldName) => input[fieldName] !== undefined,
      );
      const resetsTrustedProvenance = changesObservation && existing.source !== "manual";

      if (resetsTrustedProvenance) {
        const manualOverride = createActivityEffortInputSchema.parse({
          activity_id: input.activity_id === undefined ? existing.activity_id : input.activity_id,
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
