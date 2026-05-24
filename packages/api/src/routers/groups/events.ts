import { randomUUID } from "node:crypto";
import {
  copySeriesActivityPlansToOccurrenceInputSchema,
  createOneOffGroupEventInputSchema,
  createRecurringEventSeriesInputSchema,
  GROUP_EVENT_RSVP_STATUSES,
  listOneOffGroupEventsInputSchema,
  resolveGroupEventFallbackFields,
  rsvpEventSeriesInputSchema,
  rsvpOneOffGroupEventInputSchema,
  updateEventOccurrenceInputSchema,
  updateOneOffGroupEventInputSchema,
} from "@repo/core/groups";
import {
  activityPlans,
  activityRoutes,
  groupEventActivityPlans,
  groupEventRsvps,
  groupEventSeriesRsvps,
  groupEvents,
  groupMemberships,
  groups,
  notifications,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../../db";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  GROUP_ACCESS_LEVEL_PUBLIC,
  GROUP_MEMBERSHIP_STATUS_ACTIVE,
  getActiveGroupMembership,
  getCurrentProfileId,
  requireGroupAdmin,
  requireGroupViewAccess,
} from "./access";

const groupEventIdInputSchema = z.object({
  groupEventId: z.string().uuid("Invalid group event ID"),
});
const cancelGroupEventInputSchema = groupEventIdInputSchema.extend({
  scope: z.enum(["single", "series"]).default("single"),
});
const seriesOccurrencesInputSchema = groupEventIdInputSchema.extend({
  startsAfter: z.string().datetime("Invalid datetime").optional(),
  includeCancelled: z.boolean().default(false),
  cursor: z.string().min(1).nullable().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
const myCalendarGroupEventsInputSchema = listOneOffGroupEventsInputSchema.omit({ groupId: true });
const currentEventPlanOptionsInputSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
  referenceAt: z.string().datetime("Invalid datetime").optional(),
  lookaheadEndsAt: z.string().datetime("Invalid datetime").optional(),
});

const GROUP_EVENT_RSVP_STATUS_ACCEPTED = GROUP_EVENT_RSVP_STATUSES[0];
const GROUP_EVENT_RSVP_STATUS_DECLINED = GROUP_EVENT_RSVP_STATUSES[1];
const GROUP_EVENT_RSVP_STATUS_TENTATIVE = GROUP_EVENT_RSVP_STATUSES[2];

type GroupEventRow = typeof groupEvents.$inferSelect;
type GroupEventActivityPlanRow = typeof groupEventActivityPlans.$inferSelect;
type GroupEventRsvpRow = typeof groupEventRsvps.$inferSelect;
type GroupEventSeriesRsvpRow = typeof groupEventSeriesRsvps.$inferSelect;
type GroupEventSummaryGroupRow = Pick<
  typeof groups.$inferSelect,
  "id" | "name" | "slug" | "avatar_url"
