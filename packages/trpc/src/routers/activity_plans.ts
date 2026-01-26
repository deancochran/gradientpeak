import {
  activityPlanCreateSchema,
  activityPlanStructureSchemaV2,
  activityPlanUpdateSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  addEstimationToPlan,
  addEstimationToPlans,
} from "../utils/estimation-helpers";

// Input schemas for queries
const listActivityPlansSchema = z.object({
  includeOwnOnly: z.boolean().default(true),
  includeSystemTemplates: z.boolean().default(false),
  activityCategory: z
    .enum(["run", "bike", "swim", "strength", "other", "all"])
    .optional(),
  activityLocation: z.enum(["outdoor", "indoor", "all"]).optional(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// Helper to validate V2 structure only
function validateStructure(structure: unknown): void {
  activityPlanStructureSchemaV2.parse(structure);
}

const createActivityPlanInput = activityPlanCreateSchema.extend({
  structure: activityPlanStructureSchemaV2, // V2 structure only
});

const updateActivityPlanInput = activityPlanUpdateSchema.extend({
  structure: activityPlanStructureSchemaV2.optional(), // V2 structure only
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
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }) // Secondary sort for stable pagination
        .limit(limit + 1); // Fetch one extra to check if there's more

      // Filter by ownership
      if (input.includeOwnOnly && !input.includeSystemTemplates) {
        // Only user's plans
        query = query.eq("profile_id", ctx.session.user.id);
      } else if (!input.includeOwnOnly && input.includeSystemTemplates) {
        // Only system templates
        query = query.eq("is_system_template", true);
      } else if (input.includeOwnOnly && input.includeSystemTemplates) {
        // Both user's plans and system templates
        query = query.or(
          `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`,
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

      // Add dynamic TSS estimation to each plan
      const itemsWithEstimation = await addEstimationToPlans(
        items,
        ctx.supabase,
        ctx.session.user.id,
      );

      // Generate next cursor from last item
      let nextCursor: string | undefined;
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        if (!lastItem) throw new Error("Unexpected error");
        nextCursor = `${lastItem.created_at}_${lastItem.id}`;
      }

      return {
        items: itemsWithEstimation,
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
        .select("*")
        .eq("id", input.id)
        .or(`profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`) // Allow user's plans or system templates
        .single();

      if (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity plan not found",
        });
      }

      // Validate V2 structure on read (defensive programming)
      try {
        if (data.structure) {
          validateStructure(data.structure);
        }
      } catch (validationError) {
        console.error(
          "Invalid V2 structure in database for plan",
          input.id,
          validationError,
        );
        // Don't fail the query, but log the issue
      }

      // Add dynamic TSS estimation
      const planWithEstimation = await addEstimationToPlan(
        data,
        ctx.supabase,
        ctx.session.user.id,
      );

      return planWithEstimation;
    }),

  // ------------------------------
  // Get user's custom plans count
  // ------------------------------
  getUserPlansCount: protectedProcedure.query(async ({ ctx }) => {
    const { count, error } = await ctx.supabase
      .from("activity_plans")
      .select("*", { count: "exact", head: true })
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
      // Validate the V2 structure before saving to database
      try {
        validateStructure(input.structure);
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid activity plan structure (V2 required)",
          cause: validationError,
        });
      }

      const { data, error } = await ctx.supabase
        .from("activity_plans")
        .insert({
          ...input,
          description: input.description || "",
          profile_id: ctx.session.user.id,
          version: "1.0", // Default version
        })
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      // Add dynamic TSS estimation to created plan
      const planWithEstimation = await addEstimationToPlan(
        data,
        ctx.supabase,
        ctx.session.user.id,
      );

      return planWithEstimation;
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
        .and(updateActivityPlanInput),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input as { id: string } & z.infer<
        typeof updateActivityPlanInput
      >;

      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("activity_plans")
        .select("*")
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

      // Validate V2 structure if provided
      if (updates.structure) {
        try {
          validateStructure(updates.structure);
        } catch (validationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid activity plan structure (V2 required)",
            cause: validationError,
          });
        }
      }

      // Handle description field - convert null to empty string if present
      const sanitizedUpdates: typeof updates & { description?: string } = {
        ...updates,
        description: updates.description === null ? "" : updates.description,
      };

      const { data, error } = await ctx.supabase
        .from("activity_plans")
        .update(sanitizedUpdates)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      // Add dynamic TSS estimation to updated plan
      const planWithEstimation = await addEstimationToPlan(
        data,
        ctx.supabase,
        ctx.session.user.id,
      );

      return planWithEstimation;
    }),

  // ------------------------------
  // Delete activity plan
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership first
      const { data: existing, error: checkError } = await ctx.supabase
        .from("activity_plans")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (checkError || !existing) {
        console.error("Delete check error:", {
          error: checkError,
          existing,
          inputId: input.id,
          userId: ctx.session.user.id,
        });
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Activity plan not found or you don't have permission to delete it",
        });
      }

      // Delete the plan - foreign key constraint will set planned_activities.activity_plan_id to null
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
        .select("*")
        .eq("id", input.id)
        .or(`profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`) // Allow user's plans or system templates
        .single();

      if (fetchError || !originalPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Original activity plan not found",
        });
      }

      // Validate the V2 structure from the original plan
      try {
        if (originalPlan.structure) {
          validateStructure(originalPlan.structure);
        }
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Original plan has invalid structure (V2 required)",
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
          structure: originalPlan.structure,
          version: originalPlan.version,
          route_id: originalPlan.route_id,
          profile_id: ctx.session.user.id,
        })
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      // Add dynamic TSS estimation to duplicated plan
      const planWithEstimation = await addEstimationToPlan(
        data,
        ctx.supabase,
        ctx.session.user.id,
      );

      return planWithEstimation;
    }),
});
