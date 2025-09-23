import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
} from "@repo/core";
import { boolean, jsonb, real } from "drizzle-orm/pg-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "discarded"
  | "finished";

// Activities table
export const activityRecordings = sqliteTable("activity_recordings", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => Date.now()),
  state: text("state").$type<RecordingState>().notNull(),
  synced: boolean("synced").notNull().default(false),
  activityType: text("activity_type").$type<PublicActivityType>().notNull(),
  version: text("version").notNull(),

  profileId: text("profile_id").notNull(),
  profileWeightKg: real("profile_weight_kg"),
  profileFtp: real("profile_ftp"),
  profileThresholdHr: integer("profile_threshold_hr"),

  plannedActivityId: text("planned_activity_id"),
  plannedActivityName: text("planned_activity_name"),
  plannedActivityDescription: text("planned_activity_description"),
  plannedActivityStructureVersion: text("planned_activity_structure_version"),
  plannedActivityStructure: jsonb("planned_activity_structure"),
  plannedActivityEstimatedDuration: integer(
    "planned_activity_estimated_duration",
  ),
  plannedActivityEstimatedDistance: real("planned_activity_estimated_distance"),
  plannedActivityEstimatedTss: real("planned_activity_estimated_tss"),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

// Unified Activity Streams Table
export const activityRecordingStreams = sqliteTable(
  "activity_recording_streams",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    activityRecordingId: text("activity_recording_id")
      .notNull()
      .references(() => activityRecordings.id, { onDelete: "cascade" }),
    metric: text("metric").$type<PublicActivityMetric>().notNull(),
    dataType: text("data_type").$type<PublicActivityMetricDataType>().notNull(),

    chunkIndex: integer("chunk_index").notNull().default(0),
    sampleCount: integer("sample_count").notNull().default(0),
    startTime: integer("start_time", { mode: "timestamp" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp" }).notNull(),

    data: jsonb("data").notNull(),
    timestamps: jsonb("timestamps").notNull(),

    synced: boolean("synced").notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
);
