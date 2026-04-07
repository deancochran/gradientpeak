import {
  boolean,
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
  uuid,
} from "drizzle-orm/pg-core";

import {
  activityCategoryEnum,
  coachingInvitationStatusEnum,
  effortTypeEnum,
  eventStatusEnum,
  eventTypeEnum,
  genderEnum,
  integrationProviderEnum,
  likeEntityTypeEnum,
  notificationTypeEnum,
  profileMetricTypeEnum,
} from "./enums";

export const profiles = pgTable("profiles", {
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
  elevation_loss_meters: real("elevation_loss_meters"),
  file_path: text("file_path"),
  total_distance: real("total_distance"),
  total_ascent: real("total_ascent"),
  total_descent: real("total_descent"),
  source: text("source"),
  elevation_polyline: text("elevation_polyline"),
  polyline: text("polyline"),
  likes_count: integer("likes_count"),
  is_public: boolean("is_public").notNull(),
});

export const activityPlans = pgTable("activity_plans", {
  id: uuid("id").primaryKey(),
  idx: integer("idx"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id").references(() => profiles.id),
  route_id: uuid("route_id").references(() => activityRoutes.id),
  name: text("name").notNull(),
  description: text("description"),
  notes: text("notes"),
  activity_category: activityCategoryEnum("activity_category").notNull(),
  structure: jsonb("structure"),
  version: text("version"),
  template_visibility: text("template_visibility"),
  import_provider: text("import_provider"),
  import_external_id: text("import_external_id"),
  is_system_template: boolean("is_system_template"),
  estimated_tss: real("estimated_tss"),
  estimated_duration_seconds: integer("estimated_duration_seconds"),
  estimated_distance_meters: real("estimated_distance_meters"),
  sessions_per_week_target: integer("sessions_per_week_target"),
  duration_hours: integer("duration_hours"),
  likes_count: integer("likes_count"),
  tss_target: real("tss_target"),
  is_public: boolean("is_public").notNull(),
});

export const trainingPlans = pgTable("training_plans", {
  id: uuid("id").primaryKey(),
  idx: integer("idx"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id").references(() => profiles.id),
  name: text("name").notNull(),
  description: text("description"),
  structure: jsonb("structure"),
  template_visibility: text("template_visibility"),
  is_public: boolean("is_public").notNull(),
  is_system_template: boolean("is_system_template").notNull(),
  sessions_per_week_target: integer("sessions_per_week_target"),
  duration_hours: numeric("duration_hours", { precision: 12, scale: 2 }),
  likes_count: integer("likes_count"),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey(),
  idx: integer("idx"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  training_plan_id: uuid("training_plan_id").references(() => trainingPlans.id),
  activity_plan_id: uuid("activity_plan_id").references(() => activityPlans.id),
  linked_activity_id: uuid("linked_activity_id").references(() => activities.id),
  event_type: eventTypeEnum("event_type").notNull(),
  status: eventStatusEnum("status"),
  title: text("title"),
  description: text("description"),
  notes: text("notes"),
  all_day: boolean("all_day"),
  timezone: text("timezone"),
  recurrence_rule: text("recurrence_rule"),
  recurrence_timezone: text("recurrence_timezone"),
  series_id: uuid("series_id"),
  source_provider: text("source_provider"),
  occurrence_key: text("occurrence_key"),
  original_starts_at: timestamp("original_starts_at", { withTimezone: true, mode: "date" }),
  integration_account_id: uuid("integration_account_id").references(() => integrations.id),
  external_calendar_id: text("external_calendar_id"),
  external_event_id: text("external_event_id"),
  schedule_batch_id: text("schedule_batch_id"),
  user_training_plan_id: uuid("user_training_plan_id").references(() => trainingPlans.id),
  starts_at: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
  ends_at: timestamp("ends_at", { withTimezone: true, mode: "date" }),
  scheduled_date: text("scheduled_date"),
  read_only: boolean("read_only"),
  lifecycle: jsonb("lifecycle"),
  recurrence: jsonb("recurrence"),
  payload: jsonb("payload"),
  route_id: uuid("route_id").references(() => activityRoutes.id),
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

export const profileMetrics = pgTable("profile_metrics", {
  id: uuid("id").primaryKey(),
  idx: integer("idx"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  metric_type: profileMetricTypeEnum("metric_type").notNull(),
  recorded_at: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
  unit: text("unit"),
  notes: text("notes"),
  reference_activity_id: uuid("reference_activity_id").references(() => activities.id),
  value: numeric("value", { precision: 12, scale: 4 }).notNull(),
});

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

export const syncedEvents = pgTable("synced_events", {
  id: uuid("id").primaryKey(),
  idx: integer("idx"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }),
  synced_at: timestamp("synced_at", { withTimezone: true, mode: "date" }),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  event_id: uuid("event_id")
    .notNull()
    .references(() => events.id),
  provider: integrationProviderEnum("provider").notNull(),
  external_id: text("external_id").notNull(),
});

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
    status: coachingInvitationStatusEnum("status").notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("coaching_invitations_athlete_id_coach_id_unique").on(table.athlete_id, table.coach_id),
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
    unique("coaches_athletes_athlete_id_unique").on(table.athlete_id),
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

export const likes = pgTable("likes", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  entity_id: uuid("entity_id").notNull(),
  entity_type: likeEntityTypeEnum("entity_type").notNull(),
});

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
