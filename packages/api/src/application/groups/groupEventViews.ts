import { GROUP_EVENT_RSVP_STATUSES } from "@repo/core/groups";
import {
  groupEventRsvps,
  groupEventSeriesRsvps,
  groupEvents,
  groupMemberships,
  groups,
} from "@repo/db";
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

const GROUP_EVENT_RSVP_STATUS_ACCEPTED = GROUP_EVENT_RSVP_STATUSES[0];

export type GroupEventRow = typeof groupEvents.$inferSelect;
export type GroupEventRsvpRow = typeof groupEventRsvps.$inferSelect;
export type GroupEventSeriesRsvpRow = typeof groupEventSeriesRsvps.$inferSelect;
export type GroupEventSummaryGroupRow = Pick<
  typeof groups.$inferSelect,
  "id" | "name" | "slug" | "avatar_url"
>;

const ACTIVE_GROUP_MEMBERSHIP = "active";
const PUBLIC_GROUP_ACCESS = "public";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeRsvp(rsvp: GroupEventRsvpRow | null) {
  if (!rsvp) return null;

  return {
    group_event_id: rsvp.group_event_id,
    profile_id: rsvp.profile_id,
    status: rsvp.status,
    created_at: toIsoString(rsvp.created_at),
    updated_at: toIsoString(rsvp.updated_at),
  };
}

export function serializeSeriesRsvp(rsvp: GroupEventSeriesRsvpRow | null) {
  if (!rsvp) return null;

  return {
    group_event_series_id: rsvp.group_event_series_id,
    profile_id: rsvp.profile_id,
    status: rsvp.status,
    created_at: toIsoString(rsvp.created_at),
    updated_at: toIsoString(rsvp.updated_at),
  };
}

export function serializeGroupEvent(
  event: GroupEventRow,
  input: {
    acceptedRsvpCount: number;
    group?: GroupEventSummaryGroupRow | null;
    viewerRsvp: GroupEventRsvpRow | null;
    viewerSeriesRsvp?: GroupEventSeriesRsvpRow | null;
  },
) {
  return {
    id: event.id,
    group_id: event.group_id,
    series_id: event.series_id,
    occurrence_key: event.occurrence_key,
    created_by_profile_id: event.created_by_profile_id,
    title: event.title,
    description: event.description,
    starts_at: toIsoString(event.starts_at),
    ends_at: event.ends_at ? toIsoString(event.ends_at) : null,
    timezone: event.timezone,
    recurrence_rule: event.recurrence_rule,
    recurrence_timezone: event.recurrence_timezone,
    location_name: event.location_name,
    route_id: event.route_id,
    activity_plan_id: event.activity_plan_id,
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
    acceptedRsvpCount: input.acceptedRsvpCount,
    viewerRsvp: serializeRsvp(input.viewerRsvp),
    viewerSeriesRsvp: serializeSeriesRsvp(input.viewerSeriesRsvp ?? null),
  };
}

