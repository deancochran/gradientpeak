import {
  eventCreateSchema,
  eventMutationScopeSchema,
  eventTypeInputSchema,
  eventUpdateSchema,
  plannedActivityCreateSchema,
  plannedActivityUpdateSchema,
} from "@repo/core";
import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { WahooSyncService } from "../lib/integrations/wahoo/sync-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { addEstimationToPlan, addEstimationToPlans } from "../utils/estimation-helpers";

type EventLifecycleStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
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

type DbEventType = Database["public"]["Enums"]["event_type"];
type CoreEventType = z.infer<typeof eventTypeInputSchema>;
type EventMutationScope = z.infer<typeof eventMutationScopeSchema>;
type LegacyPlannedCreateInput = z.infer<typeof plannedActivityCreateSchema>;

const plannedEventType = "planned_activity" as const;

const eventTypeToDbMap: Record<CoreEventType, DbEventType> = {
  planned: "planned_activity",
  rest_day: "rest_day",
  race_target: "race",
  custom: "custom",
  imported: "imported",
};

const dbEventTypeToCoreMap: Record<DbEventType, CoreEventType> = {
  planned_activity: "planned",
  rest_day: "rest_day",
  race: "race_target",
  custom: "custom",
  imported: "imported",
};

function toDbEventType(eventType: CoreEventType): DbEventType {
  return eventTypeToDbMap[eventType];
}

function toCoreEventType(eventType: DbEventType): CoreEventType {
  return dbEventTypeToCoreMap[eventType];
}

