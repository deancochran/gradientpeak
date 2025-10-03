import { publicPlannedActivitiesInsertSchema } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Update your schema to support cursor-based pagination
const plannedActivityListSchema = z.object({
  activity_type: z.string().optional(),
  activity_plan_id: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(), // Changed from offset to cursor
});

export const plannedActivitiesRouter = createTRPCRouter({
  // ------------------------------
  // Get single planned activity
  // ------------------------------
  // For single GET
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("planned_activities")
        .select(
          `
          id,
          scheduled_date,
          profile_id,
          created_at,
          activity_plan:activity_plans (
            id,
            name,
            activity_type,
            description,
            structure,
            estimated_tss,
            estimated_duration,
            version
          )
        `,
        )
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (error)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planned activity not found",
        });

      return data;
    }),

  // ------------------------------
  // Create planned activity (manual)
  // ------------------------------
  create: protectedProcedure
    .input(publicPlannedActivitiesInsertSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("planned_activities")
        .insert({ ...input, profile_id: ctx.session.user.id })
        .select()
        .single();

      if (error)
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      return data;
    }),

  // ------------------------------
  // Update planned activity
  // ------------------------------
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        scheduled_date: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: existing } = await ctx.supabase
        .from("planned_activities")
        .select("id")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planned activity not found",
        });

      const { data, error } = await ctx.supabase
        .from("planned_activities")
        .update({ scheduled_date: input.scheduled_date })
        .eq("id", input.id)
        .select()
        .single();

      if (error)
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      return data;
    }),

  // ------------------------------
  // Delete planned activity
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing } = await ctx.supabase
        .from("planned_activities")
        .select("id")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planned activity not found",
        });

      const { error } = await ctx.supabase
        .from("planned_activities")
        .delete()
        .eq("id", input.id);

      if (error)
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      return { success: true };
    }),

  // ------------------------------
  // List / search planned activities
  // ------------------------------
  list: protectedProcedure
    .input(plannedActivityListSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;

      let query = ctx.supabase
        .from("planned_activities")
        .select(
          `
          id,
          idx,
          profile_id,
          activity_plan_id,
          scheduled_date,
          created_at,
          activity_plan:activity_plans (
            id,
            idx,
            profile_id,
            name,
            activity_type,
            description,
            structure,
            estimated_tss,
            estimated_duration,
            version,
            created_at
          )
        `,
        )
        .eq("profile_id", ctx.session.user.id)
        .order("scheduled_date", { ascending: true })
        .order("id", { ascending: true }) // Secondary sort for stable pagination
        .limit(limit + 1); // Fetch one extra to check if there's more

      // Apply cursor (if provided, fetch items after this cursor)
      if (input.cursor) {
        const [cursorDate, cursorId] = input.cursor.split("_");
        query = query.or(
          `scheduled_date.gt.${cursorDate},and(scheduled_date.eq.${cursorDate},id.gt.${cursorId})`,
        );
      }

      // Apply date filters
      if (input.date_from) query = query.gte("scheduled_date", input.date_from);
      if (input.date_to) query = query.lte("scheduled_date", input.date_to);
      if (input.activity_type) {
        query = query.eq("activity_plan.activity_type", input.activity_type);
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
        nextCursor = `${lastItem.scheduled_date}_${lastItem.id}`;
      }

      return {
        items,
        nextCursor,
      };
    }),
});
