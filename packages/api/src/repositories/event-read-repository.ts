import type {
  ActivityEffortRow,
  ActivityPlanRow,
  ActivityRouteRow,
  ActivityRow,
  EventRow,
  ProfileMetricRow,
  ProfileRow,
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
type SerializedActivityTime = Pick<ActivityRow, "id"> & { started_at: string };
type SerializedEventDate = { starts_at: string };
type ConstraintActivityPlan = Pick<
  ActivityPlanRow,
  "id" | "activity_category" | "route_id" | "structure"
>;
type NumericValue = { value: number };
type ProfileMetricValue = Pick<ProfileMetricRow, "value">;
type ConstraintTrainingPlan = Pick<TrainingPlanRow, "id" | "structure">;
type EstimationEffort = Pick<
  ActivityEffortRow,
  "activity_category" | "duration_seconds" | "effort_type" | "unit" | "value"
>;
type EstimationMetric = Pick<ProfileMetricRow, "metric_type" | "value"> & { recorded_at: string };
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
  | "type"
  | "avg_heart_rate"
  | "max_heart_rate"
  | "avg_power"
  | "max_power"
  | "avg_speed_mps"
  | "max_speed_mps"
  | "distance_meters"
  | "duration_seconds"
  | "moving_seconds"
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
    best20mPower: NumericValue | null;
    lthrMetric: ProfileMetricValue | null;
    profile: SerializedProfileDob | null;
    trainingPlan: ConstraintTrainingPlan | null;
    weightMetric: ProfileMetricValue | null;
  }>;
  getEstimationInputs(input: {
    effortCutoffIso: string;
    profileId: string;
    routeIds: string[];
  }): Promise<{
    efforts: EstimationEffort[];
    metrics: EstimationMetric[];
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