const plannedEventSelect = `
  id,
  idx,
  profile_id,
  event_type,
  title,
  description,
  all_day,
  timezone,
  activity_plan_id,
  training_plan_id,
  recurrence_rule,
  recurrence_timezone,
  series_id,
  source_provider,
  occurrence_key,
  original_starts_at,
  notes,
  status,
  linked_activity_id,
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
  event_type: DbEventType;
  title: string;
  description: string | null;
  all_day: boolean;
  timezone: string;
  activity_plan_id: string | null;
  training_plan_id: string | null;
  recurrence_rule: string | null;
  recurrence_timezone: string | null;
  series_id: string | null;
  source_provider: string | null;
  occurrence_key: string;
  original_starts_at: string | null;
  notes: string | null;
  status: Database["public"]["Enums"]["event_status"];
  linked_activity_id: string | null;
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
const eventCreateInputSchema = z.custom<
  z.infer<typeof plannedActivityCreateSchema> | z.infer<typeof eventCreateSchema>
>();

const plannedActivityUpdateWithIdInputSchema = plannedActivityUpdateSchema
  .extend({
    id: z.string().uuid(),
    scope: eventMutationScopeSchema.optional(),
  })
  .strict();

const eventUpdateInputSchema = z.custom<
  z.infer<typeof plannedActivityUpdateWithIdInputSchema> | z.infer<typeof eventUpdateSchema>
>();

const eventDeleteInputSchema = z
  .object({
    id: z.string().uuid(),
    scope: eventMutationScopeSchema.default("single"),
  })
  .strict();

const eventLinkCompletionInputSchema = z
  .object({
    event_id: z.string().uuid(),
    activity_id: z.string().uuid(),
  })
  .strict();

const eventUnlinkCompletionInputSchema = z
  .object({
    event_id: z.string().uuid(),
  })
  .strict();

const reconcileHistoricalCompletionsInputSchema = z
  .object({
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(200),
    dry_run: z.boolean().default(true),
  })
  .strict();

const eventListSchema = z
  .object({
    event_types: z
      .array(z.enum(["rest_day", "custom", "imported", "planned", "race_target"]))
      .min(1)
      .optional(),
    activity_category: z.string().optional(),
    activity_plan_id: z.string().optional(),
    training_plan_id: z.string().uuid().optional(),
    include_adhoc: z.boolean().default(true),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    limit: z.number().min(1).max(500).default(20),
    cursor: z.string().optional(),
  })
  .strict();

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function toDateKey(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) return value;

  if (dateOnlyPattern.test(normalizedValue)) {
    return normalizedValue;
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    return normalizedValue.split("T")[0] || normalizedValue;
  }

  return parsed.toISOString().slice(0, 10);
}

function toCanonicalInstantIso(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid date format",
    });
  }

  return parsed.toISOString();
}

function toDayStartIso(dateValue: string): string {
  return `${toDateKey(dateValue)}T00:00:00.000Z`;
}

function toNextDayStartIso(dateValue: string): string {
  const day = new Date(toDayStartIso(dateValue));
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString();
}

function normalizeInstantForComparison(value: string): string {
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  return parsed.toISOString();
}

function hasInstantChanged(
  nextValue: string | null | undefined,
  currentValue: string | null,
): boolean {
  if (nextValue === undefined) return false;
  if (nextValue === null) return currentValue !== null;
  if (currentValue === null) return true;

  return normalizeInstantForComparison(nextValue) !== normalizeInstantForComparison(currentValue);
}

function mapEvent<T extends PlannedEventRecord>(
  event: T,
): Omit<T, "event_type"> & {
  scheduled_date: string;
  event_type: CoreEventType;
  legacy_event_type: DbEventType;
} {
  const legacyEventType = (event.event_type ?? plannedEventType) as DbEventType;

  return {
    ...event,
    event_type: toCoreEventType(legacyEventType),
    legacy_event_type: legacyEventType,
    scheduled_date: toDateKey(event.starts_at),
  };
}

function mapEvents<T extends PlannedEventRecord>(
  events: T[] | null,
): Array<
  Omit<T, "event_type"> & {
    scheduled_date: string;
    event_type: CoreEventType;
    legacy_event_type: DbEventType;
  }
> {
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

function buildCompletedSignature(dateKey: string, activityPlanId: string): string {
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

  const explicitlyCompleted =
    explicitStatus === "completed" ||
    hasTruthyRecordValue(event, ["completed_activity_id", "completed_at", "linked_activity_id"]);
  if (explicitlyCompleted) return "completed";

  const explicitlySkipped =
    explicitStatus === "skipped" || hasTruthyRecordValue(event, ["skipped_at", "is_skipped"]);
  if (explicitlySkipped) return "skipped";

  if (explicitStatus === "cancelled") return "cancelled";

  const explicitlyRescheduled =
    explicitStatus === "rescheduled" ||
    hasTruthyRecordValue(event, [
      "rescheduled_at",
      "rescheduled_from_date",
      "original_scheduled_date",
    ]);
  if (explicitlyRescheduled) return "rescheduled";

  const completedByMatch =
    statusContext.completedByDate.has(scheduledDateKey) &&
    (event.activity_plan_id
      ? statusContext.completedByDateAndPlan.has(
          buildCompletedSignature(scheduledDateKey, event.activity_plan_id),
        )
      : true);
  if (completedByMatch) return "completed";

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

  (completedActivities || []).forEach((activity: any) => {
    const dateKey = toDateKey(activity.started_at);
    completedByDate.add(dateKey);

    if (activity.activity_plan_id) {
      completedByDateAndPlan.add(buildCompletedSignature(dateKey, activity.activity_plan_id));
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
    refresh_key: [trainingPlanId || "adhoc", changedDate || "none", changeAt].join(":"),
  };
}

function defaultTitleForEventType(eventType: CoreEventType): string {
  switch (eventType) {
    case "planned":
      return "Planned Activity";
    case "rest_day":
      return "Rest Day";
    case "race_target":
      return "Race Target";
    case "custom":
      return "Custom Event";
    case "imported":
      return "Imported Event";
  }
}

function ensurePersistableRecurrence(
  recurrence:
    | {
        rule: string;
        timezone: string;
        exdates?: string[];
        exceptions?: unknown[];
      }
    | undefined,
): void {
  if (!recurrence) return;

  // TODO(events-router): Persist exdates/exceptions once event recurrence JSON
  // storage is available in the events table (currently only rule/timezone exist).
  if ((recurrence.exdates?.length ?? 0) > 0 || (recurrence.exceptions?.length ?? 0) > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Recurrence exdates/exceptions are not yet supported by persistence",
    });
  }
}

function toPersistableEventStatus(
  lifecycle:
    | {
        status: "scheduled" | "completed" | "cancelled" | "deleted";
      }
    | undefined,
): Database["public"]["Enums"]["event_status"] {
  const status = lifecycle?.status ?? "scheduled";

  if (status === "deleted") {
    // TODO(events-router): Switch to lifecycle metadata persistence when
    // deleted events are represented in the database layer.
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Deleted lifecycle status is not supported by persistence",
    });
  }

  return status;
}

function applyScopeFilters(
  query: any,
  existingEvent: PlannedEventRecord,
  scope: EventMutationScope,
): any {
  if (scope === "single") {
    return query.eq("id", existingEvent.id);
  }

  const seriesId = existingEvent.series_id;
  if (!seriesId) {
    // TODO(events-router): Support scope expansion directly from recurrence_rule
    // for non-materialized series. Current DB contract relies on series_id.
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Mutation scope \"${scope}\" requires an event series`,
    });
  }

  if (scope === "future") {
    return query.eq("series_id", seriesId).gte("starts_at", existingEvent.starts_at);
  }

  return query.eq("series_id", seriesId);
}

type ReconciliationEventCandidate = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  | "id"
  | "starts_at"
  | "activity_plan_id"
  | "training_plan_id"
  | "status"
  | "linked_activity_id"
  | "event_type"
>;

type ReconciliationActivityCandidate = Pick<
  Database["public"]["Tables"]["activities"]["Row"],
  "id" | "started_at" | "activity_plan_id"
>;

