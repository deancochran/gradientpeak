import {
  plannedActivityCreateSchema,
  plannedActivityUpdateSchema,
} from "@repo/core";
import type { Database } from "@repo/supabase";
import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { WahooSyncService } from "../lib/integrations/wahoo/sync-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  addEstimationToPlan,
  addEstimationToPlans,
} from "../utils/estimation-helpers";

type EventLifecycleStatus =
  | "scheduled"
  | "completed"
  | "skipped"
  | "rescheduled"
  | "expired";

type EventStatusContext = {
  completedByDate: Set<string>;
  completedByDateAndPlan: Set<string>;
  todayDateKey: string;
};

type InsightRefreshHint = {
  training_plan_id: string | null;
  changed_date: string | null;
  refresh_key: string;
};

type ActivityPlanRecord = Database["public"]["Tables"]["activity_plans"]["Row"];

const plannedEventType = "planned_activity" as const;

const plannedEventSelect = `
  id,
  idx,
  profile_id,
  activity_plan_id,
  training_plan_id,
  notes,
  status,
  created_at,
  updated_at,
  starts_at,
  ends_at,
  activity_plan:activity_plans (*)
`;

type PlannedEventRecord = {
  id: string;
  idx: number;
  profile_id: string;
  activity_plan_id: string | null;
  training_plan_id: string | null;
  notes: string | null;
  status: Database["public"]["Enums"]["event_status"];
  created_at: string;
  updated_at: string;
  starts_at: string;
  ends_at: string | null;
  activity_plan: ActivityPlanRecord | null;
};

const validateConstraintsSchema = z
  .object({
    training_plan_id: z.string().uuid(),
    scheduled_date: z
      .string()
      .refine((val) => !Number.isNaN(Date.parse(val)), "Invalid date format"),
    activity_plan_id: z.string().uuid(),
  })
  .strict();

const plannedActivityCreateInputSchema = plannedActivityCreateSchema.strict();
const plannedActivityUpdateWithIdInputSchema = plannedActivityUpdateSchema
  .extend({
    id: z.string().uuid(),
  })
  .strict();

