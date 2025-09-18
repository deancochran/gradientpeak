import {
  publicActivitiesInsertSchema,
  publicActivitiesUpdateSchema,
  publicActivityTypeSchema,
} from "@repo/supabase";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// API-specific schemas for filtering and operations
const activityListFiltersSchema = z.object({
  activity_type: publicActivityTypeSchema.optional(),
  date_range: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

const activitySyncSchema = z.object({
  activityId: z.string(),
  startedAt: z.string(),
  liveMetrics: z.unknown(),
  filePath: z.string().optional(),
});

const bulkActivitySyncSchema = z.object({
  activities: z.array(activitySyncSchema),
});

// Remove profile_id from insert schema for API use (we'll add it from context)
const activityCreateSchema = publicActivitiesInsertSchema.omit({
  profile_id: true,
});
const activityUpdateSchema = publicActivitiesUpdateSchema;

export const activitiesRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const { data: activity, error } = await ctx.supabase
          .from("activities")
          .select("*")
          .eq("id", input.id)
          .eq("profile_id", ctx.session.user.id)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Activity not found",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return activity;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch activity",
        });
      }
    }),

  create: protectedProcedure
    .input(activityCreateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { data: activity, error } = await ctx.supabase
          .from("activities")
          .insert({
            ...input,
            profile_id: ctx.session.user.id,
          })
          .select()
          .single();

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return activity;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create activity",
        });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: activityUpdateSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { data: activity, error } = await ctx.supabase
          .from("activities")
          .update(input.data)
          .eq("id", input.id)
          .eq("profile_id", ctx.session.user.id)
          .select()
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Activity not found",
            });
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return activity;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update activity",
        });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { error } = await ctx.supabase
          .from("activities")
          .delete()
          .eq("id", input.id)
          .eq("profile_id", ctx.session.user.id);

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
          message: "Failed to delete activity",
        });
      }
    }),

  list: protectedProcedure
    .input(activityListFiltersSchema)
    .query(async ({ ctx, input }) => {
      try {
        let query = ctx.supabase
          .from("activities")
          .select("*")
          .eq("profile_id", ctx.session.user.id)
          .order("started_at", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);

        if (input.date_range) {
          query = query
            .gte("started_at", input.date_range.start)
            .lte("started_at", input.date_range.end);
        }

        const { data: activities, error } = await query;

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return activities || [];
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch activities",
        });
      }
    }),

  sync: protectedProcedure
    .input(activitySyncSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Handle single activity sync
        const activityData = {
          id: input.activityId,
          started_at: input.startedAt,
          live_metrics: input.liveMetrics,
          file_path: input.filePath,
          profile_id: ctx.session.user.id,
          sync_status: "synced",
        };

        const { data: activity, error } = await ctx.supabase
          .from("activities")
          .upsert(activityData, {
            onConflict: "id",
            ignoreDuplicates: false,
          })
          .select();

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return {
          synced: activity ? 1 : 0,
          activity: activity,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to sync activity",
        });
      }
    }),

  bulkSync: protectedProcedure
    .input(bulkActivitySyncSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const activitiesToInsert = input.activities.map((activity) => ({
          id: activity.activityId,
          started_at: activity.startedAt,
          live_metrics: activity.liveMetrics,
          file_path: activity.filePath,
          profile_id: ctx.session.user.id,
          sync_status: "synced",
        }));

        const { data: activities, error } = await ctx.supabase
          .from("activities")
          .upsert(activitiesToInsert, {
            onConflict: "id",
            ignoreDuplicates: false,
          })
          .select();

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return {
          synced: activities?.length || 0,
          activities: activities || [],
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to bulk sync activities",
        });
      }
    }),
});
