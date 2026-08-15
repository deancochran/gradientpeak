import { pgEnum } from "drizzle-orm/pg-core";

export const activityFileIngestionSourceEnum = pgEnum("activity_file_ingestion_source", [
  "mobile_recording",
  "manual_import",
  "provider_sync",
]);

export const evidenceObservationSourceEnum = pgEnum("evidence_observation_source", [
  "manual",
  "test",
  "imported",
  "provider",
  "estimated",
  "derived",
]);

export const activityFileIngestionStatusEnum = pgEnum("activity_file_ingestion_status", [
  "pending_upload",
  "uploaded",
  "processing",
  "ready",
  "failed",
]);

export const effortTypeEnum = pgEnum("effort_type", ["power", "speed", "heart_rate"]);

export const activityEffortSourceSeriesEnum = pgEnum("activity_effort_source_series", [
  "power",
  "grade_adjusted_speed",
  "raw_speed",
  "swim_speed",
  "heart_rate",
]);

export const thresholdMetricEnum = pgEnum("threshold_metric", ["power", "speed"]);

export const thresholdEvaluationOutcomeEnum = pgEnum("threshold_evaluation_outcome", [
  "qualified",
  "rejected",
]);

export const thresholdEvaluationRejectionReasonEnum = pgEnum(
  "threshold_evaluation_rejection_reason",
  [
    "source_not_accepted",
    "ownership_unverified",
    "series_missing",
    "series_ambiguous",
    "exact_window_missing",
    "exact_window_ambiguous",
    "exact_window_incomplete",
    "source_incomplete",
    "coverage_insufficient",
    "gap_bound_exceeded",
    "value_implausible",
  ],
);

export const thresholdEvaluationEffortRoleEnum = pgEnum("threshold_evaluation_effort_role", [
  "primary",
  "supporting",
]);

export const activitySessionRpeSourceEnum = pgEnum("activity_session_rpe_source", [
  "user",
  "provider",
  "manual",
]);

export const integrationProviderEnum = pgEnum("integration_provider", [
  "strava",
  "wahoo",
  "trainingpeaks",
  "garmin",
  "zwift",
]);

export const integrationResourceKindEnum = pgEnum("integration_resource_kind", [
  "event",
  "activity_plan",
  "activity_route",
  "group_event_route_delivery",
  "activity",
]);

export const likeEntityTypeEnum = pgEnum("like_entity_type", [
  "activity",
  "activity_plan",
  "training_plan",
  "route",
]);

export const eventStatusEnum = pgEnum("event_status", ["scheduled", "completed", "cancelled"]);

export const eventTypeEnum = pgEnum("event_type", ["planned", "race_target", "custom"]);

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "provider_selection",
  "processing",
  "review",
  "completed",
]);

export const profileMetricTypeEnum = pgEnum("profile_metric_type", [
  "weight_kg",
  "resting_hr",
  "sleep_hours",
  "hrv_rmssd",
  "vo2_max",
  "body_fat_percentage",
  "hydration_level",
  "stress_score",
  "soreness_level",
  "wellness_score",
  "max_hr",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "new_message",
  "coaching_invitation",
  "coaching_invitation_accepted",
  "coaching_invitation_declined",
  "new_follower",
  "follow_request",
  "group_event_cancelled",
]);

export const trainingEffectLabelEnum = pgEnum("training_effect_label", [
  "recovery",
  "base",
  "tempo",
  "threshold",
  "vo2max",
]);
