import type { PlannedSession, PlannedSessionProjection } from "@repo/core/calendar";
import type { ActivityPlanRow, ActivityRow, EventRow, PublicEventStatus } from "@repo/db";
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
  | "activity_plan_id"
  | "route_id"
  | "training_plan_id"
  | "planned_session_id"
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

type SerializedEventActivityPlan = Omit<ActivityPlanRow, "created_at" | "updated_at"> & {
  created_at: string;
  updated_at: string;
};

export type EventCompletionEventRecord = EventCompletionBase & {
  activity_plan: SerializedEventActivityPlan | null;
  planned_session: (PlannedSessionProjection & Pick<PlannedSession, "sessionRevision">) | null;
  route: {
    id: string;
    name: string;
    description: string | null;
    total_distance: number;
    total_ascent: number | null;
    total_descent: number | null;
  } | null;
};

export type EventDeleteCandidateRecord = Pick<EventRow, "activity_plan_id" | "id" | "event_type">;

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
    expectedActivityPlanId: string | null;
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
      activity_plan_structure: ActivityPlanRow["structure"] | null;
      event_type: "planned" | "race_target";
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
    expectedActivityPlanId: string | null;
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
