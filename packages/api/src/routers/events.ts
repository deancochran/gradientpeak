import {
  editableEventPatchSchema,
  eventCreateSchema,
  eventMutationScopeSchema,
  eventTypeInputSchema,
  eventUpdateSchema,
  plannedActivityCreateSchema,
  plannedActivityUpdateSchema,
} from "@repo/core";
import type {
  ActivityRow,
  EventRow,
  PublicActivityCategory,
  PublicActivityPlansRow,
  PublicEffortType,
  PublicEventStatus,
  PublicEventType,
  PublicProfileMetricType,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getRequiredDb } from "../db";
import {
  createEventCompletionRepository,
  createEventReadRepository,
  createEventWriteRepository,
  createProviderSyncRepository,
  createWahooRepository,
} from "../infrastructure/repositories";
import { createWahooRouteStorage, WahooSyncService } from "../lib/integrations/wahoo/sync-service";
import { WahooSyncJobService } from "../lib/provider-sync/wahoo-job-service";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  getActivityPlanDerivedMetrics,
  getActivityPlansDerivedMetrics,
} from "../utils/activity-plan-derived-metrics";
import { loadProfileIdentityMap, type ProfileIdentity } from "../utils/profile-identity";

const storageService = getApiStorageService();

type EventLifecycleStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "skipped"
  | "rescheduled"
  | "expired";

function getWahooSyncService(ctx: any) {
  return new WahooSyncService({
    repository: createWahooRepository({ db: getRequiredDb(ctx) }),
    storage: createWahooRouteStorage({
      async downloadRouteGpx(filePath) {
        const { data, error } = await storageService.storage.from("routes").download(filePath);
        if (error || !data) return null;
        return data.text();
      },
    }),
  });
}

function getWahooSyncJobService(ctx: any) {
  return new WahooSyncJobService({
    providerSyncRepository: createProviderSyncRepository({ db: getRequiredDb(ctx) }),
    syncService: getWahooSyncService(ctx),
    wahooRepository: createWahooRepository({ db: getRequiredDb(ctx) }),
  });
}

type WahooQueueResult = {
  affectedCount: number;
  error?: string;
  jobId?: string | null;
  operation: "publish" | "unsync";
  queued: boolean;
  success: boolean;
};

async function enqueueWahooEventJobs(
  ctx: any,
  input: { eventIds: string[]; operation: "publish" | "unsync" },
): Promise<WahooQueueResult | null> {
  const eventIds = [...new Set(input.eventIds)];
  if (eventIds.length === 0) {
    return null;
  }

  const integration = await createWahooRepository({
    db: getRequiredDb(ctx),
  }).findWahooIntegrationByProfileId(ctx.session.user.id);

  if (!integration) {
    return null;
  }

  const jobService = getWahooSyncJobService(ctx);
  let firstJobId: string | null = null;
  let queued = false;

  for (const eventId of eventIds) {
    const result =
      input.operation === "publish"
        ? await jobService.enqueuePublishEvent({ eventId, profileId: ctx.session.user.id })
        : await jobService.enqueueUnsyncEvent({ eventId, profileId: ctx.session.user.id });

    if (!firstJobId) {
      firstJobId = result.jobId;
    }
    queued = queued || result.queued;
  }

  return {
    affectedCount: eventIds.length,
    jobId: firstJobId,
    operation: input.operation,
    queued,
    success: true,
  };
}

function getEventCompletionRepository(ctx: { session: { user: { id: string } } }) {
  return createEventCompletionRepository(getRequiredDb(ctx as any));
}

function getEventWriteRepository(ctx: { session: { user: { id: string } } }) {
  return createEventWriteRepository(getRequiredDb(ctx as any));
}

function getEventReadRepository(ctx: { session: { user: { id: string } } }) {
  return createEventReadRepository(getRequiredDb(ctx as any));
}

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

type DbEventType = PublicEventType;
type CoreEventType = z.infer<typeof eventTypeInputSchema>;
type EventMutationScope = z.infer<typeof eventMutationScopeSchema>;
type LegacyPlannedCreateInput = z.infer<typeof plannedActivityCreateSchema>;
type EventCreateInput = z.infer<typeof eventCreateSchema>;
type EventUpdateInput = z.infer<typeof eventUpdateSchema>;
type EventCreateMutationInput = LegacyPlannedCreateInput | EventCreateInput;

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

