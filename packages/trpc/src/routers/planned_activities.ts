import {
  plannedActivityCreateSchema,
  plannedActivityUpdateSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { WahooSyncService } from "../lib/integrations/wahoo/sync-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  addEstimationToPlan,
  addEstimationToPlans,
} from "../utils/estimation-helpers";

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
  activity_category: z.string().optional(),
  activity_location: z.string().optional(),
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
          notes,
          activity_plan:activity_plans (*)
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

      // Add estimation to the activity plan
      if (data.activity_plan) {
        const planWithEstimation = await addEstimationToPlan(
          data.activity_plan,
          ctx.supabase,
          ctx.session.user.id,
        );
        return {
          ...data,
          activity_plan: planWithEstimation,
        };
      }

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
        activity_plan:activity_plans (*)
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

    // Add estimation to each activity plan
    if (data && data.length > 0) {
      const plansWithEstimation = await addEstimationToPlans(
        data.map((pa) => pa.activity_plan).filter(Boolean),
        ctx.supabase,
        ctx.session.user.id,
      );

      // Map back to planned activities
      const plansMap = new Map(plansWithEstimation.map((p) => [p.id, p]));
      return data.map((pa) => ({
        ...pa,
        activity_plan: pa.activity_plan
          ? plansMap.get(pa.activity_plan.id)
          : null,
      }));
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
        .or(`profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`) // Allow user's plans or system templates
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

      // Automatically sync to Wahoo if integration is connected
      // This runs asynchronously and doesn't block the response
      const syncWahoo = async () => {
        try {
          // Check if Wahoo integration exists
          const { data: integration } = await ctx.supabase
            .from("integrations")
            .select("provider")
            .eq("profile_id", ctx.session.user.id)
            .eq("provider", "wahoo")
            .single();

          if (integration) {
            const syncService = new WahooSyncService(ctx.supabase);
            await syncService.syncPlannedActivity(data.id, ctx.session.user.id);
          }
        } catch (error) {
          // Log error but don't fail the request
          console.error("Failed to auto-sync to Wahoo:", error);
        }
      };

      // Trigger sync without awaiting
      syncWahoo();

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
        .and(plannedActivityUpdateSchema),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input as { id: string } & z.infer<
        typeof plannedActivityUpdateSchema
      >;

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
          .eq("id", updates.activity_plan_id as string)
          .or(`profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`)
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
          activity_plan:activity_plans (*)
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
      if (input.activity_category) {
        query = query.eq(
          "activity_plan.activity_category",
          input.activity_category,
        );
      }
      if (input.activity_location) {
        query = query.eq(
          "activity_plan.activity_location",
          input.activity_location,
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

      // Filter out items without activity plans (shouldn't happen due to FK constraint)
      const validItems = items.filter(
        (
          item,
        ): item is typeof item & {
          activity_plan: NonNullable<typeof item.activity_plan>;
        } => item.activity_plan != null,
      );

      // Add estimation to each activity plan
      let itemsWithEstimation = validItems;
      if (validItems.length > 0) {
        const plansWithEstimation = await addEstimationToPlans(
          validItems.map((pa) => pa.activity_plan),
          ctx.supabase,
          ctx.session.user.id,
        );

        // Map back to planned activities
        const plansMap = new Map(plansWithEstimation.map((p) => [p.id, p]));
        itemsWithEstimation = validItems.map((pa) => ({
          ...pa,
          activity_plan: plansMap.get(pa.activity_plan.id) || pa.activity_plan,
        }));
      }

      // Generate next cursor from last item
      let nextCursor: string | undefined;
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        if (!lastItem) throw new Error("Unexpected error");
        nextCursor = `${lastItem.scheduled_date}_${lastItem.id}`;
      }

      return {
        items: itemsWithEstimation,
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

      // Get the activity plan to calculate TSS
      const { data: activityPlan, error: activityPlanError } =
        await ctx.supabase
          .from("activity_plans")
          .select(
            "id, activity_category, activity_location, structure, route_id",
          )
          .eq("id", input.activity_plan_id)
          .or(`profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`)
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

      // Get this week's planned activities with full plan data for TSS calculation
      const { data: plannedThisWeek } = await ctx.supabase
        .from("planned_activities")
        .select(
          `
          id,
          scheduled_date,
          activity_plan:activity_plans (*)
        `,
        )
        .eq("profile_id", ctx.session.user.id)
        .gte("scheduled_date", startOfWeek.toISOString().split("T")[0])
        .lt("scheduled_date", endOfWeek.toISOString().split("T")[0]);

      // Get user profile for TSS estimation
      const { data: profile } = await ctx.supabase
        .from("profiles")
        .select("ftp, threshold_hr, weight_kg, dob")
        .eq("id", ctx.session.user.id)
        .single();

      // Calculate TSS for current week's activities
      const { estimateActivity, buildEstimationContext } =
        await import("@repo/core");

      const currentWeeklyTSS = (plannedThisWeek || []).reduce((sum, pa) => {
        if (!pa.activity_plan) return sum;

        const context = buildEstimationContext({
          userProfile: profile || {},
          activityPlan: {
            ...pa.activity_plan,
            route_id: pa.activity_plan.route_id || undefined,
          },
        });
        const estimation = estimateActivity(context);
        return sum + estimation.tss;
      }, 0);

      // Calculate TSS for the new activity
      const context = buildEstimationContext({
        userProfile: profile || {},
        activityPlan: {
          ...activityPlan,
          route_id: activityPlan.route_id || undefined,
        },
      });
      const newActivityEstimation = estimateActivity(context);

      // Calculate new weekly TSS
      const newWeeklyTSS = currentWeeklyTSS + newActivityEstimation.tss;

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

  // ------------------------------
  // List planned activities by week
  // ------------------------------
  listByWeek: protectedProcedure
    .input(
      z.object({
        weekStart: z.string(), // ISO date string for start of week
        weekEnd: z.string(), // ISO date string for end of week
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("planned_activities")
        .select(
          `
          id,
          idx,
          profile_id,
          activity_plan_id,
          scheduled_date,
          created_at,
          activity_plan:activity_plans (*)
        `,
        )
        .eq("profile_id", ctx.session.user.id)
        .gte("scheduled_date", input.weekStart)
        .lte("scheduled_date", input.weekEnd)
        .order("scheduled_date", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Add estimation to each activity plan
      if (data && data.length > 0) {
        const plansWithEstimation = await addEstimationToPlans(
          data.map((pa) => pa.activity_plan).filter(Boolean),
          ctx.supabase,
          ctx.session.user.id,
        );

        // Map back to planned activities
        const plansMap = new Map(plansWithEstimation.map((p) => [p.id, p]));
        return data.map((pa) => ({
          ...pa,
          activity_plan: pa.activity_plan
            ? plansMap.get(pa.activity_plan.id)
            : null,
        }));
      }

      return data || [];
    }),
});
