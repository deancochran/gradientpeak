import type { ActivityRow, EventRow, PublicEventStatus } from "@repo/db";

type EventCompletionBase = Pick<
  EventRow,
  | "id"
  | "idx"
  | "profile_id"
  | "event_type"
  | "title"
  | "description"
  | "all_day"
  | "timezone"
  | "activity_plan_id"
  | "training_plan_id"
  | "recurrence_rule"
  | "recurrence_timezone"
  | "series_id"
  | "source_provider"
  | "occurrence_key"
  | "notes"
  | "status"
  | "linked_activity_id"
> & {
  created_at: string;
  updated_at: string;
  starts_at: string;
  ends_at: string | null;
  original_starts_at: string | null;
};

export type EventCompletionEventRecord = EventCompletionBase & {
  activity_plan: null;
};

export type EventDeleteCandidateRecord = Pick<EventRow, "id" | "event_type">;

export type EventDeleteScope = "single" | "future" | "series";

export interface EventCompletionRepository {
  getOwnedActivityForCompletion(input: {
    activityId: string;
    profileId: string;
  }): Promise<{ id: string } | null>;
  getOwnedEventForCompletion(input: {
    eventId: string;
    profileId: string;
  }): Promise<EventCompletionEventRecord | null>;
  updateEventCompletionLink(input: {
    eventId: string;
    profileId: string;
    linkedActivityId: string | null;
    status: PublicEventStatus;
  }): Promise<EventCompletionEventRecord | null>;
  listHistoricalActivitiesForReconciliation(input: {
    dateFromInclusiveIso: string;
    dateToExclusiveIso: string;
    profileId: string;
  }): Promise<Array<Pick<ActivityRow, "id" | "activity_plan_id"> & { started_at: string }>>;
  listHistoricalEventsForReconciliation(input: {
    dateFromInclusiveIso: string;
    dateToExclusiveIso: string;
    limit: number;
    profileId: string;
  }): Promise<
    Array<{
      activity_plan_id: string | null;
      event_type: "planned_activity" | "race";
      id: string;
      linked_activity_id: string | null;
      starts_at: string;
      status: PublicEventStatus | null;
      training_plan_id: string | null;
    }>
  >;
  linkHistoricalCompletionIfEligible(input: {
    activityId: string;
    eventId: string;
    profileId: string;
  }): Promise<
    (Pick<EventRow, "id" | "training_plan_id"> & { starts_at: string; updated_at: string }) | null
  >;
  deleteOwnedEventsForScope(input: {
    anchorEvent: Pick<
      EventCompletionEventRecord,
      "id" | "series_id" | "starts_at" | "training_plan_id" | "updated_at"
    >;
    profileId: string;
    scope: EventDeleteScope;
  }): Promise<EventDeleteCandidateRecord[]>;
  listOwnedEventsForDeleteScope(input: {
    anchorEvent: Pick<EventCompletionEventRecord, "id" | "series_id" | "starts_at">;
    profileId: string;
    scope: EventDeleteScope;
  }): Promise<EventDeleteCandidateRecord[]>;
}
