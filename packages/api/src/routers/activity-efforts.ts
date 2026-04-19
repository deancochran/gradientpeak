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
import { bumpProfileEstimationState } from "../utils/profile-estimation-state";

const activityEffortRowSchema = publicActivityEffortsRowSchema;

const getForProfileOutputSchema = z.array(activityEffortRowSchema);

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

      await bumpProfileEstimationState(db, ctx.session.user.id, ["performance"]);

      return activityEffortRowSchema.parse(data);
    }),

  delete: protectedProcedure
    .input(deleteActivityEffortInputSchema)
    .output(deleteActivityEffortOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getRequiredDb(ctx);

      await db
        .delete(activityEfforts)
        .where(
          and(
            eq(activityEfforts.id, input.id),
            eq(activityEfforts.profile_id, ctx.session.user.id),
          ),
        );

      await bumpProfileEstimationState(db, ctx.session.user.id, ["performance"]);

      return deleteActivityEffortOutputSchema.parse({ success: true, deletedId: input.id });
    }),
});
