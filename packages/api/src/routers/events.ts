import {
  activityPlanStructureSchema,
  type EventLifecycle,
  type EventRecurrence,
  eventCreateSchema,
  eventMutationScopeSchema,
  type eventTypeInputSchema,
  eventUpdateSchema,
  ianaTimezoneSchema,
  materializeRecurrenceOccurrences,
  parseProfileGoalRecord,
  profileGoalRecordSchema,
} from "@repo/core";
import {
  addDaysDateOnlyUtc,
  getCalendarDateInIanaZone,
  parseDateOnlyUtc,
  scheduledDateTimeToIsoInstant,
} from "@repo/core/calendar";
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
  estimateActivityPlan,
  estimateActivityPlans,
} from "../application/activity-plans/estimate-activity-plans";
import {
  createEventUseCase,
  deleteEventUseCase,
  enqueueWahooPlannedActivityJobs,
  MAX_PLANNED_DAY_SUMMARY_EVENTS,
  PlannedDaySummaryLimitExceededError,
  plannedDaySummaryUseCase,
  summarizePlannedDayEvents,
  updateEventUseCase,
} from "../application/events";
import { readSelectedGroupEventsForCalendar } from "../application/groups/groupEventViews";
import type { Context } from "../context";
import { type DrizzleTransactionClient, getRequiredDb } from "../db";
import {
  type ActivityPlanExecutionDto,
  InvalidStoredActivityPlanError,
  toActivityPlanExecutionDto,
} from "../dto/activity-plan";
import {
  createEventCompletionRepository,
  createEventReadRepository,
  createEventWriteRepository,
} from "../infrastructure/repositories";
import { getEventWahooPlannedActivityStatuses } from "../lib/provider-sync/planned-activities";
import { createContentAccessPermissions } from "../permissions/content-access";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { loadProfileIdentityMap, type ProfileIdentity } from "../utils/profile-identity";

type EventLifecycleStatus = "scheduled" | "completed" | "cancelled" | "expired";
const CALENDAR_PROJECTION_SOURCE_LIMIT = 500;

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
  activity_plan: PublicActivityPlansRow | null;
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

const calendarDateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const parsed = parseDateOnlyUtc(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Date must be a valid calendar date");

const calendarRangeInputSchema = z
  .object({
    startDate: calendarDateKeySchema,
    endDateExclusive: calendarDateKeySchema,
    eventTypes: z
      .array(z.enum(["custom", "imported", "planned", "race_target"]))
      .min(1)
      .optional(),
    activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]).optional(),
    activityPlanId: z.string().uuid().optional(),
    trainingPlanId: z.string().uuid().optional(),
    includeAdhoc: z.boolean().default(true),
    limit: z.number().int().min(1).max(500).default(100),
    cursor: z.string().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const start = parseDateOnlyUtc(input.startDate);
    const end = parseDateOnlyUtc(input.endDateExclusive);
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (days <= 0 || days > 366)
      context.addIssue({
        code: "custom",
        path: ["endDateExclusive"],
        message: "Calendar ranges must cover 1-366 planning days",
      });
  });

const calendarDayInputSchema = z
  .object({
    date: calendarDateKeySchema,
    eventTypes: z
      .array(z.enum(["custom", "imported", "planned", "race_target"]))
      .min(1)
      .optional(),
    activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]).optional(),
    trainingPlanId: z.string().uuid().optional(),
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

function toNextDayStartIso(dateValue: string, planningTimezone = "UTC"): string {
  return toDayStartIso(addDaysDateOnlyUtc(toDateKey(dateValue), 1), planningTimezone);
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
        `${getCalendarDateInIanaZone(input.startsAt, input.recurrence.timezone)}T00:00:00.000Z`,
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
  const activityPlan: EventActivityPlan | null = event.activity_plan
    ? toActivityPlanExecutionDto(event.activity_plan)
    : null;

  return {
    ...event,
    activity_plan: activityPlan,
    event_type: toCoreEventType(event.event_type),
    scheduled_date: event.scheduled_date,
  };
}

