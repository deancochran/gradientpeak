import { randomUUID } from "node:crypto";
import { materializeRecurrenceOccurrences } from "@repo/core";
import {
  createOneOffGroupEventInputSchema,
  createRecurringEventSeriesInputSchema,
  GROUP_EVENT_RSVP_STATUSES,
  listOneOffGroupEventsInputSchema,
  rsvpEventSeriesInputSchema,
  rsvpOneOffGroupEventInputSchema,
  updateEventOccurrenceInputSchema,
  updateOneOffGroupEventInputSchema,
} from "@repo/core/groups";
import {
  activityPlans,
  activityRoutes,
  groupEventRsvps,
  groupEventSeriesRsvps,
  groupEvents,
  groupMemberships,
  groups,
  notifications,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  type GroupEventRow,
  type GroupEventRsvpRow,
  type GroupEventSeriesRsvpRow,
  type GroupEventSummaryGroupRow,
  getAcceptedRsvpCount,
  serializeGroupEvent,
  serializeGroupEventsForViewer,
  serializeRsvp,
  serializeSeriesRsvp,
} from "../../application/groups/groupEventViews";
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

const GROUP_EVENT_RSVP_STATUS_ACCEPTED = GROUP_EVENT_RSVP_STATUSES[0];

type MaterializedGroupEventOccurrence = {
  endsAt: string | null;
  occurrenceKey: string;
  startsAt: string;
};

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

function buildMaterializedGroupEventOccurrences(input: {
  endsAt: string | null;
  recurrenceRule: string;
  recurrenceTimezone?: string | null;
  startsAt: string;
  timezone?: string | null;
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
    frequency: frequency as "DAILY" | "WEEKLY" | "MONTHLY",
    interval,
    count,
    untilDateKey,
    recurrenceTimeZone: input.recurrenceTimezone,
    eventTimeZone: input.timezone,
  });

  if (occurrences.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recurrence creates no occurrences" });
  }

  return occurrences;
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

function canUseActivityPlanForGroupEvent(
  activityPlan: Pick<
    typeof activityPlans.$inferSelect,
    "profile_id" | "content_visibility" | "template_visibility" | "is_system_template"
  >,
  profileId: string,
) {
  const visibility =
    activityPlan.content_visibility === "public" ||
    activityPlan.content_visibility === "followers" ||
    activityPlan.content_visibility === "private"
      ? activityPlan.content_visibility
      : activityPlan.template_visibility;

  return (
    activityPlan.profile_id === profileId ||
    visibility === "public" ||
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
  activityPlanId: string | null | undefined,
  profileId: string,
) {
  if (!activityPlanId) return;

  const [row] = await db
    .select({
      id: activityPlans.id,
      profile_id: activityPlans.profile_id,
      content_visibility: activityPlans.content_visibility,
      template_visibility: activityPlans.template_visibility,
      is_system_template: activityPlans.is_system_template,
    })
    .from(activityPlans)
    .where(eq(activityPlans.id, activityPlanId))
    .limit(1);

  if (!row || !canUseActivityPlanForGroupEvent(row, profileId)) {
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
    activityPlanId?: string | null;
    profileId: string;
    routeId?: string | null;
  },
) {
  await assertActivityPlansAvailableForGroupEvent(db, input.activityPlanId, input.profileId);
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
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const group = await getActiveGroup(db, input.groupId);
      await requireGroupAdmin(db, input.groupId, profileId);
      await assertGroupEventResourcesAvailable(db, {
        activityPlanId: input.activityPlanId,
        profileId,
        routeId: input.routeId,
      });

      const [event] = await db
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
          activity_plan_id: input.activityPlanId ?? null,
        })
        .returning();

      if (!event) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Group event could not be created" });
      }

      const [serializedEvent] = await serializeGroupEventsForViewer(db, [event], profileId, {
        groupById: new Map([[group.id, group]]),
      });
      return { event: serializedEvent };
    }),

  createRecurringEventSeries: protectedProcedure
    .input(createRecurringEventSeriesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      await getActiveGroup(db, input.groupId);
      await requireGroupAdmin(db, input.groupId, profileId);
      await assertGroupEventResourcesAvailable(db, {
        activityPlanId: input.activityPlanId,
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
            activity_plan_id: input.activityPlanId ?? null,
          })
          .returning();

        if (!createdEvent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Recurring group event series could not be created",
          });
        }

        const occurrences = buildMaterializedGroupEventOccurrences({
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          recurrenceRule: input.recurrenceRule,
          recurrenceTimezone: input.recurrenceTimezone,
          timezone: input.timezone,
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
                activity_plan_id: null,
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
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const { event: existingEvent } = await getGroupEventWithActiveGroup(db, input.groupEventId);
      await requireGroupAdmin(db, existingEvent.group_id, profileId);
      await assertGroupEventResourcesAvailable(db, {
        activityPlanId: input.activityPlanId,
        profileId,
        routeId: input.routeId,
      });

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
          ...(input.activityPlanId !== undefined
            ? { activity_plan_id: input.activityPlanId ?? null }
            : {}),
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

  updateEventOccurrence: protectedProcedure
    .input(updateEventOccurrenceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const { event: existingEvent } = await getGroupEventWithActiveGroup(db, input.groupEventId);
      assertSeriesOccurrence(existingEvent);
      await requireGroupAdmin(db, existingEvent.group_id, profileId);
      await assertGroupEventResourcesAvailable(db, {
        activityPlanId: input.activityPlanId,
        profileId,
        routeId: input.routeId,
      });

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
          ...(input.activityPlanId !== undefined
            ? { activity_plan_id: input.activityPlanId ?? null }
            : {}),
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

      const [rsvp] = await db
        .insert(groupEventRsvps)
        .values({
          group_event_id: input.groupEventId,
          profile_id: profileId,
          status: input.status,
        })
        .onConflictDoUpdate({
          target: [groupEventRsvps.group_event_id, groupEventRsvps.profile_id],
          set: {
            status: input.status,
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

        const acceptedRsvpCount = await getAcceptedRsvpCount(db, event.id);
        return {
          event: serializeGroupEvent(event, {
            acceptedRsvpCount,
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

      const acceptedRsvpCount = await getAcceptedRsvpCount(db, event.id);
      return {
        event: serializeGroupEvent(event, {
          acceptedRsvpCount,
          viewerRsvp: null,
          viewerSeriesRsvp: rsvp as GroupEventSeriesRsvpRow,
        }),
        rsvp: serializeSeriesRsvp(rsvp as GroupEventSeriesRsvpRow),
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
