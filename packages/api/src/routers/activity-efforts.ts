import { randomUUID } from "node:crypto";
import {
  activityEfforts,
  publicActivityCategorySchema,
  publicActivityEffortsRowSchema,
  publicEffortTypeSchema,
} from "@repo/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { markProfileAnalysisDirty } from "../utils/profile-estimation-state";

const activityEffortRowSchema = publicActivityEffortsRowSchema;

const getForProfileOutputSchema = z.array(activityEffortRowSchema);
const getActivityEffortByIdInputSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const createActivityEffortInputSchema = z
  .object({
    activity_id: z.string().uuid().optional().nullable(),
    activity_category: publicActivityCategorySchema,
    duration_seconds: z.number().int().positive(),
    effort_type: publicEffortTypeSchema,
    value: z.number(),
    unit: z.string().min(1),
    start_offset: z.number().int().nonnegative().optional().nullable(),
    recorded_at: z.string().datetime(),
  })
  .strict();

const updateActivityEffortInputSchema = createActivityEffortInputSchema
  .partial()
  .extend({ id: z.string().uuid() })
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

export const activityEffortsRouter = createTRPCRouter({
  getForProfile: protectedProcedure.output(getForProfileOutputSchema).query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    const rows = await db
      .select()
      .from(activityEfforts)
      .where(eq(activityEfforts.profile_id, ctx.session.user.id))
      .orderBy(desc(activityEfforts.recorded_at));

    return getForProfileOutputSchema.parse(rows);
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
        })
        .returning();

      if (!data) {
        throw new Error("Failed to create activity effort");
      }

      await markProfileAnalysisDirty(db, {
        profileId: ctx.session.user.id,
        kinds: ["performance"],
        dirtySince: data.recorded_at,
      });

      return activityEffortRowSchema.parse(data);
    }),

  update: protectedProcedure
    .input(updateActivityEffortInputSchema)
    .output(activityEffortRowSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);
      const { id, recorded_at, ...values } = input;
      const [existing] = await db
        .select({ recorded_at: activityEfforts.recorded_at })
        .from(activityEfforts)
        .where(and(eq(activityEfforts.id, id), eq(activityEfforts.profile_id, ctx.session.user.id)))
        .limit(1);

      const [data] = await db
        .update(activityEfforts)
        .set({
          ...values,
          recorded_at: recorded_at ? new Date(recorded_at) : undefined,
          updated_at: new Date(),
        })
        .where(and(eq(activityEfforts.id, id), eq(activityEfforts.profile_id, ctx.session.user.id)))
        .returning();

      if (data) {
        await markProfileAnalysisDirty(db, {
          profileId: ctx.session.user.id,
          kinds: ["performance"],
          dirtySince: getEarliestDate(existing?.recorded_at, data.recorded_at),
        });
      }

      return data ? activityEffortRowSchema.parse(data) : null;
    }),

  delete: protectedProcedure
    .input(deleteActivityEffortInputSchema)
    .output(deleteActivityEffortOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);
      const [existing] = await db
        .select({ recorded_at: activityEfforts.recorded_at })
        .from(activityEfforts)
        .where(
          and(
            eq(activityEfforts.id, input.id),
            eq(activityEfforts.profile_id, ctx.session.user.id),
          ),
        )
        .limit(1);

      await db
        .delete(activityEfforts)
        .where(
          and(
            eq(activityEfforts.id, input.id),
            eq(activityEfforts.profile_id, ctx.session.user.id),
          ),
        );

      if (existing) {
        await markProfileAnalysisDirty(db, {
          profileId: ctx.session.user.id,
          kinds: ["performance"],
          dirtySince: existing.recorded_at,
        });
      }

      return deleteActivityEffortOutputSchema.parse({ success: true, deletedId: input.id });
    }),
});

function getEarliestDate(...values: Array<Date | string | null | undefined>) {
  const dates = values
    .filter((value): value is Date | string => value != null)
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()));

  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((value) => value.getTime())));
}
