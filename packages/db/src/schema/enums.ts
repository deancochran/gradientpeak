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

export const performanceCalibrationMetricKeyEnum = pgEnum("performance_calibration_metric_key", [
  "threshold_power",
  "threshold_speed",
  "threshold_heart_rate",
]);

export const performanceCalibrationEvidenceStateEnum = pgEnum(
  "performance_calibration_evidence_state",
  ["candidate", "rejected", "invalidated"],
);

export const performanceCalibrationRejectionReasonEnum = pgEnum(
  "performance_calibration_rejection_reason",
  [
    "metric_not_enabled",
    "source_not_accepted",
    "stream_coverage_insufficient",
    "stream_gap_exceeded",
    "output_variability_exceeded",
    "supporting_threshold_unavailable",
    "supporting_output_not_threshold_like",
    "duration_insufficient",
    "grade_coverage_insufficient",
    "protocol_incomplete",
    "model_history_insufficient",
    "model_quality_insufficient",
    "value_out_of_range",
  ],
);

export const performanceCalibrationSourceSemanticsEnum = pgEnum(
  "performance_calibration_source_semantics",
  ["measured", "derived"],
);

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
