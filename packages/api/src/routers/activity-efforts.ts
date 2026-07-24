import { updateActivityEffortInputSchema } from "@repo/core/athlete-inputs";
import { activityEfforts, publicActivityEffortsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { listOwnedActivityEfforts } from "../application/activity-efforts/listOwnedActivityEfforts";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { isClearedProfileOverride } from "../utils/profile-override-observations";

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

function thresholdEvidenceIsReadOnly(): never {
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "Activity effort evidence is calculated from recorded activity streams and cannot be edited.",
  });
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

      if (!row) return null;
      const parsed = activityEffortRowSchema.parse(row);
      return parsed.source === "manual" && isClearedProfileOverride(parsed) ? null : parsed;
    }),

  update: protectedProcedure
    .input(updateActivityEffortInputSchema)
    .output(activityEffortRowSchema.nullable())
    .mutation(async () => thresholdEvidenceIsReadOnly()),

  delete: protectedProcedure
    .input(deleteActivityEffortInputSchema)
    .output(deleteActivityEffortOutputSchema)
    .mutation(async () => thresholdEvidenceIsReadOnly()),
});
