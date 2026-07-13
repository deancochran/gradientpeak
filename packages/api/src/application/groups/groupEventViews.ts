import { GROUP_EVENT_RSVP_STATUSES, resolveGroupEventFallbackFields } from "@repo/core/groups";
import { groupEventRsvps, groupEventSeriesRsvps, groupEvents, type groups } from "@repo/db";
import { and, eq, inArray } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

const GROUP_EVENT_RSVP_STATUS_ACCEPTED = GROUP_EVENT_RSVP_STATUSES[0];

export type GroupEventRow = typeof groupEvents.$inferSelect;
export type GroupEventRsvpRow = typeof groupEventRsvps.$inferSelect;
export type GroupEventSeriesRsvpRow = typeof groupEventSeriesRsvps.$inferSelect;
export type GroupEventSummaryGroupRow = Pick<
  typeof groups.$inferSelect,
  "id" | "name" | "slug" | "avatar_url"
>;

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
      activityPlanId: event.activity_plan_id,
    },
    input.series
      ? {
          title: input.series.title,
          description: input.series.description,
          timezone: input.series.timezone,
          locationName: input.series.location_name,
          routeId: input.series.route_id,
          activityPlanId: input.series.activity_plan_id,
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
    activity_plan_id: resolved.activityPlanId,
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
  const [seriesRows, rsvps, seriesRsvps, acceptedRsvps] = await Promise.all([
    seriesIds.length > 0
      ? db.select().from(groupEvents).where(inArray(groupEvents.id, seriesIds))
      : Promise.resolve([]),
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
    return serializeGroupEvent(event, {
      acceptedRsvpCount: acceptedRsvpCountByEventId.get(event.id) ?? 0,
      group: input.groupById?.get(event.group_id) ?? null,
      viewerRsvp: rsvpByEventId.get(event.id) ?? null,
      series,
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
