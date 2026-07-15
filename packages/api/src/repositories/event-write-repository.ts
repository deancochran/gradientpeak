import type { ActivityPlanRow, ActivityRouteRow, TrainingPlanRow } from "@repo/db";
import type { EventCompletionEventRecord, EventDeleteScope } from "./event-completion-repository";

type OwnedActivityPlanRef = Pick<ActivityPlanRow, "id">;
type AccessibleActivityRouteRef = Pick<ActivityRouteRow, "id">;
type OwnedTrainingPlanRef = Pick<TrainingPlanRow, "id">;
type EventWriteEventRecord = EventCompletionEventRecord & { route_id: string | null };

export interface CreateOwnedEventInput {
  activityPlanId: string | null;
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
  sourceProvider: string | null;
  startsAt: string;
  status: "scheduled" | "completed" | "cancelled";
  timezone: string;
  title: string;
  trainingPlanId: string | null;
}

export interface EventWriteRepository {
  createOwnedEvent(input: CreateOwnedEventInput): Promise<EventWriteEventRecord>;
  createOwnedEvents(input: {
    anchor: CreateOwnedEventInput;
    occurrences: Omit<CreateOwnedEventInput, "seriesId">[];
  }): Promise<EventWriteEventRecord[]>;
  getAccessibleActivityPlan(input: {
    activityPlanId: string;
    profileId: string;
  }): Promise<OwnedActivityPlanRef | null>;
  getAccessibleActivityRoute(input: {
    profileId: string;
    routeId: string;
  }): Promise<AccessibleActivityRouteRef | null>;
  getOwnedTrainingPlan(input: {
    profileId: string;
    trainingPlanId: string;
  }): Promise<OwnedTrainingPlanRef | null>;
  listOwnedEventsForSeries(input: {
    anchorEvent: Pick<EventCompletionEventRecord, "id" | "series_id">;
    profileId: string;
  }): Promise<EventWriteEventRecord[]>;
  updateOwnedEventsForScope(input: {
    anchorEvent: Pick<EventCompletionEventRecord, "id" | "series_id" | "starts_at">;
    eventUpdates: Record<string, unknown>;
    profileId: string;
    scope: EventDeleteScope;
  }): Promise<EventWriteEventRecord[]>;
}
