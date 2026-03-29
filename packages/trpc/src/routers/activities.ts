import {
  ActivityUploadSchema,
  analyzeActivityDerivedMetrics,
  calculateAge,
  estimateFTPFromWeight,
  estimateLTHR,
  estimateMaxHR,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  buildActivityDerivedSummaryMap,
  mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse,
  resolveActivityContextAsOf,
} from "../lib/activity-analysis";
import { createTRPCRouter, protectedProcedure } from "../trpc";

/**
 * Check if a user has access to view an activity
 * Returns true if: user owns the activity, OR activity is public, OR user follows the owner
 */
async function checkActivityAccess(
  supabase: any,
  activityId: string,
  userId: string,
): Promise<boolean> {
  // Get the activity
  const { data: activity, error } = await supabase
    .from("activities")
    .select("profile_id, is_private")
    .eq("id", activityId)
    .single();

  if (error || !activity) {
    return false;
  }

  // User owns the activity
  if (activity.profile_id === userId) {
    return true;
  }

  // Activity is public - allow access
  if (!activity.is_private) {
    return true;
  }

  // Activity is private - check if user follows the owner
  const { data: followData } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", userId)
    .eq("following_id", activity.profile_id)
    .eq("status", "accepted")
    .maybeSingle();

  return !!followData;
}

