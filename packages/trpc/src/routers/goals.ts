import { profileGoalCreateSchema } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertProfileAccess } from "./profile-access";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function toSafeDbErrorMessage(
  error: {
    code?: string;
    message?: string;
  } | null,
): string {
  if (!error) {
    return "Unknown database error";
  }

  const code = error.code ? `[${error.code}] ` : "";
  const message = (error.message ?? "Unknown database error")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return `${code}${message}`;
}

const goalsListInputSchema = z.object({
  profile_id: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const profileGoalWriteSchema = profileGoalCreateSchema.pick({
  profile_id: true,
  training_plan_id: true,
  milestone_event_id: true,
  title: true,
  goal_type: true,
  target_metric: true,
  target_value: true,
  importance: true,
  metadata: true,
  target_date: true,
});

const profileGoalUpdateDataSchema = profileGoalWriteSchema
  .omit({ profile_id: true })
  .partial();

export const goalsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(goalsListInputSchema)
    .query(async ({ ctx, input }) => {
      await assertProfileAccess({
        ctx,
        profileId: input.profile_id,
      });

      const { data, error } = await ctx.supabase
        .from("profile_goals")
        .select("*")
        .eq("profile_id", input.profile_id)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list profile goals",
        });
      }

      return data ?? [];
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: goal, error } = await ctx.supabase
        .from("profile_goals")
        .select("*")
        .eq("id", input.id)
        .single();

      if (error || !goal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Goal not found",
        });
      }

      await assertProfileAccess({
        ctx,
        profileId: goal.profile_id,
      });

      return goal;
    }),

  create: protectedProcedure
    .input(profileGoalWriteSchema)
    .mutation(async ({ ctx, input }) => {
      await assertProfileAccess({
        ctx,
        profileId: input.profile_id,
      });

      const { data, error } = await ctx.supabase
        .from("profile_goals")
        .insert(input)
        .select("*")
        .single();

      if (error || !data) {
        console.error("goals.create failed", {
          profileId: input.profile_id,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
          errorDetails: error?.details ?? null,
          errorHint: error?.hint ?? null,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create goal: ${toSafeDbErrorMessage(error)}`,
        });
      }

      return {
        ...data,
        cache_tags: [
          "goals.list",
          "goals.getById",
          "profileSettings.getForProfile",
        ],
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: profileGoalUpdateDataSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: existingGoal, error: existingError } = await ctx.supabase
        .from("profile_goals")
        .select("id, profile_id")
        .eq("id", input.id)
        .single();

      if (existingError || !existingGoal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Goal not found",
        });
      }

      await assertProfileAccess({
        ctx,
        profileId: existingGoal.profile_id,
      });

      const { data, error } = await ctx.supabase
        .from("profile_goals")
        .update(input.data)
        .eq("id", input.id)
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update goal",
        });
      }

      return {
        ...data,
        cache_tags: [
          "goals.list",
          "goals.getById",
          "profileSettings.getForProfile",
        ],
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existingGoal, error: existingError } = await ctx.supabase
        .from("profile_goals")
        .select("id, profile_id")
        .eq("id", input.id)
        .single();

      if (existingError || !existingGoal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Goal not found",
        });
      }

      await assertProfileAccess({
        ctx,
        profileId: existingGoal.profile_id,
      });

      const { error } = await ctx.supabase
        .from("profile_goals")
        .delete()
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete goal",
        });
      }

      return {
        success: true,
        cache_tags: [
          "goals.list",
          "goals.getById",
          "profileSettings.getForProfile",
        ],
      };
    }),
});
