import {
  integer,
  numeric,
  pgEnum,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";

// Enum
export const syncStatusEnum = pgEnum("sync_status", [
  "local_only",
  "synced",
  "sync_failed",
]);

// Table
export const activities = sqliteTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  idx: serial("idx").unique(),
  profileId: uuid("profile_id").notNull(),

  name: text("name").notNull(),
  notes: text("notes"),

  localFilePath: text("local_file_path").notNull(),
  syncStatus: syncStatusEnum("sync_status").notNull().default("local_only"),

  startedAt: timestamp("started_at", { withTimezone: false }).notNull(),
  totalTime: integer("total_time").notNull().default(0),
  movingTime: integer("moving_time").notNull().default(0),

  snapshotWeightKg: integer("snapshot_weight_kg").notNull(),
  snapshotFtp: integer("snapshot_ftp").notNull(),
  snapshotThresholdHr: integer("snapshot_threshold_hr").notNull(),

  tss: integer("tss").notNull(),
  if: integer("if").notNull(),

  normalizedPower: integer("normalized_power"),
  avgPower: integer("avg_power"),
  peakPower: integer("peak_power"),

  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),

  avgCadence: integer("avg_cadence"),
  maxCadence: integer("max_cadence"),

  distance: integer("distance"),
  avgSpeed: numeric("avg_speed", { precision: 5, scale: 2 }),
  maxSpeed: numeric("max_speed", { precision: 5, scale: 2 }),

  totalAscent: integer("total_ascent"),
  totalDescent: integer("total_descent"),

  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});
