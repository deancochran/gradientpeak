import {
  type EventRecurrence,
  eventCreateSchema,
  eventMutationScopeSchema,
  type eventTypeInputSchema,
  eventUpdateSchema,
  formatGoalTypeLabel,
  getGoalObjectiveSummary,
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
import type { ActivityRow, EventRow, PublicEventStatus, PublicEventType } from "@repo/db";
import { schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { toActivityDisplayModel } from "../application/activities/activity-display";
import { estimateActivityPlans } from "../application/activity-plans/estimate-activity-plans";
import { assembleCalendarProjectionRange } from "../application/calendar/assemble-projection";
import { createEventUseCase, deleteEventUseCase, updateEventUseCase } from "../application/events";
import { readSelectedGroupEventsForCalendar } from "../application/groups/groupEventViews";
import { readPlanningRange } from "../application/training-plan/planningLedgerService";
import type { Context } from "../context";
import { planningRangeRequestSchema, planningRangeSchema } from "../contracts/planning-range";
import { type DrizzleTransactionClient, getRequiredDb } from "../db";
import { InvalidStoredActivityPlanError } from "../dto/activity-plan";
import {
  createDrizzlePlannedSessionRepository,
  createEventCompletionRepository,
  createEventReadRepository,
  createEventWriteRepository,
} from "../infrastructure/repositories";
import { createContentAccessPermissions } from "../permissions/content-access";
import { createTRPCRouter, protectedProcedure } from "../trpc";

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
  allDay: boolean;
  description: string | null;
  endsAt: string | null;
  eventType: CoreEventType;
  notes: string | null;
  recurrence: EventRecurrence | null;
  routeId: string | null;
  scheduledDate: string;
  startsAt: string;
  status: PublicEventStatus;
  timezone: string;
  title: string;
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
    | "route_id"
    | "recurrence_rule"
    | "recurrence_timezone"
    | "series_id"
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
  route: {
    id: string;
    name: string;
    description: string | null;
    total_distance: number;
    total_ascent: number | null;
    total_descent: number | null;
  } | null;
};

type MappedEvent<T extends PlannedEventRecord = PlannedEventRecord> = Omit<T, "event_type"> & {
  scheduled_date: string;
  event_type: CoreEventType;
};

const eventCreateInputSchema = eventCreateSchema;

const eventUpdateInputSchema = eventUpdateSchema;

type NormalizedEventUpdatePatch = {
  route_id?: string | null;
  notes?: string | null;
  event_type?: CoreEventType;
  recurrence?: EventRecurrence | null;
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
      .array(z.enum(["custom", "race_target"]))
      .min(1)
      .optional(),
    activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]).optional(),
    activityPlanId: z.string().uuid().optional(),
    trainingPlanId: z.string().uuid().optional(),
    includeAdhoc: z.boolean().default(true),
    limit: z.number().int().min(1).max(500).default(100),
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

const calendarPageInputSchema = z
  .object({
    pageStartDate: calendarDateKeySchema,
    pageSizeDays: z.number().int().min(7).max(62).default(42),
    eventTypes: z
      .array(z.enum(["custom", "race_target"]))
      .min(1)
      .optional(),
    activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]).optional(),
    activityPlanId: z.string().uuid().optional(),
    trainingPlanId: z.string().uuid().optional(),
    includeAdhoc: z.boolean().default(true),
    limit: z.number().int().min(1).max(500).default(500),
  })
  .strict();

