// packages/trpc/src/routers/training_plans.ts
import {
  calculateATL,
  calculateCTL,
  calculateTSB,
  calculateTrainingLoadSeries,
  getFormStatus,
  getTrainingIntensityZone,
  trainingPlanCreateInputSchema,
  trainingPlanCreateSchema,
  trainingPlanSchema,
  trainingPlanUpdateInputSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { addEstimationToPlans } from "../utils/estimation-helpers";

export const trainingPlansRouter = createTRPCRouter({
  // ------------------------------
  // Get a training plan (by ID or active plan)
  // ------------------------------
  get: protectedProcedure
    .input(z.object({ id: z.string() }).optional())
    .query(async ({ ctx, input }) => {
      // If ID provided, get specific plan
      if (input?.id) {
        const { data, error } = await ctx.supabase
          .from("training_plans")
          .select(
            `
          id,
          idx,
          name,
          description,
          structure,
          is_active,
          created_at,
          updated_at,
          profile_id
        `,
          )
          .eq("id", input.id)
          .eq("profile_id", ctx.session.user.id)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Training plan not found",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Validate structure
        try {
          if (data.structure) {
            trainingPlanSchema.parse(data.structure);
          }
        } catch (validationError) {
          console.error(
            "Invalid structure in database for training plan",
            data.id,
            validationError,
          );
        }

        return data;
      }

      // Otherwise, get active plan
      // Query for all active plans (in case there are multiple)
      const { data: activePlans, error } = await ctx.supabase
        .from("training_plans")
        .select(
          `
        id,
        idx,
        name,
        description,
        structure,
        is_active,
        created_at,
        updated_at,
        profile_id
      `,
        )
        .eq("profile_id", ctx.session.user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // If no active plans, return null
      if (!activePlans || activePlans.length === 0) {
        return null;
      }

      // If multiple active plans exist (shouldn't happen, but handle it gracefully)
      if (activePlans.length > 1) {
        console.warn(
          `User ${ctx.session.user.id} has ${activePlans.length} active training plans. Deactivating older ones.`,
        );

        // Keep the most recent, deactivate the rest
        const mostRecentPlan = activePlans[0]!;
        const olderPlanIds = activePlans.slice(1).map((p) => p.id);

        // Deactivate older plans
        await ctx.supabase
          .from("training_plans")
          .update({ is_active: false })
          .in("id", olderPlanIds);

        // Return the most recent active plan
        const data = mostRecentPlan;

        // Validate structure on read (defensive programming)
        try {
          if (data.structure) {
            trainingPlanSchema.parse(data.structure);
          }
        } catch (validationError) {
          console.error(
            "Invalid structure in database for training plan",
            data.id,
            validationError,
          );
          // Don't fail the query, but log the issue
        }

        return data;
      }

      // Single active plan - normal case
      const data = activePlans[0]!;

      // Validate structure on read (defensive programming)
      try {
        if (data.structure) {
          trainingPlanSchema.parse(data.structure);
        }
      } catch (validationError) {
        console.error(
          "Invalid structure in database for training plan",
          data.id,
          validationError,
        );
        // Don't fail the query, but log the issue
      }

      return data;
    }),

  // ------------------------------
  // List all training plans for the user
  // ------------------------------
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("training_plans")
      .select(
        `
        id,
        idx,
        name,
        description,
        structure,
        is_active,
        created_at,
        updated_at,
        profile_id
      `,
      )
      .eq("profile_id", ctx.session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data || [];
  }),

  // ------------------------------
  // Check if user has a training plan
  // ------------------------------
  exists: protectedProcedure.query(async ({ ctx }) => {
    const { count, error } = await ctx.supabase
      .from("training_plans")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", ctx.session.user.id);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return { exists: (count || 0) > 0, count: count || 0 };
  }),

  // ------------------------------
  // Create new training plan
  // Can create multiple plans; if is_active, deactivates others
  // ------------------------------
  create: protectedProcedure
    .input(trainingPlanCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Note: input.structure is already validated by trainingPlanCreateInputSchema
      // which uses trainingPlanCreateSchema (no ID required)

      // Generate a unique UUID for this plan structure
      // Each plan gets its own unique ID, even if created from a template
      const planId = crypto.randomUUID();
      const structureWithId = {
        ...input.structure,
        id: planId,
      };

      // Final validation with ID to ensure complete structure is valid
      try {
        trainingPlanSchema.parse(structureWithId);
      } catch (validationError) {
        console.error("Training plan validation error:", validationError);

        // Extract more meaningful error message from Zod validation
        let errorMessage = "Invalid training plan structure";
        const errorDetails: string[] = [];

        if (validationError && typeof validationError === "object") {
          const zodError = validationError as any;
          if (zodError.errors && Array.isArray(zodError.errors)) {
            // Collect all errors, not just the first one
            for (const err of zodError.errors) {
              const path = err.path ? err.path.join(".") : "unknown";
              const message = err.message || "validation failed";
              errorDetails.push(`${path}: ${message}`);
            }

            if (errorDetails.length > 0) {
              errorMessage = `Training plan validation failed:\n${errorDetails.join("\n")}`;
            }
          } else if (zodError.message) {
            errorMessage = zodError.message;
          }
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errorMessage,
          cause: validationError,
        });
      }

      // If creating as active, deactivate any existing active plans
      if (input.is_active) {
        await ctx.supabase
          .from("training_plans")
          .update({ is_active: false })
          .eq("profile_id", ctx.session.user.id)
          .eq("is_active", true);
      }

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .insert({
          name: input.name,
          description: input.description ?? null,
          structure: structureWithId as any, // Cast to satisfy Supabase Json type
          is_active: input.is_active ?? true,
          profile_id: ctx.session.user.id,
        })
        .select(
          `
          id,
          idx,
          name,
          description,
          structure,
          is_active,
          created_at,
          updated_at,
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
  // Update training plan
  // ------------------------------
  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
        })
        .and(trainingPlanUpdateInputSchema),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input as { id: string } & z.infer<
        typeof trainingPlanUpdateInputSchema
      >;

      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("training_plans")
        .select("id, profile_id")
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to edit it",
        });
      }

      // Validate structure if provided
      if (updates.structure) {
        try {
          trainingPlanSchema.parse(updates.structure);
        } catch (validationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid training plan structure",
            cause: validationError,
          });
        }
      }

      // If setting as active, deactivate other plans
      if (updates.is_active === true) {
        await ctx.supabase
          .from("training_plans")
          .update({ is_active: false })
          .eq("profile_id", ctx.session.user.id)
          .eq("is_active", true)
          .neq("id", id);
      }

      const { data, error } = await ctx.supabase
        .from("training_plans")
        .update({
          name: updates.name as string | undefined,
          description: updates.description as string | null | undefined,
          structure: updates.structure as any,
          is_active: updates.is_active as boolean | undefined,
        })
        .eq("id", id)
        .select(
          `
          id,
          idx,
          name,
          description,
          structure,
          is_active,
          created_at,
          updated_at,
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
  // Activate a training plan (deactivates all others)
  // ------------------------------
  activate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("training_plans")
        .select("id, profile_id, is_active")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to activate it",
        });
      }

      if (existing.is_active) {
        // Already active, no-op
        return { success: true, message: "Plan is already active" };
      }

      // Deactivate all other plans for this user
      await ctx.supabase
        .from("training_plans")
        .update({ is_active: false })
        .eq("profile_id", ctx.session.user.id)
        .eq("is_active", true);

      // Activate this plan
      const { error } = await ctx.supabase
        .from("training_plans")
        .update({ is_active: true })
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return { success: true, message: "Plan activated successfully" };
    }),

  // ------------------------------
  // Delete training plan
  // ------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("training_plans")
        .select("id, profile_id")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to delete it",
        });
      }

      // Check if there are any planned activities associated with this plan
      const { count: plannedActivitiesCount } = await ctx.supabase
        .from("planned_activities")
        .select("id", { count: "exact", head: true })
        .eq("training_plan_id", input.id);

      if (plannedActivitiesCount && plannedActivitiesCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete training plan because it has ${plannedActivitiesCount} scheduled activity${plannedActivitiesCount > 1 ? "ies" : ""}. These will be unlinked from the plan when deleted.`,
        });
      }

      const { error } = await ctx.supabase
        .from("training_plans")
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
  // Get training plan by ID (for verification)
  // ------------------------------
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("training_plans")
        .select(
          `
          id,
          idx,
          name,
          description,
          structure,
          is_active,
          created_at,
          updated_at,
          profile_id
        `,
        )
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      // Validate structure on read
      try {
        if (data.structure) {
          trainingPlanSchema.parse(data.structure);
        }
      } catch (validationError) {
        console.error(
          "Invalid structure in database for training plan",
          input.id,
          validationError,
        );
      }

      return data;
    }),

  // ------------------------------
  // Get current training status (CTL/ATL/TSB)
  // ------------------------------
  getCurrentStatus: protectedProcedure.query(async ({ ctx }) => {
    // First check if user has a training plan
    const { data: plan } = await ctx.supabase
      .from("training_plans")
      .select("id, structure")
      .eq("profile_id", ctx.session.user.id)
      .single();

    if (!plan) {
      return null;
    }

    // Get activities from the last 42 days (CTL time constant)
    const today = new Date();
    const fortyTwoDaysAgo = new Date(today);
    fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);

    const { data: activities, error: activitiesError } = await ctx.supabase
      .from("activities")
      .select("started_at, metrics")
      .eq("profile_id", ctx.session.user.id)
      .gte("started_at", fortyTwoDaysAgo.toISOString())
      .order("started_at", { ascending: true });

    if (activitiesError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: activitiesError.message,
      });
    }

    // Calculate CTL, ATL, TSB
    let ctl = 0;
    let atl = 0;

    if (activities && activities.length > 0) {
      for (const activity of activities) {
        // TSS is now stored in metrics JSONB column
        const metrics = activity.metrics as any;
        const tss = metrics?.tss || 0;
        ctl = calculateCTL(ctl, tss);
        atl = calculateATL(atl, tss);
      }
    }

    const tsb = calculateTSB(ctl, atl);
    const form = getFormStatus(tsb);

    // Get this week's progress
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    // Get completed activities this week
    const { data: weekActivities } = await ctx.supabase
      .from("activities")
      .select("metrics")
      .eq("profile_id", ctx.session.user.id)
      .gte("started_at", startOfWeek.toISOString())
      .lt("started_at", endOfWeek.toISOString());

    const completedWeeklyTSS =
      weekActivities?.reduce(
        (sum, act) => sum + ((act.metrics as any)?.tss || 0),
        0,
      ) || 0;

    // Get planned activities this week with their activity plans
    const { data: plannedActivities } = await ctx.supabase
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

    // Extract activity plans and add estimations
    const activityPlans =
      plannedActivities?.map((pa) => pa.activity_plan).filter(Boolean) || [];

    const plansWithEstimations =
      activityPlans.length > 0
        ? await addEstimationToPlans(
            activityPlans,
            ctx.supabase,
            ctx.session.user.id,
          )
        : [];

    const plannedWeeklyTSS = plansWithEstimations.reduce(
      (sum, plan) => sum + plan.estimated_tss,
      0,
    );

    const totalPlannedActivities = plannedActivities?.length || 0;

    // Count completed activities this week
    const { count: completedActivitiesCount } = await ctx.supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", ctx.session.user.id)
      .gte("started_at", startOfWeek.toISOString())
      .lt("started_at", endOfWeek.toISOString());

    // Get upcoming activities (next 5 days)
    const fiveDaysFromNow = new Date(today);
    fiveDaysFromNow.setDate(today.getDate() + 5);

    const { data: upcomingActivitiesRaw } = await ctx.supabase
      .from("planned_activities")
      .select(
        `
        id,
        scheduled_date,
        activity_plan:activity_plans (*)
      `,
      )
      .eq("profile_id", ctx.session.user.id)
      .gte("scheduled_date", today.toISOString().split("T")[0])
      .lte("scheduled_date", fiveDaysFromNow.toISOString().split("T")[0])
      .order("scheduled_date", { ascending: true })
      .limit(5);

    // Add estimations to upcoming activity plans
    const upcomingPlans =
      upcomingActivitiesRaw?.map((pa) => pa.activity_plan).filter(Boolean) ||
      [];

    const upcomingPlansWithEstimations =
      upcomingPlans.length > 0
        ? await addEstimationToPlans(
            upcomingPlans,
            ctx.supabase,
            ctx.session.user.id,
          )
        : [];

    // Map back to planned activities structure with estimated values
    const upcomingActivities =
      upcomingActivitiesRaw?.map((pa, index) => ({
        id: pa.id,
        scheduled_date: pa.scheduled_date,
        activity_plan: upcomingPlansWithEstimations[index]
          ? {
              id: upcomingPlansWithEstimations[index].id,
              name: upcomingPlansWithEstimations[index].name,
              activity_category:
                upcomingPlansWithEstimations[index].activity_category,
              activity_location:
                upcomingPlansWithEstimations[index].activity_location,
              estimated_duration:
                upcomingPlansWithEstimations[index].estimated_duration,
              estimated_tss: upcomingPlansWithEstimations[index].estimated_tss,
            }
          : null,
      })) || [];

    // Get target TSS from current block in training plan structure
    const structure = plan.structure as any;
    let targetTSS = plannedWeeklyTSS;

    // For periodized plans, find the current block
    if (structure?.plan_type === "periodized" && structure?.blocks) {
      const todayStr = today.toISOString().split("T")[0] || "";
      const currentBlock = structure.blocks.find((block: any) => {
        return (
          todayStr && block.start_date <= todayStr && block.end_date >= todayStr
        );
      });

      if (currentBlock?.target_weekly_tss_range) {
        // Use the max of the range as the target
        targetTSS = currentBlock.target_weekly_tss_range.max;
      }
    } else if (
      structure?.plan_type === "maintenance" &&
      structure?.target_weekly_tss_range
    ) {
      // For maintenance plans, use the target range
      targetTSS = structure.target_weekly_tss_range.max;
    }

    return {
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      form,
      weekProgress: {
        completedTSS: Math.round(completedWeeklyTSS * 10) / 10,
        plannedTSS: Math.round(plannedWeeklyTSS * 10) / 10,
        targetTSS: Math.round(targetTSS * 10) / 10,
        completedActivities: completedActivitiesCount || 0,
        totalPlannedActivities,
      },
      upcomingActivities: upcomingActivities || [],
    };
  }),

  // ------------------------------
  // Get ideal training curve (planned progression)
  // ------------------------------
  getIdealCurve: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        start_date: z.string(),
        end_date: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get the training plan
      const { data: plan, error: planError } = await ctx.supabase
        .from("training_plans")
        .select("id, structure")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      const structure = plan.structure as any;

      // Only periodized plans have fitness progression
      if (
        structure?.plan_type !== "periodized" ||
        !structure?.fitness_progression
      ) {
        return null;
      }

      const fitnessProgression = structure.fitness_progression;
      const blocks = structure.blocks || [];

      // Generate ideal CTL/ATL curve based on fitness progression
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);

      const daysDiff = Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (isNaN(daysDiff) || daysDiff < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid date range",
        });
      }

      const dataPoints = [];
      let currentCTL = fitnessProgression.starting_ctl;
      const rampRate = fitnessProgression.weekly_ramp_rate;
      const targetCTL = fitnessProgression.target_ctl;
      const peakDate = fitnessProgression.peak_date
        ? new Date(fitnessProgression.peak_date)
        : endDate;

      for (let i = 0; i <= daysDiff; i++) {
        const date = new Date(startDate.getTime());
        date.setDate(startDate.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];

        // Find which block this date falls in
        const currentBlock = blocks.find((block: any) => {
          return (
            dateStr && block.start_date <= dateStr && block.end_date >= dateStr
          );
        });

        // Project CTL with ramp rate up to peak date
        if (date <= peakDate && currentCTL < targetCTL) {
          const weeklyIncrease = currentCTL * rampRate;
          currentCTL += weeklyIncrease / 7; // Daily increase
          currentCTL = Math.min(currentCTL, targetCTL);
        } else if (currentBlock?.phase === "taper") {
          // During taper, CTL naturally declines
          const taperRate = 0.95; // 5% weekly reduction
          currentCTL *= Math.pow(taperRate, 1 / 7); // Daily taper
        }

        // ATL follows CTL with typical ratio
        const idealATL = currentCTL * 0.7; // Typical ATL/CTL ratio

        if (dateStr) {
          dataPoints.push({
            date: dateStr,
            ctl: Math.round(currentCTL * 10) / 10,
            atl: Math.round(idealATL * 10) / 10,
            tsb: Math.round((currentCTL - idealATL) * 10) / 10,
          });
        }
      }

      return {
        dataPoints,
        startCTL: fitnessProgression.starting_ctl,
        targetCTL: fitnessProgression.target_ctl,
        targetDate: fitnessProgression.peak_date,
      };
    }),

  // ------------------------------
  // Get actual training curve (from completed activities)
  // ------------------------------
  getActualCurve: protectedProcedure
    .input(
      z.object({
        start_date: z.string(),
        end_date: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);

      // Get all activities in the date range plus 42 days before (for CTL calculation)
      const extendedStart = new Date(startDate);
      extendedStart.setDate(startDate.getDate() - 42);

      const { data: activities, error: activitiesError } = await ctx.supabase
        .from("activities")
        .select("started_at, metrics")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", extendedStart.toISOString())
        .lte("started_at", endDate.toISOString())
        .order("started_at", { ascending: true });

      if (activitiesError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: activitiesError.message,
        });
      }

      // Calculate CTL/ATL/TSB for each day
      const tssData: { date: string; tss: number }[] = [];
      const activitiesByDate = new Map<string, number>();

      // Group activities by date and sum TSS
      for (const activity of activities || []) {
        const dateStr = new Date(activity.started_at)
          .toISOString()
          .split("T")[0];
        if (!dateStr) continue;
        const tss = (activity.metrics as any)?.tss || 0;
        activitiesByDate.set(
          dateStr,
          (activitiesByDate.get(dateStr) || 0) + tss,
        );
      }

      // Create daily TSS array
      const daysDiff = Math.floor(
        (endDate.getTime() - extendedStart.getTime()) / (1000 * 60 * 60 * 24),
      );

      for (let i = 0; i <= daysDiff; i++) {
        const date = new Date(extendedStart.getTime());
        date.setDate(extendedStart.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];
        if (dateStr) {
          const tss = activitiesByDate.get(dateStr) || 0;
          tssData.push({ date: dateStr, tss });
        }
      }

      // Calculate training load series
      const series = calculateTrainingLoadSeries(
        tssData.map((d) => d.tss),
        0,
        0,
      );

      // Filter to requested date range and create data points
      const dataPoints = [];
      for (let i = 0; i < tssData.length; i++) {
        const tssItem = tssData[i];
        const seriesItem = series[i];
        if (!tssItem || !seriesItem) continue;

        const date = new Date(tssItem.date);
        if (date >= startDate && date <= endDate) {
          dataPoints.push({
            date: tssItem.date,
            ctl: Math.round(seriesItem.ctl * 10) / 10,
            atl: Math.round(seriesItem.atl * 10) / 10,
            tsb: Math.round(seriesItem.tsb * 10) / 10,
          });
        }
      }

      return { dataPoints };
    }),

  // ------------------------------
  // Apply quick adjustment to training plan
  // ------------------------------
  applyQuickAdjustment: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        adjustedStructure: z.any(), // Will be validated by trainingPlanSchema
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const { data: existing } = await ctx.supabase
        .from("training_plans")
        .select("id, profile_id")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to edit it",
        });
      }

      // Validate the adjusted structure
      try {
        trainingPlanSchema.parse(input.adjustedStructure);
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid adjusted structure",
          cause: validationError,
        });
      }

      // Apply the adjustment
      const { data, error } = await ctx.supabase
        .from("training_plans")
        .update({
          structure: input.adjustedStructure,
        })
        .eq("id", input.id)
        .select(
          `
          id,
          idx,
          name,
          description,
          structure,
          is_active,
          created_at,
          updated_at,
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
  // Get weekly summary (planned vs actual)
  // ------------------------------
  getWeeklySummary: protectedProcedure
    .input(
      z.object({
        training_plan_id: z.string().uuid(),
        weeks_back: z.number().min(1).max(52).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify plan ownership
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

      const structure = plan.structure as any;
      const blocks = structure.blocks || [];

      // Calculate date range
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - input.weeks_back * 7);

      // Get all planned activities in range with full activity plans
      const { data: plannedActivitiesRaw } = await ctx.supabase
        .from("planned_activities")
        .select(
          `
          id,
          scheduled_date,
          activity_plan:activity_plans (*)
        `,
        )
        .eq("training_plan_id", input.training_plan_id)
        .gte("scheduled_date", startDate.toISOString().split("T")[0])
        .lte("scheduled_date", today.toISOString().split("T")[0]);

      // Extract activity plans and add estimations
      const activityPlans =
        plannedActivitiesRaw?.map((pa) => pa.activity_plan).filter(Boolean) ||
        [];

      const plansWithEstimations =
        activityPlans.length > 0
          ? await addEstimationToPlans(
              activityPlans,
              ctx.supabase,
              ctx.session.user.id,
            )
          : [];

      // Create a map for quick lookup of estimated TSS by plan ID
      const estimationMap = new Map(
        plansWithEstimations.map((plan) => [plan.id, plan.estimated_tss]),
      );

      // Map planned activities with their estimations
      const plannedActivities =
        plannedActivitiesRaw?.map((pa) => ({
          ...pa,
          activity_plan: pa.activity_plan
            ? {
                ...pa.activity_plan,
                estimated_tss: estimationMap.get(pa.activity_plan.id) || 0,
              }
            : null,
        })) || [];

      // Get all completed activities in range
      const { data: completedActivities } = await ctx.supabase
        .from("activities")
        .select("started_at, metrics")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", startDate.toISOString())
        .lte("started_at", today.toISOString());

      // Group by week
      const weekSummaries = [];
      for (let i = input.weeks_back - 1; i >= 0; i--) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - (i + 1) * 7);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        // Count planned activities and TSS for this week
        const weekPlanned =
          plannedActivities?.filter((pa) => {
            const date = new Date(pa.scheduled_date);
            return date >= weekStart && date < weekEnd;
          }) || [];

        const plannedTSS = weekPlanned.reduce(
          (sum, pa) => sum + (pa.activity_plan?.estimated_tss || 0),
          0,
        );

        // Count completed activities and TSS for this week
        const weekCompleted =
          completedActivities?.filter((act) => {
            const date = new Date(act.started_at);
            return date >= weekStart && date < weekEnd;
          }) || [];

        const completedTSS = weekCompleted.reduce(
          (sum, act) => sum + ((act.metrics as any)?.tss || 0),
          0,
        );

        // Find the block for this week (use week start date)
        const weekStartStr = weekStart.toISOString().split("T")[0];
        const weekBlock = blocks.find((block: any) => {
          return (
            weekStartStr &&
            block.start_date <= weekStartStr &&
            block.end_date >= weekStartStr
          );
        });

        // Get target TSS and activities from the block
        let targetWeeklyTSS = 0;
        let targetActivities = 0;

        if (weekBlock?.target_weekly_tss_range) {
          targetWeeklyTSS = weekBlock.target_weekly_tss_range.max;
        }

        if (weekBlock?.target_sessions_per_week_range) {
          targetActivities = weekBlock.target_sessions_per_week_range.max;
        } else if (structure?.constraints?.available_days_per_week) {
          // Fallback to constraints if no block-specific target
          targetActivities =
            structure.constraints.available_days_per_week.length;
        }

        // Calculate completion percentage
        const tssPercentage =
          plannedTSS > 0 ? (completedTSS / plannedTSS) * 100 : 0;
        const activityPercentage =
          weekPlanned.length > 0
            ? (weekCompleted.length / weekPlanned.length) * 100
            : 0;

        // Determine status
        let status: "good" | "warning" | "poor" = "good";
        if (tssPercentage < 70 || activityPercentage < 70) {
          status = "poor";
        } else if (tssPercentage < 90 || activityPercentage < 90) {
          status = "warning";
        }

        weekSummaries.push({
          weekStart: weekStart.toISOString().split("T")[0],
          weekEnd: weekEnd.toISOString().split("T")[0],
          plannedTSS: Math.round(plannedTSS),
          completedTSS: Math.round(completedTSS),
          tssPercentage: Math.round(tssPercentage),
          plannedActivities: weekPlanned.length,
          completedActivities: weekCompleted.length,
          activityPercentage: Math.round(activityPercentage),
          targetTSS: Math.round(targetWeeklyTSS),
          targetActivities,
          status,
        });
      }

      return weekSummaries;
    }),

  // ------------------------------
  // Get intensity distribution (actual from completed activities)
  // Uses 7-zone system: Recovery, Endurance, Tempo, Threshold, VO2max, Anaerobic, Neuromuscular
  // ------------------------------
  getIntensityDistribution: protectedProcedure
    .input(
      z.object({
        training_plan_id: z.string().uuid().optional(),
        start_date: z.string(),
        end_date: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get completed activities in date range with intensity_factor
      const { data: activities, error } = await ctx.supabase
        .from("activities")
        .select("id, metrics, started_at")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const totalActivities = activities?.length || 0;

      // Initialize 7-zone distribution (TSS-weighted)
      type IntensityZone =
        | "recovery"
        | "endurance"
        | "tempo"
        | "threshold"
        | "vo2max"
        | "anaerobic"
        | "neuromuscular";
      const zoneDistribution: Record<IntensityZone, number> = {
        recovery: 0,
        endurance: 0,
        tempo: 0,
        threshold: 0,
        vo2max: 0,
        anaerobic: 0,
        neuromuscular: 0,
      };

      let totalTSS = 0;

      // Calculate actual distribution from IF values
      if (activities && activities.length > 0) {
        for (const activity of activities) {
          // Skip activities without intensity_factor or TSS
          const metrics = activity.metrics as any;
          const intensityFactorValue = metrics?.if || 0;
          const tss = metrics?.tss || 0;

          if (!intensityFactorValue || !tss) {
            continue;
          }

          // Convert IF from integer (0-100) to decimal (0.00-1.00)
          const intensityFactor = intensityFactorValue / 100;

          // Get the zone for this IF value
          const zone = getTrainingIntensityZone(
            intensityFactor,
          ) as IntensityZone;

          // Add TSS to the appropriate zone
          zoneDistribution[zone] = (zoneDistribution[zone] || 0) + tss;
          totalTSS += tss;
        }

        // Convert TSS values to percentages
        if (totalTSS > 0) {
          for (const zone in zoneDistribution) {
            const zoneKey = zone as IntensityZone;
            zoneDistribution[zoneKey] =
              (zoneDistribution[zoneKey] / totalTSS) * 100;
          }
        }
      }

      // Generate recommendations based on training science
      const recommendations: string[] = [];
      const recoveryPct = zoneDistribution.recovery || 0;
      const endurancePct = zoneDistribution.endurance || 0;
      const hardPct =
        (zoneDistribution.threshold || 0) +
        (zoneDistribution.vo2max || 0) +
        (zoneDistribution.anaerobic || 0) +
        (zoneDistribution.neuromuscular || 0);

      // Polarized training: ~80% easy (recovery + endurance), ~20% hard
      const easyPct = recoveryPct + endurancePct;

      if (totalActivities >= 5) {
        // Only provide recommendations if we have enough data
        if (easyPct < 70) {
          recommendations.push(
            "Consider adding more easy/recovery activities. Aim for ~80% of training at low intensity.",
          );
        } else if (easyPct > 90) {
          recommendations.push(
            "Consider adding some high-intensity sessions to stimulate adaptation.",
          );
        }

        if (hardPct > 30) {
          recommendations.push(
            "High volume of hard training detected. Ensure adequate recovery to prevent overtraining.",
          );
        }

        if ((zoneDistribution.tempo || 0) > 20) {
          recommendations.push(
            "High tempo training detected. This 'gray zone' may limit polarization benefits.",
          );
        }
      } else if (totalActivities > 0) {
        recommendations.push(
          "Complete more activities to see meaningful intensity distribution analysis.",
        );
      } else {
        recommendations.push(
          "No completed activities in this date range. Start training to see your intensity distribution!",
        );
      }

      return {
        distribution: {
          recovery: Math.round((zoneDistribution.recovery || 0) * 10) / 10,
          endurance: Math.round((zoneDistribution.endurance || 0) * 10) / 10,
          tempo: Math.round((zoneDistribution.tempo || 0) * 10) / 10,
          threshold: Math.round((zoneDistribution.threshold || 0) * 10) / 10,
          vo2max: Math.round((zoneDistribution.vo2max || 0) * 10) / 10,
          anaerobic: Math.round((zoneDistribution.anaerobic || 0) * 10) / 10,
          neuromuscular:
            Math.round((zoneDistribution.neuromuscular || 0) * 10) / 10,
        },
        totalActivities,
        totalTSS: Math.round(totalTSS),
        activitiesWithIntensity:
          activities?.filter(
            (a) =>
              (a.metrics as any)?.if !== null &&
              (a.metrics as any)?.if !== undefined,
          ).length || 0,
        recommendations,
      };
    }),

  // Get intensity trends over time
  // ------------------------------
  getIntensityTrends: protectedProcedure
    .input(
      z.object({
        weeks_back: z.number().int().min(1).max(52).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.weeks_back * 7);

      // Get activities with IF values
      const { data: activities, error } = await ctx.supabase
        .from("activities")
        .select("id, metrics, started_at")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", startDate.toISOString())
        .lte("started_at", endDate.toISOString())
        .order("started_at", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Group by week
      type IntensityZone =
        | "recovery"
        | "endurance"
        | "tempo"
        | "threshold"
        | "vo2max"
        | "anaerobic"
        | "neuromuscular";
      const weeklyData: Record<
        string,
        {
          weekStart: string;
          totalTSS: number;
          avgIF: number;
          activities: number;
          zones: Record<IntensityZone, number>;
        }
      > = {};

      if (activities && activities.length > 0) {
        for (const activity of activities) {
          const date = new Date(activity.started_at);
          // Get Monday of the week
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay() + 1);
          const weekKey = weekStart.toISOString().split("T")[0] || "";

          if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = {
              weekStart: weekKey,
              totalTSS: 0,
              avgIF: 0,
              activities: 0,
              zones: {
                recovery: 0,
                endurance: 0,
                tempo: 0,
                threshold: 0,
                vo2max: 0,
                anaerobic: 0,
                neuromuscular: 0,
              },
            };
          }

          const metrics = activity.metrics as any;
          const intensityFactorValue = metrics?.if || 0;

          if (!intensityFactorValue) continue;

          const intensityFactor = intensityFactorValue / 100;
          const tss = metrics?.tss || 0;
          const zone = getTrainingIntensityZone(
            intensityFactor,
          ) as IntensityZone;

          const week = weeklyData[weekKey];
          if (week && weekKey) {
            week.totalTSS += tss;
            week.avgIF += intensityFactor;
            week.activities += 1;
            week.zones[zone] = (week.zones[zone] || 0) + tss;
          }
        }

        // Calculate averages and percentages
        for (const week of Object.values(weeklyData)) {
          week.avgIF = week.avgIF / week.activities;

          // Convert zone TSS to percentages
          if (week.totalTSS > 0) {
            for (const zone in week.zones) {
              const zoneKey = zone as IntensityZone;
              week.zones[zoneKey] = (week.zones[zoneKey] / week.totalTSS) * 100;
            }
          }
        }
      }

      return {
        weeks: Object.values(weeklyData).sort(
          (a, b) =>
            new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
        ),
        totalActivities: activities?.length || 0,
      };
    }),

  // Check hard activity spacing (retrospective analysis)
  // ------------------------------
  checkHardActivitySpacing: protectedProcedure
    .input(
      z.object({
        start_date: z.string(),
        end_date: z.string(),
        min_hours: z.number().int().min(24).max(168).default(48),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get activities with IF >= 0.85 (threshold and above)
      const { data: allActivities, error } = await ctx.supabase
        .from("activities")
        .select("id, name, started_at, metrics")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.start_date)
        .lte("started_at", input.end_date)
        .order("started_at", { ascending: true });

      // Filter activities with IF >= 85 in the metrics JSONB
      const activities =
        allActivities?.filter((a) => {
          const metrics = a.metrics as any;
          return (metrics?.if || 0) >= 85;
        }) || [];

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const violations: Array<{
        activity1: {
          id: string;
          name: string;
          started_at: string;
          intensity_factor: number;
        };
        activity2: {
          id: string;
          name: string;
          started_at: string;
          intensity_factor: number;
        };
        hoursBetween: number;
      }> = [];

      if (activities && activities.length > 1) {
        for (let i = 1; i < activities.length; i++) {
          const prev = activities[i - 1];
          const curr = activities[i];

          if (!prev || !curr) continue;

          const hoursBetween =
            (new Date(curr.started_at).getTime() -
              new Date(prev.started_at).getTime()) /
            (1000 * 60 * 60);

          if (hoursBetween < input.min_hours) {
            const prevMetrics = prev.metrics as any;
            const currMetrics = curr.metrics as any;

            violations.push({
              activity1: {
                id: prev.id,
                name: prev.name || "Unnamed activity",
                started_at: prev.started_at,
                intensity_factor: prevMetrics?.if ?? 0,
              },
              activity2: {
                id: curr.id,
                name: curr.name || "Unnamed activity",
                started_at: curr.started_at,
                intensity_factor: currMetrics?.if ?? 0,
              },
              hoursBetween: Math.round(hoursBetween * 10) / 10,
            });
          }
        }
      }

      return {
        violations,
        hardActivityCount: activities?.length || 0,
        hasViolations: violations.length > 0,
      };
    }),

  // ------------------------------
  // Get weekly totals (distance, time, count) for current week
  // ------------------------------
  getWeeklyTotals: protectedProcedure
    .input(
      z
        .object({
          weekStartDate: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Calculate week boundaries (Sunday to Saturday)
      const today = new Date();
      const weekStart = input?.weekStartDate
        ? new Date(input.weekStartDate)
        : new Date(today);

      // Set to start of week (Sunday)
      if (!input?.weekStartDate) {
        weekStart.setDate(today.getDate() - today.getDay());
      }
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      // Get completed activities for this week
      const { data: activities, error } = await ctx.supabase
        .from("activities")
        .select("distance_meters, duration_seconds")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", weekStart.toISOString())
        .lt("started_at", weekEnd.toISOString());

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Sum totals
      let totalDistance = 0;
      let totalTime = 0;
      const count = activities?.length || 0;

      if (activities && activities.length > 0) {
        for (const activity of activities) {
          totalDistance += activity.distance_meters || 0;
          totalTime += activity.duration_seconds || 0;
        }
      }

      return {
        distance: Math.round(totalDistance * 100) / 100, // meters
        time: Math.round(totalTime), // seconds
        count,
      };
    }),

  // ------------------------------
  // List training plan templates
  // ------------------------------
  listTemplates: protectedProcedure
    .input(
      z
        .object({
          sport: z.string().optional(),
          experience_level: z
            .enum(["beginner", "intermediate", "advanced"])
            .optional(),
          min_weeks: z.number().int().min(1).max(52).optional(),
          max_weeks: z.number().int().min(1).max(52).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      // Import PLAN_TEMPLATES from core package
      const { PLAN_TEMPLATES } = await import("@repo/core");

      // Convert to array and filter
      let templates = Object.entries(PLAN_TEMPLATES).map(([id, template]) => ({
        id,
        ...template,
      }));

      if (input?.sport) {
        templates = templates.filter((t) =>
          t.sport.includes(input.sport as any),
        );
      }

      if (input?.experience_level) {
        templates = templates.filter((t) =>
          t.experienceLevel.includes(input.experience_level!),
        );
      }

      if (input?.min_weeks) {
        templates = templates.filter(
          (t) => t.durationWeeks.recommended >= input.min_weeks!,
        );
      }

      if (input?.max_weeks) {
        templates = templates.filter(
          (t) => t.durationWeeks.recommended <= input.max_weeks!,
        );
      }

      return templates;
    }),

  // ------------------------------
  // Get single training plan template
  // ------------------------------
  getTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { PLAN_TEMPLATES } = await import("@repo/core");

      const template = PLAN_TEMPLATES[input.id];

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      return {
        id: input.id,
        ...template,
      };
    }),

  // ------------------------------
  // Auto-add periodization to existing plan
  // ------------------------------
  autoAddPeriodization: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const { data: existing, error: fetchError } = await ctx.supabase
        .from("training_plans")
        .select("id, profile_id, structure")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (fetchError || !existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Training plan not found or you don't have permission to edit it",
        });
      }

      const structure = existing.structure as any;

      // Check if already periodized
      if (
        structure?.plan_type === "periodized" &&
        structure?.fitness_progression
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This plan already has periodization configured",
        });
      }

      // For now, return a message that this feature is under development
      // In the future, this could automatically generate blocks and fitness progression
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Auto-periodization is not yet implemented. Please create a new periodized training plan or manually configure periodization in settings.",
      });
    }),
});
