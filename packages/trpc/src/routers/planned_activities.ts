import {
  publicActivityTypeSchema,
  publicPlannedActivitiesInsertSchema,
  publicPlannedActivitiesUpdateSchema,
} from "@repo/supabase";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../index";

// API-specific schemas
const plannedActivityListFiltersSchema = z.object({
  activity_type: publicActivityTypeSchema.optional(),
  date_range: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
  profile_plan_id: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const plannedActivitiesRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        // First get the planned activity and check ownership through profile_plan
        const { data: plannedActivity, error } = await ctx.supabase
          .from("planned_activities")
          .select(
            `
            *,
            profile_plans!inner(profile_id)
          `,
          )
          .eq("id", input.id)
          .eq("profile_plans.profile_id", ctx.user.id)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Planned activity not found",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return plannedActivity;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch planned activity",
        });
      }
    }),

  create: protectedProcedure
    .input(publicPlannedActivitiesInsertSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // If profile_plan_id is provided, verify it belongs to the user
        if (input.profile_plan_id) {
          const { data: profilePlan, error: planError } = await ctx.supabase
            .from("profile_plans")
            .select("id")
            .eq("id", input.profile_plan_id)
            .eq("profile_id", ctx.user.id)
            .single();

          if (planError || !profilePlan) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Profile plan not found",
            });
          }
        }

        const { data: plannedActivity, error } = await ctx.supabase
          .from("planned_activities")
          .insert(input)
          .select()
          .single();

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return plannedActivity;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create planned activity",
        });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: publicPlannedActivitiesUpdateSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // First verify ownership
        const { data: existing, error: existingError } = await ctx.supabase
          .from("planned_activities")
          .select(
            `
            id,
            profile_plans!inner(profile_id)
          `,
          )
          .eq("id", input.id)
          .eq("profile_plans.profile_id", ctx.user.id)
          .single();

        if (existingError || !existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Planned activity not found",
          });
        }

        // If updating profile_plan_id, verify the new plan belongs to the user
        if (input.data.profile_plan_id) {
          const { data: profilePlan, error: planError } = await ctx.supabase
            .from("profile_plans")
            .select("id")
            .eq("id", input.data.profile_plan_id)
            .eq("profile_id", ctx.user.id)
            .single();

          if (planError || !profilePlan) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Profile plan not found",
            });
          }
        }

        const { data: plannedActivity, error } = await ctx.supabase
          .from("planned_activities")
          .update(input.data)
          .eq("id", input.id)
          .select()
          .single();

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return plannedActivity;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update planned activity",
        });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // First verify ownership
        const { data: existing, error: existingError } = await ctx.supabase
          .from("planned_activities")
          .select(
            `
            id,
            profile_plans!inner(profile_id)
          `,
          )
          .eq("id", input.id)
          .eq("profile_plans.profile_id", ctx.user.id)
          .single();

        if (existingError || !existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Planned activity not found",
          });
        }

        const { error } = await ctx.supabase
          .from("planned_activities")
          .delete()
          .eq("id", input.id);

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete planned activity",
        });
      }
    }),

  list: protectedProcedure
    .input(plannedActivityListFiltersSchema)
    .query(async ({ ctx, input }) => {
      try {
        let query = ctx.supabase
          .from("planned_activities")
          .select(
            `
            *,
            profile_plans!inner(profile_id)
          `,
          )
          .eq("profile_plans.profile_id", ctx.user.id)
          .order("scheduled_date", { ascending: true })
          .range(input.offset, input.offset + input.limit - 1);

        if (input.activity_type) {
          query = query.eq("activity_type", input.activity_type);
        }

        if (input.profile_plan_id) {
          query = query.eq("profile_plan_id", input.profile_plan_id);
        }

        if (input.date_range) {
          query = query
            .gte("scheduled_date", input.date_range.start)
            .lte("scheduled_date", input.date_range.end);
        }

        const { data: plannedActivities, error } = await query;

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return plannedActivities || [];
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch planned activities",
        });
      }
    }),
});