export const activitiesRouter = createTRPCRouter({
  // List activities by date range (legacy - for trends/analytics)
  list: protectedProcedure
    .input(
      z
        .object({
          date_from: z.string(),
          date_to: z.string(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", input.date_from)
        .lte("started_at", input.date_to)
        .order("started_at", { ascending: false });

      if (error) throw new Error(error.message);

      const derivedMap = await buildActivityDerivedSummaryMap({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        activities: data || [],
      });

      const activityIds = data?.map((a) => a.id) || [];
      let userLikes: string[] = [];

      if (activityIds.length > 0) {
        const { data: likesData } = await (ctx.supabase as any)
          .from("likes")
          .select("entity_id")
          .eq("profile_id", ctx.session.user.id)
          .eq("entity_type", "activity")
          .in("entity_id", activityIds);

        userLikes = likesData?.map((l: any) => l.entity_id) || [];
      }

      return (data || []).map((a) =>
        mapActivityToListDerivedResponse({
          activity: a,
          has_liked: userLikes.includes(a.id),
          derived: derivedMap.get(a.id) ?? null,
        }),
      );
    }),

  // Paginated list of activities with filters
  listPaginated: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
          activity_category: z.enum(["run", "bike", "swim", "strength", "other"]).optional(),
          date_from: z.string().optional(),
          date_to: z.string().optional(),
          sort_by: z.enum(["date", "distance", "duration", "tss"]).default("date"),
          sort_order: z.enum(["asc", "desc"]).default("desc"),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const baseQuery = () => {
        let query = ctx.supabase
          .from("activities")
          .select("*", { count: "exact" })
          .eq("profile_id", ctx.session.user.id);

        if (input.activity_category) {
          query = query.eq("type", input.activity_category);
        }
        if (input.date_from) {
          query = query.gte("started_at", input.date_from);
        }
        if (input.date_to) {
          query = query.lte("started_at", input.date_to);
        }

        return query;
      };

      let data;
      let count;
      let error;

      if (input.sort_by === "tss") {
        ({ data, error, count } = await baseQuery().order("started_at", { ascending: false }));
      } else {
        const sortColumn = {
          date: "started_at",
          distance: "distance_meters",
          duration: "duration_seconds",
        }[input.sort_by];

        ({ data, error, count } = await baseQuery()
          .order(sortColumn, {
            ascending: input.sort_order === "asc",
          })
          .range(input.offset, input.offset + input.limit - 1));
      }

      if (error) throw new Error(error.message);

      const derivedMap = await buildActivityDerivedSummaryMap({
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
        activities: data || [],
      });

      const activityIds = data?.map((a) => a.id) || [];
      let userLikes: string[] = [];

      if (activityIds.length > 0) {
        const { data: likesData } = await (ctx.supabase as any)
          .from("likes")
          .select("entity_id")
          .eq("profile_id", ctx.session.user.id)
          .eq("entity_type", "activity")
          .in("entity_id", activityIds);

        userLikes = likesData?.map((l: any) => l.entity_id) || [];
      }

      let items = (data || []).map((a) =>
        mapActivityToListDerivedResponse({
          activity: a,
          has_liked: userLikes.includes(a.id),
          derived: derivedMap.get(a.id) ?? null,
        }),
      );

      if (input.sort_by === "tss") {
        items = items
          .sort((a, b) => {
            const left = a.derived?.tss ?? Number.NEGATIVE_INFINITY;
            const right = b.derived?.tss ?? Number.NEGATIVE_INFINITY;
            return input.sort_order === "asc" ? left - right : right - left;
          })
          .slice(input.offset, input.offset + input.limit);
      }

      return {
        items,
        total: count || 0,
        hasMore: (count || 0) > input.offset + input.limit,
      };
    }),

  // Simplified: Just create the activity first
  create: protectedProcedure
    .input(
      ActivityUploadSchema.extend({
        profile_id: z.string(),
        eventId: z.string().uuid().optional().nullable(),
      })
        .strict()
        .refine((data) => new Date(data.finishedAt) > new Date(data.startedAt), {
          message: "finishedAt must be after startedAt",
          path: ["finishedAt"],
        }),
    )
    .mutation(async ({ input, ctx }) => {
      const duration_seconds =
        (new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime()) / 1000;

      if (duration_seconds <= 0) {
        throw new Error("Activity duration must be positive.");
      }

      let linkedActivityPlanId: string | null = null;
      if (input.eventId) {
        const { data: linkedEvent, error: linkedEventError } = await ctx.supabase
          .from("events")
          .select("activity_plan_id")
          .eq("id", input.eventId)
          .eq("profile_id", ctx.session.user.id)
          .eq("event_type", "planned_activity")
          .single();

        if (linkedEventError || !linkedEvent) {
          throw new Error("Linked event not found.");
        }

        linkedActivityPlanId = linkedEvent.activity_plan_id;
      }

      const newActivity = {
        profile_id: input.profile_id,
        name: input.name,
        notes: input.notes,
        type: input.type,
        started_at: input.startedAt,
        finished_at: input.finishedAt,
        duration_seconds,
        moving_seconds: input.movingSeconds,
        distance_meters: input.distanceMeters,
        activity_plan_id: linkedActivityPlanId,
        normalized_power: input.metrics.normalized_power,
      };

      const { data, error } = await ctx.supabase
        .from("activities")
        .insert(newActivity)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),

  getById: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
        })
        .strict(),
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      // Check authorization
      const hasAccess = await checkActivityAccess(ctx.supabase, input.id, userId);

      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to view this activity",
        });
      }

      const { data, error } = await ctx.supabase
        .from("activities")
        .select(
          `
            *,
            activity_plans (*)
          `,
        )
        .eq("id", input.id)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Activity not found");

      const { data: likeData } = await (ctx.supabase as any)
        .from("likes")
        .select("id")
        .eq("profile_id", userId)
        .eq("entity_type", "activity")
        .eq("entity_id", input.id)
        .maybeSingle();

      const context = await resolveActivityContextAsOf({
        supabase: ctx.supabase,
        profileId: data.profile_id,
        activityTimestamp: data.finished_at,
      });

      const derived = analyzeActivityDerivedMetrics({
        activity: {
          id: data.id,
          type: data.type,
          started_at: data.started_at,
          finished_at: data.finished_at,
          duration_seconds: data.duration_seconds,
          moving_seconds: data.moving_seconds,
          distance_meters: data.distance_meters,
          avg_heart_rate: data.avg_heart_rate,
          max_heart_rate: data.max_heart_rate,
          avg_power: data.avg_power,
          max_power: data.max_power,
          avg_speed_mps: data.avg_speed_mps,
          max_speed_mps: data.max_speed_mps,
          normalized_power: data.normalized_power,
          normalized_speed_mps: data.normalized_speed_mps,
          normalized_graded_speed_mps: data.normalized_graded_speed_mps,
        },
        context,
      });

      return mapActivityToDerivedResponse({
        activity: data,
        has_liked: !!likeData,
        derived,
      });
    }),

  // Update activity (e.g., to set metrics after calculation)
  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          normalized_power: z.number().optional(),
          name: z.string().optional(),
          notes: z.string().nullable().optional(),
          is_private: z.boolean().optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const { data, error } = await ctx.supabase
        .from("activities")
        .update(updates)
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),

  // Hard delete activity - permanently removes the record
  // Activity streams are automatically deleted via cascade
  delete: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get FIT file path before deletion
      const { data: activity, error: fetchError } = await ctx.supabase
        .from("activities")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (fetchError || !activity) {
        throw new Error("Activity not found or you do not have permission to delete it.");
      }

      // If there's an associated FIT file, delete it from storage
      if (activity.fit_file_path) {
        const { error: storageError } = await ctx.supabase.storage
          .from("fit-files")
          .remove([activity.fit_file_path]);

        if (storageError) {
          // Log the error but still attempt to delete the activity record
          console.error(
            `Failed to delete FIT file '${activity.fit_file_path}':`,
            storageError.message,
          );
          // Optionally, you could throw an error here to prevent deletion if the file can't be removed
          // For now, we'll proceed to delete the activity record anyway
        }
      }

      // Hard delete: remove the record (activity_streams cascade deleted automatically)
      const { error } = await ctx.supabase
        .from("activities")
        .delete()
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id);

      if (error) throw new Error(error.message);

      return { success: true, deletedActivityId: input.id };
    }),
});
