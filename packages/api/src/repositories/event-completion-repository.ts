import type { ActivityRow, EventRow, PublicEventStatus } from "@repo/db";
import type { DrizzleTransactionClient } from "../db";

type EventCompletionBase = Pick<
  EventRow,
  | "id"
  | "profile_id"
  | "event_type"
  | "title"
  | "description"
  | "all_day"
  | "timezone"
  | "route_id"
  | "recurrence_rule"
  | "recurrence_timezone"
  | "series_id"
  | "occurrence_key"
  | "notes"
  | "status"
  | "linked_activity_id"
  | "scheduled_date"
> & {
  created_at: string;
  updated_at: string;
  starts_at: string;
  ends_at: string | null;
  original_starts_at: string | null;
};

export type EventCompletionEventRecord = EventCompletionBase & {
  route: {
    id: string;
    name: string;
    description: string | null;
    total_distance: number;
    total_ascent: number | null;
    total_descent: number | null;
  } | null;
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
      event_type: "race_target" | "custom";
      id: string;
      linked_activity_id: string | null;
      starts_at: string;
      status: PublicEventStatus | null;
    }>
  >;
  linkHistoricalCompletionIfEligible(input: {
    activityId: string;
    eventId: string;
    profileId: string;
  }): Promise<(Pick<EventRow, "id"> & { starts_at: string; updated_at: string }) | null>;
  deleteOwnedEventsForScope(input: {
    anchorEvent: Pick<EventCompletionEventRecord, "id" | "series_id" | "starts_at" | "updated_at">;
    profileId: string;
    scope: EventDeleteScope;
    beforeDelete?: (input: {
      candidates: EventDeleteCandidateRecord[];
      tx: DrizzleTransactionClient;
    }) => Promise<void>;
  }): Promise<EventDeleteCandidateRecord[]>;
  listOwnedEventsForDeleteScope(input: {
    anchorEvent: Pick<EventCompletionEventRecord, "id" | "series_id" | "starts_at">;
    profileId: string;
    scope: EventDeleteScope;
  }): Promise<EventDeleteCandidateRecord[]>;
}
