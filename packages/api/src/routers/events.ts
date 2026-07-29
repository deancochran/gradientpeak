import {
  activityPlanStructureSchemaV3,
  addDaysDateOnlyUtc,
  type EventLifecycle,
  type EventRecurrence,
  eventCreateSchema,
  eventMutationScopeSchema,
  type eventTypeInputSchema,
  eventUpdateSchema,
  formatDateOnlyInTimeZone,
  getScheduledDateKey,
  ianaTimezoneSchema,
  materializeRecurrenceOccurrences,
  parseDateOnlyUtc,
  scheduledDateTimeToIsoInstant,
} from "@repo/core";
import type {
  ActivityRow,
  EventRow,
  PublicActivityPlansRow,
  PublicEventStatus,
  PublicEventType,
} from "@repo/db";
import { schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  createEventUseCase,
  deleteEventUseCase,
  enqueueProviderPlannedActivityJobs,
  listVisibleOwnedEvents,
  MAX_PLANNED_DAY_SUMMARY_EVENTS,
  PlannedDaySummaryLimitExceededError,
  plannedDaySummaryUseCase,
  updateEventUseCase,
} from "../application/events";
import type { Context } from "../context";
import { type DrizzleTransactionClient, getRequiredDb } from "../db";
import {
  type ActivityPlanExecutionDto,
  hasActivityPlanExecutionDto,
  InvalidStoredActivityPlanError,
  toActivityPlanExecutionDto,
} from "../dto/activity-plan";
import {
  createEventCompletionRepository,
  createEventReadRepository,
  createEventWriteRepository,
} from "../infrastructure/repositories";
import { getEventPlannedActivityProviderStatuses } from "../lib/provider-sync/planned-activities";
import { createContentAccessPermissions } from "../permissions/content-access";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  getActivityPlanDerivedMetrics,
  getActivityPlansDerivedMetrics,
} from "../utils/activity-plan-derived-metrics";
import { loadProfileIdentityMap, type ProfileIdentity } from "../utils/profile-identity";

type EventLifecycleStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "skipped"
  | "rescheduled"
  | "expired";

function getEventCompletionRepository(ctx: Context) {
  return createEventCompletionRepository(getRequiredDb(ctx));
}

function getEventWriteRepository(ctx: Context) {
  return createEventWriteRepository(getRequiredDb(ctx));
}

function getEventReadRepository(ctx: Context) {
  return createEventReadRepository(getRequiredDb(ctx));
}

function getContentPermissions(ctx: Context, transaction?: DrizzleTransactionClient) {
  const db = transaction ?? getRequiredDb(ctx);

  if (!("select" in db) || !("insert" in db) || !("update" in db)) {
    return null;
  }

  return createContentAccessPermissions(db);
}

