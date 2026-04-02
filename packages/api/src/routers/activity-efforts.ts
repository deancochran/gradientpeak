import { randomUUID } from "node:crypto";
import { type ActivityEffortInsert, activityEfforts } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

type ActivityEffortCreateValues = ActivityEffortInsert;

export const activityEffortsRouter = createTRPCRouter({
  getForProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    return await db
      .select()
      .from(activityEfforts)
      .where(eq(activityEfforts.profile_id, ctx.session.user.id))
      .orderBy(desc(activityEfforts.recorded_at));
  }),

  create: protectedProcedure
    .input(
      z.object({
        activity_id: z.string().uuid().optional().nullable(),
        activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
        duration_seconds: z.number().int().positive(),
        effort_type: z.enum(["power", "speed"]),
        value: z.number(),
        unit: z.string(),
        start_offset: z.number().int().nonnegative().optional().nullable(),
        recorded_at: z.string(),
      }),
    )
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
        } satisfies ActivityEffortCreateValues)
        .returning();

      return data;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
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

      return { success: true, deletedId: input.id };
    }),
});
