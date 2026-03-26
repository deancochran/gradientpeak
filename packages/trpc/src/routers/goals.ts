import {
  canonicalGoalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
  profileGoalCreateSchema,
  profileGoalRecordSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertProfileAccess } from "./account/profile-access";

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

const profileGoalSelectFields = [
  "id",
  "profile_id",
  "milestone_event_id",
  "title",
  "priority",
  "activity_category",
  "target_payload",
].join(", ");

const profileGoalWriteSchema = profileGoalCreateSchema;
const profileGoalUpdateDataSchema = z
  .object({
    milestone_event_id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10),
    activity_category: canonicalGoalActivityCategorySchema,
    target_payload: canonicalGoalObjectiveSchema,
  })
  .partial();

export const goalsRouter = createTRPCRouter({
  list: protectedProcedure.input(goalsListInputSchema).query(async ({ ctx, input }) => {
    await assertProfileAccess({
      ctx,
      profileId: input.profile_id,
    });

    const { data, error } = await ctx.supabase
      .from("profile_goals")
      .select(profileGoalSelectFields)
      .eq("profile_id", input.profile_id)
      .order("created_at", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list profile goals",
      });
    }

    const parsedGoals = profileGoalRecordSchema.array().safeParse(data ?? []);

    if (!parsedGoals.success) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Profile goals data is invalid",
      });
    }

    return parsedGoals.data;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: goal, error } = await ctx.supabase
        .from("profile_goals")
        .select(profileGoalSelectFields)
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
        profileId: (goal as unknown as { profile_id: string }).profile_id,
      });

      const parsedGoal = profileGoalRecordSchema.safeParse(goal);

      if (!parsedGoal.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Goal data is invalid",
        });
      }

      return parsedGoal.data;
    }),

  create: protectedProcedure.input(profileGoalWriteSchema).mutation(async ({ ctx, input }) => {
    await assertProfileAccess({
      ctx,
      profileId: input.profile_id,
    });

    const { data, error } = await ctx.supabase
      .from("profile_goals")
      .insert(input as any)
      .select(profileGoalSelectFields)
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

    const parsedGoal = profileGoalRecordSchema.safeParse(data);

    if (!parsedGoal.success) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Goal data is invalid",
      });
    }

    return {
      ...parsedGoal.data,
      cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
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
        .select(profileGoalSelectFields)
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
        profileId: (existingGoal as unknown as { profile_id: string }).profile_id,
      });

      const mergedGoal = profileGoalRecordSchema.safeParse({
        ...(existingGoal as unknown as Record<string, unknown>),
        ...input.data,
      });

      if (!mergedGoal.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Goal update payload is invalid",
          cause: mergedGoal.error.flatten(),
        });
      }

      const { data, error } = await ctx.supabase
        .from("profile_goals")
        .update({
          milestone_event_id: mergedGoal.data.milestone_event_id,
          title: mergedGoal.data.title,
          priority: mergedGoal.data.priority,
          activity_category: mergedGoal.data.activity_category,
          target_payload: mergedGoal.data.target_payload,
        } as any)
        .eq("id", input.id)
        .select(profileGoalSelectFields)
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update goal",
        });
      }

      const parsedGoal = profileGoalRecordSchema.safeParse(data);

      if (!parsedGoal.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Goal data is invalid",
        });
      }

      return {
        ...parsedGoal.data,
        cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
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

      const { error } = await ctx.supabase.from("profile_goals").delete().eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete goal",
        });
      }

      return {
        success: true,
        cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
      };
    }),
});
