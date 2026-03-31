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
  computePlanMetrics,
} from "../utils/estimation-helpers";

// Input schemas for queries
const listActivityPlansSchema = z
  .object({
    includeOwnOnly: z.boolean().default(true),
    includeSystemTemplates: z.boolean().default(false),
    ownerScope: z.enum(["own", "system", "public", "all"]).optional(),
    visibility: z.enum(["private", "public"]).optional(),
    activityCategory: z.enum(["run", "bike", "swim", "strength", "other", "all"]).optional(),
    search: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
    cursor: z.string().optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const getManyActivityPlansByIdsSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(200),
  })
  .strict();

// Helper to validate V2 structure only
function validateStructure(structure: unknown): void {
  activityPlanStructureSchemaV2.parse(structure);
}

const createActivityPlanInput = activityPlanCreateSchema.extend({
  structure: activityPlanStructureSchemaV2, // V2 structure only
  template_visibility: z.enum(["private", "public"]).optional(),
  import_provider: z.string().min(1).max(64).optional(),
  import_external_id: z.string().min(1).max(255).optional(),
});

const updateActivityPlanInput = activityPlanUpdateSchema.extend({
  structure: activityPlanStructureSchemaV2.optional(), // V2 structure only
  template_visibility: z.enum(["private", "public"]).optional(),
  import_provider: z.string().min(1).max(64).nullable().optional(),
  import_external_id: z.string().min(1).max(255).nullable().optional(),
});

const updateActivityPlanWithIdInput = updateActivityPlanInput
  .extend({
    id: z.string().uuid(),
  })
  .strict();

const importedTemplateInput = z
  .object({
    external_id: z.string().min(1).max(255),
    name: z.string().min(1, "Plan name is required"),
    activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
    description: z.string().max(1000).optional(),
    notes: z.string().max(2000).optional(),
    structure: activityPlanStructureSchemaV2,
  })
  .strict();

function withIdentityFields<
  T extends {
    id: string;
    profile_id: string | null;
    template_visibility?: string | null;
  },
>(plan: T) {
  return {
    ...plan,
    content_type: "activity_plan" as const,
    content_id: plan.id,
    owner_profile_id: plan.profile_id,
    visibility:
      plan.template_visibility === "public" || plan.template_visibility === "private"
        ? plan.template_visibility
        : "private",
  };
}

