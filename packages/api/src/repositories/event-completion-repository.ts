import type { PublicEventStatus } from "@repo/db";

export type EventCompletionEventRecord = {
  id: string;
  idx: number | null;
  profile_id: string;
  event_type: "planned_activity" | "rest_day" | "race" | "custom" | "imported";
  title: string | null;
  description: string | null;
  all_day: boolean | null;
  timezone: string | null;
  activity_plan_id: string | null;
  training_plan_id: string | null;
  recurrence_rule: string | null;
  recurrence_timezone: string | null;
  series_id: string | null;
  source_provider: string | null;
  occurrence_key: string | null;
  original_starts_at: string | null;
  notes: string | null;
  status: PublicEventStatus | null;
  linked_activity_id: string | null;
  created_at: string;
  updated_at: string;
  starts_at: string;
  ends_at: string | null;
  activity_plan: null;
};

export type EventDeleteCandidateRecord = {
  event_type: EventCompletionEventRecord["event_type"];
  id: string;
};

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
  }): Promise<Array<{ activity_plan_id: string | null; id: string; started_at: string }>>;
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
  }): Promise<{
    id: string;
    starts_at: string;
    training_plan_id: string | null;
    updated_at: string;
  } | null>;
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
