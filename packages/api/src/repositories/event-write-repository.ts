import type { EventCompletionEventRecord, EventDeleteScope } from "./event-completion-repository";

export interface CreateOwnedEventInput {
  activityPlanId: string | null;
  allDay: boolean;
  description: string | null;
  endsAt: string | null;
  eventType: EventCompletionEventRecord["event_type"];
  notes: string | null;
  profileId: string;
  recurrenceRule: string | null;
  recurrenceTimezone: string | null;
  sourceProvider: string | null;
  startsAt: string;
  status: "scheduled" | "completed" | "cancelled";
  timezone: string;
  title: string;
  trainingPlanId: string | null;
}

export interface EventWriteRepository {
  createOwnedEvent(input: CreateOwnedEventInput): Promise<EventCompletionEventRecord>;
  getAccessibleActivityPlan(input: {
    activityPlanId: string;
    profileId: string;
  }): Promise<{ id: string } | null>;
  getOwnedTrainingPlan(input: {
    profileId: string;
    trainingPlanId: string;
  }): Promise<{ id: string } | null>;
  updateOwnedEventsForScope(input: {
    anchorEvent: Pick<EventCompletionEventRecord, "id" | "series_id" | "starts_at">;
    eventUpdates: Record<string, unknown>;
    profileId: string;
    scope: EventDeleteScope;
  }): Promise<EventCompletionEventRecord[]>;
}