type EventStatusContext = {
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
type EventCreateInput = z.infer<typeof eventCreateSchema>;
type EventUpdateInput = z.infer<typeof eventUpdateSchema>;
type NormalizedEventCreateInput = {
  activityPlanId: string | null;
  allDay: boolean;
  description: string | null;
  endsAt: string | null;
  eventType: CoreEventType;
  notes: string | null;
  recurrence: NonNullable<EventCreateInput["recurrence"]> | null;
  routeId: string | null;
  sourceProvider: string | null;
  scheduledDate: string;
  startsAt: string;
  status: PublicEventStatus;
  timezone: string;
  title: string;
  trainingPlanId: string | null;
};

type MaterializedRecurrenceOccurrence = {
  startsAt: string;
  endsAt: string | null;
  occurrenceKey: string;
};

const weekdayToRRuleDay = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

function toDbEventType(eventType: CoreEventType): DbEventType {
  return eventType as DbEventType;
}

function toCoreEventType(eventType: DbEventType): CoreEventType {
  return eventType as CoreEventType;
}

const _plannedEventSelect = `
  id,
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
  scheduled_date,
  activity_plan:activity_plans (*)
`;

type PlannedEventRecord = Omit<
  Pick<
    EventRow,
    | "id"
    | "profile_id"
    | "event_type"
    | "title"
    | "description"
    | "all_day"
    | "timezone"
    | "activity_plan_id"
    | "route_id"
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
    | "scheduled_date"
  >,
  "created_at" | "updated_at" | "starts_at" | "ends_at" | "original_starts_at"
> & {
  created_at: string;
  updated_at: string;
  starts_at: string;
  ends_at: string | null;
  original_starts_at: string | null;
  activity_plan: PublicActivityPlansRow[] | null;
  route: {
    id: string;
    name: string;
    description: string | null;
    total_distance: number;
    total_ascent: number | null;
    total_descent: number | null;
  } | null;
};

type EventActivityPlan = PublicActivityPlansRow &
  ActivityPlanExecutionDto & {
    owner?: ProfileIdentity | null;
    updated_at?: Date | string | null;
  };

type MappedEvent<T extends PlannedEventRecord = PlannedEventRecord> = Omit<
  T,
  "event_type" | "activity_plan"
> & {
  scheduled_date: string;
  event_type: CoreEventType;
  activity_plan: EventActivityPlan | null;
};

function flattenActivityPlanRelation(
  activityPlan: PlannedEventRecord["activity_plan"] | EventActivityPlan | null | undefined,
): PublicActivityPlansRow | EventActivityPlan | null {
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

const eventCreateInputSchema = eventCreateSchema;

const eventUpdateInputSchema = eventUpdateSchema;

type NormalizedEventUpdatePatch = {
  activity_plan_id?: string | null;
  route_id?: string | null;
  training_plan_id?: string | null;
  notes?: string | null;
  event_type?: CoreEventType;
  recurrence?: EventRecurrence | null;
  lifecycle?: EventLifecycle;
  title?: string;
  description?: string | null;
  all_day?: boolean;
  timezone?: string;
  starts_at?: string;
  ends_at?: string | null;
  scheduled_date?: string;
};

function normalizeEventUpdatePatch(input: EventUpdateInput): {
  patch: NormalizedEventUpdatePatch;
  scheduledDate: string | undefined;
} {
  return {
    patch: input.patch as NormalizedEventUpdatePatch,
    scheduledDate: "scheduled_date" in input.patch ? input.patch.scheduled_date : undefined,
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
      .array(z.enum(["custom", "imported", "planned", "race_target"]))
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
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const plannedDaySummaryInputSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
      .refine((value) => {
        const parsed = parseDateOnlyUtc(value);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      }, "Date must be a valid calendar date"),
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

function toDayStartIso(dateValue: string, planningTimezone = "UTC"): string {
  return scheduledDateTimeToIsoInstant({
    scheduledDate: toDateKey(dateValue),
    time: "00:00",
    timeZone: planningTimezone,
  });
}

function toRangeStartIso(dateValue: string, planningTimezone?: string): string {
  return dateOnlyPattern.test(dateValue.trim())
    ? toDayStartIso(dateValue, planningTimezone)
    : toCanonicalInstantIso(dateValue);
}

function toNextDayStartIso(dateValue: string, planningTimezone = "UTC"): string {
  return toDayStartIso(addDaysDateOnlyUtc(toDateKey(dateValue), 1), planningTimezone);
}

function toRangeEndIso(dateValue: string, planningTimezone?: string): string {
  return dateOnlyPattern.test(dateValue.trim())
    ? toNextDayStartIso(dateValue, planningTimezone)
    : toCanonicalInstantIso(dateValue);
}

async function getRequiredProfilePlanningTimezone(
  ctx: Context,
  profileId: string,
): Promise<string> {
  const db = getRequiredDb(ctx);
  const [profile] = await db
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId))
    .limit(1);
  const parsed = ianaTimezoneSchema.safeParse(profile?.planningTimezone);
  if (parsed.success) return parsed.data;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "A valid planning timezone is required for calendar-day queries.",
  });
}

function parseRRule(rule: string): Map<string, string> {
  const body = rule.trim().startsWith("RRULE:") ? rule.trim().slice(6) : rule.trim();
  return new Map(
    body.split(";").map((part) => {
      const [key, value] = part.split("=");
      return [key ?? "", value ?? ""];
    }),
  );
}

