import { pgEnum } from "drizzle-orm/pg-core";

export const activityCategoryEnum = pgEnum("activity_category", [
  "run",
  "bike",
  "swim",
  "strength",
  "other",
]);

export const effortTypeEnum = pgEnum("effort_type", ["power", "speed"]);

export const integrationProviderEnum = pgEnum("integration_provider", [
  "strava",
  "wahoo",
  "trainingpeaks",
  "garmin",
  "zwift",
]);

export const likeEntityTypeEnum = pgEnum("like_entity_type", [
  "activity",
  "activity_plan",
  "training_plan",
  "route",
]);

export const eventStatusEnum = pgEnum("event_status", ["scheduled", "completed", "cancelled"]);

export const eventTypeEnum = pgEnum("event_type", [
  "planned_activity",
  "rest_day",
  "race",
  "custom",
  "imported",
]);

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

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
  "lthr",
]);

export const trainingEffectLabelEnum = pgEnum("training_effect_label", [
  "recovery",
  "base",
  "tempo",
  "threshold",
  "vo2max",
]);
