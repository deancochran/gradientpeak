import { isGroupEventGoing } from "@repo/core/groups";
import {
  groupEventRsvps,
  groupEventSeriesRsvps,
  groupEvents,
  groupMemberships,
  groups,
} from "@repo/db";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

export type GroupEventRow = typeof groupEvents.$inferSelect;
export type GroupEventRsvpRow = typeof groupEventRsvps.$inferSelect;
export type GroupEventSeriesRsvpRow = typeof groupEventSeriesRsvps.$inferSelect;
export type GroupEventSummaryGroupRow = Pick<
  typeof groups.$inferSelect,
  "id" | "name" | "slug" | "avatar_url"
>;

const ACTIVE_GROUP_MEMBERSHIP = "active";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeRsvp(rsvp: GroupEventRsvpRow | null) {
  if (!rsvp || rsvp.status !== "declined") return null;

  return {
    group_event_id: rsvp.group_event_id,
    profile_id: rsvp.profile_id,
    status: rsvp.status,
    created_at: toIsoString(rsvp.created_at),
    updated_at: toIsoString(rsvp.updated_at),
  };
}

export function serializeSeriesRsvp(rsvp: GroupEventSeriesRsvpRow | null) {
  if (!rsvp || rsvp.status !== "declined") return null;

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
    // Compatibility field: membership defaults to going, so this is the effective going count.
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
  const groupIds = Array.from(new Set(events.map((event) => event.group_id)));
  const [rsvps, seriesRsvps, activeMemberships, allEventRsvps, allSeriesRsvps] = await Promise.all([
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
      .select({ group_id: groupMemberships.group_id, profile_id: groupMemberships.profile_id })
      .from(groupMemberships)
      .where(
        and(
          inArray(groupMemberships.group_id, groupIds),
          eq(groupMemberships.status, ACTIVE_GROUP_MEMBERSHIP),
        ),
      ),
    db.select().from(groupEventRsvps).where(inArray(groupEventRsvps.group_event_id, eventIds)),
    seriesRsvpIds.length > 0
      ? db
          .select()
          .from(groupEventSeriesRsvps)
          .where(inArray(groupEventSeriesRsvps.group_event_series_id, seriesRsvpIds))
      : Promise.resolve([]),
  ]);

  const rsvpByEventId = new Map(rsvps.map((rsvp) => [rsvp.group_event_id, rsvp]));
  const activeMemberIdsByGroupId = new Map<string, Set<string>>();
  for (const membership of activeMemberships) {
    const profiles = activeMemberIdsByGroupId.get(membership.group_id) ?? new Set<string>();
    profiles.add(membership.profile_id);
    activeMemberIdsByGroupId.set(membership.group_id, profiles);
  }
  const seriesRsvpBySeriesId = new Map(
    seriesRsvps.map((rsvp) => [rsvp.group_event_series_id, rsvp]),
  );

  return events.map((event) => {
    const occurrenceRsvp = rsvpByEventId.get(event.id) ?? null;
    const seriesRsvp = seriesRsvpBySeriesId.get(event.series_id ?? event.id) ?? null;
    const activeMembers = activeMemberIdsByGroupId.get(event.group_id) ?? new Set<string>();
    const occurrenceRsvpByProfileId = new Map(
      allEventRsvps
        .filter((rsvp) => rsvp.group_event_id === event.id)
        .map((rsvp) => [rsvp.profile_id, rsvp] as const),
    );
    const seriesRsvpByProfileId = new Map(
      allSeriesRsvps
        .filter((rsvp) => rsvp.group_event_series_id === (event.series_id ?? event.id))
        .map((rsvp) => [rsvp.profile_id, rsvp] as const),
    );
    const goingCount = [...activeMembers].filter((memberId) => {
      const occurrenceStatus = occurrenceRsvpByProfileId.get(memberId)?.status;
      const seriesStatus = seriesRsvpByProfileId.get(memberId)?.status;
      return isGroupEventGoing({
        ...(occurrenceStatus !== undefined ? { occurrenceStatus } : {}),
        ...(seriesStatus !== undefined ? { seriesStatus } : {}),
      });
    }).length;
    return serializeGroupEvent(event, {
      acceptedRsvpCount: goingCount,
      group: input.groupById?.get(event.group_id) ?? null,
      viewerRsvp: occurrenceRsvp,
      viewerSeriesRsvp: occurrenceRsvp === null ? seriesRsvp : null,
    });
  });
}

/**
 * Calendar projection source for active-member group events not explicitly declined.
 */
export async function readSelectedGroupEventsForCalendar(input: {
  db: ReturnType<typeof getRequiredDb>;
  profileId: string;
  startDate: string;
  endDateExclusive: string;
  limit: number;
}) {
  const rows = await input.db
    .select({ event: groupEvents, group: groups })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.group_id))
    .innerJoin(groupEvents, eq(groupEvents.group_id, groupMemberships.group_id))
    .leftJoin(
      groupEventRsvps,
      and(
        eq(groupEventRsvps.group_event_id, groupEvents.id),
        eq(groupEventRsvps.profile_id, input.profileId),
      ),
    )
    .leftJoin(
      groupEventSeriesRsvps,
      and(
        eq(groupEventSeriesRsvps.group_event_series_id, groupEvents.series_id),
        eq(groupEventSeriesRsvps.profile_id, input.profileId),
      ),
    )
    .where(
      and(
        eq(groupMemberships.profile_id, input.profileId),
        eq(groupMemberships.status, ACTIVE_GROUP_MEMBERSHIP),
        isNull(groups.deleted_at),
        isNull(groupEvents.cancelled_at),
        or(isNull(groupEvents.recurrence_rule), isNotNull(groupEvents.series_id)),
        sql`coalesce(${groupEventRsvps.status} <> 'declined', true)`,
        sql`case when ${groupEventRsvps.profile_id} is not null then true else coalesce(${groupEventSeriesRsvps.status} <> 'declined', true) end`,
        sql`(${groupEvents.starts_at} at time zone ${groupEvents.timezone})::date >= ${input.startDate}::date`,
        sql`(${groupEvents.starts_at} at time zone ${groupEvents.timezone})::date < ${input.endDateExclusive}::date`,
      ),
    )
    .orderBy(asc(groupEvents.starts_at), asc(groupEvents.id))
    .limit(input.limit + 1);

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
