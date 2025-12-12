import {
  activityPlanCreateSchema,
  activityPlanStructureSchema,
  activityPlanUpdateSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Input schemas for queries
const listActivityPlansSchema = z.object({
  includeOwnOnly: z.boolean().default(true),
  includeSamples: z.boolean().default(false),
  activityCategory: z
    .enum(["run", "bike", "swim", "strength", "other", "all"])
    .optional(),
  activityLocation: z.enum(["outdoor", "indoor", "all"]).optional(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const createActivityPlanInput = activityPlanCreateSchema.extend({
  structure: activityPlanStructureSchema, // Strongly validate the JSONB structure
  estimated_tss: z.number().nullable().optional(),
});

const updateActivityPlanInput = activityPlanUpdateSchema.extend({
  structure: activityPlanStructureSchema.optional(), // Strongly validate the JSONB structure if provided
  estimated_tss: z.number().nullable().optional(),
});

export const activityPlansRouter = createTRPCRouter({
  // ------------------------------
  // List activity plans
  // ------------------------------
  list: protectedProcedure
    .input(listActivityPlansSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;

      let query = ctx.supabase
        .from("activity_plans")
        .select(
          `
          id,
          idx,
          name,
          description,
          activity_category,
          activity_location,
          estimated_duration,
          estimated_tss,
          structure,
          version,
          created_at,
          profile_id
        `,
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }) // Secondary sort for stable pagination
        .limit(limit + 1); // Fetch one extra to check if there's more

      // Filter by ownership
      if (input.includeOwnOnly && !input.includeSamples) {
        // Only user's plans
        query = query.eq("profile_id", ctx.session.user.id);
      } else if (!input.includeOwnOnly && input.includeSamples) {
        // Only sample plans (assuming samples have null profile_id or special profile)
        query = query.is("profile_id", null);
      } else if (input.includeOwnOnly && input.includeSamples) {
        // Both user's plans and samples
        query = query.or(
          `profile_id.eq.${ctx.session.user.id},profile_id.is.null`,
        );
      } else {
        // Neither - return empty (shouldn't happen but defensive)
        return { items: [], nextCursor: undefined };
      }

      // Apply activity type filter
      if (input.activityCategory && input.activityCategory !== "all") {
        query = query.eq("activity_category", input.activityCategory);
      }
      if (input.activityLocation && input.activityLocation !== "all") {
        query = query.eq("activity_location", input.activityLocation);
      }

      // Apply cursor (if provided, fetch items after this cursor)
      if (input.cursor) {
        const [cursorDate, cursorId] = input.cursor.split("_");
        query = query.or(
          `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.gt.${cursorId})`,
        );
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Check if there are more items
      const hasMore = data.length > limit;
      const items = hasMore ? data.slice(0, limit) : data;

      // Generate next cursor from last item
      let nextCursor: string | undefined;
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        if (!lastItem) throw new Error("Unexpected error");
        nextCursor = `${lastItem.created_at}_${lastItem.id}`;
      }

      return {
        items,
        nextCursor,
      };
    }),

  // ------------------------------
  // Get single activity plan by ID
  // ------------------------------
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("activity_plans")
        .select(
          `
          id,
          idx,
          name,
          description,
          activity_category,
          activity_location,
          estimated_duration,
          estimated_tss,
          structure,
          version,
          created_at,
          profile_id
        `,
        )
        .eq("id", input.id)
        .or(`profile_id.eq.${ctx.session.user.id},profile_id.is.null`) // Allow user's plans or sample plans
        .single();

      if (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity plan not found",
        });
      }

      // Validate structure on read (defensive programming)
      try {
        if (data.structure) {
          activityPlanStructureSchema.parse(data.structure);
        }
      } catch (validationError) {
        console.error(
          "Invalid structure in database for plan",
          input.id,
          validationError,
        );
        // Don't fail the query, but log the issue
      }

      return data;
    }),

  // ------------------------------
  // Get user's custom plans count
  // ------------------------------
  getUserPlansCount: protectedProcedure.query(async ({ ctx }) => {
    const { count, error } = await ctx.supabase
      .from("activity_plans")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", ctx.session.user.id);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return count || 0;
  }),

  // ------------------------------
  // Create new activity plan
  // ------------------------------
  create: protectedProcedure
    .input(createActivityPlanInput)
    .mutation(async ({ ctx, input }) => {
      // Validate the structure before saving to database
      try {
        activityPlanStructureSchema.parse(input.structure);
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid activity plan structure",
          cause: validationError,
        });
      }

      const { data, error } = await ctx.supabase
        .from("activity_plans")
        .insert({
          ...input,
          profile_id: ctx.session.user.id,
          version: "1.0", // Default version
          // Convert estimated_tss to null if undefined
          estimated_tss: input.estimated_tss,
        })
        .select(
          `
          id,
          idx,
          name,
          description,
          activity_category,
          activity_location,
          estimated_duration,
          estimated_tss,
          structure,
          version,
          created_at,
          profile_id
        `,
        )
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return data;
    }),

  // ------------------------------
  // Update activity plan
  // ------------------------------
  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
        })
        .merge(updateActivityPlanInput),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("activity_plans")
        .select("id, profile_id")
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Activity plan not found or you don't have permission to edit it",
        });
      }

      // Validate structure if provided
      if (updates.structure) {
        try {
          activityPlanStructureSchema.parse(updates.structure);
        } catch (validationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid activity plan structure",
            cause: validationError,
          });
        }
      }

      const { data, error } = await ctx.supabase
        .from("activity_plans")
        .update({
          ...updates,
          // Convert estimated_tss to null if undefined
          estimated_tss: updates.estimated_tss ?? undefined,
        })
        .eq("id", id)
        .select(
          `
          id,
          idx,
          name,
          description,
          activity_category,
          activity_location,
          estimated_duration,
          estimated_tss,
          structure,
          version,
          created_at,
          profile_id
        `,
        )
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return data;
    }),

  // ------------------------------
  // Delete activity plan
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership and if there are any planned activities using this plan
      const { data: existing } = await ctx.supabase
        .from("activity_plans")
        .select(
          `
          id,
          profile_id,
          planned_activities!activity_plans_id_fkey(count)
        `,
        )
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Activity plan not found or you don't have permission to delete it",
        });
      }

      // Check if plan is being used by any planned activities
      const { count: plannedActivitiesCount } = await ctx.supabase
        .from("planned_activities")
        .select("id", { count: "exact", head: true })
        .eq("activity_plan_id", input.id);

      if (plannedActivitiesCount && plannedActivitiesCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete activity plan because it is used by ${plannedActivitiesCount} scheduled activity${plannedActivitiesCount > 1 ? "ies" : ""}. Please remove or reschedule those activities first.`,
        });
      }

      const { error } = await ctx.supabase
        .from("activity_plans")
        .delete()
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return { success: true };
    }),

  // ------------------------------
  // Duplicate activity plan
  // ------------------------------
  duplicate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        newName: z.string().min(1, "Plan name is required"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the original plan
      const { data: originalPlan, error: fetchError } = await ctx.supabase
        .from("activity_plans")
        .select(
          `
          name,
          description,
          activity_category,
          activity_location,
          estimated_duration,
          estimated_tss,
          structure,
          version
        `,
        )
        .eq("id", input.id)
        .or(`profile_id.eq.${ctx.session.user.id},profile_id.is.null`) // Allow user's plans or sample plans
        .single();

      if (fetchError || !originalPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Original activity plan not found",
        });
      }

      // Validate the structure from the original plan
      try {
        if (originalPlan.structure) {
          activityPlanStructureSchema.parse(originalPlan.structure);
        }
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Original plan has invalid structure",
          cause: validationError,
        });
      }

      // Create the duplicate
      const { data, error } = await ctx.supabase
        .from("activity_plans")
        .insert({
          name: input.newName,
          description: originalPlan.description,
          activity_category: originalPlan.activity_category,
          activity_location: originalPlan.activity_location,
          estimated_duration: originalPlan.estimated_duration,
          estimated_tss: originalPlan.estimated_tss,
          structure: originalPlan.structure,
          version: originalPlan.version,
          profile_id: ctx.session.user.id,
        })
        .select(
          `
          id,
          idx,
          name,
          description,
          activity_category,
          activity_location,
          estimated_duration,
          estimated_tss,
          structure,
          version,
          created_at,
          profile_id
        `,
        )
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return data;
    }),
});
