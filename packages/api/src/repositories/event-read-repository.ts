import type {
  ActivityEffortRow,
  ActivityPlanRow,
  ActivityRouteRow,
  ActivityRow,
  EventRow,
  ProfileMetricRow,
  TrainingPlanRow,
} from "@repo/db";
import type { EventCompletionEventRecord } from "./event-completion-repository";

export interface EventListOwnedInput {
  activityCategory?: "run" | "bike" | "swim" | "strength" | "other";
  activityPlanId?: string;
  cursor?: { id: string; startsAt: string };
  dateFrom?: string;
  dateTo?: string;
  eventTypes?: EventCompletionEventRecord["event_type"][];
  includeAdhoc?: boolean;
  limit: number;
  profileId: string;
  trainingPlanId?: string;
}

type SerializedProfileDob = { dob: string | null };
type SerializedActivityTime = Pick<ActivityRow, "activity_plan_id" | "id"> & {
  started_at: string;
};
type SerializedEventDate = { starts_at: string };
/**
 * Effective-plan scheduled items are calendar-date anchored records. This is
 * intentionally narrower than the general event-completion record contract.
 */
export type EffectivePlanLoadEventRecord = EventCompletionEventRecord & {
  scheduled_date: string;
};
type ConstraintActivityPlan = Pick<
  ActivityPlanRow,
  "id" | "gps_recording_enabled" | "structure" | "structure_hash"
>;
type ProfileMetricValue = Pick<ProfileMetricRow, "value">;
type ConstraintTrainingPlan = Pick<TrainingPlanRow, "id" | "structure">;
type EstimationEffort = Omit<
  Pick<
    ActivityEffortRow,
    | "activity_category"
    | "activity_id"
    | "calculation_version"
    | "duration_seconds"
    | "effort_type"
    | "id"
    | "method"
    | "provenance"
    | "quality_score"
    | "recorded_at"
    | "source"
    | "unit"
    | "value"
  >,
  "recorded_at"
> & {
  recorded_at: string;
};
type EstimationProfileMetric = Pick<
  ProfileMetricRow,
  | "calculation_version"
  | "method"
  | "metric_type"
  | "provenance"
  | "quality_score"
  | "source"
  | "unit"
  | "value"
> & {
  recorded_at: string;
};
type EstimationRoute = {
  id: ActivityRouteRow["id"];
  distance_meters: number | null;
  total_ascent: ActivityRouteRow["total_ascent"];
  total_descent: ActivityRouteRow["total_descent"];
  updated_at: string;
};
type ProjectionActivity = Pick<
  ActivityRow,
  | "id"
  | "name"
  | "avg_heart_rate"
  | "max_heart_rate"
  | "avg_power"
  | "max_power"
  | "avg_speed_mps"
  | "max_speed_mps"
  | "distance_meters"
  | "elapsed_ms"
  | "active_ms"
  | "moving_ms"
  | "normalized_power"
  | "normalized_speed_mps"
  | "normalized_graded_speed_mps"
> & { started_at: string; finished_at: string };
type ProjectionPlannedActivity = Pick<EventRow, "training_plan_id"> & {
  activity_plan: ActivityPlanRow | null;
  scheduled_date: string;
  starts_at: string;
};
type ProjectionTrainingPlan = Pick<TrainingPlanRow, "id" | "structure">;

export interface EventReadRepository {
  /** Profile-owned facts for the server-side effective Plan Load projection. */
  getEffectivePlanLoadInputs(input: {
    asOf: Date;
    endDate?: string;
    profileId: string;
    startDate?: string;
  }): Promise<{
    activities: ActivityRow[];
    events: EffectivePlanLoadEventRecord[];
    planningTimezone: string | null;
    resolvedRange: { endDate: string | null; startDate: string | null };
    sourceCounts: { activities: number; events: number };
    sourceCoverage: {
      activities: { endDate: string; startDate: string; status: "complete" | "partial" } | null;
      scheduledItems: { endDate: string; startDate: string; status: "complete" | "partial" } | null;
    };
  }>;
  countOwnedEventsInRange(input: {
    profileId: string;
    startsAtGte: string;
    startsAtLt: string;
  }): Promise<number>;
  getOwnedEventById(input: {
    eventId: string;
    profileId: string;
  }): Promise<EventCompletionEventRecord | null>;
  listCompletedActivitiesInRange(input: {
    profileId: string;
    startedAtGte: string;
    startedAtLt: string;
  }): Promise<SerializedActivityTime[]>;
  listPlannedEventDatesInRange(input: {
    profileId: string;
    startsAtGte: string;
    startsAtLte: string;
  }): Promise<SerializedEventDate[]>;
  getValidateConstraintsInputs(input: {
    activityPlanId: string;
    effortCutoffIso: string;
    profileId: string;
    trainingPlanId: string;
  }): Promise<{
    activityPlan: ConstraintActivityPlan | null;
    lthrMetric: ProfileMetricValue | null;
    profile: SerializedProfileDob | null;
    trainingPlan: ConstraintTrainingPlan | null;
    weightMetric: ProfileMetricValue | null;
  }>;
  getEstimationInputs(input: {
    /**
     * Stable request instant for metric/effort freshness and access-expiry evaluation.
     * Route rows are current facts: routes have no historical versions to reconstruct at asOf.
     */
    asOfIso: string;
    effortCutoffIso: string;
    profileId: string;
    routeIds: string[];
  }): Promise<{
    efforts: EstimationEffort[];
    metrics: EstimationProfileMetric[];
    profile: SerializedProfileDob | null;
    routes: EstimationRoute[];
  }>;
  getAccessibleTrainingPlanProjection(input: {
    endDateExclusiveIso: string;
    profileId: string;
    startDateIso: string;
    trainingPlanId?: string;
  }): Promise<{
    actualActivities: ProjectionActivity[];
    plannedActivities: ProjectionPlannedActivity[];
    trainingPlan: ProjectionTrainingPlan | null;
  }>;
  listOwnedEvents(input: EventListOwnedInput): Promise<EventCompletionEventRecord[]>;
}
