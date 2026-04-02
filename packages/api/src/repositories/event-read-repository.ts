import type { PublicActivityPlansRow } from "@repo/db";
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
  }): Promise<Array<{ id: string; started_at: string }>>;
  listPlannedEventDatesInRange(input: {
    profileId: string;
    startsAtGte: string;
    startsAtLte: string;
  }): Promise<Array<{ starts_at: string }>>;
  getValidateConstraintsInputs(input: {
    activityPlanId: string;
    effortCutoffIso: string;
    profileId: string;
    trainingPlanId: string;
  }): Promise<{
    activityPlan: {
      activity_category: "run" | "bike" | "swim" | "strength" | "other";
      id: string;
      route_id: string | null;
      structure: unknown;
    } | null;
    best20mPower: { value: number } | null;
    lthrMetric: { value: string | number } | null;
    profile: { dob: string | null } | null;
    trainingPlan: { id: string; structure: unknown } | null;
    weightMetric: { value: string | number } | null;
  }>;
  getEstimationInputs(input: {
    effortCutoffIso: string;
    profileId: string;
    routeIds: string[];
  }): Promise<{
    efforts: Array<{
      activity_category: "run" | "bike" | "swim" | "strength" | "other";
      duration_seconds: number;
      effort_type: "power" | "pace" | "speed" | "heart_rate";
      unit: string;
      value: number;
    }>;
    metrics: Array<{
      metric_type: "weight_kg" | "resting_hr" | "max_hr" | "lthr";
      recorded_at: string;
      value: string | number;
    }>;
    profile: { dob: string | null } | null;
    routes: Array<{
      distance_meters: number | null;
      id: string;
      total_ascent: number | null;
      total_descent: number | null;
    }>;
  }>;
  getAccessibleTrainingPlanProjection(input: {
    endDateExclusiveIso: string;
    profileId: string;
    startDateIso: string;
    trainingPlanId?: string;
  }): Promise<{
    actualActivities: Array<{
      avg_heart_rate: number | null;
      avg_power: number | null;
      avg_speed_mps: number | null;
      distance_meters: number | null;
      duration_seconds: number | null;
      finished_at: string;
      id: string;
      max_heart_rate: number | null;
      max_power: number | null;
      max_speed_mps: number | null;
      moving_seconds: number | null;
      normalized_graded_speed_mps: number | null;
      normalized_power: number | null;
      normalized_speed_mps: number | null;
      started_at: string;
      type: string | null;
    }>;
    plannedActivities: Array<{
      activity_plan: PublicActivityPlansRow | null;
      scheduled_date: string;
      starts_at: string;
      training_plan_id: string | null;
    }>;
    trainingPlan: { id: string; structure: unknown } | null;
  }>;
  listOwnedEvents(input: EventListOwnedInput): Promise<EventCompletionEventRecord[]>;
}
