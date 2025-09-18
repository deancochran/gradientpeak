import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../index";

// Sync-specific schemas
const syncActivitySchema = z.object({
  activityId: z.string(),
  startedAt: z.string(),
  liveMetrics: z.unknown(),
  filePath: z.string().optional(),
});

const bulkSyncActivitiesSchema = z.object({
  activities: z.array(syncActivitySchema),
});

const resolveConflictSchema = z.object({
  activityId: z.string(),
  resolution: z.enum(["use_local", "use_remote", "merge", "skip"]),
  mergeData: z.unknown().optional(),
});

export const syncRouter = createTRPCRouter({
  status: protectedProcedure.query(async ({ ctx }) => {
    try {
      // Get sync status from database
      const { data, error } = await ctx.supabase
        .from("activities")
        .select("sync_status, id, name, activity_type, started_at")
        .eq("profile_id", ctx.user.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const syncHealth = {
        total: data.length,
        synced: data.filter(a => a.sync_status === 'synced').length,
        pending: data.filter(a => a.sync_status === 'pending').length,
        inProgress: data.filter(a => a.sync_status === 'syncing').length,
        failed: data.filter(a => a.sync_status === 'failed').length,
        syncPercentage: data.length > 0 ? Math.round((data.filter(a => a.sync_status === 'synced').length / data.length) * 100) : 100,
      };

      const pendingActivities = data
        .filter(a => a.sync_status !== 'synced')
        .map(a => ({
          id: a.id,
          name: a.name || 'Untitled Activity',
          sport: a.activity_type || 'unknown',
          startedAt: a.started_at,
          syncStatus: a.sync_status,
          hasLocalFile: false, // Would need to check file system
        }));

      const recommendations = [];
      if (syncHealth.failed > 0) {
        recommendations.push({
          type: "warning" as const,
          message: `${syncHealth.failed} activities failed to sync`,
          action: "Review failed activities and retry sync",
        });
      }

      return {
        syncHealth,
        pendingActivities,
        recommendations,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get sync status",
      });
    }
  }),

  conflicts: protectedProcedure.query(async ({ ctx }) => {
    try {
      // Query for activities with conflicts
      const { data, error } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.user.id)
        .eq("sync_status", "conflict");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return {
        conflicts: data || [],
        hasConflicts: (data?.length || 0) > 0,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get sync conflicts",
      });
    }
  }),

  resolveConflict: protectedProcedure
    .input(resolveConflictSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Handle conflict resolution based on strategy
        let updateData: any = {};

        switch (input.resolution) {
          case "use_local":
            updateData = { sync_status: "pending" };
            break;
          case "use_remote":
            updateData = { sync_status: "synced" };
            break;
          case "merge":
            updateData = {
              ...input.mergeData,
              sync_status: "pending",
            };
            break;
          case "skip":
            updateData = { sync_status: "skipped" };
            break;
        }

        const { error } = await ctx.supabase
          .from("activities")
          .update(updateData)
          .eq("id", input.activityId)
          .eq("profile_id", ctx.user.id);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
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
          message: "Failed to resolve conflict",
        });
      }
    }),
});