type PlannedEventRecord = Omit<
  Pick<
    EventRow,
    | "id"
    | "idx"
    | "profile_id"
    | "event_type"
    | "title"
    | "description"
    | "all_day"
    | "timezone"
    | "activity_plan_id"
    | "training_plan_id"
    | "recurrence_rule"
    | "recurrence_timezone"
    | "series_id"
    | "source_provider"
    | "occurrence_key"
    | "original_starts_at"
    | "notes"
    | "status"
    | "linked_activity_id"
    | "created_at"
    | "updated_at"
    | "starts_at"
    | "ends_at"
  >,
  "created_at" | "updated_at" | "starts_at" | "ends_at" | "original_starts_at"
> & {
  created_at: string;
  updated_at: string;
  starts_at: string;
  ends_at: string | null;
  original_starts_at: string | null;
  activity_plan: PublicActivityPlansRow[] | null;
};

type MappedEvent<T extends PlannedEventRecord = PlannedEventRecord> = Omit<
  T,
  "event_type" | "activity_plan"
> & {
  scheduled_date: string;
  event_type: CoreEventType;
  legacy_event_type: DbEventType;
  activity_plan:
    | (PublicActivityPlansRow & {
        owner?: ProfileIdentity | null;
        updated_at?: Date | string | null;
      })
    | null;
};

function flattenActivityPlanRelation(
  activityPlan: PlannedEventRecord["activity_plan"] | PublicActivityPlansRow | null | undefined,
): PublicActivityPlansRow | null {
  if (Array.isArray(activityPlan)) return activityPlan[0] ?? null;
  return activityPlan ?? null;
}

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
const eventCreateInputSchema = z.unknown().transform((value, ctx): EventCreateMutationInput => {
  const schema =
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "scheduled_date" in value
      ? plannedActivityCreateInputSchema
      : eventCreateSchema;

  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  ctx.addIssue({
    code: "custom",
    message: parsed.error.issues[0]?.message ?? "Invalid event create payload",
  });

  return z.NEVER;
});

const plannedActivityUpdateWithIdInputSchema = plannedActivityUpdateSchema
  .extend({
    id: z.string().uuid(),
    scope: eventMutationScopeSchema.optional(),
  })
  .strict();

type LegacyPlannedUpdateInput = z.infer<typeof plannedActivityUpdateWithIdInputSchema>;
type EventUpdatePatchInput = z.infer<typeof editableEventPatchSchema>;
type EventUpdateMutationInput = LegacyPlannedUpdateInput | EventUpdateInput;

const eventUpdateInputSchema = z.unknown().transform((value, ctx): EventUpdateMutationInput => {
  const schema =
    typeof value === "object" && value !== null && !Array.isArray(value) && "patch" in value
      ? eventUpdateSchema
      : plannedActivityUpdateWithIdInputSchema;

  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  ctx.addIssue({
    code: "custom",
    message: parsed.error.issues[0]?.message ?? "Invalid event update payload",
  });

  return z.NEVER;
});

function isLegacyPlannedCreateInput(
  input: EventCreateMutationInput,
): input is LegacyPlannedCreateInput {
  return "scheduled_date" in input;
}

function isLegacyPlannedUpdateInput(
  input: EventUpdateMutationInput,
): input is LegacyPlannedUpdateInput {
  return !("patch" in input);
}

type NormalizedEventUpdatePatch = {
  activity_plan_id?: string | null;
  training_plan_id?: string | null;
  notes?: string | null;
  event_type?: CoreEventType;
  recurrence?: EventUpdatePatchInput["recurrence"];
  lifecycle?: EventUpdatePatchInput["lifecycle"];
  title?: string;
  description?: string | null;
  all_day?: boolean;
  timezone?: string;
  starts_at?: string;
  ends_at?: string | null;
};

function normalizeEventUpdatePatch(input: EventUpdateMutationInput): {
  patch: NormalizedEventUpdatePatch;
  scheduledDate: string | undefined;
} {
  if (isLegacyPlannedUpdateInput(input)) {
    return {
      patch: {
        activity_plan_id: input.activity_plan_id,
        notes: input.notes,
        event_type: input.event_type,
        recurrence: input.recurrence,
        lifecycle: input.lifecycle,
      },
      scheduledDate: input.scheduled_date,
    };
  }

  return {
    patch: input.patch as NormalizedEventUpdatePatch,
    scheduledDate: undefined,
  };
}

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

function mapEvent<T extends PlannedEventRecord>(event: T): MappedEvent<T> {
  const legacyEventType = (event.event_type ?? plannedEventType) as DbEventType;
  const activityPlan = flattenActivityPlanRelation(
    event.activity_plan,
  ) as MappedEvent<T>["activity_plan"];

  return {
    ...event,
    activity_plan: activityPlan,
    event_type: toCoreEventType(legacyEventType),
    legacy_event_type: legacyEventType,
    scheduled_date: toDateKey(event.starts_at),
  };
}