function toSafeStoredActivityPlanError(error: unknown): never {
  if (error instanceof InvalidStoredActivityPlanError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored activity plan is not valid",
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
  return (events || []).map(mapEvent);
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

function countUniqueScheduledDates(
  events: Array<Pick<PlannedEventRecord, "scheduled_date">>,
): number {
  return new Set(events.map((event) => event.scheduled_date)).size;
}

function buildCompletedSignature(dateKey: string, activityPlanId: string): string {
  return `${dateKey}::${activityPlanId}`;
}

function resolveEventStatus(
  event: {
    linked_activity_id: string | null;
    scheduled_date: string;
    status: PublicEventStatus;
    activity_plan_id?: string | null;
  },
  statusContext: EventStatusContext,
): EventLifecycleStatus {
  const scheduledDateKey = toDateKey(event.scheduled_date);
  if (event.status === "cancelled") return "cancelled";

  // A completed status without a canonical activity link is not completion evidence.
  if (event.linked_activity_id) return "completed";

  if (scheduledDateKey < statusContext.todayDateKey) return "expired";
  return "scheduled";
}

async function addEventLifecycleStatus<
  T extends {
    linked_activity_id: string | null;
    scheduled_date: string;
    status: PublicEventStatus;
    activity_plan_id?: string | null;
  },
>(
  events: T[],
  ctx: {
    repository: ReturnType<typeof createEventReadRepository>;
    profileId: string;
    planningTimezone: string;
  },
): Promise<Array<T & { status: EventLifecycleStatus }>> {
  if (events.length === 0) return [];

  const statusContext: EventStatusContext = {
    todayDateKey: getCalendarDateInIanaZone(new Date().toISOString(), ctx.planningTimezone),
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
    scheduledDate:
      input.scheduled_date ?? getCalendarDateInIanaZone(input.starts_at, input.timezone),
    startsAt: toCanonicalInstantIso(input.starts_at),
    status,
    timezone: input.timezone,
    title: input.title,
    trainingPlanId: null,
  };
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
      activityPlanStructureSchema.safeParse(activityPlanStructure).success)
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

async function readPersonalCalendarRange(
  ctx: Context,
  profileId: string,
  input: z.infer<typeof calendarRangeInputSchema>,
) {
  const repository = getEventReadRepository(ctx);
  const planningTimezone = await getRequiredProfilePlanningTimezone(ctx, profileId);
  const [cursorDate, cursorId] = input.cursor ? input.cursor.split("_") : [];
  let listedEvents;
  try {
    listedEvents = await repository.listOwnedEvents({
      profileId,
      limit: input.limit + 1,
      includeAdhoc: input.includeAdhoc,
      dateFrom: input.startDate,
      dateTo: input.endDateExclusive,
      planningTimezone,
      ...(input.trainingPlanId === undefined ? {} : { trainingPlanId: input.trainingPlanId }),
      ...(input.activityPlanId === undefined ? {} : { activityPlanId: input.activityPlanId }),
      ...(input.activityCategory === undefined ? {} : { activityCategory: input.activityCategory }),
      ...(input.eventTypes === undefined
        ? {}
        : { eventTypes: [...new Set(input.eventTypes.map(toDbEventType))] }),
      ...(cursorDate && cursorId
        ? { cursor: { startsAt: toCanonicalInstantIso(cursorDate), id: cursorId } }
        : {}),
    });
  } catch (error) {
    toSafeStoredActivityPlanError(error);
  }
  const rows = listedEvents ?? [];
  const hasMore = rows.length > input.limit;
  const projectedRows = (rows.slice(0, input.limit) as PlannedEventRecord[]).map((event) => ({
    ...event,
    scheduled_date: event.all_day
      ? event.scheduled_date
      : getCalendarDateInIanaZone(event.starts_at, planningTimezone),
  }));
  const events = mapEvents(projectedRows);
  const plans = events
    .map((event) => event.activity_plan)
    .filter((plan): plan is NonNullable<typeof plan> => plan !== null);
  const estimated = await estimateActivityPlans(plans, getRequiredDb(ctx), profileId);
  const plansById = new Map(estimated.map((plan) => [plan.id, plan]));
  const enriched = (await enrichEventsWithActivityPlanIdentity(
    getRequiredDb(ctx),
    events.map((event) => ({
      ...event,
      activity_plan: event.activity_plan
        ? ((plansById.get(event.activity_plan.id) as typeof event.activity_plan | undefined) ??
          event.activity_plan)
        : null,
    })),
  )) as typeof events;
  const items = await addEventLifecycleStatus(enriched, {
    repository,
    profileId,
    planningTimezone,
  });
  const startAt = toDayStartIso(input.startDate, planningTimezone);
  const endsAtExclusive = toDayStartIso(input.endDateExclusive, planningTimezone);
  const [activityRows, goalRows, selectedGroupEvents] = await Promise.all([
    repository.listCalendarCompletedActivities({
      limit: CALENDAR_PROJECTION_SOURCE_LIMIT + 1,
      profileId,
      startedAtGte: startAt,
      startedAtLt: endsAtExclusive,
    }),
    repository.listCalendarGoals({
      endDateExclusive: input.endDateExclusive,
      limit: CALENDAR_PROJECTION_SOURCE_LIMIT + 1,
      profileId,
      startDate: input.startDate,
    }),
    readSelectedGroupEventsForCalendar({
      db: getRequiredDb(ctx),
      profileId,
      startDate: input.startDate,
      endDateExclusive: input.endDateExclusive,
      limit: CALENDAR_PROJECTION_SOURCE_LIMIT,
    }),
  ]);
  const linkedActivityIds = new Set(
    items.map((event) => event.linked_activity_id).filter((id): id is string => Boolean(id)),
  );
  const visibleActivityRows = activityRows
    .filter((activity) => !linkedActivityIds.has(activity.id))
    .slice(0, CALENDAR_PROJECTION_SOURCE_LIMIT);
  const completedActivities = visibleActivityRows.map((activity) => ({
    id: activity.id,
    name: activity.name,
    started_at: activity.started_at,
    scheduled_date: getCalendarDateInIanaZone(activity.started_at, planningTimezone),
    distance_meters: activity.distance_meters,
    duration_seconds: Math.round((activity.active_ms ?? activity.elapsed_ms) / 1000),
  }));
  const goals = profileGoalRecordSchema
    .array()
    .parse(goalRows.slice(0, CALENDAR_PROJECTION_SOURCE_LIMIT))
    .map(parseProfileGoalRecord);
  const groupActivityPlanIds = Array.from(
    new Set(
      selectedGroupEvents.items
        .map((event) => event.activity_plan_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const groupActivityPlanRows = await repository.listCalendarGroupActivityPlans({
    activityPlanIds: groupActivityPlanIds,
  });
  const groupActivityPlans = await estimateActivityPlans(
    groupActivityPlanRows,
    getRequiredDb(ctx),
    profileId,
  );
  const groupActivityPlanById = new Map(groupActivityPlans.map((plan) => [plan.id, plan]));
  const groupEvents = selectedGroupEvents.items.map((event) => ({
    ...event,
    scheduled_date: getCalendarDateInIanaZone(event.starts_at, event.timezone),
    selectedActivityPlan: event.activity_plan_id
      ? (groupActivityPlanById.get(event.activity_plan_id) ?? null)
      : null,
    selectedActivityPlanOptionLabel: event.activity_plan_id
      ? (groupActivityPlanById.get(event.activity_plan_id)?.name ?? null)
      : null,
    selectedActivityPlanTentative: false,
  }));
  const plannedEventsByDate = new Map<
    string,
    Array<{
      activity_plan: PlannedEventRecord["activity_plan"];
      activity_plan_id: string | null;
      id: string;
      starts_at: string;
    }>
  >();
  for (const event of projectedRows) {
    if (
      event.event_type !== "planned" ||
      (event.status !== "scheduled" && event.status !== "completed") ||
      !event.scheduled_date
    ) {
      continue;
    }
    const dayEvents = plannedEventsByDate.get(event.scheduled_date) ?? [];
    dayEvents.push({
      activity_plan: event.activity_plan,
      activity_plan_id: event.activity_plan_id,
      id: event.id,
      starts_at: event.starts_at,
    });
    plannedEventsByDate.set(event.scheduled_date, dayEvents);
  }
  const plannedLoadSummaries = Array.from(plannedEventsByDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dayEvents]) => ({
      date,
      timezone: planningTimezone,
      ...summarizePlannedDayEvents({ date, estimates: estimated, events: dayEvents }),
    }));
  const last = items.at(-1);
  return {
    contractVersion: "calendar-projection-v1" as const,
    startDate: input.startDate,
    endDateExclusive: input.endDateExclusive,
    timezone: planningTimezone,
    items,
    completedActivities: {
      items: completedActivities,
      truncated: activityRows.length > CALENDAR_PROJECTION_SOURCE_LIMIT,
    },
    goals: {
      items: goals,
      truncated: goalRows.length > CALENDAR_PROJECTION_SOURCE_LIMIT,
    },
    selectedGroupEvents: {
      items: groupEvents,
      truncated: selectedGroupEvents.truncated,
    },
    plannedLoadSummaries: {
      items: plannedLoadSummaries,
      truncated: hasMore,
    },
    nextCursor: hasMore && last ? `${toCanonicalInstantIso(last.starts_at)}_${last.id}` : undefined,
  };
}

async function readPersonalCalendarDaySummary(
  ctx: Context,
  profileId: string,
  date: string,
  planningTimezone: string,
) {
  try {
    const result = await plannedDaySummaryUseCase({
      date,
      profileId,
      repository: getEventReadRepository(ctx),
      deriveMetrics: async (plans) => estimateActivityPlans(plans, getRequiredDb(ctx), profileId),
    });
    return { date, timezone: planningTimezone, ...result };
  } catch (error) {
    if (error instanceof PlannedDaySummaryLimitExceededError) {
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: `Day summary exceeds the ${MAX_PLANNED_DAY_SUMMARY_EVENTS}-event limit`,
      });
    }
    throw error;
  }
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
        const planWithEstimation = await estimateActivityPlan(
          event.activity_plan,
          getRequiredDb(ctx),
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
        plannedActivitySync: await getEventWahooPlannedActivityStatuses({
          db: getRequiredDb(ctx),
          eventId: input.eventId,
          profileId: ctx.session.user.id,
        }),
      };
    }),

  create: protectedProcedure.input(eventCreateInputSchema).mutation(async ({ ctx, input }) => {
    return createEventUseCase({
      ctx,
      input,
      dependencies: {
        assertRestDayWritesBlocked,
        buildInsightRefreshHint,
        buildMaterializedRecurrenceOccurrences,
        enqueueWahooPlannedActivityJobs,
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
        enqueueWahooPlannedActivityJobs,
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
        enqueueWahooPlannedActivityJobs,
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
          input.dry_run || updatedEventIds.length === 0 ? [] : ["calendar.range", "calendar.day"],
        insight_refresh_hints: uniqueInsightRefreshHints,
      };
    }),

  validateConstraints: protectedProcedure
    .input(validateConstraintsSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const eventReadRepository = getEventReadRepository(ctx);
      const permissions = getContentPermissions(ctx);
      // One operation instant is passed through every calibration-dependent read.
      const asOf = new Date();

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
        asOf,
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
        target_weekly_load_max?: number;
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

      const plannedThisWeekMapped = (plannedThisWeek as PlannedEventRecord[] | null) ?? [];

      const currentWeekPlans = plannedThisWeekMapped
        .map((event) => event.activity_plan)
        .filter(
          (plan): plan is NonNullable<(typeof plannedThisWeekMapped)[number]["activity_plan"]> =>
            !!plan,
        );

      const allDerivedPlans = await estimateActivityPlans(
        [...currentWeekPlans, activityPlan],
        db,
        ctx.session.user.id,
        { asOf },
      );
      const currentWeekDerivedPlans = allDerivedPlans.slice(0, currentWeekPlans.length);
      const currentWeeklyLoad = currentWeekDerivedPlans.reduce<number | null>((sum, plan) => {
        const load = plan.prescriptionQuantification.summary.commonLoad;
        return sum === null || load.status !== "complete" ? null : sum + load.load;
      }, 0);

      const newActivityDerivedPlan = allDerivedPlans[currentWeekPlans.length];
      const newActivityCommonLoad =
        newActivityDerivedPlan?.prescriptionQuantification?.summary.commonLoad;
      const newLoad =
        newActivityCommonLoad?.status === "complete" ? newActivityCommonLoad.load : null;
      const newWeeklyLoad =
        currentWeeklyLoad === null || newLoad === null ? null : currentWeeklyLoad + newLoad;

      const maxWeeklyLoad = structure.target_weekly_load_max || Infinity;
      const weeklyLoadStatus =
        newWeeklyLoad === null
          ? "violated"
          : newWeeklyLoad <= maxWeeklyLoad
            ? "satisfied"
            : newWeeklyLoad <= maxWeeklyLoad * 1.1
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
          weeklyLoad: {
            status: weeklyLoadStatus as "satisfied" | "warning" | "violated",
            current: currentWeeklyLoad,
            withNew: newWeeklyLoad,
            limit: maxWeeklyLoad,
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
          weeklyLoadStatus !== "violated" &&
          activitiesPerWeekStatus !== "violated" &&
          consecutiveDaysStatus !== "violated" &&
          restDaysStatus !== "violated",
        hasWarnings:
          weeklyLoadStatus === "warning" ||
          activitiesPerWeekStatus === "warning" ||
          consecutiveDaysStatus === "warning" ||
          restDaysStatus === "warning",
      };
    }),
});

/** Date-keyed personal schedule projections. Event identity and mutations remain on eventsRouter. */
export const calendarRouter = createTRPCRouter({
  range: protectedProcedure
    .input(calendarRangeInputSchema)
    .query(({ ctx, input }) => readPersonalCalendarRange(ctx, ctx.session.user.id, input)),
  day: protectedProcedure.input(calendarDayInputSchema).query(async ({ ctx, input }) => {
    const result = await readPersonalCalendarRange(ctx, ctx.session.user.id, {
      startDate: input.date,
      endDateExclusive: addDaysDateOnlyUtc(input.date, 1),
      eventTypes: input.eventTypes,
      activityCategory: input.activityCategory,
      trainingPlanId: input.trainingPlanId,
      includeAdhoc: true,
      limit: 500,
    });
    return {
      contractVersion: result.contractVersion,
      date: input.date,
      timezone: result.timezone,
      items: result.items,
      completedActivities: result.completedActivities,
      goals: result.goals,
      selectedGroupEvents: result.selectedGroupEvents,
      plannedLoadSummary: await readPersonalCalendarDaySummary(
        ctx,
        ctx.session.user.id,
        input.date,
        result.timezone,
      ),
    };
  }),
});