export async function serializeGroupEventsForViewer(
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
  const [rsvps, seriesRsvps, acceptedRsvpCounts] = await Promise.all([
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
      .select({
        group_event_id: groupEventRsvps.group_event_id,
        acceptedRsvpCount: count(),
      })
      .from(groupEventRsvps)
      .where(
        and(
          inArray(groupEventRsvps.group_event_id, eventIds),
          eq(groupEventRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
        ),
      )
      .groupBy(groupEventRsvps.group_event_id),
  ]);

  const rsvpByEventId = new Map(rsvps.map((rsvp) => [rsvp.group_event_id, rsvp]));
  const acceptedRsvpCountByEventId = new Map<string, number>();
  for (const row of acceptedRsvpCounts) {
    acceptedRsvpCountByEventId.set(row.group_event_id, row.acceptedRsvpCount);
  }
  const seriesRsvpBySeriesId = new Map(
    seriesRsvps.map((rsvp) => [rsvp.group_event_series_id, rsvp]),
  );

  return events.map((event) => {
    return serializeGroupEvent(event, {
      acceptedRsvpCount: acceptedRsvpCountByEventId.get(event.id) ?? 0,
      group: input.groupById?.get(event.group_id) ?? null,
      viewerRsvp: rsvpByEventId.get(event.id) ?? null,
      viewerSeriesRsvp: seriesRsvpBySeriesId.get(event.series_id ?? event.id) ?? null,
    });
  });
}

export async function getAcceptedRsvpCount(
  db: ReturnType<typeof getRequiredDb>,
  groupEventId: string,
) {
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

/**
 * Calendar projection source for group events the viewer explicitly selected.
 * Group membership/public visibility is checked independently from personal-event ownership.
 */
export async function readSelectedGroupEventsForCalendar(input: {
  db: ReturnType<typeof getRequiredDb>;
  profileId: string;
  startsAt: Date;
  endsAtExclusive: Date;
  limit: number;
}) {
  const visibility = or(
    eq(groups.access_level, PUBLIC_GROUP_ACCESS),
    eq(groupMemberships.status, ACTIVE_GROUP_MEMBERSHIP),
  );
  const occurrenceRsvpRows = await input.db
    .select({ event: groupEvents, group: groups })
    .from(groupEventRsvps)
    .innerJoin(groupEvents, eq(groupEvents.id, groupEventRsvps.group_event_id))
    .innerJoin(groups, eq(groups.id, groupEvents.group_id))
    .leftJoin(
      groupMemberships,
      and(
        eq(groupMemberships.group_id, groups.id),
        eq(groupMemberships.profile_id, input.profileId),
      ),
    )
    .where(
      and(
        eq(groupEventRsvps.profile_id, input.profileId),
        eq(groupEventRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
        isNull(groups.deleted_at),
        visibility,
        isNull(groupEvents.cancelled_at),
        or(isNull(groupEvents.recurrence_rule), isNotNull(groupEvents.series_id)),
        gte(groupEvents.starts_at, input.startsAt),
        lt(groupEvents.starts_at, input.endsAtExclusive),
      ),
    )
    .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
    .limit(input.limit + 1);

  const seriesOccurrenceRows = await input.db
    .select({ event: groupEvents, group: groups })
    .from(groupEventSeriesRsvps)
    .innerJoin(groupEvents, eq(groupEvents.series_id, groupEventSeriesRsvps.group_event_series_id))
    .innerJoin(groups, eq(groups.id, groupEvents.group_id))
    .leftJoin(
      groupMemberships,
      and(
        eq(groupMemberships.group_id, groups.id),
        eq(groupMemberships.profile_id, input.profileId),
      ),
    )
    .leftJoin(
      groupEventRsvps,
      and(
        eq(groupEventRsvps.group_event_id, groupEvents.id),
        eq(groupEventRsvps.profile_id, input.profileId),
      ),
    )
    .where(
      and(
        eq(groupEventSeriesRsvps.profile_id, input.profileId),
        eq(groupEventSeriesRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
        isNotNull(groupEvents.series_id),
        isNull(groups.deleted_at),
        visibility,
        or(
          isNull(groupEventRsvps.profile_id),
          eq(groupEventRsvps.status, GROUP_EVENT_RSVP_STATUS_ACCEPTED),
        ),
        isNull(groupEvents.cancelled_at),
        gte(groupEvents.starts_at, input.startsAt),
        lt(groupEvents.starts_at, input.endsAtExclusive),
      ),
    )
    .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
    .limit(input.limit + 1);

  const rowById = new Map<string, (typeof occurrenceRsvpRows)[number]>();
  for (const row of [...occurrenceRsvpRows, ...seriesOccurrenceRows]) {
    rowById.set(row.event.id, row);
  }
  const rows = Array.from(rowById.values()).sort((left, right) => {
    const startsAt = left.event.starts_at.getTime() - right.event.starts_at.getTime();
    return startsAt || left.event.id.localeCompare(right.event.id);
  });
  const truncated = rows.length > input.limit;
  const visibleRows = rows.slice(0, input.limit);
  const groupById = new Map<string, GroupEventSummaryGroupRow>();
  for (const row of visibleRows) groupById.set(row.group.id, row.group);

  return {
    items: await serializeGroupEventsForViewer(
      input.db,
      visibleRows.map((row) => row.event),
      input.profileId,
      { groupById },
    ),
    truncated,
  };
}