const eventListSchema = z
  .object({
    activity_category: z.string().optional(),
    activity_plan_id: z.string().optional(),
    training_plan_id: z.string().uuid().optional(),
    include_adhoc: z.boolean().default(true),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .strict();

function toDateKey(value: string): string {
  return value.split("T")[0] || value;
}

function toDayStartIso(dateValue: string): string {
  return `${toDateKey(dateValue)}T00:00:00.000Z`;
}

function toNextDayStartIso(dateValue: string): string {
  const day = new Date(toDayStartIso(dateValue));
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString();
}

function mapEvent<T extends PlannedEventRecord>(
  event: T,
): Omit<T, "starts_at" | "ends_at"> & { scheduled_date: string } {
  const { starts_at, ends_at: _endsAt, ...rest } = event;

  return {
    ...rest,
    scheduled_date: toDateKey(starts_at),
  };
}

function mapEvents<T extends PlannedEventRecord>(
  events: T[] | null,
): Array<Omit<T, "starts_at" | "ends_at"> & { scheduled_date: string }> {
  return (events || []).map((event) => mapEvent(event));
}

function getRecordValue(record: unknown, key: string): unknown {
  if (!record || typeof record !== "object") return undefined;
  return (record as Record<string, unknown>)[key];
}

function hasTruthyRecordValue(record: unknown, keys: string[]): boolean {
  return keys.some((key) => Boolean(getRecordValue(record, key)));
}

function getRecordString(record: unknown, key: string): string | undefined {
  const value = getRecordValue(record, key);
  return typeof value === "string" ? value : undefined;
}

function buildCompletedSignature(
  dateKey: string,
  activityPlanId: string,
): string {
  return `${dateKey}::${activityPlanId}`;
}

function resolveEventStatus(
  event: {
    scheduled_date: string;
    activity_plan_id?: string | null;
  },
  statusContext: EventStatusContext,
): EventLifecycleStatus {
  const scheduledDateKey = toDateKey(event.scheduled_date);
  const explicitStatus = getRecordString(event, "status")?.toLowerCase();

  const completedByMatch =
    statusContext.completedByDate.has(scheduledDateKey) &&
    (event.activity_plan_id
      ? statusContext.completedByDateAndPlan.has(
          buildCompletedSignature(scheduledDateKey, event.activity_plan_id),
        )
      : true);
  const explicitlyCompleted =
    explicitStatus === "completed" ||
    hasTruthyRecordValue(event, ["completed_activity_id", "completed_at"]);
  if (completedByMatch || explicitlyCompleted) return "completed";

  const explicitlySkipped =
    explicitStatus === "skipped" ||
    hasTruthyRecordValue(event, ["skipped_at", "is_skipped"]);
  if (explicitlySkipped) return "skipped";

  const explicitlyRescheduled =
    explicitStatus === "rescheduled" ||
    hasTruthyRecordValue(event, [
      "rescheduled_at",
      "rescheduled_from_date",
      "original_scheduled_date",
    ]);
  if (explicitlyRescheduled) return "rescheduled";

  if (scheduledDateKey < statusContext.todayDateKey) return "expired";
  return "scheduled";
}

async function addEventLifecycleStatus<
  T extends {
    scheduled_date: string;
    activity_plan_id?: string | null;
  },
>(
  events: T[],
  ctx: { supabase: SupabaseClient<Database>; profileId: string },
): Promise<Array<T & { status: EventLifecycleStatus }>> {
  if (events.length === 0) return [];

  const dateKeys = events.map((event) => toDateKey(event.scheduled_date));
  const sortedDateKeys = [...dateKeys].sort();
  const minDateKey = sortedDateKeys[0];
  const maxDateKey = sortedDateKeys[sortedDateKeys.length - 1];
  if (!minDateKey || !maxDateKey) {
    return events.map((event) => ({
      ...event,
      status: "scheduled",
    }));
  }

  const maxDate = new Date(maxDateKey);
  maxDate.setDate(maxDate.getDate() + 1);
  const maxDateExclusive = maxDate.toISOString().split("T")[0] || maxDateKey;

  const { data: completedActivities, error } = await ctx.supabase
    .from("activities")
    .select("started_at, activity_plan_id")
    .eq("profile_id", ctx.profileId)
    .gte("started_at", minDateKey)
    .lt("started_at", maxDateExclusive);

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }

  const completedByDate = new Set<string>();
  const completedByDateAndPlan = new Set<string>();

  (completedActivities || []).forEach((activity) => {
    const dateKey = toDateKey(activity.started_at);
    completedByDate.add(dateKey);

    if (activity.activity_plan_id) {
      completedByDateAndPlan.add(
        buildCompletedSignature(dateKey, activity.activity_plan_id),
      );
    }
  });

  const statusContext: EventStatusContext = {
    completedByDate,
    completedByDateAndPlan,
    todayDateKey: toDateKey(new Date().toISOString()),
  };

  return events.map((event) => ({
    ...event,
    status: resolveEventStatus(event, statusContext),
  }));
}

function buildInsightRefreshHint(params: {
  trainingPlanId?: string | null;
  changedDate?: string | null;
  changeAt?: string;
}): InsightRefreshHint {
  const trainingPlanId = params.trainingPlanId ?? null;
  const changedDate = params.changedDate ?? null;
  const changeAt = params.changeAt ?? new Date().toISOString();

  return {
    training_plan_id: trainingPlanId,
    changed_date: changedDate,
    refresh_key: [
      trainingPlanId || "adhoc",
      changedDate || "none",
      changeAt,
    ].join(":"),
  };
}

export const eventsRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("events")
        .select(plannedEventSelect)
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType)
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planned event not found",
        });
      }

      const event = mapEvent(data as PlannedEventRecord);

      if (event.activity_plan) {
        const planWithEstimation = await addEstimationToPlan(
          event.activity_plan,
          ctx.supabase,
          ctx.session.user.id,
        );
        return {
          ...event,
          activity_plan: planWithEstimation,
        };
      }

      return event;
    }),

  getToday: protectedProcedure.query(async ({ ctx }) => {
    const today = toDateKey(new Date().toISOString());
    const tomorrow = toDateKey(
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );

    const { data, error } = await ctx.supabase
      .from("events")
      .select(plannedEventSelect)
      .eq("profile_id", ctx.session.user.id)
      .eq("event_type", plannedEventType)
      .gte("starts_at", toDayStartIso(today))
      .lt("starts_at", toDayStartIso(tomorrow))
      .order("starts_at", { ascending: true });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    const events = mapEvents(data as PlannedEventRecord[] | null);

    if (events.length > 0) {
      const plans = events
        .map((event) => event.activity_plan)
        .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

      const plansWithEstimation = await addEstimationToPlans(
        plans,
        ctx.supabase,
        ctx.session.user.id,
      );

      const plansMap = new Map(plansWithEstimation.map((p) => [p.id, p]));
      return events.map((event) => ({
        ...event,
        activity_plan: event.activity_plan
          ? plansMap.get(event.activity_plan.id)
          : null,
      }));
    }

    return events;
  }),

  getWeekCount: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const { count, error } = await ctx.supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", ctx.session.user.id)
      .eq("event_type", plannedEventType)
      .gte("starts_at", startOfWeek.toISOString())
      .lt("starts_at", endOfWeek.toISOString());

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return count || 0;
  }),

  create: protectedProcedure
    .input(plannedActivityCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data: activityPlan, error: planError } = await ctx.supabase
        .from("activity_plans")
        .select("*")
        .eq("id", input.activity_plan_id)
        .or(`profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`)
        .single();

      if (planError || !activityPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activity plan not found or not accessible",
        });
      }

      let trainingPlanId = input.training_plan_id;
      if (!trainingPlanId) {
        const { data: activePlan } = await ctx.supabase
          .from("training_plans")
          .select("*")
          .eq("profile_id", ctx.session.user.id)
          .eq("is_active", true)
          .single();
        trainingPlanId = activePlan?.id;
      }

      const startsAt = toDayStartIso(input.scheduled_date);
      const endsAt = toNextDayStartIso(input.scheduled_date);

      const { data, error } = await ctx.supabase
        .from("events")
        .insert({
          profile_id: ctx.session.user.id,
          event_type: plannedEventType,
          title: "Planned Activity",
          all_day: true,
          timezone: "UTC",
          starts_at: startsAt,
          ends_at: endsAt,
          status: "scheduled",
          activity_plan_id: input.activity_plan_id,
          training_plan_id: trainingPlanId,
          notes: input.notes ?? null,
        })
        .select(plannedEventSelect)
        .single();

      if (error || !data)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error?.message ?? "Failed to create planned event",
        });

      const event = mapEvent(data as PlannedEventRecord);

      let wahooSyncResult: { success: boolean; error?: string } | null = null;
      try {
        const { data: integration } = await ctx.supabase
          .from("integrations")
          .select("provider")
          .eq("profile_id", ctx.session.user.id)
          .eq("provider", "wahoo")
          .single();

        if (integration) {
          const syncService = new WahooSyncService(ctx.supabase);
          const result = await syncService.syncEvent(
            event.id,
            ctx.session.user.id,
          );
          wahooSyncResult = { success: result.success, error: result.error };
        }
      } catch (error) {
        console.error("Failed to auto-sync to Wahoo:", error);
        wahooSyncResult = {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unknown error during Wahoo sync",
        };
      }

      return {
        ...event,
        wahooSync: wahooSyncResult,
        insight_refresh_hint: buildInsightRefreshHint({
          trainingPlanId: event.training_plan_id,
          changedDate: event.scheduled_date,
          changeAt: event.updated_at,
        }),
      };
    }),

  update: protectedProcedure
    .input(plannedActivityUpdateWithIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const { data: existing } = await ctx.supabase
        .from("events")
        .select(plannedEventSelect)
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planned event not found",
        });
      }

      if (updates.activity_plan_id) {
        const { data: activityPlan, error: planError } = await ctx.supabase
          .from("activity_plans")
          .select("*")
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

      const eventUpdates: {
        activity_plan_id?: string;
        notes?: string | null;
        starts_at?: string;
        ends_at?: string;
      } = {
        ...(updates.activity_plan_id !== undefined
          ? { activity_plan_id: updates.activity_plan_id }
          : {}),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      };

      if (updates.scheduled_date !== undefined) {
        eventUpdates.starts_at = toDayStartIso(updates.scheduled_date);
        eventUpdates.ends_at = toNextDayStartIso(updates.scheduled_date);
      }

      const { data, error } = await ctx.supabase
        .from("events")
        .update(eventUpdates)
        .eq("id", id)
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType)
        .select(plannedEventSelect)
        .single();

      if (error || !data)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error?.message ?? "Failed to update planned event",
        });

      const event = mapEvent(data as PlannedEventRecord);

      let wahooSyncResult: { success: boolean; error?: string } | null = null;
      try {
        const { data: integration } = await ctx.supabase
          .from("integrations")
          .select("provider")
          .eq("profile_id", ctx.session.user.id)
          .eq("provider", "wahoo")
          .single();

        if (integration) {
          const syncService = new WahooSyncService(ctx.supabase);
          const result = await syncService.syncEvent(id, ctx.session.user.id);
          wahooSyncResult = { success: result.success, error: result.error };
        }
      } catch (error) {
        console.error("Failed to auto-sync update to Wahoo:", error);
        wahooSyncResult = {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unknown error during Wahoo sync",
        };
      }

      return {
        ...event,
        wahooSync: wahooSyncResult,
        insight_refresh_hint: buildInsightRefreshHint({
          trainingPlanId: event.training_plan_id,
          changedDate: event.scheduled_date,
          changeAt: event.updated_at,
        }),
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing } = await ctx.supabase
        .from("events")
        .select(plannedEventSelect)
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType)
        .single();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planned event not found",
        });
      }

      try {
        const { data: integration } = await ctx.supabase
          .from("integrations")
          .select("*")
          .eq("profile_id", ctx.session.user.id)
          .eq("provider", "wahoo")
          .single();

        if (integration) {
          const syncService = new WahooSyncService(ctx.supabase);
          await syncService.unsyncEvent(input.id, ctx.session.user.id);
        }
      } catch (error) {
        console.error("Failed to auto-unsync from Wahoo:", error);
      }

      const { error } = await ctx.supabase
        .from("events")
        .delete()
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType);

      if (error)
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      return {
        success: true,
        insight_refresh_hint: buildInsightRefreshHint({
          trainingPlanId: existing.training_plan_id,
          changedDate: toDateKey(existing.starts_at),
          changeAt: existing.updated_at,
        }),
      };
    }),

  list: protectedProcedure
    .input(eventListSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;

      let query = ctx.supabase
        .from("events")
        .select(plannedEventSelect)
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType)
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit + 1);

      if (input.cursor) {
        const [cursorDate, cursorId] = input.cursor.split("_");
        if (cursorDate && cursorId) {
          query = query.or(
            `starts_at.gt.${cursorDate},and(starts_at.eq.${cursorDate},id.gt.${cursorId})`,
          );
        }
      }

      if (input.training_plan_id) {
        query = query.eq("training_plan_id", input.training_plan_id);
      } else if (!input.include_adhoc) {
        query = query.not("training_plan_id", "is", null);
      }

      if (input.date_from)
        query = query.gte("starts_at", toDayStartIso(input.date_from));
      if (input.date_to)
        query = query.lt("starts_at", toNextDayStartIso(input.date_to));
      if (input.activity_category) {
        query = query.eq(
          "activity_plan.activity_category",
          input.activity_category,
        );
      }
      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = data ?? [];
      const hasMore = rows.length > limit;
      const events = mapEvents(
        (hasMore ? rows.slice(0, limit) : rows) as PlannedEventRecord[],
      );

      const validItems = events.filter(
        (
          item,
        ): item is typeof item & {
          activity_plan: NonNullable<typeof item.activity_plan>;
        } => item.activity_plan != null,
      );

      let itemsWithEstimation = validItems;
      if (validItems.length > 0) {
        const plansWithEstimation = await addEstimationToPlans(
          validItems.map((event) => event.activity_plan),
          ctx.supabase,
          ctx.session.user.id,
        );

        const plansMap = new Map(plansWithEstimation.map((p) => [p.id, p]));
        itemsWithEstimation = validItems.map((event) => ({
          ...event,
          activity_plan:
            plansMap.get(event.activity_plan.id) || event.activity_plan,
        }));
      }

      let nextCursor: string | undefined;
      if (hasMore && events.length > 0) {
        const lastItem = events[events.length - 1];
        if (!lastItem) throw new Error("Unexpected error");
        nextCursor = `${lastItem.scheduled_date}_${lastItem.id}`;
      }

      const itemsWithStatus = await addEventLifecycleStatus(
        itemsWithEstimation,
        {
          supabase: ctx.supabase,
          profileId: ctx.session.user.id,
        },
      );

      return {
        items: itemsWithStatus,
        nextCursor,
      };
    }),

  validateConstraints: protectedProcedure
    .input(validateConstraintsSchema)
    .query(async ({ ctx, input }) => {
      const { data: plan, error: planError } = await ctx.supabase
        .from("training_plans")
        .select("*")
        .eq("id", input.training_plan_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      const { data: activityPlan, error: activityPlanError } =
        await ctx.supabase
          .from("activity_plans")
          .select("*")
          .eq("id", input.activity_plan_id)
          .or(`profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`)
          .single();

      if (activityPlanError || !activityPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity plan not found",
        });
      }

      const structure = plan.structure as {
        target_weekly_tss_max?: number;
        target_activities_per_week?: number;
        max_consecutive_days?: number;
        min_rest_days_per_week?: number;
      };
      const scheduledDate = new Date(input.scheduled_date);

      const startOfWeek = new Date(scheduledDate);
      startOfWeek.setDate(scheduledDate.getDate() - scheduledDate.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const { data: plannedThisWeek } = await ctx.supabase
        .from("events")
        .select(plannedEventSelect)
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType)
        .gte("starts_at", startOfWeek.toISOString().split("T")[0] || "")
        .lt("starts_at", endOfWeek.toISOString().split("T")[0] || "");

      const plannedThisWeekMapped = mapEvents(
        plannedThisWeek as PlannedEventRecord[] | null,
      );

      const { data: profile } = await ctx.supabase
        .from("profiles")
        .select("*")
        .eq("id", ctx.session.user.id)
        .single();

      const cutoffDate = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data: best20m } = await ctx.supabase
        .from("activity_efforts")
        .select("value")
        .eq("profile_id", ctx.session.user.id)
        .eq("activity_category", "bike")
        .eq("effort_type", "power")
        .eq("duration_seconds", 1200)
        .gte("recorded_at", cutoffDate)
        .order("value", { ascending: false })
        .limit(1)
        .maybeSingle();

      const ftpValue = best20m?.value
        ? Math.round(best20m.value * 0.95)
        : undefined;

      const { data: lthrMetric } = await ctx.supabase
        .from("profile_metrics")
        .select("value")
        .eq("profile_id", ctx.session.user.id)
        .eq("metric_type", "lthr")
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lthrValue = lthrMetric?.value
        ? Number(lthrMetric.value)
        : undefined;

      const { data: weightMetric } = await ctx.supabase
        .from("profile_metrics")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("metric_type", "weight_kg")
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const userMetrics = {
        ftp: ftpValue,
        threshold_hr: lthrValue,
        weight_kg: weightMetric?.value,
        dob: profile?.dob,
      };

      const { estimateActivity, buildEstimationContext } =
        await import("@repo/core");

      const currentWeeklyTSS = plannedThisWeekMapped.reduce((sum, event) => {
        if (!event.activity_plan) return sum;
        const context = buildEstimationContext({
          userProfile: userMetrics,
          activityPlan: {
            ...event.activity_plan,
            route_id: event.activity_plan.route_id || undefined,
          },
        });
        const estimation = estimateActivity(context);
        return sum + estimation.tss;
      }, 0);

      const context = buildEstimationContext({
        userProfile: userMetrics,
        activityPlan: {
          ...activityPlan,
          route_id: activityPlan.route_id || undefined,
        },
      });
      const newActivityEstimation = estimateActivity(context);
      const newWeeklyTSS = currentWeeklyTSS + newActivityEstimation.tss;

      const maxWeeklyTSS = structure.target_weekly_tss_max || Infinity;
      const weeklyTSSStatus =
        newWeeklyTSS <= maxWeeklyTSS
          ? "satisfied"
          : newWeeklyTSS <= maxWeeklyTSS * 1.1
            ? "warning"
            : "violated";

      const currentActivitiesCount = plannedThisWeekMapped.length;
      const newActivitiesCount = currentActivitiesCount + 1;
      const targetActivitiesPerWeek = structure.target_activities_per_week || 7;
      const activitiesPerWeekStatus =
        newActivitiesCount <= targetActivitiesPerWeek
          ? "satisfied"
          : newActivitiesCount <= targetActivitiesPerWeek + 1
            ? "warning"
            : "violated";

      const threeDaysBefore = new Date(scheduledDate);
      threeDaysBefore.setDate(scheduledDate.getDate() - 3);
      const threeDaysAfter = new Date(scheduledDate);
      threeDaysAfter.setDate(scheduledDate.getDate() + 3);

      const { data: nearbyActivities } = await ctx.supabase
        .from("events")
        .select("starts_at")
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType)
        .gte("starts_at", threeDaysBefore.toISOString().split("T")[0] || "")
        .lte("starts_at", threeDaysAfter.toISOString().split("T")[0] || "")
        .order("starts_at", { ascending: true });

      const allDates = [
        ...(nearbyActivities || []).map((a) => toDateKey(a.starts_at)),
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

      const restDaysThisWeek = 7 - newActivitiesCount;
      const minRestDays = structure.min_rest_days_per_week || 0;
      const restDaysStatus =
        restDaysThisWeek >= minRestDays
          ? "satisfied"
          : restDaysThisWeek >= minRestDays - 1
            ? "warning"
            : "violated";

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
            current: maxConsecutive - 1,
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

  listByWeek: protectedProcedure
    .input(
      z.object({
        weekStart: z.string(),
        weekEnd: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("events")
        .select(plannedEventSelect)
        .eq("profile_id", ctx.session.user.id)
        .eq("event_type", plannedEventType)
        .gte("starts_at", toDayStartIso(input.weekStart))
        .lt("starts_at", toNextDayStartIso(input.weekEnd))
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const events = mapEvents(data as PlannedEventRecord[] | null);
      if (events.length > 0) {
        const plans = events
          .map((event) => event.activity_plan)
          .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

        const plansWithEstimation = await addEstimationToPlans(
          plans,
          ctx.supabase,
          ctx.session.user.id,
        );

        const plansMap = new Map(plansWithEstimation.map((p) => [p.id, p]));
        const itemsWithEstimation = events.map((event) => ({
          ...event,
          activity_plan: event.activity_plan
            ? plansMap.get(event.activity_plan.id)
            : null,
        }));

        const itemsWithStatus = await addEventLifecycleStatus(
          itemsWithEstimation,
          {
            supabase: ctx.supabase,
            profileId: ctx.session.user.id,
          },
        );

        return itemsWithStatus;
      }

      const itemsWithStatus = await addEventLifecycleStatus(events, {
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
      });

      return itemsWithStatus;
    }),
});
