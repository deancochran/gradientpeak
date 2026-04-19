import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "../auth-schema";

import {
  activityCategoryEnum,
  effortTypeEnum,
  eventStatusEnum,
  eventTypeEnum,
  genderEnum,
  integrationProviderEnum,
  integrationResourceKindEnum,
  likeEntityTypeEnum,
  notificationTypeEnum,
  profileMetricTypeEnum,
} from "./enums";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    idx: integer("idx"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    email: text("email"),
    full_name: text("full_name"),
    username: text("username"),
    avatar_url: text("avatar_url"),
    bio: text("bio"),
    dob: timestamp("dob", { withTimezone: true, mode: "date" }),
    gender: genderEnum("gender"),
    language: text("language"),
    preferred_units: text("preferred_units", { enum: ["metric", "imperial"] }),
    onboarded: boolean("onboarded"),
    is_public: boolean("is_public").notNull(),
  },
  (table) => [
    uniqueIndex("profiles_username_unique_idx").on(table.username),
    uniqueIndex("profiles_email_unique_idx").on(table.email).where(sql`${table.email} is not null`),
    foreignKey({
      columns: [table.id],
      foreignColumns: [users.id],
      name: "profiles_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const activityRoutes = pgTable(
  "activity_routes",
  {
    id: uuid("id").primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    file_path: text("file_path").notNull(),
    total_distance: integer("total_distance").notNull(),
    total_ascent: integer("total_ascent"),
    total_descent: integer("total_descent"),
    source: text("source"),
    elevation_polyline: text("elevation_polyline"),
    polyline: text("polyline").notNull(),
    is_public: boolean("is_public").notNull().default(false),
    likes_count: integer("likes_count").default(0),
  },
  (table) => [
    uniqueIndex("activity_routes_idx_key").on(table.idx),
    check("activity_routes_total_distance_check", sql`${table.total_distance} >= 0`),
    check("activity_routes_total_ascent_check", sql`${table.total_ascent} >= 0`),
    check("activity_routes_total_descent_check", sql`${table.total_descent} >= 0`),
    index("idx_routes_profile_id").on(table.profile_id),
    index("idx_routes_name").on(table.name),
    index("idx_routes_activity_category").on(table.activity_category),
    index("idx_routes_created_at").on(table.created_at),
  ],
);

export const activityPlans = pgTable(
  "activity_plans",
  {
    id: uuid("id").primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    route_id: uuid("route_id").references(() => activityRoutes.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    notes: text("notes"),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    structure: jsonb("structure"),
    version: text("version").notNull().default("1.0"),
    template_visibility: text("template_visibility").notNull().default("private"),
    import_provider: text("import_provider"),
    import_external_id: text("import_external_id"),
    is_system_template: boolean("is_system_template").notNull().default(false),
    is_public: boolean("is_public").notNull().default(false),
    likes_count: integer("likes_count").default(0),
  },
  (table) => [
    uniqueIndex("activity_plans_idx_key").on(table.idx),
    check(
      "activity_plans_template_visibility_check",
      sql`${table.template_visibility} = any(array['private'::text, 'public'::text])`,
    ),
    check(
      "activity_plans_import_provider_non_empty_check",
      sql`${table.import_provider} is null or btrim(${table.import_provider}) <> ''`,
    ),
    check(
      "activity_plans_import_external_id_non_empty_check",
      sql`${table.import_external_id} is null or btrim(${table.import_external_id}) <> ''`,
    ),
    check(
      "activity_plans_system_templates_public_check",
      sql`${table.is_system_template} = false or ${table.template_visibility} = 'public'`,
    ),
    check(
      "activity_plans_system_template_check",
      sql`(${table.is_system_template} = true and ${table.profile_id} is null) or (${table.is_system_template} = false and ${table.profile_id} is not null)`,
    ),
    check(
      "activity_plans_has_content",
      sql`${table.structure} is not null or ${table.route_id} is not null`,
    ),
    index("idx_activity_plans_profile_id")
      .on(table.profile_id)
      .where(sql`${table.profile_id} is not null`),
    index("idx_activity_plans_system_templates")
      .on(table.is_system_template)
      .where(sql`${table.is_system_template} = true`),
    index("idx_activity_plans_route_id")
      .on(table.route_id)
      .where(sql`${table.route_id} is not null`),
    index("idx_activity_plans_visibility").on(table.template_visibility),
    uniqueIndex("idx_activity_plans_import_identity")
      .on(table.profile_id, table.import_provider, table.import_external_id)
      .where(sql`${table.import_provider} is not null and ${table.import_external_id} is not null`),
  ],
);

export const trainingPlans = pgTable(
  "training_plans",
  {
    id: uuid("id").primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    structure: jsonb("structure").notNull(),
    template_visibility: text("template_visibility").notNull().default("private"),
    is_public: boolean("is_public").notNull().default(false),
    is_system_template: boolean("is_system_template").notNull().default(false),
    sessions_per_week_target: integer("sessions_per_week_target"),
    duration_hours: numeric("duration_hours", { precision: 12, scale: 2, mode: "number" }),
    likes_count: integer("likes_count").default(0),
  },
  (table) => [
    uniqueIndex("training_plans_idx_key").on(table.idx),
    check(
      "training_plans_template_visibility_check",
      sql`${table.template_visibility} = any(array['private'::text, 'public'::text])`,
    ),
    check(
      "training_plans_system_templates_public_check",
      sql`${table.is_system_template} = false or ${table.template_visibility} = 'public'`,
    ),
    check(
      "training_plans_template_profile_check",
      sql`(${table.is_system_template} = true and ${table.profile_id} is null) or (${table.is_system_template} = false and ${table.profile_id} is not null)`,
    ),
    index("idx_training_plans_profile_id")
      .on(table.profile_id)
      .where(sql`${table.profile_id} is not null`),
    index("idx_training_plans_is_system_template")
      .on(table.is_system_template)
      .where(sql`${table.is_system_template} = true`),
    index("idx_training_plans_name").on(table.name),
    index("idx_training_plans_visibility").on(table.template_visibility),
  ],
);

export const userTrainingPlans = pgTable(
  "user_training_plans",
  {
    id: uuid("id").primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    training_plan_id: uuid("training_plan_id")
      .notNull()
      .references(() => trainingPlans.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "paused", "completed", "abandoned"] })
      .notNull()
      .default("active"),
    start_date: date("start_date").notNull(),
    target_date: date("target_date"),
    snapshot_structure: jsonb("snapshot_structure"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("idx_user_training_plans_profile_id").on(table.profile_id),
    index("idx_user_training_plans_training_plan_id").on(table.training_plan_id),
    index("idx_user_training_plans_status")
      .on(table.profile_id)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    training_plan_id: uuid("training_plan_id").references(() => trainingPlans.id, {
      onDelete: "set null",
    }),
    activity_plan_id: uuid("activity_plan_id").references(() => activityPlans.id, {
      onDelete: "set null",
    }),
    linked_activity_id: uuid("linked_activity_id").references(() => activities.id),
    event_type: eventTypeEnum("event_type").notNull(),
    status: eventStatusEnum("status").notNull().default("scheduled"),
    title: text("title").notNull(),
    description: text("description"),
    notes: text("notes"),
    all_day: boolean("all_day").notNull().default(false),
    timezone: text("timezone").notNull().default("UTC"),
    recurrence_rule: text("recurrence_rule"),
    recurrence_timezone: text("recurrence_timezone"),
    series_id: uuid("series_id"),
    source_provider: text("source_provider"),
    occurrence_key: text("occurrence_key").notNull().default(""),
    original_starts_at: timestamp("original_starts_at", { withTimezone: true, mode: "date" }),
    integration_account_id: uuid("integration_account_id").references(() => integrations.id),
    external_calendar_id: text("external_calendar_id"),
    external_event_id: text("external_event_id"),
    schedule_batch_id: uuid("schedule_batch_id"),
    user_training_plan_id: uuid("user_training_plan_id").references(() => userTrainingPlans.id, {
      onDelete: "set null",
    }),
    starts_at: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    scheduled_date: text("scheduled_date"),
    read_only: boolean("read_only"),
    lifecycle: jsonb("lifecycle"),
    recurrence: jsonb("recurrence"),
    payload: jsonb("payload"),
    route_id: uuid("route_id").references(() => activityRoutes.id),
  },
  (table) => [
    uniqueIndex("events_idx_key").on(table.idx),
    foreignKey({
      columns: [table.series_id],
      foreignColumns: [table.id],
      name: "events_series_id_fkey",
    }).onDelete("cascade"),
    check(
      "events_external_calendar_non_empty",
      sql`${table.external_calendar_id} is null or btrim(${table.external_calendar_id}) <> ''`,
    ),
    check(
      "events_external_event_non_empty",
      sql`${table.external_event_id} is null or btrim(${table.external_event_id}) <> ''`,
    ),
    check(
      "events_recurrence_timezone_requires_rule",
      sql`${table.recurrence_timezone} is null or ${table.recurrence_rule} is not null`,
    ),
    check(
      "events_series_not_self",
      sql`${table.series_id} is null or ${table.series_id} <> ${table.id}`,
    ),
    check(
      "events_series_occurrence_key_required",
      sql`${table.series_id} is null or btrim(${table.occurrence_key}) <> ''`,
    ),
    check(
      "events_source_identity_complete",
      sql`(
        ${table.source_provider} is null
        and ${table.integration_account_id} is null
        and ${table.external_calendar_id} is null
        and ${table.external_event_id} is null
      ) or (
        ${table.source_provider} is not null
        and ${table.integration_account_id} is not null
        and ${table.external_calendar_id} is not null
        and ${table.external_event_id} is not null
      )`,
    ),
    check(
      "events_source_provider_non_empty",
      sql`${table.source_provider} is null or btrim(${table.source_provider}) <> ''`,
    ),
    check(
      "events_time_window",
      sql`${table.ends_at} is null or ${table.ends_at} > ${table.starts_at}`,
    ),
    index("idx_events_activity_plan")
      .on(table.activity_plan_id)
      .where(sql`${table.activity_plan_id} is not null`),
    index("idx_events_event_type_starts_at").on(table.event_type, table.starts_at),
    uniqueIndex("idx_events_external_identity_unique")
      .on(
        table.source_provider,
        table.integration_account_id,
        table.external_calendar_id,
        table.external_event_id,
        table.occurrence_key,
      )
      .where(
        sql`${table.source_provider} is not null and ${table.integration_account_id} is not null and ${table.external_calendar_id} is not null and ${table.external_event_id} is not null`,
      ),
    index("idx_events_integration_calendar_updated")
      .on(table.integration_account_id, table.external_calendar_id, table.updated_at)
      .where(
        sql`${table.integration_account_id} is not null and ${table.external_calendar_id} is not null`,
      ),
    index("idx_events_profile_starts_at").on(table.profile_id, table.starts_at),
    index("idx_events_profile_status_starts_at").on(
      table.profile_id,
      table.status,
      table.starts_at,
    ),
    uniqueIndex("idx_events_series_occurrence_unique")
      .on(table.series_id, table.occurrence_key)
      .where(sql`${table.series_id} is not null`),
    index("idx_events_training_plan")
      .on(table.training_plan_id)
      .where(sql`${table.training_plan_id} is not null`),
    index("idx_events_schedule_batch")
      .on(table.profile_id, table.schedule_batch_id)
      .where(sql`${table.schedule_batch_id} is not null`),
    index("idx_events_user_training_plan")
      .on(table.user_training_plan_id)
      .where(sql`${table.user_training_plan_id} is not null`),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activity_plan_id: uuid("activity_plan_id").references(() => activityPlans.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    provider: integrationProviderEnum("provider"),
    external_id: text("external_id"),
    started_at: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finished_at: timestamp("finished_at", { withTimezone: true, mode: "date" }).notNull(),
    duration_seconds: integer("duration_seconds").notNull().default(0),
    moving_seconds: integer("moving_seconds").notNull().default(0),
    distance_meters: integer("distance_meters").notNull().default(0),
    elevation_gain_meters: numeric("elevation_gain_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    elevation_loss_meters: numeric("elevation_loss_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    calories: integer("calories"),
    avg_heart_rate: integer("avg_heart_rate"),
    max_heart_rate: integer("max_heart_rate"),
    avg_power: integer("avg_power"),
    max_power: integer("max_power"),
    normalized_power: integer("normalized_power"),
    avg_cadence: integer("avg_cadence"),
    max_cadence: integer("max_cadence"),
    avg_speed_mps: numeric("avg_speed_mps", { precision: 6, scale: 2, mode: "number" }),
    max_speed_mps: numeric("max_speed_mps", { precision: 6, scale: 2, mode: "number" }),
    normalized_speed_mps: numeric("normalized_speed_mps", {
      precision: 6,
      scale: 2,
      mode: "number",
    }),
    normalized_graded_speed_mps: numeric("normalized_graded_speed_mps", {
      precision: 6,
      scale: 2,
      mode: "number",
    }),
    avg_temperature: numeric("avg_temperature"),
    avg_swolf: numeric("avg_swolf"),
    efficiency_factor: numeric("efficiency_factor"),
    aerobic_decoupling: numeric("aerobic_decoupling"),
    pool_length: numeric("pool_length"),
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
    likes_count: integer("likes_count").default(0),
    is_private: boolean("is_private").notNull().default(true),
  },
  (table) => [
    uniqueIndex("activities_idx_key").on(table.idx),
    check("activities_distance_meters_check", sql`${table.distance_meters} >= 0`),
    check("activities_duration_seconds_check", sql`${table.duration_seconds} >= 0`),
    check("activities_moving_seconds_check", sql`${table.moving_seconds} >= 0`),
    check(
      "chk_moving_time",
      sql`${table.moving_seconds} >= 0 and ${table.moving_seconds} <= ${table.duration_seconds}`,
    ),
    check(
      "activities_import_file_type_non_empty_check",
      sql`${table.import_file_type} is null or btrim(${table.import_file_type}) <> ''`,
    ),
    check(
      "activities_import_original_file_name_non_empty_check",
      sql`${table.import_original_file_name} is null or btrim(${table.import_original_file_name}) <> ''`,
    ),
    check(
      "activities_import_source_check",
      sql`${table.import_source} is null or ${table.import_source} = 'manual_historical'`,
    ),
    index("idx_activities_activity_plan")
      .on(table.activity_plan_id)
      .where(sql`${table.activity_plan_id} is not null`),
    uniqueIndex("idx_activities_external_unique")
      .on(table.provider, table.external_id)
      .where(sql`${table.external_id} is not null and ${table.provider} is not null`),
    index("idx_activities_provider_external")
      .on(table.provider, table.external_id)
      .where(sql`${table.external_id} is not null`),
    index("idx_activities_profile_started").on(table.profile_id, table.started_at),
    index("idx_activities_started").on(table.started_at),
    index("idx_activities_type").on(table.type),
  ],
);

export const activityEfforts = pgTable("activity_efforts", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }),
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

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idx: serial("idx").notNull().unique(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    external_id: text("external_id").notNull(),
    access_token: text("access_token").notNull(),
    refresh_token: text("refresh_token"),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    scope: text("scope"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("unique_integration_type").on(table.profile_id, table.provider),
    index("idx_integrations_profile_id").on(table.profile_id),
    index("idx_integrations_external_id").on(table.external_id),
    index("idx_integrations_provider").on(table.provider),
    index("idx_integrations_expires_at").on(table.expires_at),
  ],
);

export const profileMetrics = pgTable(
  "profile_metrics",
  {
    id: uuid("id").primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    metric_type: profileMetricTypeEnum("metric_type").notNull(),
    recorded_at: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    unit: text("unit").notNull(),
    notes: text("notes"),
    reference_activity_id: uuid("reference_activity_id").references(() => activities.id, {
      onDelete: "set null",
    }),
    value: numeric("value", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("profile_metrics_idx_key").on(table.idx),
    check("profile_metrics_value_check", sql`${table.value} >= 0`),
    index("idx_profile_metrics_profile").on(table.profile_id, table.recorded_at),
    index("idx_profile_metrics_recorded_at").on(table.recorded_at),
    index("idx_profile_metrics_reference_activity")
      .on(table.reference_activity_id)
      .where(sql`${table.reference_activity_id} is not null`),
    index("idx_profile_metrics_temporal_lookup").on(
      table.profile_id,
      table.metric_type,
      table.recorded_at,
    ),
  ],
);

export const profileTrainingSettings = pgTable("profile_training_settings", {
  profile_id: uuid("profile_id")
    .primaryKey()
    .references(() => profiles.id),
  settings: jsonb("settings").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const profileGoals = pgTable(
  "profile_goals",
  {
    id: uuid("id").primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    milestone_event_id: uuid("milestone_event_id")
      .notNull()
      .references(() => events.id),
    title: text("title").notNull(),
    priority: integer("priority").notNull(),
    activity_category: text("activity_category"),
    target_date: date("target_date"),
    target_payload: jsonb("target_payload"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("idx_profile_goals_profile_id").on(table.profile_id),
    index("idx_profile_goals_milestone_event_id").on(table.milestone_event_id),
  ],
);

export const oauthStates = pgTable(
  "oauth_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idx: serial("idx").notNull().unique(),
    state: text("state").notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    mobile_redirect_uri: text("mobile_redirect_uri").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("idx_oauth_states_expires_at").on(table.expires_at),
    index("idx_oauth_states_profile_id").on(table.profile_id),
  ],
);

export const integrationResourceLinks = pgTable(
  "integration_resource_links",
  {
    id: uuid("id").primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    synced_at: timestamp("synced_at", { withTimezone: true, mode: "date" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    integration_id: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    resource_kind: integrationResourceKindEnum("resource_kind").notNull(),
    internal_resource_id: uuid("internal_resource_id").notNull(),
    external_id: text("external_id").notNull(),
    provider_updated_at: timestamp("provider_updated_at", { withTimezone: true, mode: "date" }),
    payload_hash: text("payload_hash"),
  },
  (table) => [
    uniqueIndex("integration_resource_links_idx_key").on(table.idx),
    unique("integration_resource_links_internal_unique").on(
      table.integration_id,
      table.resource_kind,
      table.internal_resource_id,
    ),
    unique("integration_resource_links_external_unique").on(
      table.integration_id,
      table.resource_kind,
      table.external_id,
    ),
    index("idx_integration_resource_links_profile").on(table.profile_id),
    index("idx_integration_resource_links_integration").on(table.integration_id),
    index("idx_integration_resource_links_internal").on(
      table.resource_kind,
      table.internal_resource_id,
    ),
    index("idx_integration_resource_links_provider_external").on(table.provider, table.external_id),
  ],
);

export const providerSyncState = pgTable(
  "provider_sync_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    integration_id: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    resource: text("resource").notNull(),
    publish_horizon_days: integer("publish_horizon_days"),
    sync_mode: text("sync_mode").notNull(),
    last_sync_started_at: timestamp("last_sync_started_at", { withTimezone: true, mode: "date" }),
    last_sync_succeeded_at: timestamp("last_sync_succeeded_at", {
      withTimezone: true,
      mode: "date",
    }),
    last_sync_failed_at: timestamp("last_sync_failed_at", { withTimezone: true, mode: "date" }),
    next_sync_at: timestamp("next_sync_at", { withTimezone: true, mode: "date" }),
    consecutive_failures: integer("consecutive_failures").notNull().default(0),
    last_error: text("last_error"),
    cursor: text("cursor"),
    high_watermark: timestamp("high_watermark", { withTimezone: true, mode: "date" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("provider_sync_state_idx_key").on(table.idx),
    unique("provider_sync_state_integration_resource_unique").on(
      table.integration_id,
      table.resource,
    ),
    index("idx_provider_sync_state_provider_next_sync").on(table.provider, table.next_sync_at),
  ],
);

export const providerSyncJobs = pgTable(
  "provider_sync_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    integration_id: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    job_type: text("job_type").notNull(),
    resource_kind: integrationResourceKindEnum("resource_kind"),
    internal_resource_id: uuid("internal_resource_id"),
    status: text("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(100),
    run_at: timestamp("run_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    attempt: integer("attempt").notNull().default(0),
    max_attempts: integer("max_attempts").notNull().default(8),
    dedupe_key: text("dedupe_key"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    last_error: text("last_error"),
    locked_at: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lock_expires_at: timestamp("lock_expires_at", { withTimezone: true, mode: "date" }),
    locked_by: text("locked_by"),
  },
  (table) => [
    uniqueIndex("provider_sync_jobs_idx_key").on(table.idx),
    index("idx_provider_sync_jobs_status_run_at_priority").on(
      table.status,
      table.run_at,
      table.priority,
    ),
    index("idx_provider_sync_jobs_provider_profile_status").on(
      table.provider,
      table.profile_id,
      table.status,
    ),
    index("idx_provider_sync_jobs_dedupe_key").on(table.dedupe_key),
  ],
);

export const providerWebhookReceipts = pgTable(
  "provider_webhook_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idx: serial("idx").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    received_at: timestamp("received_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    processed_at: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    provider: integrationProviderEnum("provider").notNull(),
    integration_id: uuid("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    provider_account_id: text("provider_account_id"),
    provider_event_id: text("provider_event_id"),
    event_type: text("event_type").notNull(),
    object_type: text("object_type"),
    object_id: text("object_id"),
    payload: jsonb("payload").notNull(),
    payload_hash: text("payload_hash"),
    processing_status: text("processing_status").notNull().default("pending"),
    job_id: uuid("job_id").references(() => providerSyncJobs.id, { onDelete: "set null" }),
    last_error: text("last_error"),
  },
  (table) => [
    uniqueIndex("provider_webhook_receipts_idx_key").on(table.idx),
    unique("provider_webhook_receipts_event_unique").on(
      table.provider,
      table.provider_account_id,
      table.provider_event_id,
    ),
    index("idx_provider_webhook_receipts_provider_status").on(
      table.provider,
      table.processing_status,
    ),
    index("idx_provider_webhook_receipts_job_id").on(table.job_id),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    actor_id: uuid("actor_id")
      .notNull()
      .references(() => profiles.id),
    type: notificationTypeEnum("type").notNull(),
    entity_id: uuid("entity_id"),
    read_at: timestamp("read_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("idx_notifications_user_id").on(table.user_id),
    index("idx_notifications_read_at").on(table.read_at),
  ],
);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  is_group: boolean("is_group").notNull().default(false),
  group_name: text("group_name"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  last_message_at: timestamp("last_message_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.conversation_id, table.user_id] })],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sender_id: uuid("sender_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    read_at: timestamp("read_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("idx_messages_conversation_id").on(table.conversation_id)],
);

export const follows = pgTable(
  "follows",
  {
    follower_id: uuid("follower_id")
      .notNull()
      .references(() => profiles.id),
    following_id: uuid("following_id")
      .notNull()
      .references(() => profiles.id),
    status: text("status", { enum: ["pending", "accepted"] }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.follower_id, table.following_id] }),
    index("idx_follows_following_id").on(table.following_id),
  ],
);

export const coachingInvitations = pgTable(
  "coaching_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    athlete_id: uuid("athlete_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    coach_id: uuid("coach_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted", "declined"] })
      .notNull()
      .default("pending"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("coaching_invitations_athlete_coach_unique").on(table.athlete_id, table.coach_id),
    index("idx_coaching_invitations_athlete_id").on(table.athlete_id),
    index("idx_coaching_invitations_coach_id").on(table.coach_id),
  ],
);

export const coachesAthletes = pgTable(
  "coaches_athletes",
  {
    coach_id: uuid("coach_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    athlete_id: uuid("athlete_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.coach_id, table.athlete_id] }),
    index("idx_coaches_athletes_coach_id").on(table.coach_id),
    index("idx_coaches_athletes_athlete_id").on(table.athlete_id),
  ],
);

export const likes = pgTable(
  "likes",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    entity_id: uuid("entity_id").notNull(),
    entity_type: likeEntityTypeEnum("entity_type").notNull(),
  },
  (table) => [
    unique("likes_profile_entity_unique").on(table.profile_id, table.entity_type, table.entity_id),
    index("idx_likes_entity").on(table.entity_type, table.entity_id),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey(),
    profile_id: uuid("profile_id").references(() => profiles.id),
    entity_type: text("entity_type", {
      enum: ["activity", "training_plan", "activity_plan", "route"],
    }).notNull(),
    entity_id: uuid("entity_id").notNull(),
    content: text("content").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("idx_comments_entity").on(table.entity_type, table.entity_id),
    index("idx_comments_profile_id").on(table.profile_id, table.created_at),
    index("idx_comments_created_at").on(table.created_at),
  ],
);