function parseRRuleUntilDateKey(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.000Z`,
    )
      .toISOString()
      .slice(0, 10);
  }

  throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid recurrence UNTIL value" });
}

function buildMaterializedRecurrenceOccurrences(input: {
  startsAt: string;
  endsAt: string | null;
  recurrence: NonNullable<NormalizedEventCreateInput["recurrence"]>;
}): MaterializedRecurrenceOccurrence[] {
  const tokens = parseRRule(input.recurrence.rule);
  const frequency = tokens.get("FREQ");
  if (frequency !== "WEEKLY") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only weekly recurrence is supported" });
  }

  const countToken = tokens.get("COUNT");
  const untilToken = tokens.get("UNTIL");
  if (!countToken && !untilToken) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Recurring events must end with COUNT or UNTIL",
    });
  }

  const interval = Number(tokens.get("INTERVAL") ?? "1");
  if (!Number.isInteger(interval) || interval < 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recurrence interval must be positive" });
  }

  const startDay =
    weekdayToRRuleDay[
      new Date(
        `${getScheduledDateKey(input.startsAt, input.recurrence.timezone)}T00:00:00.000Z`,
      ).getUTCDay()
    ];
  const byDay = tokens.get("BYDAY") ?? startDay;
  if (byDay !== startDay) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Weekly recurrence day must match the event start date",
    });
  }

  const maxOccurrences = 366;
  const count = countToken ? Number(countToken) : maxOccurrences;
  if (!Number.isInteger(count) || count < 1 || count > maxOccurrences) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Recurring events support 1-${maxOccurrences} occurrences`,
    });
  }

  const untilDateKey = untilToken ? parseRRuleUntilDateKey(untilToken) : null;
  const occurrences = materializeRecurrenceOccurrences({
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    frequency,
    interval,
    count,
    untilDateKey,
    recurrenceTimeZone: input.recurrence.timezone,
  });

  if (occurrences.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recurrence creates no occurrences" });
  }

  return occurrences;
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
  const rawActivityPlan = flattenActivityPlanRelation(event.activity_plan);
  const activityPlan: EventActivityPlan | null = rawActivityPlan
    ? hasActivityPlanExecutionDto(rawActivityPlan)
      ? rawActivityPlan
      : toActivityPlanExecutionDto(rawActivityPlan)
    : null;

  return {
    ...event,
    activity_plan: activityPlan,
    event_type: toCoreEventType(event.event_type),
    scheduled_date: event.scheduled_date,
  };
}

function mapEventWithoutAvailablePlan<T extends PlannedEventRecord>(event: T): MappedEvent<T> {
  return {
    ...event,
    activity_plan: null,
    event_type: toCoreEventType(event.event_type),
    scheduled_date: event.scheduled_date,
  };
}

function toSafeStoredActivityPlanError(error: unknown): never {
  if (error instanceof InvalidStoredActivityPlanError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored activity plan is not valid V3",
    });
  }
  throw error;
}

function mapEventSafely<T extends PlannedEventRecord>(event: T): MappedEvent<T> {
  try {
    return mapEvent(event);
  } catch (error) {
    return toSafeStoredActivityPlanError(error);
  }
}

function mapEvents<T extends PlannedEventRecord>(events: T[] | null): Array<MappedEvent<T>> {
  return (events || []).map((event) => {
    try {
      return mapEvent(event);
    } catch (error) {
      if (error instanceof InvalidStoredActivityPlanError) {
        // Collection reads retain the Event and its activity_plan_id while making
        // the unusable relation explicit as unavailable.
        return mapEventWithoutAvailablePlan(event);
      }
      throw error;
    }
  });
}

function assertRestDayWritesBlocked(_eventType: CoreEventType, _action: "create" | "update"): void {
  // No-op after canonical event_type migration; rest days are not persisted events.
}

