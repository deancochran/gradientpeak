import { SAMPLE_ACTIVITIES } from "@repo/core"; // <-- imported mapping of template IDs to templates
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Filters for listing planned activities
const plannedActivityListSchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const plannedActivitiesRouter = createTRPCRouter({
  // ------------------------------
  // Get single planned activity
  // ------------------------------
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("planned_activities")
        .select("*")
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
    .input(
      z.object({
        scheduled_date: z.string(),
        activity_plan_name: z.string(),
        activity_plan_activity_type: z.string(),
        activity_plan_description: z.string().optional(),
        activity_plan_estimated_tss: z.number().optional(),
        activity_plan_structure: z.any(),
      }),
    )
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
  // Schedule a template
  // ------------------------------
  scheduleTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        scheduledDate: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const template = SAMPLE_ACTIVITIES[input.templateId];
      if (!template)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });

      const { data, error } = await ctx.supabase
        .from("planned_activities")
        .insert({
          profile_id: ctx.session.user.id,
          scheduled_date: input.scheduledDate,
          activity_plan_name: template.name,
          activity_plan_activity_type: template.activity_type,
          activity_plan_description: template.description,
          activity_plan_estimated_tss: template.estimated_tss,
          activity_plan_structure: template.structure,
        })
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
      let query = ctx.supabase
        .from("planned_activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .order("scheduled_date", { ascending: true })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.date_from) query = query.gte("scheduled_date", input.date_from);
      if (input.date_to) query = query.lte("scheduled_date", input.date_to);

      const { data, error } = await query;
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      // If user has no planned activities, return templates as available plans
      if (!data || data.length === 0)
        return Object.entries(SAMPLE_ACTIVITIES).map(([id, t]) => ({
          id,
          scheduled_date: null,
          profile_id: null,
          activity_plan_name: t.name,
          activity_plan_activity_type: t.activity_type,
          activity_plan_description: t.description,
          activity_plan_estimated_tss: 0,
          activity_plan_structure: t.structure,
        }));

      return data;
    }),
});