function isLegacyRestDayEvent(
  event: Pick<PlannedEventRecord, "event_type"> | null | undefined,
): boolean {
  return (event?.event_type ?? plannedEventType) === "rest_day";
}

function mapEvents<T extends PlannedEventRecord>(events: T[] | null): Array<MappedEvent<T>> {
  return (events || [])
    .filter((event) => !isLegacyRestDayEvent(event))
    .map((event) => mapEvent(event));
}

async function enrichEventsWithActivityPlanIdentity<
  T extends {
    activity_plan: (PublicActivityPlansRow & { updated_at?: Date | string | null }) | null;
  },
>(db: any, events: T[]) {
  const profileIdentityMap = await loadProfileIdentityMap(
    db,
    events.map((event) => event.activity_plan?.profile_id ?? null),
  );

  return events.map((event) => ({
    ...event,
    activity_plan: event.activity_plan
      ? {
          ...event.activity_plan,
          owner: event.activity_plan.profile_id
            ? (profileIdentityMap.get(event.activity_plan.profile_id) ?? null)
            : null,
        }
      : null,
  })) as T[];
}

function assertRestDayWritesBlocked(eventType: CoreEventType, action: "create" | "update"): void {
  if (eventType !== "rest_day") return;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Cannot ${action} rest_day events; rest is inferred from dates without scheduled planned events`,
  });
}

async function listVisibleOwnedEvents(
  repository: ReturnType<typeof getEventReadRepository>,
  input: Parameters<ReturnType<typeof getEventReadRepository>["listOwnedEvents"]>[0],
): Promise<{ rows: PlannedEventRecord[]; hasMore: boolean }> {
  const requestedCount = input.limit;
  const visibleRows: PlannedEventRecord[] = [];
  let cursor = input.cursor;
  let hasMore = false;

  while (visibleRows.length < requestedCount + 1) {
    const batch = (await repository.listOwnedEvents({
      ...input,
      cursor,
      limit: requestedCount + 1,
    })) as PlannedEventRecord[] | null;

    const rawRows = batch ?? [];
    if (rawRows.length === 0) break;

    visibleRows.push(...rawRows.filter((row) => !isLegacyRestDayEvent(row)));

    const lastRawRow = rawRows[rawRows.length - 1];
    if (!lastRawRow) break;

    if (rawRows.length < requestedCount + 1) break;

    cursor = {
      startsAt: toCanonicalInstantIso(lastRawRow.starts_at),
      id: lastRawRow.id,
    };

    if (visibleRows.length > requestedCount) {
      hasMore = true;
      break;
    }
  }

  return {
    rows: visibleRows.slice(0, requestedCount + 1),
    hasMore: hasMore || visibleRows.length > requestedCount,
  };
}

async function countVisibleOwnedEventsInRange(
  repository: ReturnType<typeof getEventReadRepository>,
  input: Pick<
    Parameters<ReturnType<typeof getEventReadRepository>["listOwnedEvents"]>[0],
    "profileId" | "dateFrom" | "dateTo"
  >,
): Promise<number> {
  let cursor: { startsAt: string; id: string } | undefined;
  let count = 0;
  const pageSize = 500;

  while (true) {
    const batch = (await repository.listOwnedEvents({
      ...input,
      includeAdhoc: true,
      limit: pageSize,
      cursor,
    })) as PlannedEventRecord[] | null;

    const rows = batch ?? [];
    if (rows.length === 0) break;

    count += rows.filter((row) => !isLegacyRestDayEvent(row)).length;

    if (rows.length < pageSize) break;

    const lastRow = rows[rows.length - 1];
    if (!lastRow) break;

    cursor = {
      startsAt: toCanonicalInstantIso(lastRow.starts_at),
      id: lastRow.id,
    };
  }

  return count;
}

function countUniqueScheduledDates(events: Array<Pick<PlannedEventRecord, "starts_at">>): number {
  return new Set(events.map((event) => toDateKey(event.starts_at))).size;
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
  ctx: { repository: ReturnType<typeof createEventReadRepository>; profileId: string },
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

  const completedActivities = await ctx.repository.listCompletedActivitiesInRange({
    profileId: ctx.profileId,
    startedAtGte: minDateKey,
    startedAtLt: maxDateExclusive,
  });

  const completedByDate = new Set<string>();
  const completedByDateAndPlan = new Set<string>();

  completedActivities.forEach((activity: any) => {
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
): PublicEventStatus {
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
  EventRow,
  "id" | "activity_plan_id" | "training_plan_id" | "status" | "linked_activity_id"
> & {
  starts_at: string;
  event_type: DbEventType;
};

type ReconciliationActivityCandidate = Pick<ActivityRow, "id" | "activity_plan_id"> & {
  started_at: string;
};

function compareActivitiesForReconciliation(
  a: ReconciliationActivityCandidate,
  b: ReconciliationActivityCandidate,
): number {
  const aStartedAt = typeof a.started_at == "string" ? a.started_at : "";
  const bStartedAt = typeof b.started_at == "string" ? b.started_at : "";
  const aId = typeof a.id == "string" ? a.id : "";
  const bId = typeof b.id == "string" ? b.id : "";
  const aMs = Date.parse(aStartedAt);
  const bMs = Date.parse(bStartedAt);

  if (!Number.isNaN(aMs) && !Number.isNaN(bMs) && aMs !== bMs) {
    return bMs - aMs;
  }

  if (aStartedAt !== bStartedAt) {
    return bStartedAt.localeCompare(aStartedAt);
  }

  return aId.localeCompare(bId);
}

export const eventsRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const eventReadRepository = getEventReadRepository(ctx);
      const data = await eventReadRepository.getOwnedEventById({
        eventId: input.id,
        profileId: ctx.session.user.id,
      });

      if (!data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      if (isLegacyRestDayEvent(data as PlannedEventRecord)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      const event = mapEvent(data as PlannedEventRecord);

      if (event.activity_plan) {
        const planWithEstimation = await getActivityPlanDerivedMetrics(
          event.activity_plan,
          getRequiredDb(ctx),
          eventReadRepository,
          ctx.session.user.id,
        );
        const [eventWithOwner] = await enrichEventsWithActivityPlanIdentity(getRequiredDb(ctx), [
          {
            ...event,
            activity_plan: planWithEstimation,
          } as typeof event,
        ]);
        return (
          eventWithOwner ?? {
            ...event,
            activity_plan: planWithEstimation,
          }
        );
      }

      return event;
    }),

  getToday: protectedProcedure.query(async ({ ctx }) => {
    const eventReadRepository = getEventReadRepository(ctx);
    const today = toDateKey(new Date().toISOString());
    const tomorrow = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

    const data = await eventReadRepository.listOwnedEvents({
      profileId: ctx.session.user.id,
      dateFrom: toDayStartIso(today),
      dateTo: toDayStartIso(tomorrow),
      includeAdhoc: true,
      limit: 500,
    });

    const events = mapEvents(data as PlannedEventRecord[] | null);

    if (events.length > 0) {
      const plans = events
        .map((event) => event.activity_plan)
        .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

      const plansWithEstimation = await getActivityPlansDerivedMetrics(
        plans,
        getRequiredDb(ctx),
        eventReadRepository,
        ctx.session.user.id,
      );

      const plansMap = new Map(plansWithEstimation.map((p: any) => [p.id, p]));
      return (await enrichEventsWithActivityPlanIdentity(
        getRequiredDb(ctx),
        events.map((event) => ({
          ...event,
          activity_plan: event.activity_plan ? plansMap.get(event.activity_plan.id) : null,
        })) as typeof events,
      )) as typeof events;
    }

    return events;
  }),

  getWeekCount: protectedProcedure.query(async ({ ctx }) => {
    const eventReadRepository = getEventReadRepository(ctx);
    const now = new Date();
    const utcDay = now.getUTCDay();
    const startOfWeekUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    startOfWeekUtc.setUTCDate(startOfWeekUtc.getUTCDate() - utcDay);

    const endOfWeekUtc = new Date(startOfWeekUtc);
    endOfWeekUtc.setUTCDate(startOfWeekUtc.getUTCDate() + 7);

    return countVisibleOwnedEventsInRange(eventReadRepository, {
      profileId: ctx.session.user.id,
      dateFrom: startOfWeekUtc.toISOString(),
      dateTo: endOfWeekUtc.toISOString(),
    });
  }),

  create: protectedProcedure.input(eventCreateInputSchema).mutation(async ({ ctx, input }) => {
    const eventWriteRepository = getEventWriteRepository(ctx);
    const legacyInput = isLegacyPlannedCreateInput(input) ? input : null;
    const normalizedEventType: CoreEventType = input.event_type ?? "planned";

    assertRestDayWritesBlocked(normalizedEventType, "create");

    if (normalizedEventType === "imported") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Imported events are managed by integrations",
      });
    }

    const recurrence = input.recurrence;
    ensurePersistableRecurrence(recurrence);
    const status = toPersistableEventStatus(input.lifecycle);

    if (normalizedEventType === "planned" && !input.activity_plan_id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: 'activity_plan_id is required when event_type is "planned"',
      });
    }

    if (input.activity_plan_id) {
      const activityPlan = await eventWriteRepository.getAccessibleActivityPlan({
        activityPlanId: input.activity_plan_id,
        profileId: ctx.session.user.id,
      });

      if (!activityPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activity plan not found or not accessible",
        });
      }
    }

    const trainingPlanId =
      "training_plan_id" in input ? (input.training_plan_id ?? null) : (null as string | null);

    if (trainingPlanId) {
      const trainingPlan = await eventWriteRepository.getOwnedTrainingPlan({
        profileId: ctx.session.user.id,
        trainingPlanId,
      });

      if (!trainingPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Training plan not found or not accessible",
        });
      }
    }

    let startsAt: string;
    let endsAt: string | null;

    if (legacyInput) {
      startsAt = toDayStartIso(legacyInput.scheduled_date);
      endsAt = toNextDayStartIso(legacyInput.scheduled_date);
    } else {
      const domainInput = input as EventCreateInput;
      startsAt = toCanonicalInstantIso(domainInput.starts_at);
      endsAt =
        typeof domainInput.ends_at === "string" ? toCanonicalInstantIso(domainInput.ends_at) : null;
    }
    const title = "title" in input ? input.title : defaultTitleForEventType(normalizedEventType);
    const allDay = "all_day" in input ? input.all_day : true;
    const timezone = "timezone" in input ? input.timezone : "UTC";
    const description = "description" in input ? (input.description ?? null) : null;
    const sourceProvider = "source" in input ? (input.source?.provider ?? null) : null;

    let data;
    try {
      data = await eventWriteRepository.createOwnedEvent({
        profileId: ctx.session.user.id,
        eventType: toDbEventType(normalizedEventType),
        title,
        allDay,
        timezone,
        startsAt,
        endsAt,
        status,
        activityPlanId: input.activity_plan_id ?? null,
        trainingPlanId,
        notes: input.notes ?? null,
        description,
        recurrenceRule: recurrence?.rule ?? null,
        recurrenceTimezone: recurrence?.timezone ?? null,
        sourceProvider,
      });
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Failed to create event",
      });
    }

    const event = mapEvent(data as PlannedEventRecord);

    let wahooSyncResult: WahooQueueResult | null = null;
    if (event.legacy_event_type === plannedEventType) {
      try {
        wahooSyncResult = await enqueueWahooEventJobs(ctx, {
          eventIds: [event.id],
          operation: "publish",
        });
      } catch (error) {
        console.error("Failed to enqueue Wahoo sync:", error);
        wahooSyncResult = {
          affectedCount: 1,
          operation: "publish",
          queued: false,
          success: false,
          error:
            error instanceof Error ? error.message : "Unknown error during Wahoo sync queueing",
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
    const eventWriteRepository = getEventWriteRepository(ctx);
    const completionRepository = getEventCompletionRepository(ctx);

    const existing = await completionRepository.getOwnedEventForCompletion({
      eventId: id,
      profileId: ctx.session.user.id,
    });

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Event not found",
      });
    }

    const existingEvent = existing as PlannedEventRecord;
    const existingEventType = toCoreEventType(existingEvent.event_type);

    assertRestDayWritesBlocked(existingEventType, "update");

    if (existingEventType === "imported") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Imported events are read-only",
      });
    }

    const { patch, scheduledDate } = normalizeEventUpdatePatch(input);
    const targetEventType = patch.event_type ?? existingEventType;

    assertRestDayWritesBlocked(targetEventType, "update");

    const hasScheduledDateMove =
      scheduledDate !== undefined &&
      toDateKey(scheduledDate) !== toDateKey(existingEvent.starts_at);
    const hasStartsAtMove = hasInstantChanged(patch.starts_at, existingEvent.starts_at);
    const hasEndsAtMove = hasInstantChanged(patch.ends_at, existingEvent.ends_at);
    const isMoveRescheduleUpdate = hasScheduledDateMove || hasStartsAtMove || hasEndsAtMove;
    const isPlannedLikeEvent = existingEventType === "planned" || targetEventType === "planned";
    const hasCompletionLinkage =
      existingEvent.linked_activity_id !== null || existingEvent.status === "completed";

    ensurePersistableRecurrence(patch.recurrence);
    const nextActivityPlanId =
      patch.activity_plan_id !== undefined
        ? patch.activity_plan_id
        : existingEvent.activity_plan_id;

    if (targetEventType === "planned" && !nextActivityPlanId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: 'activity_plan_id is required when event_type is "planned"',
      });
    }

    if (typeof patch.activity_plan_id === "string") {
      const activityPlan = await eventWriteRepository.getAccessibleActivityPlan({
        activityPlanId: patch.activity_plan_id,
        profileId: ctx.session.user.id,
      });

      if (!activityPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activity plan not found or not accessible",
        });
      }
    }

    if (typeof patch.training_plan_id === "string") {
      const trainingPlan = await eventWriteRepository.getOwnedTrainingPlan({
        profileId: ctx.session.user.id,
        trainingPlanId: patch.training_plan_id,
      });

      if (!trainingPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Training plan not found or not accessible",
        });
      }
    }

    const eventUpdates: Record<string, unknown> = {
      ...(patch.event_type !== undefined ? { event_type: toDbEventType(patch.event_type) } : {}),
      ...(patch.activity_plan_id !== undefined ? { activity_plan_id: patch.activity_plan_id } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.lifecycle !== undefined
        ? { status: toPersistableEventStatus(patch.lifecycle) }
        : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.all_day !== undefined ? { all_day: patch.all_day } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.training_plan_id !== undefined ? { training_plan_id: patch.training_plan_id } : {}),
      ...(patch.starts_at !== undefined ? { starts_at: patch.starts_at } : {}),
      ...(patch.ends_at !== undefined ? { ends_at: patch.ends_at } : {}),
      ...(patch.recurrence !== undefined
        ? {
            recurrence_rule: patch.recurrence.rule,
            recurrence_timezone: patch.recurrence.timezone,
          }
        : {}),
    };

    if (scheduledDate !== undefined) {
      eventUpdates.starts_at = toDayStartIso(scheduledDate);
      eventUpdates.ends_at = toNextDayStartIso(scheduledDate);
    }

    const nextAllDay = patch.all_day !== undefined ? Boolean(patch.all_day) : existingEvent.all_day;

    if (
      nextAllDay &&
      patch.starts_at !== undefined &&
      patch.ends_at === undefined &&
      scheduledDate === undefined
    ) {
      eventUpdates.ends_at = toNextDayStartIso(toDateKey(patch.starts_at));
    }

    if (isMoveRescheduleUpdate && isPlannedLikeEvent && hasCompletionLinkage) {
      eventUpdates.linked_activity_id = null;

      if (existingEvent.status === "completed") {
        eventUpdates.status = "scheduled";
      }
    }

    let updatedRows;
    try {
      updatedRows = (await eventWriteRepository.updateOwnedEventsForScope({
        anchorEvent: existingEvent,
        eventUpdates,
        profileId: ctx.session.user.id,
        scope,
      })) as PlannedEventRecord[];
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Failed to update event",
      });
    }

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

    let wahooSyncResult: WahooQueueResult | null = null;
    const updatedPlannedEventIds = updatedRows
      .filter((row) => row.event_type === plannedEventType)
      .map((row) => row.id);
    const removedPlannedEventIds =
      existingEvent.event_type === plannedEventType && event.legacy_event_type !== plannedEventType
        ? updatedRows.map((row) => row.id)
        : [];

    if (updatedPlannedEventIds.length > 0 || removedPlannedEventIds.length > 0) {
      try {
        wahooSyncResult =
          updatedPlannedEventIds.length > 0
            ? await enqueueWahooEventJobs(ctx, {
                eventIds: updatedPlannedEventIds,
                operation: "publish",
              })
            : await enqueueWahooEventJobs(ctx, {
                eventIds: removedPlannedEventIds,
                operation: "unsync",
              });
      } catch (error) {
        console.error("Failed to enqueue Wahoo update jobs:", error);
        wahooSyncResult = {
          affectedCount: updatedPlannedEventIds.length || removedPlannedEventIds.length,
          operation: updatedPlannedEventIds.length > 0 ? "publish" : "unsync",
          queued: false,
          success: false,
          error:
            error instanceof Error ? error.message : "Unknown error during Wahoo sync queueing",
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
    const completionRepository = getEventCompletionRepository(ctx);
    const existing = await completionRepository.getOwnedEventForCompletion({
      eventId: input.id,
      profileId: ctx.session.user.id,
    });

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

    let rowsToDelete;
    try {
      rowsToDelete = await completionRepository.listOwnedEventsForDeleteScope({
        anchorEvent: existingEvent,
        profileId: ctx.session.user.id,
        scope,
      });
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Failed to scope events for delete",
      });
    }

    try {
      const plannedEventIds = rowsToDelete
        .filter((row) => row.event_type === plannedEventType)
        .map((row) => row.id);

      if (plannedEventIds.length > 0) {
        await enqueueWahooEventJobs(ctx, {
          eventIds: plannedEventIds,
          operation: "unsync",
        });
      }
    } catch (error) {
      console.error("Failed to enqueue Wahoo unsync jobs:", error);
    }

    try {
      await completionRepository.deleteOwnedEventsForScope({
        anchorEvent: existingEvent,
        profileId: ctx.session.user.id,
        scope,
      });
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Failed to delete events",
      });
    }

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
      const completionRepository = getEventCompletionRepository(ctx);
      const existingEventRow = await completionRepository.getOwnedEventForCompletion({
        eventId: input.event_id,
        profileId: ctx.session.user.id,
      });

      if (!existingEventRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      const existingEvent = existingEventRow as PlannedEventRecord;
      const existingEventType = toCoreEventType(existingEvent.event_type);

      assertRestDayWritesBlocked(existingEventType, "update");

      if (existingEventType === "imported") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Imported events are read-only",
        });
      }

      const activity = await completionRepository.getOwnedActivityForCompletion({
        activityId: input.activity_id,
        profileId: ctx.session.user.id,
      });

      if (!activity) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Completed activity not found",
        });
      }

      const eventUpdates: Record<string, unknown> = {
        // TODO(events-router): Once dedicated completion lifecycle columns
        // (completed_activity_id/completed_at) are available in the events
        // table, migrate this canonical linkage to those fields.
        linked_activity_id: input.activity_id,
        status: "completed",
      };

      const linkedEventRow = await completionRepository.updateEventCompletionLink({
        eventId: input.event_id,
        profileId: ctx.session.user.id,
        linkedActivityId: input.activity_id,
        status: "completed",
      });

      if (!linkedEventRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to link completed activity",
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
      const completionRepository = getEventCompletionRepository(ctx);
      const existingEventRow = await completionRepository.getOwnedEventForCompletion({
        eventId: input.event_id,
        profileId: ctx.session.user.id,
      });

      if (!existingEventRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      const existingEvent = existingEventRow as PlannedEventRecord;
      const existingEventType = toCoreEventType(existingEvent.event_type);

      assertRestDayWritesBlocked(existingEventType, "update");

      if (existingEventType === "imported") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Imported events are read-only",
        });
      }

      const eventUpdates: Record<string, unknown> = {
        linked_activity_id: null,
        status: existingEvent.status === "completed" ? "scheduled" : existingEvent.status,
      };

      const unlinkedEventRow = await completionRepository.updateEventCompletionLink({
        eventId: input.event_id,
        profileId: ctx.session.user.id,
        linkedActivityId: null,
        status: eventUpdates.status as PublicEventStatus,
      });

      if (!unlinkedEventRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to unlink completed activity",
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
      const completionRepository = getEventCompletionRepository(ctx);
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

      const scannedEvents = await completionRepository.listHistoricalEventsForReconciliation({
        profileId: ctx.session.user.id,
        dateFromInclusiveIso,
        dateToExclusiveIso,
        limit: input.limit,
      });

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

      const activities = await completionRepository.listHistoricalActivitiesForReconciliation({
        profileId: ctx.session.user.id,
        dateFromInclusiveIso,
        dateToExclusiveIso,
      });

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

        const updatedEvent = await completionRepository.linkHistoricalCompletionIfEligible({
          activityId: candidate.id,
          eventId: event.id,
          profileId: ctx.session.user.id,
        });

        if (!updatedEvent) {
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
    const eventReadRepository = getEventReadRepository(ctx);
    const limit = input.limit;
    const [cursorDate, cursorId] = input.cursor ? input.cursor.split("_") : [];

    if (input.event_types?.every((eventType) => eventType === "rest_day")) {
      return {
        items: [],
        nextCursor: undefined,
      };
    }

    const { rows, hasMore } = await listVisibleOwnedEvents(eventReadRepository, {
      profileId: ctx.session.user.id,
      limit,
      includeAdhoc: input.include_adhoc,
      trainingPlanId: input.training_plan_id,
      activityPlanId: input.activity_plan_id,
      activityCategory: input.activity_category as
        | "run"
        | "bike"
        | "swim"
        | "strength"
        | "other"
        | undefined,
      dateFrom: input.date_from ? toDayStartIso(input.date_from) : undefined,
      dateTo: input.date_to ? toNextDayStartIso(input.date_to) : undefined,
      eventTypes:
        input.event_types && input.event_types.length > 0
          ? [...new Set(input.event_types.map((eventType) => toDbEventType(eventType)))]
          : undefined,
      cursor:
        cursorDate && cursorId
          ? { startsAt: toCanonicalInstantIso(cursorDate), id: cursorId }
          : undefined,
    });

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
      const plansWithEstimation = await getActivityPlansDerivedMetrics(
        itemsWithPlans.map((event) => event.activity_plan),
        getRequiredDb(ctx),
        eventReadRepository,
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

    itemsWithEstimation = (await enrichEventsWithActivityPlanIdentity(
      getRequiredDb(ctx),
      itemsWithEstimation as typeof itemsWithEstimation,
    )) as typeof itemsWithEstimation;

    let nextCursor: string | undefined;
    if (hasMore && events.length > 0) {
      const lastItem = events[events.length - 1];
      if (!lastItem) throw new Error("Unexpected error");
      nextCursor = `${toCanonicalInstantIso(lastItem.starts_at)}_${lastItem.id}`;
    }

    const itemsWithStatus = await addEventLifecycleStatus(itemsWithEstimation, {
      repository: eventReadRepository,
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
      const eventReadRepository = getEventReadRepository(ctx);
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const validateInputs = await eventReadRepository.getValidateConstraintsInputs({
        profileId: ctx.session.user.id,
        trainingPlanId: input.training_plan_id,
        activityPlanId: input.activity_plan_id,
        effortCutoffIso: cutoffDate,
      });

      if (!validateInputs.trainingPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training plan not found",
        });
      }

      if (!validateInputs.activityPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity plan not found",
        });
      }

      const plan = validateInputs.trainingPlan;
      const activityPlan = validateInputs.activityPlan;

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

      const plannedThisWeek = await eventReadRepository.listOwnedEvents({
        profileId: ctx.session.user.id,
        eventTypes: [plannedEventType],
        includeAdhoc: true,
        dateFrom: startOfWeek.toISOString().split("T")[0] || "",
        dateTo: endOfWeek.toISOString().split("T")[0] || "",
        limit: 500,
      });

      const plannedThisWeekMapped = mapEvents(plannedThisWeek as PlannedEventRecord[] | null);

      const ftpValue = validateInputs.best20mPower?.value
        ? Math.round(validateInputs.best20mPower.value * 0.95)
        : undefined;

      const lthrValue = validateInputs.lthrMetric?.value
        ? Number(validateInputs.lthrMetric.value)
        : undefined;

      const userMetrics = {
        ftp: ftpValue,
        threshold_hr: lthrValue,
        weight_kg: validateInputs.weightMetric?.value
          ? Number(validateInputs.weightMetric.value)
          : undefined,
        dob: validateInputs.profile?.dob,
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

      const nearbyActivities = await eventReadRepository.listPlannedEventDatesInRange({
        profileId: ctx.session.user.id,
        startsAtGte: threeDaysBefore.toISOString().split("T")[0] || "",
        startsAtLte: threeDaysAfter.toISOString().split("T")[0] || "",
      });

      const allDates = [
        ...nearbyActivities.map((a: any) => toDateKey(a.starts_at)),
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

      const currentPlannedDayCount = countUniqueScheduledDates(plannedThisWeekMapped);
      const nextPlannedDayCount = new Set([
        ...plannedThisWeekMapped.map((event) => toDateKey(event.starts_at)),
        input.scheduled_date,
      ]).size;
      const restDaysThisWeek = 7 - nextPlannedDayCount;
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
            current: 7 - currentPlannedDayCount,
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
      const eventReadRepository = getEventReadRepository(ctx);
      const data = await eventReadRepository.listOwnedEvents({
        profileId: ctx.session.user.id,
        dateFrom: toDayStartIso(input.weekStart),
        dateTo: toNextDayStartIso(input.weekEnd),
        includeAdhoc: true,
        limit: 500,
      });

      const events = mapEvents(data as PlannedEventRecord[] | null);
      if (events.length > 0) {
        const plans = events
          .map((event) => event.activity_plan)
          .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

        const plansWithEstimation = await getActivityPlansDerivedMetrics(
          plans,
          getRequiredDb(ctx),
          eventReadRepository,
          ctx.session.user.id,
        );

        const plansMap = new Map(plansWithEstimation.map((p: any) => [p.id, p]));
        const itemsWithEstimation = events.map((event) => ({
          ...event,
          activity_plan: event.activity_plan ? plansMap.get(event.activity_plan.id) : null,
        }));

        const itemsWithStatus = await addEventLifecycleStatus(itemsWithEstimation, {
          repository: eventReadRepository,
          profileId: ctx.session.user.id,
        });

        return itemsWithStatus;
      }

      const itemsWithStatus = await addEventLifecycleStatus(events, {
        repository: eventReadRepository,
        profileId: ctx.session.user.id,
      });

      return itemsWithStatus;
    }),
});
