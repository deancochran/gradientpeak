import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import {
  activityCategoryEnum,
  effortTypeEnum,
  genderEnum,
  integrationProviderEnum,
  profileMetricTypeEnum,
} from "./enums";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  email: text("email"),
  full_name: text("full_name"),
  avatar_url: text("avatar_url"),
  bio: text("bio"),
  dob: timestamp("dob", { withTimezone: true, mode: "date" }),
  gender: genderEnum("gender"),
  is_public: boolean("is_public").notNull(),
});

export const activityRoutes = pgTable("activity_routes", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  description: text("description"),
  activity_category: activityCategoryEnum("activity_category").notNull(),
  estimated_distance_meters: real("estimated_distance_meters"),
  estimated_duration_seconds: integer("estimated_duration_seconds"),
  elevation_gain_meters: real("elevation_gain_meters"),
  polyline: text("polyline"),
  is_public: boolean("is_public").notNull(),
});

export const activityPlans = pgTable("activity_plans", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  route_id: uuid("route_id").references(() => activityRoutes.id),
  name: text("name").notNull(),
  description: text("description"),
  activity_category: activityCategoryEnum("activity_category").notNull(),
  estimated_duration_seconds: integer("estimated_duration_seconds"),
  estimated_distance_meters: real("estimated_distance_meters"),
  tss_target: real("tss_target"),
  is_public: boolean("is_public").notNull(),
});

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey(),
  idx: integer("idx").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  activity_plan_id: uuid("activity_plan_id").references(() => activityPlans.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  provider: integrationProviderEnum("provider"),
  external_id: text("external_id"),
  started_at: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  finished_at: timestamp("finished_at", { withTimezone: true, mode: "date" }).notNull(),
  duration_seconds: integer("duration_seconds").notNull(),
  moving_seconds: integer("moving_seconds").notNull(),
  distance_meters: real("distance_meters").notNull(),
  elevation_gain_meters: real("elevation_gain_meters"),
  elevation_loss_meters: real("elevation_loss_meters"),
  calories: real("calories"),
  avg_heart_rate: real("avg_heart_rate"),
  max_heart_rate: real("max_heart_rate"),
  avg_power: real("avg_power"),
  max_power: real("max_power"),
  normalized_power: real("normalized_power"),
  avg_cadence: real("avg_cadence"),
  max_cadence: real("max_cadence"),
  avg_speed_mps: real("avg_speed_mps"),
  max_speed_mps: real("max_speed_mps"),
  normalized_speed_mps: real("normalized_speed_mps"),
  normalized_graded_speed_mps: real("normalized_graded_speed_mps"),
  avg_temperature: real("avg_temperature"),
  avg_swolf: real("avg_swolf"),
  efficiency_factor: real("efficiency_factor"),
  aerobic_decoupling: real("aerobic_decoupling"),
  pool_length: real("pool_length"),
  total_strokes: integer("total_strokes"),
  device_manufacturer: text("device_manufacturer"),
  device_product: text("device_product"),
  fit_file_path: text("fit_file_path"),
  fit_file_size: integer("fit_file_size"),
  import_source: text("import_source"),
  import_file_type: text("import_file_type"),
  import_original_file_name: text("import_original_file_name"),
  notes: text("notes"),
  polyline: text("polyline"),
  laps: jsonb("laps"),
  map_bounds: jsonb("map_bounds"),
  likes_count: integer("likes_count"),
  is_private: boolean("is_private").notNull(),
});

export const activityEfforts = pgTable("activity_efforts", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  activity_id: uuid("activity_id").references(() => activities.id),
  recorded_at: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
  activity_category: activityCategoryEnum("activity_category").notNull(),
  effort_type: effortTypeEnum("effort_type").notNull(),
  duration_seconds: integer("duration_seconds").notNull(),
  start_offset: integer("start_offset"),
  unit: text("unit").notNull(),
  value: real("value").notNull(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  provider: integrationProviderEnum("provider").notNull(),
  provider_user_id: text("provider_user_id"),
  access_token: text("access_token"),
  refresh_token: text("refresh_token"),
  token_expires_at: timestamp("token_expires_at", { withTimezone: true, mode: "date" }),
  scope: text("scope"),
  metadata: jsonb("metadata"),
});

export const profileMetrics = pgTable("profile_metrics", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  metric_type: profileMetricTypeEnum("metric_type").notNull(),
  recorded_at: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
  value: numeric("value", { precision: 12, scale: 4 }).notNull(),
});