export const activityPlansRouter = createTRPCRouter({
  // ------------------------------
  // List activity plans
  // ------------------------------
  list: protectedProcedure.input(listActivityPlansSchema).query(async ({ ctx, input }) => {
    const limit = input.limit;

    let query = ctx.supabase
      .from("activity_plans")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }) // Secondary sort for stable pagination
      .limit(limit + 1); // Fetch one extra to check if there's more

    // Filter by ownership
    const ownerScope =
      input.ownerScope ??
      (input.includeOwnOnly && !input.includeSystemTemplates
        ? "own"
        : !input.includeOwnOnly && input.includeSystemTemplates
          ? "system"
          : input.includeOwnOnly && input.includeSystemTemplates
            ? "all"
            : "none");

    if (ownerScope === "own") {
      query = query.eq("profile_id", ctx.session.user.id);
    } else if (ownerScope === "system") {
      query = query.eq("is_system_template", true);
    } else if (ownerScope === "public") {
      query = query.eq("template_visibility", "public");
    } else if (ownerScope === "all") {
      query = query.or(
        `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true,template_visibility.eq.public`,
      );
    } else {
      // Neither - return empty (shouldn't happen but defensive)
      return { items: [], nextCursor: undefined };
    }

    if (input.visibility) {
      query = query.eq("template_visibility", input.visibility);
    }

    // Apply activity type filter
    if (input.activityCategory && input.activityCategory !== "all") {
      query = query.eq("activity_category", input.activityCategory);
    }

    // Apply search filter (name and description)
    if (input.search) {
      query = query.or(`name.ilike.%${input.search}%,description.ilike.%${input.search}%`);
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

    const planIds = itemsWithEstimation.map((p: any) => p.id) || [];
    let userLikes: string[] = [];

    if (planIds.length > 0) {
      const { data: likesData } = await (ctx.supabase as any)
        .from("likes")
        .select("entity_id")
        .eq("profile_id", ctx.session.user.id)
        .eq("entity_type", "activity_plan")
        .in("entity_id", planIds);

      userLikes = likesData?.map((l: any) => l.entity_id) || [];
    }

    return {
      items: itemsWithEstimation.map((plan: any) => ({
        ...withIdentityFields(plan as any),
        has_liked: userLikes.includes((plan as any).id),
      })),
      nextCursor,
    };
  }),

  // ------------------------------
  // Get single activity plan by ID
  // ------------------------------
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // First, get the plan by ID
      const { data: plan, error } = await ctx.supabase
        .from("activity_plans")
        .select("*")
        .eq("id", input.id)
        .single();

      if (error || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity plan not found",
        });
      }

      // Check if user has access to view this plan
      const isOwner = plan.profile_id === userId;
      const isSystemTemplate = plan.is_system_template === true;
      const isPublic = plan.template_visibility === "public";

      if (!isOwner && !isSystemTemplate && !isPublic) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to view this activity plan",
        });
      }

      // Validate V2 structure on read (defensive programming)
      try {
        if (plan.structure) {
          validateStructure(plan.structure);
        }
      } catch (validationError) {
        console.error("Invalid V2 structure in database for plan", input.id, validationError);
        // Don't fail the query, but log the issue
      }

      // Add dynamic TSS estimation
      const planWithEstimation = await addEstimationToPlan(plan, ctx.supabase, userId);

      const { data: likeData } = await (ctx.supabase as any)
        .from("likes")
        .select("id")
        .eq("profile_id", userId)
        .eq("entity_type", "activity_plan")
        .eq("entity_id", input.id)
        .maybeSingle();

      return {
        ...withIdentityFields(planWithEstimation as any),
        has_liked: !!likeData,
      };
    }),

  getManyByIds: protectedProcedure
    .input(getManyActivityPlansByIdsSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const ids = Array.from(new Set(input.ids));

      const { data: plans, error } = await ctx.supabase
        .from("activity_plans")
        .select("*")
        .in("id", ids)
        .or(`profile_id.eq.${userId},is_system_template.eq.true,template_visibility.eq.public`);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const planById = new Map((plans ?? []).map((plan: any) => [plan.id, plan]));
      const orderedPlans = ids.map((id) => planById.get(id)).filter((plan): plan is any => !!plan);

      const itemsWithEstimation = await addEstimationToPlans(orderedPlans, ctx.supabase, userId);

      const planIds = itemsWithEstimation.map((plan: any) => plan.id);
      let userLikes: string[] = [];

      if (planIds.length > 0) {
        const { data: likesData } = await (ctx.supabase as any)
          .from("likes")
          .select("entity_id")
          .eq("profile_id", userId)
          .eq("entity_type", "activity_plan")
          .in("entity_id", planIds);

        userLikes = likesData?.map((like: any) => like.entity_id) || [];
      }

      return {
        items: itemsWithEstimation.map((plan: any) => ({
          ...withIdentityFields(plan as any),
          has_liked: userLikes.includes((plan as any).id),
        })),
      };
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
  create: protectedProcedure.input(createActivityPlanInput).mutation(async ({ ctx, input }) => {
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

    // Compute metrics before saving
    const metrics = await computePlanMetrics(
      {
        activity_category: input.activity_category,
        structure: input.structure,
        route_id: input.route_id,
      },
      ctx.supabase,
      ctx.session.user.id,
    );

    const { data, error } = await ctx.supabase
      .from("activity_plans")
      .insert({
        ...input,
        ...metrics,
        description: input.description || "",
        profile_id: ctx.session.user.id,
        version: "1.0", // Default version
        template_visibility: input.template_visibility ?? "private",
        import_provider: input.import_provider ?? null,
        import_external_id: input.import_external_id ?? null,
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
    const planWithEstimation = await addEstimationToPlan(data, ctx.supabase, ctx.session.user.id);

    return withIdentityFields(planWithEstimation as any);
  }),

  // ------------------------------
  // Update activity plan
  // ------------------------------
  update: protectedProcedure
    .input(updateActivityPlanWithIdInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

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
          message: "Activity plan not found or you don't have permission to edit it",
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

      // If structure or route or activity category changed, recompute metrics
      let metricsUpdates = {};
      if (updates.structure || updates.route_id !== undefined || updates.activity_category) {
        const metrics = await computePlanMetrics(
          {
            activity_category: updates.activity_category || existing.activity_category,
            structure: updates.structure || existing.structure,
            route_id: updates.route_id !== undefined ? updates.route_id : existing.route_id,
          },
          ctx.supabase,
          ctx.session.user.id,
        );
        metricsUpdates = metrics;
      }

      // Handle description field - convert null to empty string if present
      const sanitizedUpdates: typeof updates & { description?: string } = {
        ...updates,
        ...metricsUpdates,
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
      const planWithEstimation = await addEstimationToPlan(data, ctx.supabase, ctx.session.user.id);

      return withIdentityFields(planWithEstimation as any);
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
          message: "Activity plan not found or you don't have permission to delete it",
        });
      }

      // Delete the plan - foreign key constraint will set events.activity_plan_id to null
      const { error } = await ctx.supabase.from("activity_plans").delete().eq("id", input.id);

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
        newName: z.string().min(1, "Plan name is required").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the original plan
      const { data: originalPlan, error: fetchError } = await ctx.supabase
        .from("activity_plans")
        .select("*")
        .eq("id", input.id)
        .or(
          `profile_id.eq.${ctx.session.user.id},is_system_template.eq.true,template_visibility.eq.public`,
        )
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

      // Compute metrics for the duplicate
      const metrics = await computePlanMetrics(
        {
          activity_category: originalPlan.activity_category,
          structure: originalPlan.structure,
          route_id: originalPlan.route_id,
        },
        ctx.supabase,
        ctx.session.user.id,
      );

      // Create the duplicate
      const { data, error } = await ctx.supabase
        .from("activity_plans")
        .insert({
          name: input.newName?.trim() || `${originalPlan.name} (Copy)`,
          description: originalPlan.description,
          notes: originalPlan.notes,
          activity_category: originalPlan.activity_category,
          structure: originalPlan.structure,
          ...metrics,
          version: originalPlan.version,
          route_id: originalPlan.route_id,
          profile_id: ctx.session.user.id,
          template_visibility: "private",
          import_provider: null,
          import_external_id: null,
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
      const planWithEstimation = await addEstimationToPlan(data, ctx.supabase, ctx.session.user.id);

      return withIdentityFields(planWithEstimation as any);
    }),

  importFromFitTemplate: protectedProcedure
    .input(importedTemplateInput)
    .mutation(async ({ ctx, input }) => {
      const provider = "fit";
      const externalId = input.external_id.trim();

      const { data: existing } = await ctx.supabase
        .from("activity_plans")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("import_provider", provider)
        .eq("import_external_id", externalId)
        .maybeSingle();

      const payload = {
        name: input.name,
        description: input.description ?? "",
        notes: input.notes ?? null,
        activity_category: input.activity_category,
        structure: input.structure,
        version: "1.0",
        profile_id: ctx.session.user.id,
        template_visibility: "private",
        import_provider: provider,
        import_external_id: externalId,
      };

      const persisted = existing
        ? await ctx.supabase
            .from("activity_plans")
            .update(payload)
            .eq("id", existing.id)
            .eq("profile_id", ctx.session.user.id)
            .select("*")
            .single()
        : await ctx.supabase.from("activity_plans").insert(payload).select("*").single();

      if (persisted.error || !persisted.data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: persisted.error?.message ?? "Failed to import FIT template",
        });
      }

      let withEstimation: any = persisted.data;
      try {
        withEstimation = await addEstimationToPlan(
          persisted.data,
          ctx.supabase,
          ctx.session.user.id,
        );
      } catch (estimationError) {
        console.warn("Failed to estimate FIT import template; returning raw plan", estimationError);
      }

      return {
        action: existing ? "updated" : "created",
        item: withIdentityFields(withEstimation as any),
      };
    }),

  importFromZwoTemplate: protectedProcedure
    .input(importedTemplateInput)
    .mutation(async ({ ctx, input }) => {
      const provider = "zwo";
      const externalId = input.external_id.trim();

      const { data: existing } = await ctx.supabase
        .from("activity_plans")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("import_provider", provider)
        .eq("import_external_id", externalId)
        .maybeSingle();

      const payload = {
        name: input.name,
        description: input.description ?? "",
        notes: input.notes ?? null,
        activity_category: input.activity_category,
        structure: input.structure,
        version: "1.0",
        profile_id: ctx.session.user.id,
        template_visibility: "private",
        import_provider: provider,
        import_external_id: externalId,
      };

      const persisted = existing
        ? await ctx.supabase
            .from("activity_plans")
            .update(payload)
            .eq("id", existing.id)
            .eq("profile_id", ctx.session.user.id)
            .select("*")
            .single()
        : await ctx.supabase.from("activity_plans").insert(payload).select("*").single();

      if (persisted.error || !persisted.data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: persisted.error?.message ?? "Failed to import ZWO template",
        });
      }

      let withEstimation: any = persisted.data;
      try {
        withEstimation = await addEstimationToPlan(
          persisted.data,
          ctx.supabase,
          ctx.session.user.id,
        );
      } catch (estimationError) {
        console.warn("Failed to estimate ZWO import template; returning raw plan", estimationError);
      }

      return {
        action: existing ? "updated" : "created",
        item: withIdentityFields(withEstimation as any),
      };
    }),
});
