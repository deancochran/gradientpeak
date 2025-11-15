import {
  plannedActivityCreateSchema,
  plannedActivityUpdateSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Validation constraint schema
const validateConstraintsSchema = z.object({
  training_plan_id: z.string().uuid(),
  scheduled_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  activity_plan_id: z.string().uuid(),
});

// Update your schema to support cursor-based pagination
const plannedActivityListSchema = z.object({
  activity_type: z.string().optional(),
  activity_plan_id: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(), // Changed from offset to cursor
});

// Input schemas are now imported from core

export const plannedActivitiesRouter = createTRPCRouter({
  // ------------------------------
  // Get single planned activity with plan details
  // ------------------------------
  getById: protectedProcedure
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
  // Get today's planned activities
  // ------------------------------
  getToday: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date().toISOString().split("T")[0]; // Get YYYY-MM-DD format
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data, error } = await ctx.supabase
      .from("planned_activities")
      .select(
        `
        id,
        scheduled_date,
        activity_plan:activity_plans (
          id,
          name,
          activity_type,
          estimated_duration,
          estimated_tss
        )
      `,
      )
      .eq("profile_id", ctx.session.user.id)
      .gte("scheduled_date", today)
      .lt("scheduled_date", tomorrow)
      .order("scheduled_date", { ascending: true });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data || [];
  }),

  // ------------------------------
  // Get this week's planned activities count
  // ------------------------------
  getWeekCount: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7); // Next Sunday

    const { count, error } = await ctx.supabase
      .from("planned_activities")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", ctx.session.user.id)
      .gte("scheduled_date", startOfWeek.toISOString())
      .lt("scheduled_date", endOfWeek.toISOString());

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return count || 0;
  }),

  // ------------------------------
  // Create planned activity
  // ------------------------------
  create: protectedProcedure
    .input(plannedActivityCreateSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify the activity plan exists and user has access to it
      const { data: activityPlan, error: planError } = await ctx.supabase
        .from("activity_plans")
        .select("id, profile_id")
        .eq("id", input.activity_plan_id)
        .or(`profile_id.eq.${ctx.session.user.id},profile_id.is.null`) // Allow user's plans or sample plans
        .single();

      if (planError || !activityPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activity plan not found or not accessible",
        });
      }

      const { data, error } = await ctx.supabase
        .from("planned_activities")
        .insert({
          ...input,
          profile_id: ctx.session.user.id,
        })
        .select(
          `
          id,
          scheduled_date,
          activity_plan_id,
          created_at
        `,
        )
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
      z
        .object({
          id: z.string().uuid(),
        })
        .merge(plannedActivityUpdateSchema),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("planned_activities")
        .select("id")
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planned activity not found",
        });

      // If updating activity plan, verify it exists and is accessible
      if (updates.activity_plan_id) {
        const { data: activityPlan, error: planError } = await ctx.supabase
          .from("activity_plans")
          .select("id, profile_id")
          .eq("id", updates.activity_plan_id)
          .or(`profile_id.eq.${ctx.session.user.id},profile_id.is.null`)
          .single();

        if (planError || !activityPlan) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Activity plan not found or not accessible",
          });
        }
      }

      const { data, error } = await ctx.supabase
        .from("planned_activities")
        .update({
          ...updates,
        })
        .eq("id", id)
        .select(
          `
          id,
          scheduled_date,
          activity_plan_id,
          created_at
        `,
        )
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

  // ------------------------------
  // Validate constraints before scheduling
  // ------------------------------
  validateConstraints: protectedProcedure
    .input(validateConstraintsSchema)
    .query(async ({ ctx, input }) => {
      // Get the training plan
      const { data: plan, error: planError } = await ctx.supabase
        .from("training_plans")
        .select("id, structure")
        .eq("id", input.training_plan_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      // Get the activity plan to get estimated_tss
      const { data: activityPlan, error: activityPlanError } =
        await ctx.supabase
          .from("activity_plans")
          .select("id, estimated_tss")
          .eq("id", input.activity_plan_id)
          .single();

      if (activityPlanError || !activityPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity plan not found",
        });
      }

      const structure = plan.structure as any;
      const scheduledDate = new Date(input.scheduled_date);

      // Get the week boundaries (Sunday to Saturday)
      const startOfWeek = new Date(scheduledDate);
      startOfWeek.setDate(scheduledDate.getDate() - scheduledDate.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      // Get this week's planned activities
      const { data: plannedThisWeek } = await ctx.supabase
        .from("planned_activities")
        .select(
          `
          id,
          scheduled_date,
          activity_plan:activity_plans (
            estimated_tss
          )
        `,
        )
        .eq("profile_id", ctx.session.user.id)
        .gte("scheduled_date", startOfWeek.toISOString().split("T")[0])
        .lt("scheduled_date", endOfWeek.toISOString().split("T")[0]);

      // Calculate current weekly TSS
      const currentWeeklyTSS = (plannedThisWeek || []).reduce(
        (sum, pa) => sum + (pa.activity_plan?.estimated_tss || 0),
        0,
      );

      // Calculate new weekly TSS
      const newWeeklyTSS = currentWeeklyTSS + (activityPlan.estimated_tss || 0);

      // Check 1: Weekly TSS constraint
      const maxWeeklyTSS = structure.target_weekly_tss_max || Infinity;
      const weeklyTSSStatus =
        newWeeklyTSS <= maxWeeklyTSS
          ? "satisfied"
          : newWeeklyTSS <= maxWeeklyTSS * 1.1
            ? "warning"
            : "violated";

      // Check 2: Activities per week
      const currentActivitiesCount = (plannedThisWeek || []).length;
      const newActivitiesCount = currentActivitiesCount + 1;
      const targetActivitiesPerWeek = structure.target_activities_per_week || 7;
      const activitiesPerWeekStatus =
        newActivitiesCount <= targetActivitiesPerWeek
          ? "satisfied"
          : newActivitiesCount <= targetActivitiesPerWeek + 1
            ? "warning"
            : "violated";

      // Check 3: Consecutive training days
      // Get activities around the scheduled date
      const threeDaysBefore = new Date(scheduledDate);
      threeDaysBefore.setDate(scheduledDate.getDate() - 3);
      const threeDaysAfter = new Date(scheduledDate);
      threeDaysAfter.setDate(scheduledDate.getDate() + 3);

      const { data: nearbyActivities } = await ctx.supabase
        .from("planned_activities")
        .select("scheduled_date")
        .eq("profile_id", ctx.session.user.id)
        .gte("scheduled_date", threeDaysBefore.toISOString().split("T")[0])
        .lte("scheduled_date", threeDaysAfter.toISOString().split("T")[0])
        .order("scheduled_date", { ascending: true });

      // Calculate consecutive days including the new activity
      const allDates = [
        ...(nearbyActivities || []).map((a) => a.scheduled_date),
        input.scheduled_date,
      ].sort();

      let maxConsecutive = 1;
      let currentConsecutive = 1;
      for (let i = 1; i < allDates.length; i++) {
        const prevDateStr = allDates[i - 1];
        const currDateStr = allDates[i];
        if (!prevDateStr || !currDateStr) continue;
        const prevDate = new Date(prevDateStr);
        const currDate = new Date(currDateStr);
        const diffDays = Math.round(
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 1) {
          currentConsecutive++;
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        } else if (diffDays > 1) {
          currentConsecutive = 1;
        }
      }

      const maxConsecutiveDays = structure.max_consecutive_days || 7;
      const consecutiveDaysStatus =
        maxConsecutive <= maxConsecutiveDays
          ? "satisfied"
          : maxConsecutive <= maxConsecutiveDays + 1
            ? "warning"
            : "violated";

      // Check 4: Rest days per week
      const restDaysThisWeek = 7 - newActivitiesCount;
      const minRestDays = structure.min_rest_days_per_week || 0;
      const restDaysStatus =
        restDaysThisWeek >= minRestDays
          ? "satisfied"
          : restDaysThisWeek >= minRestDays - 1
            ? "warning"
            : "violated";

      // Note: Hard activity spacing validation is NOT included because intensity
      // is calculated after activity completion from IF, not pre-assigned.
      // This constraint can be analyzed retrospectively but not enforced prospectively.

      return {
        constraints: {
          weeklyTSS: {
            status: weeklyTSSStatus as "satisfied" | "warning" | "violated",
            current: currentWeeklyTSS,
            withNew: newWeeklyTSS,
            limit: maxWeeklyTSS,
          },
          activitiesPerWeek: {
            status: activitiesPerWeekStatus as
              | "satisfied"
              | "warning"
              | "violated",
            current: currentActivitiesCount,
            withNew: newActivitiesCount,
            limit: targetActivitiesPerWeek,
          },
          consecutiveDays: {
            status: consecutiveDaysStatus as
              | "satisfied"
              | "warning"
              | "violated",
            current: maxConsecutive - 1, // Subtract 1 to show current without new activity
            withNew: maxConsecutive,
            limit: maxConsecutiveDays,
          },
          restDays: {
            status: restDaysStatus as "satisfied" | "warning" | "violated",
            current: 7 - currentActivitiesCount,
            withNew: restDaysThisWeek,
            minimum: minRestDays,
          },
        },
        canSchedule:
          weeklyTSSStatus !== "violated" &&
          activitiesPerWeekStatus !== "violated" &&
          consecutiveDaysStatus !== "violated" &&
          restDaysStatus !== "violated",
        hasWarnings:
          weeklyTSSStatus === "warning" ||
          activitiesPerWeekStatus === "warning" ||
          consecutiveDaysStatus === "warning" ||
          restDaysStatus === "warning",
      };
    }),
});