>;
type MaterializedGroupEventOccurrence = {
  endsAt: string | null;
  occurrenceKey: string;
  startsAt: string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function parseDateTime(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function parseRRule(rule: string): Map<string, string> {
  const body = rule.trim().startsWith("RRULE:") ? rule.trim().slice(6) : rule.trim();
  return new Map(
    body.split(";").map((part) => {
      const [key, value] = part.split("=");
      return [key?.toUpperCase() ?? "", value ?? ""];
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

  throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid recurrence end date" });
}

function addOccurrenceInterval(date: Date, frequency: string, interval: number, index: number) {
  const next = new Date(date);
  if (frequency === "DAILY") {
    next.setUTCDate(date.getUTCDate() + index * interval);
    return next;
  }
  if (frequency === "WEEKLY") {
    next.setUTCDate(date.getUTCDate() + index * interval * 7);
    return next;
  }
  if (frequency === "MONTHLY") {
    next.setUTCMonth(date.getUTCMonth() + index * interval);
    return next;
  }

  throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported recurrence frequency" });
}

function buildMaterializedGroupEventOccurrences(input: {
  endsAt: string | null;
  recurrenceRule: string;
  startsAt: string;
}): MaterializedGroupEventOccurrence[] {
  const tokens = parseRRule(input.recurrenceRule);
  const frequency = tokens.get("FREQ");
  if (!frequency || !["DAILY", "WEEKLY", "MONTHLY"].includes(frequency)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported recurrence frequency" });
  }

  const countToken = tokens.get("COUNT");
  const untilToken = tokens.get("UNTIL");
  if (!countToken && !untilToken) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recurring events must have an end date" });
  }

  const interval = Number(tokens.get("INTERVAL") ?? "1");
  if (!Number.isInteger(interval) || interval < 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recurrence interval must be positive" });
  }

  const start = new Date(input.startsAt);
  const end = input.endsAt ? new Date(input.endsAt) : null;
  const durationMs = end ? end.getTime() - start.getTime() : null;
  const maxOccurrences = 366;
  const count = countToken ? Number(countToken) : maxOccurrences;
  if (!Number.isInteger(count) || count < 1 || count > maxOccurrences) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Recurring events support 1-${maxOccurrences} occurrences`,
    });
  }

  const untilDateKey = untilToken ? parseRRuleUntilDateKey(untilToken) : null;
  const occurrences: MaterializedGroupEventOccurrence[] = [];

  for (let index = 0; index < count; index++) {
    const occurrenceStart = addOccurrenceInterval(start, frequency, interval, index);
    const occurrenceKey = occurrenceStart.toISOString().slice(0, 10);
    if (untilDateKey && occurrenceKey > untilDateKey) break;

    occurrences.push({
      startsAt: occurrenceStart.toISOString(),
      endsAt:
        durationMs === null ? null : new Date(occurrenceStart.getTime() + durationMs).toISOString(),
      occurrenceKey,
    });
  }

  if (occurrences.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recurrence creates no occurrences" });
  }

  return occurrences;
}

function serializeActivityPlanOption(option: GroupEventActivityPlanRow) {
  return {
    id: option.id,
    group_event_id: option.group_event_id,
    activity_plan_id: option.activity_plan_id,
    label: option.label,
    sort_order: option.sort_order,
    created_at: toIsoString(option.created_at),
  };
}

function serializeRsvp(rsvp: GroupEventRsvpRow | null) {
  if (!rsvp) return null;

  return {
    group_event_id: rsvp.group_event_id,
    profile_id: rsvp.profile_id,
    status: rsvp.status,
    selected_group_event_activity_plan_id: rsvp.selected_group_event_activity_plan_id,
    created_at: toIsoString(rsvp.created_at),
    updated_at: toIsoString(rsvp.updated_at),
  };
}

function serializeSeriesRsvp(rsvp: GroupEventSeriesRsvpRow | null) {
  if (!rsvp) return null;

  return {
    group_event_series_id: rsvp.group_event_series_id,
    profile_id: rsvp.profile_id,
    status: rsvp.status,
    created_at: toIsoString(rsvp.created_at),
    updated_at: toIsoString(rsvp.updated_at),
  };
}

function serializeGroupEvent(
  event: GroupEventRow,
  input: {
    activityPlanOptions: GroupEventActivityPlanRow[];
    acceptedRsvpCount: number;
    group?: GroupEventSummaryGroupRow | null;
    viewerRsvp: GroupEventRsvpRow | null;
    series?: GroupEventRow | null;
    viewerSeriesRsvp?: GroupEventSeriesRsvpRow | null;
  },
) {
  const resolved = resolveGroupEventFallbackFields(
    {
      title: event.title,
      description: event.description,
      timezone: event.timezone,
      locationName: event.location_name,
      routeId: event.route_id,
    },
    input.series
      ? {
          title: input.series.title,
          description: input.series.description,
          timezone: input.series.timezone,
          locationName: input.series.location_name,
          routeId: input.series.route_id,
        }
      : null,
  );

  return {
    id: event.id,
    group_id: event.group_id,
    series_id: event.series_id,
    occurrence_key: event.occurrence_key,
    created_by_profile_id: event.created_by_profile_id,
    title: resolved.title,
    description: resolved.description,
    starts_at: toIsoString(event.starts_at),
    ends_at: event.ends_at ? toIsoString(event.ends_at) : null,
    timezone: resolved.timezone,
    recurrence_rule: event.recurrence_rule,
    recurrence_timezone: event.recurrence_timezone,
    location_name: resolved.locationName,
    route_id: resolved.routeId,
    group: input.group
      ? {
          id: input.group.id,
          name: input.group.name,
          slug: input.group.slug,
          avatar_url: input.group.avatar_url,
        }
      : null,
    cancelled_at: event.cancelled_at ? toIsoString(event.cancelled_at) : null,
    created_at: toIsoString(event.created_at),
    updated_at: toIsoString(event.updated_at),
    is_recurring_series: event.series_id === null && event.recurrence_rule !== null,
    is_recurring_occurrence: event.series_id !== null,
    activityPlanOptions: input.activityPlanOptions.map(serializeActivityPlanOption),
    acceptedRsvpCount: input.acceptedRsvpCount,
    viewerRsvp: serializeRsvp(input.viewerRsvp),
    viewerSeriesRsvp: serializeSeriesRsvp(input.viewerSeriesRsvp ?? null),
  };
}

function pageResult<T>(items: T[], limit: number, getCursor: (item: T) => string) {
  const hasMore = items.length > limit;
  const visibleItems = hasMore ? items.slice(0, limit) : items;

  return {
    items: visibleItems,
    nextCursor:
      hasMore && visibleItems.length > 0
        ? getCursor(visibleItems[visibleItems.length - 1] as T)
        : null,
  };
}

function assertUniqueActivityPlanIds(activityPlans: { activityPlanId: string }[] | undefined) {
  if (!activityPlans) return;

  const uniqueIds = new Set(activityPlans.map((option) => option.activityPlanId));
  if (uniqueIds.size !== activityPlans.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Activity plan options must be unique" });
  }
}

function canUseActivityPlanForGroupEvent(
  activityPlan: Pick<
    typeof activityPlans.$inferSelect,
    "profile_id" | "template_visibility" | "is_system_template"
  >,
  profileId: string,
) {
  return (
    activityPlan.profile_id === profileId ||
    activityPlan.template_visibility === "public" ||
    activityPlan.is_system_template
  );
}

function canUseRouteForGroupEvent(
  route: Pick<
    typeof activityRoutes.$inferSelect,
    "profile_id" | "is_public" | "is_system_template"
  >,
  profileId: string,
) {
  return route.profile_id === profileId || route.is_public || route.is_system_template;
}

async function assertActivityPlansAvailableForGroupEvent(
  db: Pick<ReturnType<typeof getRequiredDb>, "select">,
  activityPlanInputs: { activityPlanId: string }[] | undefined,
  profileId: string,
) {
  if (!activityPlanInputs?.length) return;

  const activityPlanIds = activityPlanInputs.map((option) => option.activityPlanId);
  const rows = await db
    .select({
      id: activityPlans.id,
      profile_id: activityPlans.profile_id,
      template_visibility: activityPlans.template_visibility,
      is_system_template: activityPlans.is_system_template,
    })
    .from(activityPlans)
    .where(inArray(activityPlans.id, activityPlanIds));

  const accessibleIds = new Set(
    rows
      .filter((activityPlan) => canUseActivityPlanForGroupEvent(activityPlan, profileId))
      .map((activityPlan) => activityPlan.id),
  );

  if (accessibleIds.size !== activityPlanIds.length) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Activity plan is not available for this group event",
    });
  }
}

async function assertRouteAvailableForGroupEvent(
  db: Pick<ReturnType<typeof getRequiredDb>, "select">,
  routeId: string | null | undefined,
  profileId: string,
) {
  if (!routeId) return;

  const [route] = await db
    .select({
      id: activityRoutes.id,
      profile_id: activityRoutes.profile_id,
      is_public: activityRoutes.is_public,
      is_system_template: activityRoutes.is_system_template,
    })
    .from(activityRoutes)
    .where(eq(activityRoutes.id, routeId))
    .limit(1);

  if (!route || !canUseRouteForGroupEvent(route, profileId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Route is not available for this group event",
    });
  }
}

async function assertGroupEventResourcesAvailable(
  db: Pick<ReturnType<typeof getRequiredDb>, "select">,
  input: {
    activityPlans?: { activityPlanId: string }[];
    profileId: string;
    routeId?: string | null;
  },
) {
  await assertActivityPlansAvailableForGroupEvent(db, input.activityPlans, input.profileId);
  await assertRouteAvailableForGroupEvent(db, input.routeId, input.profileId);
}

async function requireGroupEventRsvpAccess(
  db: ReturnType<typeof getRequiredDb>,
  groupId: string,
  profileId: string,
) {
  const membership = await getActiveGroupMembership(db, groupId, profileId);

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Active group membership required to RSVP",
    });
  }

  return membership;
}

async function notifyActiveGroupMembersOfCancellation(
  db: Pick<ReturnType<typeof getRequiredDb>, "insert" | "select">,
  input: {
    actorProfileId: string;
    cancelledAt: Date;
    groupEventId: string;
    groupId: string;
  },
) {
  const members = await db
    .select({ profile_id: groupMemberships.profile_id })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.group_id, input.groupId),
        eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
      ),
    );
  const recipients = members.filter((member) => member.profile_id !== input.actorProfileId);

  if (recipients.length === 0) return;

  await db.insert(notifications).values(
    recipients.map((recipient) => ({
      id: randomUUID(),
      user_id: recipient.profile_id,
      actor_id: input.actorProfileId,
      type: "group_event_cancelled" as const,
      entity_id: input.groupEventId,
      created_at: input.cancelledAt,
    })),
  );
}

async function getActiveGroup(db: ReturnType<typeof getRequiredDb>, groupId: string) {
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), isNull(groups.deleted_at)))
    .limit(1);

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
  }

  return group;
}

async function getGroupEventWithActiveGroup(
  db: ReturnType<typeof getRequiredDb>,
  groupEventId: string,
) {
  const [row] = await db
    .select({ event: groupEvents, group: groups })
    .from(groupEvents)
    .innerJoin(groups, eq(groups.id, groupEvents.group_id))
    .where(and(eq(groupEvents.id, groupEventId), isNull(groups.deleted_at)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group event not found" });
  }

  return row;
}

async function getGroupEventCursorFilter(
  db: ReturnType<typeof getRequiredDb>,
  groupId: string | null,
  cursor?: string | null,
) {
  if (!cursor) return undefined;

  const [cursorEvent] = await db
    .select({ id: groupEvents.id, starts_at: groupEvents.starts_at })
    .from(groupEvents)
    .where(and(groupId ? eq(groupEvents.group_id, groupId) : undefined, eq(groupEvents.id, cursor)))
    .limit(1);

  if (!cursorEvent) return undefined;

  return or(
    gt(groupEvents.starts_at, cursorEvent.starts_at),
    and(eq(groupEvents.starts_at, cursorEvent.starts_at), gt(groupEvents.id, cursorEvent.id)),
  );
}

async function serializeGroupEventsForViewer(
  db: ReturnType<typeof getRequiredDb>,
  events: GroupEventRow[],
  profileId: string,
  input: { groupById?: Map<string, GroupEventSummaryGroupRow> } = {},
) {
  if (events.length === 0) return [];

  const eventIds = events.map((event) => event.id);
  const seriesIds = Array.from(
    new Set(events.map((event) => event.series_id).filter((id): id is string => Boolean(id))),
  );
  const recurringSeriesRootIds = events
    .filter((event) => event.series_id === null && event.recurrence_rule !== null)
    .map((event) => event.id);
  const seriesRsvpIds = Array.from(new Set([...seriesIds, ...recurringSeriesRootIds]));
  const allOptionEventIds = Array.from(new Set([...eventIds, ...seriesIds]));
  const [seriesRows, activityPlanOptions, rsvps, seriesRsvps, acceptedRsvps] = await Promise.all([
    seriesIds.length > 0
      ? db.select().from(groupEvents).where(inArray(groupEvents.id, seriesIds))
      : Promise.resolve([]),
    db
      .select()
      .from(groupEventActivityPlans)
      .where(inArray(groupEventActivityPlans.group_event_id, allOptionEventIds))
      .orderBy(asc(groupEventActivityPlans.sort_order), asc(groupEventActivityPlans.created_at)),
    db
      .select()
      .from(groupEventRsvps)
      .where(
        and(
          inArray(groupEventRsvps.group_event_id, eventIds),
          eq(groupEventRsvps.profile_id, profileId),
        ),
      ),
    seriesRsvpIds.length > 0
      ? db
          .select()
          .from(groupEventSeriesRsvps)
          .where(
            and(
              inArray(groupEventSeriesRsvps.group_event_series_id, seriesRsvpIds),
              eq(groupEventSeriesRsvps.profile_id, profileId),
            ),
          )
      : Promise.resolve([]),
    db
      .select()
      .from(groupEventRsvps)
      .where(
        and(
          inArray(groupEventRsvps.group_event_id, eventIds),
          eq(groupEventRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
        ),
      ),
  ]);

  const optionsByEventId = new Map<string, GroupEventActivityPlanRow[]>();
  for (const option of activityPlanOptions) {
    const options = optionsByEventId.get(option.group_event_id) ?? [];
    options.push(option);
    optionsByEventId.set(option.group_event_id, options);
  }

  const rsvpByEventId = new Map(rsvps.map((rsvp) => [rsvp.group_event_id, rsvp]));
  const acceptedRsvpCountByEventId = new Map<string, number>();
  for (const rsvp of acceptedRsvps) {
    acceptedRsvpCountByEventId.set(
      rsvp.group_event_id,
      (acceptedRsvpCountByEventId.get(rsvp.group_event_id) ?? 0) + 1,
    );
  }
  const seriesById = new Map(seriesRows.map((series) => [series.id, series]));
  const seriesRsvpBySeriesId = new Map(
    seriesRsvps.map((rsvp) => [rsvp.group_event_series_id, rsvp]),
  );

  return events.map((event) => {
    const series = event.series_id ? (seriesById.get(event.series_id) ?? null) : null;
    // Occurrence options intentionally fall back to the series root until copied or overridden.
    const occurrenceOptions = optionsByEventId.get(event.id) ?? [];
    const seriesOptions = event.series_id ? (optionsByEventId.get(event.series_id) ?? []) : [];

    return serializeGroupEvent(event, {
      acceptedRsvpCount: acceptedRsvpCountByEventId.get(event.id) ?? 0,
      activityPlanOptions: occurrenceOptions.length > 0 ? occurrenceOptions : seriesOptions,
      group: input.groupById?.get(event.group_id) ?? null,
      viewerRsvp: rsvpByEventId.get(event.id) ?? null,
      series,
      viewerSeriesRsvp: seriesRsvpBySeriesId.get(event.series_id ?? event.id) ?? null,
    });
  });
}

async function replaceActivityPlanOptions(
  db: Pick<ReturnType<typeof getRequiredDb>, "delete" | "insert">,
  groupEventId: string,
  activityPlans: { activityPlanId: string; label?: string | null; sortOrder?: number }[],
) {
  await db
    .delete(groupEventActivityPlans)
    .where(eq(groupEventActivityPlans.group_event_id, groupEventId));

  if (activityPlans.length === 0) return;

  await db.insert(groupEventActivityPlans).values(
    activityPlans.map((option, index) => ({
      group_event_id: groupEventId,
      activity_plan_id: option.activityPlanId,
      label: option.label ?? null,
      sort_order: option.sortOrder ?? index,
    })),
  );
}

async function getResolvedActivityPlanOptions(
  db: ReturnType<typeof getRequiredDb>,
  event: GroupEventRow,
) {
  const eventIds = event.series_id ? [event.id, event.series_id] : [event.id];
  const options = await db
    .select()
    .from(groupEventActivityPlans)
    .where(inArray(groupEventActivityPlans.group_event_id, eventIds))
    .orderBy(asc(groupEventActivityPlans.sort_order), asc(groupEventActivityPlans.created_at));

  const occurrenceOptions = options.filter((option) => option.group_event_id === event.id);
  if (occurrenceOptions.length > 0 || !event.series_id) return occurrenceOptions;

  return options.filter((option) => option.group_event_id === event.series_id);
}

async function getAcceptedRsvpCount(db: ReturnType<typeof getRequiredDb>, groupEventId: string) {
  const rsvps = await db
    .select()
    .from(groupEventRsvps)
    .where(
      and(
        eq(groupEventRsvps.group_event_id, groupEventId),
        eq(groupEventRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
      ),
    );

  return rsvps.length;
}

function assertSeriesRoot(event: GroupEventRow) {
  if (event.series_id !== null || event.recurrence_rule === null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Group event is not a recurring series" });
  }
}

function assertSeriesOccurrence(event: GroupEventRow) {
  if (event.series_id === null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Group event is not a recurring occurrence",
    });
  }
}

export const groupEventsRouter = createTRPCRouter({
  list: protectedProcedure.input(listOneOffGroupEventsInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const group = await getActiveGroup(db, input.groupId);
    await requireGroupViewAccess(db, {
      groupId: group.id,
      profileId,
      accessLevel: group.access_level,
    });

    const cursorFilter = await getGroupEventCursorFilter(db, group.id, input.cursor);
    const rows = await db
      .select()
      .from(groupEvents)
      .where(
        and(
          eq(groupEvents.group_id, group.id),
          input.includeCancelled ? undefined : isNull(groupEvents.cancelled_at),
          // Series roots are scheduling templates; lists should show only concrete events.
          or(isNull(groupEvents.recurrence_rule), isNotNull(groupEvents.series_id)),
          input.startsAfter ? gte(groupEvents.starts_at, new Date(input.startsAfter)) : undefined,
          input.startsBefore ? lte(groupEvents.starts_at, new Date(input.startsBefore)) : undefined,
          cursorFilter,
        ),
      )
      .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
      .limit(input.limit + 1);

    const items = await serializeGroupEventsForViewer(db, rows, profileId);
    return pageResult(items, input.limit, (event) => event.id);
  }),

  myUpcomingGroupEvents: protectedProcedure
    .input(myCalendarGroupEventsInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const cursorFilter = await getGroupEventCursorFilter(db, null, input.cursor);

      const rows = await db
        .select({ event: groupEvents, group: groups })
        .from(groupMemberships)
        .innerJoin(groups, eq(groups.id, groupMemberships.group_id))
        .innerJoin(groupEvents, eq(groupEvents.group_id, groups.id))
        .where(
          and(
            eq(groupMemberships.profile_id, profileId),
            eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
            isNull(groups.deleted_at),
            input.includeCancelled ? undefined : isNull(groupEvents.cancelled_at),
            // Series roots are scheduling templates; lists should show only concrete events.
            or(isNull(groupEvents.recurrence_rule), isNotNull(groupEvents.series_id)),
            input.startsAfter
              ? gte(groupEvents.starts_at, new Date(input.startsAfter))
              : gte(groupEvents.starts_at, new Date()),
            input.startsBefore
              ? lte(groupEvents.starts_at, new Date(input.startsBefore))
              : undefined,
            cursorFilter,
          ),
        )
        .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
        .limit(input.limit + 1);

      const groupById = new Map<string, GroupEventSummaryGroupRow>();
      for (const row of rows) {
        groupById.set(row.group.id, row.group);
      }

      const items = await serializeGroupEventsForViewer(
        db,
        rows.map((row) => row.event),
        profileId,
        { groupById },
      );
      return pageResult(items, input.limit, (event) => event.id);
    }),

  detail: protectedProcedure.input(groupEventIdInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const { event, group } = await getGroupEventWithActiveGroup(db, input.groupEventId);
    await requireGroupViewAccess(db, {
      groupId: group.id,
      profileId,
      accessLevel: group.access_level,
    });

    const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId, {
      groupById: new Map([[group.id, group]]),
    });
    return { event: serializedEvent };
  }),

  create: protectedProcedure
    .input(createOneOffGroupEventInputSchema)
    .mutation(async ({ ctx, input }) => {
      assertUniqueActivityPlanIds(input.activityPlans);

      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const group = await getActiveGroup(db, input.groupId);
      await requireGroupAdmin(db, input.groupId, profileId);
      await assertGroupEventResourcesAvailable(db, {
        activityPlans: input.activityPlans,
        profileId,
        routeId: input.routeId,
      });

      const event = await db.transaction(async (tx) => {
        const [createdEvent] = await tx
          .insert(groupEvents)
          .values({
            group_id: input.groupId,
            created_by_profile_id: profileId,
            title: input.title,
            description: input.description ?? null,
            starts_at: new Date(input.startsAt),
            ends_at: parseDateTime(input.endsAt),
            timezone: input.timezone ?? null,
            location_name: input.locationName ?? null,
            route_id: input.routeId ?? null,
          })
          .returning();

        if (!createdEvent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Group event could not be created" });
        }

        if (input.activityPlans?.length) {
          await replaceActivityPlanOptions(tx, createdEvent.id, input.activityPlans);
        }

        return createdEvent;
      });

      const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId, {
        groupById: new Map([[group.id, group]]),
      });
      return { event: serializedEvent };
    }),

  createRecurringEventSeries: protectedProcedure
    .input(createRecurringEventSeriesInputSchema)
    .mutation(async ({ ctx, input }) => {
      assertUniqueActivityPlanIds(input.activityPlans);

      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      await getActiveGroup(db, input.groupId);
      await requireGroupAdmin(db, input.groupId, profileId);
      await assertGroupEventResourcesAvailable(db, {
        activityPlans: input.activityPlans,
        profileId,
        routeId: input.routeId,
      });

      const event = await db.transaction(async (tx) => {
        const [createdEvent] = await tx
          .insert(groupEvents)
          .values({
            group_id: input.groupId,
            created_by_profile_id: profileId,
            title: input.title,
            description: input.description ?? null,
            starts_at: new Date(input.startsAt),
            ends_at: parseDateTime(input.endsAt),
            timezone: input.timezone,
            recurrence_rule: input.recurrenceRule,
            recurrence_timezone: input.recurrenceTimezone ?? input.timezone,
            location_name: input.locationName ?? null,
            route_id: input.routeId ?? null,
          })
          .returning();

        if (!createdEvent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Recurring group event series could not be created",
          });
        }

        if (input.activityPlans?.length) {
          await replaceActivityPlanOptions(tx, createdEvent.id, input.activityPlans);
        }

        const occurrences = buildMaterializedGroupEventOccurrences({
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          recurrenceRule: input.recurrenceRule,
        });

        if (occurrences.length > 0) {
          await tx
            .insert(groupEvents)
            .values(
              occurrences.map((occurrence) => ({
                group_id: input.groupId,
                series_id: createdEvent.id,
                occurrence_key: occurrence.occurrenceKey,
                created_by_profile_id: profileId,
                title: null,
                description: null,
                starts_at: new Date(occurrence.startsAt),
                ends_at: parseDateTime(occurrence.endsAt),
                timezone: null,
                location_name: null,
                route_id: null,
              })),
            )
            .onConflictDoNothing();
        }

        return createdEvent;
      });

      const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId);
      return { event: serializedEvent };
    }),

  seriesOccurrences: protectedProcedure
    .input(seriesOccurrencesInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const { event, group } = await getGroupEventWithActiveGroup(db, input.groupEventId);
      await requireGroupViewAccess(db, {
        groupId: group.id,
        profileId,
        accessLevel: group.access_level,
      });

      const groupEventSeriesId = event.series_id ?? event.id;
      if (event.series_id === null && event.recurrence_rule === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Group event is not a recurring series",
        });
      }

      const cursorFilter = await getGroupEventCursorFilter(db, null, input.cursor);
      const rows = await db
        .select()
        .from(groupEvents)
        .where(
          and(
            eq(groupEvents.series_id, groupEventSeriesId),
            input.includeCancelled ? undefined : isNull(groupEvents.cancelled_at),
            input.startsAfter ? gte(groupEvents.starts_at, new Date(input.startsAfter)) : undefined,
            cursorFilter,
          ),
        )
        .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
        .limit(input.limit + 1);

      const items = await serializeGroupEventsForViewer(db, rows, profileId);
      return pageResult(items, input.limit, (event) => event.id);
    }),

  update: protectedProcedure
    .input(updateOneOffGroupEventInputSchema)
    .mutation(async ({ ctx, input }) => {
      assertUniqueActivityPlanIds(input.activityPlans);

      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const { event: existingEvent } = await getGroupEventWithActiveGroup(db, input.groupEventId);
      await requireGroupAdmin(db, existingEvent.group_id, profileId);
      await assertGroupEventResourcesAvailable(db, {
        activityPlans: input.activityPlans,
        profileId,
        routeId: input.routeId,
      });

      const event = await db.transaction(async (tx) => {
        const [updatedEvent] = await tx
          .update(groupEvents)
          .set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description ?? null } : {}),
            ...(input.startsAt !== undefined ? { starts_at: new Date(input.startsAt) } : {}),
            ...(input.endsAt !== undefined ? { ends_at: parseDateTime(input.endsAt) } : {}),
            ...(input.timezone !== undefined ? { timezone: input.timezone ?? null } : {}),
            ...(input.locationName !== undefined
              ? { location_name: input.locationName ?? null }
              : {}),
            ...(input.routeId !== undefined ? { route_id: input.routeId ?? null } : {}),
            ...(input.cancelledAt !== undefined
              ? { cancelled_at: parseDateTime(input.cancelledAt) }
              : {}),
            updated_at: new Date(),
          })
          .where(eq(groupEvents.id, input.groupEventId))
          .returning();

        if (!updatedEvent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Group event not found" });
        }

        if (input.activityPlans !== undefined) {
          await replaceActivityPlanOptions(tx, input.groupEventId, input.activityPlans);
        }

        return updatedEvent;
      });

      const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId);
      return { event: serializedEvent };
    }),

  updateEventOccurrence: protectedProcedure
    .input(updateEventOccurrenceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const { event: existingEvent } = await getGroupEventWithActiveGroup(db, input.groupEventId);
      assertSeriesOccurrence(existingEvent);
      await requireGroupAdmin(db, existingEvent.group_id, profileId);
      await assertRouteAvailableForGroupEvent(db, input.routeId, profileId);

      const [event] = await db
        .update(groupEvents)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.startsAt !== undefined ? { starts_at: new Date(input.startsAt) } : {}),
          ...(input.endsAt !== undefined ? { ends_at: parseDateTime(input.endsAt) } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone ?? null } : {}),
          ...(input.locationName !== undefined
            ? { location_name: input.locationName ?? null }
            : {}),
          ...(input.routeId !== undefined ? { route_id: input.routeId ?? null } : {}),
          ...(input.cancelledAt !== undefined
            ? { cancelled_at: parseDateTime(input.cancelledAt) }
            : {}),
          updated_at: new Date(),
        })
        .where(eq(groupEvents.id, input.groupEventId))
        .returning();

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Group event not found" });
      }

      const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId);
      return { event: serializedEvent };
    }),

  copySeriesActivityPlansToOccurrence: protectedProcedure
    .input(copySeriesActivityPlansToOccurrenceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const [{ event: series }, { event: occurrence }] = await Promise.all([
        getGroupEventWithActiveGroup(db, input.groupEventSeriesId),
        getGroupEventWithActiveGroup(db, input.groupEventOccurrenceId),
      ]);
      assertSeriesRoot(series);
      assertSeriesOccurrence(occurrence);

      if (occurrence.series_id !== series.id || occurrence.group_id !== series.group_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Occurrence does not belong to the recurring series",
        });
      }

      await requireGroupAdmin(db, series.group_id, profileId);

      const copiedOptions = await db.transaction(async (tx) => {
        const seriesOptions = await tx
          .select()
          .from(groupEventActivityPlans)
          .where(eq(groupEventActivityPlans.group_event_id, series.id))
          .orderBy(
            asc(groupEventActivityPlans.sort_order),
            asc(groupEventActivityPlans.created_at),
          );

        if (seriesOptions.length > 0) {
          await tx
            .insert(groupEventActivityPlans)
            .values(
              seriesOptions.map((option) => ({
                group_event_id: occurrence.id,
                activity_plan_id: option.activity_plan_id,
                label: option.label,
                sort_order: option.sort_order,
              })),
            )
            .onConflictDoNothing();
        }

        return tx
          .select()
          .from(groupEventActivityPlans)
          .where(eq(groupEventActivityPlans.group_event_id, occurrence.id))
          .orderBy(
            asc(groupEventActivityPlans.sort_order),
            asc(groupEventActivityPlans.created_at),
          );
      });

      return { activityPlanOptions: copiedOptions.map(serializeActivityPlanOption) };
    }),

  cancel: protectedProcedure.input(cancelGroupEventInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const { event: existingEvent } = await getGroupEventWithActiveGroup(db, input.groupEventId);
    await requireGroupAdmin(db, existingEvent.group_id, profileId);

    const cancelledAt = new Date();
    const [event] = await db.transaction(async (tx) => {
      const [cancelledEvent] = await tx
        .update(groupEvents)
        .set({ cancelled_at: cancelledAt, updated_at: cancelledAt })
        .where(eq(groupEvents.id, input.groupEventId))
        .returning();

      if (input.scope === "series") {
        const seriesId = existingEvent.series_id ?? existingEvent.id;
        await tx
          .update(groupEvents)
          .set({ cancelled_at: cancelledAt, updated_at: cancelledAt })
          .where(or(eq(groupEvents.id, seriesId), eq(groupEvents.series_id, seriesId)));
      }

      await notifyActiveGroupMembersOfCancellation(tx, {
        actorProfileId: profileId,
        cancelledAt,
        groupEventId: input.groupEventId,
        groupId: existingEvent.group_id,
      });

      return [cancelledEvent];
    });

    const [serializedEvent] = await serializeGroupEventsForViewer(
      db,
      [event as GroupEventRow],
      profileId,
    );
    return { event: serializedEvent };
  }),

  rsvp: protectedProcedure
    .input(rsvpOneOffGroupEventInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const { event, group } = await getGroupEventWithActiveGroup(db, input.groupEventId);
      await requireGroupEventRsvpAccess(db, group.id, profileId);

      if (input.status === null) {
        await db
          .delete(groupEventRsvps)
          .where(
            and(
              eq(groupEventRsvps.group_event_id, input.groupEventId),
              eq(groupEventRsvps.profile_id, profileId),
            ),
          );

        const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId);
        return {
          event: serializedEvent,
          rsvp: null,
        };
      }

      const activityPlanOptions = await getResolvedActivityPlanOptions(db, event);

      let selectedGroupEventActivityPlanId = input.selectedGroupEventActivityPlanId ?? null;
      if (selectedGroupEventActivityPlanId) {
        const selectedOption = activityPlanOptions.find(
          (option) => option.id === selectedGroupEventActivityPlanId,
        );
        if (!selectedOption) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected activity plan option is not part of this event",
          });
        }
      }

      if (
        input.status === GROUP_EVENT_RSVP_STATUS_ACCEPTED &&
        !selectedGroupEventActivityPlanId &&
        activityPlanOptions.length > 0
      ) {
        selectedGroupEventActivityPlanId = activityPlanOptions[0]?.id ?? null;
      }
      if (
        input.status === GROUP_EVENT_RSVP_STATUS_DECLINED ||
        input.status === GROUP_EVENT_RSVP_STATUS_TENTATIVE
      ) {
        selectedGroupEventActivityPlanId = null;
      }

      const [rsvp] = await db
        .insert(groupEventRsvps)
        .values({
          group_event_id: input.groupEventId,
          profile_id: profileId,
          status: input.status,
          selected_group_event_activity_plan_id: selectedGroupEventActivityPlanId,
        })
        .onConflictDoUpdate({
          target: [groupEventRsvps.group_event_id, groupEventRsvps.profile_id],
          set: {
            status: input.status,
            selected_group_event_activity_plan_id: selectedGroupEventActivityPlanId,
            updated_at: new Date(),
          },
        })
        .returning();

      const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId);
      return {
        event: serializedEvent,
        rsvp: serializeRsvp(rsvp as GroupEventRsvpRow),
      };
    }),

  rsvpEventSeries: protectedProcedure
    .input(rsvpEventSeriesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const { event, group } = await getGroupEventWithActiveGroup(db, input.groupEventSeriesId);
      assertSeriesRoot(event);
      await requireGroupEventRsvpAccess(db, group.id, profileId);

      if (input.status === null) {
        await db
          .delete(groupEventSeriesRsvps)
          .where(
            and(
              eq(groupEventSeriesRsvps.group_event_series_id, input.groupEventSeriesId),
              eq(groupEventSeriesRsvps.profile_id, profileId),
            ),
          );

        const activityPlanOptions = await getResolvedActivityPlanOptions(db, event);
        const acceptedRsvpCount = await getAcceptedRsvpCount(db, event.id);
        return {
          event: serializeGroupEvent(event, {
            acceptedRsvpCount,
            activityPlanOptions,
            viewerRsvp: null,
            viewerSeriesRsvp: null,
          }),
          rsvp: null,
        };
      }

      const [rsvp] = await db
        .insert(groupEventSeriesRsvps)
        .values({
          group_event_series_id: input.groupEventSeriesId,
          profile_id: profileId,
          status: input.status,
        })
        .onConflictDoUpdate({
          target: [groupEventSeriesRsvps.group_event_series_id, groupEventSeriesRsvps.profile_id],
          set: { status: input.status, updated_at: new Date() },
        })
        .returning();

      const activityPlanOptions = await getResolvedActivityPlanOptions(db, event);
      const acceptedRsvpCount = await getAcceptedRsvpCount(db, event.id);
      return {
        event: serializeGroupEvent(event, {
          acceptedRsvpCount,
          activityPlanOptions,
          viewerRsvp: null,
          viewerSeriesRsvp: rsvp as GroupEventSeriesRsvpRow,
        }),
        rsvp: serializeSeriesRsvp(rsvp as GroupEventSeriesRsvpRow),
      };
    }),

  currentEventPlanOptions: protectedProcedure
    .input(currentEventPlanOptionsInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const group = await getActiveGroup(db, input.groupId);
      await requireGroupViewAccess(db, {
        groupId: group.id,
        profileId,
        accessLevel: group.access_level,
      });

      const referenceAt = input.referenceAt ? new Date(input.referenceAt) : new Date();
      const [event] = await db
        .select()
        .from(groupEvents)
        .where(
          and(
            eq(groupEvents.group_id, group.id),
            isNull(groupEvents.cancelled_at),
            // Series roots are templates; this query only returns concrete one-off or occurrence rows.
            or(isNull(groupEvents.recurrence_rule), isNotNull(groupEvents.series_id)),
            or(
              gte(groupEvents.starts_at, referenceAt),
              and(lte(groupEvents.starts_at, referenceAt), gte(groupEvents.ends_at, referenceAt)),
            ),
            input.lookaheadEndsAt
              ? lte(groupEvents.starts_at, new Date(input.lookaheadEndsAt))
              : undefined,
          ),
        )
        .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
        .limit(1);

      if (!event) {
        return { event: null, activityPlanOptions: [] };
      }

      const activityPlanOptions = await getResolvedActivityPlanOptions(db, event);
      const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId);
      return {
        event: serializedEvent,
        activityPlanOptions: activityPlanOptions.map(serializeActivityPlanOption),
      };
    }),

  myCalendarGroupEvents: protectedProcedure
    .input(myCalendarGroupEventsInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const cursorFilter = await getGroupEventCursorFilter(db, null, input.cursor);

      const occurrenceRsvpRows = await db
        .select({ event: groupEvents })
        .from(groupEventRsvps)
        .innerJoin(groupEvents, eq(groupEvents.id, groupEventRsvps.group_event_id))
        .innerJoin(groups, eq(groups.id, groupEvents.group_id))
        .leftJoin(
          groupMemberships,
          and(eq(groupMemberships.group_id, groups.id), eq(groupMemberships.profile_id, profileId)),
        )
        .where(
          and(
            eq(groupEventRsvps.profile_id, profileId),
            eq(groupEventRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
            isNull(groups.deleted_at),
            or(
              eq(groups.access_level, GROUP_ACCESS_LEVEL_PUBLIC),
              eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
            ),
            input.includeCancelled ? undefined : isNull(groupEvents.cancelled_at),
            // Series roots are scheduling templates; calendar lists should show concrete events.
            or(isNull(groupEvents.recurrence_rule), isNotNull(groupEvents.series_id)),
            input.startsAfter ? gte(groupEvents.starts_at, new Date(input.startsAfter)) : undefined,
            input.startsBefore
              ? lte(groupEvents.starts_at, new Date(input.startsBefore))
              : undefined,
            cursorFilter,
          ),
        )
        .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
        .limit(input.limit + 1);

      const seriesOccurrenceRows = await db
        .select({ event: groupEvents })
        .from(groupEventSeriesRsvps)
        .innerJoin(
          groupEvents,
          eq(groupEvents.series_id, groupEventSeriesRsvps.group_event_series_id),
        )
        .innerJoin(groups, eq(groups.id, groupEvents.group_id))
        .leftJoin(
          groupMemberships,
          and(eq(groupMemberships.group_id, groups.id), eq(groupMemberships.profile_id, profileId)),
        )
        .leftJoin(
          groupEventRsvps,
          and(
            eq(groupEventRsvps.group_event_id, groupEvents.id),
            eq(groupEventRsvps.profile_id, profileId),
          ),
        )
        .where(
          and(
            eq(groupEventSeriesRsvps.profile_id, profileId),
            eq(groupEventSeriesRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
            isNotNull(groupEvents.series_id),
            isNull(groups.deleted_at),
            or(
              eq(groups.access_level, GROUP_ACCESS_LEVEL_PUBLIC),
              eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
            ),
            // A declined or tentative occurrence RSVP overrides accepted series RSVP calendar inclusion.
            or(
              isNull(groupEventRsvps.profile_id),
              eq(groupEventRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
            ),
            input.includeCancelled ? undefined : isNull(groupEvents.cancelled_at),
            gte(
              groupEvents.starts_at,
              input.startsAfter ? new Date(input.startsAfter) : new Date(),
            ),
            input.startsBefore
              ? lte(groupEvents.starts_at, new Date(input.startsBefore))
              : undefined,
            cursorFilter,
          ),
        )
        .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
        .limit(input.limit + 1);

      const eventById = new Map<string, GroupEventRow>();
      for (const row of [...occurrenceRsvpRows, ...seriesOccurrenceRows]) {
        eventById.set(row.event.id, row.event);
      }
      const rows = Array.from(eventById.values())
        .sort((a, b) => {
          const startsAtDiff = a.starts_at.getTime() - b.starts_at.getTime();
          return startsAtDiff !== 0 ? startsAtDiff : a.id.localeCompare(b.id);
        })
        .slice(0, input.limit + 1);

      const items = await serializeGroupEventsForViewer(db, rows, profileId);
      return pageResult(items, input.limit, (event) => event.id);
    }),
});