async function enrichEventsWithActivityPlanIdentity<
  T extends {
    activity_plan: EventActivityPlan | null;
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

    count += rows.length;

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

  // A lifecycle label alone is not completion evidence. Require an activity identity, while
  // preserving explicit non-completion lifecycle states when a stale link remains attached.
  const explicitlyCompleted = hasTruthyRecordValue(event, [
    "completed_activity_id",
    "linked_activity_id",
  ]);
  if (explicitlyCompleted) return "completed";

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

  const statusContext: EventStatusContext = {
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

function ensurePersistableRecurrence(
  recurrence:
    | {
        rule: string;
        timezone: string;
        exdates?: string[];
        exceptions?: unknown[];
      }
    | null
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

function normalizeEventCreateInput(input: EventCreateInput): NormalizedEventCreateInput {
  const status = toPersistableEventStatus(input.lifecycle);

  if (input.event_type === "planned") {
    return {
      activityPlanId: input.activity_plan_id ?? null,
      allDay: true,
      description: null,
      endsAt: toNextDayStartIso(input.scheduled_date),
      eventType: input.event_type,
      notes: input.notes ?? null,
      recurrence: input.recurrence ?? null,
      routeId: input.route_id ?? null,
      sourceProvider: null,
      scheduledDate: input.scheduled_date,
      startsAt: toDayStartIso(input.scheduled_date),
      status,
      timezone: input.timezone,
      title: input.title,
      trainingPlanId: input.training_plan_id ?? null,
    };
  }

  return {
    activityPlanId: "activity_plan_id" in input ? (input.activity_plan_id ?? null) : null,
    allDay: input.all_day,
    description: input.description ?? null,
    endsAt: typeof input.ends_at === "string" ? toCanonicalInstantIso(input.ends_at) : null,
    eventType: input.event_type,
    notes: input.notes ?? null,
    recurrence: input.recurrence ?? null,
    routeId: "route_id" in input ? (input.route_id ?? null) : null,
    sourceProvider: null,
    // Custom and race payloads may omit the date, so derive their canonical
    // schedule anchor once at this write boundary.
    scheduledDate: input.scheduled_date ?? getScheduledDateKey(input.starts_at, input.timezone),
    startsAt: toCanonicalInstantIso(input.starts_at),
    status,
    timezone: input.timezone,
    title: input.title,
    trainingPlanId: null,
  };
}

function _applyScopeFilters(
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
      message: `Mutation scope "${scope}" requires an event series`,
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

function isEventPlanWritableForCompletion(
  activityPlanId: string | null,
  activityPlanStructure: unknown | null,
) {
  return (
    activityPlanId === null ||
    (activityPlanStructure !== null &&
      activityPlanStructureSchemaV3.safeParse(activityPlanStructure).success)
  );
}

function assertEventPlanWritableForCompletion(input: {
  activityPlanId: string | null;
  activityPlanStructure: unknown | null;
}) {
  if (isEventPlanWritableForCompletion(input.activityPlanId, input.activityPlanStructure)) return;

  throw new TRPCError({
    code: "CONFLICT",
    message: "Events linked to unavailable or non-executable activity plans are read-only",
  });
}

function compareActivitiesForReconciliation(
  a: ReconciliationActivityCandidate,
  b: ReconciliationActivityCandidate,
): number {
  const aStartedAt = typeof a.started_at === "string" ? a.started_at : "";
  const bStartedAt = typeof b.started_at === "string" ? b.started_at : "";
  const aId = typeof a.id === "string" ? a.id : "";
  const bId = typeof b.id === "string" ? b.id : "";
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
      let data;
      try {
        data = await eventReadRepository.getOwnedEventById({
          eventId: input.id,
          profileId: ctx.session.user.id,
        });
      } catch (error) {
        toSafeStoredActivityPlanError(error);
      }

      if (!data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      const event = mapEventSafely(data as PlannedEventRecord);

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

  getProviderSyncStatus: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const eventReadRepository = getEventReadRepository(ctx);
      let event;
      try {
        event = await eventReadRepository.getOwnedEventById({
          eventId: input.eventId,
          profileId: ctx.session.user.id,
        });
      } catch (error) {
        toSafeStoredActivityPlanError(error);
      }

      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      return {
        eventId: input.eventId,
        plannedActivitySync: await getEventPlannedActivityProviderStatuses({
          db: getRequiredDb(ctx),
          eventId: input.eventId,
          profileId: ctx.session.user.id,
        }),
      };
    }),

  getToday: protectedProcedure.query(async ({ ctx }) => {
    const eventReadRepository = getEventReadRepository(ctx);
    const planningTimezone = await getRequiredProfilePlanningTimezone(ctx, ctx.session.user.id);
    const today = formatDateOnlyInTimeZone(new Date(), planningTimezone);
    const tomorrow = addDaysDateOnlyUtc(today, 1);

    let data;
    try {
      data = await eventReadRepository.listOwnedEvents({
        profileId: ctx.session.user.id,
        dateFrom: toDayStartIso(today, planningTimezone),
        dateTo: toDayStartIso(tomorrow, planningTimezone),
        includeAdhoc: true,
        limit: 500,
      });
    } catch (error) {
      toSafeStoredActivityPlanError(error);
    }

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
    const planningTimezone = await getRequiredProfilePlanningTimezone(ctx, ctx.session.user.id);
    const today = formatDateOnlyInTimeZone(new Date(), planningTimezone);
    const startOfWeek = addDaysDateOnlyUtc(today, -parseDateOnlyUtc(today).getUTCDay());
    const endOfWeek = addDaysDateOnlyUtc(startOfWeek, 7);

    return countVisibleOwnedEventsInRange(eventReadRepository, {
      profileId: ctx.session.user.id,
      dateFrom: toDayStartIso(startOfWeek, planningTimezone),
      dateTo: toDayStartIso(endOfWeek, planningTimezone),
    });
  }),

  create: protectedProcedure.input(eventCreateInputSchema).mutation(async ({ ctx, input }) => {
    return createEventUseCase({
      ctx,
      input,
      dependencies: {
        assertRestDayWritesBlocked,
        buildInsightRefreshHint,
        buildMaterializedRecurrenceOccurrences,
        enqueueProviderPlannedActivityJobs,
        ensurePersistableRecurrence,
        getContentPermissions,
        getEventWriteRepository,
        mapEvent: (event) => mapEvent(event as PlannedEventRecord),
        normalizeEventCreateInput,
        toDbEventType,
      },
    });
  }),

  update: protectedProcedure.input(eventUpdateInputSchema).mutation(async ({ ctx, input }) => {
    return updateEventUseCase({
      ctx,
      input,
      dependencies: {
        assertRestDayWritesBlocked,
        buildInsightRefreshHint,
        buildMaterializedRecurrenceOccurrences,
        enqueueProviderPlannedActivityJobs,
        ensurePersistableRecurrence,
        getContentPermissions,
        getEventCompletionRepository,
        getEventWriteRepository,
        hasInstantChanged,
        mapEvent: (event) => mapEvent(event as PlannedEventRecord),
        normalizeEventUpdatePatch,
        toCoreEventType,
        toDateKey,
        toDayStartIso,
        toDbEventType,
        toNextDayStartIso,
        toPersistableEventStatus,
      },
    });
  }),

  delete: protectedProcedure.input(eventDeleteInputSchema).mutation(async ({ ctx, input }) => {
    return deleteEventUseCase({
      ctx,
      input,
      dependencies: {
        buildInsightRefreshHint,
        enqueueProviderPlannedActivityJobs,
        getContentPermissions,
        getEventCompletionRepository,
        toCoreEventType,
        toDateKey,
      },
    });
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

      const existingEvent = existingEventRow;
      const existingEventType = toCoreEventType(existingEvent.event_type);

      if (existingEventType === "imported") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Imported events are read-only",
        });
      }

      assertEventPlanWritableForCompletion({
        activityPlanId: existingEvent.activity_plan_id,
        activityPlanStructure: existingEvent.activity_plan?.structure ?? null,
      });

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

      const _eventUpdates: Record<string, unknown> = {
        // TODO(events-router): Once dedicated completion lifecycle columns
        // (completed_activity_id/completed_at) are available in the events
        // table, migrate this canonical linkage to those fields.
        linked_activity_id: input.activity_id,
        status: "completed",
      };

      const linkedEventRow = await completionRepository.updateEventCompletionLink({
        eventId: input.event_id,
        expectedActivityPlanId: existingEvent.activity_plan_id,
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

      const existingEvent = existingEventRow;
      const existingEventType = toCoreEventType(existingEvent.event_type);

      if (existingEventType === "imported") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Imported events are read-only",
        });
      }

      assertEventPlanWritableForCompletion({
        activityPlanId: existingEvent.activity_plan_id,
        activityPlanStructure: existingEvent.activity_plan?.structure ?? null,
      });

      const eventUpdates: Record<string, unknown> = {
        linked_activity_id: null,
        status: existingEvent.status === "completed" ? "scheduled" : existingEvent.status,
      };

      const unlinkedEventRow = await completionRepository.updateEventCompletionLink({
        eventId: input.event_id,
        expectedActivityPlanId: existingEvent.activity_plan_id,
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
        if (
          !isEventPlanWritableForCompletion(event.activity_plan_id, event.activity_plan_structure)
        ) {
          skippedEventIds.push(event.id);
          continue;
        }

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
          expectedActivityPlanId: event.activity_plan_id,
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
    const planningTimezone =
      (input.date_from && dateOnlyPattern.test(input.date_from.trim())) ||
      (input.date_to && dateOnlyPattern.test(input.date_to.trim()))
        ? await getRequiredProfilePlanningTimezone(ctx, ctx.session.user.id)
        : undefined;

    let listedEvents;
    try {
      listedEvents = await listVisibleOwnedEvents({
        repository: eventReadRepository,
        query: {
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
          dateFrom: input.date_from
            ? toRangeStartIso(input.date_from, planningTimezone)
            : undefined,
          dateTo: input.date_to ? toRangeEndIso(input.date_to, planningTimezone) : undefined,
          eventTypes:
            input.event_types && input.event_types.length > 0
              ? [...new Set(input.event_types.map((eventType) => toDbEventType(eventType)))]
              : undefined,
          cursor:
            cursorDate && cursorId
              ? { startsAt: toCanonicalInstantIso(cursorDate), id: cursorId }
              : undefined,
        },
        isVisible: () => true,
        buildCursor: (row) => ({
          startsAt: toCanonicalInstantIso(row.starts_at),
          id: row.id,
        }),
      });
    } catch (error) {
      toSafeStoredActivityPlanError(error);
    }
    const { rows, hasMore } = listedEvents;

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

  plannedDaySummary: protectedProcedure
    .input(plannedDaySummaryInputSchema)
    .query(async ({ ctx, input }) => {
      const planningTimezone = await getRequiredProfilePlanningTimezone(ctx, ctx.session.user.id);
      try {
        const result = await plannedDaySummaryUseCase({
          date: input.date,
          profileId: ctx.session.user.id,
          repository: getEventReadRepository(ctx),
          deriveMetrics: async (plans) =>
            getActivityPlansDerivedMetrics(
              plans,
              getRequiredDb(ctx),
              getEventReadRepository(ctx),
              ctx.session.user.id,
            ),
        });
        return { date: input.date, timezone: planningTimezone, ...result };
      } catch (error) {
        if (error instanceof PlannedDaySummaryLimitExceededError) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: `Day summary exceeds the ${MAX_PLANNED_DAY_SUMMARY_EVENTS}-event limit`,
          });
        }
        throw error;
      }
    }),

  validateConstraints: protectedProcedure
    .input(validateConstraintsSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const eventReadRepository = getEventReadRepository(ctx);
      const permissions = getContentPermissions(ctx);
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      if (permissions) {
        await permissions.requireRead(
          ctx.session.user.id,
          { type: "training_plan", id: input.training_plan_id },
          "Training plan not found",
        );
        await permissions.requireRead(
          ctx.session.user.id,
          { type: "activity_plan", id: input.activity_plan_id },
          "Activity plan not found",
        );
      }

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
        eventTypes: ["planned"],
        includeAdhoc: true,
        dateFrom: startOfWeek.toISOString().split("T")[0] || "",
        dateTo: endOfWeek.toISOString().split("T")[0] || "",
        limit: 500,
      });

      // This is an internal estimation input, not a public Event DTO. Preserve legacy
      // rows here so constraint evaluation remains independent of presentation mapping.
      const plannedThisWeekMapped =
        (plannedThisWeek as PlannedEventRecord[] | null)?.map((event) => ({
          ...event,
          activity_plan: flattenActivityPlanRelation(event.activity_plan),
        })) ?? [];

      const currentWeekPlans = plannedThisWeekMapped
        .map((event) => event.activity_plan)
        .filter(
          (plan): plan is NonNullable<(typeof plannedThisWeekMapped)[number]["activity_plan"]> =>
            !!plan,
        );

      const allDerivedPlans = await getActivityPlansDerivedMetrics(
        [...currentWeekPlans, activityPlan as any],
        db,
        eventReadRepository,
        ctx.session.user.id,
        { asOf: new Date() },
      );
      const currentWeekDerivedPlans = allDerivedPlans.slice(0, currentWeekPlans.length);
      const currentWeeklyTSS = currentWeekDerivedPlans.reduce(
        (sum, plan) => sum + plan.authoritative_metrics.estimated_tss,
        0,
      );

      const newActivityDerivedPlan = allDerivedPlans[currentWeekPlans.length]!;
      const newWeeklyTSS =
        currentWeeklyTSS + newActivityDerivedPlan.authoritative_metrics.estimated_tss;

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
      let data;
      try {
        data = await eventReadRepository.listOwnedEvents({
          profileId: ctx.session.user.id,
          dateFrom: toDayStartIso(input.weekStart),
          dateTo: toNextDayStartIso(input.weekEnd),
          includeAdhoc: true,
          limit: 500,
        });
      } catch (error) {
        toSafeStoredActivityPlanError(error);
      }

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
