import type { ActivityRouteRow } from "@repo/db";
import type { EventCompletionEventRecord, EventDeleteScope } from "./event-completion-repository";

type AccessibleActivityRouteRef = Pick<ActivityRouteRow, "id">;
export type EventWriteEventRecord = EventCompletionEventRecord & { route_id: string | null };

export interface CreateOwnedEventInput {
  allDay: boolean;
  description: string | null;
  endsAt: string | null;
  eventType: EventCompletionEventRecord["event_type"];
  notes: string | null;
  profileId: string;
  occurrenceKey?: string | null;
  originalStartsAt?: string | null;
  recurrenceRule: string | null;
  recurrenceTimezone: string | null;
  routeId: string | null;
  seriesId?: string | null;
  scheduledDate: string;
  startsAt: string;
  status: "scheduled" | "completed" | "cancelled";
  timezone: string;
  title: string;
}

export interface EventWriteRepository {
  createOwnedEvent(input: CreateOwnedEventInput): Promise<EventWriteEventRecord>;
  createOwnedEvents(input: {
    anchor: CreateOwnedEventInput;
    occurrences: Omit<CreateOwnedEventInput, "seriesId">[];
  }): Promise<EventWriteEventRecord[]>;
  getAccessibleActivityRoute(input: {
    profileId: string;
    routeId: string;
  }): Promise<AccessibleActivityRouteRef | null>;
  listOwnedEventsForSeries(input: {
    anchorEvent: Pick<EventCompletionEventRecord, "id" | "series_id">;
    profileId: string;
  }): Promise<EventWriteEventRecord[]>;
  updateOwnedEventsForScope(input: {
    anchorEvent: Pick<EventCompletionEventRecord, "id" | "series_id" | "starts_at">;
    eventUpdates: Record<string, unknown>;
    profileId: string;
    rejectPlanReplacementWithCompletion?: boolean;
    scope: EventDeleteScope;
  }): Promise<EventWriteEventRecord[]>;
}
