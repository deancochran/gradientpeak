import { createId } from "@paralleldrive/cuid2";
import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
  PublicProfilesRow,
  RecordingServiceActivityPlan,
} from "@repo/core";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type RecordingState = "ready" | "recording" | "paused" | "finished";

// Activities table
export const activityRecordings = sqliteTable("activity_recordings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  activityType: text("activity_type")
    .notNull()
    .$type<PublicActivityType>()
    .default("outdoor_run"),
  profile: text("profile", { mode: "json" })
    .$type<PublicProfilesRow>()
    .notNull(),
  plannedActivityId: text("planned_activity_id"),
  activityPlan: text("activity_plan", {
    mode: "json",
  }).$type<RecordingServiceActivityPlan>(),
});

// Unified Activity Streams Table
export const activityRecordingStreams = sqliteTable(
  "activity_recording_streams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    activityRecordingId: text("activity_recording_id")
      .notNull()
      .references(() => activityRecordings.id, { onDelete: "cascade" }),
    metric: text("metric").$type<PublicActivityMetric>().notNull(),
    dataType: text("data_type").$type<PublicActivityMetricDataType>().notNull(),

    chunkIndex: integer("chunk_index").notNull().default(0),
    sampleCount: integer("sample_count").notNull().default(0),
    startTime: integer("start_time", { mode: "timestamp" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp" }).notNull(),

    data: text("data", { mode: "json" }).notNull(),
    timestamps: text("timestamps", { mode: "json" }).notNull(),

    synced: integer("synced", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .default(sql`(CURRENT_TIMESTAMP)`)
      .notNull(),
  },
);