function compareActivitiesForReconciliation(
  a: ReconciliationActivityCandidate,
  b: ReconciliationActivityCandidate,
): number {
  const aMs = Date.parse(a.started_at);
  const bMs = Date.parse(b.started_at);

  if (!Number.isNaN(aMs) && !Number.isNaN(bMs) && aMs !== bMs) {
    return bMs - aMs;
  }

  if (a.started_at !== b.started_at) {
    return b.started_at.localeCompare(a.started_at);
  }

  return a.id.localeCompare(b.id);
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
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
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
    const tomorrow = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

    const { data, error } = await ctx.supabase
      .from("events")
      .select(plannedEventSelect)
      .eq("profile_id", ctx.session.user.id)
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

      const plansMap = new Map(plansWithEstimation.map((p: any) => [p.id, p]));
      return events.map((event) => ({
        ...event,
        activity_plan: event.activity_plan ? plansMap.get(event.activity_plan.id) : null,
      }));
    }

    return events;
  }),

  getWeekCount: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const startOfWeekUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    startOfWeekUtc.setUTCDate(startOfWeekUtc.getUTCDate() - utcDay);

    const endOfWeekUtc = new Date(startOfWeekUtc);
    endOfWeekUtc.setUTCDate(startOfWeekUtc.getUTCDate() + 7);

    const { count, error } = await ctx.supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", ctx.session.user.id)
      .gte("starts_at", startOfWeekUtc.toISOString())
      .lt("starts_at", endOfWeekUtc.toISOString());

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return count || 0;
  }),

  create: protectedProcedure.input(eventCreateInputSchema).mutation(async ({ ctx, input }) => {
    const legacyInput = "scheduled_date" in input ? (input as LegacyPlannedCreateInput) : null;
    const normalizedEventType: CoreEventType = (input.event_type ?? "planned") as CoreEventType;

    if (normalizedEventType === "imported") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Imported events are managed by integrations",
      });
    }

    const recurrence = input.recurrence;
    ensurePersistableRecurrence(recurrence);
    const status = toPersistableEventStatus(input.lifecycle);

    if (normalizedEventType === "rest_day" && input.activity_plan_id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: 'activity_plan_id must be omitted when event_type is "rest_day"',
      });
    }

    if (normalizedEventType === "planned" && !input.activity_plan_id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: 'activity_plan_id is required when event_type is "planned"',
      });
    }

    if (input.activity_plan_id) {
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
    }

    const trainingPlanId =
      "training_plan_id" in input ? (input.training_plan_id ?? null) : (null as string | null);

    if (trainingPlanId) {
      const { data: trainingPlan, error: trainingPlanError } = await ctx.supabase
        .from("training_plans")
        .select("id")
        .eq("id", trainingPlanId)
        .eq("profile_id", ctx.session.user.id)
        .maybeSingle();

      if (trainingPlanError || !trainingPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Training plan not found or not accessible",
        });
      }
    }

    const domainInput = input as z.infer<typeof eventCreateSchema>;

    const startsAt = legacyInput
      ? toDayStartIso(legacyInput.scheduled_date)
      : toCanonicalInstantIso(domainInput.starts_at);
    const endsAt = legacyInput
      ? toNextDayStartIso(legacyInput.scheduled_date)
      : typeof domainInput.ends_at === "string"
        ? toCanonicalInstantIso(domainInput.ends_at)
        : null;
    const title = "title" in input ? input.title : defaultTitleForEventType(normalizedEventType);
    const allDay = "all_day" in input ? input.all_day : true;
    const timezone = "timezone" in input ? input.timezone : "UTC";
    const description = "description" in input ? (input.description ?? null) : null;
    const sourceProvider = "source" in input ? (input.source?.provider ?? null) : null;

    const { data, error } = await ctx.supabase
      .from("events")
      .insert({
        profile_id: ctx.session.user.id,
        event_type: toDbEventType(normalizedEventType),
        title,
        all_day: allDay,
        timezone,
        starts_at: startsAt,
        ends_at: endsAt,
        status,
        activity_plan_id:
          normalizedEventType === "rest_day" ? null : (input.activity_plan_id ?? null),
        training_plan_id: trainingPlanId,
        notes: input.notes ?? null,
        description,
        recurrence_rule: recurrence?.rule ?? null,
        recurrence_timezone: recurrence?.timezone ?? null,
        source_provider: sourceProvider,
      } as any)
      .select(plannedEventSelect)
      .single();

    if (error || !data)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error?.message ?? "Failed to create event",
      });

    const event = mapEvent(data as PlannedEventRecord);

    let wahooSyncResult: { success: boolean; error?: string } | null = null;
    if (event.legacy_event_type === plannedEventType) {
      try {
        const { data: integration } = await ctx.supabase
          .from("integrations")
          .select("provider")
          .eq("profile_id", ctx.session.user.id)
          .eq("provider", "wahoo")
          .single();

        if (integration) {
          const syncService = new WahooSyncService(ctx.supabase);
          const result = await syncService.syncEvent(event.id, ctx.session.user.id);
          wahooSyncResult = { success: result.success, error: result.error };
        }
      } catch (error) {
        console.error("Failed to auto-sync to Wahoo:", error);
        wahooSyncResult = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error during Wahoo sync",
        };
      }
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

  update: protectedProcedure.input(eventUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const id = input.id;
    const scope = input.scope ?? "single";

    const { data: existing } = await ctx.supabase
      .from("events")
      .select(plannedEventSelect)
      .eq("id", id)
      .eq("profile_id", ctx.session.user.id)
      .single();

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Event not found",
      });
    }

    const existingEvent = existing as PlannedEventRecord;
    const existingEventType = toCoreEventType(existingEvent.event_type);

    if (existingEventType === "imported") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Imported events are read-only",
      });
    }

    const patch = "patch" in input ? input.patch : input;
    const patchAny = patch as any;
    const scheduledDate = "scheduled_date" in input ? input.scheduled_date : undefined;
    const targetEventType = (patchAny.event_type as CoreEventType | undefined) ?? existingEventType;
    const hasScheduledDateMove =
      scheduledDate !== undefined &&
      toDateKey(scheduledDate) !== toDateKey(existingEvent.starts_at);
    const hasStartsAtMove = hasInstantChanged(
      patchAny.starts_at as string | undefined,
      existingEvent.starts_at,
    );
    const hasEndsAtMove = hasInstantChanged(
      patchAny.ends_at as string | null | undefined,
      existingEvent.ends_at,
    );
    const isMoveRescheduleUpdate = hasScheduledDateMove || hasStartsAtMove || hasEndsAtMove;
    const isPlannedLikeEvent = existingEventType === "planned" || targetEventType === "planned";
    const hasCompletionLinkage =
      existingEvent.linked_activity_id !== null || existingEvent.status === "completed";

    ensurePersistableRecurrence(patchAny.recurrence);
    const nextActivityPlanId =
      patchAny.activity_plan_id !== undefined
        ? (patchAny.activity_plan_id as string | null)
        : existingEvent.activity_plan_id;

    if (targetEventType === "planned" && !nextActivityPlanId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: 'activity_plan_id is required when event_type is "planned"',
      });
    }

    if (targetEventType === "rest_day" && nextActivityPlanId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: 'activity_plan_id must be omitted when event_type is "rest_day"',
      });
    }

    if (typeof patchAny.activity_plan_id === "string") {
      const { data: activityPlan, error: planError } = await ctx.supabase
        .from("activity_plans")
        .select("*")
        .eq("id", patchAny.activity_plan_id)
        .or(`profile_id.eq.${ctx.session.user.id},is_system_template.eq.true`)
        .single();

      if (planError || !activityPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activity plan not found or not accessible",
        });
      }
    }

    if (typeof patchAny.training_plan_id === "string") {
      const { data: trainingPlan, error: trainingPlanError } = await ctx.supabase
        .from("training_plans")
        .select("id")
        .eq("id", patchAny.training_plan_id)
        .eq("profile_id", ctx.session.user.id)
        .maybeSingle();

      if (trainingPlanError || !trainingPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Training plan not found or not accessible",
        });
      }
    }

    const eventUpdates: Database["public"]["Tables"]["events"]["Update"] = {
      ...(patchAny.event_type !== undefined
        ? { event_type: toDbEventType(patchAny.event_type as CoreEventType) }
        : {}),
      ...(patchAny.activity_plan_id !== undefined
        ? { activity_plan_id: patchAny.activity_plan_id as string | null }
        : {}),
      ...(patchAny.notes !== undefined ? { notes: patchAny.notes as string | null } : {}),
      ...(patchAny.lifecycle !== undefined
        ? { status: toPersistableEventStatus(patchAny.lifecycle) }
        : {}),
      ...(patchAny.title !== undefined ? { title: patchAny.title as string } : {}),
      ...(patchAny.description !== undefined
        ? { description: patchAny.description as string | null }
        : {}),
      ...(patchAny.all_day !== undefined ? { all_day: patchAny.all_day as boolean } : {}),
      ...(patchAny.timezone !== undefined ? { timezone: patchAny.timezone as string } : {}),
      ...(patchAny.training_plan_id !== undefined
        ? { training_plan_id: patchAny.training_plan_id as string | null }
        : {}),
      ...(patchAny.starts_at !== undefined ? { starts_at: patchAny.starts_at as string } : {}),
      ...(patchAny.ends_at !== undefined ? { ends_at: patchAny.ends_at as string | null } : {}),
      ...(patchAny.recurrence !== undefined
        ? {
            recurrence_rule: patchAny.recurrence.rule as string,
            recurrence_timezone: patchAny.recurrence.timezone as string,
          }
        : {}),
    };

    if (scheduledDate !== undefined) {
      eventUpdates.starts_at = toDayStartIso(scheduledDate);
      eventUpdates.ends_at = toNextDayStartIso(scheduledDate);
    }

    const nextAllDay =
      patchAny.all_day !== undefined ? Boolean(patchAny.all_day) : existingEvent.all_day;

    if (
      nextAllDay &&
      patchAny.starts_at !== undefined &&
      patchAny.ends_at === undefined &&
      scheduledDate === undefined
    ) {
      eventUpdates.ends_at = toNextDayStartIso(toDateKey(patchAny.starts_at as string));
    }

    if (isMoveRescheduleUpdate && isPlannedLikeEvent && hasCompletionLinkage) {
      eventUpdates.linked_activity_id = null;

      if (existingEvent.status === "completed") {
        eventUpdates.status = "scheduled";
      }
    }

    if (targetEventType === "rest_day" && patchAny.activity_plan_id === undefined) {
      eventUpdates.activity_plan_id = null;
    }

    let updateQuery = ctx.supabase
      .from("events")
      .update(eventUpdates)
      .eq("profile_id", ctx.session.user.id);
    updateQuery = applyScopeFilters(updateQuery, existingEvent, scope);

    const { data, error } = await updateQuery.select(plannedEventSelect);

    if (error || !data)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error?.message ?? "Failed to update event",
      });

    const updatedRows = data as PlannedEventRecord[];
    if (updatedRows.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No matching events found for update scope",
      });
    }

    const representative = updatedRows.find((row) => row.id === id) ?? updatedRows[0];
    if (!representative) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No matching events found for update scope",
      });
    }
    const event = mapEvent(representative);

    let wahooSyncResult: { success: boolean; error?: string } | null = null;
    if (event.legacy_event_type === plannedEventType) {
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
          error: error instanceof Error ? error.message : "Unknown error during Wahoo sync",
        };
      }
    }

    return {
      ...event,
      wahooSync: wahooSyncResult,
      mutation_scope: scope,
      affected_count: updatedRows.length,
      affected_event_ids: updatedRows.map((row: any) => row.id),
      insight_refresh_hint: buildInsightRefreshHint({
        trainingPlanId: event.training_plan_id,
        changedDate: event.scheduled_date,
        changeAt: event.updated_at,
      }),
    };
  }),

  delete: protectedProcedure.input(eventDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const { data: existing } = await ctx.supabase
      .from("events")
      .select(plannedEventSelect)
      .eq("id", input.id)
      .eq("profile_id", ctx.session.user.id)
      .single();

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Event not found",
      });
    }

    const existingEvent = existing as PlannedEventRecord;
    const existingEventType = toCoreEventType(existingEvent.event_type);
    if (existingEventType === "imported") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Imported events are read-only",
      });
    }

    const scope = input.scope ?? "single";

    let scopedSelectQuery = ctx.supabase
      .from("events")
      .select(plannedEventSelect)
      .eq("profile_id", ctx.session.user.id);
    scopedSelectQuery = applyScopeFilters(scopedSelectQuery, existingEvent, scope);

    const { data: scopedRows, error: scopedRowsError } = await scopedSelectQuery;
    if (scopedRowsError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: scopedRowsError.message,
      });
    }
    const rowsToDelete = (scopedRows as PlannedEventRecord[] | null) ?? [];

    try {
      const { data: integration } = await ctx.supabase
        .from("integrations")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("provider", "wahoo")
        .single();

      if (integration) {
        const syncService = new WahooSyncService(ctx.supabase);
        for (const row of rowsToDelete) {
          if (row.event_type !== plannedEventType) continue;
          await syncService.unsyncEvent(row.id, ctx.session.user.id);
        }
      }
    } catch (error) {
      console.error("Failed to auto-unsync from Wahoo:", error);
    }

    let deleteQuery = ctx.supabase.from("events").delete().eq("profile_id", ctx.session.user.id);
    deleteQuery = applyScopeFilters(deleteQuery, existingEvent, scope);

    const { error } = await deleteQuery;

    if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

    return {
      success: true,
      mutation_scope: scope,
      affected_count: rowsToDelete.length,
      affected_event_ids: rowsToDelete.map((row: any) => row.id),
      insight_refresh_hint: buildInsightRefreshHint({
        trainingPlanId: existingEvent.training_plan_id,
        changedDate: toDateKey(existingEvent.starts_at),
        changeAt: existingEvent.updated_at,
      }),
    };
  }),

  linkCompletion: protectedProcedure
    .input(eventLinkCompletionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data: existingEventRow, error: existingEventError } = await ctx.supabase
        .from("events")
        .select(plannedEventSelect)
        .eq("id", input.event_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (existingEventError || !existingEventRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      const existingEvent = existingEventRow as PlannedEventRecord;
      const existingEventType = toCoreEventType(existingEvent.event_type);
      if (existingEventType === "imported") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Imported events are read-only",
        });
      }

      const { data: activity, error: activityError } = await ctx.supabase
        .from("activities")
        .select("id")
        .eq("id", input.activity_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (activityError || !activity) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Completed activity not found",
        });
      }

      const eventUpdates: Database["public"]["Tables"]["events"]["Update"] = {
        // TODO(events-router): Once dedicated completion lifecycle columns
        // (completed_activity_id/completed_at) are available in the events
        // table, migrate this canonical linkage to those fields.
        linked_activity_id: input.activity_id,
        status: "completed",
      };

      const { data: linkedEventRow, error: linkError } = await ctx.supabase
        .from("events")
        .update(eventUpdates)
        .eq("id", input.event_id)
        .eq("profile_id", ctx.session.user.id)
        .select(plannedEventSelect)
        .single();

      if (linkError || !linkedEventRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: linkError?.message ?? "Failed to link completed activity",
        });
      }

      const linkedEvent = mapEvent(linkedEventRow as PlannedEventRecord);

      return {
        ...linkedEvent,
        insight_refresh_hint: buildInsightRefreshHint({
          trainingPlanId: linkedEvent.training_plan_id,
          changedDate: linkedEvent.scheduled_date,
          changeAt: linkedEvent.updated_at,
        }),
      };
    }),

  unlinkCompletion: protectedProcedure
    .input(eventUnlinkCompletionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data: existingEventRow, error: existingEventError } = await ctx.supabase
        .from("events")
        .select(plannedEventSelect)
        .eq("id", input.event_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (existingEventError || !existingEventRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      const existingEvent = existingEventRow as PlannedEventRecord;
      const existingEventType = toCoreEventType(existingEvent.event_type);
      if (existingEventType === "imported") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Imported events are read-only",
        });
      }

      const eventUpdates: Database["public"]["Tables"]["events"]["Update"] = {
        linked_activity_id: null,
        status: existingEvent.status === "completed" ? "scheduled" : existingEvent.status,
      };

      const { data: unlinkedEventRow, error: unlinkError } = await ctx.supabase
        .from("events")
        .update(eventUpdates)
        .eq("id", input.event_id)
        .eq("profile_id", ctx.session.user.id)
        .select(plannedEventSelect)
        .single();

      if (unlinkError || !unlinkedEventRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: unlinkError?.message ?? "Failed to unlink completed activity",
        });
      }

      const unlinkedEvent = mapEvent(unlinkedEventRow as PlannedEventRecord);

      return {
        ...unlinkedEvent,
        insight_refresh_hint: buildInsightRefreshHint({
          trainingPlanId: unlinkedEvent.training_plan_id,
          changedDate: unlinkedEvent.scheduled_date,
          changeAt: unlinkedEvent.updated_at,
        }),
      };
    }),

  reconcileHistoricalCompletions: protectedProcedure
    .input(reconcileHistoricalCompletionsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const todayDateKey = toDateKey(now.toISOString());

      const defaultDateFrom = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      defaultDateFrom.setUTCDate(defaultDateFrom.getUTCDate() - 180);
      const defaultDateFromKey = defaultDateFrom.toISOString().slice(0, 10);

      const dateFrom = input.date_from ? toDateKey(input.date_from) : defaultDateFromKey;
      const dateTo = input.date_to ? toDateKey(input.date_to) : todayDateKey;

      const dateFromInclusiveIso = toDayStartIso(dateFrom);
      const userRequestedToExclusiveIso = toNextDayStartIso(dateTo);
      const historicalCutoffExclusiveIso = toDayStartIso(todayDateKey);
      const dateToExclusiveIso =
        userRequestedToExclusiveIso < historicalCutoffExclusiveIso
          ? userRequestedToExclusiveIso
          : historicalCutoffExclusiveIso;

      if (dateFromInclusiveIso >= dateToExclusiveIso) {
        return {
          dry_run: input.dry_run,
          window: {
            date_from: dateFrom,
            date_to: dateTo,
            applied_to_exclusive: dateToExclusiveIso,
          },
          counts: {
            scanned: 0,
            matched: 0,
            updated: 0,
            skipped: 0,
          },
          sample_ids: {
            matched_event_ids: [],
            matched_activity_ids: [],
            updated_event_ids: [],
            skipped_event_ids: [],
          },
          cache_tags: [],
          insight_refresh_hints: [],
        };
      }

      const { data: eventsToReconcile, error: eventsError } = await ctx.supabase
        .from("events")
        .select(
          "id, starts_at, activity_plan_id, training_plan_id, status, linked_activity_id, event_type",
        )
        .eq("profile_id", ctx.session.user.id)
        .in("event_type", [plannedEventType, "race"])
        .is("linked_activity_id", null)
        .neq("status", "cancelled")
        .gte("starts_at", dateFromInclusiveIso)
        .lt("starts_at", dateToExclusiveIso)
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(input.limit);

      if (eventsError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: eventsError.message,
        });
      }

      const scannedEvents = (eventsToReconcile as ReconciliationEventCandidate[] | null) ?? [];

      if (scannedEvents.length === 0) {
        return {
          dry_run: input.dry_run,
          window: {
            date_from: dateFrom,
            date_to: dateTo,
            applied_to_exclusive: dateToExclusiveIso,
          },
          counts: {
            scanned: 0,
            matched: 0,
            updated: 0,
            skipped: 0,
          },
          sample_ids: {
            matched_event_ids: [],
            matched_activity_ids: [],
            updated_event_ids: [],
            skipped_event_ids: [],
          },
          cache_tags: [],
          insight_refresh_hints: [],
        };
      }

      const { data: candidateActivities, error: activitiesError } = await ctx.supabase
        .from("activities")
        .select("id, started_at, activity_plan_id")
        .eq("profile_id", ctx.session.user.id)
        .gte("started_at", dateFromInclusiveIso)
        .lt("started_at", dateToExclusiveIso)
        .order("started_at", { ascending: false })
        .order("id", { ascending: true });

      if (activitiesError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: activitiesError.message,
        });
      }

      const activities = (candidateActivities as ReconciliationActivityCandidate[] | null) ?? [];

      const activitiesByDate = new Map<string, ReconciliationActivityCandidate[]>();
      const activitiesByDateAndPlan = new Map<string, ReconciliationActivityCandidate[]>();

      for (const activity of activities) {
        const dateKey = toDateKey(activity.started_at);

        const dateList = activitiesByDate.get(dateKey) ?? [];
        dateList.push(activity);
        activitiesByDate.set(dateKey, dateList);

        if (activity.activity_plan_id) {
          const planSignature = buildCompletedSignature(dateKey, activity.activity_plan_id);
          const byPlanList = activitiesByDateAndPlan.get(planSignature) ?? [];
          byPlanList.push(activity);
          activitiesByDateAndPlan.set(planSignature, byPlanList);
        }
      }

      for (const list of activitiesByDate.values()) {
        list.sort(compareActivitiesForReconciliation);
      }
      for (const list of activitiesByDateAndPlan.values()) {
        list.sort(compareActivitiesForReconciliation);
      }

      const usedActivityIds = new Set<string>();
      const matchedEventIds: string[] = [];
      const matchedActivityIds: string[] = [];
      const updatedEventIds: string[] = [];
      const skippedEventIds: string[] = [];
      const insightRefreshHints: InsightRefreshHint[] = [];

      for (const event of scannedEvents) {
        const dateKey = toDateKey(event.starts_at);
        const pool = event.activity_plan_id
          ? activitiesByDateAndPlan.get(buildCompletedSignature(dateKey, event.activity_plan_id))
          : activitiesByDate.get(dateKey);

        const candidate = pool?.find((activity) => !usedActivityIds.has(activity.id));

        if (!candidate) {
          skippedEventIds.push(event.id);
          continue;
        }

        matchedEventIds.push(event.id);
        matchedActivityIds.push(candidate.id);
        usedActivityIds.add(candidate.id);

        if (input.dry_run) {
          continue;
        }

        const { data: updatedEvent, error: updateError } = await ctx.supabase
          .from("events")
          .update({
            linked_activity_id: candidate.id,
            status: "completed",
          })
          .eq("id", event.id)
          .eq("profile_id", ctx.session.user.id)
          .is("linked_activity_id", null)
          .neq("status", "cancelled")
          .select("id, training_plan_id, starts_at, updated_at")
          .maybeSingle();

        if (updateError || !updatedEvent) {
          skippedEventIds.push(event.id);
          continue;
        }

        updatedEventIds.push(updatedEvent.id);
        insightRefreshHints.push(
          buildInsightRefreshHint({
            trainingPlanId: updatedEvent.training_plan_id,
            changedDate: toDateKey(updatedEvent.starts_at),
            changeAt: updatedEvent.updated_at,
          }),
        );
      }

      const uniqueInsightRefreshHints = Array.from(
        new Map(insightRefreshHints.map((hint) => [hint.refresh_key, hint])).values(),
      );

      return {
        dry_run: input.dry_run,
        window: {
          date_from: dateFrom,
          date_to: dateTo,
          applied_to_exclusive: dateToExclusiveIso,
        },
        counts: {
          scanned: scannedEvents.length,
          matched: matchedEventIds.length,
          updated: updatedEventIds.length,
          skipped: skippedEventIds.length,
        },
        sample_ids: {
          matched_event_ids: matchedEventIds.slice(0, 20),
          matched_activity_ids: matchedActivityIds.slice(0, 20),
          updated_event_ids: updatedEventIds.slice(0, 20),
          skipped_event_ids: skippedEventIds.slice(0, 20),
        },
        cache_tags:
          input.dry_run || updatedEventIds.length === 0
            ? []
            : ["events.list", "events.today", "events.weekCount", "events.byWeek"],
        insight_refresh_hints: uniqueInsightRefreshHints,
      };
    }),

  list: protectedProcedure.input(eventListSchema).query(async ({ ctx, input }) => {
    const limit = input.limit;

    let query = ctx.supabase
      .from("events")
      .select(plannedEventSelect)
      .eq("profile_id", ctx.session.user.id)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit + 1);

    if (input.event_types && input.event_types.length > 0) {
      const mappedTypes = [
        ...new Set(input.event_types.map((eventType) => toDbEventType(eventType))),
      ];
      query = query.in("event_type", mappedTypes);
    }

    if (input.cursor) {
      const [cursorDate, cursorId] = input.cursor.split("_");
      if (cursorDate && cursorId) {
        const cursorStartsAt = toCanonicalInstantIso(cursorDate);
        query = query.or(
          `starts_at.gt.${cursorStartsAt},and(starts_at.eq.${cursorStartsAt},id.gt.${cursorId})`,
        );
      }
    }

    if (input.training_plan_id) {
      query = query.eq("training_plan_id", input.training_plan_id);
    } else if (!input.include_adhoc) {
      query = query.not("training_plan_id", "is", null);
    }

    if (input.activity_plan_id) {
      query = query.eq("activity_plan_id", input.activity_plan_id);
    }

    if (input.date_from) query = query.gte("starts_at", toDayStartIso(input.date_from));
    if (input.date_to) query = query.lt("starts_at", toNextDayStartIso(input.date_to));
    if (input.activity_category) {
      query = query.eq("activity_plan.activity_category", input.activity_category);
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
    const events = mapEvents((hasMore ? rows.slice(0, limit) : rows) as PlannedEventRecord[]);

    const itemsWithPlans = events.filter(
      (
        item,
      ): item is typeof item & {
        activity_plan: NonNullable<typeof item.activity_plan>;
      } => item.activity_plan != null,
    );

    let itemsWithEstimation = events;
    if (itemsWithPlans.length > 0) {
      const plansWithEstimation = await addEstimationToPlans(
        itemsWithPlans.map((event) => event.activity_plan),
        ctx.supabase,
        ctx.session.user.id,
      );

      const plansMap = new Map(plansWithEstimation.map((p: any) => [p.id, p]));
      itemsWithEstimation = events.map((event) => ({
        ...event,
        activity_plan: event.activity_plan
          ? (plansMap.get(event.activity_plan.id) as unknown as typeof event.activity_plan) ||
            event.activity_plan
          : null,
      })) as typeof events;
    }

    let nextCursor: string | undefined;
    if (hasMore && events.length > 0) {
      const lastItem = events[events.length - 1];
      if (!lastItem) throw new Error("Unexpected error");
      nextCursor = `${toCanonicalInstantIso(lastItem.starts_at)}_${lastItem.id}`;
    }

    const itemsWithStatus = await addEventLifecycleStatus(itemsWithEstimation, {
      supabase: ctx.supabase,
      profileId: ctx.session.user.id,
    });

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

      const { data: activityPlan, error: activityPlanError } = await ctx.supabase
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

      const plannedThisWeekMapped = mapEvents(plannedThisWeek as PlannedEventRecord[] | null);

      const { data: profile } = await ctx.supabase
        .from("profiles")
        .select("*")
        .eq("id", ctx.session.user.id)
        .single();

      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
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

      const ftpValue = best20m?.value ? Math.round(best20m.value * 0.95) : undefined;

      const { data: lthrMetric } = await ctx.supabase
        .from("profile_metrics")
        .select("value")
        .eq("profile_id", ctx.session.user.id)
        .eq("metric_type", "lthr")
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lthrValue = lthrMetric?.value ? Number(lthrMetric.value) : undefined;

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

      const { estimateActivity, buildEstimationContext } = await import("@repo/core");

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
        ...(nearbyActivities || []).map((a: any) => toDateKey(a.starts_at)),
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
            status: activitiesPerWeekStatus as "satisfied" | "warning" | "violated",
            current: currentActivitiesCount,
            withNew: newActivitiesCount,
            limit: targetActivitiesPerWeek,
          },
          consecutiveDays: {
            status: consecutiveDaysStatus as "satisfied" | "warning" | "violated",
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

        const plansMap = new Map(plansWithEstimation.map((p: any) => [p.id, p]));
        const itemsWithEstimation = events.map((event) => ({
          ...event,
          activity_plan: event.activity_plan ? plansMap.get(event.activity_plan.id) : null,
        }));

        const itemsWithStatus = await addEventLifecycleStatus(itemsWithEstimation, {
          supabase: ctx.supabase,
          profileId: ctx.session.user.id,
        });

        return itemsWithStatus;
      }

      const itemsWithStatus = await addEventLifecycleStatus(events, {
        supabase: ctx.supabase,
        profileId: ctx.session.user.id,
      });

      return itemsWithStatus;
    }),
});