const calendarDayInputSchema = z
  .object({
    date: calendarDateKeySchema,
    eventTypes: z
      .array(z.enum(["custom", "race_target"]))
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

async function getProfilePlanningTimezone(ctx: Context, profileId: string): Promise<string> {
  const db = getRequiredDb(ctx);
  const [profile] = await db
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId))
    .limit(1);
  const parsed = ianaTimezoneSchema.safeParse(profile?.planningTimezone);
  if (parsed.success) return parsed.data;

  // Legacy profiles may not have a valid planning timezone. Keep calendar
  // projections server-authoritative while matching the home projection's
  // explicit fallback behavior.
  return "UTC";
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
  return {
    ...event,
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

function normalizeEventCreateInput(input: EventCreateInput): NormalizedEventCreateInput {
  return {
    allDay: input.all_day,
    description: input.description ?? null,
    endsAt: typeof input.ends_at === "string" ? toCanonicalInstantIso(input.ends_at) : null,
    eventType: input.event_type,
    notes: input.notes ?? null,
    recurrence: input.recurrence ?? null,
    routeId: null,
    // Custom and race payloads may omit the date, so derive their canonical
    // schedule anchor once at this write boundary.
    scheduledDate:
      input.scheduled_date ?? getCalendarDateInIanaZone(input.starts_at, input.timezone),
    startsAt: toCanonicalInstantIso(input.starts_at),
    status: "scheduled",
    timezone: input.timezone,
    title: input.title,
  };
}

type ReconciliationActivityCandidate = Pick<ActivityRow, "id" | "activity_plan_id"> & {
  started_at: string;
};

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
  const planningTimezone = await getProfilePlanningTimezone(ctx, profileId);
  const listedEvents = await repository
    .listOwnedEvents({
      profileId,
      limit: input.limit + 1,
      includeAdhoc: input.includeAdhoc,
      dateFrom: input.startDate,
      dateTo: input.endDateExclusive,
      planningTimezone,
      ...(input.eventTypes === undefined
        ? {}
        : { eventTypes: [...new Set(input.eventTypes.map(toDbEventType))] }),
    })
    .catch(toSafeStoredActivityPlanError);
  const rows = listedEvents ?? [];
  const hasMore = rows.length > input.limit;
  const projectedRows = (rows.slice(0, input.limit) as PlannedEventRecord[]).map((event) => ({
    ...event,
    scheduled_date: event.all_day
      ? event.scheduled_date
      : getCalendarDateInIanaZone(event.starts_at, planningTimezone),
  }));
  const events = mapEvents(projectedRows);
  const items = await addEventLifecycleStatus(events, {
    repository,
    profileId,
    planningTimezone,
  });
  const startAt = toDayStartIso(input.startDate, planningTimezone);
  const endsAtExclusive = toDayStartIso(input.endDateExclusive, planningTimezone);
  const [activityRows, goalRows, selectedGroupEvents, plannedSessionRange] = await Promise.all([
    repository.listCalendarCompletedActivities({
      limit: CALENDAR_PROJECTION_SOURCE_LIMIT + 1,
      profileId,
      startedAtGte: startAt,
      startedAtLt: endsAtExclusive,
      diaryDateGte: input.startDate,
      diaryDateLt: input.endDateExclusive,
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
    createDrizzlePlannedSessionRepository(getRequiredDb(ctx)).listOwnedRange({
      profileId,
      startDate: input.startDate,
      endDate: addDaysDateOnlyUtc(input.endDateExclusive, -1),
      limit: CALENDAR_PROJECTION_SOURCE_LIMIT + 1,
    }),
  ]);
  const linkedActivityIds = new Set(
    [
      ...items.map((event) => event.linked_activity_id),
      ...plannedSessionRange.items.map((session) =>
        session.lifecycle.status === "completed" && session.lifecycle.completion.state === "linked"
          ? session.lifecycle.completion.activityId
          : null,
      ),
    ].filter((id): id is string => Boolean(id)),
  );
  const rangeActivityIds = new Set(activityRows.map((activity) => activity.id));
  const missingLinkedActivityIds = [...linkedActivityIds].filter((id) => !rangeActivityIds.has(id));
  const linkedActivityRows = await repository.listCalendarCompletedActivitiesByIds({
    activityIds: missingLinkedActivityIds,
    profileId,
  });
  const activityDisplayById = new Map(
    [...activityRows, ...linkedActivityRows].map((activity) => [
      activity.id,
      toActivityDisplayModel({
        activity: { ...activity, type: activity.activity_category },
        viewerId: profileId,
      }),
    ]),
  );
  const visibleActivityRows = activityRows
    .filter((activity) => !linkedActivityIds.has(activity.id))
    .slice(0, CALENDAR_PROJECTION_SOURCE_LIMIT);
  const completedActivities = visibleActivityRows.flatMap((activity) => {
    const scheduledDate =
      activity.diary_date ??
      (activity.started_at
        ? getCalendarDateInIanaZone(activity.started_at, planningTimezone)
        : null);
    const display = activityDisplayById.get(activity.id);
    if (scheduledDate === null || !display) return [];
    return [
      {
        id: activity.id,
        name: activity.name,
        started_at: activity.started_at,
        scheduled_date: scheduledDate,
        display,
      },
    ];
  });
  const goals = profileGoalRecordSchema
    .array()
    .parse(goalRows.slice(0, CALENDAR_PROJECTION_SOURCE_LIMIT))
    .map(parseProfileGoalRecord)
    .map((goal) => ({
      ...goal,
      goalTypeLabel: formatGoalTypeLabel(goal),
      objectiveSummary: getGoalObjectiveSummary(goal),
    }));
  const groupActivityPlanIds = Array.from(
    new Set(
      selectedGroupEvents.items
        .map((event) => event.activity_plan_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const groupActivityPlanRows = await repository.listCalendarGroupActivityPlans({
    activityPlanIds: groupActivityPlanIds,
    profileId,
  });
  const groupActivityPlans = await estimateActivityPlans(
    groupActivityPlanRows,
    getRequiredDb(ctx),
    profileId,
  );
  const groupActivityPlanById = new Map(groupActivityPlans.map((plan) => [plan.id, plan]));
  const groupEvents = selectedGroupEvents.items.map((event) => {
    const selectedActivityPlan = event.activity_plan_id
      ? (groupActivityPlanById.get(event.activity_plan_id) ?? null)
      : null;
    return {
      ...event,
      // The event remains visible, but an inaccessible plan contributes no
      // identifier, label, structure, estimates, or projection metrics.
      activity_plan_id: selectedActivityPlan ? event.activity_plan_id : null,
      scheduled_date: getCalendarDateInIanaZone(event.starts_at, event.timezone),
      selectedActivityPlan,
      selectedActivityPlanOptionLabel: selectedActivityPlan?.name ?? null,
    };
  });
  // Mixed-source calendar projections are bounded range reads, not pageable
  // feeds. Every source advertises truncation; no event-only cursor is exposed.
  return assembleCalendarProjectionRange({
    viewerId: profileId,
    startDate: input.startDate,
    endDateExclusive: input.endDateExclusive,
    timezone: planningTimezone,
    events: items.map((event) => ({
      ...event,
      linkedActivityDisplay: event.linked_activity_id
        ? (activityDisplayById.get(event.linked_activity_id) ?? null)
        : null,
    })),
    plannedSessions: plannedSessionRange.items
      .slice(0, CALENDAR_PROJECTION_SOURCE_LIMIT)
      .map((session) => ({
        session,
        linkedActivityDisplay:
          session.lifecycle.status === "completed" &&
          session.lifecycle.completion.state === "linked" &&
          session.lifecycle.completion.activityId
            ? (activityDisplayById.get(session.lifecycle.completion.activityId) ?? null)
            : null,
      })),
    completedActivities,
    goals,
    groupEvents,
    truncation: {
      events: hasMore,
      plannedSessions:
        plannedSessionRange.truncated ||
        plannedSessionRange.items.length > CALENDAR_PROJECTION_SOURCE_LIMIT,
      completedActivities: activityRows.length > CALENDAR_PROJECTION_SOURCE_LIMIT,
      groupEvents: selectedGroupEvents.truncated,
      goals: goalRows.length > CALENDAR_PROJECTION_SOURCE_LIMIT,
    },
  });
}

export const eventsRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid(), personalize: z.boolean().default(false) }).strict())
    .query(async ({ ctx, input }) => {
      const eventReadRepository = getEventReadRepository(ctx);
      const data = await eventReadRepository
        .getOwnedEventById({
          eventId: input.id,
          profileId: ctx.session.user.id,
        })
        .catch(toSafeStoredActivityPlanError);

      if (!data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      const event = mapEventSafely(data as PlannedEventRecord);

      return { ...event, activityPlanSummary: null };
    }),

  create: protectedProcedure.input(eventCreateInputSchema).mutation(async ({ ctx, input }) => {
    return createEventUseCase({
      ctx,
      input,
      dependencies: {
        assertRestDayWritesBlocked,
        buildInsightRefreshHint,
        buildMaterializedRecurrenceOccurrences,
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
        getContentPermissions,
        getEventCompletionRepository,
        getEventWriteRepository,
        hasInstantChanged,
        mapEvent: (event) => mapEvent(event as PlannedEventRecord),
        normalizeEventUpdatePatch,
        toCoreEventType,
        toDateKey,
        toDayStartIso,
        toNextDayStartIso,
      },
    });
  }),

  delete: protectedProcedure.input(eventDeleteInputSchema).mutation(async ({ ctx, input }) => {
    return deleteEventUseCase({
      ctx,
      input,
      dependencies: {
        buildInsightRefreshHint,
        getContentPermissions,
        getEventCompletionRepository,
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
        const pool = activitiesByDate.get(dateKey);

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
});

/** Date-keyed personal schedule projections. Event identity and mutations remain on eventsRouter. */
export const calendarRouter = createTRPCRouter({
  planningRange: protectedProcedure
    .input(planningRangeRequestSchema)
    .output(planningRangeSchema)
    .query(({ ctx, input }) =>
      readPlanningRange({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        request: input,
      }),
    ),
  range: protectedProcedure
    .input(calendarRangeInputSchema)
    .query(({ ctx, input }) => readPersonalCalendarRange(ctx, ctx.session.user.id, input)),
  page: protectedProcedure.input(calendarPageInputSchema).query(async ({ ctx, input }) => {
    return readPersonalCalendarRange(ctx, ctx.session.user.id, {
      startDate: input.pageStartDate,
      endDateExclusive: addDaysDateOnlyUtc(input.pageStartDate, input.pageSizeDays),
      eventTypes: input.eventTypes,
      activityCategory: input.activityCategory,
      activityPlanId: input.activityPlanId,
      trainingPlanId: input.trainingPlanId,
      includeAdhoc: input.includeAdhoc,
      limit: input.limit,
    });
  }),
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
    return { projection: result };
  }),
});
